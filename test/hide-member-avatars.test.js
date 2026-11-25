import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSillyTavern } from '../test-helpers/fake-sillytavern.js';
import {
    getToggleState,
    syncHideAvatarUI,
    toggleHideAvatars,
    initHideMemberAvatars,
    disposeHideMemberAvatars,
} from '../src/hide-member-avatars.js';

const GROUP = 'group-1';
const HIDDEN_CLASS = 'st-agc-hide-avatars';
const BUTTON_CLASS = 'st-agc-hide-avatars-button';

/**
 * A fake DOM element carrying only what the module reads: class list, attributes,
 * children, parent/nextElementSibling links, and the insertion/removal methods.
 */
function makeElement(tag = 'div') {
    const classes = new Set();
    const attrs = {};
    const children = [];
    const relink = () => {
        children.forEach((c, i) => { c.nextElementSibling = children[i + 1] ?? null; });
    };
    const el = {
        tagName: tag,
        textContent: '',
        title: '',
        _children: children,
        _listeners: [],
        _removed: false,
        parentNode: null,
        parentElement: null,
        nextElementSibling: null,
        get className() { return [...classes].join(' '); },
        set className(v) {
            classes.clear();
            String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
        },
        classList: {
            contains: (c) => classes.has(c),
            add: (...cs) => cs.forEach((c) => classes.add(c)),
            remove: (...cs) => cs.forEach((c) => classes.delete(c)),
            toggle: (c, force) => {
                const on = force === undefined ? !classes.has(c) : force;
                on ? classes.add(c) : classes.delete(c);
                return on;
            },
        },
        setAttribute: (k, v) => { attrs[k] = String(v); },
        getAttribute: (k) => (k in attrs ? attrs[k] : null),
        addEventListener: (type, fn) => el._listeners.push({ type, fn }),
        prepend: (child) => { children.unshift(child); child.parentNode = el; child.parentElement = el; relink(); },
        appendChild: (child) => { children.push(child); child.parentNode = el; child.parentElement = el; relink(); return child; },
        insertBefore: (child, ref) => {
            const i = ref ? children.indexOf(ref) : children.length;
            children.splice(i === -1 ? children.length : i, 0, child);
            child.parentNode = el;
            child.parentElement = el;
            relink();
            return child;
        },
        remove: () => {
            el._removed = true;
            if (el.parentNode?._children) {
                const i = el.parentNode._children.indexOf(el);
                if (i !== -1) el.parentNode._children.splice(i, 1);
            }
            if (el.nextElementSibling) el.nextElementSibling = null;
        },
        querySelector: (sel) => {
            const cls = sel.startsWith('.') ? sel.slice(1) : null;
            return cls ? children.find((c) => c.classList.contains(cls)) ?? null : null;
        },
        click() {
            for (const { type, fn } of el._listeners) {
                if (type === 'click') fn({ stopPropagation() {} });
            }
        },
    };
    return el;
}

/**
 * Installs a fake SillyTavern plus a fake document serving `containers`
 * (`.rm_group_members`) and `paginations` (`.rm_group_members_pagination`).
 * The fake tracks every created element so the button-class query works, and
 * counts MutationObserver instances so double-init is observable.
 */
function installDocument({ containers = [], paginations = [], rafImmediate = true } = {}) {
    const fake = createFakeSillyTavern({ groupId: GROUP });
    const restoreFake = fake.install();

    const created = [];
    const doc = {
        body: {},
        createElement: (tag) => {
            const el = makeElement(tag);
            created.push(el);
            return el;
        },
        querySelectorAll: (selector) => {
            if (selector === '.rm_group_members') return containers;
            if (selector === '.rm_group_members_pagination') return paginations;
            if (selector === '.st-agc-hide-avatars-button') {
                return created.filter((c) => c.classList.contains('st-agc-hide-avatars-button'));
            }
            return [];
        },
    };

    const previous = {
        document: globalThis.document,
        MutationObserver: globalThis.MutationObserver,
        requestAnimationFrame: globalThis.requestAnimationFrame,
        cancelAnimationFrame: globalThis.cancelAnimationFrame,
    };

    let observerCallback = null;
    let observerCount = 0;
    globalThis.document = doc;
    globalThis.MutationObserver = class {
        constructor(callback) {
            observerCallback = callback;
            observerCount += 1;
            this.disconnected = false;
        }
        observe() {}
        disconnect() { this.disconnected = true; }
    };
    const cancelled = [];
    globalThis.requestAnimationFrame = (fn) => (rafImmediate ? (fn(), 1) : 1);
    globalThis.cancelAnimationFrame = (handle) => cancelled.push(handle);

    const restore = () => {
        globalThis.document = previous.document;
        globalThis.MutationObserver = previous.MutationObserver;
        globalThis.requestAnimationFrame = previous.requestAnimationFrame;
        globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
        restoreFake();
    };

    return {
        fake,
        doc,
        created,
        restore,
        cancelled,
        getObserverCallback: () => observerCallback,
        getObserverCount: () => observerCount,
    };
}

test('getToggleState shows visibility with a hide title when avatars are shown', () => {
    const restore = createFakeSillyTavern().install();
    try {
        const state = getToggleState(false);
        assert.equal(state.icon, 'visibility');
        assert.equal(state.title, 'Hide member avatars');
    } finally {
        restore();
    }
});

test('getToggleState shows visibility_off with a show title when avatars are hidden', () => {
    const restore = createFakeSillyTavern().install();
    try {
        const state = getToggleState(true);
        assert.equal(state.icon, 'visibility_off');
        assert.equal(state.title, 'Show member avatars');
    } finally {
        restore();
    }
});

test('toggleHideAvatars flips the saved state and re-syncs the containers', () => {
    const container = makeElement();
    container.classList.add('rm_group_members');
    const pagination = makeElement();
    const parent = makeElement();
    pagination.parentElement = parent;
    parent.appendChild(pagination);
    parent.appendChild(container);

    const { fake, restore } = installDocument({ containers: [container], paginations: [pagination] });
    try {
        toggleHideAvatars();

        const settings = fake.context.extensionSettings.st_advanced_group_chat;
        assert.equal(settings.hideAvatars[GROUP], true);
        assert.ok(container.classList.contains(HIDDEN_CLASS), 'container gets the hidden class');
        assert.equal(fake.state.saveCount, 1);
    } finally {
        restore();
    }
});

test('syncHideAvatarUI applies the state of the group SillyTavern has open', () => {
    const container = makeElement();
    container.classList.add('rm_group_members');

    const { fake, restore } = installDocument({ containers: [container] });
    try {
        fake.context.extensionSettings.st_advanced_group_chat = { modelOverrides: {}, hideAvatars: { 'group-2': true } };

        fake.context.groupId = 'group-2';
        syncHideAvatarUI();
        assert.ok(container.classList.contains(HIDDEN_CLASS), 'group-2 hidden → class on');

        fake.context.groupId = GROUP;
        syncHideAvatarUI();
        assert.equal(container.classList.contains(HIDDEN_CLASS), false, 'group-1 shown → class off');
    } finally {
        restore();
    }
});

test('syncHideAvatarUI inserts one button after every pagination container', () => {
    const editorPagination = makeElement();
    const popoutPagination = makeElement();
    const editorParent = makeElement();
    const popoutParent = makeElement();
    editorPagination.parentElement = editorParent;
    popoutPagination.parentElement = popoutParent;
    editorParent.appendChild(editorPagination);
    popoutParent.appendChild(popoutPagination);

    const { restore } = installDocument({ paginations: [editorPagination, popoutPagination] });
    try {
        syncHideAvatarUI();

        for (const parent of [editorParent, popoutParent]) {
            const button = parent._children.find((c) => c.classList.contains(BUTTON_CLASS));
            assert.ok(button, 'a toggle button is inserted');
            assert.equal(button.getAttribute('role'), 'button');
            assert.equal(button.getAttribute('tabindex'), '0');
            assert.ok(button.classList.contains('st-agc-material-icon'));
            assert.equal(button.textContent, 'visibility');
        }
    } finally {
        restore();
    }
});

test('syncHideAvatarUI replaces a cloned button that carries the class but no live listener', () => {
    const pagination = makeElement();
    const parent = makeElement();
    pagination.parentElement = parent;
    parent.appendChild(pagination);

    const clone = makeElement();
    clone.className = `${BUTTON_CLASS} st-agc-material-icon`;
    parent.appendChild(clone);

    const { restore } = installDocument({ paginations: [pagination] });
    try {
        syncHideAvatarUI();

        const buttons = parent._children.filter((c) => c.classList.contains(BUTTON_CLASS));
        assert.equal(buttons.length, 1, 'the dead clone was replaced, not kept');
        assert.notEqual(buttons[0], clone);
        assert.ok(clone._removed, 'the stale clone was removed');
    } finally {
        restore();
    }
});

test('initHideMemberAvatars twice starts one observer', () => {
    const { restore, getObserverCount } = installDocument();
    try {
        initHideMemberAvatars();
        initHideMemberAvatars();
        assert.equal(getObserverCount(), 1, 'a second init must not attach a second observer');
    } finally {
        disposeHideMemberAvatars();
        restore();
    }
});

test('initHideMemberAvatars survives a missing document', () => {
    const previous = globalThis.document;
    delete globalThis.document;
    try {
        initHideMemberAvatars();
    } finally {
        disposeHideMemberAvatars();
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
    }
});

test('observer callback re-syncs after a member-list mutation', () => {
    const container = makeElement();
    container.classList.add('rm_group_members');

    const { fake, restore, getObserverCallback } = installDocument({ containers: [container] });
    try {
        fake.context.extensionSettings.st_advanced_group_chat = { modelOverrides: {}, hideAvatars: { [GROUP]: true } };
        initHideMemberAvatars();

        const memberList = { nodeType: 1, matches: (sel) => sel === '.rm_group_members' };
        const callback = getObserverCallback();
        assert.equal(typeof callback, 'function', 'the observer was created');
        callback([{ target: memberList, addedNodes: [] }]);

        assert.ok(container.classList.contains(HIDDEN_CLASS), 'mutation re-applied the hidden class');
    } finally {
        disposeHideMemberAvatars();
        restore();
    }
});

test('disposeHideMemberAvatars removes buttons, container class, and observer', () => {
    const container = makeElement();
    container.classList.add('rm_group_members');
    container.classList.add(HIDDEN_CLASS);

    const pagination = makeElement();
    const parent = makeElement();
    pagination.parentElement = parent;
    parent.appendChild(pagination);

    const { restore, cancelled, getObserverCallback } = installDocument({
        containers: [container],
        paginations: [pagination],
        rafImmediate: false,
    });
    try {
        initHideMemberAvatars();
        // A member-list mutation queues a refresh (handle 1) that dispose cancels.
        const memberList = { nodeType: 1, matches: (sel) => sel === '.rm_group_members' };
        getObserverCallback()([{ target: memberList, addedNodes: [] }]);
        assert.equal(cancelled.length, 0, 'nothing cancelled before dispose');

        disposeHideMemberAvatars();

        const buttons = parent._children.filter((c) => c.classList.contains(BUTTON_CLASS));
        assert.equal(buttons.length, 0, 'buttons removed');
        assert.ok(buttons.every((b) => b._removed));
        assert.equal(container.classList.contains(HIDDEN_CLASS), false, 'container class removed');
        assert.ok(cancelled.includes(1), 'the queued refresh handle 1 was cancelled');
    } finally {
        restore();
    }
});