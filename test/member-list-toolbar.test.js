import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSillyTavern } from '../test-helpers/fake-sillytavern.js';
import { makeElement, installDocument } from '../test-helpers/fake-dom.js';
import {
    TOOLBAR_CLASS,
    registerToolbarButton,
    unregisterToolbarButton,
    syncMemberToolbar,
    createToggleButton,
    getEditorGroupId,
    handleGroupSelected,
    __resetEditorGroupIdForTests,
} from '../src/member-list-toolbar.js';

const GROUP = 'group-1';

/**
 * A fake toolbar contributor with spies. `update` performs the same guarded
 * writes a real contributor does, so a second sync on unchanged DOM writes
 * nothing; `createButton` builds a live button through the shared factory.
 */
function makeContributor(name, buttonClass, { icon = 'visibility', title = `Toggle ${name}` } = {}) {
    const updates = [];
    const cleanups = [];
    const activations = [];
    const spec = {
        name,
        buttonClass,
        createButton: (doc) => createToggleButton(doc, buttonClass, () => activations.push(name)),
        update: (button, container, groupId, settings) => {
            updates.push({ button, container, groupId, settings });
            if (button.textContent !== icon) button.textContent = icon;
            if (button.title !== title) button.title = title;
        },
        cleanup: (container) => { cleanups.push(container); },
    };
    return { spec, updates, cleanups, activations };
}

/** Builds a member list element carrying the `.rm_group_members` class. */
function makeMemberList() {
    const el = makeElement();
    el.classList.add('rm_group_members');
    return el;
}

test('createToggleButton builds an accessible button that activates on click and keyboard', () => {
    const doc = { createElement: (tag) => makeElement(tag) };
    let activated = 0;
    const button = createToggleButton(doc, 'st-agc-test-button', () => { activated += 1; });

    assert.ok(button.classList.contains('st-agc-test-button'));
    assert.ok(button.classList.contains('st-agc-toolbar-button'));
    assert.ok(button.classList.contains('st-agc-material-icon'));
    assert.equal(button.getAttribute('role'), 'button');
    assert.equal(button.getAttribute('tabindex'), '0');

    button.click();
    assert.equal(activated, 1, 'a click activates the button');

    const keydown = button._listeners.find((l) => l.type === 'keydown');
    let prevented = 0;
    let stopped = 0;
    keydown.fn({ key: 'Enter', preventDefault: () => { prevented += 1; }, stopPropagation: () => { stopped += 1; } });
    assert.equal(activated, 2, 'Enter activates the button');
    assert.ok(prevented >= 1, 'Enter is prevented');
    assert.ok(stopped >= 1, 'Enter stops propagation');

    keydown.fn({ key: 'a', preventDefault: () => { prevented += 1; }, stopPropagation: () => { stopped += 1; } });
    assert.equal(activated, 2, 'a non-activating key does nothing');
});

test('syncMemberToolbar inserts one toolbar with one button per contributor before every list', () => {
    __resetEditorGroupIdForTests();
    const editorContainer = makeMemberList();
    const popoutContainer = makeMemberList();
    const editorParent = makeElement();
    const popoutParent = makeElement();
    editorParent.appendChild(editorContainer);
    popoutParent.appendChild(popoutContainer);

    const { spec } = makeContributor('a', 'st-agc-btn-a');
    const { restore } = installDocument({ containers: [editorContainer, popoutContainer] });
    try {
        registerToolbarButton(spec);

        for (const [parent, container] of [[editorParent, editorContainer], [popoutParent, popoutContainer]]) {
            const toolbars = parent._children.filter((c) => c.classList.contains(TOOLBAR_CLASS));
            assert.equal(toolbars.length, 1, 'exactly one toolbar is inserted');
            const toolbar = toolbars[0];
            assert.equal(toolbar.nextElementSibling, container, 'the toolbar sits immediately before the list');

            const buttons = toolbar._children.filter((c) => c.classList.contains('st-agc-btn-a'));
            assert.equal(buttons.length, 1, 'the toolbar holds one button per contributor');
            const button = buttons[0];
            assert.equal(button.getAttribute('role'), 'button');
            assert.equal(button.getAttribute('tabindex'), '0');
            assert.ok(button.classList.contains('st-agc-material-icon'));
            assert.equal(button.textContent, 'visibility');
        }
    } finally {
        unregisterToolbarButton('a');
        restore();
    }
});

test('one toolbar and one button per contributor are reused across syncs', () => {
    __resetEditorGroupIdForTests();
    const container = makeMemberList();
    const parent = makeElement();
    parent.appendChild(container);

    const { spec } = makeContributor('a', 'st-agc-btn-a');
    const { restore } = installDocument({ containers: [container] });
    try {
        registerToolbarButton(spec);
        syncMemberToolbar();
        const toolbar = parent._children.find((c) => c.classList.contains(TOOLBAR_CLASS));
        const first = toolbar._children.find((c) => c.classList.contains('st-agc-btn-a'));

        syncMemberToolbar();

        const buttons = toolbar._children.filter((c) => c.classList.contains('st-agc-btn-a'));
        assert.equal(buttons.length, 1, 'the live button is reused, not duplicated');
        assert.equal(buttons[0], first, 'the same button node survives, so its listeners stay attached');
        assert.equal(first._removed, false, 'the live button was not removed and re-created');
    } finally {
        unregisterToolbarButton('a');
        restore();
    }
});

test('two contributors seat their buttons in registration order inside one toolbar', () => {
    __resetEditorGroupIdForTests();
    const container = makeMemberList();
    const parent = makeElement();
    parent.appendChild(container);

    const a = makeContributor('a', 'st-agc-btn-a');
    const b = makeContributor('b', 'st-agc-btn-b');
    const { restore } = installDocument({ containers: [container] });
    try {
        registerToolbarButton(a.spec);
        registerToolbarButton(b.spec);
        syncMemberToolbar();

        const toolbars = parent._children.filter((c) => c.classList.contains(TOOLBAR_CLASS));
        assert.equal(toolbars.length, 1, 'one toolbar hosts both contributors');
        const toolbar = toolbars[0];
        assert.ok(toolbar._children[0].classList.contains('st-agc-btn-a'), 'first button is the first contributor');
        assert.ok(toolbar._children[1].classList.contains('st-agc-btn-b'), 'second button is the second contributor');
        assert.equal(toolbar._children.length, 2, 'exactly two buttons, in order');
    } finally {
        unregisterToolbarButton('b');
        unregisterToolbarButton('a');
        restore();
    }
});

test('a dead cloned toolbar and its cloned buttons are replaced', () => {
    __resetEditorGroupIdForTests();
    const container = makeMemberList();
    const parent = makeElement();
    parent.appendChild(container);

    // The popout copies the drawer markup wholesale: a cloned toolbar carrying a
    // cloned button — classes intact, listeners not — must be replaced.
    const staleToolbar = makeElement();
    staleToolbar.className = TOOLBAR_CLASS;
    parent.appendChild(staleToolbar);
    const clone = makeElement();
    clone.className = 'st-agc-btn-a st-agc-material-icon';
    staleToolbar.appendChild(clone);

    const { spec } = makeContributor('a', 'st-agc-btn-a');
    const { restore } = installDocument({ containers: [container] });
    try {
        registerToolbarButton(spec);

        const toolbars = parent._children.filter((c) => c.classList.contains(TOOLBAR_CLASS));
        assert.equal(toolbars.length, 1, 'one toolbar after cleanup');
        assert.notEqual(toolbars[0], staleToolbar);
        assert.ok(staleToolbar._removed, 'the stale toolbar clone was removed');

        const buttons = toolbars[0]._children.filter((c) => c.classList.contains('st-agc-btn-a'));
        assert.equal(buttons.length, 1, 'the dead clone was replaced, not kept');
        assert.notEqual(buttons[0], clone);
    } finally {
        unregisterToolbarButton('a');
        restore();
    }
});

test('a member list with no parent is skipped', () => {
    __resetEditorGroupIdForTests();
    const orphan = makeMemberList();
    orphan.parentElement = null;
    orphan.parentNode = null;

    const { spec } = makeContributor('a', 'st-agc-btn-a');
    const { restore } = installDocument({ containers: [orphan] });
    try {
        registerToolbarButton(spec);
        syncMemberToolbar();
        assert.equal(orphan._children.length, 0, 'nothing was inserted into a parentless list');
    } finally {
        unregisterToolbarButton('a');
        restore();
    }
});

test('a displaced toolbar is reseated as the same node', () => {
    __resetEditorGroupIdForTests();
    const container = makeMemberList();
    const parent = makeElement();
    parent.appendChild(container);

    const { spec } = makeContributor('a', 'st-agc-btn-a');
    const { restore } = installDocument({ containers: [container] });
    try {
        registerToolbarButton(spec);
        const toolbar = parent._children.find((c) => c.classList.contains(TOOLBAR_CLASS));

        // SillyTavern re-inserted something between toolbar and list.
        const intruder = makeElement();
        parent.appendChild(intruder);

        syncMemberToolbar();

        assert.equal(container.previousElementSibling, toolbar, 'the toolbar is back before the list');
        assert.equal(toolbar.parentNode, parent, 'the same live toolbar node was reseated, not recreated');
        const toolbars = parent._children.filter((c) => c.classList.contains(TOOLBAR_CLASS));
        assert.equal(toolbars.length, 1, 'still exactly one toolbar');
    } finally {
        unregisterToolbarButton('a');
        restore();
    }
});

test('a second sync pass performs zero DOM writes with two contributors registered', () => {
    __resetEditorGroupIdForTests();
    const container = makeMemberList();
    const parent = makeElement();
    parent.appendChild(container);

    const a = makeContributor('a', 'st-agc-btn-a');
    const b = makeContributor('b', 'st-agc-btn-b');
    const { restore } = installDocument({ containers: [container] });
    try {
        registerToolbarButton(a.spec);
        registerToolbarButton(b.spec);

        const toolbar = parent._children.find((c) => c.classList.contains(TOOLBAR_CLASS));
        const buttonA = toolbar._children.find((c) => c.classList.contains('st-agc-btn-a'));
        const buttonB = toolbar._children.find((c) => c.classList.contains('st-agc-btn-b'));

        // Count every DOM-mutating path the sync pass can take.
        let writes = 0;
        const wrapWrites = (obj, method) => {
            const original = obj[method];
            obj[method] = (...args) => {
                writes += 1;
                return original(...args);
            };
        };
        const wrapText = (el) => {
            let text = el.textContent;
            let title = el.title;
            Object.defineProperty(el, 'textContent', {
                get: () => text,
                set: (value) => { writes += 1; text = String(value); },
            });
            Object.defineProperty(el, 'title', {
                get: () => title,
                set: (value) => { writes += 1; title = String(value); },
            });
        };
        wrapWrites(parent, 'insertBefore');
        wrapWrites(parent, 'appendChild');
        wrapWrites(toolbar, 'appendChild');
        wrapWrites(toolbar, 'insertBefore');
        wrapWrites(toolbar, 'prepend');
        wrapText(buttonA);
        wrapText(buttonB);

        syncMemberToolbar();

        assert.equal(writes, 0, 'a second pass on unchanged DOM wrote nothing');
    } finally {
        unregisterToolbarButton('b');
        unregisterToolbarButton('a');
        restore();
    }
});

test('registering the same name twice creates one button and one observer', () => {
    __resetEditorGroupIdForTests();
    const container = makeMemberList();
    const parent = makeElement();
    parent.appendChild(container);

    const { spec } = makeContributor('a', 'st-agc-btn-a');
    const { restore, getObserverCount } = installDocument({ containers: [container] });
    try {
        registerToolbarButton(spec);
        registerToolbarButton(spec);
        syncMemberToolbar();

        assert.equal(getObserverCount(), 1, 'a second register must not attach a second observer');
        const toolbar = parent._children.find((c) => c.classList.contains(TOOLBAR_CLASS));
        const buttons = toolbar._children.filter((c) => c.classList.contains('st-agc-btn-a'));
        assert.equal(buttons.length, 1, 'the duplicate name yields one button');
    } finally {
        unregisterToolbarButton('a');
        restore();
    }
});

test('two contributors register behind a single groupSelected listener', () => {
    __resetEditorGroupIdForTests();
    const a = makeContributor('a', 'st-agc-btn-a');
    const b = makeContributor('b', 'st-agc-btn-b');
    const { fake, restore } = installDocument();
    try {
        registerToolbarButton(a.spec);
        registerToolbarButton(b.spec);
        assert.equal(fake.state.listeners.get('groupSelected')?.length, 1, 'one groupSelected listener');
    } finally {
        unregisterToolbarButton('b');
        unregisterToolbarButton('a');
        restore();
    }
});

test('getEditorGroupId prefers the editor selection and falls back to the chat group', () => {
    __resetEditorGroupIdForTests();
    const { fake, restore } = installDocument();
    try {
        assert.equal(getEditorGroupId(), GROUP, 'falls back to the chat group');

        handleGroupSelected({ detail: { id: 'group-2' } });
        assert.equal(getEditorGroupId(), 'group-2');

        // The chat's selected group moving must not override the editor's group.
        fake.context.groupId = 'group-9';
        assert.equal(getEditorGroupId(), 'group-2');
    } finally {
        __resetEditorGroupIdForTests();
        restore();
    }
});

test('handleGroupSelected with a null id falls back to the chat group', () => {
    __resetEditorGroupIdForTests();
    const { fake, restore } = installDocument();
    try {
        fake.context.groupId = 'group-5';
        handleGroupSelected({ detail: { id: null } });
        assert.equal(getEditorGroupId(), 'group-5');
    } finally {
        __resetEditorGroupIdForTests();
        restore();
    }
});

test('the observer callback re-syncs after a member-list mutation', () => {
    __resetEditorGroupIdForTests();
    const container = makeMemberList();
    const parent = makeElement();
    parent.appendChild(container);

    const a = makeContributor('a', 'st-agc-btn-a');
    const { restore, getObserverCallback } = installDocument({ containers: [container] });
    try {
        registerToolbarButton(a.spec);
        const before = a.updates.length;

        const memberList = { nodeType: 1, matches: (sel) => sel === '.rm_group_members' };
        const callback = getObserverCallback();
        assert.equal(typeof callback, 'function', 'the observer was created');
        callback([{ target: memberList, addedNodes: [] }]);

        assert.ok(a.updates.length > before, 'the mutation re-ran the contributor update');
    } finally {
        unregisterToolbarButton('a');
        restore();
    }
});

test('unregistering one of two contributors removes only its buttons and calls its cleanup', () => {
    __resetEditorGroupIdForTests();
    const container = makeMemberList();
    const parent = makeElement();
    parent.appendChild(container);

    const a = makeContributor('a', 'st-agc-btn-a');
    const b = makeContributor('b', 'st-agc-btn-b');
    const { restore } = installDocument({ containers: [container] });
    try {
        registerToolbarButton(a.spec);
        registerToolbarButton(b.spec);
        const toolbar = parent._children.find((c) => c.classList.contains(TOOLBAR_CLASS));

        unregisterToolbarButton('a');

        assert.equal(toolbar._removed, false, 'the toolbar survives while a contributor remains');
        assert.equal(toolbar._children.filter((c) => c.classList.contains('st-agc-btn-a')).length, 0, 'only the leaving contributor buttons are removed');
        assert.equal(toolbar._children.filter((c) => c.classList.contains('st-agc-btn-b')).length, 1, 'the remaining contributor button stays');
        assert.deepEqual(a.cleanups, [container], 'the leaving contributor cleanup ran for the member list');
    } finally {
        unregisterToolbarButton('b');
        unregisterToolbarButton('a');
        restore();
    }
});

test('unregistering the last contributor tears the toolbar down', () => {
    __resetEditorGroupIdForTests();
    const container = makeMemberList();
    const parent = makeElement();
    parent.appendChild(container);

    const a = makeContributor('a', 'st-agc-btn-a');
    const { fake, restore, cancelled, observers, getObserverCallback } = installDocument({
        containers: [container],
        rafImmediate: false,
    });
    try {
        registerToolbarButton(a.spec);

        // A member-list mutation queues a refresh (handle 1) that unregister cancels.
        const memberList = { nodeType: 1, matches: (sel) => sel === '.rm_group_members' };
        getObserverCallback()([{ target: memberList, addedNodes: [] }]);
        assert.equal(cancelled.length, 0, 'nothing cancelled before unregister');

        unregisterToolbarButton('a');

        assert.equal(parent._children.filter((c) => c.classList.contains(TOOLBAR_CLASS)).length, 0, 'the toolbar was removed');
        assert.ok(observers.every((o) => o.disconnected), 'the observer was disconnected');
        assert.ok(cancelled.includes(1), 'the queued refresh handle 1 was cancelled');
        assert.equal(fake.state.listeners.get('groupSelected')?.length ?? 0, 0, 'the groupSelected listener was removed');
    } finally {
        unregisterToolbarButton('a');
        restore();
    }
});

test('register, unregister, register again yields one button and one active observer', () => {
    __resetEditorGroupIdForTests();
    const container = makeMemberList();
    const parent = makeElement();
    parent.appendChild(container);

    const { spec } = makeContributor('a', 'st-agc-btn-a');
    const { restore, observers } = installDocument({ containers: [container] });
    try {
        registerToolbarButton(spec);
        unregisterToolbarButton('a');
        registerToolbarButton(spec);
        syncMemberToolbar();

        const activeObservers = observers.filter((o) => !o.disconnected);
        assert.equal(activeObservers.length, 1, 'exactly one active observer after the cycle');

        const toolbar = parent._children.find((c) => c.classList.contains(TOOLBAR_CLASS));
        const buttons = toolbar._children.filter((c) => c.classList.contains('st-agc-btn-a'));
        assert.equal(buttons.length, 1, 'exactly one button after the cycle');
    } finally {
        unregisterToolbarButton('a');
        restore();
    }
});

test('registering with no document only warns', () => {
    const fake = createFakeSillyTavern({ groupId: GROUP });
    const restoreFake = fake.install();
    const previousDocument = globalThis.document;
    delete globalThis.document;

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args);
    try {
        const { spec } = makeContributor('a', 'st-agc-btn-a');
        registerToolbarButton(spec);
        assert.ok(
            warnings.some((args) => String(args[0]).includes('[st_advanced_group_chat]')),
            'a missing document degrades to a prefixed warning, not a throw',
        );
    } finally {
        console.warn = originalWarn;
        unregisterToolbarButton('a');
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
        restoreFake();
    }
});
