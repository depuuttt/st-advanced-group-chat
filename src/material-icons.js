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
 * Feature init: convert any already-rendered member buttons to Material Symbols.
 *
 * The font is self-hosted (bundled `fonts/material-symbols-rounded.woff2`, loaded
 * via @font-face in style.css), so there is no external stylesheet to inject and
 * no network dependency for the icons to render.
 *
 * @returns {void}
 */
export function initMaterialIcons() {
    applyMaterialIcons(globalThis.document);
}

/**
 * Feature dispose: restore Font Awesome icons on the member-row buttons.
 * @returns {void}
 */
export function disposeMaterialIcons() {
    restoreFontAwesomeIcons(globalThis.document);
}