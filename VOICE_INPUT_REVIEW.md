# Voice Input Feature - Code Review

**Branch**: `feat/voice-input`
**Commit**: `3d1d925fe3ce4470db10011cb54662062e032b1e`
**Author**: Eli Fayerman
**Date**: 2026-02-01

This document outlines issues that must be addressed before the voice input feature can be merged into the main repository. Reference: `CONTRIBUTING.md`

---

## Issue 1: Key Binding Conflict (Breaking Change)

**Severity**: High
**Files affected**: `packages/cli/src/config/keyBindings.ts`

### Problem

The `Alt+V` key binding was removed from `PASTE_CLIPBOARD` command to be used for `VOICE_INPUT`. This is a breaking change that affects existing users who rely on `Alt+V` for pasting.

### Current state (feat/voice-input)

```typescript
[Command.PASTE_CLIPBOARD]: [
  { key: 'v', ctrl: true },
  { key: 'v', cmd: true },
  // Alt+V removed - was here previously
],

[Command.VOICE_INPUT]: [
  { key: 'v', alt: true },
  { key: 'q', ctrl: true },
],
```

### Required action

Choose one of the following approaches:

1. **Option A**: Use a different key binding for voice input (e.g., `Alt+R` for "record", `Ctrl+Shift+V`)
2. **Option B**: Keep `Alt+V` for voice but document as breaking change in changelog
3. **Option C**: Make voice input key configurable via settings with a non-conflicting default

### Reference

- `CONTRIBUTING.md` line 114: "Don't: Bundle multiple unrelated changes"
- The key binding change should be discussed in a linked issue

---

## Issue 2: Import Violation - node:os tmpdir

**Severity**: High
**File**: `packages/cli/src/ui/hooks/useVoiceInput.ts:12`

### Problem

```typescript
import { tmpdir } from 'node:os';
```

This violates the project's import conventions.

### Required action

Replace with the core package helper:

```typescript
import { tmpdir } from '@google/gemini-cli-core';
```

### Reference

- `CLAUDE.md` (Imports section): "Don't import from `node:os` homedir/tmpdir - use helpers from `@google/gemini-cli-core`"
- Helper location: `packages/core/src/utils/paths.ts:40-42`

---

## Issue 3: Missing Documentation

**Severity**: High
**Files to create/update**:
- `docs/cli/keyboard-shortcuts.md`
- `docs/cli/settings.md`
- `docs/sidebar.json` (if new page added)

### Problem

The feature introduces user-facing changes without corresponding documentation updates.

### Required actions

#### 3a. Update `docs/cli/keyboard-shortcuts.md`

Add a new section for Voice Input:

```markdown
#### Voice Input

| Action                     | Keys                    |
| -------------------------- | ----------------------- |
| Toggle voice recording.    | `Alt + V`<br />`Ctrl + Q` |
```

If `Alt+V` is removed from paste, update the Text Input section (line 95):

```markdown
| Paste from the clipboard. | `Ctrl + V`<br />`Cmd + V` |
```

#### 3b. Update `docs/cli/settings.md`

Document the new `voice.whisperPath` setting:

```markdown
### Voice Input

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `voice.whisperPath` | string | undefined | Path to the whisper executable for speech-to-text transcription. |
```

#### 3c. Consider adding `docs/cli/voice-input.md`

A dedicated page explaining:
- Prerequisites (sox/arecord, whisper installation)
- Supported platforms
- Configuration options
- Troubleshooting

### Reference

- `CONTRIBUTING.md` lines 132-139: "If your PR introduces a user-facing change... you must also update the relevant documentation"

---

## Issue 4: Missing Issue Linkage

**Severity**: High

### Problem

No GitHub issue is linked to this feature. Per contribution guidelines, all PRs must reference an existing issue.

### Required action

1. Create a GitHub issue describing the voice input feature request
2. Wait for maintainer approval (look for `help-wanted` label)
3. Reference the issue in the PR description using `Fixes #XXX` or `Closes #XXX`

### Reference

- `CONTRIBUTING.md` lines 92-106: "All PRs should be linked to an existing issue"

---

## Issue 5: Test Coverage Gaps

**Severity**: Medium
**Files affected**:
- `packages/cli/src/ui/contexts/VoiceContext.tsx` (no tests)
- `packages/cli/src/ui/hooks/useVoiceInput.test.ts` (has `any` types)

### Problem

#### 5a. Missing VoiceContext tests

`VoiceContext.tsx` has no corresponding test file. The context throws an error if used outside a provider, which should be tested.

#### 5b. eslint-disable comments for `any` types

The test file contains multiple suppressions:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(mockProcess as any).kill = vi.fn();
```

### Required actions

1. Create `packages/cli/src/ui/contexts/VoiceContext.test.tsx` with tests for:
   - Context provider functionality
   - Error thrown when used outside provider

2. Replace `any` type assertions with proper types:

```typescript
interface MockProcess extends EventEmitter {
  kill: ReturnType<typeof vi.fn>;
  pid: number;
}
const mockProcess = new EventEmitter() as MockProcess;
mockProcess.kill = vi.fn();
mockProcess.pid = 123;
```

### Reference

- `CLAUDE.md` (TypeScript section): "No `any` types (`@typescript-eslint/no-explicit-any`)"

---

## Issue 6: Preflight Verification

**Severity**: Medium

### Problem

It's unclear if `npm run preflight` passes with these changes. The keyboard shortcuts documentation is auto-generated (see `<!-- KEYBINDINGS-AUTOGEN:START -->` markers), and the generation script may need to be run.

### Required action

1. Run `npm run preflight` from repository root
2. If keyboard shortcuts doc generation fails, run: `npm run docs:keybindings`
3. Fix any lint, type, or test failures

### Reference

- `CONTRIBUTING.md` lines 126-130: "Before submitting your PR, ensure that all automated checks are passing"

---

## Files Changed Summary

| File | Lines | Status |
|------|-------|--------|
| `packages/cli/src/config/keyBindings.ts` | +13/-1 | Has Issue #1 |
| `packages/cli/src/config/settingsSchema.ts` | +21 | Needs docs (Issue #3) |
| `packages/cli/src/services/BuiltinCommandLoader.ts` | +2 | OK |
| `packages/cli/src/ui/AppContainer.tsx` | +18/-1 | OK |
| `packages/cli/src/ui/commands/types.ts` | +1 | OK |
| `packages/cli/src/ui/commands/voiceCommand.ts` | +17 | OK |
| `packages/cli/src/ui/components/InputPrompt.tsx` | +59/-1 | OK |
| `packages/cli/src/ui/contexts/VoiceContext.tsx` | +18 | Needs tests (Issue #5a) |
| `packages/cli/src/ui/hooks/slashCommandProcessor.test.tsx` | +1 | OK |
| `packages/cli/src/ui/hooks/slashCommandProcessor.ts` | +2 | OK |
| `packages/cli/src/ui/hooks/useVoiceInput.test.ts` | +141 | Has Issue #5b |
| `packages/cli/src/ui/hooks/useVoiceInput.ts` | +372 | Has Issue #2 |
| `packages/cli/src/ui/keyMatchers.test.ts` | +13/-1 | OK |
| `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts` | +1 | OK |

---

## Checklist for Resolution

- [ ] Resolve key binding conflict (Issue #1)
- [ ] Fix `node:os` import (Issue #2)
- [ ] Update `docs/cli/keyboard-shortcuts.md` (Issue #3a)
- [ ] Update `docs/cli/settings.md` (Issue #3b)
- [ ] Create GitHub issue and link PR (Issue #4)
- [ ] Add VoiceContext tests (Issue #5a)
- [ ] Fix `any` types in tests (Issue #5b)
- [ ] Run `npm run preflight` successfully (Issue #6)
- [ ] Run `npm run docs:keybindings` to regenerate keyboard docs

---

*Document generated: 2026-02-04*
*For use by AI assistants reviewing the feat/voice-input branch*
