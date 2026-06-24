/**
 * providers/MakefileTreeProvider.ts — VSCode TreeDataProvider 实现
 *
 * PR1 分层重构后的职责：
 * - 仅负责 tree 状态管理（refresh / getChildren / getParent / dispose）
 * - 把工作区扫描 + 解析 + 节点构造委托给 MakefileScanner
 *
 * 依赖注入：
 * - 构造器接受可选的 MakefileScanner 实例，方便后续 PR3 单测时注入 mock
 * - 默认 new MakefileScanner()，调用方不传也能正常工作
 *
 * 树形结构（与 PR1 前完全一致）：
 *   📄 /project/Makefile          ← makefile 节点（可展开 → targets）
 *     🎯 build                     ← target 节点（可展开 → dependencies）
 *       📎 src/main.c               ← dependency 节点（叶子）
 *       📎 utils.o
 *     🎯 test
 *   📄 /project/docker/Makefile
 *     🎯 docker-build
 */

import * as vscode from 'vscode';
import { MakefileNode } from '../models/MakefileNode';
import { MakefileScanner } from '../services/MakefileScanner';

export class MakefileTreeProvider implements vscode.TreeDataProvider<MakefileNode> {

  /** 事件发射器 — 树数据变更时触发 VSCode 刷新 UI */
  private _onDidChangeTreeData = new vscode.EventEmitter<MakefileNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** 文件监听器（监听 Makefile 的增/删/改） */
  private watcher: vscode.FileSystemWatcher;

  /** 缓存：所有顶级 Makefile 文件节点 */
  private fileNodes: MakefileNode[] = [];

  /** 工作区扫描器（依赖注入点，默认 new 一个） */
  private scanner: MakefileScanner;

  /**
   * @param scanner 可选；不传则 new 一个默认 scanner（生产代码走默认）
   */
  constructor(scanner: MakefileScanner = new MakefileScanner()) {
    this.scanner = scanner;

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
   * 刷新树数据：重新扫描 Makefile → 通知 VSCode 刷新 UI
   */
  async refresh(): Promise<void> {
    this.fileNodes = await this.scanner.scanWorkspace();
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
        return this.scanner.scanWorkspace().then(nodes => {
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

    // target 节点：返回其依赖子节点
    if (element.nodeType === 'target') {
      return element.children;
    }

    // dependency 节点是叶子节点
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
    if (element.nodeType === 'dependency') {
      // 查找所属的 target 节点（通过 children.includes 匹配）
      for (const fileNode of this.fileNodes) {
        for (const targetNode of fileNode.children) {
          if (targetNode.children.includes(element)) {
            return targetNode;
          }
        }
      }
      return null;
    }
    // Makefile 文件节点是根节点，没有父节点
    return null;
  }
}