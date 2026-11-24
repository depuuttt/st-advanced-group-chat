import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * SillyTavern loads an extension entry module with a dynamic import once the app
 * object exists. Each test re-imports index.js under a fresh URL so the module
 * registry runs again against a fresh fake SillyTavern.
 */
let importCounter = 0;

function makeSillyTavern() {
    const listeners = new Map();

    const eventSource = {
        on(type, handler) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(handler);
        },
        removeListener(type, handler) {
            const list = listeners.get(type) ?? [];
            const index = list.indexOf(handler);
            if (index !== -1) list.splice(index, 1);
        },
    };

    return {
        listeners,
        emitReady() {
            for (const handler of [...(listeners.get('app_ready') ?? [])]) handler();
        },
        sillyTavern: {
            SillyTavern: {
                getContext: () => ({
                    eventSource,
                    eventTypes: { APP_READY: 'app_ready' },
                }),
            },
        },
    };
}

async function loadIndex({ withSillyTavern = true } = {}) {
    const fake = makeSillyTavern();
    const previous = globalThis.SillyTavern;
    if (withSillyTavern) {
        globalThis.SillyTavern = fake.sillyTavern.SillyTavern;
    } else {
        delete globalThis.SillyTavern;
    }

    importCounter += 1;
    const module = await import(`../index.js?load=${importCounter}`);

    return { module, fake, restore: () => {
        if (previous === undefined) delete globalThis.SillyTavern;
        else globalThis.SillyTavern = previous;
    } };
}

test('index.js subscribes its entry point to APP_READY', async () => {
    const { fake, restore } = await loadIndex();
    try {
        assert.equal(fake.listeners.get('app_ready')?.length, 1);
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

        fake.emitReady();

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

        fake.emitReady();
        fake.emitReady();
        assert.equal(initCalls, 1);

        module.disposeExtension();
        fake.emitReady();
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
        fake.emitReady();

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

            fake.emitReady();

            assert.deepEqual(calls, ['healthy']);
        } finally {
            console.error = originalError;
        }
    } finally {
        restore();
    }
});