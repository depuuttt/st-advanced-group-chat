# Hide Member Tags — Design (short)

Date: 2026-11-26
Status: **Implemented** (commits `af683f9..664b8df` on `dev`; all reviews clean, 154/154 tests passing)
Follow-ups: 2026-11-25-hide-member-avatars-design.md, 2026-11-25-member-list-toolbar-design.md

## Intent

Add a second toggle button, next to the hide-avatars eye toggle in the
member-list toolbar, that collapses the **tag chips** in each group-member
row (each `.group_member`'s `.tags_inline` block inside `#rm_group_members`
/ `.rm_group_members`). Rows keep avatar and name; only the chips go.

## Why

The user already hides avatars to declutter the member list; the per-row tag
chips are the remaining clutter. Tags and avatars are independent, so this
is a separate button with its own per-group state — not wired into the
avatars toggle.

## Goals

- A second toolbar button beside the existing one: click hides every
  member row's tag chips in that group's list; click again restores them.
- Per-group state like avatars: `hideTags[groupId]` (boolean) next to
  `hideAvatars` in this extension's settings; switching groups re-applies
  the right state; popout follows (same CSS-class mechanism).
- The shared parts (toolbar, refresh loop, editor-group tracking) move
  into a common module so the two features reuse one implementation and
  can never fight over the toolbar (today's sync deletes any toolbar not
  in its own WeakSet — two owners would delete each other's).

## Non-goals

- No change to the tag *filter* box above the list (`.rm_tag_controls`) or
  to anything outside the member lists; no per-member tag hiding; no
  chat-behavior changes.
- No behavior change to the existing avatars toggle.

## Constraints

- Hiding stays pure CSS driven by a class on the list container
  (`st-agc-hide-tags` collapsing `.tags_inline`), so SillyTavern's row
  rebuilds cannot undo it.
- Buttons keep the established conventions: `role="button"`,
  `tabindex="0"`, Enter/Space activation, click/key propagation stopped,
  Material Symbols icons (bundled font), `translateText` tooltips.
- All SillyTavern/document access stays lazy and degrades to a
  `[st_advanced_group_chat]`-prefixed `console.warn`.
- Refresh/sync passes must keep the zero-DOM-writes-on-second-pass
  guarantee and the WeakSet live/dead-clone rules (see
  docs/debugging-playbook.md).

## Approaches

- **Extract shared infrastructure into a common module (chosen)**: one
  toolbar owner, one observer/rAF refresh loop, one editor-group tracker;
  the avatars and tags features register their buttons with it. Clean
  base for any future toolbar button; touches tested code, so existing
  tests must keep passing (moved, not weakened).
- Both toggles inside `src/hide-member-avatars.js` — rejected: the user
  chose the refactor; the module would grow into an unmaintainable grab
  bag.
- Fully separate tags module with its own toolbar — rejected: the two
  sync passes would delete each other's toolbars (the fight described
  above).

## Decisions

- New shared module `src/member-list-toolbar.js` owning:
  toolbar find-or-create/remove-dead-clones (shared `liveToolbars`
  WeakSet), insertion before each `.rm_group_members` (sibling, never a
  child), the MutationObserver + rAF coalescing (`mutationsTouchMemberList`
  filter), the `groupSelected` tracking behind `getEditorGroupId`, and a
  registration point where feature modules contribute buttons (ordered,
  each providing its own live-button WeakSet and state).
- `src/hide-member-avatars.js` keeps its toggle logic, state icon/tooltip,
  and the `st-agc-hide-avatars` class application, but sources the toolbar,
  refresh loop, and group tracking from the shared module. `dispose`
  removes only its own button and class.
- New `src/hide-member-tags.js` mirrors that: `getHideTags`/`setHideTags`
  in `src/model-overrides.js`, `st-agc-hide-tags` container class, CSS
  `.rm_group_members.st-agc-hide-tags .tags_inline { display: none; }` in
  `style.css`, registered in `index.js` as its own feature.
- Icons: a tag glyph from Material Symbols for the tags toggle (candidates
  `sell`/`sell_off` or `label`/`label_off`) — exact pair verified against
  the bundled `fonts/material-symbols-rounded.woff2` before styling;
  visibility/visibility_off stays with avatars.
- Button order in the toolbar: avatars first, tags second (stable, reads
  as one cluster).

## Left to the builder

- Exact shape of the registration API and how dispose detaches a
  contributor (keep features independently disposable; re-registering
  after re-init must not duplicate buttons).
- Exact glyphs, CSS sizing, and any test-helper additions for the shared
  module; new tests for the tags toggle mirroring the avatars suite, plus
  shared-module tests (toolbar shared by both buttons, second-sync zero
  writes, dispose of one feature leaves the other working).
- README update in the same commit (enforced by test/readme.test.js).

## Verification

- `npm test`: existing avatars/model-button suites pass against the
  refactored modules; new tags suite mirrors the avatars one (toggle flips
  settings + container class, icon/tooltip swap, rebuild re-applies,
  dispose removes its button/class only).
- Manual check against the local SillyTavern checkout (LOCAL.md): both
  toggles in editor and popout, independent states, reload persists,
  group switching re-applies. Live/headless verification only on explicit
  user go-ahead.
