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