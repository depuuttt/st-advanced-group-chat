/**
 * Advanced Group Chat — SillyTavern UI extension entry point.
 *
 * Each feature lives in its own module under `src/` and registers itself here.
 * Features are initialised once per `APP_READY` and disposed together, so the
 * extension never attaches duplicate SillyTavern event listeners.
 */

import { registerAppReady } from './src/extension-lifecycle.js';
import { initRequestRouting, disposeRequestRouting } from './src/request-routing.js';
import { initMemberModelButtons, disposeMemberModelButtons } from './src/member-model-button.js';
import { initHideMemberAvatars, disposeHideMemberAvatars } from './src/hide-member-avatars.js';
import { initHideMemberTags, disposeHideMemberTags } from './src/hide-member-tags.js';
import { initMaterialIcons, disposeMaterialIcons } from './src/material-icons.js';
import { initOverridePruning, disposeOverridePruning } from './src/override-pruning.js';

const MODULE_NAME = 'st_advanced_group_chat';

/** @type {{ name: string, init: () => void, dispose?: () => void }[]} */
const features = [];

/** @type {boolean} */
let initialized = false;

/**
 * Registers a feature module with the extension.
 *
 * Call at module scope, before `APP_READY` fires.
 *
 * @param {{ name: string, init: () => void, dispose?: () => void }} feature Feature to register.
 * @returns {void}
 */
export function registerFeature(feature) {
    if (!feature || typeof feature.init !== 'function') {
        throw new TypeError(`[${MODULE_NAME}] registerFeature requires an object with an init function`);
    }

    features.push(feature);
}

/**
 * Initialises every registered feature exactly once.
 *
 * @returns {void}
 */
export function onExtensionReady() {
    if (initialized) {
        return;
    }
    initialized = true;

    for (const feature of features) {
        try {
            feature.init();
        } catch (error) {
            console.error(`[${MODULE_NAME}] Feature "${feature.name}" failed to initialise`, error);
        }
    }
}

/**
 * Disposes every registered feature and re-arms initialisation.
 *
 * @returns {void}
 */
export function disposeExtension() {
    if (!initialized) {
        return;
    }
    initialized = false;

    for (const feature of [...features].reverse()) {
        try {
            feature.dispose?.();
        } catch (error) {
            console.error(`[${MODULE_NAME}] Feature "${feature.name}" failed to dispose`, error);
        }
    }
}

registerFeature({
    name: 'request-routing',
    init: initRequestRouting,
    dispose: disposeRequestRouting,
});

registerFeature({
    name: 'member-model-button',
    init: initMemberModelButtons,
    dispose: disposeMemberModelButtons,
});

registerFeature({
    name: 'hide-member-avatars',
    init: initHideMemberAvatars,
    dispose: disposeHideMemberAvatars,
});

registerFeature({
    name: 'hide-member-tags',
    init: initHideMemberTags,
    dispose: disposeHideMemberTags,
});

registerFeature({
    name: 'material-icons',
    init: initMaterialIcons,
    dispose: disposeMaterialIcons,
});

registerFeature({
    name: 'override-pruning',
    init: initOverridePruning,
    dispose: disposeOverridePruning,
});

registerAppReady(onExtensionReady);