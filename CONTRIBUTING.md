# Contributing to Advanced Group Chat

Thank you for your interest in contributing! This extension is plain browser ES modules — no build step, no third-party dependencies, no server plugin.

## Getting started

1. Fork and clone this repository.
2. Point SillyTavern at your clone, or clone it directly into SillyTavern's extension folder (see below).
3. Run the tests: `npm test` (Node's built-in test runner — no dependencies to install).

## Reading SillyTavern's source and docs

This repository does **not** vendor SillyTavern's documentation. When you change how this extension uses a SillyTavern event or API, consult the SillyTavern source in **your local SillyTavern checkout** (upstream repo: https://github.com/SillyTavern/SillyTavern) and the SillyTavern documentation in **your local clone of the docs repository** (upstream repo: https://github.com/SillyTavern/SillyTavern-Docs).

### Tell your AI agent where SillyTavern lives: `LOCAL.md`

If you develop with an AI coding agent (Claude Code, Codex, or any other), give it the paths to your local SillyTavern checkout and docs repository via a **`LOCAL.md` file in the repository root**:

1. Create `LOCAL.md` in the repository root (it is gitignored — never commit it).
2. Replace the placeholders below with the path to your local SillyTavern checkout and to your local clone of the docs repository. If an AI agent is helping you set up this file for the first time and you have not provided the paths, the agent should ask you where your SillyTavern checkout and docs clone are before filling it in. Do not leave the placeholders in place when asking the agent to inspect SillyTavern source or docs. Example:

   ```markdown
   # Local notes (not committed)

   ## Local SillyTavern checkout

   `<PATH_TO_YOUR_SILLYTAVERN_CHECKOUT>`

   Useful spots when checking SillyTavern's actual behavior:

   - `public/script.js` — the client entry: `eventSource`, `eventTypes`, `getContext()` (the `SillyTavern.getContext()` this extension calls), and the extension-settings save path.
   - `public/scripts/extensions.js` — how third-party extensions are discovered, loaded, enabled/disabled (`manifest.json`), and how `data/extensions/<folder>` is served.
   - `data/default-user/settings.json` — the persisted settings that hold `extensionSettings` (`st_advanced_group_chat` lives there).
   - After installing this extension via SillyTavern's "Install extension", the copy lands in `data/default-user/extensions/st-advanced-group-chat`.

   ## Local SillyTavern docs repository

   `<PATH_TO_YOUR_SILLYTAVERN_DOCS_CLONE>`

   Upstream repo: https://github.com/SillyTavern/SillyTavern-Docs — the Markdown source of docs.sillytavern.app. The folder layout mirrors the docs site's sidebar; search it the same way you would search the site.
   ```

3. Check that `.gitignore` ignores `LOCAL.md`. This repository's `.gitignore` already does; keep it that way if you fork.

The committed guidance files (`CLAUDE.md`, `AGENTS.md`) instruct every agent to read `LOCAL.md` at the start of a session, so the paths are available to whichever tool you use without ever being committed.

## Where extensions live on disk

SillyTavern loads third-party extensions from `<SillyTavern>/data/<user>/extensions/<folder>`. To develop against your clone:

- Install this repository via SillyTavern's **Install extension** using your fork's git URL, then edit files under `data/<user>/extensions/st-advanced-group-chat`, or
- symlink that folder to your clone (advanced).

## Code conventions

- New group-chat features land as a new `src/` module plus a `registerFeature` call in `index.js` — not by editing existing modules. See `CLAUDE.md` for the architecture.
- In observer-driven refresh/sync passes, guard every DOM write (write only when the value changed) and reuse listener-bound elements instead of re-creating them — see `docs/debugging-playbook.md` for why, and the "zero DOM writes on a second pass" test each such pass needs.
- Every entry into SillyTavern APIs (`getContext`, `Popup`, event source, `document`) reads them lazily and degrades to a `console.warn` prefixed `[st_advanced_group_chat]` — the extension must never take the host app down.
- `CLAUDE.md` and `AGENTS.md` have identical bodies (only the header differs). Any change to one must be made to the other in the same commit; `test/sync.test.js` fails when they drift.
- If you change documented user-facing behavior, update `README.md` in the same commit or `test/readme.test.js` fails.

## Pull requests

1. Make your change with tests (`node --test`).
2. Run `npm test` — all tests must pass.
3. Commit with a clear message and open a pull request.
