# Contributing to Makefile Explorer

Thanks for your interest in contributing! 🎉

## Getting Started

1. **Fork** the repo and clone it locally
2. Run `npm install` to install dependencies
3. Run `npm run compile` to build
4. Press **F5** in VSCode to open the Extension Development Host

## Development Workflow

```bash
# Watch mode — auto-recompile on changes
npm run watch

# Compile once
npm run compile

# Package .vsix for local testing
npm run package
```

### Project Structure

```
src/
├── extension.ts              # Entry point — activation, command registration, status bar
├── MakefileTreeProvider.ts   # TreeDataProvider: scan workspace + build tree (with deps)
├── MakefileTaskProvider.ts   # Task API: create tasks + register TaskProvider
├── TargetParser.ts           # Makefile parsing: extract targets + dependencies
└── types.ts                  # Shared type definitions (Target, NodeType, MakefileNode)
```

### Architecture

```
extension.ts (activate)
  ├── MakefileTreeProvider (TreeDataProvider)
  │   ├── scans workspace for Makefiles
  │   ├── calls TargetParser for each file
  │   └── builds MakefileNode tree (targets + dependency nodes)
  ├── MakefileTaskProvider (TaskProvider)
  │   ├── createMakeTask → builds vscode.Task with ShellExecution
  │   ├── registerMakefileTaskProvider → custom task type
  │   └── collectMakeTasks → provides tasks for "Run Task" palette
  ├── commands:
  │   ├── handleTargetClick → double-click → executeTask
  │   ├── runTarget → direct execution (no double-click)
  │   ├── goToDefinition → opens file, jumps to line
  │   ├── copyMakeCommand → copies terminal-ready command to clipboard
  │   └── refresh → re-scans workspace
  ├── status bar: task start/end events → running/complete indicator
  ├── make availability check: warns if make not in PATH
  └── file watcher → auto-refresh on changes
```

## Making Changes

1. Create a branch: `git checkout -b feat/my-feature`
2. Make your changes
3. Run `npm run compile` and verify no errors
4. Test manually by pressing F5
5. Commit following [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` — new feature
   - `fix:` — bug fix
   - `docs:` — documentation
   - `chore:` — maintenance
6. Push and open a Pull Request

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Update `CHANGELOG.md` under the `[Unreleased]` section
- If adding a new feature, update `README.md` accordingly
- Make sure the extension still compiles: `npm run compile`

## Reporting Bugs

Please use the [Bug Report](https://github.com/dong4j/vscode-makefile-explorer/issues/new?template=bug_report.md) template and include:

- VSCode version
- Extension version
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

## Feature Requests

Use the [Feature Request](https://github.com/dong4j/vscode-makefile-explorer/issues/new?template=feature_request.md) template. Describe the use case and why the feature would be valuable.

## Code Style

- TypeScript with strict mode
- 2-space indentation
- Comments for non-obvious logic (why, not what)
- Keep it simple — no over-engineering

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
