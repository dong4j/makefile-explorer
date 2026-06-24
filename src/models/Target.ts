/**
 * models/Target.ts — Makefile target 与节点类型的数据模型
 *
 * 这个文件只放「纯数据」：不带 VSCode 依赖的接口与字面量联合类型，
 * 让 TargetParser / MakefileScanner 等服务层可以脱离 VSCode runtime 单测。
 *
 * 拆分原则：
 * - Target interface：来自 TargetParser 解析出的可执行单元
 * - NodeType：描述树形 UI 的三类节点（文件 / target / dependency）
 * - MakefileNode 类（带 vscode.TreeItem 基类）放在 MakefileNode.ts，
 *   因为它依赖 vscode namespace，无法做纯单测
 */

/**
 * 解析 Makefile 后得到的单个 target 信息
 *
 * 字段语义：
 * - name：冒号前的标识符，如 `build` `test` `release-dry-run`
 * - line：target 在 Makefile 中的行号（0-based，匹配编辑器 API）
 * - description：从上方注释或同行 ## 注释提取的人类可读描述
 * - filePath：所属 Makefile 的绝对路径，绑定 tree node 上下文用
 * - dependencies：冒号后、`##` 前的空白分隔列表（已过滤 inline 注释）
 */
export interface Target {
  /** target 名称，如 build / test / clean */
  name: string;
  /** 在 Makefile 中的行号（0-based） */
  line: number;
  /** 从 target 上方注释提取的描述信息 */
  description: string;
  /** 所属 Makefile 文件的绝对路径 */
  filePath: string;
  /** target 的依赖列表（冒号后的部分），如 ['src/main.c', 'utils.o'] */
  dependencies: string[];
}

/**
 * 树节点的三种类型：
 * - 'makefile'：Makefile 文件节点（可展开，包含 targets）
 * - 'target'：Makefile 中的可操作命令节点（可展开，包含 dependencies）
 * - 'dependency'：target 的依赖项（叶子节点，仅展示）
 *
 * 放在 Target.ts 而非 MakefileNode.ts，是为了让 MakefileScanner / TargetParser
 * 也能引用这个类型（即使它们不需要 vscode.TreeItem）。
 */
export type NodeType = 'makefile' | 'target' | 'dependency';