import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSillyTavern } from '../test-helpers/fake-sillytavern.js';
import { getModelOverride } from '../src/model-overrides.js';
import {
    getButtonState,
    resolveMemberAvatarId,
    openMemberModelInput,
    mutationsTouchMemberList,
    handleButtonKeydown,
    translateText,
} from '../src/member-model-button.js';

const GROUP = 'group-1';
const ALICE = { avatar: 'alice.png', name: 'Alice' };

/**
 * A stand-in for a `.group_member` row. SillyTavern fills `data-id` through
 * jQuery's data store rather than as a DOM attribute, so the resolver has to
 * cope with either source; these fakes expose only `getAttribute`, which is the
 * whole of what the resolver reads from a row.
 */
function makeRow({ id = null, chid = null } = {}) {
    return {
        getAttribute: (name) => {
            if (name === 'data-id') return id;
            if (name === 'data-chid') return chid;
            return null;
        },
    };
}

/** Installs a fake jQuery whose `.data()` reads from `store`. */
function installFakeJquery(store) {
    const previous = globalThis.jQuery;
    globalThis.jQuery = (element) => ({ data: (key) => store.get(element)?.[key] });
    return () => {
        if (previous === undefined) delete globalThis.jQuery;
        else globalThis.jQuery = previous;
    };
}

/** Installs a fake SillyTavern with the given saved overrides and popup answer. */
function installSillyTavern({ modelOverrides = {}, popupResult = null } = {}) {
    const fake = createFakeSillyTavern({ groupId: GROUP, characters: [ALICE] });
    const restore = fake.install();
    fake.context.extensionSettings.st_advanced_group_chat = { modelOverrides };
    fake.state.popupResult = popupResult;
    return { fake, restore };
}

test('getButtonState marks a member with no override as unset', () => {
    const state = getButtonState('');

    assert.equal(state.hasOverride, false);
    assert.ok(state.title.length > 0);
});

test('getButtonState marks an active override and names the model', () => {
    const state = getButtonState('claude-opus-4-6');

    assert.equal(state.hasOverride, true);
    assert.ok(state.title.includes('claude-opus-4-6'));
});

test('resolveMemberAvatarId prefers the row data-id attribute', () => {
    const restoreJquery = installFakeJquery(new Map());
    try {
        const row = makeRow({ id: 'alice.png', chid: '0' });

        assert.equal(resolveMemberAvatarId(row), 'alice.png');
    } finally {
        restoreJquery();
    }
});

test('resolveMemberAvatarId falls back to jQuery stored data when the attribute is absent', () => {
    const row = makeRow();
    const restoreJquery = installFakeJquery(new Map([[row, { id: 'alice.png' }]]));
    try {
        assert.equal(resolveMemberAvatarId(row), 'alice.png');
    } finally {
        restoreJquery();
    }
});

test('resolveMemberAvatarId resolves the avatar through the row data-chid', () => {
    const { restore } = installSillyTavern();
    try {
        const row = makeRow({ chid: '0' });

        assert.equal(resolveMemberAvatarId(row), 'alice.png');
    } finally {
        restore();
    }
});

test('resolveMemberAvatarId returns null when the row identifies no member', () => {
    const { restore } = installSillyTavern();
    const restoreJquery = installFakeJquery(new Map());
    try {
        assert.equal(resolveMemberAvatarId(makeRow()), null);
        assert.equal(resolveMemberAvatarId(makeRow({ chid: '99' })), null);
    } finally {
        restoreJquery();
        restore();
    }
});

test('openMemberModelInput saves the typed model for that group and member', async () => {
    const { fake, restore } = installSillyTavern({ popupResult: 'claude-opus-4-6' });
    try {
        await openMemberModelInput(GROUP, 'bob.png');

        const settings = fake.context.extensionSettings.st_advanced_group_chat;
        assert.equal(getModelOverride(settings, GROUP, 'bob.png'), 'claude-opus-4-6');
        assert.equal(fake.state.saveCount, 1);
    } finally {
        restore();
    }
});

test('openMemberModelInput prefills the dialog with the saved model', async () => {
    const { fake, restore } = installSillyTavern({
        modelOverrides: { [GROUP]: { 'bob.png': 'saved-model' } },
        popupResult: 'saved-model',
    });
    try {
        await openMemberModelInput(GROUP, 'bob.png');

        assert.equal(fake.state.popupCalls.length, 1);
        assert.equal(fake.state.popupCalls[0].defaultValue, 'saved-model');
    } finally {
        restore();
    }
});

test('openMemberModelInput clears the override when the field is submitted empty', async () => {
    const { fake, restore } = installSillyTavern({
        modelOverrides: { [GROUP]: { 'bob.png': 'saved-model' } },
        popupResult: '',
    });
    try {
        await openMemberModelInput(GROUP, 'bob.png');

        const settings = fake.context.extensionSettings.st_advanced_group_chat;
        assert.equal(getModelOverride(settings, GROUP, 'bob.png'), '');
    } finally {
        restore();
    }
});

test('openMemberModelInput leaves the override untouched when the dialog is cancelled', async () => {
    const { fake, restore } = installSillyTavern({
        modelOverrides: { [GROUP]: { 'bob.png': 'saved-model' } },
        popupResult: null,
    });
    try {
        await openMemberModelInput(GROUP, 'bob.png');

        const settings = fake.context.extensionSettings.st_advanced_group_chat;
        assert.equal(getModelOverride(settings, GROUP, 'bob.png'), 'saved-model');
        assert.equal(fake.state.saveCount, 0);
    } finally {
        restore();
    }
});

/**
 * SillyTavern streams chat tokens into the DOM many times a second, so the
 * observer must only react to mutations that actually touch the group member
 * list rather than to every DOM change on the page.
 */
function makeNode({ matches = () => false, closest = () => null, querySelector = () => null } = {}) {
    return { nodeType: 1, matches, closest, querySelector };
}

test('mutationsTouchMemberList ignores mutations elsewhere on the page', () => {
    const chatMessage = makeNode();
    const mutations = [{ target: chatMessage, addedNodes: [] }];

    assert.equal(mutationsTouchMemberList(mutations), false);
});

test('mutationsTouchMemberList accepts mutations inside the member list', () => {
    const memberRow = makeNode({ closest: (selector) => (selector === '.rm_group_members' ? {} : null) });

    assert.equal(mutationsTouchMemberList([{ target: memberRow, addedNodes: [] }]), true);
});

test('mutationsTouchMemberList accepts a re-rendered member list container', () => {
    const memberList = makeNode({ matches: (selector) => selector === '.rm_group_members' });

    assert.equal(mutationsTouchMemberList([{ target: {}, addedNodes: [memberList] }]), true);
});

test('mutationsTouchMemberList accepts a popout copy of the member list', () => {
    const popoutBlock = makeNode({
        querySelector: (selector) => (selector === '.rm_group_members' ? {} : null),
    });

    assert.equal(mutationsTouchMemberList([{ target: {}, addedNodes: [popoutBlock] }]), true);
});

test('mutationsTouchMemberList ignores an added chat message', () => {
    const chatMessage = makeNode();

    assert.equal(mutationsTouchMemberList([{ target: {}, addedNodes: [chatMessage] }]), false);
});

function makeKeyEvent(key) {
    const event = { key, prevented: false, stopped: false };
    event.preventDefault = () => { event.prevented = true; };
    event.stopPropagation = () => { event.stopped = true; };
    return event;
}

test('handleButtonKeydown activates on Enter and Space', () => {
    for (const key of ['Enter', ' ']) {
        const event = makeKeyEvent(key);
        assert.equal(handleButtonKeydown(event), true);
        assert.equal(event.prevented, true, `${key} should prevent the default scroll`);
    }
});

test('handleButtonKeydown ignores every other key', () => {
    for (const key of ['a', 'Tab', 'Escape', 'ArrowDown']) {
        const event = makeKeyEvent(key);
        assert.equal(handleButtonKeydown(event), false);
        assert.equal(event.prevented, false);
    }
});

test('translateText falls back to the English source string with no locale loaded', () => {
    const restore = createFakeSillyTavern().install();
    try {
        assert.equal(translateText`Set a model for this member`, 'Set a model for this member');
        assert.equal(translateText`Model: ${'gpt-5'}`, 'Model: gpt-5');
    } finally {
        restore();
    }
});

test('translateText uses the SillyTavern translation function when one is available', () => {
    const fake = createFakeSillyTavern();
    fake.context.t = (strings, ...values) =>
        strings.reduce((acc, s, i) => acc + s + (values[i] !== undefined ? `<${values[i]}>` : ''), '');
    const restore = fake.install();
    try {
        assert.equal(translateText`Model: ${'gpt-5'}`, 'Model: <gpt-5>');
    } finally {
        restore();
    }
});

test('getButtonState titles are produced through the translation helper', () => {
    const restore = createFakeSillyTavern().install();
    try {
        assert.equal(getButtonState('gpt-5').title, 'Model: gpt-5');
        assert.equal(getButtonState('').title, 'Set a model for this member');
    } finally {
        restore();
    }
});