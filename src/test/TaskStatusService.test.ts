/**
 * test/TaskStatusService.test.ts — TaskStatusService 单元测试（PR7）
 *
 * 覆盖矩阵：
 * - 6 个内置错误模式（No rule / missing separator / recipe commences /
 *   permission denied / command not found / no such file）
 * - fallback 建议（未匹配任何模式）
 * - 空 stderr / undefined → fallback
 * - 大小写不敏感匹配
 * - 多模式同时命中
 * - truncateStderr：短字符串不变 / 长字符串截断
 *
 * 设计：纯函数 import，不依赖 vscode runtime
 */

import * as assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { analyzeError, truncateStderr } from '../services/TaskStatusService';

describe('TaskStatusService.analyzeError (PR7)', () => {

  describe('6 个内置模式', () => {
    it('No rule to make target → target 不存在建议', () => {
      const stderr = 'make: *** No rule to make target `fooo`.  Stop.';
      const result = analyzeError(stderr);
      assert.equal(result.length, 1);
      assert.match(result[0].cause, /target/);
      assert.match(result[0].fix, /Makefile/);
    });

    it('missing separator → tab 缩进建议', () => {
      const stderr = 'Makefile:5: *** missing separator.  Stop.';
      const result = analyzeError(stderr);
      assert.equal(result.length, 1);
      assert.match(result[0].cause, /tab|recipe/);
    });

    it('recipe commences before first target → 缺 TAB 建议', () => {
      const stderr = 'Makefile:3: *** recipe commences before first target.  Stop.';
      const result = analyzeError(stderr);
      assert.equal(result.length, 1);
      assert.match(result[0].cause, /recipe|tab/i);
    });

    it('Permission denied → 权限建议', () => {
      const stderr = 'sh: ./build.sh: Permission denied';
      const result = analyzeError(stderr);
      assert.equal(result.length, 1);
      assert.match(result[0].cause, /权限/);
      assert.match(result[0].fix, /chmod/);
    });

    it('command not found → 依赖命令建议', () => {
      const stderr = 'sh: gcc: command not found';
      const result = analyzeError(stderr);
      assert.equal(result.length, 1);
      assert.match(result[0].cause, /PATH|命令/);
    });

    it('No such file or directory → 文件缺失建议', () => {
      const stderr = 'make: *** [main.o] Error 1\nmake: src/main.c: No such file or directory';
      const result = analyzeError(stderr);
      assert.ok(result.length >= 1);
      // 至少应包含「no such file」命中
      const hasFileSuggestion = result.some(s => /文件|路径|依赖/.test(s.cause + s.fix));
      assert.ok(hasFileSuggestion, '应包含文件相关建议');
    });
  });

  describe('边界情况', () => {
    it('空字符串 → fallback', () => {
      const result = analyzeError('');
      assert.equal(result.length, 1);
      assert.equal(result[0].cause, '未识别的错误');
    });

    it('纯空白 → fallback', () => {
      const result = analyzeError('   \n\t  ');
      assert.equal(result.length, 1);
      assert.equal(result[0].cause, '未识别的错误');
    });

    it('完全不相关的文本 → fallback', () => {
      const result = analyzeError('this is some random output without errors');
      assert.equal(result.length, 1);
      assert.equal(result[0].cause, '未识别的错误');
    });

    it('大小写不敏感匹配', () => {
      const stderr = 'MAKE: *** NO RULE TO MAKE TARGET `build`.';
      const result = analyzeError(stderr);
      assert.equal(result.length, 1);
      assert.match(result[0].cause, /target/);
    });
  });

  describe('truncateStderr', () => {
    it('短字符串不变', () => {
      const result = truncateStderr('short error', 500);
      assert.equal(result, 'short error');
    });

    it('恰好等于 maxLen 不截断', () => {
      const text = 'a'.repeat(500);
      const result = truncateStderr(text, 500);
      assert.equal(result, text);
    });

    it('长字符串截断并加标识', () => {
      const text = 'a'.repeat(1000);
      const result = truncateStderr(text, 500);
      assert.equal(result.length, 500 + '\n... (truncated)'.length);
      assert.match(result, /\.\.\. \(truncated\)$/);
    });

    it('空字符串返回空', () => {
      assert.equal(truncateStderr(''), '');
    });

    it('默认 maxLen = 500', () => {
      const text = 'a'.repeat(1000);
      const result = truncateStderr(text);
      assert.ok(result.length < 1000);
      assert.match(result, /truncated/);
    });
  });
});
