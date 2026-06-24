/**
 * models/MakefileNode.ts — VSCode TreeItem 子类，表示侧边栏树中的节点
 *
 * 与 Target.ts 的职责分工：
 * - Target.ts：纯数据（Target interface + NodeType 联合类型），可独立单测
 * - MakefileNode.ts：UI 层包装，把 Target 数据附加到 vscode.TreeItem 上
 *
 * 为什么把 MakefileNode 单独成文件：
 * - 它继承 vscode.TreeItem，导入 vscode namespace 后就不能脱离 VSCode runtime
 * - 单独放可以让单测时只 mock / 跳过本文件，TargetParser 仍可纯函数测试
 *
 * 节点三种类型对应的视觉/交互：
 * - makefile：文件图标，点击在编辑器打开该 Makefile
 * - target：symbol-method 图标（PR7 可覆盖为 ✓/✗ 状态徽标），绑 handleTargetClick 命令触发双击检测
 * - dependency：symbol-parameter 图标，叶子节点，绑 goToDefinition 跳转文件头
 */

import * as vscode from 'vscode';
import { NodeType } from './Target';
import type { TaskStatus } from '../services/TaskHistoryService';

/**
 * 树节点数据结构，TreeDataProvider 使用此类构建侧边栏树
 *
 * 字段说明：
 * - nodeType：决定图标 / 命令 / contextValue，UI 层据此分支渲染
 * - filePath：所有节点都记所属 Makefile 路径，方便跳定义 / 启动 Task
 * - targetLine：仅 target 节点有效（其他类型为 -1），用于 editor.revealRange
 * - children：makefile 节点存 target 列表，target 节点存 dependency 列表
 * - taskStatus（PR7）：target 节点最近一次执行状态，决定徽标
 */
export class MakefileNode extends vscode.TreeItem {
  /** 节点类型，决定 UI 渲染分支 */
  readonly nodeType: NodeType;
  /** 所属 Makefile 路径（target / dependency 节点关联到父文件） */
  readonly filePath: string;
  /** target 在 Makefile 中的行号（仅 target 节点有效） */
  readonly targetLine: number;
  /** 子节点（仅 makefile / target 节点有效） */
  children: MakefileNode[] = [];
  /** target 节点最近一次执行状态（PR7 节点徽标用） */
  taskStatus: TaskStatus | undefined = undefined;

  constructor(
    label: string,
    nodeType: NodeType,
    filePath: string,
    targetLine: number = -1,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
  ) {
    super(label, collapsibleState);
    this.nodeType = nodeType;
    this.filePath = filePath;
    this.targetLine = targetLine;

    // 根据节点类型设置不同的图标和交互行为
    if (nodeType === 'makefile') {
      // Makefile 文件节点：使用文件图标，点击可打开文件
      this.resourceUri = vscode.Uri.file(filePath);
      this.iconPath = vscode.ThemeIcon.File;
      this.contextValue = 'makefileFile';
      // 点击文件节点 → 打开 Makefile 文件
      this.command = {
        command: 'vscode.open',
        title: 'Open Makefile',
        arguments: [vscode.Uri.file(filePath)]
      };
    } else if (nodeType === 'target') {
      // target 节点：双击 → 终端执行（防误触）
      this.iconPath = new vscode.ThemeIcon('symbol-method');
      this.contextValue = 'makefileTarget';
      this.tooltip = `${filePath}:${targetLine + 1} — 双击执行，展开查看依赖`;
      this.command = {
        command: 'makefile-explorer.handleTargetClick',
        title: 'Handle Target Click',
        arguments: [{ name: label, filePath, line: targetLine }]
      };
    } else {
      // dependency 节点：叶子节点，仅展示，不可执行
      this.iconPath = new vscode.ThemeIcon('symbol-parameter');
      this.contextValue = 'makefileDependency';
      this.tooltip = `${filePath} — ${label}`;
      // dependency 节点点击跳转到文件开头
      this.command = {
        command: 'makefile-explorer.goToDefinition',
        title: 'Go to Definition',
        arguments: [{ name: '', filePath, line: 0 }]
      };
    }
  }

  /**
   * 设置 target 节点状态徽标（PR7）
   *
   * 视觉映射：
   * - success → $(check) + terminal.ansiGreen（绿色，所有主题都支持）
   * - failed  → $(error) + terminal.ansiRed（红色，所有主题都支持）
   * - undefined → 恢复默认 symbol-method
   *
   * 注意：仅 target 节点有效，dependency / makefile 节点调用此方法无效
   *
   * @param status 任务状态，undefined 表示清除徽标
   */
  setTaskStatus(status: TaskStatus | undefined): void {
    if (this.nodeType !== 'target') return;
    this.taskStatus = status;
    if (status === 'success') {
      this.iconPath = new vscode.ThemeIcon(
        'check',
        new vscode.ThemeColor('terminal.ansiGreen')
      );
    } else if (status === 'failed') {
      this.iconPath = new vscode.ThemeIcon(
        'error',
        new vscode.ThemeColor('terminal.ansiRed')
      );
    } else {
      this.iconPath = new vscode.ThemeIcon('symbol-method');
    }
  }
}
