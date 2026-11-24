import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerAppReady } from '../src/extension-lifecycle.js';

/**
 * SillyTavern loads an extension entry module with a dynamic import once the app
 * object exists, so `globalThis.SillyTavern` is available at import time. The
 * extension still has to wait for APP_READY before it touches the UI.
 */
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
        emit(type, ...args) {
            for (const handler of [...(listeners.get(type) ?? [])]) handler(...args);
        },
    };

    return {
        listeners,
        eventSource,
        globalObj: {
            SillyTavern: {
                getContext: () => ({
                    eventSource,
                    eventTypes: { APP_READY: 'app_ready' },
                }),
            },
        },
    };
}

test('registerAppReady subscribes the handler to APP_READY', () => {
    const { globalObj, listeners } = makeSillyTavern();
    let calls = 0;
    const handler = () => { calls += 1; };

    const subscribed = registerAppReady(handler, { globalObj });

    assert.equal(subscribed, true);
    assert.equal(listeners.get('app_ready').length, 1);

    listeners.get('app_ready')[0]();
    assert.equal(calls, 1);
});

test('registerAppReady reports failure instead of throwing outside SillyTavern', () => {
    const subscribed = registerAppReady(() => {}, { globalObj: {} });

    assert.equal(subscribed, false);
});