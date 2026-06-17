/**
 * MakefileTreeProvider — VSCode TreeDataProvider 实现
 *
 * 职责：
 * 1. 扫描工作区中的所有 Makefile 文件
 * 2. 构建"Makefile → targets"的两层树形结构
 * 3. 监听文件变化自动刷新
 * 4. 提供刷新命令
 *
 * 树形结构：
 *   📄 /project/Makefile          ← makefile 节点（可展开）
 *     🎯 build                     ← target 节点（点击执行）
 *     🎯 test
 *   📄 /project/docker/Makefile
 *     🎯 docker-build
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { MakefileNode, Target } from './types';
import { parseTargets, isMakefile } from './TargetParser';

/**
 * 用于查找工作区中 Makefile 文件的 glob 模式列表
 * 覆盖常见的 Makefile 命名约定
 */
const MAKEFILE_GLOBS = [
  '**/Makefile',
  '**/makefile',
  '**/GNUmakefile',
  '**/*.mk',
  '**/Makefile.*'
];

export class MakefileTreeProvider implements vscode.TreeDataProvider<MakefileNode> {

  /** 事件发射器 — 树数据变更时触发 VSCode 刷新 UI */
  private _onDidChangeTreeData = new vscode.EventEmitter<MakefileNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** 文件监听器（监听 Makefile 的增/删/改） */
  private watcher: vscode.FileSystemWatcher;

  /** 缓存：所有顶级 Makefile 文件节点 */
  private fileNodes: MakefileNode[] = [];

  constructor() {
    // 监听工作区中 Makefile 文件的变化，自动刷新
    this.watcher = vscode.workspace.createFileSystemWatcher(
      '**/{Makefile,makefile,GNUmakefile,*.mk,Makefile.*}'
    );
    this.watcher.onDidCreate(() => this.refresh());
    this.watcher.onDidDelete(() => this.refresh());
    this.watcher.onDidChange(() => this.refresh());
  }

  /**
   * 释放资源（插件停用时调用）
   */
  dispose(): void {
    this.watcher.dispose();
    this._onDidChangeTreeData.dispose();
  }

  /**
   * 刷新树数据：重新扫描 Makefile → 重新解析 targets → 通知 VSCode 刷新 UI
   */
  async refresh(): Promise<void> {
    this.fileNodes = await this.scanMakefiles();
    this._onDidChangeTreeData.fire();
  }

  /**
   * TreeDataProvider 核心方法 — 获取节点的子节点
   *
   * @param element - 当前节点；undefined 表示请求根节点
   * @returns 子节点数组
   */
  getChildren(element?: MakefileNode): vscode.ProviderResult<MakefileNode[]> {
    if (!element) {
      // 根级别：返回所有 Makefile 文件节点
      // 首次调用时 fileNodes 可能为空，触发初始扫描
      if (this.fileNodes.length === 0) {
        return this.scanMakefiles().then(nodes => {
          this.fileNodes = nodes;
          return nodes;
        });
      }
      return this.fileNodes;
    }

    // 子级别：返回该 Makefile 节点下的 target 节点
    if (element.nodeType === 'makefile') {
      return element.children;
    }

    // target 节点没有子节点
    return [];
  }

  /**
   * TreeDataProvider 核心方法 — 获取节点的 TreeItem 表示
   * MakefileNode 本身继承 TreeItem，直接返回
   */
  getTreeItem(element: MakefileNode): vscode.TreeItem {
    return element;
  }

  /**
   * 获取父节点（支持 reveal 功能）
   * target 节点的父节点是对应的 Makefile 文件节点
   */
  getParent(element: MakefileNode): vscode.ProviderResult<MakefileNode> {
    if (element.nodeType === 'target') {
      // 查找所属的 Makefile 文件节点
      return this.fileNodes.find(fn => fn.filePath === element.filePath);
    }
    // Makefile 文件节点是根节点，没有父节点
    return null;
  }

  /**
   * 扫描工作区，找到所有 Makefile 文件并解析其 targets
   *
   * @returns Makefile 文件节点数组（每个节点包含其 target 子节点）
   */
  private async scanMakefiles(): Promise<MakefileNode[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    // 排除第三方依赖目录（避免扫描到不需要的 Makefile）
    // {} 语法 = 多选一，匹配任意一个子目录
    const excludePattern = '**/{node_modules,vendor,.build,Pods,Carthage,third_party,.deps,.git,dist,build,target}/**';

    // 递归查找所有 Makefile 文件
    const allFiles: vscode.Uri[] = [];
    for (const glob of MAKEFILE_GLOBS) {
      const files = await vscode.workspace.findFiles(glob, excludePattern);
      allFiles.push(...files);
    }

    // 去重（有些文件可能匹配多个 glob）
    const uniqueFiles = dedupeUris(allFiles);

    // 按路径排序（让同级目录的文件排在一起，根目录 Makefile 优先）
    uniqueFiles.sort((a, b) => {
      const aDepth = a.fsPath.split(path.sep).length;
      const bDepth = b.fsPath.split(path.sep).length;
      // 浅目录优先
      if (aDepth !== bDepth) return aDepth - bDepth;
      return a.fsPath.localeCompare(b.fsPath);
    });

    // 逐个解析 targets
    const nodes: MakefileNode[] = [];
    for (const uri of uniqueFiles) {
      try {
        const content = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(content).toString('utf-8');
        const targets = parseTargets(text, uri.fsPath);

        // 只添加有 targets 的 Makefile（过滤空文件或无 target 的 include 文件）
        if (targets.length === 0) continue;

        // 创建文件节点，显示相对路径使界面更清晰
        const relativePath = path.relative(
          workspaceFolders[0].uri.fsPath,
          uri.fsPath
        );
        const fileNode = new MakefileNode(
          relativePath,
          'makefile',
          uri.fsPath,
          -1,
          vscode.TreeItemCollapsibleState.Collapsed
        );
        // 描述显示 target 数量
        fileNode.description = `${targets.length} targets`;
        // tooltip 显示绝对路径
        fileNode.tooltip = uri.fsPath;

        // 为每个 target 创建子节点
        fileNode.children = targets.map(t => createTargetNode(t, uri.fsPath));

        nodes.push(fileNode);
      } catch (err) {
        // 文件读取失败（权限问题等），静默跳过
        console.warn(`[Makefile Explorer] 无法读取 ${uri.fsPath}: ${err}`);
      }
    }

    return nodes;
  }
}

/**
 * 从 Target 数据创建对应的树节点
 *
 * @param target - 解析出的 target 信息
 * @param filePath - 所属 Makefile 的绝对路径
 * @returns 可渲染的 MakefileNode
 */
function createTargetNode(target: Target, filePath: string): MakefileNode {
  const node = new MakefileNode(
    target.name,
    'target',
    filePath,
    target.line
  );

  // 如果有注释描述，显示在节点右侧
  if (target.description) {
    node.description = target.description;
  }

  // tooltip 显示完整信息
  node.tooltip = [
    `Target: ${target.name}`,
    target.description ? `描述: ${target.description}` : '',
    `位置: ${filePath}:${target.line + 1}`,
    '',
    '双击 — 执行任务',
    '右键 → Go to Definition — 跳转到定义'
  ].filter(Boolean).join('\n');

  return node;
}

/**
 * URI 数组去重（按 fsPath）
 */
function dedupeUris(uris: vscode.Uri[]): vscode.Uri[] {
  const seen = new Set<string>();
  return uris.filter(uri => {
    if (seen.has(uri.fsPath)) return false;
    seen.add(uri.fsPath);
    return true;
  });
}
