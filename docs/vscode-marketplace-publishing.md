# VSCode 插件上架指南

> 将 Makefile Explorer 发布到 [VSCode Marketplace](https://marketplace.visualstudio.com/) 的完整流程。

---

## 目录

1. [前置准备](#1-前置准备)
2. [本地手动发布](#2-本地手动发布)
3. [GitHub Actions 自动发布](#3-github-actions-自动发布)
4. [版本管理](#4-版本管理)
5. [更新已发布的插件](#5-更新已发布的插件)
6. [常见问题](#6-常见问题)

---

## 1. 前置准备

### 1.1 注册 Azure DevOps 账号

VSCode Marketplace 使用 Azure DevOps 管理发布者身份。

1. 打开 [Azure DevOps](https://dev.azure.com/)
2. 使用 Microsoft 账号登录（没有则注册一个）
3. 进入个人设置 → Personal Access Tokens

### 1.2 创建发布者（Publisher）

发布者是你在 Marketplace 上的身份标识，对应 `package.json` 中的 `publisher` 字段。

1. 打开 [VSCode Marketplace 管理页](https://marketplace.visualstudio.com/manage)
2. 点击 **"Create publisher"**
3. 填写发布者信息：
   - **ID**：与 `package.json` 中的 `publisher` 一致（本项目的 `dong4j`）
   - **Name**：显示名称（随意，如 `dong4j`）
   - **Logo**：可选，上传头像
4. 确认创建

> ⚠️ **发布者 ID 一经创建不可修改**，确保和 `package.json` 的 `publisher` 字段完全一致。

### 1.3 创建 Personal Access Token (PAT)

PAT 用于 `vsce` 命令行工具的身份认证。

1. 打开 [Azure DevOps PAT 页面](https://dev.azure.com/dong4j/_usersSettings/tokens). (必须先创建组织)
2. 点击 **"New Token"**
3. 配置：
   - **Name**：`vscode-marketplace`
   - **Organization**：选择你的组织
   - **Expiration**：建议选 90 天或自定义（到期后需重新生成）
   - **Scopes**：选择 **"Marketplace" → "Manage"**
4. 点击 **"Create"**
5. ⚠️ **立即复制 Token**（关闭页面后无法再查看）

---

## 2. 本地手动发布

### 2.1 安装 vsce

```bash
npm install -g @vscode/vsce
```

### 2.2 登录发布者

```bash
vsce login dong4j
# 粘贴刚才复制的 PAT Token
```

### 2.3 检查插件配置

确保 `package.json` 以下字段齐全：

```json
{
  "name": "makefile-explorer",
  "displayName": "Makefile Explorer",
  "description": "Browse and run Makefile targets in a tree view...",
  "version": "0.1.0",
  "publisher": "dong4j",
  "icon": "icon.png",
  "repository": {
    "type": "git",
    "url": "https://github.com/dong4j/makefile-explorer"
  },
  "categories": ["Programming Languages", "Other"],
  "keywords": ["makefile", "make", "build", "task runner", "targets"],
  "engines": {
    "vscode": "^1.85.0"
  },
  "license": "MIT"
}
```

### 2.4 发布

```bash
# 编译 + 打包
npm run compile

# 发布到 Marketplace（会自动执行 prepublish 脚本）
vsce publish
```

发布后，插件会出现在：
- Marketplace 页面：`https://marketplace.visualstudio.com/items?itemName=dong4j.makefile-explorer`
- VSCode 内搜索：`ext install dong4j.makefile-explorer`

### 2.5 验证

```bash
# 搜索验证
vsce search makefile-explorer
```

---

## 3. GitHub Actions 自动发布

手动发布容易忘步骤，推荐用 CI/CD 自动化。以下 workflow 在推送 tag 时自动发布到 Marketplace。

### 3.1 添加 Marketplace Token 到 GitHub Secrets

1. 打开 GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions**
2. 点击 **"New repository secret"**
3. **Name**：`VSCE_PAT`
4. **Value**：粘贴 Azure DevOps 的 PAT Token

### 3.2 添加发布 workflow

在 `.github/workflows/release.yml` 中追加发布步骤：

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Compile
        run: npm run compile

      - name: Publish to VSCode Marketplace
        run: |
          npm install -g @vscode/vsce
          vsce publish --pat ${{ secrets.VSCE_PAT }}
        # 注意：不加 --pre-release 标志即为正式发布

      - name: Package VSIX
        run: vsce package

      - name: Upload to GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: '*.vsix'
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 3.3 当前项目的 workflow

当前项目的 `.github/workflows/release.yml` 只做了 GitHub Release，尚未加入 Marketplace 发布。要启用自动发布到 Marketplace：

1. 按 [3.1](#31-添加-marketplace-token-到-github-secrets) 添加 Secret
2. 在 `release.yml` 的 `Compile` 和 `Package VSIX` 之间插入 `vsce publish` 步骤

---

## 4. 版本管理

### 4.1 版本号规范

遵循 [SemVer](https://semver.org/)：

| 版本类型 | 示例 | 场景 |
|---------|------|------|
| `major` | `1.0.0` | 不兼容的 API 变更 |
| `minor` | `0.2.0` | 向后兼容的新功能 |
| `patch` | `0.1.1` | 向后兼容的 Bug 修复 |

### 4.2 发布新版本流程

```bash
# 1. 修改 package.json version（如 0.1.0 → 0.2.0）
# 2. 更新 CHANGELOG.md
# 3. 提交并打 tag
git add .
git commit -m "chore: bump to v0.2.0"
git push origin main
git tag v0.2.0
git push origin v0.2.0

# 4. GitHub Actions 自动：
#    - 编译
#    - 发布到 Marketplace
#    - 打包 .vsix
#    - 上传到 GitHub Release
```

### 4.3 预发布版（Pre-release）

如果想先发布测试版：

```bash
# 用 pre-release 语义版本
npm version 0.2.0-beta.1

# 发布时加 --pre-release 标志
vsce publish --pre-release
```

预发布版在 Marketplace 上会显示 "Pre-release" 标签，用户需要显式选择安装。

---

## 5. 更新已发布的插件

### 5.1 更新 README / 元数据（不改版本号）

有些修改不需要发新版（如修 README 错别字），但这些更新**不会自动同步**到 Marketplace——Marketplace 只在发布新版本时更新。

如需仅更新文档而版本号不变，VSCode 官方没有直接支持。通常的做法是：

1. 打一个 patch 版本号走完整发布流程
2. 或者接受 Marketplace 上显示的是上次发布时的 README

推荐做法：**始终打小版本号发布**，CHANGELOG 写好 "文档更新"。

### 5.2 废弃/下架插件

```bash
# 从 Marketplace 移除
vsce unpublish dong4j.makefile-explorer

# 仅废弃（不删除，用户仍然可用但标记为 deprecated）
vsce unpublish dong4j.makefile-explorer --deprecate
```

---

## 6. 常见问题

### Q: `vsce publish` 报 "401 Unauthorized"

**原因**：PAT Token 过期或 scope 不对。

**解决**：
1. 重新生成 PAT（确保 scope 勾选了 Marketplace → Manage）
2. 重新 `vsce login dong4j`

### Q: 提示 "Extension not found" 或 "Access Denied"

**原因**：`publisher` 字段与 Marketplace 的 publisher ID 不匹配。

**解决**：检查 `package.json` 的 `publisher` 是否和 [Marketplace 管理页](https://marketplace.visualstudio.com/manage) 上显示的完全一致（区分大小写）。

### Q: 图标不显示

**检查**：
- `icon.png` 必须是 128×128 像素
- `package.json` 中有 `"icon": "icon.png"`
- 文件被包含在 `.vsix` 中（`vsce ls` 可查看打包内容）

### Q: README 中的图片不显示

Marketplace 支持相对路径图片，但要求：
- 图片文件在 `.vsix` 包内（不能被 `.vscodeignore` 排除）
- 使用相对路径引用（如 `./banner.webp`）
- 图片大小推荐不超过 1MB

### Q: 发布后 VSCode 内搜不到

- 新发布通常需要 **5-10 分钟**才能被索引
- 用 `vsce search makefile-explorer` 验证是否发布成功
- 或直接访问 `https://marketplace.visualstudio.com/items?itemName=dong4j.makefile-explorer`

---

## 参考链接

- [VSCode Extension API — Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [VSCode Marketplace — 管理后台](https://marketplace.visualstudio.com/manage)
- [Azure DevOps — PAT 管理](https://dev.azure.com/)
- [vsce 命令行工具](https://github.com/microsoft/vscode-vsce)
- [SemVer 规范](https://semver.org/)
