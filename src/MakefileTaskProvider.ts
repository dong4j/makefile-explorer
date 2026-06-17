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
import { parseTargets } from './TargetParser';

/** 与 package.json taskDefinitions.type 保持一致 */
export const MAKEFILE_TASK_TYPE = 'makefile-explorer';

/** Makefile 扫描 glob（与 MakefileTreeProvider 对齐） */
const MAKEFILE_GLOBS = [
  '**/Makefile',
  '**/makefile',
  '**/GNUmakefile',
  '**/*.mk',
  '**/Makefile.*'
];

const EXCLUDE_PATTERN = '**/{node_modules,vendor,.build,Pods,Carthage,third_party,.deps,.git,dist,build,target}/**';

/** 自定义任务 definition 字段 */
export interface MakefileTaskDefinition extends vscode.TaskDefinition {
  type: typeof MAKEFILE_TASK_TYPE;
  target: string;
  makefilePath: string;
}

/**
 * 根据 target 与 Makefile 路径构造可执行的 VS Code Task
 */
export function createMakeTask(targetName: string, makefilePath: string): vscode.Task {
  const makefileDir = path.dirname(makefilePath);
  const fileName = path.basename(makefilePath);
  const definition: MakefileTaskDefinition = {
    type: MAKEFILE_TASK_TYPE,
    target: targetName,
    makefilePath
  };

  const task = new vscode.Task(
    definition,
    vscode.TaskScope.Workspace,
    `Make: ${targetName}`,
    MAKEFILE_TASK_TYPE,
    new vscode.ShellExecution(`make -f ${fileName} ${targetName}`, { cwd: makefileDir })
  );

  task.detail = makefilePath;
  task.group = vscode.TaskGroup.Build;
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
