/**
 * extension.ts — Makefile Explorer 插件入口
 *
 * 激活时：
 * 1. 创建 MakefileTreeProvider 并注册到 Explorer 侧边栏
 * 2. 注册 handleTargetClick（双击检测）、runTarget（直接执行）、
 *    goToDefinition（跳转定义）、refresh（刷新）命令
 * 3. 启动文件监听，Makefile 变化时自动刷新树
 *
 * 交互设计：
 * - 双击 target 节点 → 通过 Task API 执行 make <target>（输出在「终端」任务面板）
 * - 单击 target 右侧图标 → 跳转到 Makefile 定义行
 * - 右键 → "Go to Definition" → 同上
 * - 单击 Makefile 文件节点 → 在编辑器中打开 Makefile
 * - 标题栏刷新按钮 → 重新扫描工作区
 *
 * 参数兼容说明：
 * - 从 TreeItem.command 点击触发时，args 为 { name, filePath, line }
 * - 从右键菜单触发时，args 为 MakefileNode 实例（属性 filePath + targetLine）
 * - 两个入口的 handler 会统一处理两种参数格式
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { MakefileTreeProvider } from './providers/MakefileTreeProvider';
import { createMakeTask, registerMakefileTaskProvider, MAKEFILE_TASK_TYPE } from './providers/MakefileTaskProvider';
import { TaskHistoryService } from './services/TaskHistoryService';
import { ArgsPromptService } from './services/ArgsPromptService';
import { parseArgs } from './services/argsParser';

/** 双击判定窗口（毫秒） */
const DOUBLE_CLICK_WINDOW_MS = 500;

/**
 * 从不同来源的参数中提取统一字段
 * 兼容 TreeItem.command.arguments 和右键菜单传递的两种格式
 */
function normalizeArgs(args: Record<string, unknown> | undefined): {
  name: string;
  filePath: string;
  line: number;
} | null {
  if (!args) return null;

  // 从 TreeItem.command.arguments 传入（{ name, filePath, line }）
  // 或从右键菜单传入（MakefileNode: { label, filePath, targetLine }）
  const name = (args.name ?? args.label ?? '') as string;
  const filePath = (args.filePath ?? '') as string;
  const line = (args.line ?? args.targetLine ?? -1) as number;

  if (!name || !filePath || line < 0) return null;
  return { name, filePath, line };
}

/**
 * VSCode 扩展激活入口
 * 当用户打开 Makefile Explorer 视图时被调用（activationEvents: onView:makefileExplorer）
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('[Makefile Explorer] 插件已激活');

  // ---- make 可用性检测 ----
  // 激活时检测 make 是否在 PATH 中，不可用则弹提示并记录日志
  exec('which make', (err) => {
    if (err) {
      console.warn('[Makefile Explorer] make 命令未找到，请安装 make 后使用此插件');
      vscode.window.showWarningMessage(
        'Makefile Explorer: 未找到 make 命令。请安装 make 后重新加载窗口。',
        '如何安装'
      ).then(selection => {
        if (selection === '如何安装') {
          vscode.env.openExternal(vscode.Uri.parse('https://www.gnu.org/software/make/'));
        }
      });
    }
  });

  // ---- 创建 TreeDataProvider 并注册 TreeView ----
  const provider = new MakefileTreeProvider();

  // ---- TaskHistoryService：持久化最近一次跑的 target（PR4 Run Last Task）----
  // 用 context.globalState 跨 workspace 共享；切换项目后 last task 各自独立
  const taskHistory = new TaskHistoryService(context);

  // ---- ArgsPromptService：右键「Run with Args...」时弹输入框收集 KEY=VALUE 参数（PR5 Run with Args）----
  const argsPrompt = new ArgsPromptService();

  const treeView = vscode.window.createTreeView('makefileExplorer', {
    treeDataProvider: provider,
    showCollapseAll: true
  });

  // ---- 状态栏指示器 ----
  // 在窗口底部状态栏显示当前执行的 make task 状态，方便用户感知运行/完成/失败
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.tooltip = '双击 Make Targets 面板中的 target 执行';
  context.subscriptions.push(statusBarItem);

  // 监听 task 启动事件，在状态栏显示运行中指示
  context.subscriptions.push(
    vscode.tasks.onDidStartTask((e) => {
      const definition = e.execution.task.definition as Record<string, unknown>;
      if (definition.type !== MAKEFILE_TASK_TYPE) return;
      const target = definition.target as string;
      statusBarItem.text = `$(sync~spin) Make: ${target}`;
      statusBarItem.backgroundColor = undefined;
      statusBarItem.show();
    })
  );

  // 监听 task 结束事件，显示完成状态 3 秒后自动隐藏
  // 同时记录到 TaskHistoryService，供 runLastTask 命令一键重跑（PR4）
  context.subscriptions.push(
    vscode.tasks.onDidEndTask((e) => {
      const definition = e.execution.task.definition as Record<string, unknown>;
      if (definition.type !== MAKEFILE_TASK_TYPE) return;
      const target = definition.target as string;
      const makefilePath = definition.makefilePath as string;
      statusBarItem.text = `$(check) Make: ${target}`;
      statusBarItem.backgroundColor = undefined;
      statusBarItem.show();
      // 3 秒后自动隐藏
      setTimeout(() => {
        statusBarItem.hide();
      }, 3000);
      // 记录到 history（成功失败都记 —— 失败时方便一键重试）
      if (target && makefilePath) {
        taskHistory.record(target, makefilePath);
      }
    })
  );

  // ---- 双击检测状态 ----
  // 记录上一次点击的 target 和时间，用于判定双击
  let lastClick: { name: string; filePath: string; time: number } | null = null;

  // ---- 共享执行逻辑 ----

  /**
   * 通过 VS Code Task API 执行 make target
   *
   * 使用自定义类型 makefile-explorer，需已注册 TaskProvider（见 MakefileTaskProvider.ts）
   *
   * @param targetName target 名
   * @param filePath Makefile 绝对路径
   * @param args 可选 make 额外参数（PR5 Run with Args 引入）
   */
  async function executeTarget(
    targetName: string,
    filePath: string,
    args: string[] = []
  ): Promise<void> {
    const task = createMakeTask(targetName, filePath, args);
    try {
      await vscode.tasks.executeTask(task);
      const argInfo = args.length ? ` (args: ${args.join(' ')})` : '';
      console.log(`[Makefile Explorer] 执行任务: Make: ${targetName}${argInfo} (${filePath})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`执行 Make target 失败: ${message}`);
    }
  }

  // ---- 注册 Task Provider（自定义任务类型 makefile-explorer）----
  context.subscriptions.push(registerMakefileTaskProvider());

  // ---- 注册命令 ----

  /**
   * 处理 target 点击（双击检测入口）
   *
   * 同一 target 在 500ms 内连续点击两次 → 执行 make
   * 单次点击 → 不执行（防误触）
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'makefile-explorer.handleTargetClick',
      (args: Record<string, unknown> | undefined) => {
        const info = normalizeArgs(args);
        if (!info) return;

        const now = Date.now();
        const isDoubleClick =
          lastClick !== null &&
          lastClick.name === info.name &&
          lastClick.filePath === info.filePath &&
          (now - lastClick.time) < DOUBLE_CLICK_WINDOW_MS;

        lastClick = { name: info.name, filePath: info.filePath, time: now };

        if (isDoubleClick) {
          executeTarget(info.name, info.filePath);
        }
      }
    )
  );

  /**
   * 直接执行 target（不走双击检测，供命令面板或快捷键使用）
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'makefile-explorer.runTarget',
      (args: Record<string, unknown> | undefined) => {
        const info = normalizeArgs(args);
        if (!info) {
          vscode.window.showWarningMessage('无法获取 target 信息，请刷新后重试');
          return;
        }
        executeTarget(info.name, info.filePath);
      }
    )
  );

  /**
   * 右键菜单「Run with Args...」：弹输入框收集 KEY=VALUE 参数后执行（PR5 Run with Args）
   *
   * 与双击的区别：
   * - 双击 = 直接跑（防误触 + 简单）
   * - 右键 Run with Args = 弹输入框收集参数后跑（用户主动选择走这个流程）
   *
   * 输入格式：
   * - KEY=VAL 空格分隔（如 VERSION=0.1.0 DEBUG=1）
   * - 用户按 Esc 取消 → 不执行
   * - 格式错误 → 弹 error 不执行
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'makefile-explorer.runWithArgs',
      async (args: Record<string, unknown> | undefined) => {
        const info = normalizeArgs(args);
        if (!info) {
          vscode.window.showWarningMessage('请从 Make Targets 面板右键使用此功能');
          return;
        }

        // 弹输入框；用户 Esc 取消则本次不执行
        const input = await argsPrompt.prompt(info.name);
        if (input === undefined) {
          console.log(`[Makefile Explorer] 用户取消参数输入，跳过执行: ${info.name}`);
          return;
        }
        // 解析逻辑在 argsParser.ts（纯函数，便于单测）；这里 UI 层只做编排
        const { args: makeArgs, errors } = parseArgs(input);
        if (errors.length > 0) {
          vscode.window.showErrorMessage(`参数格式错误: ${errors.join('; ')}`);
          return;
        }
        await executeTarget(info.name, info.filePath, makeArgs);
      }
    )
  );

  /**
   * 跳转到 target 定义：在编辑器中打开 Makefile 并定位到对应行
   *
   * 参数来源：
   * - 右键菜单：VSCode 直接传递 MakefileNode 实例 → { filePath, targetLine }
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'makefile-explorer.goToDefinition',
      async (args: Record<string, unknown> | undefined) => {
        const info = normalizeArgs(args);
        if (!info) {
          vscode.window.showWarningMessage('请从 Make Targets 面板右键使用此功能');
          return;
        }

        const uri = vscode.Uri.file(info.filePath);

        try {
          const document = await vscode.workspace.openTextDocument(uri);
          const editor = await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.One,
            preserveFocus: false
          });

          // 将光标定位到 target 定义行
          const position = new vscode.Position(info.line, 0);
          editor.selection = new vscode.Selection(position, position);

          // 将该行滚动到编辑器视口中央
          editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
          );

          console.log(`[Makefile Explorer] 跳转到: ${info.filePath}:${info.line + 1}`);
        } catch {
          vscode.window.showErrorMessage(`无法打开文件: ${info.filePath}`);
        }
      }
    )
  );

  /**
   * 刷新 Makefile 列表
   */
  context.subscriptions.push(
    vscode.commands.registerCommand('makefile-explorer.refresh', () => {
      provider.refresh();
      console.log('[Makefile Explorer] 手动刷新');
    })
  );

  /**
   * 切换视图模式（PR6 View as List）—— tree ↔ flat
   *
   * 调用 provider.toggleViewMode() 内部翻转 viewMode 并触发 _onDidChangeTreeData
   * VSCode 拿到事件后会自动调用 getChildren 重绘
   *
   * 入口：
   * - 标题栏 $(list-tree) 按钮
   * - 命令面板「Makefile Explorer: Toggle View Mode (Tree / Flat)」
   *
   * viewMode 不持久化（每次启动回 tree），由用户主动切换
   */
  context.subscriptions.push(
    vscode.commands.registerCommand('makefile-explorer.toggleViewMode', () => {
      provider.toggleViewMode();
      console.log(`[Makefile Explorer] 视图模式切换为: ${provider.getViewMode()}`);
    })
  );

  /**
   * 重跑最近一次的 Make target（PR4 新增）
   *
   * 用途：双击 target 执行后，用户经常想"再跑一次刚才那个"
   * 提供 Alt+Shift+R（mac Option+Shift+R / Win Alt+Shift+R）一键重跑（keybinding 见 package.json）
   *
   * 历史数据来源：TaskHistoryService（context.globalState 持久化）
   * 写入时机：onDidEndTask 监听器（task 结束无论成功失败都记）
   *
   * 空状态处理：getLast() 返回 undefined 时弹 warning，提示用户先跑一次
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'makefile-explorer.runLastTask',
      async () => {
        const last = taskHistory.getLast();
        if (!last) {
          vscode.window.showWarningMessage(
            'Makefile Explorer: 暂无最近任务记录，请先双击 target 执行一次'
          );
          return;
        }
        console.log(`[Makefile Explorer] 重跑: Make: ${last.name} (${last.filePath})`);
        await executeTarget(last.name, last.filePath);
      }
    )
  );

  /**
   * 复制可执行的 make 命令到剪贴板
   *
   * 生成格式：cd "工作目录" && make -f Makefile名 target名
   * 方便用户在终端中直接粘贴执行
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'makefile-explorer.copyMakeCommand',
      async (args: Record<string, unknown> | undefined) => {
        const info = normalizeArgs(args);
        if (!info) {
          vscode.window.showWarningMessage('请从 Make Targets 面板右键使用此功能');
          return;
        }

        const dir = path.dirname(info.filePath);
        const makefileName = path.basename(info.filePath);
        const command = `cd "${dir}" && make -f ${makefileName} ${info.name}`;

        await vscode.env.clipboard.writeText(command);
        vscode.window.showInformationMessage(`已复制: ${command}`);
      }
    )
  );

  // ---- 初始扫描 ----
  provider.refresh();

  // ---- 清理 ----
  context.subscriptions.push({
    dispose: () => provider.dispose()
  });
  context.subscriptions.push(treeView);
}

/**
 * 插件停用时调用
 */
export function deactivate(): void {
  console.log('[Makefile Explorer] 插件已停用');
}
