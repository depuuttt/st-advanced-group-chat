/**
 * One toggle in the shared member-list toolbar hides every member row's tag
 * chips in that group's member lists (the group editor and its popout share the
 * markup).
 *
 * The toolbar strip, its MutationObserver + rAF refresh loop, and editor-group
 * tracking live in `member-list-toolbar.js`; this module is a contributor that
 * seats one button and applies the hidden state. Hiding is pure CSS: a class on
 * each `.rm_group_members` container collapses the `.tags_inline` chips, so
 * SillyTavern's row rebuilds cannot undo it. The rule is scoped to
 * `.tags_inline` inside the member list, so the tag filter box
 * (`.rm_tag_filter` / `.rm_tag_controls`) is never hidden.
 */

import { getSettings, getHideTags, setHideTags } from './model-overrides.js';
import { translateText } from './member-model-button.js';
import {
    registerToolbarButton,
    unregisterToolbarButton,
    syncMemberToolbar,
    createToggleButton,
    getEditorGroupId,
} from './member-list-toolbar.js';

const BUTTON_CLASS = 'st-agc-hide-tags-button';
const HIDDEN_CLASS = 'st-agc-hide-tags';

/**
 * Describes how the toggle should present the current state.
 *
 * @param {boolean} hidden Whether member tags are currently hidden.
 * @returns {{ icon: string, title: string }} Icon ligature and tooltip.
 */
export function getTagsToggleState(hidden) {
    if (hidden) {
        return { icon: 'label_off', title: translateText`Show member tags` };
    }

    return { icon: 'label', title: translateText`Hide member tags` };
}

/**
 * Flips the saved hidden-tags flag for the group the editor shows and re-syncs
 * the toolbar (which re-applies the class to every member list).
 *
 * @returns {void}
 */
export function toggleHideTags() {
    const groupId = getEditorGroupId();
    const settings = getSettings();

    if (!settings || !groupId) {
        return;
    }

    setHideTags(settings, groupId, !getHideTags(settings, groupId));
    syncMemberToolbar();
}

/**
 * Builds the contributor's live toggle button.
 *
 * @param {Document} doc Owner document.
 * @returns {Element} The new button.
 */
function createButton(doc) {
    return createToggleButton(doc, BUTTON_CLASS, toggleHideTags);
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
    const hidden = settings && groupId ? getHideTags(settings, groupId) : false;
    container.classList?.toggle(HIDDEN_CLASS, hidden);

    const { icon, title } = getTagsToggleState(hidden);
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
 * Feature init: register this contributor with the shared toolbar, which runs a
 * sync so the button appears and `update` applies the class at once.
 *
 * @returns {void}
 */
export function initHideMemberTags() {
    registerToolbarButton({
        name: 'hide-tags',
        buttonClass: BUTTON_CLASS,
        createButton,
        update,
        cleanup,
    });
}

/**
 * Feature dispose: unregister this contributor. As the last contributor, the
 * shared module also removes the toolbar, disconnects the observer, and clears
 * the tracked editor group.
 *
 * @returns {void}
 */
export function disposeHideMemberTags() {
    unregisterToolbarButton('hide-tags');
}