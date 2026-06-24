/**
 * services/MakefileScanner.ts — 工作区扫描 + Makefile 解析 + 树节点构造
 *
 * 职责拆分原因（vs 把扫描留在 MakefileTreeProvider 里）：
 * - TreeProvider 应聚焦 "tree 状态管理"（refresh / getChildren / getParent）
 * - 扫描是 IO + 文件解析，独立成 service 更易单测
 * - 后续要支持 Taskfile.yml 解析时，只换 Scanner 即可，TreeProvider 不动
 *
 * 设计原则：
 * - 走 vscode.workspace API（与 TreeProvider 调用栈一致）
 * - 排除目录硬编码（与原 MakefileTreeProvider 行为完全一致）
 * - 输出 MakefileNode[]，让 TreeProvider 直接消费
 *
 * 共享常量：
 * - MAKEFILE_GLOBS 和 EXCLUDE_PATTERN 同时被 MakefileTaskProvider 复用，
 *   避免两个 provider 各自定义一份 → 分层重构（PR1）阶段同步收敛
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { MakefileNode } from '../models/MakefileNode';
import { Target } from '../models/Target';
import { parseTargets } from './TargetParser';

/**
 * 用于查找工作区中 Makefile 文件的 glob 模式列表
 * 覆盖常见的 Makefile 命名约定
 */
export const MAKEFILE_GLOBS = [
  '**/Makefile',
  '**/makefile',
  '**/GNUmakefile',
  '**/*.mk',
  '**/Makefile.*'
];

/**
 * 排除第三方依赖目录（避免扫描到不需要的 Makefile）
 * `{}` 语法 = 多选一，匹配任意一个子目录
 */
export const EXCLUDE_PATTERN =
  '**/{node_modules,vendor,.build,Pods,Carthage,third_party,.deps,.git,dist,build,target}/**';

/**
 * 工作区扫描器：把所有 Makefile 文件解析成 MakefileNode 树
 *
 * 使用方式：
 *   const scanner = new MakefileScanner();
 *   const nodes = await scanner.scanWorkspace();
 *
 * 构造函数接受可选的 MakefileScannerOptions（后续 PR 可能扩展）：
 * - excludePattern：覆盖默认的 EXCLUDE_PATTERN
 * - globs：覆盖默认的 MAKEFILE_GLOBS
 *
 * 当前 PR1 暂不暴露 options，保留极简接口；如需扩展再开新 PR。
 */
export class MakefileScanner {

  /**
   * 扫描工作区中所有 Makefile 文件，解析 targets，生成 MakefileNode 树
   *
   * 排序规则：
   * - 浅目录优先（split 数小的排前）
   * - 同深度按路径字典序
   *
   * 错误处理：
   * - 无 workspace → 返回空数组（不抛错）
   * - 单个文件读取失败 → console.warn 跳过，不影响其他文件
   *
   * @returns MakefileNode 数组（按目录深度 + 路径排序）
   */
  async scanWorkspace(): Promise<MakefileNode[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    // 递归查找所有 Makefile 文件
    const allFiles: vscode.Uri[] = [];
    for (const glob of MAKEFILE_GLOBS) {
      const files = await vscode.workspace.findFiles(glob, EXCLUDE_PATTERN);
      allFiles.push(...files);
    }

    // 去重（有些文件可能匹配多个 glob）
    const uniqueFiles = this.dedupeUris(allFiles);

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
        fileNode.children = targets.map(t => this.createTargetNode(t, uri.fsPath));

        nodes.push(fileNode);
      } catch (err) {
        // 文件读取失败（权限问题等），静默跳过
        console.warn(`[Makefile Scanner] 无法读取 ${uri.fsPath}: ${err}`);
      }
    }

    return nodes;
  }

  /**
   * 从 Target 数据创建对应的树节点
   *
   * @param target - 解析出的 target 信息
   * @param filePath - 所属 Makefile 的绝对路径
   * @returns 可渲染的 MakefileNode
   */
  private createTargetNode(target: Target, filePath: string): MakefileNode {
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

    // 有依赖时，target 可展开，子节点为依赖项
    if (target.dependencies.length > 0) {
      node.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      node.children = target.dependencies.map(dep =>
        new MakefileNode(dep, 'dependency', filePath, -1)
      );
    }

    // tooltip 显示完整信息
    node.tooltip = [
      `Target: ${target.name}`,
      target.description ? `描述: ${target.description}` : '',
      target.dependencies.length > 0
        ? `依赖: ${target.dependencies.join(', ')}`
        : '',
      `位置: ${filePath}:${target.line + 1}`,
      '',
      '双击 — 执行任务',
      '右键 → Go to Definition — 跳转到定义'
    ].filter(Boolean).join('\n');

    return node;
  }

  /**
   * URI 数组去重（按 fsPath）
   *
   * 多个 glob 模式（如 Makefile 双星通配 + Makefile.x 前缀通配）可能匹配同一文件，
   * 去重避免重复解析。
   */
  private dedupeUris(uris: vscode.Uri[]): vscode.Uri[] {
    const seen = new Set<string>();
    return uris.filter(uri => {
      if (seen.has(uri.fsPath)) return false;
      seen.add(uri.fsPath);
      return true;
    });
  }
}