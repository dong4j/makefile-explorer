/**
 * test/ArgsPromptService.test.ts — ArgsPromptService 单元测试
 *
 * 仅测纯函数 parseArgs()。prompt() 需要 vscode runtime，延后到集成测试。
 *
 * 覆盖矩阵：
 * - 空输入：返回空 args
 * - 多个 KEY=VALUE：拆分正确
 * - 单个 KEY=VALUE：原样返回
 * - KEY 含数字/下划线：通过
 * - 非法格式（不以 KEY= 开头）：归入 errors
 * - 混合有效 + 非法：有效进 args，无效进 errors
 * - 首尾空格：trim 后处理
 * - 多个连续空格：split 兼容
 */

import * as assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { parseArgs } from '../services/argsParser';

describe('argsParser.parseArgs', () => {

  // 直接测纯函数，不走 ArgsPromptService（避免触发 vscode 解析）

  it('空字符串返回空 args', () => {
    const result = parseArgs('');
    assert.deepEqual(result.args, []);
    assert.deepEqual(result.errors, []);
  });

  it('纯空白返回空 args', () => {
    const result = parseArgs('   \t  ');
    assert.deepEqual(result.args, []);
    assert.deepEqual(result.errors, []);
  });

  it('单个 KEY=VALUE', () => {
    const result = parseArgs('VERSION=0.1.0');
    assert.deepEqual(result.args, ['VERSION=0.1.0']);
    assert.deepEqual(result.errors, []);
  });

  it('多个 KEY=VALUE 空格分隔', () => {
    const result = parseArgs('VERSION=0.1.0 DEBUG=1 FLAG=yes');
    assert.deepEqual(result.args, ['VERSION=0.1.0', 'DEBUG=1', 'FLAG=yes']);
    assert.deepEqual(result.errors, []);
  });

  it('KEY 含数字与下划线', () => {
    const result = parseArgs('A1=1 _INTERNAL=true V2_REV=3');
    assert.deepEqual(result.args, ['A1=1', '_INTERNAL=true', 'V2_REV=3']);
  });

  it('VALUE 含特殊字符（非空格）', () => {
    const result = parseArgs('PATH=/usr/local/bin URL=https://x.com');
    assert.deepEqual(result.args, ['PATH=/usr/local/bin', 'URL=https://x.com']);
  });

  it('首尾空格被 trim', () => {
    const result = parseArgs('  VERSION=0.1.0  ');
    assert.deepEqual(result.args, ['VERSION=0.1.0']);
  });

  it('多个连续空格作单分隔符', () => {
    const result = parseArgs('VERSION=0.1.0    DEBUG=1');
    assert.deepEqual(result.args, ['VERSION=0.1.0', 'DEBUG=1']);
  });

  it('非法格式归入 errors 而非 args', () => {
    const result = parseArgs('VERSION=0.1.0 notakeyvalue DEBUG=1');
    assert.deepEqual(result.args, ['VERSION=0.1.0', 'DEBUG=1']);
    assert.deepEqual(result.errors, ['参数格式错误: "notakeyvalue"']);
  });

  it('KEY 以数字开头 → errors', () => {
    // make 变量名不允许数字开头
    const result = parseArgs('1VAR=oops');
    assert.deepEqual(result.args, []);
    assert.deepEqual(result.errors.length, 1);
    assert.match(result.errors[0], /1VAR/);
  });

  it('只有 KEY 没有 = → errors', () => {
    const result = parseArgs('JUST_KEY');
    assert.deepEqual(result.args, []);
    assert.deepEqual(result.errors.length, 1);
  });

  it('空 KEY（=value）→ errors', () => {
    const result = parseArgs('=oops');
    assert.deepEqual(result.args, []);
    assert.deepEqual(result.errors.length, 1);
  });
});
