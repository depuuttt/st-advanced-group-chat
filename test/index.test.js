import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSillyTavern } from '../test-helpers/fake-sillytavern.js';

/**
 * SillyTavern loads an extension entry module with a dynamic import once the app
 * object exists. Each test re-imports index.js under a fresh URL so the module
 * registry runs again against a fresh fake SillyTavern.
 */
let importCounter = 0;

async function loadIndex({ withSillyTavern = true } = {}) {
    const fake = createFakeSillyTavern({
        groupId: 'group-1',
        characters: [{ avatar: 'bob.png', name: 'Bob' }],
        // The override-pruning feature prunes overrides whose group does not
        // exist at APP_READY, so the fake has to declare the live group.
        groups: [{ id: 'group-1', members: ['bob.png'] }],
    });

    let restore;
    if (withSillyTavern) {
        restore = fake.install();
    } else {
        const previous = globalThis.SillyTavern;
        delete globalThis.SillyTavern;
        restore = () => {
            if (previous === undefined) delete globalThis.SillyTavern;
            else globalThis.SillyTavern = previous;
        };
    }

    importCounter += 1;
    const module = await import(`../index.js?load=${importCounter}`);

    return { module, fake, restore };
}

test('index.js subscribes its entry point to APP_READY', async () => {
    const { fake, restore } = await loadIndex();
    try {
        assert.equal(fake.state.listeners.get('app_ready')?.length, 1);
    } finally {
        restore();
    }
});

test('index.js is importable outside SillyTavern without throwing', async () => {
    const { module, restore } = await loadIndex({ withSillyTavern: false });
    try {
        assert.equal(typeof module.onExtensionReady, 'function');
    } finally {
        restore();
    }
});

test('onExtensionReady initialises every registered feature in registration order', async () => {
    const { module, fake, restore } = await loadIndex();
    try {
        const calls = [];
        module.registerFeature({ name: 'first', init: () => calls.push('first') });
        module.registerFeature({ name: 'second', init: () => calls.push('second') });

        fake.emit('app_ready');

        assert.deepEqual(calls, ['first', 'second']);
    } finally {
        restore();
    }
});

test('onExtensionReady runs a second time only after disposeExtension', async () => {
    const { module, fake, restore } = await loadIndex();
    try {
        let initCalls = 0;
        module.registerFeature({ name: 'counter', init: () => { initCalls += 1; } });

        fake.emit('app_ready');
        fake.emit('app_ready');
        assert.equal(initCalls, 1);

        module.disposeExtension();
        fake.emit('app_ready');
        assert.equal(initCalls, 2);
    } finally {
        restore();
    }
});

test('disposeExtension disposes every registered feature once, newest first', async () => {
    const { module, fake, restore } = await loadIndex();
    try {
        const disposed = [];
        module.registerFeature({ name: 'a', init: () => {}, dispose: () => disposed.push('a') });
        module.registerFeature({ name: 'b', init: () => {}, dispose: () => disposed.push('b') });
        fake.emit('app_ready');

        module.disposeExtension();
        module.disposeExtension();

        assert.deepEqual(disposed, ['b', 'a']);
    } finally {
        restore();
    }
});

test('a feature whose init throws does not stop the remaining features', async () => {
    const { module, fake, restore } = await loadIndex();
    try {
        const originalError = console.error;
        console.error = () => {};
        try {
            const calls = [];
            module.registerFeature({ name: 'broken', init: () => { throw new Error('boom'); } });
            module.registerFeature({ name: 'healthy', init: () => calls.push('healthy') });

            fake.emit('app_ready');

            assert.deepEqual(calls, ['healthy']);
        } finally {
            console.error = originalError;
        }
    } finally {
        restore();
    }
});

test('APP_READY wires the request-routing feature to SillyTavern events', async () => {
    const { module, fake, restore } = await loadIndex();
    try {
        fake.context.extensionSettings.st_advanced_group_chat = {
            modelOverrides: { 'group-1': { 'bob.png': 'bob-model' } },
        };

        fake.emit('app_ready');
        fake.emit('group_member_drafted', 0);

        const request = { model: 'st-default-model', char_name: 'Bob', messages: [] };
        fake.emit('chat_completion_settings_ready', request);

        assert.equal(request.model, 'bob-model');
    } finally {
        restore();
    }
});

test('disposeExtension removes the request-routing listeners', async () => {
    const { module, fake, restore } = await loadIndex();
    try {
        fake.context.extensionSettings.st_advanced_group_chat = {
            modelOverrides: { 'group-1': { 'bob.png': 'bob-model' } },
        };

        fake.emit('app_ready');
        module.disposeExtension();
        fake.emit('group_member_drafted', 0);

        const request = { model: 'st-default-model', char_name: 'Bob', messages: [] };
        fake.emit('chat_completion_settings_ready', request);

        assert.equal(request.model, 'st-default-model');
    } finally {
        restore();
    }
});

/**
 * A minimal fake DOM element: class list synced with `className`, a `dataset`
 * that reflects to `data-*` attributes, and children that `querySelector` can
 * search by class. Enough for member-model-button to add its button and for
 * material-icons to convert the row's buttons.
 */
function makeFakeElement(tag = 'div') {
    const classes = new Set();
    const attrs = {};
    const children = [];
    const dataKey = (k) => 'data-' + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
    const el = {
        tagName: tag,
        textContent: '',
        title: '',
        _children: children,
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
        dataset: new Proxy({}, {
            set: (_t, k, v) => { attrs[dataKey(k)] = String(v); return true; },
            get: (_t, k) => attrs[dataKey(k)],
        }),
        setAttribute: (k, v) => { attrs[k] = String(v); },
        getAttribute: (k) => (k in attrs ? attrs[k] : null),
        addEventListener: () => {},
        prepend: (child) => children.unshift(child),
        appendChild: (child) => { children.push(child); return child; },
        insertBefore: (child, ref) => {
            const i = ref ? children.indexOf(ref) : children.length;
            children.splice(i === -1 ? children.length : i, 0, child);
            return child;
        },
        remove: () => {},
        querySelector: (sel) => {
            const cls = sel.startsWith('.') ? sel.slice(1) : null;
            return cls ? children.find((c) => c.classList.contains(cls)) ?? null : null;
        },
    };
    return el;
}

test('APP_READY registers the hide-member-avatars toggle in the member list', async () => {
    const { fake, restore } = await loadIndex();

    // A container for the member list inside a parent, so the toolbar (with the
    // toggle inside it) can be inserted before the list.
    const container = makeFakeElement();
    container.classList.add('rm_group_members');
    const parent = makeFakeElement();
    parent.appendChild(container);
    container.parentElement = parent;

    const doc = {
        createElement: (tag) => makeFakeElement(tag),
        querySelectorAll: (selector) => {
            if (selector === '.rm_group_members') return [container];
            if (selector === '.st-agc-hide-avatars-button') {
                return parent._children.flatMap((c) => c._children ?? []).filter((c) => c.classList.contains('st-agc-hide-avatars-button'));
            }
            return [];
        },
    };

    const previous = globalThis.document;
    globalThis.document = doc;
    try {
        fake.emit('app_ready');

        const toolbar = parent._children.find((c) => c.classList.contains('st-agc-member-toolbar'));
        assert.ok(toolbar, 'the toolbar was added above the member list');
        assert.equal(parent._children.indexOf(toolbar) + 1, parent._children.indexOf(container), 'toolbar precedes the list');
        const button = toolbar._children.find((c) => c.classList.contains('st-agc-hide-avatars-button'));
        assert.ok(button, 'the toggle button was added inside the toolbar');
        assert.equal(button.textContent, 'visibility', 'default state shows the hide icon');
        assert.equal(container.classList.contains('st-agc-hide-avatars'), false, 'avatars shown by default');
    } finally {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
        restore();
    }
});

test('APP_READY hides the member avatars when the open group has them hidden', async () => {
    const { fake, restore } = await loadIndex();

    const container = makeFakeElement();
    container.classList.add('rm_group_members');

    const doc = {
        createElement: (tag) => makeFakeElement(tag),
        querySelectorAll: (selector) => {
            if (selector === '.rm_group_members') return [container];
            if (selector === '.rm_group_members_pagination') return [];
            return [];
        },
    };

    const previous = globalThis.document;
    globalThis.document = doc;
    try {
        fake.context.extensionSettings.st_advanced_group_chat = {
            modelOverrides: {},
            hideAvatars: { 'group-1': true },
        };

        fake.emit('app_ready');

        assert.ok(container.classList.contains('st-agc-hide-avatars'), 'saved hidden state applied');
    } finally {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
        restore();
    }
});

test('APP_READY composes member-model-button and material-icons on a member row', async () => {
    const { fake, restore } = await loadIndex();
    const disableButton = makeFakeElement();
    disableButton.className = 'right_menu_button fa-solid fa-lg fa-comment-slash';
    disableButton.setAttribute('data-action', 'disable');
    const iconSlot = makeFakeElement();
    iconSlot.classList.add('group_member_icon');
    iconSlot._children.push(disableButton);
    const row = makeFakeElement();
    row.classList.add('group_member');
    row.setAttribute('data-id', 'bob.png');
    row.querySelector = (sel) => {
        if (sel === '.group_member_icon') return iconSlot;
        if (sel.startsWith('.')) return iconSlot._children.find((c) => c.classList.contains(sel.slice(1))) ?? null;
        return null;
    };

    const head = makeFakeElement('head');
    head.querySelector = (sel) => (sel.startsWith('#')
        ? head._children.find((el) => el.getAttribute('id') === sel.slice(1)) ?? null
        : null);
    const doc = {
        head,
        createElement: (tag) => makeFakeElement(tag),
        querySelectorAll: (selector) => {
            if (selector === '.rm_group_members .group_member') return [row];
            if (selector === '.rm_group_members .right_menu_button') return iconSlot._children;
            return [];
        },
    };

    const previous = globalThis.document;
    globalThis.document = doc;
    try {
        fake.emit('app_ready');
    } finally {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
        restore();
    }

    // member-model-button added the model button; material-icons converted both.
    const modelButton = iconSlot._children.find((c) => c.classList.contains('st-agc-model-button'));
    assert.ok(modelButton, 'model button was added');
    assert.equal(modelButton.textContent, 'smart_toy');
    assert.equal(disableButton.textContent, 'comments_disabled');
    assert.ok(disableButton.classList.contains('st-agc-material-icon'));
    assert.equal(disableButton.getAttribute('data-action'), 'disable');
});