# Advanced Group Chat

Advanced Group Chat is a work-in-progress SillyTavern extension for adding features to group chats. Its feature set is still taking shape. Per-member model selection is the first available feature; other features have not been defined yet.

## Current feature: per-member models

Choose a different language model for each character in a SillyTavern group chat. Each character's choice is saved for that group, so the same character can use a different model in another group.

## What it does

When a group member is about to reply, Advanced Group Chat uses the model name you assigned to that member. Members without an assigned model continue to use the model selected in SillyTavern's **API Connections** panel.

The extension uses your existing SillyTavern connection. It does not ask for or store API keys, and it does not change your provider, connection address, or other generation settings.

## Install

1. In SillyTavern, open **Extensions** from the top bar.
2. Select **Install Extension**.
3. Paste this repository address: `https://github.com/depuuttt/st-advanced-group-chat`
4. Select **Install**, then reload SillyTavern if prompted.
5. Open **Extensions** and make sure **Advanced Group Chat** is enabled.

SillyTavern installs extensions using Git. If installation fails, make sure Git is installed on the computer running your SillyTavern server.

## Choose a model for a group member

1. Open the group chat and open its group-management panel (the people icon).
2. In **Current Members**, find the character and select the robot/model icon on that character's row.
3. Enter the model name your provider expects, then select **OK**.

The icon is highlighted when that member has a saved model. Hover over it to see the saved name.

To go back to the model selected in **API Connections**, open the member's model dialog, clear the text, and select **OK**. Cancelling the dialog leaves the saved choice as it was.

### Finding the model name

Enter the model identifier used by your provider, not necessarily the display name shown in a model list. Check your provider's documentation or model settings if you are unsure. Advanced Group Chat does not show a model list or check whether a name is valid.

## Hide member avatars

In the group-management panel's **Current Members** section, a toolbar strip sits directly above the member list, reading as the list card's header. The eye toggle at its right edge hides every member's avatar image in that group's list — the rows become a plain list of names, with more room for the members themselves. Select it again to bring the images back.

Each group remembers its own choice, so hiding avatars in one group leaves the others as they were. The floating popout of the member list follows the same setting.

This is purely visual: it does not change who is in the group or how the chat behaves, and nothing about the chat changes.

## Important to know

- This works in group chats using **Chat Completion**. It does not affect one-on-one chats or **Text Completion**.
- The selected model must be available through your current API connection. Choosing a model from a different model family may require different settings; SillyTavern does not automatically reconfigure those settings for this extension.
- A member without a saved choice uses the model currently selected in **API Connections**.
- Choices are saved separately for each group and member and remain saved when you reload SillyTavern.
- The member row icons are drawn with Google's Material Symbols Rounded, bundled with the extension, so they render offline with no internet connection required.

## Troubleshooting

- **The model choice has no effect:** Check that the group uses Chat Completion, that the model name is correct for your provider, and that the model is available through the current connection.
- **The hide-avatars toggle is missing:** Check that the extension is enabled and loaded (see below), then reopen the group-management panel.
- **The model icon is missing:** Check that the extension is enabled, then reload SillyTavern and reopen the group-management panel.
- **The member row icons show words instead of symbols:** The bundled font may not have loaded. Reload SillyTavern; if it persists, confirm the extension's `fonts/material-symbols-rounded.woff2` file is present in the installed copy.
- **The extension does not load:** Open the browser console (usually F12) and look for messages beginning with `[st_advanced_group_chat]`. After a SillyTavern update, an extension update may be needed if its group controls or events have changed.

## Compatibility

The extension is built for SillyTavern 1.19.1. It identifies group member rows the way SillyTavern renders them: the row's avatar ID lives in jQuery's data store under `data-id` and the character index in the `data-chid` attribute, and the extension reads either.

## License

See [LICENSE](LICENSE).
