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
├── extension.ts              # Entry point — activation, command registration
├── MakefileTreeProvider.ts   # TreeDataProvider implementation
├── TargetParser.ts           # Makefile parsing logic
└── types.ts                  # Shared type definitions
```

### Architecture

```
extension.ts (activate)
  ├── MakefileTreeProvider (TreeDataProvider)
  │   ├── scans workspace for Makefiles
  │   ├── calls TargetParser for each file
  │   └── builds MakefileNode tree
  ├── commands:
  │   ├── runTarget → creates new `Make - <target>` terminal per execution
  │   ├── goToDefinition → opens file, jumps to line
  │   └── refresh → re-scans workspace
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
