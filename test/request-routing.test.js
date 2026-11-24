import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSillyTavern } from '../test-helpers/fake-sillytavern.js';

let importCounter = 0;

/**
 * request-routing keeps the active speaker in module state, so each test loads a
 * fresh copy of the module under a new URL.
 */
async function loadRouting() {
    importCounter += 1;
    return import(`../src/request-routing.js?load=${importCounter}`);
}

const ALICE = { avatar: 'alice.png', name: 'Alice' };
const BOB = { avatar: 'bob.png', name: 'Bob' };
const GROUP = 'group-1';

/** Builds a Chat Completion request shaped like SillyTavern's `generate_data`. */
function makeRequest({ char_name = 'Bob', model = 'st-default-model' } = {}) {
    return {
        type: 'normal',
        messages: [{ role: 'user', content: 'hi' }],
        model,
        temperature: 0.8,
        max_tokens: 512,
        stream: true,
        char_name,
    };
}

/**
 * Sets up a fake SillyTavern with Alice and Bob in `GROUP`, saves an override
 * for Bob, and drafts Bob as the active group member.
 */
async function withBobDrafted({ groupId = GROUP, override = 'bob-model' } = {}) {
    const fake = createFakeSillyTavern({ groupId, characters: [ALICE, BOB] });
    const restore = fake.install();
    const routing = await loadRouting();

    fake.context.extensionSettings.st_advanced_group_chat = {
        modelOverrides: override ? { [GROUP]: { [BOB.avatar]: override } } : {},
    };

    routing.handleMemberDrafted(1);

    return { fake, routing, restore };
}

test('handleMemberDrafted resolves the avatar id of the drafted character', async () => {
    const { fake, routing, restore } = await withBobDrafted();
    try {
        assert.equal(routing.getActiveSpeaker().groupId, GROUP);
        assert.equal(routing.getActiveSpeaker().memberId, BOB.avatar);
        assert.equal(routing.getActiveSpeaker().memberName, 'Bob');
        assert.equal(fake.state.listeners.get('group_member_drafted')?.length ?? 0, 0);
    } finally {
        restore();
    }
});

test('handleChatCompletionSettingsReady replaces the model for the active member', async () => {
    const { fake, routing, restore } = await withBobDrafted();
    try {
        const request = makeRequest({ char_name: 'Bob' });

        routing.handleChatCompletionSettingsReady(request);

        assert.equal(request.model, 'bob-model');
    } finally {
        restore();
    }
});

test('handleChatCompletionSettingsReady leaves every other request field untouched', async () => {
    const { routing, restore } = await withBobDrafted();
    try {
        const request = makeRequest({ char_name: 'Bob' });
        const before = structuredClone(request);

        routing.handleChatCompletionSettingsReady(request);

        assert.deepEqual({ ...request, model: before.model }, before);
        assert.equal(request.model, 'bob-model');
    } finally {
        restore();
    }
});

test('handleChatCompletionSettingsReady keeps the selected model when no override is saved', async () => {
    const { routing, restore } = await withBobDrafted({ override: null });
    try {
        const request = makeRequest({ char_name: 'Bob' });

        routing.handleChatCompletionSettingsReady(request);

        assert.equal(request.model, 'st-default-model');
    } finally {
        restore();
    }
});

test('handleChatCompletionSettingsReady ignores a request from another speaker', async () => {
    const { routing, restore } = await withBobDrafted();
    try {
        const request = makeRequest({ char_name: 'Alice' });

        routing.handleChatCompletionSettingsReady(request);

        assert.equal(request.model, 'st-default-model');
    } finally {
        restore();
    }
});

test('handleChatCompletionSettingsReady ignores a request when no member was drafted', async () => {
    const fake = createFakeSillyTavern({ groupId: GROUP, characters: [ALICE, BOB] });
    const restore = fake.install();
    const routing = await loadRouting();
    fake.context.extensionSettings.st_advanced_group_chat = {
        modelOverrides: { [GROUP]: { [BOB.avatar]: 'bob-model' } },
    };
    try {
        const request = makeRequest({ char_name: 'Bob' });

        routing.handleChatCompletionSettingsReady(request);

        assert.equal(request.model, 'st-default-model');
    } finally {
        restore();
    }
});

test('handleChatCompletionSettingsReady ignores requests outside a group chat', async () => {
    const { routing, restore } = await withBobDrafted({ groupId: null });
    try {
        const request = makeRequest({ char_name: 'Bob' });

        routing.handleChatCompletionSettingsReady(request);

        assert.equal(request.model, 'st-default-model');
    } finally {
        restore();
    }
});

test('handleChatCompletionSettingsReady ignores a drafted member from a different group', async () => {
    const { routing, restore } = await withBobDrafted();
    try {
        // The group changed under the extension without a new draft.
        const request = makeRequest({ char_name: 'Bob' });
        routing.handleChatCompletionSettingsReady(request);
        assert.equal(request.model, 'bob-model');

        const otherGroupRequest = makeRequest({ char_name: 'Bob' });
        globalThis.SillyTavern.getContext().groupId = 'group-2';

        routing.handleChatCompletionSettingsReady(otherGroupRequest);

        assert.equal(otherGroupRequest.model, 'st-default-model');
    } finally {
        restore();
    }
});

test('handleGroupWrapperFinished clears the active speaker', async () => {
    const { routing, restore } = await withBobDrafted();
    try {
        routing.handleGroupWrapperFinished();

        assert.equal(routing.getActiveSpeaker().memberId, null);
    } finally {
        restore();
    }
});

test('initRequestRouting subscribes to the group and request events', async () => {
    const fake = createFakeSillyTavern({ groupId: GROUP, characters: [ALICE, BOB] });
    const restore = fake.install();
    const routing = await loadRouting();
    fake.context.extensionSettings.st_advanced_group_chat = {
        modelOverrides: { [GROUP]: { [BOB.avatar]: 'bob-model' } },
    };
    try {
        routing.initRequestRouting();

        const request = makeRequest({ char_name: 'Bob' });
        fake.emit('group_member_drafted', 1);
        fake.emit('chat_completion_settings_ready', request);

        assert.equal(request.model, 'bob-model');

        fake.emit('group_wrapper_finished', { selected_group: GROUP, type: 'normal' });
        const afterFinish = makeRequest({ char_name: 'Bob' });
        fake.emit('chat_completion_settings_ready', afterFinish);

        assert.equal(afterFinish.model, 'st-default-model');
    } finally {
        restore();
    }
});

test('disposeRequestRouting removes the listeners it added', async () => {
    const fake = createFakeSillyTavern({ groupId: GROUP, characters: [ALICE, BOB] });
    const restore = fake.install();
    const routing = await loadRouting();
    fake.context.extensionSettings.st_advanced_group_chat = {
        modelOverrides: { [GROUP]: { [BOB.avatar]: 'bob-model' } },
    };
    try {
        routing.initRequestRouting();
        routing.disposeRequestRouting();

        const request = makeRequest({ char_name: 'Bob' });
        fake.emit('group_member_drafted', 1);
        fake.emit('chat_completion_settings_ready', request);

        assert.equal(request.model, 'st-default-model');
        assert.equal(fake.state.listeners.get('group_member_drafted')?.length ?? 0, 0);
    } finally {
        restore();
    }
});