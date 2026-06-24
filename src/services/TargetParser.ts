/**
 * TargetParser — 解析 Makefile 提取 targets 及其描述
 *
 * 解析规则：
 * 1. 行首为字母 [a-zA-Z]（非 . 开头，过滤 .PHONY 等特殊目标）
 * 2. 包含普通冒号 `:`，但不含 `=`（过滤变量赋值 VAR := value）
 * 3. 冒号前的内容即为 target 名称
 * 4. 提取 target 上方注释（优先）或同行 ## 注释作为描述
 *
 * 描述优先级：
 * - 优先使用 target 上方的连续 # 注释行
 * - 如果上方无注释，使用同行 `##` 后的文本
 *
 * 兼容不同 Makefile 样式：
 * - target: deps              ← 有依赖
 * - target:                   ← 无依赖
 * - target::                  ← 双冒号规则
 * - target: ## 描述           ← 同行注释（无依赖）
 * - target: deps ## 描述      ← 同行注释（有依赖）
 */

import { Target } from '../models/Target';

/** 匹配同行 `##` 后的描述文本 */
const INLINE_COMMENT_RE = /##\s*(.+)$/;

/**
 * 从 Makefile 文本内容中解析所有 targets
 *
 * @param content - Makefile 文件内容（字符串）
 * @param filePath - Makefile 文件的绝对路径
 * @returns 解析出的 Target 数组，按行号排序
 */
export function parseTargets(content: string, filePath: string): Target[] {
  const lines = content.split('\n');
  const targets: Target[] = [];

  // 临时存储 target 上方的连续注释行，用于提取描述
  let pendingComments: string[] = [];
  // 跟踪连续空行数，超过阈值后清空待定注释
  let consecutiveBlankLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 收集注释行（# 或 ##），用于后续 target 的描述
    if (trimmed.startsWith('#')) {
      consecutiveBlankLines = 0;
      // 去掉前导 #（支持 ## comment 和 # comment 两种风格）
      const commentText = trimmed.replace(/^##?\s*/, '');
      if (commentText) {
        pendingComments.push(commentText);
      }
      continue;
    }

    // 空行：连续超过 2 行则清空待定注释（注释块已结束）
    if (trimmed === '') {
      consecutiveBlankLines++;
      if (consecutiveBlankLines > 2) {
        pendingComments = [];
      }
      continue;
    }

    // 非空非注释行 → 重置空行计数
    consecutiveBlankLines = 0;

    // 检查是否为 target 定义行
    const firstChar = trimmed.charAt(0);
    const isAlpha = (firstChar >= 'a' && firstChar <= 'z') ||
                    (firstChar >= 'A' && firstChar <= 'Z');

    if (!isAlpha) {
      // 非字母开头 → 不是 target → 清空待定注释
      pendingComments = [];
      continue;
    }

    // 包含 `=` → 是变量赋值，不是 target（如 FOO := bar, BAR = baz）
    if (trimmed.includes('=')) {
      pendingComments = [];
      continue;
    }

    // 必须包含 `:`
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      pendingComments = [];
      continue;
    }

    // 提取 target 名称（冒号前的内容）
    const targetName = trimmed.substring(0, colonIndex).trim();

    // 有效性检查：
    // - target 名称不能为空
    // - 不能以 . 开头（如 .PHONY）
    // - 不能包含空格/Tab（说明不是真正的 target）
    if (!targetName || targetName.startsWith('.') || /\s/.test(targetName)) {
      pendingComments = [];
      continue;
    }

    // ---- 提取依赖（冒号后、## 前的内容）----
    const afterColon = trimmed.substring(colonIndex + 1);
    const depsText = afterColon.replace(INLINE_COMMENT_RE, '').trim();
    const dependencies = depsText ? depsText.split(/\s+/) : [];

    // ---- 提取描述：上方注释优先，其次同行 ## 注释 ----
    let description = '';
    if (pendingComments.length > 0) {
      // 优先：使用 target 上方的注释
      description = pendingComments.join(' ');
    } else {
      // 其次：从同行提取 ## 后的文本
      const inlineMatch = trimmed.match(INLINE_COMMENT_RE);
      if (inlineMatch) {
        description = inlineMatch[1].trim();
      }
    }

    targets.push({
      name: targetName,
      line: i,
      description,
      filePath,
      dependencies
    });

    // 清空待定注释（下一个 target 需要新的注释）
    pendingComments = [];
  }

  return targets;
}

/**
 * 判断文件名是否可能是 Makefile
 * 支持：Makefile, makefile, GNUmakefile, *.mk 以及任意带 Makefile 前缀的文件
 */
export function isMakefile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower === 'makefile' ||
         lower === 'gnumakefile' ||
         lower.endsWith('.mk') ||
         lower.startsWith('makefile');
}
