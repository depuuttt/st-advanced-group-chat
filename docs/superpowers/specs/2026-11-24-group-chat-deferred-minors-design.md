# Deferred Review Minors — Design

Date: 2026-11-24

> **Status: Implemented** and verified; the implementation plan has been removed.

## Intent

Close out the seven Minor findings from the code review of the group-chat
per-member models extension. Six are code or documentation changes; one
(orphaned overrides) is a behaviour change. None of them changes what the
extension does for a user who has saved no overrides.

This is a follow-up to `2026-11-24-group-chat-role-models-design.md`, which
remains the authority on what the extension is for.

## Goals

- Prune overrides whose group or member no longer exists, so settings do not
  grow without bound.
- Make the model button operable from the keyboard.
- Localize the three user-facing strings.
- Remove the always-absent `data-id` branch, cancel a queued refresh on
  dispose, replace `structuredClone` with an explicit defaults factory, and
  correct the README's description of the member-row markup.

## Non-goals

- No new user-visible features.
- No change to request routing, storage keys, or the override data shape.
- No new locale files; English source strings are the fallback.
- No change to how the extension is installed or loaded.

## Anti-goals

- Deleting a saved override that is still in use. A wrong prune is data loss
  the user did not ask for, and it is the one failure mode in this change that
  cannot be undone.
- A prune that fires often enough to be noticed while the group editor is open.

## Constraints

- SillyTavern 1.19.1 is the target. `GROUP_UPDATED` is emitted at the end of
  `onGroupActionClick` (`public/scripts/group-chats.js:2003`) and from
  `onHideMutedSpritesClick` (`:1777`), so it covers member add, remove, enable,
  disable, and reorder. `GROUP_CHAT_DELETED` is emitted when a group is deleted
  (`:1334`, `:2308`).
- `GROUP_CHAT_DELETED` passes a chat ID from two call sites and a chat name
  from a third (`:2269`), so no handler may rely on its payload.
- `t` and `translate` are on the context (`public/scripts/st-context.js:214`).
  `t` is tagged-template only — it calls `strings.reduce`, so `t('literal')`
  throws and `` t`literal` `` is required.
- The extension stays dependency-free and build-step-free.

## Approaches

**Pruning.** Three options: prune on events only; prune once at `APP_READY`
only; or both. **Chosen: both.** The scan is a handful of short strings and
`groups` is authoritative at both moments. Startup alone would leave an
override for a member removed mid-session in place until the next reload;
events alone would miss an override orphaned by a group deleted in another tab
before this one loaded. Neither event can fire for an unsaved group, and the
model button cannot save an override when `groupId` is null, so there is no
path where pruning drops a live override.

**Keyboard activation.** Two options: keep the `div` and add a `keydown`
listener, or replace it with a real `<button>`. **Chosen: the `div` with a
`keydown` listener.** It keeps the button visually identical to SillyTavern's
own `.right_menu_button` row icons, which are also `div`s. A real `<button>`
would need resets for border, background, and font to avoid looking different
from its neighbours.

**Localization.** Two options: wrap the three strings in `context.t()`, or add
an `i18n` block to the manifest plus locale JSON files. **Chosen:
`context.t()`.** English source strings double as the fallback, no manifest
change is needed, and no translations have to be invented for languages that
cannot be verified here.

## Changes

### 1. Prune overrides for deleted members and groups

Add `pruneModelOverrides(settings, groups) -> number` to
`src/model-overrides.js`. It returns how many saved overrides it removed and
does not persist anything itself.

For each group ID in `settings.modelOverrides`:

- If no group with that ID is in `groups`, delete the whole group entry.
- Otherwise, for each member ID in that group's overrides, delete it when
  `group.members` is an array that does not contain the member ID.

Guard: if `groups` is not an array, return 0 and change nothing. A member is
only pruned when `group.members` is an array, so a group object that has not
been fully loaded keeps its overrides.

Add `src/override-pruning.js` with `initOverridePruning()` and
`disposeOverridePruning()`, following the existing feature-module pattern in
`index.js`. `init` runs one prune immediately and subscribes to
`GROUP_UPDATED` and `GROUP_CHAT_DELETED`. Neither handler reads the event
payload; both re-scan. When a prune removes anything, call
`saveSettingsDebounced()`.

### 2. Keyboard activation

Add a `keydown` listener to the model button in
`refreshMemberModelButtons`. Enter and Space open the dialog; both call
`preventDefault()` so Space does not scroll the page. The button keeps
`role="button"` and `tabindex="0"`.

### 3. Localize the three strings

Replace the hardcoded strings in `src/member-model-button.js` with tagged
templates against `context.t`:

- `` t`Set a model for this member` ``
- `` t`Model: ${override}` ``
- `` t`Member model` `` as the dialog header
- `` t`Model for ${label}. Leave empty to use SillyTavern's selected model.` ``

The button title must be recomputed when the override changes, which
`applyButtonState` already does on every refresh.

### 4. Drop the always-absent `data-id` branch

Reorder `resolveMemberAvatarId` to try jQuery's data store first, then the
`data-id` attribute, then `data-chid`. SillyTavern sets the row's avatar with
`template.data('id', avatar)`, which writes only jQuery's store, so the
attribute branch never fires in stock SillyTavern. It stays as a
forward-compatible fallback, with a comment saying so.

### 5. Cancel a queued refresh on dispose

Track the handle returned by `requestAnimationFrame` (or the `setTimeout`
fallback) in `disposeMemberModelButtons` and cancel it, so a refresh queued
before teardown cannot re-add buttons afterwards.

### 6. Explicit defaults factory

Replace the frozen `DEFAULT_SETTINGS` constant and its `structuredClone` calls
with `createDefaultSettings()` returning `{ modelOverrides: {} }`. The object
is plain JSON, so a deep clone of a template buys nothing and raises a browser
support question for no benefit.

### 7. Correct the README

Replace the claim that member rows "carry the member's avatar as `data-id`" with
an accurate description: SillyTavern stores the avatar in jQuery's data store
under `data-id` and the character index in the `data-chid` attribute, and the
extension reads either.

## Left to the builder

- Exact wording of the four English strings, which double as the translation
  keys.
- Whether `GROUP_CHAT_CREATED` also warrants a prune. The chosen design says no
  (a new group has nothing to orphan), but it is cheap to add.
- The name of the new module and the feature name it registers under.

## Verification

Unit tests for `pruneModelOverrides` (orphaned group, orphaned member, live
group and member kept, non-array `groups` is a no-op) and for the keyboard
handler. The prune must be shown to leave a live override untouched, since that
is the anti-goal. The localized strings fall back to English when no locale is
loaded, which the tests can assert directly.