/**
 * One toggle under the member-list pagination hides every avatar in that
 * group's member lists (the group editor and its popout share the markup).
 *
 * Hiding is pure CSS: a class on each `.rm_group_members` container collapses
 * the `.avatar` blocks, so SillyTavern's row rebuilds cannot undo it. The
 * toggle button and the class are (re)applied by a MutationObserver that
 * follows the same coalescing pattern as `member-model-button.js`, because
 * SillyTavern re-renders the list without emitting an event — and because
 * the popout *clones* the drawer HTML, which copies our button without its
 * listeners.
 */

import { getSettings, getHideAvatars, setHideAvatars } from './model-overrides.js';
import { translateText, handleButtonKeydown, mutationsTouchMemberList } from './member-model-button.js';

const MODULE_NAME = 'st_advanced_group_chat';

const MEMBER_LIST_SELECTOR = '.rm_group_members';
const PAGINATION_SELECTOR = '.rm_group_members_pagination';
const BUTTON_CLASS = 'st-agc-hide-avatars-button';
const MATERIAL_CLASS = 'st-agc-material-icon';
const HIDDEN_CLASS = 'st-agc-hide-avatars';

/** @type {MutationObserver|null} */
let observer = null;

/**
 * Buttons this module created and still bound to their listeners. HTML clones
 * (the popout copies the drawer markup) carry classes and attributes but not
 * expando properties, so this set is what separates a live button from a dead
 * clone.
 *
 * @type {WeakSet<Element>}
 */
const liveButtons = new WeakSet();

/**
 * The group whose member list the editor last rendered. SillyTavern's
 * `context.groupId` is the group whose *chat* is open, which is not always the
 * group on screen in the editor (and is null while creating a new group), so
 * the editor's own selection is tracked from its `groupSelected` event.
 *
 * @type {string|null}
 */
let editorGroupId = null;

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
 * Records the group the editor just selected.
 *
 * Subscribed to SillyTavern's `groupSelected` event, which carries
 * `{ detail: { id, group } }` with the editor's group id (null while creating
 * a new group).
 *
 * @param {{ detail?: { id?: unknown } }} [event] Event payload.
 * @returns {void}
 */
export function handleGroupSelected(event) {
    const id = event?.detail?.id;
    editorGroupId = typeof id === 'string' && id ? id : null;
    syncHideAvatarUI();
}

/**
 * Returns the group whose member list the editor is showing.
 *
 * Prefers the editor's last `groupSelected` id; falls back to the chat's
 * selected group when the editor has not selected one yet.
 *
 * @returns {string|null} Group ID, or null when neither is known.
 */
export function getEditorGroupId() {
    return editorGroupId ?? getContextOrNull()?.groupId ?? null;
}

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
 * Creates a fresh toggle button bound to live listeners.
 *
 * @param {Document} doc Owner document.
 * @returns {Element} The new button.
 */
function createToggleButton(doc) {
    const button = doc.createElement('div');
    button.className = `${BUTTON_CLASS} ${MATERIAL_CLASS}`;
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');

    // The button sits outside SillyTavern's `.right_menu_button` system, but
    // its document-level handlers fire on many containers; stopping the event
    // keeps them from also reacting to a toggle click.
    button.addEventListener('click', (event) => {
        event?.stopPropagation?.();
        toggleHideAvatars();
    });
    button.addEventListener('keydown', (event) => {
        if (handleButtonKeydown(event)) {
            event.stopPropagation();
            toggleHideAvatars();
        }
    });

    return button;
}

/**
 * Applies the saved hidden state to every member list and (re)binds the toggle
 * buttons after every pagination element.
 *
 * Safe to call at any time: it reads the DOM lazily and returns quietly when
 * SillyTavern or the document is not there yet.
 *
 * @returns {void}
 */
export function syncHideAvatarUI() {
    const doc = globalThis.document;
    if (!doc?.querySelectorAll) {
        return;
    }

    const groupId = getEditorGroupId();
    const settings = getSettings();
    const hidden = settings && groupId ? getHideAvatars(settings, groupId) : false;
    const { icon, title } = getToggleState(hidden);

    for (const container of doc.querySelectorAll(MEMBER_LIST_SELECTOR) ?? []) {
        container.classList?.toggle(HIDDEN_CLASS, hidden);
    }

    for (const pagination of doc.querySelectorAll(PAGINATION_SELECTOR) ?? []) {
        const parent = pagination.parentElement;
        if (!parent) {
            continue;
        }

        // A button created by this module is reused as-is: its listeners stay
        // attached and the node stays stable across refresh passes. Replacing
        // it on every pass churns the DOM at observer rate, and a real click
        // (mousedown … mouseup) then straddles a replacement, so the click
        // event never fires on a live listener. HTML clones — the popout copies
        // the drawer markup — and leftovers are not in `liveButtons`, so only
        // those are removed and replaced with a freshly bound button.
        let button = null;
        for (const existing of parent.querySelectorAll?.(`.${BUTTON_CLASS}`) ?? []) {
            if (!button && liveButtons.has(existing)) {
                button = existing;
            } else {
                existing.remove?.();
            }
        }

        if (!button) {
            button = createToggleButton(doc);
            liveButtons.add(button);
        }

        // Move the button into place only when it is not already right after
        // the pagination: inserting it where it already sits would touch the
        // DOM on every pass for no change.
        const sibling = pagination.nextElementSibling ?? null;
        const inPlace = button.parentNode === parent && sibling === button;
        if (!inPlace) {
            if (sibling && sibling.parentNode === parent) {
                parent.insertBefore(button, sibling);
            } else {
                parent.appendChild(button);
            }
        }

        // Guarded writes: same-value textContent/title assignments still mutate
        // the DOM, and this function runs at observer rate.
        if (button.textContent !== icon) {
            button.textContent = icon;
        }
        if (button.title !== title) {
            button.title = title;
        }
    }
}

/**
 * Refreshes on the next animation frame, coalescing the burst of mutations
 * that rendering a member list produces.
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
        syncHideAvatarUI();
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
 * Handles mutations delivered by the observer, ignoring everything that does
 * not affect the group member list.
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
 * Feature init: sync the UI once and start watching for member-list re-renders.
 *
 * @returns {void}
 */
export function initHideMemberAvatars() {
    syncHideAvatarUI();

    const context = getContextOrNull();
    const { eventSource, eventTypes } = context ?? {};
    const groupSelected = eventTypes?.GROUP_SELECTED ?? 'groupSelected';

    if (eventSource?.on) {
        eventSource.on(groupSelected, handleGroupSelected);
    }

    const doc = globalThis.document;
    if (typeof globalThis.MutationObserver === 'undefined' || !doc?.body) {
        console.warn(`[${MODULE_NAME}] Hide-avatars toggle is not watching for re-renders`);
        return;
    }

    if (observer) {
        return;
    }

    observer = new globalThis.MutationObserver(handleMutations);
    observer.observe(doc.body, { childList: true, subtree: true });
}

/**
 * Feature dispose: stop watching and remove every button and class we added.
 *
 * @returns {void}
 */
export function disposeHideMemberAvatars() {
    const context = getContextOrNull();
    const { eventSource, eventTypes } = context ?? {};
    const groupSelected = eventTypes?.GROUP_SELECTED ?? 'groupSelected';

    if (eventSource?.removeListener) {
        eventSource.removeListener(groupSelected, handleGroupSelected);
    }

    editorGroupId = null;

    observer?.disconnect();
    observer = null;

    // Invalidate a pending rAF callback: it captures `run`, which must not
    // re-sync (and re-create buttons) after dispose.
    queuedRefresh?.cancel(queuedRefresh.handle);
    queuedRefresh = null;
    refreshScheduled = false;

    const doc = globalThis.document;
    if (!doc?.querySelectorAll) {
        return;
    }

    for (const button of doc.querySelectorAll(`.${BUTTON_CLASS}`) ?? []) {
        button.remove?.();
    }

    for (const container of doc.querySelectorAll(MEMBER_LIST_SELECTOR) ?? []) {
        container.classList?.remove(HIDDEN_CLASS);
    }
}

/**
 * Test-only: clears the tracked editor group so module-level state does not
 * leak between tests in the same process.
 *
 * @returns {void}
 */
export function __resetEditorGroupIdForTests() {
    editorGroupId = null;
}