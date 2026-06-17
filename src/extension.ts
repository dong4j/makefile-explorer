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
 * - 双击 target 节点 → 在新建终端执行 make <target>（防误触，每次新终端避免 busy 冲突）
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
import { MakefileTreeProvider } from './MakefileTreeProvider';

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

  // ---- 创建 TreeDataProvider 并注册 TreeView ----
  const provider = new MakefileTreeProvider();

  const treeView = vscode.window.createTreeView('makefileExplorer', {
    treeDataProvider: provider,
    showCollapseAll: true
  });

  // ---- 双击检测状态 ----
  // 记录上一次点击的 target 和时间，用于判定双击
  let lastClick: { name: string; filePath: string; time: number } | null = null;

  // ---- 共享执行逻辑 ----

  /**
   * 在终端中执行 make target
   *
   * 始终创建新终端（命名 "Make - <targetName>"），避免复用 busy 终端时
   * sendText 文本被送入前台进程 stdin 而不被 shell 执行的问题。
   */
  function executeTarget(targetName: string, filePath: string): void {
    const makefileDir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const command = `cd "${makefileDir}" && make -f ${fileName} ${targetName}`;

    const terminal = vscode.window.createTerminal(`Make - ${targetName}`);
    terminal.show();
    terminal.sendText(command);

    console.log(`[Makefile Explorer] 执行: ${command}`);
  }

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
