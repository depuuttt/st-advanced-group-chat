import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSillyTavern } from '../test-helpers/fake-sillytavern.js';
import { makeElement, installDocument } from '../test-helpers/fake-dom.js';
import {
    getToggleState,
    syncHideAvatarUI,
    toggleHideAvatars,
    getEditorGroupId,
    handleGroupSelected,
    initHideMemberAvatars,
    disposeHideMemberAvatars,
    __resetEditorGroupIdForTests,
} from '../src/hide-member-avatars.js';

const GROUP = 'group-1';
const HIDDEN_CLASS = 'st-agc-hide-avatars';
const BUTTON_CLASS = 'st-agc-hide-avatars-button';

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
    __resetEditorGroupIdForTests();
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

test('getEditorGroupId prefers the group the editor last selected', () => {
    __resetEditorGroupIdForTests();
    const { fake, restore } = installDocument();
    try {
        // With no editor selection yet, the chat group is the fallback.
        assert.equal(getEditorGroupId(), GROUP, 'falls back to the chat group');

        handleGroupSelected({ detail: { id: 'group-2' } });
        assert.equal(getEditorGroupId(), 'group-2');

        handleGroupSelected({ detail: { id: 'group-2' } });
        assert.equal(getEditorGroupId(), 'group-2');

        // The chat's selected group moving must not override the editor's group.
        fake.context.groupId = 'group-9';
        assert.equal(getEditorGroupId(), 'group-2');
    } finally {
        restore();
    }
});

test('getEditorGroupId falls back to the chat group when the editor never selected one', () => {
    __resetEditorGroupIdForTests();
    const { fake, restore } = installDocument();
    try {
        fake.context.groupId = 'group-7';
        assert.equal(getEditorGroupId(), 'group-7');
    } finally {
        restore();
    }
});

test('toggleHideAvatars writes to the group the editor shows, not the open chat', () => {
    const container = makeElement();
    container.classList.add('rm_group_members');
    const pagination = makeElement();
    const parent = makeElement();
    pagination.parentElement = parent;
    parent.appendChild(pagination);
    parent.appendChild(container);

    const { fake, restore } = installDocument({ containers: [container], paginations: [pagination] });
    try {
        // The chat has group-1 open; the editor is showing group-2.
        fake.context.groupId = GROUP;
        handleGroupSelected({ detail: { id: 'group-2' } });

        toggleHideAvatars();

        const settings = fake.context.extensionSettings.st_advanced_group_chat;
        assert.equal(settings.hideAvatars['group-2'], true, 'the editor group was hidden');
        assert.equal(settings.hideAvatars[GROUP], undefined, 'the chat group was left alone');
        assert.ok(container.classList.contains(HIDDEN_CLASS));
    } finally {
        restore();
    }
});

test('handleGroupSelected with no editor group falls back to the chat group', () => {
    const { fake, restore } = installDocument();
    try {
        fake.context.groupId = 'group-5';
        handleGroupSelected({ detail: { id: null } });
        assert.equal(getEditorGroupId(), 'group-5');
    } finally {
        restore();
    }
});

test('syncHideAvatarUI inserts a toolbar with the button before every member list', () => {
    const editorContainer = makeElement();
    const popoutContainer = makeElement();
    editorContainer.classList.add('rm_group_members');
    popoutContainer.classList.add('rm_group_members');
    const editorParent = makeElement();
    const popoutParent = makeElement();
    editorParent.appendChild(editorContainer);
    popoutParent.appendChild(popoutContainer);

    const { restore } = installDocument({ containers: [editorContainer, popoutContainer] });
    try {
        syncHideAvatarUI();

        for (const [parent, container] of [[editorParent, editorContainer], [popoutParent, popoutContainer]]) {
            const toolbars = parent._children.filter((c) => c.classList.contains('st-agc-member-toolbar'));
            assert.equal(toolbars.length, 1, 'exactly one toolbar is inserted');
            const toolbar = toolbars[0];
            assert.equal(toolbar.nextElementSibling, container, 'the toolbar sits immediately before the list');

            const buttons = toolbar._children.filter((c) => c.classList.contains(BUTTON_CLASS));
            assert.equal(buttons.length, 1, 'the toolbar holds one toggle button');
            const button = buttons[0];
            assert.equal(button.getAttribute('role'), 'button');
            assert.equal(button.getAttribute('tabindex'), '0');
            assert.ok(button.classList.contains('st-agc-material-icon'));
            assert.equal(button.textContent, 'visibility');
        }
    } finally {
        restore();
    }
});

test('syncHideAvatarUI does not duplicate the button on a second sync', () => {
    const container = makeElement();
    container.classList.add('rm_group_members');
    const parent = makeElement();
    parent.appendChild(container);

    const { restore } = installDocument({ containers: [container] });
    try {
        syncHideAvatarUI();
        const toolbar = parent._children.find((c) => c.classList.contains('st-agc-member-toolbar'));
        const first = toolbar._children.find((c) => c.classList.contains(BUTTON_CLASS));
        syncHideAvatarUI();

        const buttons = toolbar._children.filter((c) => c.classList.contains(BUTTON_CLASS));
        assert.equal(buttons.length, 1, 'the live button is reused, not duplicated');
        assert.equal(buttons[0], first, 'the same button node survives, so its listeners stay attached');
        assert.equal(first._removed, false, 'the live button was not removed and re-created');
    } finally {
        restore();
    }
});

test('syncHideAvatarUI replaces a cloned button that carries the class but no live listener', () => {
    const container = makeElement();
    container.classList.add('rm_group_members');
    const parent = makeElement();
    parent.appendChild(container);

    // The popout copies the drawer markup wholesale: a cloned toolbar carrying
    // a cloned button — classes intact, listeners not — must be replaced.
    const staleToolbar = makeElement();
    staleToolbar.className = 'st-agc-member-toolbar';
    parent.appendChild(staleToolbar);
    const clone = makeElement();
    clone.className = `${BUTTON_CLASS} st-agc-material-icon`;
    staleToolbar.appendChild(clone);

    const { restore } = installDocument({ containers: [container] });
    try {
        syncHideAvatarUI();

        const toolbars = parent._children.filter((c) => c.classList.contains('st-agc-member-toolbar'));
        assert.equal(toolbars.length, 1, 'one toolbar after cleanup');
        assert.notEqual(toolbars[0], staleToolbar);
        assert.ok(staleToolbar._removed, 'the stale toolbar clone was removed');

        const buttons = toolbars[0]._children.filter((c) => c.classList.contains(BUTTON_CLASS));
        assert.equal(buttons.length, 1, 'the dead clone was replaced, not kept');
        assert.notEqual(buttons[0], clone);
    } finally {
        restore();
    }
});

test('syncHideAvatarUI skips a member list with no parent', () => {
    const orphan = makeElement();
    orphan.classList.add('rm_group_members');
    orphan.parentElement = null;
    orphan.parentNode = null;

    const { restore } = installDocument({ containers: [orphan] });
    try {
        syncHideAvatarUI();
        // No throw; nothing to assert beyond survival.
        assert.equal(orphan._children.length, 0);
    } finally {
        restore();
    }
});

test('syncHideAvatarUI reseats a toolbar that is no longer before the list', () => {
    const container = makeElement();
    container.classList.add('rm_group_members');
    const parent = makeElement();
    parent.appendChild(container);

    const { restore } = installDocument({ containers: [container] });
    try {
        syncHideAvatarUI();
        const toolbar = parent._children.find((c) => c.classList.contains('st-agc-member-toolbar'));

        // SillyTavern re-inserted something between toolbar and list.
        const intruder = makeElement();
        parent.appendChild(intruder);

        syncHideAvatarUI();

        assert.equal(container.previousElementSibling, toolbar, 'the toolbar is back before the list');
        assert.equal(toolbar.parentNode, parent, 'the same live toolbar node was reseated, not recreated');
        const toolbars = parent._children.filter((c) => c.classList.contains('st-agc-member-toolbar'));
        assert.equal(toolbars.length, 1, 'still exactly one toolbar');
    } finally {
        restore();
    }
});

test('a second sync pass performs zero DOM writes', () => {
    const container = makeElement();
    container.classList.add('rm_group_members');
    const parent = makeElement();
    parent.appendChild(container);

    const { restore } = installDocument({ containers: [container] });
    try {
        syncHideAvatarUI();

        const toolbar = parent._children.find((c) => c.classList.contains('st-agc-member-toolbar'));
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
        wrapText(button);

        syncHideAvatarUI();

        assert.equal(writes, 0, 'a second pass on unchanged DOM wrote nothing');
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

test('initHideMemberAvatars subscribes to the editor group selection', () => {
    const { fake, restore } = installDocument();
    try {
        initHideMemberAvatars();

        handleGroupSelected({ detail: { id: 'group-3' } });
        assert.equal(getEditorGroupId(), 'group-3');
        assert.equal(fake.state.listeners.get('groupSelected')?.length, 1, 'one groupSelected listener');
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

test('disposeHideMemberAvatars removes buttons, toolbar, container class, and observer', () => {
    const container = makeElement();
    container.classList.add('rm_group_members');
    container.classList.add(HIDDEN_CLASS);
    const parent = makeElement();
    parent.appendChild(container);

    const { restore, cancelled, getObserverCallback } = installDocument({
        containers: [container],
        rafImmediate: false,
    });
    try {
        initHideMemberAvatars();
        // A member-list mutation queues a refresh (handle 1) that dispose cancels.
        const memberList = { nodeType: 1, matches: (sel) => sel === '.rm_group_members' };
        getObserverCallback()([{ target: memberList, addedNodes: [] }]);
        assert.equal(cancelled.length, 0, 'nothing cancelled before dispose');

        syncHideAvatarUI();
        const toolbar = parent._children.find((c) => c.classList.contains('st-agc-member-toolbar'));
        assert.ok(toolbar, 'a toolbar existed before dispose');

        disposeHideMemberAvatars();

        const buttons = toolbar._children.filter((c) => c.classList.contains(BUTTON_CLASS));
        assert.equal(buttons.length, 0, 'buttons removed');
        assert.ok(buttons.every((b) => b._removed));
        assert.ok(toolbar._removed, 'the toolbar was removed');
        assert.equal(parent._children.filter((c) => c.classList.contains('st-agc-member-toolbar')).length, 0, 'no toolbar left in the parent');
        assert.equal(container.classList.contains(HIDDEN_CLASS), false, 'container class removed');
        assert.ok(cancelled.includes(1), 'the queued refresh handle 1 was cancelled');
    } finally {
        restore();
    }
});