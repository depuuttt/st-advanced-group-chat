import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSillyTavern } from '../test-helpers/fake-sillytavern.js';
import { getModelOverride } from '../src/model-overrides.js';
import {
    getButtonState,
    resolveMemberAvatarId,
    openMemberModelInput,
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