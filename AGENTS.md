# AGENTS.md

This file provides guidance to OpenAI Codex when working with code in this repository.

## What this is

A work-in-progress SillyTavern UI extension that adds features to group chats. Per-member model selection is the first feature: it lets each member of a group chat use a different language model by rewriting, at request time, only the `model` field of the outgoing **Chat Completion** request — the active provider, endpoint, API key, and all other generation settings are left as SillyTavern built them. New features land as new `src/` modules (see the feature registry below). No build step, no third-party dependencies, no server plugin — plain browser ES modules.

## Commands

- Run all tests: `npm test` (Node's built-in test runner: `node --test`)
- Run a single test file: `node --test test/model-overrides.test.js`
- Run a single test by name: `node --test --test-name-pattern "clears the override" test/`

## Architecture

Entry point is [index.js](index.js) (the `js` referenced by [manifest.json](manifest.json)); all feature code lives in `src/`.

**Feature registry.** Each feature module exports `init`/`dispose` functions and is registered in `index.js` via `registerFeature({ name, init, dispose })`. `onExtensionReady` (wired to SillyTavern's `APP_READY` by `src/extension-lifecycle.js`) runs every `init` exactly once, guards each with try/catch, and `disposeExtension` runs every `dispose` newest-first. New group-chat features should be added as a new `src/` module plus a `registerFeature` call — not by editing existing modules.

**Current features** (one `src/` module each):

- `src/request-routing.js` — the core behavior. Tracks who is speaking via `GROUP_MEMBER_DRAFTED`, then on `CHAT_COMPLETION_SETTINGS_READY` swaps `request.model` only when the request's `char_name` matches the drafted member and a non-empty override exists for that group+member. `GROUP_WRAPPER_FINISHED` resets the speaker. All other requests pass through untouched.
- `src/member-model-button.js` — UI only. Adds a model button to each `.group_member` row in the group editor. SillyTavern rebuilds that list with no event, so a `MutationObserver` (filtered by `mutationsTouchMemberList`, coalesced via `requestAnimationFrame`) re-adds buttons. Buttons stop click propagation so SillyTavern's document-level `.right_menu_button` handlers don't also fire.

**Storage** (`src/model-overrides.js`): overrides live in this extension's own SillyTavern extension settings under `extensionSettings.st_advanced_group_chat.modelOverrides[groupId][avatarId]`. Members are keyed by **avatar ID**, never display name (names can collide within a group). Empty/whitespace values clear the override.

**Error-handling convention:** every entry into SillyTavern APIs (`getContext`, `Popup`, event source, `document`) reads them lazily and degrades to a `console.warn` prefixed `[st_advanced_group_chat]` — the extension must never take the host app down. Preserve this pattern in new code.

## Testing

- `test-helpers/fake-sillytavern.js` provides `createFakeSillyTavern()` — a minimal stand-in for `SillyTavern.getContext()` with `eventSource`, `eventTypes`, `extensionSettings`, `saveSettingsDebounced`, and `Popup.show.input`. Tests install it on `globalThis.SillyTavern` and drive it with `fake.emit('group_member_drafted', 0)` etc.
- Tests re-import modules under fresh query-string URLs (`import(`../index.js?load=${n}`)`) because module state (feature list, observer) persists across imports.
- DOM-dependent code is tested by injecting fake `document`/`MutationObserver` globals.
- `test/readme.test.js` asserts README content: if you change documented behavior or the acceptance checklist, update [README.md](README.md) in the same commit or this suite fails.

## Keep CLAUDE.md and AGENTS.md in sync

This repository has two agent-guidance files with identical bodies: `CLAUDE.md` (Claude Code) and `AGENTS.md` (OpenAI Codex). Only the header differs. **Any change to one must be made to the other in the same commit** — commands, architecture notes, conventions, everything. `test/sync.test.js` fails when the bodies drift, so run `npm test` after editing either file.

## Design docs and SillyTavern reference

`docs/superpowers/` holds specs and implementation plans (per-member models, deferred minors). No SillyTavern reference docs are vendored into this repo: consult the SillyTavern source or its docs on your machine. If a gitignored `LOCAL.md` exists at the repository root, read it first — it points at the local SillyTavern checkout (see [CONTRIBUTING.md](CONTRIBUTING.md) to create your own).