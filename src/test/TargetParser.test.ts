/**
 * test/TargetParser.test.ts — TargetParser 单元测试
 *
 * PR3 范围：纯函数测试（不依赖 vscode runtime），使用 node:assert。
 * MakefileScanner / TreeProvider 等依赖 vscode 的模块留到 PR3b（集成测试）做。
 *
 * 测试覆盖矩阵（参考 TargetParser.ts 的解析规则）：
 * 1. 简单 target：无依赖
 * 2. 带依赖 target：依赖列表拆分
 * 3. 同行 ## 注释：描述提取
 * 4. 上方 # 注释（优先）：描述从上方注释取
 * 5. .PHONY 特殊目标：跳过
 * 6. 变量赋值 VAR := / VAR =：跳过
 * 7. 空行 + 注释混合：连续空行清空 pendingComments
 * 8. target 名以 . 开头：跳过
 * 9. 双冒号 target::：当前实现包含 : 即解析（属于单冒号扩展行为，记录）
 * 10. 同行 ## 注释 + 依赖并存：deps 与 description 都正确
 *
 * 设计取舍：
 * - 用 node:assert/strict 而非 chai：零依赖、Node 自带
 * - 用 describe/it 而非裸 it：层级清晰，错误输出友好
 * - 不测 line 字段：行号依赖具体文本，断言太脆
 */

import * as assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { parseTargets } from '../services/TargetParser';

/** 测试用 helper：包一层让单测更紧凑 */
function parse(content: string) {
  return parseTargets(content, '/test/Makefile');
}

describe('TargetParser', () => {

  describe('基本 target 识别', () => {
    it('简单 target 无依赖', () => {
      const result = parse('build:');
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'build');
      assert.deepEqual(result[0].dependencies, []);
      assert.equal(result[0].description, '');
    });

    it('target 带多个依赖', () => {
      const result = parse('test: src/a.c src/b.c src/c.c');
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'test');
      assert.deepEqual(result[0].dependencies, ['src/a.c', 'src/b.c', 'src/c.c']);
    });

    it('多个 target 在同一文件', () => {
      const content = [
        'build:',
        '\tgcc -o app main.c',
        '',
        'test:',
        '\t./run_tests.sh',
        '',
        'clean:',
        '\trm -f app'
      ].join('\n');
      const result = parse(content);
      assert.equal(result.length, 3);
      assert.deepEqual(
        result.map(t => t.name),
        ['build', 'test', 'clean']
      );
    });
  });

  describe('描述提取', () => {
    it('从同行 ## 注释提取描述（无依赖）', () => {
      const result = parse('help: ## 显示所有可用命令');
      assert.equal(result[0].description, '显示所有可用命令');
    });

    it('从同行 ## 注释提取描述（带依赖）', () => {
      const result = parse('release: dist/ ## 打包 release 版本');
      // 注意：当前实现会把 dist/ 当依赖，## 提取为 description
      assert.deepEqual(result[0].dependencies, ['dist/']);
      assert.equal(result[0].description, '打包 release 版本');
    });

    it('从上方 # 注释提取描述（优先于同行 ##）', () => {
      const content = [
        '# 构建 release 版本',
        '# 自动跑测试 + 打包',
        'release: dist/',
        '\ttar czf app.tar.gz dist/'
      ].join('\n');
      const result = parse(content);
      assert.equal(result[0].name, 'release');
      // 上方两行 # 注释应 join 为单个 description
      assert.equal(result[0].description, '构建 release 版本 自动跑测试 + 打包');
    });

    it('上方多行 # 注释 vs 同行 ## 取前者', () => {
      const content = [
        '# 上方注释',
        'build: ## 同行注释'
      ].join('\n');
      const result = parse(content);
      // 上方注释存在时优先用上方
      assert.equal(result[0].description, '上方注释');
    });

    it('无注释时 description 为空字符串', () => {
      const result = parse('build:');
      assert.equal(result[0].description, '');
    });
  });

  describe('过滤规则', () => {
    it('跳过 .PHONY 特殊目标', () => {
      const content = [
        '.PHONY: build test',
        'build:',
        'test:'
      ].join('\n');
      const result = parse(content);
      // .PHONY 行被过滤（以 . 开头）
      // build/test 是单独 target 行，应正常识别
      assert.equal(result.length, 2);
      assert.deepEqual(
        result.map(t => t.name),
        ['build', 'test']
      );
    });

    it('跳过变量赋值 :=', () => {
      const content = [
        'CC := gcc',
        'CFLAGS := -O2',
        'build:'
      ].join('\n');
      const result = parse(content);
      // 变量赋值被过滤，build 单独行可识别
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'build');
    });

    it('跳过变量赋值 =', () => {
      const content = [
        'VAR = value',
        'OTHER = another',
        'target:'
      ].join('\n');
      const result = parse(content);
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'target');
    });

    it('跳过 target 名以 . 开头的行', () => {
      const content = [
        '.PHONY: all',
        '.DEFAULT_GOAL := all',
        'all:'
      ].join('\n');
      const result = parse(content);
      // .PHONY 行 / .DEFAULT_GOAL 行都被过滤
      // all 是单独 target 行，应正常识别
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'all');
    });
  });

  describe('边界情况', () => {
    it('空 Makefile 返回空数组', () => {
      assert.deepEqual(parse(''), []);
    });

    it('只有注释的 Makefile 返回空数组', () => {
      const content = [
        '# This is a comment',
        '# Another comment'
      ].join('\n');
      assert.deepEqual(parse(content), []);
    });

    it('空行连续超过 2 行清空 pendingComments', () => {
      const content = [
        '# 应该被丢弃的注释',
        '',
        '',
        '',
        '# 这条注释是新块',
        'build:'
      ].join('\n');
      const result = parse(content);
      // pendingComments 应只剩"这条注释是新块"
      assert.equal(result[0].description, '这条注释是新块');
    });

    it('target 名包含空格应被跳过', () => {
      // "not a target:" 不应被识别（包含空格）
      const content = [
        'not a target: value',
        'real-target:'
      ].join('\n');
      const result = parse(content);
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'real-target');
    });

    it('双冒号规则当前实现按单冒号处理（已知行为）', () => {
      // 当前 parser 用 indexOf(':') 找第一个冒号作为分隔符，
      // 对 `target::` 第二个冒号会被当作依赖的第一个元素。
      // 这是已知 minor bug，PR3 不修 parser 行为，只记录现状。
      // 改进方案（留待 PR 后续）：用 indexOf('::') 优先匹配双冒号。
      const result = parse('all:: src1 src2');
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'all');
      // 第二个 : 被误归为依赖第一个元素
      assert.deepEqual(result[0].dependencies, [':', 'src1', 'src2']);
    });
  });
});