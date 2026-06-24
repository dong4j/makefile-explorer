/**
 * test/TaskHistoryService.test.ts — TaskHistoryService 单元测试
 *
 * 设计：mock context.globalState（仅实现 get/update），避免拉起 vscode runtime。
 * service 本身逻辑简单（KV 包装），但单测能：
 * 1. 锁定 globalState key 名称（重构时及时发现破坏）
 * 2. 锁定 record/getLast/clear 的语义边界
 * 3. 跨 session 持久化语义（service 层不做，但保证写入成功）
 */

import * as assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { TaskHistoryService } from '../services/TaskHistoryService';
import type * as vscode from 'vscode';

/**
 * 构造一个最小 ExtensionContext mock
 *
 * 只实现 globalState.get / globalState.update，
 * 其他 ExtensionContext 字段不实现（cast as any 兜底）。
 */
function makeMockContext(): vscode.ExtensionContext {
  const store = new Map<string, unknown>();
  return {
    globalState: {
      get: <T>(key: string) => store.get(key) as T | undefined,
      // 模拟 VSCode 实现：update 同步内存写入 + 异步持久化
      update: (key: string, value: unknown) => {
        if (value === undefined) {
          store.delete(key);
        } else {
          store.set(key, value);
        }
        return Promise.resolve();
      }
    }
    // 其他 ExtensionContext 字段未实现，使用 as any 兜底
  } as unknown as vscode.ExtensionContext;
}

describe('TaskHistoryService', () => {

  it('初始状态 getLast 返回 undefined', () => {
    const svc = new TaskHistoryService(makeMockContext());
    assert.equal(svc.getLast(), undefined);
  });

  it('record 后 getLast 返回对应记录', () => {
    const svc = new TaskHistoryService(makeMockContext());
    svc.record('build', '/path/Makefile');
    const last = svc.getLast();
    assert.ok(last);
    assert.equal(last.name, 'build');
    assert.equal(last.filePath, '/path/Makefile');
    assert.ok(last.timestamp > 0, 'timestamp 应该是正数');
  });

  it('连续 record 保留最后一次', () => {
    const svc = new TaskHistoryService(makeMockContext());
    svc.record('build', '/p1/Makefile');
    svc.record('test', '/p2/Makefile');
    svc.record('clean', '/p3/Makefile');
    const last = svc.getLast();
    assert.ok(last);
    assert.equal(last.name, 'clean');
    assert.equal(last.filePath, '/p3/Makefile');
  });

  it('clear 后 getLast 返回 undefined', () => {
    const svc = new TaskHistoryService(makeMockContext());
    svc.record('build', '/p/Makefile');
    svc.clear();
    assert.equal(svc.getLast(), undefined);
  });

  it('不同 instance 共享同一个 storage（globalState 跨 instance）', () => {
    const ctx = makeMockContext();
    const svc1 = new TaskHistoryService(ctx);
    svc1.record('build', '/p/Makefile');
    // svc2 用同一个 ctx，应能看到 svc1 写入的数据
    const svc2 = new TaskHistoryService(ctx);
    const last = svc2.getLast();
    assert.ok(last);
    assert.equal(last.name, 'build');
  });

  // ============================================================
  // PR7: 节点徽标 + 失败建议
  // ============================================================

  describe('PR7: task 状态查询', () => {
    it('初始 getStatus 返回 undefined', () => {
      const svc = new TaskHistoryService(makeMockContext());
      assert.equal(svc.getStatus('build', '/p/Makefile'), undefined);
    });

    it('record success 后 getStatus 返回 success', () => {
      const svc = new TaskHistoryService(makeMockContext());
      svc.record('build', '/p/Makefile', 'success');
      assert.equal(svc.getStatus('build', '/p/Makefile'), 'success');
    });

    it('record failed 后 getStatus 返回 failed', () => {
      const svc = new TaskHistoryService(makeMockContext());
      svc.record('test', '/p/Makefile', 'failed');
      assert.equal(svc.getStatus('test', '/p/Makefile'), 'failed');
    });

    it('record 默认状态是 success（与 PR4 行为兼容）', () => {
      const svc = new TaskHistoryService(makeMockContext());
      svc.record('build', '/p/Makefile');
      assert.equal(svc.getStatus('build', '/p/Makefile'), 'success');
    });

    it('同名 target 在不同 Makefile 互不影响', () => {
      const svc = new TaskHistoryService(makeMockContext());
      svc.record('build', '/p1/Makefile', 'success');
      svc.record('build', '/p2/Makefile', 'failed');
      assert.equal(svc.getStatus('build', '/p1/Makefile'), 'success');
      assert.equal(svc.getStatus('build', '/p2/Makefile'), 'failed');
    });

    it('clearAllStatus 后所有 getStatus 返回 undefined（lastTask 不变）', () => {
      const svc = new TaskHistoryService(makeMockContext());
      svc.record('build', '/p/Makefile', 'success');
      svc.clearAllStatus();
      assert.equal(svc.getStatus('build', '/p/Makefile'), undefined);
      // lastTask 仍保留
      const last = svc.getLast();
      assert.ok(last);
      assert.equal(last.name, 'build');
    });

    it('FIFO 截断：超过 50 条时删除最旧', () => {
      const svc = new TaskHistoryService(makeMockContext());
      // 写 51 条（每条 timestamp 不同）
      for (let i = 0; i < 51; i++) {
        svc.record(`target_${i}`, '/p/Makefile', 'success');
      }
      // 第 0 条（最旧）应被删除
      assert.equal(svc.getStatus('target_0', '/p/Makefile'), undefined, 'target_0 应被 FIFO 截断');
      // 第 50 条（最新）应保留
      assert.equal(svc.getStatus('target_50', '/p/Makefile'), 'success');
    });

    it('跨 instance 共享 status（与 lastTask 行为一致）', () => {
      const ctx = makeMockContext();
      const svc1 = new TaskHistoryService(ctx);
      svc1.record('build', '/p/Makefile', 'success');
      const svc2 = new TaskHistoryService(ctx);
      assert.equal(svc2.getStatus('build', '/p/Makefile'), 'success');
    });
  });
});