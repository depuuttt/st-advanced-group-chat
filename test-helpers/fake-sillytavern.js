/**
 * A minimal stand-in for the parts of `SillyTavern.getContext()` that the
 * extension uses. Tests install it on `globalThis.SillyTavern` so modules that
 * read the context lazily pick it up.
 *
 * `getContext()` returns the same context object every call, matching
 * SillyTavern's behaviour closely enough for these tests: mutating
 * `context.groupId` or `context.characters` between calls is visible to the
 * code under test.
 */

export function createFakeSillyTavern({ groupId = null, characters = [] } = {}) {
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

    const state = {
        listeners,
        saveCount: 0,
        groupId,
        characters,
    };

    const context = {
        groupId,
        characters,
        extensionSettings: {},
        saveSettingsDebounced: () => { state.saveCount += 1; },
        eventSource,
        eventTypes: {
            APP_READY: 'app_ready',
            GROUP_MEMBER_DRAFTED: 'group_member_drafted',
            GROUP_WRAPPER_FINISHED: 'group_wrapper_finished',
            CHAT_COMPLETION_SETTINGS_READY: 'chat_completion_settings_ready',
        },
    };

    return {
        context,
        state,
        eventSource,
        /** Fires every handler currently subscribed to `type`. */
        emit(type, ...args) {
            for (const handler of [...(listeners.get(type) ?? [])]) handler(...args);
        },
        /** Installs the fake as the global SillyTavern and returns a restore fn. */
        install() {
            const previous = globalThis.SillyTavern;
            globalThis.SillyTavern = { getContext: () => context };
            return () => {
                if (previous === undefined) delete globalThis.SillyTavern;
                else globalThis.SillyTavern = previous;
            };
        },
    };
}