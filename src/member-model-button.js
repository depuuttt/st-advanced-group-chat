/**
 * Per-member model button in the group editor's Current Members list.
 *
 * SillyTavern rebuilds that list from the `#group_member_template` block every
 * time the group editor renders, and it emits no event when it does, so the
 * button is re-added by a MutationObserver rather than by an event listener.
 */

import { getModelOverride, setModelOverride, getSettings } from './model-overrides.js';

const MODULE_NAME = 'st_advanced_group_chat';

const MEMBER_ROW_SELECTOR = '.rm_group_members .group_member';
const ICON_SELECTOR = '.group_member_icon';
const BUTTON_CLASS = 'st-agc-model-button';
const OVERRIDE_CLASS = 'has_override';
const BUTTON_ICON = 'fa-solid fa-lg fa-robot';

/** @type {MutationObserver|null} */
let observer = null;

/** @type {boolean} */
let refreshScheduled = false;

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
 * Describes how the model button should present a member's saved override.
 *
 * @param {string} override Saved model name, or an empty string.
 * @returns {{ hasOverride: boolean, title: string }} Button state.
 */
export function getButtonState(override) {
    if (override) {
        return { hasOverride: true, title: `Model: ${override}` };
    }

    return { hasOverride: false, title: 'Set a model for this member' };
}

/**
 * Reads the avatar ID of the character a group member row represents.
 *
 * SillyTavern sets the row's `data-id` through jQuery's data store, which does
 * not write a DOM attribute, so the row's `data-chid` attribute is used as a
 * fallback. Avatar ID is the storage key, never the display name.
 *
 * @param {Element} row A `.group_member` row.
 * @returns {string|null} Avatar ID, or null when the row identifies no member.
 */
export function resolveMemberAvatarId(row) {
    const fromAttribute = row.getAttribute('data-id');
    if (fromAttribute) {
        return fromAttribute;
    }

    const jQuery = globalThis.jQuery ?? globalThis.$;
    const fromDataStore = jQuery?.(row)?.data?.('id');
    if (typeof fromDataStore === 'string' && fromDataStore) {
        return fromDataStore;
    }

    const characterId = row.getAttribute('data-chid');
    if (characterId !== null && characterId !== '') {
        const character = getContextOrNull()?.characters?.[Number(characterId)];
        if (character?.avatar) {
            return character.avatar;
        }
    }

    return null;
}

/**
 * Updates one button's highlight and tooltip to match the saved override.
 *
 * @param {Element} button The model button element.
 * @param {string} override Saved model name, or an empty string.
 * @returns {void}
 */
function applyButtonState(button, override) {
    const { hasOverride, title } = getButtonState(override);

    button.title = title;
    button.classList.toggle(OVERRIDE_CLASS, hasOverride);
}

/**
 * Adds the model button to any group member row that does not have one yet.
 *
 * @returns {void}
 */
export function refreshMemberModelButtons() {
    const doc = globalThis.document;
    if (!doc?.querySelectorAll) {
        return;
    }

    const context = getContextOrNull();
    const groupId = context?.groupId ?? null;
    const settings = context ? getSettings() : null;

    for (const row of doc.querySelectorAll(MEMBER_ROW_SELECTOR)) {
        const memberId = resolveMemberAvatarId(row);

        let button = row.querySelector(`.${BUTTON_CLASS}`);
        if (!button) {
            const iconSlot = row.querySelector(ICON_SELECTOR);
            if (!iconSlot || !memberId) {
                continue;
            }

            button = doc.createElement('div');
            button.className = `right_menu_button ${BUTTON_CLASS} ${BUTTON_ICON}`;
            button.dataset.action = 'model';
            button.setAttribute('role', 'button');
            button.setAttribute('tabindex', '0');
            button.addEventListener('click', (event) => {
                // SillyTavern handles clicks on `.right_menu_button` at the
                // document level; stopping the event keeps its member actions
                // (remove, disable, reorder) from also firing.
                event.stopPropagation();
                openMemberModelInput(getContextOrNull()?.groupId ?? null, memberId);
            });
            iconSlot.append(button);
        }

        const override = groupId && memberId ? getModelOverride(settings, groupId, memberId) : '';
        applyButtonState(button, override);
    }
}

/**
 * Opens the model input dialog for one member in the current group.
 *
 * Submitting an empty value clears the override. Cancelling the dialog leaves
 * the saved value alone.
 *
 * @param {string} groupId Group the member belongs to.
 * @param {string} memberId Avatar ID of the member.
 * @returns {Promise<void>} Resolves once the dialog is closed and any change is saved.
 */
export async function openMemberModelInput(groupId, memberId) {
    if (!groupId || !memberId) {
        return;
    }

    const context = getContextOrNull();
    const input = context?.Popup?.show?.input;

    if (typeof input !== 'function') {
        console.warn(`[${MODULE_NAME}] SillyTavern popup API is unavailable`);
        return;
    }

    const settings = getSettings();
    const current = getModelOverride(settings, groupId, memberId);
    const memberName = context.characters?.find((character) => character.avatar === memberId)?.name;
    const label = memberName ? `${memberName} (${memberId})` : memberId;

    const entered = await input(
        'Member model',
        `Model for ${label}. Leave empty to use SillyTavern's selected model.`,
        current,
    );

    // null means the dialog was cancelled.
    if (entered === null || entered === undefined) {
        return;
    }

    setModelOverride(settings, groupId, memberId, String(entered));
    refreshMemberModelButtons();
}

/**
 * Refreshes the buttons on the next animation frame, coalescing the burst of
 * mutations that rendering a member list produces.
 *
 * @returns {void}
 */
function scheduleRefresh() {
    if (refreshScheduled) {
        return;
    }
    refreshScheduled = true;

    const run = () => {
        refreshScheduled = false;
        refreshMemberModelButtons();
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
        globalThis.requestAnimationFrame(run);
    } else {
        setTimeout(run, 0);
    }
}

/**
 * Adds the buttons and starts watching for the member list being re-rendered.
 *
 * @returns {void}
 */
export function initMemberModelButtons() {
    refreshMemberModelButtons();

    const doc = globalThis.document;
    if (typeof globalThis.MutationObserver === 'undefined' || !doc?.body) {
        return;
    }

    observer = new globalThis.MutationObserver(scheduleRefresh);
    observer.observe(doc.body, { childList: true, subtree: true });
}

/**
 * Stops watching for re-renders and removes every button this extension added.
 *
 * @returns {void}
 */
export function disposeMemberModelButtons() {
    observer?.disconnect();
    observer = null;

    for (const button of globalThis.document?.querySelectorAll?.(`.${BUTTON_CLASS}`) ?? []) {
        button.remove();
    }
}