/**
 * services/ArgsPromptService.ts — 弹输入框收集 make 参数（PR5 Run with Args）
 *
 * 设计动机：
 * - Starcat 根 Makefile 有 VERSION=0.1.0 / RELEASE_FLAGS 等参数
 * - 每次右键「Run with Args...」要手敲 `make build-dmg VERSION=0.1.0`
 * - 提供「右键 → 弹输入框 → 输入 KEY=VALUE → 自动跑」流
 *
 * 拆分原则（与 argsParser.ts 配合）：
 * - 本文件只负责 vscode.window.showInputBox UI
 * - 解析 / 校验纯逻辑在 argsParser.ts，避开 vscode runtime 测试
 *
 * 不做复杂功能：
 * - 不支持引号 / 转义（VSCode Input UI 用户体验约束，简单胜于灵活）
 * - 不存历史（PR4 已有 TaskHistoryService 跑 target 记录）
 * - 不做默认值提示（用 placeHolder 引导足够）
 */

import * as vscode from 'vscode';
import { validateArgsInput } from './argsParser';

/**
 * Args Prompt UI 服务：弹输入框 + 委托给 argsParser 做校验
 *
 * 用法：
 *   const svc = new ArgsPromptService();
 *   const input = await svc.prompt('build-dmg');
 *   if (input !== undefined) {
 *     // 调用方自行用 argsParser.parseArgs(input) 解析
 *   }
 *
 * 注意：本类不暴露 parseArgs —— 调用方直接 import argsParser，
 * 避免 ArgsPromptService 同时引 vscode + 引 argsParser 在测试链上出问题。
 */
export class ArgsPromptService {

  /**
   * 弹出输入框，让用户输入 KEY=VALUE 形式的 make 参数
   *
   * @param targetName 当前 target 名（用于 prompt 文案）
   * @returns 用户输入字符串；用户取消（Esc）时返回 undefined
   */
  async prompt(targetName: string): Promise<string | undefined> {
    return vscode.window.showInputBox({
      prompt: `输入 make ${targetName} 的额外参数（空格分隔，空表示无）`,
      placeHolder: '例：VERSION=0.1.0 DEBUG=1',
      ignoreFocusOut: true,
      validateInput: (value) => validateArgsInput(value)
    });
  }
}
