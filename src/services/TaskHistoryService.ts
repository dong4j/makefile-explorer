/**
 * services/TaskHistoryService.ts — 持久化 Make target 执行历史与状态
 *
 * 设计动机：
 * - PR4 Run Last Task：双击 target 后用户想"再跑一次刚才那个"
 *   → 提供 Alt+Shift+R 一键重跑（基于 LastTaskRecord）
 * - PR7 节点徽标：跑过 target 后节点显示 ✓/✗，重启 Dev Host 后仍保留
 *   → 持久化 TaskStatus 到 globalState
 *
 * 存储选型：
 * - 用 context.globalState 而非 context.workspaceState：
 *   - globalState 跨 workspace 共享（用户切到其他项目也能重跑上次的 target）
 *   - workspaceState 绑死在当前 workspace，切走就没了
 * - 不用 memento.files / memento.workspace 之类的旧 API
 * - 不引入 SQLite / 文件系统，纯 VSCode 原生 storage
 *
 * 数据模型：
 * - LastTaskRecord（PR4）：name + filePath + timestamp，用于 runLastTask
 * - TaskRecord（PR7）：name + filePath + status + timestamp
 *   - status 决定节点徽标（success / failed）
 *
 * 持久化时机：
 * - onDidEndTaskProcess 监听器在 task.type === makefile-explorer 时调用 record()
 * - 不在 executeTarget 内部 record（executeTarget 是 async，不能保证一定成功）
 * - 监听 task 结束事件更准确（成功失败都记）
 *
 * FIFO 截断（PR7）：
 * - 最多 50 条 task 状态
 * - 超出时按 timestamp 升序删除最旧
 * - 防止 globalState 无限膨胀
 */

import * as vscode from 'vscode';

/**
 * 一次 Make target 调用的最近一次记录（PR4 Run Last Task 用）
 */
export interface LastTaskRecord {
  /** target 名，如 build / test */
  name: string;
  /** Makefile 绝对路径，用于重新构造 ShellExecution */
  filePath: string;
  /** 记录时间戳（ms），便于未来做 TTL 清理 */
  timestamp: number;
}

/**
 * target 执行状态（PR7 节点徽标用）
 */
export type TaskStatus = 'success' | 'failed';

/**
 * 单个 target 的最近一次执行记录
 */
export interface TaskRecord {
  /** target 名 */
  name: string;
  /** Makefile 绝对路径 */
  filePath: string;
  /** 执行结果状态 */
  status: TaskStatus;
  /** 记录时间戳（ms） */
  timestamp: number;
}

/** globalState 存储 key：最近一次的 target（PR4） */
const LAST_TASK_KEY = 'makefileExplorer.lastTask';

/** globalState 存储 key：所有 target 状态（PR7） */
const TASK_STATUS_KEY = 'makefileExplorer.taskStatus';

/** FIFO 截断上限（PR7）—— 50 条够覆盖一个普通项目的所有 target */
const MAX_RECORDS = 50;

/**
 * 生成 task 状态存储的内部 key
 * 同一 target 在不同 Makefile 下要分别记录
 */
function makeRecordKey(filePath: string, name: string): string {
  return `${filePath}::${name}`;
}

/**
 * Task History 持久化服务
 *
 * 用法：
 *   const history = new TaskHistoryService(context);
 *   // PR4: 记录最近一次 + 一键重跑
 *   history.record('build', '/path/to/Makefile', 'success');
 *   const last = history.getLast();
 *
 *   // PR7: 查询 target 状态
 *   const status = history.getStatus('build', '/path/to/Makefile');
 *
 * 关键约束：
 * - globalState 的 update 是异步的，但 VSCode 实现是同步内存写入 + 异步持久化
 *   短间隔连续 record() 会保留最后一次的值
 * - record() 不抛错，update 失败时 VSCode 内部吞掉
 */
export class TaskHistoryService {

  /**
   * @param context VSCode 扩展上下文，提供 globalState 存储能力
   */
  constructor(private readonly context: vscode.ExtensionContext) {}

  // ============================================================
  // PR4: Last Task
  // ============================================================

  /**
   * 记录最近一次跑的 target（同时更新 lastTask 与 taskStatus）
   *
   * @param name target 名
   * @param filePath Makefile 绝对路径
   * @param status 执行结果（PR7 新增）
   */
  record(name: string, filePath: string, status: TaskStatus = 'success'): void {
    // 更新 lastTask（PR4 路径，给 runLastTask 用）
    const lastRecord: LastTaskRecord = {
      name,
      filePath,
      timestamp: Date.now()
    };
    this.context.globalState.update(LAST_TASK_KEY, lastRecord);

    // 更新 taskStatus（PR7 路径，给节点徽标用）
    const statusMap = this.loadAllStatus();
    const key = makeRecordKey(filePath, name);
    statusMap[key] = {
      name,
      filePath,
      status,
      timestamp: Date.now()
    };

    // FIFO 截断：超出 MAX_RECORDS 时按 timestamp 升序删除最旧
    const entries = Object.entries(statusMap);
    if (entries.length > MAX_RECORDS) {
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toDelete = entries.slice(0, entries.length - MAX_RECORDS);
      for (const [k] of toDelete) {
        delete statusMap[k];
      }
    }

    this.context.globalState.update(TASK_STATUS_KEY, statusMap);
  }

  /**
   * 获取最近一次的 target 记录
   *
   * @returns 记录对象；无历史时返回 undefined
   */
  getLast(): LastTaskRecord | undefined {
    return this.context.globalState.get<LastTaskRecord>(LAST_TASK_KEY);
  }

  // ============================================================
  // PR7: Task Status（节点徽标 + 失败建议）
  // ============================================================

  /**
   * 获取指定 target 的最近执行状态
   *
   * @param name target 名
   * @param filePath Makefile 绝对路径
   * @returns 状态；无记录时返回 undefined
   */
  getStatus(name: string, filePath: string): TaskStatus | undefined {
    const statusMap = this.loadAllStatus();
    const key = makeRecordKey(filePath, name);
    return statusMap[key]?.status;
  }

  /**
   * 清除所有 task 状态（PR7 用户主动重置）
   *
   * 不清除 lastTask（用户重置状态不应影响一键重跑）
   *
   * 配套命令：makefile-explorer.clearTaskStatus
   */
  clearAllStatus(): void {
    this.context.globalState.update(TASK_STATUS_KEY, {});
  }

  /**
   * 从 globalState 加载所有 task 状态
   */
  private loadAllStatus(): Record<string, TaskRecord> {
    return this.context.globalState.get<Record<string, TaskRecord>>(TASK_STATUS_KEY) ?? {};
  }

  // ============================================================
  // 兼容入口（PR4 已有 API）
  // ============================================================

  /**
   * 清除 lastTask 历史（保留 taskStatus）
   *
   * 旧 API，保留供测试用
   */
  clear(): void {
    this.context.globalState.update(LAST_TASK_KEY, undefined);
  }
}
