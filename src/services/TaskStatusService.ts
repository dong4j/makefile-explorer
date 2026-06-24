/**
 * services/TaskStatusService.ts — Make target 失败的智能建议分析（PR7）
 *
 * 拆分动机：
 * - 失败建议逻辑（关键字检测）需要单测覆盖
 * - 拆出独立文件，避免 extension.ts 变臃肿
 * - 纯函数实现，不依赖 vscode runtime
 *
 * 工作机制：
 * - 输入：make 调用的 stderr 字符串
 * - 输出：FailureSuggestion[] 列表（按优先级排序）
 * - 匹配规则：每个模式独立检测，可能命中多条
 *
 * 不做的事：
 * - 不做模糊匹配（避免误报）
 * - 不解析 exit code（exit code 只能告诉我们"失败"但不能告诉我们"为什么"）
 * - 不调用 make 二次查询（不现实）
 */

export interface FailureSuggestion {
  /** 失败原因（用户可读） */
  cause: string;
  /** 建议的修复方法（用户可读） */
  fix: string;
}

/**
 * 关键字模式：检测 + 生成的建议
 */
interface ErrorPattern {
  /** 匹配的 stderr 子串（小写匹配） */
  pattern: string;
  /** 命中的建议 */
  suggestion: FailureSuggestion;
}

/**
 * 内置错误模式列表（按常见度排序）
 * 新增模式只需往这里加一行，无需改分析逻辑
 */
const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: 'no rule to make target',
    suggestion: {
      cause: 'target 不存在或拼写错误',
      fix: '检查 Makefile 是否声明了此 target（注意 tab 缩进）'
    }
  },
  {
    pattern: 'missing separator',
    suggestion: {
      cause: 'Makefile 语法错（recipe 行必须用 TAB，不能用空格）',
      fix: '检查出错行的缩进：recipe 必须是 TAB 开头，define/endef 块除外'
    }
  },
  {
    pattern: 'recipe commences before first target',
    suggestion: {
      cause: 'Makefile 第一行不是 target 就开始写 recipe',
      fix: '检查 Makefile 第一行：必须是 target 定义或注释，recipe 必须跟在 target 后'
    }
  },
  {
    pattern: 'permission denied',
    suggestion: {
      cause: '文件权限不足',
      fix: '检查可执行权限（chmod +x <file>）或当前用户对路径的访问权限'
    }
  },
  {
    pattern: 'command not found',
    suggestion: {
      cause: '依赖的命令未安装或不在 PATH 中',
      fix: '确认 make / gcc / 编译工具链已安装，并加入 PATH'
    }
  },
  {
    pattern: 'no such file or directory',
    suggestion: {
      cause: '引用的文件或目录不存在',
      fix: '检查路径拼写，或依赖文件是否被先生成（顺序依赖）'
    }
  }
];

/** fallback 建议（未匹配任何已知模式时） */
const FALLBACK_SUGGESTION: FailureSuggestion = {
  cause: '未识别的错误',
  fix: '查看完整 stderr 寻找线索，或搜索「make + 关键字」'
};

/**
 * 分析 make 的 stderr，提取可能的失败原因与建议
 *
 * @param stderr make 调用的标准错误输出
 * @returns 建议列表（按 ERROR_PATTERNS 顺序，可能多条）
 *
 * 设计要点：
 * - 模式匹配为子串匹配（includes），不要求整行匹配
 * - 全部转小写后比较，避免大小写差异
 * - 多个模式可能同时命中（如「No rule to make target」+「No such file」）
 */
export function analyzeError(stderr: string): FailureSuggestion[] {
  if (!stderr || !stderr.trim()) {
    return [FALLBACK_SUGGESTION];
  }

  const lower = stderr.toLowerCase();
  const matched: FailureSuggestion[] = [];

  for (const entry of ERROR_PATTERNS) {
    if (lower.includes(entry.pattern)) {
      matched.push(entry.suggestion);
    }
  }

  if (matched.length === 0) {
    matched.push(FALLBACK_SUGGESTION);
  }

  return matched;
}

/**
 * 把 stderr 截断到指定长度（用于持久化到 globalState）
 *
 * globalState 不应存大文本（影响性能 + 体积）。
 * 截断后保留头部（前 500 字符），通常包含关键错误信息。
 *
 * @param stderr 原始 stderr
 * @param maxLen 最大长度，默认 500
 * @returns 截断后的字符串（保留尾部「...」标识）
 */
export function truncateStderr(stderr: string, maxLen: number = 500): string {
  if (!stderr) return '';
  if (stderr.length <= maxLen) return stderr;
  return stderr.slice(0, maxLen) + '\n... (truncated)';
}
