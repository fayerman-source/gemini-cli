# Claude AI Assistant Guide for Gemini CLI

Gemini CLI is an open-source AI agent that brings Google Gemini directly into the terminal. It is a terminal-first, extensible tool for developers.

## Project Overview

- **Repository**: `google-gemini/gemini-cli`
- **License**: Apache 2.0
- **Runtime**: Node.js (>=20.0.0, recommended ~20.19.0 for development)
- **Language**: TypeScript
- **UI Framework**: React with [Ink](https://github.com/vadimdemedes/ink) for terminal rendering
- **Testing**: Vitest
- **Bundling**: esbuild
- **Linting/Formatting**: ESLint, Prettier

## Architecture

Monorepo structure using npm workspaces with two main packages:

### packages/cli (`@google/gemini-cli`)
User-facing terminal UI. Handles:
- Input processing and display rendering
- Theme and UI customization using React/Ink components
- CLI configuration settings
- History management

Key directories:
- `src/ui/` - React components, hooks, themes, contexts
- `src/commands/` - CLI command implementations (extensions, hooks, mcp, skills)
- `src/config/` - Configuration and key bindings

### packages/core (`@google/gemini-cli-core`)
Backend logic. Handles:
- Gemini API orchestration via `@google/genai`
- Prompt construction and management
- Tool registration and execution
- MCP (Model Context Protocol) client
- Session state management

Key directories:
- `src/tools/` - Built-in tools (edit, glob, grep, shell, read-file, write-file, web-fetch, web-search, memory, etc.)
- `src/mcp/` - MCP client implementation
- `src/skills/` - Skills system including builtin skill-creator
- `src/routing/` - Model routing logic
- `src/policy/` - Policy engine
- `src/hooks/` - Hooks system

### Other packages
- `packages/a2a-server` - Experimental Agent-to-Agent server
- `packages/vscode-ide-companion` - VS Code extension
- `packages/test-utils` - Testing utilities for file system operations

## Building and Running

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Build packages, sandbox, and VS Code companion
npm run build:all

# Run in development
npm run start

# Run in debug mode (enables Node.js inspector)
npm run debug

# Bundle project
npm run bundle

# Clean artifacts
npm run clean
```

## Testing

```bash
# Run all unit tests
npm run test

# Run workspace-specific tests
npm test -w @google/gemini-cli-core -- src/routing/modelRouterService.test.ts

# Run integration/E2E tests (requires bundle first)
npm run bundle
npm run test:e2e

# Run integration tests with specific sandbox mode
npm run test:integration:sandbox:none
npm run test:integration:sandbox:docker
npm run test:integration:sandbox:podman

# Type checking
npm run typecheck

# Full validation (run before PRs)
npm run preflight
```

### Testing Conventions

- Use Vitest for all tests
- For environment variables: use `vi.stubEnv('NAME', 'value')` in `beforeEach` and `vi.unstubAllEnvs()` in `afterEach`
- CLI tests: use `renderWithProviders` and `waitFor` from `packages/cli/src/test-utils/`
- Use `toMatchSnapshot()` for Ink output verification
- Use mocks sparingly

## Code Quality

```bash
# Lint
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Format code
npm run format

# Full preflight check (recommended before PRs)
npm run preflight
```

## Development Conventions

### Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat(cli): Add --json flag to 'config get' command`
- `fix(core): Handle null response from API`
- `docs: Update authentication guide`

### Code Style

**General:**
- Use ES6 imports (avoid `require()`)
- Throw `Error` objects, not string literals
- Use `node:` protocol for Node.js built-in imports
- No `console.log` in production code (enforced by ESLint)
- Prefer `const` with destructuring
- Use arrow functions for callbacks

**TypeScript:**
- Enable strict mode
- No `any` types (`@typescript-eslint/no-explicit-any`)
- Use `as` for type assertions
- Use consistent type imports (`import type { ... }`)
- Handle all promises (no floating promises)

**Imports:**
- Use relative imports within a package
- Use package imports (`@google/gemini-cli-core`) between packages
- Don't import from `node:os` homedir/tmpdir - use helpers from `@google/gemini-cli-core`

**React/Ink (CLI UI):**
- Use reducers for complex state transitions
- Fix react-hooks/exhaustive-deps lint errors by adding missing dependencies
- Define keyboard shortcuts only in `packages/cli/src/config/keyBindings.ts`

### File Headers
All source files require this license header:
```typescript
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
```

## Pull Request Guidelines

1. Link to an existing issue
2. Keep PRs small and focused (one bug fix or one feature)
3. Use draft PRs for work in progress
4. Run `npm run preflight` before submitting
5. Update documentation if introducing user-facing changes
6. Sign the Google CLA

## Key Files and Locations

| Purpose | Location |
|---------|----------|
| Root package.json | `/package.json` |
| ESLint config | `/eslint.config.js` |
| TypeScript config | `/tsconfig.json` |
| Prettier config | `/.prettierrc.json` |
| Build scripts | `/scripts/` |
| Integration tests | `/integration-tests/` |
| Documentation | `/docs/` |
| CLI entry point | `packages/cli/src/index.ts` |
| Core entry point | `packages/core/src/index.ts` |
| Tool implementations | `packages/core/src/tools/` |
| UI components | `packages/cli/src/ui/components/` |

## Documentation

- Located in `/docs/` directory
- Use the `docs-writer` skill when writing/editing documentation
- Follow [Google Developer Documentation Style Guide](https://developers.google.com/style)
- Update `docs/sidebar.json` when adding new documentation

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | API key for Gemini |
| `GOOGLE_CLOUD_PROJECT` | Google Cloud project ID |
| `GEMINI_SANDBOX` | Sandbox mode (true/docker/podman) |
| `GEMINI_DEV_TRACING` | Enable development tracing |
| `DEBUG` | Enable debug mode |
| `DEV` | Development mode for React DevTools |

## Debugging

```bash
# VS Code debugging - use F5 or:
npm run debug

# Hit breakpoints inside sandbox container:
DEBUG=1 gemini

# React DevTools (requires react-devtools@4.28.5):
DEV=true npm start
npx react-devtools@4.28.5
```

## Sandboxing

- **macOS**: Uses Seatbelt (`sandbox-exec`) with configurable profiles
- **All platforms**: Container-based sandboxing with Docker or Podman
- Set `GEMINI_SANDBOX=true|docker|podman` to enable
- Build sandbox with `npm run build:all`

## Tools Available in Core

The model can use these built-in tools:
- `edit` - File editing with search/replace
- `glob` - File pattern matching
- `grep` / `ripGrep` - Content search
- `read-file` / `read-many-files` - File reading
- `write-file` - File writing
- `shell` - Shell command execution
- `ls` - Directory listing
- `web-fetch` - HTTP requests
- `web-search` - Web search
- `memoryTool` - Session memory
- `write-todos` - Todo list management
- `ask-user` - User interaction
- `mcp-tool` - MCP server integration
- `activate-skill` - Skill activation

## MCP Integration

MCP servers extend Gemini CLI with custom tools. Configure in `~/.gemini/settings.json`.

## Skills System

Skills provide specialized behaviors. Located in:
- Built-in: `packages/core/src/skills/builtin/`
- Project-specific: `.gemini/skills/`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes in `packages/`
4. Run `npm run preflight`
5. Open a pull request linked to an issue

For more details, see [CONTRIBUTING.md](./CONTRIBUTING.md).
