/**
 * Per-member model button in the group editor's Current Members list.
 *
 * SillyTavern rebuilds that list from the `#group_member_template` block every
 * time the group editor renders, and it emits no event when it does, so the
 * button is re-added by a MutationObserver rather than by an event listener.
 */

import { getModelOverride, setModelOverride, getSettings } from './model-overrides.js';

const MODULE_NAME = 'st_advanced_group_chat';

const MEMBER_LIST_SELECTOR = '.rm_group_members';
const MEMBER_ROW_SELECTOR = `${MEMBER_LIST_SELECTOR} .group_member`;
const ICON_SELECTOR = '.group_member_icon';
const BUTTON_CLASS = 'st-agc-model-button';
const OVERRIDE_CLASS = 'has_override';
const BUTTON_ICON = 'fa-solid fa-lg fa-robot';

/** @type {MutationObserver|null} */
let observer = null;

/** @type {boolean} */
let refreshScheduled = false;

/** @type {{ handle: unknown, cancel: (handle: unknown) => void }|null} */
let queuedRefresh = null;

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
 * Translates a tagged template through SillyTavern's `t`.
 *
 * `t` on the context is tagged-template only — calling it as `t('literal')`
 * throws because it runs `strings.reduce` internally. English source strings
 * double as both the translation key and the fallback: when no `t` is on the
 * context (or it throws), the raw template text is interpolated as-is.
 *
 * @param {string[]} strings Template literal static parts.
 * @param {...unknown} values Template literal interpolations.
 * @returns {string} The translated (or fallback) text.
 */
export function translateText(strings, ...values) {
    const reduce = () => strings.reduce(
        (acc, part, index) => acc + part + (index < values.length ? String(values[index]) : ''),
        '',
    );

    const t = getContextOrNull()?.t;
    if (typeof t !== 'function') {
        return reduce();
    }

    try {
        return t(strings, ...values);
    } catch (error) {
        console.warn(`[${MODULE_NAME}] Translation failed; falling back to the source string`, error);
        return reduce();
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
        return { hasOverride: true, title: translateText`Model: ${override}` };
    }

    return { hasOverride: false, title: translateText`Set a model for this member` };
}

/**
 * Reads the avatar ID of the character a group member row represents.
 *
 * SillyTavern sets the row's avatar with `template.data('id', avatar)`, which
 * writes only jQuery's data store — no DOM attribute — so the store is tried
 * first. The `data-id` attribute branch is a forward-compatible fallback for a
 * future SillyTavern that writes the attribute directly, and `data-chid` maps
 * to the character index as a last resort. Avatar ID is the storage key, never
 * the display name.
 *
 * @param {Element} row A `.group_member` row.
 * @returns {string|null} Avatar ID, or null when the row identifies no member.
 */
export function resolveMemberAvatarId(row) {
    const jQuery = globalThis.jQuery ?? globalThis.$;
    const fromDataStore = jQuery?.(row)?.data?.('id');
    if (typeof fromDataStore === 'string' && fromDataStore) {
        return fromDataStore;
    }

    const fromAttribute = row.getAttribute('data-id');
    if (fromAttribute) {
        return fromAttribute;
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
 * Reports whether a keyboard event activates the model button.
 *
 * Enter and Space are the activating keys for an element with `role="button"`.
 * Space scrolls the page by default, so both must be prevented; stopping
 * propagation keeps SillyTavern's document-level handlers from also firing.
 *
 * @param {KeyboardEvent} event The keydown event.
 * @returns {boolean} True when the key activates the button.
 */
export function handleButtonKeydown(event) {
    if (event?.key !== 'Enter' && event?.key !== ' ') {
        return false;
    }

    event.preventDefault();
    event.stopPropagation();
    return true;
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
            button.addEventListener('keydown', (event) => {
                if (handleButtonKeydown(event)) {
                    openMemberModelInput(getContextOrNull()?.groupId ?? null, memberId);
                }
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
    if (!settings) {
        console.warn(`[${MODULE_NAME}] Cannot open the model dialog without extension settings`);
        return;
    }

    const current = getModelOverride(settings, groupId, memberId);
    const memberName = context.characters?.find((character) => character.avatar === memberId)?.name;
    // The avatar ID is an internal storage key (often a filename); keep it
    // out of the user-facing prompt when a display name is available.
    const label = memberName || memberId;

    const entered = await input(
        translateText`Member model`,
        translateText`Model for ${label}. Leave empty to use SillyTavern's selected model.`,
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
 * Reports whether a node is, or sits inside, a group member list.
 *
 * @param {Element} node Candidate node.
 * @returns {boolean} True when the node is part of a member list.
 */
function isMemberListNode(node) {
    if (node?.nodeType !== 1) {
        return false;
    }

    return Boolean(node.matches?.(MEMBER_LIST_SELECTOR) || node.closest?.(MEMBER_LIST_SELECTOR));
}

/**
 * Reports whether a batch of DOM mutations touched the group member list.
 *
 * SillyTavern streams chat tokens into the DOM many times a second, so watching
 * the whole document and refreshing on every mutation would run a document-wide
 * query on every animation frame. Only member-list mutations are relevant.
 *
 * @param {MutationRecord[]} mutations Mutations delivered by the observer.
 * @returns {boolean} True when at least one mutation affects the member list.
 */
export function mutationsTouchMemberList(mutations) {
    for (const mutation of mutations ?? []) {
        if (isMemberListNode(mutation.target)) {
            return true;
        }

        for (const node of mutation.addedNodes ?? []) {
            if (isMemberListNode(node) || node.querySelector?.(MEMBER_LIST_SELECTOR)) {
                return true;
            }
        }
    }

    return false;
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
        queuedRefresh = null;
        refreshMemberModelButtons();
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
        queuedRefresh = {
            handle: globalThis.requestAnimationFrame(run),
            cancel: (handle) => globalThis.cancelAnimationFrame?.(handle),
        };
    } else {
        queuedRefresh = { handle: setTimeout(run, 0), cancel: (handle) => clearTimeout(handle) };
    }
}

/**
 * Handles mutations delivered by the observer, ignoring everything that does not
 * affect the group member list.
 *
 * @param {MutationRecord[]} mutations Mutations delivered by the observer.
 * @returns {void}
 */
function handleMutations(mutations) {
    if (mutationsTouchMemberList(mutations)) {
        scheduleRefresh();
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

    observer = new globalThis.MutationObserver(handleMutations);
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

    queuedRefresh?.cancel(queuedRefresh.handle);
    queuedRefresh = null;
    refreshScheduled = false;

    for (const button of globalThis.document?.querySelectorAll?.(`.${BUTTON_CLASS}`) ?? []) {
        button.remove();
    }
}
