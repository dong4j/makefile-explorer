## Makefile Explorer — 项目自身的 Makefile
##
## ⚠️ 发布前：手动修改下方的 VERSION，然后执行 `make release`
VERSION := 0.6.0

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

release: compile ## 发布新版本（⚠️ 先更新 CHANGELOG.md，再修改 VERSION，最后执行）
	@echo "==> 📋 发布版本: v$(VERSION)"
	@echo ""
	@echo "⚠️  确认 CHANGELOG.md 已更新？(Ctrl-C 取消，回车继续)"
	@read _
	@echo "==> 更新 package.json 版本号为 $(VERSION)..."
	@node -e "var p=require('./package.json');p.version='$(VERSION)';require('fs').writeFileSync('./package.json',JSON.stringify(p,null,2)+'\n')"
	@echo "==> 更新 README 版本徽章为 $(VERSION)..."
	@sed -i '' 's|version-[0-9]\.[0-9]\.[0-9]*-blue|version-$(VERSION)-blue|g' README.md README-ZH.md
	@echo "==> 暂存版本文件..."
	git add Makefile package.json CHANGELOG.md README.md README-ZH.md
	@if git diff --cached --quiet; then \
		echo "     (无待提交内容，跳过 commit)"; \
	else \
		echo "==> 提交版本更新..."; \
		git commit -m "chore: bump to v$(VERSION)"; \
	fi
	@CURRENT_BRANCH=$$(git branch --show-current); \
	if [ "$$CURRENT_BRANCH" != "main" ]; then \
		echo "⚠️  当前在 $$CURRENT_BRANCH 分支，release 将推送 main。Ctrl-C 取消，回车继续..."; \
		read _; \
	fi
	@echo "==> 推送 main 分支..."
	git push origin main
	@echo "==> 在 main 分支 HEAD 创建 tag v$(VERSION) 并推送..."
	git tag v$(VERSION) main
	git push origin v$(VERSION)
	@echo ""
	@echo "✅ 发布完成！GitHub Actions 正在自动："
	@echo "   1. 发布到 VSCode Marketplace"
	@echo "   2. 构建 .vsix"
	@echo "   3. 上传到 GitHub Release"
	@echo ""
	@echo "🔗 https://github.com/dong4j/vscode-makefile-explorer/releases"
