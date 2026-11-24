# Advanced Group Chat

A SillyTavern UI extension that lets each member of a group chat use a different
language model, while keeping SillyTavern's active connection and its other
generation settings.

## Installation

1. Open your SillyTavern installation folder.
2. Copy this whole folder into `data/<your-user-handle>/extensions/` (the
   "Install for all users" location) or into
   `public/scripts/extensions/third-party/` (the "Install for current user"
   location).
3. Restart SillyTavern, or press `F5` in the browser.
4. Open **Extensions** (the puzzle-piece icon in the top bar) and confirm
   **Advanced Group Chat** appears in the list and is enabled.

If the extension is listed as "not loaded", open the browser console (F12) and
look for a message prefixed `[st_advanced_group_chat]`.

## Usage

1. Open a group chat and click the group-management (people) icon.
2. In **Current Members**, each member row has an extra model icon beside the
   existing row buttons.
3. Click the model icon and type the model name you want that member to use.
4. Click **OK** to save. Clear the field and click **OK** to remove the override
   and go back to SillyTavern's selected model.

A member with a saved override is highlighted, and hovering the icon shows the
saved model name.

### What changes at request time

The extension reuses SillyTavern's selected connection. It listens for
SillyTavern's `CHAT_COMPLETION_SETTINGS_READY` event and replaces
only the `model` field of the outgoing Chat Completion request for the group
member who is about to speak. The active provider, endpoint, API key, and every
other generation setting are left exactly as SillyTavern built them.

A member with no override uses the model currently selected in SillyTavern's
API Connections panel. An empty value clears the override and puts the member
back on that selected model. Nothing is stored or changed until you type a model
name for that member.

### Scope of the first version

- Only **Chat Completion** requests are changed. **Text Completion** is not
  supported in the first version.
- Only **group chats** are changed. Regular one-on-one chats are untouched.
- Requests where the speaking member cannot be identified are left unchanged.
- Model names are typed by hand; the extension does not list or validate models
  against your provider.
- Overriding the model does not re-run SillyTavern's per-model parameter
  handling. If you switch a member to a model from a different family than the
  one selected in SillyTavern, check that the connection still accepts the
  request.
- Model names are stored per group and per member. The same character can use
  different models in different groups.

## Compatibility

The extension was built against SillyTavern's `staging` branch and relies on:

- the `GROUP_MEMBER_DRAFTED` and `GROUP_WRAPPER_FINISHED` events, to know which
  member is about to speak;
- the `CHAT_COMPLETION_SETTINGS_READY` event, to adjust the outgoing request;
- the group editor's `.group_member` rows inside `.rm_group_members`, which
  carry the member's avatar as `data-id` and character index as `data-chid`.

If a future SillyTavern version renames these events or restructures the member
row, the extension stops applying overrides rather than guessing. Check the
browser console for `[st_advanced_group_chat]` warnings after an upgrade.

No server plugin and no third-party dependency are required.

## Manual acceptance checklist

Run through these in a SillyTavern instance with the extension installed. Each
one covers behaviour that needs a live group chat and cannot be verified by the
automated tests.

- [ ] **Extension loads** — Advanced Group Chat appears in the Extensions panel
      and the browser console shows no `[st_advanced_group_chat]` errors.
- [ ] **No saved override** — Leave every member's model empty, send a message,
      and confirm the reply uses the model currently selected in API
      Connections.
- [ ] **Cleared override** — Set a model for a member, confirm the reply uses
      it, then clear the field and confirm the reply goes back to the selected
      model.
- [ ] **Same member in two groups** — Add the same character to two groups with
      different models and confirm each group's replies use that group's model.
      Reload SillyTavern and confirm both values survive.
- [ ] **Speaker identity unavailable or ambiguous** — Trigger a reply when no
      member is selected, or with two members sharing a display name, and confirm
      the request still uses the selected model.
- [ ] **Non-group chat** — In a regular one-on-one chat, confirm the selected
      model is used and no model icon appears anywhere.
- [ ] **Text Completion** — Switch API Connections to Text Completion and
      confirm replies are unaffected by any saved override.
- [ ] **Icon placement and re-render** — Confirm the icon appears on every
      Current Members row, survives filtering, reordering and the member-list
      popout, and never appears twice on one row.

## Development

The extension is plain browser JavaScript with no build step and no third-party
dependencies. Tests use Node's built-in test runner:

```
npm test
```

## License

See [LICENSE](LICENSE).