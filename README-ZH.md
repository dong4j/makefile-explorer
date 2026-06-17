# Makefile Explorer

[![Version](https://img.shields.io/badge/version-0.3.0-blue)](https://github.com/dong4j/vscode-makefile-explorer)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![VSCode](https://img.shields.io/badge/vscode-%5E1.85.0-007ACC)](https://code.visualstudio.com/)

**在树形视图中浏览和执行 Makefile targets**——像 NPM Scripts 一样操作 Make。不用再在几百行的 Makefile 里翻找目标命令了。

![20260615201224_q7Bokpeb](./banner.webp)

## 为什么需要？

当 Makefile 有 50+ 个 targets 时，在扁平文本文件里找一个目标命令非常痛苦。Makefile Explorer 把每个 Makefile 看作一个可执行命令的文件夹：

- **展开** Makefile 节点 → 所有 targets 一览无余
- **双击** target → 在独立终端执行 `make <target>`（每次执行创建新终端，避免命令冲突）
- **点击右侧 📎 图标** → 一键跳转到 Makefile 定义行

专为 monorepo 场景设计：多个 Makefile、嵌套目录、几十个 targets——全部组织在一棵树里。

## 功能

- **🌲 树形视图** —— targets 按 Makefile 分组，展示在资源管理器侧边栏
- **▶ 双击执行** —— 双击任意 target 在独立终端运行（每次执行创建新终端 `Make - <target>`，不会与正在运行的命令冲突）
- **🔍 跳转定义** —— 点击右侧 📎 图标或右键 → "Go to Target Definition"，精确跳转到定义行
- **📝 注释支持** —— 提取 `##` 注释（上方注释和同行注释）作为描述
- **🔄 自动刷新** —— 监听文件变化，树保持同步
- **🛡️ 智能过滤** —— 跳过 `.PHONY`、变量赋值、空 targets
- **🚫 排除依赖目录** —— 自动排除 `node_modules/`、`vendor/`、`.build/` 等第三方目录
- **📦 多 Makefile** —— 支持 `Makefile`、`makefile`、`GNUmakefile`、`*.mk`、`Makefile.*`

## 使用方式

1. 打开包含 Makefile 的项目
2. 点击资源管理器侧边栏的 **"Make Targets"** 视图
3. 展开 Makefile 节点查看所有 targets
4. **双击** target → 在独立终端执行 `make <target>`（每个 target 在独立终端 `Make - <target>` 中运行）
5. **点击右侧 📎 图标** 或 **右键** → "Go to Definition" → 跳转到 Makefile 对应行

### Target 注释

支持从注释中提取 target 描述：

```makefile
# 构建项目二进制文件
# 使用 release 优化参数
build:
	cargo build --release

test: ## 运行完整测试套件
	cargo test
```

上方注释优先级高于同行 `##` 注释。

## 插件设置

*此插件暂无配置项——后续版本会增加。*

| 设置项 | 类型 | 默认值 | 说明 |
|-------|------|--------|------|
| *（暂无，后续版本加入）* | | | |

## 环境要求

- VSCode 1.85.0 或更高版本
- `make` 命令可在 `$PATH` 中找到

## 已知问题

- 超大型工作区（1000+ Makefiles）首次扫描可能有轻微延迟
- 名称包含复杂变量展开的 targets 可能无法识别

完整列表见 [GitHub Issues](https://github.com/dong4j/vscode-makefile-explorer/issues)。

## 更新日志

### 0.3.0

- 双击执行 target（防误触）
- 内联图标一键跳转定义
- GitHub Actions CI + Marketplace 自动发布
- 中文文档（README-ZH.md）
- `make release` 自动化发布流程

---

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 监听模式（文件变化自动编译）
npm run watch

# 打包 .vsix
npm run package
```

在 VSCode 中按 **F5** 启动 Extension Development Host 调试。

### 项目结构

```
src/
├── extension.ts              # 入口：TreeView + 命令注册
├── MakefileTreeProvider.ts   # TreeDataProvider：扫描 + 构建树
├── TargetParser.ts           # Makefile 解析器：提取 targets
└── types.ts                  # 类型定义
```

## 参与贡献

欢迎贡献！请参考 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

MIT — 详见 [LICENSE](LICENSE)。

---

**喜欢这个插件？** ⭐ Star 一下，让更多人看到！
