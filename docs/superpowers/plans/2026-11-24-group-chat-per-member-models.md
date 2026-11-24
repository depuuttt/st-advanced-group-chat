# Group Chat Per-Member Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a SillyTavern UI extension that adds a model-setting icon to each group member row and uses the typed model for that member's group-chat replies.

**Architecture:** Use a browser-side SillyTavern extension with small feature modules for group-member UI, per-group model storage, and request routing. The UI saves an override under the group ID and member avatar ID; the request listener changes only the outgoing Chat Completion `model` field for the active group speaker.

**Tech Stack:** JavaScript ES modules, SillyTavern extension APIs, HTML/DOM, CSS. No build step, server plugin, or third-party dependency.

**Spec:** `docs/superpowers/specs/2026-11-24-group-chat-role-models-design.md`

## Global Constraints

- The setting icon appears on every member row in the group's Current Members list, alongside the existing controls.
- Model names are typed by the user; an empty value clears that member's override.
- Overrides are scoped by both group ID and member avatar ID.
- The active SillyTavern provider, endpoint, API key, and all request settings other than `model` stay unchanged.
- A member without an override uses SillyTavern's currently selected model.
- Only group-chat Chat Completion requests are changed.
- Regular chats, Text Completion requests, and requests where speaker identity cannot be confirmed pass through unchanged.
- Store model names only in this extension's own extension settings; never store API keys or secrets.
- Keep the implementation in browser-side JavaScript, HTML, and CSS; add no server plugin or third-party dependency.

## Review Focus

- **No saved override:** outgoing request keeps SillyTavern's current model. Confirm in Task 2's manual flow.
- **Cleared override:** an empty model entry removes the override and returns to the current model. Confirm in Task 3's manual flow.
- **Same member in two groups:** each group retains its own model. Confirm in Task 3's manual flow.
- **Speaker identity unavailable or ambiguous:** leave the request's model unchanged. Confirm in Task 2's manual flow.
- **Non-group or non-Chat Completion request:** leave it unchanged. Confirm in Task 2's manual flow.

---

### Task 1: Create the extension scaffold and install guide

**Files:**
- Create: `manifest.json` — SillyTavern extension metadata and entry files.
- Create: `index.js` — extension entry point that imports and initializes feature modules.
- Create: `style.css` — styles for the new member-row icon and its override state.
- Create: `README.md` — installation and use instructions for a non-programmer.

**Interfaces:**
- Produces `onExtensionReady()` as the entry initialization function, called on SillyTavern's `APP_READY` event.
- `manifest.json` points to `index.js` and `style.css`; use no build tooling.

- [x] Create the manifest with a stable extension name, version, JS entry, and CSS entry.
- [x] Create `index.js` to initialize the feature modules once on `APP_READY`.
- [x] Add empty base styles and README instructions for installing the repository into SillyTavern's third-party extensions folder.
- [ ] Manually confirm the extension appears in SillyTavern's extension list and loads without a browser-console error.

### Task 2: Add group-scoped model storage and request routing

**Files:**
- Create: `src/model-overrides.js` — settings defaults and group/member get, set, and clear operations.
- Create: `src/request-routing.js` — speaker tracking and the Chat Completion request listener.
- Modify: `index.js` — initialize and dispose feature listeners.

**Interfaces:**
- `getModelOverride(settings, groupId, memberId) -> string | ''`
- `setModelOverride(settings, groupId, memberId, modelName) -> void`; trim the model name and delete the stored entry when empty.
- `handleMemberDrafted(characterId) -> void`; resolve the character avatar ID using SillyTavern context and remember the active group/member.
- `handleChatCompletionSettingsReady(request) -> void`; change `request.model` only when group ID and active speaker resolve to a saved override and `request.char_name` matches that speaker.
- Listen to `GROUP_MEMBER_DRAFTED` to track the active member, `CHAT_COMPLETION_SETTINGS_READY` to patch the request, and `GROUP_WRAPPER_FINISHED` to clear tracking.

- [x] Add settings initialization under a unique key in `extensionSettings`, preserving existing saved values and calling `saveSettingsDebounced()` after changes.
- [x] Implement get/set/clear operations keyed by group ID and member avatar ID; do not use display name as the storage key.
- [x] Track the drafted character ID before each group member generation and clear it when the group wrapper finishes.
- [x] On `CHAT_COMPLETION_SETTINGS_READY`, require a current group, a known active member, and a matching `char_name`; if any check fails, leave the request untouched.
- [x] Change only `request.model` when a non-empty override exists; leave the baseline model untouched otherwise.
- [ ] Manually inspect one group request, one regular chat request, one Text Completion request, and one request without an override to confirm only the eligible request changes model.

### Task 3: Add the per-member model icon and input dialog

**Files:**
- Create: `src/member-model-button.js` — icon injection, display state, and click handling.
- Modify: `index.js` — initialize and dispose the UI feature.
- Modify: `style.css` — align the icon with existing group-member controls.

**Interfaces:**
- `refreshMemberModelButtons() -> void`; add a button only where one is not already present in each `.group_member` row.
- `openMemberModelInput(groupId, memberId) -> Promise<void>`; open SillyTavern's `Popup.show.input`, prefill the saved model, then save or clear the override.
- Read the group ID from `SillyTavern.getContext().groupId` and the member avatar ID from the row's `data-id`.

- [x] Inspect the supported SillyTavern group-member row markup and insert a uniquely classed button beside the existing row actions.
- [x] Re-run `refreshMemberModelButtons()` after group member list rendering/update events and observe list mutations so rerenders restore the icon without creating duplicates.
- [x] On click, stop propagation so SillyTavern's existing member actions do not fire; show a text input with the saved model as its initial value.
- [x] Save a non-empty entry for the current group/member, clear it for an empty entry, and update the icon title/state to show whether an override is active.
- [ ] Manually confirm the icon appears on every current member row, survives filtering/reordering/rerendering, and each member can set, edit, and clear their model.
- [ ] Manually confirm a shared character can have different model names in two groups and the values remain after reloading SillyTavern.

### Task 4: Document behavior and compatibility

**Files:**
- Modify: `README.md` — feature use, fallback behavior, and compatibility notes.

**Interfaces:**
- Documents the icon location, how to type/change/clear a model name, and the current API scope.

- [x] Explain that the extension reuses SillyTavern's selected connection and changes only the model field for group Chat Completion requests.
- [x] Explain that an empty model uses the currently selected SillyTavern model and that Text Completion is outside the first version.
- [x] Provide a manual acceptance checklist covering all Review Focus conditions.

## Handoff Notes

The current repository contains SillyTavern reference documentation but no extension implementation. During implementation, verify event names and the group editor's current member-row markup against the SillyTavern version being targeted. If that version does not expose the documented event payload or row structure, stop and revise the design before introducing internal monkey patches.
