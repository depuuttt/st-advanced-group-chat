/**
 * Per-group, per-member model overrides plus per-group hidden-avatar and
 * hidden-tag flags.
 *
 * Storage lives in this extension's own SillyTavern extension settings, under a
 * unique key, shaped as:
 *
 *   extensionSettings['st_advanced_group_chat'].modelOverrides[groupId][avatarId] = 'model-name'
 *   extensionSettings['st_advanced_group_chat'].hideAvatars[groupId] = true
 *   extensionSettings['st_advanced_group_chat'].hideTags[groupId] = true
 *
 * Members are keyed by avatar ID rather than display name, because two characters
 * in the same group can share a name. API keys are never stored here.
 */

const MODULE_NAME = 'st_advanced_group_chat';

/**
 * Returns a fresh default settings object on every call. Plain JSON needs no
 * deep clone; a factory avoids callers sharing (and mutating) one template.
 *
 * @returns {{ modelOverrides: object, hideAvatars: object, hideTags: object }} Default extension settings.
 */
export function createDefaultSettings() {
    return { modelOverrides: {}, hideAvatars: {}, hideTags: {} };
}

/**
 * Persists the settings to SillyTavern. Best effort: the override has already
 * been applied to the live settings object, so a missing context (for example
 * in a unit test) must not undo the change.
 *
 * @returns {void}
 */
function saveSettings() {
    const context = globalThis.SillyTavern?.getContext?.();
    context?.saveSettingsDebounced?.();
}

/**
 * Returns this extension's settings object, creating it and filling in any
 * default keys that a newer version added. Existing saved values are preserved.
 *
 * Returns `null` when SillyTavern is not available rather than throwing: this is
 * called from inside SillyTavern's event and animation-frame callbacks, and an
 * extension must never take the host application down with it.
 *
 * @returns {object|null} The live extension settings object, or null.
 */
export function getSettings() {
    const extensionSettings = globalThis.SillyTavern?.getContext?.()?.extensionSettings;

    if (!extensionSettings) {
        console.warn(`[${MODULE_NAME}] SillyTavern settings are unavailable`);
        return null;
    }

    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = createDefaultSettings();
    }

    const defaults = createDefaultSettings();
    for (const key of Object.keys(defaults)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = defaults[key];
        }
    }

    return extensionSettings[MODULE_NAME];
}

/**
 * Reads the model override saved for one member in one group.
 *
 * @param {object} settings Extension settings object.
 * @param {string} groupId Group ID.
 * @param {string} memberId Member avatar ID.
 * @returns {string} The saved model name, or an empty string when none is saved.
 */
export function getModelOverride(settings, groupId, memberId) {
    if (!groupId || !memberId) {
        return '';
    }

    const stored = settings?.modelOverrides?.[groupId]?.[memberId];
    return typeof stored === 'string' ? stored : '';
}

/**
 * Saves or clears the model override for one member in one group.
 *
 * The model name is trimmed. An empty or whitespace-only name clears the
 * override, which puts the member back on SillyTavern's selected model.
 *
 * @param {object} settings Extension settings object.
 * @param {string} groupId Group ID.
 * @param {string} memberId Member avatar ID.
 * @param {string} modelName Model name to store; empty clears.
 * @returns {void}
 */
export function setModelOverride(settings, groupId, memberId, modelName) {
    if (!settings || !groupId || !memberId) {
        return;
    }

    const trimmed = typeof modelName === 'string' ? modelName.trim() : '';

    if (!settings.modelOverrides) {
        settings.modelOverrides = {};
    }

    const groupOverrides = settings.modelOverrides[groupId] ?? (settings.modelOverrides[groupId] = {});

    if (trimmed) {
        groupOverrides[memberId] = trimmed;
    } else {
        delete groupOverrides[memberId];
    }

    saveSettings();
}

/**
 * Removes saved overrides whose group or member no longer exists.
 *
 * A group entry is deleted when `groups` holds no group with its ID. Within a
 * surviving group, a member entry is deleted only when `group.members` is an
 * array that does not contain it — a group object that has not been fully
 * loaded keeps its overrides. Never persists; the caller decides when to save.
 *
 * @param {object|null} settings Extension settings object.
 * @param {unknown[]} groups SillyTavern's group list, or something that is not one.
 * @returns {number} How many overrides (group or member entries) were removed.
 */
export function pruneModelOverrides(settings, groups) {
    if (!settings?.modelOverrides || !Array.isArray(groups)) {
        return 0;
    }

    let removed = 0;

    for (const groupId of Object.keys(settings.modelOverrides)) {
        const group = groups.find((candidate) => candidate?.id === groupId);

        if (!group) {
            delete settings.modelOverrides[groupId];
            removed += 1;
            continue;
        }

        if (!Array.isArray(group.members)) {
            continue;
        }

        const memberIds = settings.modelOverrides[groupId];
        for (const memberId of Object.keys(memberIds)) {
            if (!group.members.includes(memberId)) {
                delete memberIds[memberId];
                removed += 1;
            }
        }
    }

    return removed;
}

/**
 * Reports whether avatars are hidden in one group.
 *
 * @param {object|null} settings Extension settings object.
 * @param {string} groupId Group ID.
 * @returns {boolean} True when the saved flag for that group is true.
 */
export function getHideAvatars(settings, groupId) {
    if (!groupId) {
        return false;
    }

    return Boolean(settings?.hideAvatars?.[groupId]);
}

/**
 * Saves or clears the hidden-avatars flag for one group.
 *
 * Setting `hidden` to false deletes the entry, putting the group back on the
 * default (avatars shown). Mirrors `setModelOverride`'s persistence pattern.
 *
 * @param {object|null} settings Extension settings object.
 * @param {string} groupId Group ID.
 * @param {boolean} hidden Whether avatars are hidden in that group.
 * @returns {void}
 */
export function setHideAvatars(settings, groupId, hidden) {
    if (!settings || !groupId) {
        return;
    }

    if (!settings.hideAvatars) {
        settings.hideAvatars = {};
    }

    if (hidden) {
        settings.hideAvatars[groupId] = true;
    } else {
        delete settings.hideAvatars[groupId];
    }

    saveSettings();
}

/**
 * Removes saved hidden-avatar flags whose group no longer exists.
 *
 * Mirrors `pruneModelOverrides`' group-level rule: a flag is deleted when
 * `groups` holds no group with its ID. Never persists; the caller decides when
 * to save.
 *
 * @param {object|null} settings Extension settings object.
 * @param {unknown[]} groups SillyTavern's group list, or something that is not one.
 * @returns {number} How many group entries were removed.
 */
export function pruneHiddenAvatars(settings, groups) {
    if (!settings?.hideAvatars || !Array.isArray(groups)) {
        return 0;
    }

    let removed = 0;

    for (const groupId of Object.keys(settings.hideAvatars)) {
        const group = groups.find((candidate) => candidate?.id === groupId);

        if (!group) {
            delete settings.hideAvatars[groupId];
            removed += 1;
        }
    }

    return removed;
}

/**
 * Reports whether member tags are hidden in one group.
 *
 * @param {object|null} settings Extension settings object.
 * @param {string} groupId Group ID.
 * @returns {boolean} True when the saved flag for that group is true.
 */
export function getHideTags(settings, groupId) {
    if (!groupId) {
        return false;
    }

    return Boolean(settings?.hideTags?.[groupId]);
}

/**
 * Saves or clears the hidden-tags flag for one group.
 *
 * Setting `hidden` to false deletes the entry, putting the group back on the
 * default (tags shown). Mirrors `setHideAvatars`' persistence pattern.
 *
 * @param {object|null} settings Extension settings object.
 * @param {string} groupId Group ID.
 * @param {boolean} hidden Whether member tags are hidden in that group.
 * @returns {void}
 */
export function setHideTags(settings, groupId, hidden) {
    if (!settings || !groupId) {
        return;
    }

    if (!settings.hideTags) {
        settings.hideTags = {};
    }

    if (hidden) {
        settings.hideTags[groupId] = true;
    } else {
        delete settings.hideTags[groupId];
    }

    saveSettings();
}

/**
 * Removes saved hidden-tag flags whose group no longer exists.
 *
 * Mirrors `pruneHiddenAvatars`' group-level rule: a flag is deleted when
 * `groups` holds no group with its ID. Never persists; the caller decides when
 * to save.
 *
 * @param {object|null} settings Extension settings object.
 * @param {unknown[]} groups SillyTavern's group list, or something that is not one.
 * @returns {number} How many group entries were removed.
 */
export function pruneHiddenTags(settings, groups) {
    if (!settings?.hideTags || !Array.isArray(groups)) {
        return 0;
    }

    let removed = 0;

    for (const groupId of Object.keys(settings.hideTags)) {
        const group = groups.find((candidate) => candidate?.id === groupId);

        if (!group) {
            delete settings.hideTags[groupId];
            removed += 1;
        }
    }

    return removed;
}