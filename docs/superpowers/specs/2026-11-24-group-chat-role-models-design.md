# Group Chat Per-Member Models — Design

Date: 2026-11-24

## Intent

Build a SillyTavern UI extension for group-chat users who want different group members to use different language models while keeping the active SillyTavern connection and its shared settings.

## Goals

- Add a model-setting icon to each member row in the group editor's Current Members list, beside the existing member controls.
- Let the user type a model name for that member in that group.
- Use the chosen model for that member's outgoing Chat Completion request while keeping SillyTavern's active endpoint, API key, provider, and other generation settings.
- Use SillyTavern's currently selected model when no override is set.
- Keep the extension organized so future group-chat features can be added without mixing unrelated behavior.

## Non-goals

- Put the main model configuration in a separate extension settings page.
- Create or manage API connections, endpoints, or API keys.
- Change the model for non-group chats.
- Change group member selection, reply order, prompts, or other generation settings.
- Support Text Completion APIs in the first version; the confirmed request event is for Chat Completion.

## Approaches

1. **Edit the outgoing request model from the extension (chosen).** Listen for SillyTavern's `CHAT_COMPLETION_SETTINGS_READY` event and replace only the request's `model` when the current group member has an override. This preserves the active connection and its other settings. It avoids temporarily changing the global model selector.
2. **Temporarily switch SillyTavern's model selector.** Change the global model before a reply and restore it afterward. This is more fragile because the extension must manage global UI state during generation.
3. **Add a SillyTavern core hook.** A core change could make this more explicit, but the existing request event makes a core change unnecessary for the first version.

## Behavior and storage

- Store settings in the extension's own SillyTavern extension settings.
- Key each override by group ID and member identity, so the same member can use different models in different groups.
- Clicking the new icon on a member row opens a small prompt/dialog with a text field for the model name. Saving an empty value clears the override; the icon can indicate whether an override is set.
- At request time, identify the active group and member, find that group's override, and change only the outgoing request's `model` field.
- Apply overrides only to group-chat Chat Completion requests. Regular chats and requests with no matching override pass through unchanged.

## Constraints and builder calls

- This repository currently contains SillyTavern reference documentation but no extension implementation. The first build will need a small extension scaffold.
- The project should use SillyTavern's current extension APIs and avoid adding a server plugin or dependency unless implementation proves it necessary.
- Initial API scope is Chat Completion, based on the discovered request event. Broader API support can be considered later as a separate feature.
- Match the existing group-member row controls; exact icon choice and dialog styling are left to the builder.
