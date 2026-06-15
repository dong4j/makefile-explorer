## Makefile Explorer — 项目自身的 Makefile
##
## ⚠️ 发布前：手动修改下方的 VERSION，然后执行 `make release`
VERSION := 0.2.0

.PHONY: all install-deps compile watch package install clean release

# ---- 开发 ----

all: install-deps compile ## 安装依赖 + 编译

install-deps: ## 安装 npm 依赖
	npm install

compile: ## 编译 TypeScript
	npm run compile

watch: ## 监听模式（文件变化自动编译）
	npm run watch

# ---- 打包安装 ----

package: compile ## 打包 .vsix
	@npm run package
	@echo ""
	@echo "✅ 打包完成: $$(ls -t *.vsix | head -1)"

install: package ## 打包并安装到本地 VSCode
	@echo "==> 安装到 VSCode..."
	code --install-extension $$(ls -t *.vsix | head -1) --force
	@echo "✅ 安装完成，重启 VSCode 生效"

# ---- 清理 ----

clean: ## 清理编译产物和 .vsix
	rm -rf out/
	rm -f *.vsix
	@echo "✅ 已清理"

# ---- 发布 ----

release: compile ## 发布新版本（自动更新 package.json + 提交 + 打 tag + 推送）
	@echo "==> 📋 发布版本: v$(VERSION)"
	@echo ""
	@echo "==> 检查未提交变更..."
	@test -z "$$(git status --porcelain)" || (echo "❌ 有未提交的变更，请先提交或 stash"; exit 1)
	@echo "==> 更新 package.json 版本号为 $(VERSION)..."
	@node -e "var p=require('./package.json');p.version='$(VERSION)';require('fs').writeFileSync('./package.json',JSON.stringify(p,null,2)+'\n')"
	@echo "==> 提交版本更新..."
	git add package.json
	git commit -m "chore: bump to v$(VERSION)"
	@echo "==> 推送 main 分支..."
	git push origin main
	@echo "==> 创建 tag v$(VERSION) 并推送..."
	git tag v$(VERSION)
	git push origin v$(VERSION)
	@echo ""
	@echo "✅ 发布完成！GitHub Actions 正在自动："
	@echo "   1. 发布到 VSCode Marketplace"
	@echo "   2. 构建 .vsix"
	@echo "   3. 上传到 GitHub Release"
	@echo ""
	@echo "🔗 https://github.com/dong4j/makefile-explorer/releases"
