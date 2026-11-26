/**
 * Shared toolbar strip above each group member list.
 *
 * A plain container div is inserted as a **sibling above** every
 * `.rm_group_members` — never a child, because SillyTavern wipes the list's
 * children on every render — styled by `style.css` to read as the list card's
 * header. Features (hide avatars today, hide tags next) register a contributor
 * and get a button seated, in registration order, inside that toolbar.
 *
 * The toolbar and its buttons are (re)applied by a MutationObserver that
 * follows the same coalescing pattern as `member-model-button.js`, because
 * SillyTavern re-renders the list without emitting an event — and because the
 * popout *clones* the drawer HTML, which copies our nodes without their
 * listeners. Live nodes are tracked in WeakSets; HTML clones are dead and
 * replaced. Every DOM write is guarded so a second pass over unchanged DOM
 * touches nothing.
 */

import { getSettings } from './model-overrides.js';
import { handleButtonKeydown, mutationsTouchMemberList } from './member-model-button.js';

const MODULE_NAME = 'st_advanced_group_chat';

export const MEMBER_LIST_SELECTOR = '.rm_group_members';
export const TOOLBAR_CLASS = 'st-agc-member-toolbar';

const MATERIAL_CLASS = 'st-agc-material-icon';
const TOOLBAR_BUTTON_CLASS = 'st-agc-toolbar-button';

/**
 * Registered contributors, keyed by name, in registration order. A `Map` keeps
 * insertion order and makes registration idempotent by name.
 *
 * @type {Map<string, { name: string, buttonClass: string, createButton: (doc: Document) => Element, update: (button: Element, container: Element, groupId: string|null, settings: object|null) => void, cleanup?: (container: Element) => void }>}
 */
const contributors = new Map();

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
 * Toolbars this module created (same clone rule as `liveButtons`).
 *
 * @type {WeakSet<Element>}
 */
const liveToolbars = new WeakSet();

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
 * Records the group the editor just selected, then re-syncs the toolbar.
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
    syncMemberToolbar();
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
 * Creates a fresh toolbar container (no listeners — contributors append their
 * own buttons into it).
 *
 * @param {Document} doc Owner document.
 * @returns {Element} The new toolbar.
 */
function createToolbar(doc) {
    const toolbar = doc.createElement('div');
    toolbar.className = TOOLBAR_CLASS;
    return toolbar;
}

/**
 * Creates a fresh toggle button bound to live listeners.
 *
 * The button sits outside SillyTavern's `.right_menu_button` system, but its
 * document-level handlers fire on many containers; stopping the event keeps
 * them from also reacting to a toggle.
 *
 * @param {Document} doc Owner document.
 * @param {string} buttonClass Contributor-specific class for the button.
 * @param {() => void} onActivate Runs when the button is activated.
 * @returns {Element} The new button.
 */
export function createToggleButton(doc, buttonClass, onActivate) {
    const button = doc.createElement('div');
    button.className = `${buttonClass} ${TOOLBAR_BUTTON_CLASS} ${MATERIAL_CLASS}`;
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');

    button.addEventListener('click', (event) => {
        event?.stopPropagation?.();
        onActivate();
    });
    button.addEventListener('keydown', (event) => {
        if (handleButtonKeydown(event)) {
            event.stopPropagation();
            onActivate();
        }
    });

    return button;
}

/**
 * Finds the live toolbar among a member list's siblings, or `null` when the
 * only toolbars present are dead clones (which the caller replaces).
 *
 * @param {Element} parent Member list's parent.
 * @returns {Element|null} The live toolbar, or null.
 */
function findLiveToolbar(parent) {
    let toolbar = null;
    for (const existing of parent.querySelectorAll?.(`.${TOOLBAR_CLASS}`) ?? []) {
        if (!toolbar && liveToolbars.has(existing)) {
            toolbar = existing;
        }
    }
    return toolbar;
}

/**
 * One pass over every `.rm_group_members`: find or create the live toolbar
 * (sibling immediately before the list), then per contributor in registration
 * order find or create its live button, seat it in order, and call its
 * `update`. Dead clones are removed.
 *
 * Safe to call at any time: it reads the DOM lazily and returns quietly when
 * SillyTavern or the document is not there yet.
 *
 * @returns {void}
 */
export function syncMemberToolbar() {
    const doc = globalThis.document;
    if (!doc?.querySelectorAll) {
        return;
    }

    const groupId = getEditorGroupId();
    const settings = getSettings();

    for (const container of doc.querySelectorAll(MEMBER_LIST_SELECTOR) ?? []) {
        const parent = container.parentElement;
        if (!parent) {
            continue;
        }

        // A toolbar created by this module is reused as-is, same clone rules as
        // the buttons: HTML clones (the popout copies the drawer markup) and
        // leftovers are not in `liveToolbars`, so only those are removed and
        // replaced with a fresh container.
        let toolbar = findLiveToolbar(parent);
        for (const existing of parent.querySelectorAll?.(`.${TOOLBAR_CLASS}`) ?? []) {
            if (existing !== toolbar) {
                existing.remove?.();
            }
        }

        if (!toolbar) {
            toolbar = createToolbar(doc);
            liveToolbars.add(toolbar);
        }

        // Seat the toolbar immediately before the list only when it is not
        // already there: inserting it where it already sits would touch the DOM
        // on every pass for no change.
        if (!(toolbar.parentNode === parent && container.previousElementSibling === toolbar)) {
            parent.insertBefore(toolbar, container);
        }

        // Seat each contributor's button after the previous contributor's, so a
        // second pass over unchanged DOM touches nothing. Replacing a live
        // button on every pass churns the DOM at observer rate, and a real
        // click (mousedown … mouseup) then straddles a replacement, so the
        // click event never fires on a live listener.
        let previousButton = null;
        for (const spec of contributors.values()) {
            let button = null;
            for (const existing of toolbar.querySelectorAll?.(`.${spec.buttonClass}`) ?? []) {
                if (!button && liveButtons.has(existing)) {
                    button = existing;
                } else {
                    existing.remove?.();
                }
            }

            if (!button) {
                button = spec.createButton(doc);
                liveButtons.add(button);
            }

            // The button is seated when its parent is the toolbar and its
            // previous sibling is the previous contributor's button (or none,
            // for the first contributor).
            const seated = button.parentNode === toolbar && button.previousElementSibling === previousButton;
            if (!seated) {
                if (previousButton) {
                    toolbar.insertBefore(button, previousButton.nextElementSibling);
                } else {
                    toolbar.prepend(button);
                }
            }

            spec.update(button, container, groupId, settings);
            previousButton = button;
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
        syncMemberToolbar();
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
 * Starts watching for member-list re-renders and the editor's group selection.
 * Idempotent: the observer and listener are attached once.
 *
 * @returns {void}
 */
function startObserving() {
    const context = getContextOrNull();
    const { eventSource, eventTypes } = context ?? {};
    const groupSelected = eventTypes?.GROUP_SELECTED ?? 'groupSelected';

    if (eventSource?.on) {
        eventSource.on(groupSelected, handleGroupSelected);
    }

    const doc = globalThis.document;
    if (typeof globalThis.MutationObserver === 'undefined' || !doc?.body) {
        console.warn(`[${MODULE_NAME}] Member-list toolbar is not watching for re-renders`);
        return;
    }

    if (observer) {
        return;
    }

    observer = new globalThis.MutationObserver(handleMutations);
    observer.observe(doc.body, { childList: true, subtree: true });
}

/**
 * Registers a toolbar contributor. Idempotent by `spec.name`. The first
 * contributor starts the observer and the `groupSelected` listener; every
 * registration runs a sync so the new button appears at once.
 *
 * @param {{ name: string, buttonClass: string, createButton: (doc: Document) => Element, update: (button: Element, container: Element, groupId: string|null, settings: object|null) => void, cleanup?: (container: Element) => void }} spec Contributor.
 * @returns {void}
 */
export function registerToolbarButton(spec) {
    if (!spec || typeof spec.name !== 'string' || typeof spec.buttonClass !== 'string') {
        console.warn(`[${MODULE_NAME}] registerToolbarButton requires a named contributor with a buttonClass`);
        return;
    }

    const isFirst = contributors.size === 0;
    if (!contributors.has(spec.name)) {
        contributors.set(spec.name, spec);
    }

    if (isFirst) {
        startObserving();
    }

    syncMemberToolbar();
}

/**
 * Unregisters a contributor: removes its buttons and calls its `cleanup` on
 * every member list. When the last contributor leaves, the toolbar is torn down
 * entirely — all toolbars removed, the observer disconnected, the
 * `groupSelected` listener removed, the queued refresh cancelled, and the
 * tracked editor group cleared.
 *
 * @param {string} name Contributor name passed to `registerToolbarButton`.
 * @returns {void}
 */
export function unregisterToolbarButton(name) {
    const spec = contributors.get(name);
    if (!spec) {
        return;
    }
    contributors.delete(name);

    const doc = globalThis.document;
    for (const container of doc?.querySelectorAll?.(MEMBER_LIST_SELECTOR) ?? []) {
        const parent = container.parentElement;
        const toolbar = parent ? findLiveToolbar(parent) : null;
        if (toolbar) {
            for (const existing of toolbar.querySelectorAll?.(`.${spec.buttonClass}`) ?? []) {
                existing.remove?.();
            }
        }
        spec.cleanup?.(container);
    }

    if (contributors.size > 0) {
        return;
    }

    for (const toolbar of doc?.querySelectorAll?.(`.${TOOLBAR_CLASS}`) ?? []) {
        toolbar.remove?.();
    }

    observer?.disconnect();
    observer = null;

    const context = getContextOrNull();
    const { eventSource, eventTypes } = context ?? {};
    const groupSelected = eventTypes?.GROUP_SELECTED ?? 'groupSelected';
    if (eventSource?.removeListener) {
        eventSource.removeListener(groupSelected, handleGroupSelected);
    }

    // Invalidate a pending rAF callback: it captures `run`, which must not
    // re-sync (and re-create buttons) after the last contributor leaves.
    queuedRefresh?.cancel(queuedRefresh.handle);
    queuedRefresh = null;
    refreshScheduled = false;

    editorGroupId = null;
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