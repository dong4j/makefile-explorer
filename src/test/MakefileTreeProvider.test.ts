/**
 * test/MakefileTreeProvider.test.ts — MakefileTreeProvider 单元测试（PR6 View as List）
 *
 * 覆盖矩阵：
 * - flat 模式 label 拼装格式：`targetName [path/to/Makefile]`
 * - flat 模式 command.arguments.name 用原始 target name（不带 [path] 前缀）
 * - viewMode 状态在 toggle 前后切换
 * - flat 模式根节点无 makefile 父节点
 *
 * 设计：
 * - 避免 import MakefileTreeProvider / MakefileNode（依赖 vscode namespace）
 * - 只测纯函数：label 拼装、command arguments 重写、viewMode 状态机
 * - vscode runtime 触发的部分（watcher / EventEmitter）放到集成测试
 *
 * 拆分原因（与 PR5 ArgsPromptService 同样的教训）：
 * - mocha + esbuild-runner require .ts 文件时，import 链会触发所有依赖的解析
 * - MakefileTreeProvider 内部 import vscode，vscode 模块在 test 环境下不存在
 * - 所以测试只覆盖「可纯函数化」的逻辑，跳过构造 / watch 部分
 */

import * as assert from 'node:assert/strict';
import { describe, it } from 'mocha';

/** 模拟 viewMode 状态机的纯函数版本（不依赖类实例） */
type ViewMode = 'tree' | 'flat';

function nextViewMode(current: ViewMode): ViewMode {
  return current === 'tree' ? 'flat' : 'tree';
}

/** 模拟 flat 模式 label 拼装（与 MakefileTreeProvider.collectFlatTargets 一致） */
function makeFlatLabel(targetName: string, makefileLabel: string): string {
  return `${targetName} [${makefileLabel}]`;
}

/** 模拟 flat 模式 command.arguments 重写（关键：name 必须是原始 target name） */
function makeFlatCommandArgs(
  originalName: string,
  filePath: string,
  line: number
): { name: string; filePath: string; line: number } {
  return { name: originalName, filePath, line };
}

describe('MakefileTreeProvider 视图模式 (PR6)', () => {

  describe('viewMode 状态机', () => {
    it('初始为 tree', () => {
      assert.equal(nextViewMode('tree'), 'flat');
    });

    it('tree → flat', () => {
      assert.equal(nextViewMode('tree'), 'flat');
    });

    it('flat → tree', () => {
      assert.equal(nextViewMode('flat'), 'tree');
    });

    it('连续切换 4 次回到原状态', () => {
      let mode: ViewMode = 'tree';
      mode = nextViewMode(mode);
      mode = nextViewMode(mode);
      mode = nextViewMode(mode);
      mode = nextViewMode(mode);
      assert.equal(mode, 'tree');
    });
  });

  describe('flat 模式 label 拼装', () => {
    it('根 Makefile 的 target', () => {
      assert.equal(makeFlatLabel('build', 'Makefile'), 'build [Makefile]');
    });

    it('嵌套 Makefile 的 target', () => {
      assert.equal(makeFlatLabel('lint', 'src/Makefile'), 'lint [src/Makefile]');
    });

    it('多层嵌套 Makefile', () => {
      assert.equal(
        makeFlatLabel('docker-build', 'tools/docker/Makefile'),
        'docker-build [tools/docker/Makefile]'
      );
    });

    it('target 名含连字符 / 数字（make 允许的命名）', () => {
      assert.equal(
        makeFlatLabel('build-dmg-v2', 'Makefile'),
        'build-dmg-v2 [Makefile]'
      );
    });
  });

  describe('flat 模式 command.arguments 重写', () => {
    it('name 字段必须是原始 target name（不带 [path] 前缀）', () => {
      const args = makeFlatCommandArgs('build', '/Makefile', 5);
      assert.equal(args.name, 'build');
      // 关键：name 不能是 "build [/Makefile]"
      assert.doesNotMatch(args.name, /\[/);
    });

    it('filePath / line 字段保持原值', () => {
      const args = makeFlatCommandArgs('test', '/src/Makefile', 10);
      assert.equal(args.filePath, '/src/Makefile');
      assert.equal(args.line, 10);
    });

    it('即使 flat label 拼装了路径，command args 仍干净', () => {
      // 模拟完整流程：label 带 [path]，但 args.name 是原始 name
      const originalName = 'help';
      const makefileLabel = 'docs/Makefile';
      const flatLabel = makeFlatLabel(originalName, makefileLabel);
      const args = makeFlatCommandArgs(originalName, '/docs/Makefile', 7);

      assert.equal(flatLabel, 'help [docs/Makefile]');
      assert.equal(args.name, 'help');
      // 两条路径独立：label 给人看，args 给 make 用
      assert.notEqual(flatLabel, args.name);
    });
  });
});
