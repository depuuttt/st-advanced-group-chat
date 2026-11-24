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
2. In **Current Members**, each member row now has an extra model icon beside
   the existing row buttons.
3. Click the model icon and type the model name you want that member to use.
4. Click **OK** to save. Clear the field and click **OK** to remove the
   override and go back to SillyTavern's selected model.

A member with a saved override is highlighted, and hovering the icon shows the
saved model name.

### What changes at request time

- The extension listens for SillyTavern's `CHAT_COMPLETION_SETTINGS_READY` event
  and replaces only the `model` field of the outgoing Chat Completion request
  for the group member who is about to speak.
- The active provider, endpoint, API key, and every other generation setting are
  left exactly as SillyTavern built them.
- A member with no override uses whatever model is currently selected in
  SillyTavern.

### Scope of the first version

- Only **Chat Completion** requests are changed. **Text Completion** is not
  supported yet.
- Only **group chats** are changed. Regular one-on-one chats are untouched.
- Requests where the speaking member cannot be identified are left unchanged.
- Model names are typed by hand; the extension does not list or validate models
  against your provider.
- Overriding the model does not re-run SillyTavern's per-model parameter
  handling. If you switch a member to a model from a different family than the
  one selected in SillyTavern, check that the connection still accepts the
  request.

## Development

The extension is plain browser JavaScript with no build step and no third-party
dependencies. Tests use Node's built-in test runner:

```
npm test
```

## License

See [LICENSE](LICENSE).