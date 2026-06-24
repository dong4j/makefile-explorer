/**
 * services/argsParser.ts — 纯函数：解析 KEY=VALUE 格式的 make 参数
 *
 * 拆分动机：
 * - ArgsPromptService 同时依赖 vscode.window 和纯解析逻辑
 * - 单元测试需要隔离 vscode runtime，否则会因解析 'vscode' 模块失败
 * - 把解析逻辑拆出独立文件，测试时只 import 这个文件，避开 vscode
 *
 * 输入格式约束（与 make 变量名规则对齐）：
 * - 单行字符串，空格分隔多个 KEY=VALUE
 * - KEY 必须 [A-Za-z_][A-Za-z0-9_]*（make 变量名规则）
 * - VALUE 不能含空格（避免 split 后错位）
 * - 空字符串视为"无额外参数"
 */

/** 单个 KEY=VALUE token 的正则（KEY 必须字母/下划线开头，后续字母数字下划线） */
const ARG_TOKEN_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** parseArgs 的返回结构：成功解析的 args + 错误 token 列表 */
export interface ParsedArgs {
  args: string[];
  errors: string[];
}

/**
 * 校验输入格式
 *
 * @param value 用户输入字符串
 * @returns null = 通过；非 null = 错误提示
 */
export function validateArgsInput(value: string): string | null {
  if (!value.trim()) return null;
  const tokens = value.trim().split(/\s+/);
  for (const token of tokens) {
    if (!ARG_TOKEN_RE.test(token)) {
      return `参数格式错误: "${token}"（应为 KEY=VALUE，KEY 字母/下划线开头）`;
    }
  }
  return null;
}

/**
 * 把 "KEY=val1 KEY2=val2" 解析成 ["KEY=val1", "KEY2=val2"]
 *
 * @param input 用户输入字符串（已通过 validateArgsInput 校验，或测试时直接传）
 * @returns 解析结果（args 列表 + 错误列表）
 */
export function parseArgs(input: string): ParsedArgs {
  const trimmed = input.trim();
  if (!trimmed) return { args: [], errors: [] };

  const tokens = trimmed.split(/\s+/);
  const args: string[] = [];
  const errors: string[] = [];

  for (const token of tokens) {
    if (ARG_TOKEN_RE.test(token)) {
      args.push(token);
    } else {
      errors.push(`参数格式错误: "${token}"`);
    }
  }

  return { args, errors };
}
