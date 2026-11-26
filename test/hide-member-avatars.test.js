import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSillyTavern } from '../test-helpers/fake-sillytavern.js';
import { makeElement, installDocument } from '../test-helpers/fake-dom.js';
import { handleGroupSelected, __resetEditorGroupIdForTests } from '../src/member-list-toolbar.js';
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
const TOOLBAR_CLASS = 'st-agc-member-toolbar';

/** Builds a member list element carrying the `.rm_group_members` class. */
function makeMemberList() {
    const el = makeElement();
    el.classList.add('rm_group_members');
    return el;
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
    const container = makeMemberList();
    const parent = makeElement();
    parent.appendChild(container);

    const { fake, restore } = installDocument({ containers: [container] });
    try {
        initHideMemberAvatars();

        toggleHideAvatars();

        const settings = fake.context.extensionSettings.st_advanced_group_chat;
        assert.equal(settings.hideAvatars[GROUP], true);
        assert.ok(container.classList.contains(HIDDEN_CLASS), 'container gets the hidden class');
        assert.equal(fake.state.saveCount, 1);
    } finally {
        disposeHideMemberAvatars();
        restore();
    }
});

test('toggleHideAvatars writes to the group the editor shows, not the open chat', () => {
    __resetEditorGroupIdForTests();
    const container = makeMemberList();
    const parent = makeElement();
    parent.appendChild(container);

    const { fake, restore } = installDocument({ containers: [container] });
    try {
        initHideMemberAvatars();

        // The chat has group-1 open; the editor is showing group-2.
        fake.context.groupId = GROUP;
        handleGroupSelected({ detail: { id: 'group-2' } });

        toggleHideAvatars();

        const settings = fake.context.extensionSettings.st_advanced_group_chat;
        assert.equal(settings.hideAvatars['group-2'], true, 'the editor group was hidden');
        assert.equal(settings.hideAvatars[GROUP], undefined, 'the chat group was left alone');
        assert.ok(container.classList.contains(HIDDEN_CLASS));
    } finally {
        disposeHideMemberAvatars();
        __resetEditorGroupIdForTests();
        restore();
    }
});

test('syncHideAvatarUI applies the state of the group SillyTavern has open', () => {
    __resetEditorGroupIdForTests();
    const container = makeMemberList();
    const parent = makeElement();
    parent.appendChild(container);

    const { fake, restore } = installDocument({ containers: [container] });
    try {
        initHideMemberAvatars();

        fake.context.extensionSettings.st_advanced_group_chat = { modelOverrides: {}, hideAvatars: { 'group-2': true } };

        fake.context.groupId = 'group-2';
        syncHideAvatarUI();
        assert.ok(container.classList.contains(HIDDEN_CLASS), 'group-2 hidden → class on');

        fake.context.groupId = GROUP;
        syncHideAvatarUI();
        assert.equal(container.classList.contains(HIDDEN_CLASS), false, 'group-1 shown → class off');
    } finally {
        disposeHideMemberAvatars();
        __resetEditorGroupIdForTests();
        restore();
    }
});

test('initHideMemberAvatars twice yields one toggle button', () => {
    const container = makeMemberList();
    const parent = makeElement();
    parent.appendChild(container);

    const { restore } = installDocument({ containers: [container] });
    try {
        initHideMemberAvatars();
        initHideMemberAvatars();

        const toolbar = parent._children.find((c) => c.classList.contains(TOOLBAR_CLASS));
        const buttons = toolbar._children.filter((c) => c.classList.contains(BUTTON_CLASS));
        assert.equal(buttons.length, 1, 'a second init must not add a second button');
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

test('observer callback re-applies the hidden class after a member-list mutation', () => {
    const container = makeMemberList();
    const parent = makeElement();
    parent.appendChild(container);

    const { fake, restore, getObserverCallback } = installDocument({ containers: [container] });
    try {
        initHideMemberAvatars();

        // The saved flag turns on after init; only a re-sync can apply it.
        fake.context.extensionSettings.st_advanced_group_chat = { modelOverrides: {}, hideAvatars: { [GROUP]: true } };
        assert.equal(container.classList.contains(HIDDEN_CLASS), false, 'not hidden before the mutation');

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

test('disposeHideMemberAvatars removes its button, the container class, and the toolbar', () => {
    const container = makeMemberList();
    const parent = makeElement();
    parent.appendChild(container);

    const { fake, restore } = installDocument({ containers: [container] });
    try {
        fake.context.extensionSettings.st_advanced_group_chat = { modelOverrides: {}, hideAvatars: { [GROUP]: true } };
        initHideMemberAvatars();

        const toolbar = parent._children.find((c) => c.classList.contains(TOOLBAR_CLASS));
        assert.ok(toolbar, 'a toolbar existed before dispose');
        assert.ok(container.classList.contains(HIDDEN_CLASS), 'the hidden class was applied before dispose');

        disposeHideMemberAvatars();

        const buttons = toolbar._children.filter((c) => c.classList.contains(BUTTON_CLASS));
        assert.equal(buttons.length, 0, 'buttons removed');
        assert.ok(buttons.every((b) => b._removed));
        assert.ok(toolbar._removed, 'the toolbar was removed');
        assert.equal(parent._children.filter((c) => c.classList.contains(TOOLBAR_CLASS)).length, 0, 'no toolbar left in the parent');
        assert.equal(container.classList.contains(HIDDEN_CLASS), false, 'container class removed');
    } finally {
        restore();
    }
});

test('a second pass with avatars registered performs zero DOM writes', () => {
    const container = makeMemberList();
    const parent = makeElement();
    parent.appendChild(container);

    const { restore } = installDocument({ containers: [container] });
    try {
        initHideMemberAvatars();

        const toolbar = parent._children.find((c) => c.classList.contains(TOOLBAR_CLASS));
        const button = toolbar._children.find((c) => c.classList.contains(BUTTON_CLASS));

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
        wrapText(button);

        syncHideAvatarUI();

        assert.equal(writes, 0, 'a second pass on unchanged DOM wrote nothing');
    } finally {
        disposeHideMemberAvatars();
        restore();
    }
});