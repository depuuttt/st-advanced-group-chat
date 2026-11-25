# Hide Member Avatars — Design

Date: 2026-11-25

## Intent

Let the user collapse the avatar images in a group chat's member list (the
"Current Members" section of the group editor, and its popout) with one
toggle per group — the rows become a plain text list of names.

## Why

The user finds a list of avatar images visually noisy and the member rows
cramped; per-row extra buttons would make that worse. One toggle for the
whole group hides all images at once without adding anything to the rows
themselves.

## Goals

- One toggle button under the member-list pagination bar ("Current Members").
- Clicking it hides **every** `.avatar` image in that group's member list;
  clicking again restores them. The image disappears completely (no
  placeholder); rows get narrower, names stay.
- The setting is **per group**: `extensionSettings.st_advanced_group_chat.hideAvatars[groupId] = true`,
  next to the existing `modelOverrides`. Switching groups re-applies the
  right state.
- The popout member list (same `.rm_group_members` markup rendered into
  `#dialog_popup` by SillyTavern's popout) follows the same state, since the
  CSS class is applied to every `.rm_group_members` list.

## Non-goals

- No change to chat behavior: hidden avatars are purely cosmetic; members
  still reply exactly as before.
- No per-member hiding, no placeholder images, no changes outside the
  member lists (not the "Add Members" candidates list, not the chat itself).
- No visual blurring — the image is `display: none`, not obscured.

## Constraints

- SillyTavern rebuilds the member rows at any time with no event; anything
  attached per-row would be lost. Hiding must therefore be **pure CSS**
  driven by a class on the list container (`.rm_group_members`), which the
  existing MutationObserver refresh pass re-applies to rebuilt containers.
- The button sits under `#rm_group_members_pagination`, which the pagination
  plugin does not rebuild, so the button persists once inserted; a
  re-insert guard handles the popout and any re-render of the container.
- Icons are Material Symbols Rounded (bundled font, `visibility` /
  `visibility_off` ligatures), consistent with the extension's existing
  icon system — never Font Awesome.
- All SillyTavern API access (context, `document`, settings) stays lazy and
  degrades to a `[st_advanced_group_chat]`-prefixed `console.warn`; the
  extension must never take the host down.
- Empty/whitespace values clear nothing here — the state is boolean.

## Approaches

- **Container CSS class driven by one header-area toggle (chosen)**: a class
  like `st-agc-hide-avatars` on each `.rm_group_members` container +
  `display: none` on `.avatar`. Survives row rebuilds, covers the popout,
  one control, zero per-row additions.
- Per-row eye button — rejected: more row clutter, exactly what the user
  wants to avoid.
- Click / right-click the avatar itself — rejected: risks colliding with
  SillyTavern's own click handling on those rows, and a fully vanished image
  leaves nothing to click to restore.
- Global (all groups) toggle — rejected: the user chose per-group.

## Decisions

- Button: a `div` styled as a menu button, inserted after
  `#rm_group_members_pagination`, with `role="button"`, `tabindex="0"`,
  Enter/Space activation (Space prevented, propagation stopped), click
  propagation stopped — same conventions as the model button.
- Icon/text: Material Symbols `visibility` when avatars are hidden-state
  off (click to hide), `visibility_off` when hidden (click to show);
  tooltip via `translateText` ("Hide member avatars" / "Show member
  avatars").
- State lives at `hideAvatars[groupId]` (boolean) in this extension's
  settings; defaults to shown (`false`/absent). Saved through
  `saveSettingsDebounced` like the rest.
- The class is applied/removed by walking every `.rm_group_members` in the
  document on toggle and on refresh, so the editor list and the popout
  share one state.
- **Group source (revision after review):** `context.groupId` is the group
  whose *chat* is open, which is not always the group the editor shows (and
  is null while creating a group). The module therefore tracks the editor's
  group from SillyTavern's `groupSelected` event (`detail.id`) and falls
  back to `context.groupId` when the editor has not selected one. Toggling
  writes to the editor's group.

## Left to the builder

- New `src/` module (e.g. `src/hide-member-avatars.js`) registered in
  `index.js` as its own feature, per the feature-registry convention.
- Storage helpers in `src/model-overrides.js` (or a sibling) for the
  `hideAvatars` map: `getHidden(groupId)` / `setHidden(groupId, hidden)`
  with the same lazy-settings pattern.
- Whether the refresh sync hooks into the existing observer callback in
  `member-model-button.js` or starts its own observer (prefer reusing one
  shared refresh path; keep features independently disposable).
- Exact CSS in `style.css` (`.st-agc-hide-avatars .avatar { display: none; }`
  and button styling).

## Verification

- Unit tests (fake DOM per `test-helpers/fake-sillytavern.js`): toggle
  click flips settings + container class; icon ligature text and tooltip
  swap; re-render (observer path) re-applies the class to a rebuilt
  container; dispose removes button, class, and observer; missing
  SillyTavern APIs only warn.
- `test/readme.test.js` will force a README update in the same commit.
- Manual check against the local SillyTavern checkout (LOCAL.md): toggle
  in editor, popout follows, reload persists, switching groups switches
  state.