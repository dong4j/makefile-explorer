# Makefile Explorer

[![Version](https://img.shields.io/badge/version-0.3.0-blue)](https://github.com/dong4j/vscode-makefile-explorer)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![VSCode](https://img.shields.io/badge/vscode-%5E1.85.0-007ACC)](https://code.visualstudio.com/)
[![中文文档](https://img.shields.io/badge/文档-中文-red)](README-ZH.md)

**Browse and run Makefile targets in a tree view** — like NPM Scripts, but for Make. No more scrolling through massive Makefiles hunting for the right target.

![20260615201224_q7Bokpeb](./banner.webp)

## Why?

When your Makefile grows to 50+ targets, finding the right one in a flat text file is painful. Makefile Explorer treats every Makefile like a folder of executable commands:

- **Expand** a Makefile node → see all targets at a glance
- **Double-click** a target → runs `make <target>` in a dedicated terminal (each run gets its own terminal to avoid command conflicts)
- **Click the 📎 icon** or **right-click** → jumps straight to the definition line

Built for the monorepo reality: multiple Makefiles, nested directories, dozens of targets — all organized in one tree.

## Features

- **🌲 Tree View** — Targets grouped by Makefile in the Explorer sidebar
- **▶ Double-Click Execute** — Double-click any target to run it in a dedicated terminal (each execution creates a fresh terminal, avoiding conflicts with running commands)
- **🔍 Jump to Definition** — Click the inline icon or right-click → "Go to Target Definition"
- **📝 Description Support** — Extracts `##` comments (above-target and inline) as descriptions
- **🔄 Auto-Refresh** — Watches for file changes; tree stays in sync
- **🛡️ Smart Filtering** — Skips `.PHONY`, variable assignments, and empty targets
- **🚫 Dependency-Aware** — Excludes `node_modules/`, `vendor/`, `.build/`, and other third-party dirs
- **📦 Multi-Makefile** — Finds `Makefile`, `makefile`, `GNUmakefile`, `*.mk`, and `Makefile.*`

## Usage

1. Open a project that contains Makefiles
2. Click the **"Make Targets"** view in the Explorer sidebar
3. Expand a Makefile node to see its targets
4. **Double-click** a target → executes `make <target>` in a dedicated terminal (each target gets its own terminal tab named `Make - <target>`)
5. **Click the 📎 icon** or **right-click** → "Go to Definition" → opens the Makefile at the target's line

### Target comments

Targets can have descriptions extracted from comments:

```makefile
# Build the project binary
# Uses release flags for optimization
build:
	cargo build --release

test: ## Run the full test suite
	cargo test
```

Above-target comments take priority over inline `##` comments.

## Extension Settings

*This extension contributes the following settings:*

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| *(none yet — future release)* | | | |

## Requirements

- VSCode 1.85.0 or later
- `make` available in your `$PATH`

## Known Issues

- Very large workspaces (1000+ Makefiles) may have a slight delay on first scan
- Targets with complex variable expansions in their names may not be detected

See the [GitHub issues](https://github.com/dong4j/vscode-makefile-explorer/issues) for the full list.

## Release Notes

### 0.3.0

- Double-click to execute targets (prevents accidental triggers)
- Inline icon button for quick jump-to-definition
- GitHub Actions CI + auto-release to Marketplace
- Chinese README (`README-ZH.md`)
- Automated release flow via `make release`

---

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode (auto-recompile on changes)
npm run watch

# Package for distribution
npm run package
```

Press **F5** in VSCode to launch the Extension Development Host for debugging.

### Project Structure

```
src/
├── extension.ts              # Entry point: TreeView + command registration
├── MakefileTreeProvider.ts   # TreeDataProvider: scan + build tree
├── TargetParser.ts           # Makefile parser: extract targets
└── types.ts                  # Type definitions
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT — see [LICENSE](LICENSE) for details.

---

**Enjoy!** ⭐ this repo if you find it useful.
