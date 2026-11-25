import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSillyTavern } from '../test-helpers/fake-sillytavern.js';
import { initOverridePruning, disposeOverridePruning } from '../src/override-pruning.js';

const GROUP = 'group-1';
const ALICE = 'alice.png';

/** Installs a fake SillyTavern with one live group and the given overrides. */
function installPruning({ members = [ALICE], modelOverrides = { [GROUP]: { [ALICE]: 'm' } } } = {}) {
    const fake = createFakeSillyTavern({
        groupId: GROUP,
        groups: [{ id: GROUP, members }],
    });
    fake.context.extensionSettings.st_advanced_group_chat = { modelOverrides };
    const restore = fake.install();
    return { fake, restore };
}

test('initOverridePruning prunes immediately and saves once', () => {
    const { fake } = installPruning({
        modelOverrides: { [GROUP]: { [ALICE]: 'm' }, 'gone-group': { 'a.png': 'm' } },
    });

    initOverridePruning();

    const settings = fake.context.extensionSettings.st_advanced_group_chat;
    assert.deepEqual(settings.modelOverrides, { [GROUP]: { [ALICE]: 'm' } });
    assert.equal(fake.state.saveCount, 1);
});

test('initOverridePruning does not save when nothing was pruned', () => {
    const { fake } = installPruning();

    initOverridePruning();
    fake.emit('group_updated');

    assert.equal(fake.state.saveCount, 0);
});

test('initOverridePruning prunes when a member leaves a group', () => {
    const { fake } = installPruning();
    initOverridePruning();

    fake.context.groups[0].members = [];
    fake.emit('group_updated');

    const settings = fake.context.extensionSettings.st_advanced_group_chat;
    assert.deepEqual(settings.modelOverrides, { [GROUP]: {} });
    assert.equal(fake.state.saveCount, 1);
});

test('initOverridePruning prunes when a group is deleted', () => {
    const { fake } = installPruning();
    initOverridePruning();

    fake.context.groups.length = 0;
    // The payload is a chat ID from two call sites and a chat name from a
    // third; the handler must ignore it entirely.
    fake.emit('group_chat_deleted', 'some-chat-id');

    const settings = fake.context.extensionSettings.st_advanced_group_chat;
    assert.deepEqual(settings.modelOverrides, {});
    assert.equal(fake.state.saveCount, 1);
});

test('initOverridePruning does not prune at startup when no groups have loaded', () => {
    // A failed /api/characters/all reaches APP_READY with an empty groups
    // array — that is not proof the groups were deleted, so it must not wipe
    // the overrides saved against them.
    const fake = createFakeSillyTavern({ groupId: GROUP, groups: [] });
    fake.context.extensionSettings.st_advanced_group_chat = { modelOverrides: { [GROUP]: { [ALICE]: 'm' } } };
    const restore = fake.install();

    try {
        initOverridePruning();

        const settings = fake.context.extensionSettings.st_advanced_group_chat;
        assert.deepEqual(settings.modelOverrides, { [GROUP]: { [ALICE]: 'm' } });
        assert.equal(fake.state.saveCount, 0);
    } finally {
        restore();
    }
});

test('disposeOverridePruning stops reacting to group events', () => {
    const { fake } = installPruning();
    initOverridePruning();
    disposeOverridePruning();

    fake.context.groups[0].members = [];
    fake.emit('group_updated');

    const settings = fake.context.extensionSettings.st_advanced_group_chat;
    assert.deepEqual(settings.modelOverrides, { [GROUP]: { [ALICE]: 'm' } });
    assert.equal(fake.state.saveCount, 0);
});

test('initOverridePruning prunes a hideAvatars entry for a deleted group', () => {
    const { fake } = installPruning();
    fake.context.extensionSettings.st_advanced_group_chat.hideAvatars = { 'gone-group': true };

    initOverridePruning();

    const settings = fake.context.extensionSettings.st_advanced_group_chat;
    assert.deepEqual(settings.hideAvatars, {});
    assert.equal(fake.state.saveCount, 1);
});
