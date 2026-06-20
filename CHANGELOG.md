# Changelog

All notable changes to the "vscode-makefile-explorer" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-06-21

### Added

- **Copy Make Command** — right-click on any target and choose "Copy Make Command" to copy a terminal-ready command (`cd "dir" && make -f Makefile <target>`) to the clipboard

## [0.5.0] - 2026-06-18

### Added

- **Running status indicator** — status bar shows `$(sync~spin)` while a Make task runs, `$(check)` on completion (auto-hides after 3s)
- **Target dependency display** — expand a target node to see its dependencies (extracted from `target: dep1 dep2`); dependency nodes are informational leaf items
- **make availability check** — on activation, verifies `make` is in PATH and shows a warning with GNU Make install link if not found
- **Task grouped by Makefile** — in the "Tasks: Run Task" command palette, tasks are now grouped by their source Makefile path (e.g. `docker/Makefile`) instead of a flat list

### Changed

- **Task presentation options** — each task now uses `Dedicated` terminal panel (different targets don't share a terminal), `echo: false` for cleaner output, and `focus: true` to auto-switch focus on execution

## [0.4.0] - 2026-06-17

### Changed

- **Task API execution** — double-click now runs targets via `vscode.tasks.executeTask` instead of raw terminal `sendText`
- **Dedicated terminal per execution** — each double-click creates a fresh `Make - <target>` terminal instead of reusing a single "Make" terminal, preventing commands from being typed into a busy terminal's stdin

### Fixed

- Register `makefile-explorer` `TaskProvider` and `taskDefinitions` so custom task type no longer logs「不存在已注册的任务类型」

## [0.3.0] - 2026-06-16

### Changed

- **Double-click to execute** — targets now require a double-click to run, preventing accidental triggers from single clicks

### Fixed

- Makefile `release` target no longer blocks on VERSION edits (removed overzealous pre-check)

## [0.2.0] - 2026-06-15

### Added

- **Inline "Go to Definition" button** — each target now has a clickable icon to jump directly to its definition line
- **Chinese README** (`README-ZH.md`) with language badge on main README
- **GitHub Actions CI** — compile check on every push and PR
- **GitHub Actions Release** — auto-publish to VSCode Marketplace + GitHub Release on tag push
- **Makefile** with `VERSION` variable — `make release` automates version bump, commit, tag, and push
- **Marketplace publishing guide** (`docs/vscode-marketplace-publishing.md`)
- Extension icon

### Changed

- Right-click menu now only shows "Go to Definition" (inline button replaces the old inline run button)
- Updated `package.json` description, categories, and keywords for Marketplace

## [0.1.0] - 2026-06-15

### Added

- Initial release
- Tree view in Explorer sidebar displaying Makefile targets
- Auto-discovery of Makefiles in workspace (`Makefile`, `makefile`, `GNUmakefile`, `*.mk`, `Makefile.*`)
- One-click target execution in terminal (`cd <dir> && make -f <file> <target>`)
- Right-click "Go to Target Definition" to jump to the exact line in the Makefile
- Description extraction from `##` comments (above-target and inline)
- File watcher for automatic tree refresh on Makefile changes
- Exclusion of common third-party dependency directories (`node_modules`, `vendor`, `.build`, `Pods`, `Carthage`, etc.)
- Smart target filtering (skips `.PHONY`, variable assignments, empty targets)
- Dedicated "Make" terminal (reuses existing terminal to avoid tab spam)

[0.6.0]: https://github.com/dong4j/vscode-makefile-explorer/releases/tag/v0.6.0
[0.5.0]: https://github.com/dong4j/vscode-makefile-explorer/releases/tag/v0.5.0
[0.4.0]: https://github.com/dong4j/vscode-makefile-explorer/releases/tag/v0.4.0
[0.3.0]: https://github.com/dong4j/vscode-makefile-explorer/releases/tag/v0.3.0
[0.2.0]: https://github.com/dong4j/vscode-makefile-explorer/releases/tag/v0.2.0
[0.1.0]: https://github.com/dong4j/vscode-makefile-explorer/releases/tag/v0.1.0
