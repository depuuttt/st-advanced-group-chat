/**
 * Lifecycle helpers for the Advanced Group Chat extension.
 *
 * SillyTavern imports an extension entry module with a dynamic import once the
 * app object exists, so `globalThis.SillyTavern` is already available when
 * `index.js` runs. The extension still has to wait for `APP_READY` before it
 * touches the UI, because the DOM is not populated before then.
 */

const MODULE_NAME = 'st_advanced_group_chat';

/**
 * Subscribes `handler` to SillyTavern's `APP_READY` event.
 *
 * SillyTavern re-emits `APP_READY` to listeners that attach after the app is
 * already ready, so subscribing late is safe. It is not safe to assume the
 * global exists, so this reports failure rather than throwing.
 *
 * @param {() => void} handler Called once the app is ready.
 * @param {{ globalObj?: typeof globalThis }} [options] Injection point for tests.
 * @returns {boolean} True when the handler was subscribed.
 */
export function registerAppReady(handler, { globalObj = globalThis } = {}) {
    const context = globalObj.SillyTavern?.getContext?.();

    if (!context?.eventSource || !context?.eventTypes?.APP_READY) {
        console.warn(`[${MODULE_NAME}] SillyTavern context is unavailable; extension not initialised`);
        return false;
    }

    context.eventSource.on(context.eventTypes.APP_READY, handler);
    return true;
}