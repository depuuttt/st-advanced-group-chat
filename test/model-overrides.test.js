import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSillyTavern } from '../test-helpers/fake-sillytavern.js';
import { getModelOverride, setModelOverride, getHideAvatars, setHideAvatars, pruneHiddenAvatars, getHideTags, setHideTags, pruneHiddenTags, getSettings, createDefaultSettings, pruneModelOverrides } from '../src/model-overrides.js';

const GROUP_A = 'group-a';
const GROUP_B = 'group-b';
const ALICE = 'alice.png';
const BOB = 'bob.png';

test('getSettings initialises the extension settings key on first use', () => {
    const fake = createFakeSillyTavern();
    const restore = fake.install();
    try {
        const settings = getSettings();

        assert.deepEqual(settings, { modelOverrides: {}, hideAvatars: {}, hideTags: {} });
        assert.equal(fake.context.extensionSettings.st_advanced_group_chat, settings);
    } finally {
        restore();
    }
});

test('getSettings preserves values that were saved by an earlier session', () => {
    const fake = createFakeSillyTavern();
    fake.context.extensionSettings.st_advanced_group_chat = { modelOverrides: { [GROUP_A]: { [ALICE]: 'gpt-5' } } };
    const restore = fake.install();
    try {
        const settings = getSettings();

        assert.equal(settings.modelOverrides[GROUP_A][ALICE], 'gpt-5');
    } finally {
        restore();
    }
});

test('getModelOverride returns an empty string when nothing is saved', () => {
    assert.equal(getModelOverride({ modelOverrides: {} }, GROUP_A, ALICE), '');
    assert.equal(getModelOverride(undefined, GROUP_A, ALICE), '');
});

test('setModelOverride stores a typed model name under the group and member', () => {
    const settings = { modelOverrides: {} };

    setModelOverride(settings, GROUP_A, ALICE, 'claude-opus-4-6');

    assert.equal(getModelOverride(settings, GROUP_A, ALICE), 'claude-opus-4-6');
});

test('setModelOverride trims surrounding whitespace from the model name', () => {
    const settings = { modelOverrides: {} };

    setModelOverride(settings, GROUP_A, ALICE, '  claude-opus-4-6  ');

    assert.equal(getModelOverride(settings, GROUP_A, ALICE), 'claude-opus-4-6');
});

test('setModelOverride clears the entry when the model name is empty', () => {
    const settings = { modelOverrides: { [GROUP_A]: { [ALICE]: 'claude-opus-4-6' } } };

    setModelOverride(settings, GROUP_A, ALICE, '');

    assert.equal(getModelOverride(settings, GROUP_A, ALICE), '');
    assert.deepEqual(settings.modelOverrides[GROUP_A], {});
});

test('setModelOverride clears the entry when the model name is only whitespace', () => {
    const settings = { modelOverrides: { [GROUP_A]: { [ALICE]: 'claude-opus-4-6' } } };

    setModelOverride(settings, GROUP_A, ALICE, '   ');

    assert.equal(getModelOverride(settings, GROUP_A, ALICE), '');
});

test('setModelOverride keeps each group override separate for the same member', () => {
    const settings = { modelOverrides: {} };

    setModelOverride(settings, GROUP_A, ALICE, 'model-for-group-a');
    setModelOverride(settings, GROUP_B, ALICE, 'model-for-group-b');

    assert.equal(getModelOverride(settings, GROUP_A, ALICE), 'model-for-group-a');
    assert.equal(getModelOverride(settings, GROUP_B, ALICE), 'model-for-group-b');
});

test('setModelOverride keeps each member override separate within one group', () => {
    const settings = { modelOverrides: {} };

    setModelOverride(settings, GROUP_A, ALICE, 'alice-model');
    setModelOverride(settings, GROUP_A, BOB, 'bob-model');

    assert.equal(getModelOverride(settings, GROUP_A, ALICE), 'alice-model');
    assert.equal(getModelOverride(settings, GROUP_A, BOB), 'bob-model');
});

test('setModelOverride persists through SillyTavern settings save', () => {
    const fake = createFakeSillyTavern();
    const restore = fake.install();
    try {
        setModelOverride(getSettings(), GROUP_A, ALICE, 'claude-opus-4-6');

        assert.equal(fake.state.saveCount, 1);
    } finally {
        restore();
    }
});

test('getSettings returns null instead of throwing when SillyTavern is unavailable', () => {
    const previous = globalThis.SillyTavern;
    delete globalThis.SillyTavern;
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        assert.equal(getSettings(), null);
    } finally {
        console.warn = originalWarn;
        if (previous === undefined) delete globalThis.SillyTavern;
        else globalThis.SillyTavern = previous;
    }
});

test('setModelOverride ignores a missing group or member id', () => {
    const settings = { modelOverrides: {} };

    setModelOverride(settings, undefined, ALICE, 'orphan-model');
    setModelOverride(settings, GROUP_A, undefined, 'orphan-model');

    assert.deepEqual(settings.modelOverrides, {});
});

test('createDefaultSettings returns a fresh object each call', () => {
    const first = createDefaultSettings();
    first.modelOverrides['g1'] = { 'a.png': 'm' };
    first.hideAvatars['g1'] = true;
    first.hideTags['g1'] = true;
    assert.deepEqual(createDefaultSettings(), { modelOverrides: {}, hideAvatars: {}, hideTags: {} });
});

test('pruneModelOverrides removes an override for a deleted group', () => {
    const settings = { modelOverrides: { 'gone-group': { 'a.png': 'm' } } };
    assert.equal(pruneModelOverrides(settings, []), 1);
    assert.deepEqual(settings.modelOverrides, {});
});

test('pruneModelOverrides removes an override for a member no longer in the group', () => {
    const settings = { modelOverrides: { g1: { 'a.png': 'm', 'b.png': 'm' } } };
    const groups = [{ id: 'g1', members: ['b.png'] }];
    assert.equal(pruneModelOverrides(settings, groups), 1);
    assert.deepEqual(settings.modelOverrides, { g1: { 'b.png': 'm' } });
});

test('pruneModelOverrides keeps overrides that are still in use', () => {
    const settings = { modelOverrides: { g1: { 'a.png': 'm' } } };
    const groups = [{ id: 'g1', members: ['a.png'] }];
    assert.equal(pruneModelOverrides(settings, groups), 0);
    assert.deepEqual(settings.modelOverrides, { g1: { 'a.png': 'm' } });
});

test('pruneModelOverrides leaves a member override alone in the groups that still contain them', () => {
    const settings = { modelOverrides: { g1: { 'a.png': 'm1' }, g2: { 'a.png': 'm2' } } };
    const groups = [{ id: 'g1', members: [] }, { id: 'g2', members: ['a.png'] }];
    assert.equal(pruneModelOverrides(settings, groups), 1);
    assert.deepEqual(settings.modelOverrides, { g1: {}, g2: { 'a.png': 'm2' } });
});

test('pruneModelOverrides is a no-op when groups is not an array', () => {
    const settings = { modelOverrides: { g1: { 'a.png': 'm' } } };
    assert.equal(pruneModelOverrides(settings, undefined), 0);
    assert.deepEqual(settings.modelOverrides, { g1: { 'a.png': 'm' } });
});

test('pruneModelOverrides keeps overrides when a group has no members array', () => {
    const settings = { modelOverrides: { g1: { 'a.png': 'm' } } };
    assert.equal(pruneModelOverrides(settings, [{ id: 'g1' }]), 0);
    assert.deepEqual(settings.modelOverrides, { g1: { 'a.png': 'm' } });
});

test('getHideAvatars returns false when nothing is saved', () => {
    assert.equal(getHideAvatars({ hideAvatars: {} }, GROUP_A), false);
    assert.equal(getHideAvatars(undefined, GROUP_A), false);
});

test('setHideAvatars stores true under the group and persists the save', () => {
    const fake = createFakeSillyTavern();
    const restore = fake.install();
    try {
        setHideAvatars(getSettings(), GROUP_A, true);
        assert.equal(getHideAvatars(fake.context.extensionSettings.st_advanced_group_chat, GROUP_A), true);
        assert.equal(fake.state.saveCount, 1);
    } finally {
        restore();
    }
});

test('setHideAvatars deletes the entry when hidden is false', () => {
    const settings = { hideAvatars: { [GROUP_A]: true } };
    setHideAvatars(settings, GROUP_A, false);
    assert.deepEqual(settings.hideAvatars, {});
});

test('setHideAvatars keeps each group separate', () => {
    const settings = { hideAvatars: {} };
    setHideAvatars(settings, GROUP_A, true);
    assert.equal(getHideAvatars(settings, GROUP_B), false);
});

test('pruneHiddenAvatars removes the entry of a deleted group', () => {
    const settings = { hideAvatars: { 'gone-group': true, g1: true } };
    const groups = [{ id: 'g1' }];
    assert.equal(pruneHiddenAvatars(settings, groups), 1);
    assert.deepEqual(settings.hideAvatars, { g1: true });
});

test('pruneHiddenAvatars is a no-op when groups is not an array', () => {
    const settings = { hideAvatars: { g1: true } };
    assert.equal(pruneHiddenAvatars(settings, undefined), 0);
    assert.deepEqual(settings.hideAvatars, { g1: true });
});

test('getHideTags returns false when nothing is saved', () => {
    assert.equal(getHideTags({ hideTags: {} }, GROUP_A), false);
    assert.equal(getHideTags(undefined, GROUP_A), false);
});

test('setHideTags stores true under the group and persists the save', () => {
    const fake = createFakeSillyTavern();
    const restore = fake.install();
    try {
        setHideTags(getSettings(), GROUP_A, true);
        assert.equal(getHideTags(fake.context.extensionSettings.st_advanced_group_chat, GROUP_A), true);
        assert.equal(fake.state.saveCount, 1);
    } finally {
        restore();
    }
});

test('setHideTags deletes the entry when hidden is false', () => {
    const settings = { hideTags: { [GROUP_A]: true } };
    setHideTags(settings, GROUP_A, false);
    assert.deepEqual(settings.hideTags, {});
});

test('setHideTags keeps each group separate', () => {
    const settings = { hideTags: {} };
    setHideTags(settings, GROUP_A, true);
    assert.equal(getHideTags(settings, GROUP_B), false);
});

test('pruneHiddenTags removes the entry of a deleted group', () => {
    const settings = { hideTags: { 'gone-group': true, g1: true } };
    const groups = [{ id: 'g1' }];
    assert.equal(pruneHiddenTags(settings, groups), 1);
    assert.deepEqual(settings.hideTags, { g1: true });
});

test('getSettings adds hideTags to saved settings that lack it', () => {
    const fake = createFakeSillyTavern();
    fake.context.extensionSettings.st_advanced_group_chat = { modelOverrides: {}, hideAvatars: { a: true } };
    const restore = fake.install();
    try {
        const settings = getSettings();

        assert.deepEqual(settings.hideTags, {});
        assert.deepEqual(settings.hideAvatars, { a: true });
    } finally {
        restore();
    }
});