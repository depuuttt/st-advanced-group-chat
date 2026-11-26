import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeSillyTavern } from '../test-helpers/fake-sillytavern.js';
import { makeElement, installDocument } from '../test-helpers/fake-dom.js';
import { handleGroupSelected, syncMemberToolbar, __resetEditorGroupIdForTests } from '../src/member-list-toolbar.js';
import {
    getToggleState as getAvatarToggleState,
    initHideMemberAvatars,
    disposeHideMemberAvatars,
} from '../src/hide-member-avatars.js';
import {
    getTagsToggleState,
    toggleHideTags,
    initHideMemberTags,
    disposeHideMemberTags,
} from '../src/hide-member-tags.js';

const GROUP = 'group-1';
const HIDDEN_CLASS = 'st-agc-hide-tags';
const BUTTON_CLASS = 'st-agc-hide-tags-button';
const AVATAR_BUTTON_CLASS = 'st-agc-hide-avatars-button';
const AVATAR_HIDDEN_CLASS = 'st-agc-hide-avatars';
const TOOLBAR_CLASS = 'st-agc-member-toolbar';

/** Builds a member list element carrying the `.rm_group_members` class. */
function makeMemberList() {
    const el = makeElement();
    el.classList.add('rm_group_members');
    return el;
}

/** Builds a member list already attached to a parent. */
function makeAttachedList() {
    const container = makeMemberList();
    const parent = makeElement();
    parent.appendChild(container);
    return { container, parent };
}

test('getTagsToggleState shows label with a hide title when tags are shown', () => {
    const restore = createFakeSillyTavern().install();
    try {
        const state = getTagsToggleState(false);
        assert.equal(state.icon, 'label');
        assert.equal(state.title, 'Hide member tags');
    } finally {
        restore();
    }
});

test('getTagsToggleState shows label_off with a show title when tags are hidden', () => {
    const restore = createFakeSillyTavern().install();
    try {
        const state = getTagsToggleState(true);
        assert.equal(state.icon, 'label_off');
        assert.equal(state.title, 'Show member tags');
    } finally {
        restore();
    }
});

test('toggleHideTags flips hideTags[group] and the st-agc-hide-tags class, saving once', () => {
    const { container } = makeAttachedList();

    const { fake, restore } = installDocument({ containers: [container] });
    try {
        initHideMemberTags();

        toggleHideTags();

        const settings = fake.context.extensionSettings.st_advanced_group_chat;
        assert.equal(settings.hideTags[GROUP], true);
        assert.ok(container.classList.contains(HIDDEN_CLASS), 'container gets the hidden class');
        assert.equal(fake.state.saveCount, 1);
    } finally {
        disposeHideMemberTags();
        __resetEditorGroupIdForTests();
        restore();
    }
});

test('toggleHideTags writes to the group the editor shows, not the open chat', () => {
    __resetEditorGroupIdForTests();
    const { container } = makeAttachedList();

    const { fake, restore } = installDocument({ containers: [container] });
    try {
        initHideMemberTags();

        // The chat has group-1 open; the editor is showing group-2.
        fake.context.groupId = GROUP;
        handleGroupSelected({ detail: { id: 'group-2' } });

        toggleHideTags();

        const settings = fake.context.extensionSettings.st_advanced_group_chat;
        assert.equal(settings.hideTags['group-2'], true, 'the editor group was hidden');
        assert.equal(settings.hideTags[GROUP], undefined, 'the chat group was left alone');
        assert.ok(container.classList.contains(HIDDEN_CLASS));
    } finally {
        disposeHideMemberTags();
        __resetEditorGroupIdForTests();
        restore();
    }
});

test('tags and avatars hide independently on the same container', () => {
    const { container } = makeAttachedList();

    const { fake, restore } = installDocument({ containers: [container] });
    try {
        initHideMemberAvatars();
        initHideMemberTags();

        // Hide tags only.
        fake.context.extensionSettings.st_advanced_group_chat = { modelOverrides: {}, hideAvatars: {}, hideTags: { [GROUP]: true } };
        syncMemberToolbar();
        assert.ok(container.classList.contains(HIDDEN_CLASS), 'tags hidden');
        assert.equal(container.classList.contains(AVATAR_HIDDEN_CLASS), false, 'avatars shown');

        // Now hide avatars only.
        fake.context.extensionSettings.st_advanced_group_chat = { modelOverrides: {}, hideAvatars: { [GROUP]: true }, hideTags: {} };
        syncMemberToolbar();
        assert.equal(container.classList.contains(HIDDEN_CLASS), false, 'tags shown');
        assert.ok(container.classList.contains(AVATAR_HIDDEN_CLASS), 'avatars hidden');
    } finally {
        disposeHideMemberTags();
        disposeHideMemberAvatars();
        __resetEditorGroupIdForTests();
        restore();
    }
});

test('the toolbar holds the avatars button then the tags button when both are init-ed', () => {
    const { container, parent } = makeAttachedList();

    const { restore } = installDocument({ containers: [container] });
    try {
        initHideMemberAvatars();
        initHideMemberTags();

        const toolbar = parent._children.find((c) => c.classList.contains(TOOLBAR_CLASS));
        assert.ok(toolbar, 'a toolbar exists');
        const buttons = toolbar._children.filter((c) => c.classList.contains('st-agc-toolbar-button'));
        assert.equal(buttons.length, 2, 'two toolbar buttons');
        assert.ok(buttons[0].classList.contains(AVATAR_BUTTON_CLASS), 'avatars button first');
        assert.ok(buttons[1].classList.contains(BUTTON_CLASS), 'tags button second');
    } finally {
        disposeHideMemberTags();
        disposeHideMemberAvatars();
        __resetEditorGroupIdForTests();
        restore();
    }
});

test('disposing tags leaves the avatars button, the toolbar, and the avatars class', () => {
    const { container, parent } = makeAttachedList();

    const { fake, restore } = installDocument({ containers: [container] });
    try {
        initHideMemberAvatars();
        initHideMemberTags();
        fake.context.extensionSettings.st_advanced_group_chat = {
            modelOverrides: {},
            hideAvatars: { [GROUP]: true },
            hideTags: { [GROUP]: true },
        };
        syncMemberToolbar();

        const toolbar = parent._children.find((c) => c.classList.contains(TOOLBAR_CLASS));

        disposeHideMemberTags();

        const tagsButtons = toolbar._children.filter((c) => c.classList.contains(BUTTON_CLASS));
        assert.equal(tagsButtons.length, 0, 'tags button removed');
        const avatarButtons = toolbar._children.filter((c) => c.classList.contains(AVATAR_BUTTON_CLASS));
        assert.equal(avatarButtons.length, 1, 'avatars button remains');
        assert.equal(toolbar._removed, false, 'the toolbar remains');
        assert.ok(container.classList.contains(AVATAR_HIDDEN_CLASS), 'avatars class remains');
        assert.equal(container.classList.contains(HIDDEN_CLASS), false, 'tags class removed');
    } finally {
        disposeHideMemberTags();
        disposeHideMemberAvatars();
        __resetEditorGroupIdForTests();
        restore();
    }
});

test('disposing avatars leaves the tags button and the toolbar', () => {
    const { container, parent } = makeAttachedList();

    const { restore } = installDocument({ containers: [container] });
    try {
        initHideMemberAvatars();
        initHideMemberTags();

        const toolbar = parent._children.find((c) => c.classList.contains(TOOLBAR_CLASS));

        disposeHideMemberAvatars();

        const tagsButtons = toolbar._children.filter((c) => c.classList.contains(BUTTON_CLASS));
        assert.equal(tagsButtons.length, 1, 'tags button remains');
        assert.equal(toolbar._removed, false, 'the toolbar remains');
    } finally {
        disposeHideMemberTags();
        disposeHideMemberAvatars();
        __resetEditorGroupIdForTests();
        restore();
    }
});

test('a popout clone with dead avatar and tags buttons ends with two live buttons in order', () => {
    const { container, parent } = makeAttachedList();

    // A dead clone of the toolbar (as the popout copies the drawer markup):
    // its buttons carry the classes but no listeners and are not tracked live.
    const deadToolbar = makeElement();
    deadToolbar.classList.add(TOOLBAR_CLASS);
    const deadAvatar = makeElement();
    deadAvatar.classList.add(AVATAR_BUTTON_CLASS, 'st-agc-toolbar-button');
    const deadTags = makeElement();
    deadTags.classList.add(BUTTON_CLASS, 'st-agc-toolbar-button');
    deadToolbar.appendChild(deadAvatar);
    deadToolbar.appendChild(deadTags);
    parent.insertBefore(deadToolbar, container);

    const { restore } = installDocument({ containers: [container] });
    try {
        // The document created the dead nodes before installDocument tracked them,
        // so re-register them with the fake document's created list by re-adding.
        initHideMemberAvatars();
        initHideMemberTags();

        const liveToolbars = parent._children.filter((c) => c.classList.contains(TOOLBAR_CLASS) && !c._removed);
        assert.equal(liveToolbars.length, 1, 'one live toolbar remains');
        const toolbar = liveToolbars[0];
        const buttons = toolbar._children.filter((c) => c.classList.contains('st-agc-toolbar-button'));
        assert.equal(buttons.length, 2, 'two live buttons');
        assert.ok(buttons[0].classList.contains(AVATAR_BUTTON_CLASS), 'avatars first');
        assert.ok(buttons[1].classList.contains(BUTTON_CLASS), 'tags second');
        assert.ok(deadToolbar._removed, 'the dead clone toolbar was removed');
    } finally {
        disposeHideMemberTags();
        disposeHideMemberAvatars();
        __resetEditorGroupIdForTests();
        restore();
    }
});

test('init -> dispose -> init yields exactly one tags button', () => {
    const { container, parent } = makeAttachedList();

    const { restore } = installDocument({ containers: [container] });
    try {
        initHideMemberTags();
        disposeHideMemberTags();
        initHideMemberTags();

        const toolbars = parent._children.filter((c) => c.classList.contains(TOOLBAR_CLASS) && !c._removed);
        assert.equal(toolbars.length, 1, 'one toolbar');
        const buttons = toolbars[0]._children.filter((c) => c.classList.contains(BUTTON_CLASS));
        assert.equal(buttons.length, 1, 'exactly one tags button');
    } finally {
        disposeHideMemberTags();
        __resetEditorGroupIdForTests();
        restore();
    }
});

test('a second sync pass with both features performs zero DOM writes', () => {
    const { container, parent } = makeAttachedList();

    const { restore } = installDocument({ containers: [container] });
    try {
        initHideMemberAvatars();
        initHideMemberTags();

        const toolbar = parent._children.find((c) => c.classList.contains(TOOLBAR_CLASS));
        const avatarButton = toolbar._children.find((c) => c.classList.contains(AVATAR_BUTTON_CLASS));
        const tagsButton = toolbar._children.find((c) => c.classList.contains(BUTTON_CLASS));

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
        wrapText(avatarButton);
        wrapText(tagsButton);

        syncMemberToolbar();

        assert.equal(writes, 0, 'a second pass on unchanged DOM wrote nothing');
    } finally {
        disposeHideMemberTags();
        disposeHideMemberAvatars();
        __resetEditorGroupIdForTests();
        restore();
    }
});

test('style.css hides .tags_inline inside .rm_group_members and never the tag filter box', () => {
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

    assert.match(
        css,
        /\.rm_group_members\.st-agc-hide-tags\s+\.tags_inline\s*\{\s*display:\s*none;?\s*\}/,
        'the tags rule hides .tags_inline inside .rm_group_members',
    );
    assert.equal(css.includes('.rm_tag_filter'), false, 'no rule targets .rm_tag_filter');
    assert.equal(css.includes('.rm_tag_controls'), false, 'no rule targets .rm_tag_controls');
});
