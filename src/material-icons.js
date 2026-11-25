/**
 * Material Symbols Rounded icons for group member row buttons.
 *
 * SillyTavern's member template renders Font Awesome icons (class-based, empty
 * text). The ligature-based Material Symbols font needs the icon name as the
 * element's text, so swapping means replacing the `fa-*` classes and setting
 * text content per button. SillyTavern's click handlers key off `data-action`
 * and the `right_menu_button` class, both of which are preserved, so behavior
 * is untouched.
 */

const MODULE_NAME = 'st_advanced_group_chat';
const MATERIAL_CLASS = 'st-agc-material-icon';
const MEMBER_BUTTON_SELECTOR = '.rm_group_members .right_menu_button';
const FONT_LINK_HREF = 'https://fonts.googleapis.com/css2?family+Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block';
const FONT_LINK_ID = 'st-agc-material-symbols-css';

/** data-action → Material Symbols Rounded name. */
export const MATERIAL_BY_ACTION = {
    model: 'smart_toy',
    disable: 'comments_disabled',
    enable: 'comments_disabled',
    speak: 'chat_bubble',
    up: 'keyboard_arrow_up',
    down: 'keyboard_arrow_down',
    view: 'portrait',
    remove: 'close',
    add: 'add',
};

/** data-action → the Font Awesome classes SillyTavern's template uses, for restore. */
const FONT_AWESOME_BY_ACTION = {
    model: ['fa-solid', 'fa-lg', 'fa-robot'],
    disable: ['fa-solid', 'fa-lg', 'fa-comment-slash'],
    enable: ['fa-solid', 'fa-lg', 'fa-comment-slash'],
    speak: ['fa-solid', 'fa-lg', 'fa-comment'],
    up: ['fa-solid', 'fa-chevron-up'],
    down: ['fa-solid', 'fa-chevron-down'],
    view: ['fa-solid', 'fa-xl', 'fa-image-portrait'],
    remove: ['fa-solid', 'fa-xl', 'fa-xmark'],
    add: ['fa-solid', 'fa-xl', 'fa-plus'],
};

function isFontAwesomeClass(name) {
    return /^fa-/.test(name);
}

/** Class names as an array, coping with both real DOM (`className` string) and fakes (`className()`). */
function classNamesOf(button) {
    const raw = typeof button.className === 'function' ? button.className() : button.className;
    return raw ? String(raw).split(/\s+/).filter(Boolean) : [];
}

function warn(message) {
    console.warn(`[${MODULE_NAME}] ${message}`);
}

/**
 * Convert every mapped member-row button to its Material Symbols glyph.
 * @param {{ querySelectorAll: (selector: string) => Iterable<Element> }} doc
 */
export function applyMaterialIcons(doc) {
    if (!doc?.querySelectorAll) {
        warn('applyMaterialIcons called without a document; skipping');
        return;
    }
    for (const button of doc.querySelectorAll(MEMBER_BUTTON_SELECTOR)) {
        const action = button.getAttribute('data-action');
        const material = MATERIAL_BY_ACTION[action];
        if (!material) continue;

        const faClasses = classNamesOf(button).filter(isFontAwesomeClass);
        if (faClasses.length) button.classList.remove(...faClasses);
        button.classList.add(MATERIAL_CLASS);
        button.textContent = material;
    }
}

/**
 * Reverse {@link applyMaterialIcons}: restore Font Awesome classes and clear text.
 * @param {{ querySelectorAll: (selector: string) => Iterable<Element> }} doc
 */
export function restoreFontAwesomeIcons(doc) {
    if (!doc?.querySelectorAll) {
        warn('restoreFontAwesomeIcons called without a document; skipping');
        return;
    }
    for (const button of doc.querySelectorAll(MEMBER_BUTTON_SELECTOR)) {
        if (!button.classList.contains(MATERIAL_CLASS)) continue;
        const action = button.getAttribute('data-action');
        const faClasses = FONT_AWESOME_BY_ACTION[action];
        if (!faClasses) continue;

        button.classList.remove(MATERIAL_CLASS);
        button.classList.add(...faClasses);
        button.textContent = '';
    }
}

/**
 * Inject the Google Fonts Material Symbols Rounded stylesheet once.
 *
 * Each DOM access is guarded so a missing document degrades to a warning rather
 * than throwing — the extension must never take the host down.
 *
 * @param {Document} doc The document to inject into.
 * @returns {void}
 */
export function injectMaterialSymbolsFont(doc) {
    if (!doc?.head?.querySelector || typeof doc.createElement !== 'function') {
        warn('injectMaterialSymbolsFont called without a usable document; skipping');
        return;
    }

    if (doc.head.querySelector(`#${FONT_LINK_ID}`)) {
        return;
    }

    const link = doc.createElement('link');
    link.setAttribute('id', FONT_LINK_ID);
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', FONT_LINK_HREF);
    doc.head.appendChild(link);
}

/**
 * Feature init: load the font, then convert any already-rendered member buttons.
 * @returns {void}
 */
export function initMaterialIcons() {
    const doc = globalThis.document;
    injectMaterialSymbolsFont(doc);
    applyMaterialIcons(doc);
}

/**
 * Feature dispose: restore Font Awesome icons and remove the injected stylesheet.
 * @returns {void}
 */
export function disposeMaterialIcons() {
    const doc = globalThis.document;
    restoreFontAwesomeIcons(doc);
    doc?.head?.querySelector?.(`#${FONT_LINK_ID}`)?.remove?.();
}