/**
 * Routes a group member's Chat Completion request to that member's saved model.
 *
 * SillyTavern emits `GROUP_MEMBER_DRAFTED` with the character index right before
 * it generates for that member, and `CHAT_COMPLETION_SETTINGS_READY` with the
 * fully built request right before it is sent. Between those two events the
 * extension remembers who is speaking; at request time it swaps only the
 * `model` field and leaves the connection, endpoint, key and every other
 * generation setting exactly as SillyTavern built them.
 */

import { getModelOverride, getSettings } from './model-overrides.js';

const MODULE_NAME = 'st_advanced_group_chat';

/**
 * The group member SillyTavern is currently generating for.
 *
 * @type {{ groupId: string|null, memberId: string|null, memberName: string|null }}
 */
let activeSpeaker = createEmptySpeaker();

/**
 * @returns {{ groupId: null, memberId: null, memberName: null }} An empty speaker record.
 */
function createEmptySpeaker() {
    return { groupId: null, memberId: null, memberName: null };
}

/**
 * Returns the live SillyTavern context, or `null` when it is unavailable.
 *
 * @returns {object|null} SillyTavern context.
 */
function getContextOrNull() {
    try {
        return globalThis.SillyTavern?.getContext?.() ?? null;
    } catch (error) {
        console.warn(`[${MODULE_NAME}] Could not read the SillyTavern context`, error);
        return null;
    }
}

/**
 * Forgets the active group member.
 *
 * @returns {void}
 */
export function resetActiveSpeaker() {
    activeSpeaker = createEmptySpeaker();
}

/**
 * Reads the current speaker record. Exposed so the UI layer and tests can
 * inspect routing state without reaching into module internals.
 *
 * @returns {{ groupId: string|null, memberId: string|null, memberName: string|null }} The active speaker.
 */
export function getActiveSpeaker() {
    return activeSpeaker;
}

/**
 * Handles `GROUP_MEMBER_DRAFTED`.
 *
 * SillyTavern emits this with the index of the character it is about to
 * generate for, after setting that character as the active one. The avatar ID,
 * not the display name, is what overrides are stored under.
 *
 * @param {number} characterId Index into `characters`.
 * @returns {void}
 */
export function handleMemberDrafted(characterId) {
    const context = getContextOrNull();
    const character = context?.characters?.[characterId];
    const memberId = character?.avatar;
    const groupId = context?.groupId ?? null;

    if (!groupId || !memberId) {
        resetActiveSpeaker();
        return;
    }

    activeSpeaker = {
        groupId,
        memberId,
        memberName: typeof character.name === 'string' ? character.name : null,
    };
}

/**
 * Handles `CHAT_COMPLETION_SETTINGS_READY`.
 *
 * Replaces `request.model` only when the request belongs to a group, the
 * drafted member is known and still in that group, the request's `char_name`
 * identifies that same member, and a non-empty override is saved for them.
 * Every other request is left untouched.
 *
 * @param {object} request SillyTavern's outgoing Chat Completion request body.
 * @returns {void}
 */
export function handleChatCompletionSettingsReady(request) {
    if (!request || typeof request !== 'object') {
        return;
    }

    const context = getContextOrNull();
    const groupId = context?.groupId ?? null;

    // Regular (non-group) chats have no group ID.
    if (!groupId) {
        return;
    }

    // The drafted member must belong to the group the request is for.
    if (activeSpeaker.groupId !== groupId) {
        return;
    }

    const { memberId, memberName } = activeSpeaker;
    if (!memberId || !memberName) {
        return;
    }

    // Guard against the request being built for someone other than the drafted
    // member: two characters in one group can share a display name, so the name
    // check is a guard against stale state, not the storage key.
    if (request.char_name !== memberName) {
        return;
    }

    const override = getModelOverride(getSettings(), groupId, memberId);
    if (!override) {
        return;
    }

    request.model = override;
}

/**
 * Handles `GROUP_WRAPPER_FINISHED`.
 *
 * @returns {void}
 */
export function handleGroupWrapperFinished() {
    resetActiveSpeaker();
}

/**
 * Subscribes the routing handlers to SillyTavern's event source.
 *
 * @returns {boolean} True when the handlers were subscribed.
 */
export function initRequestRouting() {
    const context = getContextOrNull();
    const { eventSource, eventTypes } = context ?? {};

    if (!eventSource || !eventTypes) {
        console.warn(`[${MODULE_NAME}] Request routing could not be initialised`);
        return false;
    }

    eventSource.on(eventTypes.GROUP_MEMBER_DRAFTED, handleMemberDrafted);
    eventSource.on(eventTypes.CHAT_COMPLETION_SETTINGS_READY, handleChatCompletionSettingsReady);
    eventSource.on(eventTypes.GROUP_WRAPPER_FINISHED, handleGroupWrapperFinished);

    return true;
}

/**
 * Removes the routing handlers and forgets the active speaker.
 *
 * @returns {void}
 */
export function disposeRequestRouting() {
    const context = getContextOrNull();
    const { eventSource, eventTypes } = context ?? {};

    if (eventSource && eventTypes) {
        eventSource.removeListener(eventTypes.GROUP_MEMBER_DRAFTED, handleMemberDrafted);
        eventSource.removeListener(eventTypes.CHAT_COMPLETION_SETTINGS_READY, handleChatCompletionSettingsReady);
        eventSource.removeListener(eventTypes.GROUP_WRAPPER_FINISHED, handleGroupWrapperFinished);
    }

    resetActiveSpeaker();
}