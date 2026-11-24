/**
 * Removes saved model overrides for groups and members that no longer exist.
 *
 * SillyTavern emits `GROUP_UPDATED` after any change to a group's member list
 * (add, remove, enable, disable, reorder) and `GROUP_CHAT_DELETED` when a
 * group is deleted. Neither handler reads the `GROUP_CHAT_DELETED` payload —
 * it is a chat ID from some call sites and a chat name from others — both
 * re-scan the whole group list instead.
 */

import { pruneModelOverrides, getSettings } from './model-overrides.js';

const MODULE_NAME = 'st_advanced_group_chat';

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
 * Prunes overrides for anything no longer in the group list and saves the
 * settings when that removed anything.
 *
 * @returns {void}
 */
function pruneAndSave() {
    const settings = getSettings();
    if (!settings) {
        return;
    }

    const context = getContextOrNull();
    const groups = context?.groups;

    if (pruneModelOverrides(settings, groups) > 0) {
        context?.saveSettingsDebounced?.();
    }
}

/**
 * Prunes once at startup and subscribes the group-event handlers.
 *
 * The startup prune is skipped when the group list is an empty array: a failed
 * character/group fetch reaches `APP_READY` with `groups` still `[]`, and an
 * empty list is not proof that saved groups were deleted — pruning against it
 * would wipe every override, which cannot be undone. Event-driven prunes are
 * unaffected because `GROUP_UPDATED` and `GROUP_CHAT_DELETED` only fire after
 * the group list has loaded.
 *
 * @returns {void}
 */
export function initOverridePruning() {
    const groups = getContextOrNull()?.groups;

    if (!Array.isArray(groups) || groups.length > 0) {
        pruneAndSave();
    }

    const context = getContextOrNull();
    const { eventSource, eventTypes } = context ?? {};

    if (!eventSource || !eventTypes) {
        console.warn(`[${MODULE_NAME}] Override pruning could not subscribe to group events`);
        return;
    }

    eventSource.on(eventTypes.GROUP_UPDATED, pruneAndSave);
    eventSource.on(eventTypes.GROUP_CHAT_DELETED, pruneAndSave);
}

/**
 * Removes the group-event handlers.
 *
 * @returns {void}
 */
export function disposeOverridePruning() {
    const context = getContextOrNull();
    const { eventSource, eventTypes } = context ?? {};

    if (eventSource && eventTypes) {
        eventSource.removeListener(eventTypes.GROUP_UPDATED, pruneAndSave);
        eventSource.removeListener(eventTypes.GROUP_CHAT_DELETED, pruneAndSave);
    }
}
