/**
 * MakefileTaskProvider — VS Code Task API 集成
 *
 * 自定义任务类型 `makefile-explorer` 必须同时满足：
 * 1. package.json contributes.taskDefinitions 声明类型
 * 2. activate 时 registerTaskProvider 注册提供程序
 *
 * 否则 executeTask 会报错：
 * 「不存在已注册的任务类型 makefile-explorer」
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { parseTargets } from '../services/TargetParser';
import { MAKEFILE_GLOBS, EXCLUDE_PATTERN } from '../services/MakefileScanner';

/** 与 package.json taskDefinitions.type 保持一致 */
export const MAKEFILE_TASK_TYPE = 'makefile-explorer';

/** 自定义任务 definition 字段 */
export interface MakefileTaskDefinition extends vscode.TaskDefinition {
  type: typeof MAKEFILE_TASK_TYPE;
  target: string;
  makefilePath: string;
}

/**
 * 根据 target 与 Makefile 路径构造可执行的 VS Code Task
 *
 * @param targetName target 名，如 build / test
 * @param makefilePath Makefile 绝对路径
 * @param args 可选，make 命令的额外参数（如 ['VERSION=0.1.0']）
 *              —— PR5 Run with Args 引入
 */
export function createMakeTask(
  targetName: string,
  makefilePath: string,
  args: string[] = []
): vscode.Task {
  const makefileDir = path.dirname(makefilePath);
  const fileName = path.basename(makefilePath);

  // 计算相对于工作区根的路径，用于在「运行任务」面板中按 Makefile 分组显示
  let source = fileName;
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    const relative = path.relative(workspaceFolders[0].uri.fsPath, makefilePath);
    // 去掉文件名，保留目录部分作为分组标识
    const dir = path.dirname(relative);
    source = dir === '.' ? fileName : `${dir}/${fileName}`;
  }

  const definition: MakefileTaskDefinition = {
    type: MAKEFILE_TASK_TYPE,
    target: targetName,
    makefilePath
  };

  // 拼接完整 make 命令：make -f <file> <target> [KEY=VAL ...]
  const argString = args.length > 0 ? ' ' + args.join(' ') : '';
  const command = `make -f ${fileName} ${targetName}${argString}`;

  // task 显示名：args 非空时附加 (KEY=VAL)，方便在任务面板里区分
  const taskName = args.length > 0
    ? `Make: ${targetName} (${args.join(' ')})`
    : `Make: ${targetName}`;

  const task = new vscode.Task(
    definition,
    vscode.TaskScope.Workspace,
    taskName,
    source,
    new vscode.ShellExecution(command, { cwd: makefileDir })
  );

  task.detail = makefilePath;
  task.group = vscode.TaskGroup.Build;

  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    echo: false,
    focus: true,
    panel: vscode.TaskPanelKind.Dedicated,
    showReuseMessage: false,
    clear: false
  };

  return task;
}

/**
 * 扫描工作区 Makefile 并生成 Task 列表（供「运行任务」面板使用）
 */
async function collectMakeTasks(): Promise<vscode.Task[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return [];
  }

  const allFiles: vscode.Uri[] = [];
  for (const glob of MAKEFILE_GLOBS) {
    const files = await vscode.workspace.findFiles(glob, EXCLUDE_PATTERN);
    allFiles.push(...files);
  }

  const seen = new Set<string>();
  const uniqueFiles = allFiles.filter(uri => {
    if (seen.has(uri.fsPath)) return false;
    seen.add(uri.fsPath);
    return true;
  });

  const tasks: vscode.Task[] = [];
  for (const uri of uniqueFiles) {
    try {
      const content = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(content).toString('utf-8');
      const targets = parseTargets(text, uri.fsPath);
      for (const target of targets) {
        tasks.push(createMakeTask(target.name, uri.fsPath));
      }
    } catch (err) {
      console.warn(`[Makefile Explorer] 无法为 Task 解析 ${uri.fsPath}: ${err}`);
    }
  }

  return tasks;
}

/**
 * 注册 makefile-explorer 任务提供程序
 */
export function registerMakefileTaskProvider(): vscode.Disposable {
  const provider: vscode.TaskProvider = {
    provideTasks: () => collectMakeTasks(),
    resolveTask(task: vscode.Task): vscode.Task | undefined {
      const definition = task.definition as MakefileTaskDefinition;
      const { target, makefilePath } = definition;
      if (!target || !makefilePath) {
        return undefined;
      }
      return createMakeTask(target, makefilePath);
    }
  };

  return vscode.tasks.registerTaskProvider(MAKEFILE_TASK_TYPE, provider);
}
