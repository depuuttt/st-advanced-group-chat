/**
 * One toggle in the shared member-list toolbar hides every avatar in that
 * group's member lists (the group editor and its popout share the markup).
 *
 * The toolbar strip, its MutationObserver + rAF refresh loop, and editor-group
 * tracking live in `member-list-toolbar.js`; this module is a contributor that
 * seats one button and applies the hidden state. Hiding is pure CSS: a class on
 * each `.rm_group_members` container collapses the `.avatar` blocks, so
 * SillyTavern's row rebuilds cannot undo it.
 */

import { getSettings, getHideAvatars, setHideAvatars } from './model-overrides.js';
import { translateText } from './member-model-button.js';
import {
    MEMBER_LIST_SELECTOR,
    registerToolbarButton,
    unregisterToolbarButton,
    syncMemberToolbar,
    createToggleButton,
    getEditorGroupId,
} from './member-list-toolbar.js';

const BUTTON_CLASS = 'st-agc-hide-avatars-button';
const HIDDEN_CLASS = 'st-agc-hide-avatars';

/**
 * Describes how the toggle should present the current state.
 *
 * @param {boolean} hidden Whether avatars are currently hidden.
 * @returns {{ icon: string, title: string }} Icon ligature and tooltip.
 */
export function getToggleState(hidden) {
    if (hidden) {
        return { icon: 'visibility_off', title: translateText`Show member avatars` };
    }

    return { icon: 'visibility', title: translateText`Hide member avatars` };
}

/**
 * Flips the saved hidden-avatars flag for the group the editor shows and
 * re-syncs the UI.
 *
 * @returns {void}
 */
export function toggleHideAvatars() {
    const groupId = getEditorGroupId();
    const settings = getSettings();

    if (!settings || !groupId) {
        return;
    }

    setHideAvatars(settings, groupId, !getHideAvatars(settings, groupId));
    syncHideAvatarUI();
}

/**
 * Builds the contributor's live toggle button.
 *
 * @param {Document} doc Owner document.
 * @returns {Element} The new button.
 */
function createButton(doc) {
    return createToggleButton(doc, BUTTON_CLASS, toggleHideAvatars);
}

/**
 * Applies the saved hidden state to one member list and its button.
 *
 * Guarded writes: same-value `textContent`/`title` assignments still mutate the
 * DOM, and this runs at observer rate.
 *
 * @param {Element} button The contributor's button.
 * @param {Element} container A `.rm_group_members` member list.
 * @param {string|null} groupId The group the editor shows.
 * @param {object|null} settings Extension settings object.
 * @returns {void}
 */
function update(button, container, groupId, settings) {
    const hidden = settings && groupId ? getHideAvatars(settings, groupId) : false;
    container.classList?.toggle(HIDDEN_CLASS, hidden);

    const { icon, title } = getToggleState(hidden);
    if (button.textContent !== icon) {
        button.textContent = icon;
    }
    if (button.title !== title) {
        button.title = title;
    }
}

/**
 * Removes the hidden class from a member list when the contributor leaves.
 *
 * @param {Element} container A `.rm_group_members` member list.
 * @returns {void}
 */
function cleanup(container) {
    container.classList?.remove(HIDDEN_CLASS);
}

/**
 * Applies the saved hidden state to every member list, including any the shared
 * toolbar pass skips because it has no parent (the toolbar needs one to sit
 * beside). Kept as its own pass, as it was before the toolbar was extracted.
 *
 * @returns {void}
 */
function applyHiddenClass() {
    const doc = globalThis.document;
    const groupId = getEditorGroupId();
    const settings = getSettings();
    const hidden = settings && groupId ? getHideAvatars(settings, groupId) : false;

    for (const container of doc?.querySelectorAll?.(MEMBER_LIST_SELECTOR) ?? []) {
        container.classList?.toggle(HIDDEN_CLASS, hidden);
    }
}

/**
 * Re-applies the hidden class to every member list and re-syncs the toolbar.
 *
 * @returns {void}
 */
export function syncHideAvatarUI() {
    applyHiddenClass();
    syncMemberToolbar();
}

/**
 * Feature init: register this contributor with the shared toolbar, which starts
 * the observer and `groupSelected` listener on the first registration.
 *
 * @returns {void}
 */
export function initHideMemberAvatars() {
    registerToolbarButton({
        name: 'hide-avatars',
        buttonClass: BUTTON_CLASS,
        createButton,
        update,
        cleanup,
    });

    // Registering runs the shared sync (toolbar + button, and `update` applies
    // the class to parented lists); this also covers any member list the
    // toolbar pass skips for lack of a parent.
    applyHiddenClass();
}

/**
 * Feature dispose: unregister this contributor. As the last contributor, the
 * shared module also removes the toolbar, disconnects the observer, and clears
 * the tracked editor group.
 *
 * @returns {void}
 */
export function disposeHideMemberAvatars() {
    unregisterToolbarButton('hide-avatars');
}