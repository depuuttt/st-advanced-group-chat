import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    MATERIAL_BY_ACTION,
    applyMaterialIcons,
    restoreFontAwesomeIcons,
    initMaterialIcons,
    disposeMaterialIcons,
} from '../src/material-icons.js';

const MEMBER_SELECTOR = '.rm_group_members .right_menu_button';

function makeButton({ action = null, className = '', text = '' } = {}) {
    const classes = new Set(className.split(/\s+/).filter(Boolean));
    const button = {
        action, text,
        getAttribute: (name) => (name === 'data-action' ? action : null),
        get textContent() { return text; },
        set textContent(value) { text = String(value); },
    };
    button.classList = {
        contains: (c) => classes.has(c),
        add: (...cs) => cs.forEach((c) => classes.add(c)),
        remove: (...cs) => cs.forEach((c) => classes.delete(c)),
    };
    button.className = () => [...classes].join(' ');
    return button;
}

/** A fake document whose querySelectorAll returns the buttons for the member selector. */
function makeDoc(buttons) {
    return {
        querySelectorAll: (selector) => (selector === MEMBER_SELECTOR ? buttons : []),
    };
}

function hasFaClass(button) {
    return button.className().split(/\s+/).some((c) => c.startsWith('fa-'));
}

test('applyMaterialIcons converts a mapped disable button', () => {
    const button = makeButton({ action: 'disable', className: 'right_menu_button fa-solid fa-lg fa-comment-slash' });

    applyMaterialIcons(makeDoc([button]));

    assert.ok(button.classList.contains('st-agc-material-icon'));
    assert.equal(hasFaClass(button), false);
    assert.ok(button.classList.contains('right_menu_button'));
    assert.equal(button.textContent, 'comments_disabled');
    assert.equal(button.getAttribute('data-action'), 'disable');
});

test('applyMaterialIcons converts the extension model button and keeps its classes', () => {
    const button = makeButton({
        action: 'model',
        className: 'right_menu_button st-agc-model-button has_override fa-solid fa-lg fa-robot',
    });

    applyMaterialIcons(makeDoc([button]));

    assert.ok(button.classList.contains('st-agc-model-button'));
    assert.ok(button.classList.contains('has_override'));
    assert.ok(button.classList.contains('st-agc-material-icon'));
    assert.equal(hasFaClass(button), false);
    assert.equal(button.textContent, 'smart_toy');
});

test('applyMaterialIcons maps up and down to their Material chevrons', () => {
    const up = makeButton({ action: 'up', className: 'right_menu_button fa-solid fa-chevron-up' });
    const down = makeButton({ action: 'down', className: 'right_menu_button fa-solid fa-chevron-down' });

    applyMaterialIcons(makeDoc([up, down]));

    assert.equal(up.textContent, 'keyboard_arrow_up');
    assert.equal(down.textContent, 'keyboard_arrow_down');
});

test('applyMaterialIcons skips buttons with no action or an unknown action', () => {
    const noAction = makeButton({ className: 'right_menu_button fa-solid fa-lg fa-comment-slash' });
    const unknown = makeButton({ action: 'future', className: 'right_menu_button fa-solid fa-lg fa-star' });
    const before = noAction.className();

    applyMaterialIcons(makeDoc([noAction, unknown]));

    assert.equal(noAction.className(), before);
    assert.equal(noAction.textContent, '');
    assert.equal(unknown.className(), 'right_menu_button fa-solid fa-lg fa-star');
    assert.equal(unknown.textContent, '');
});

test('applyMaterialIcons only queries the member-list selector', () => {
    const button = makeButton({ action: 'disable', className: 'right_menu_button fa-solid fa-comment-slash' });
    const queried = [];
    const doc = {
        querySelectorAll: (selector) => {
            queried.push(selector);
            return [button];
        },
    };

    applyMaterialIcons(doc);

    assert.deepEqual(queried, [MEMBER_SELECTOR]);
});

test('applyMaterialIcons is idempotent', () => {
    const button = makeButton({ action: 'model', className: 'right_menu_button st-agc-model-button fa-solid fa-robot' });
    const doc = makeDoc([button]);

    applyMaterialIcons(doc);
    const afterFirst = button.className();
    applyMaterialIcons(doc);

    assert.equal(button.className(), afterFirst);
    assert.equal(button.textContent, 'smart_toy');
    assert.equal(button.className().split(/\s+/).filter((c) => c === 'st-agc-material-icon').length, 1);
});

test('applyMaterialIcons does not rewrite textContent of already-converted buttons', () => {
    // Setting textContent — even to the same value — replaces the text node and
    // emits a childList mutation inside `.rm_group_members`. The MutationObserver
    // treats that as a member-list render and schedules another refresh, so an
    // unconditional write here feeds an endless refresh loop. Once a button is
    // already showing the right glyph, a refresh pass must not write again.
    const button = makeButton({ action: 'disable', className: 'right_menu_button fa-solid fa-lg fa-comment-slash' });
    let writes = 0;
    Object.defineProperty(button, 'textContent', {
        get: () => button.text,
        set: (value) => { writes += 1; button.text = String(value); },
    });

    const doc = makeDoc([button]);
    applyMaterialIcons(doc);
    const writesAfterFirst = writes;
    assert.equal(writesAfterFirst, 1, 'the first conversion writes once');
    applyMaterialIcons(doc);

    assert.equal(writes, writesAfterFirst, 'a second pass on unchanged buttons writes nothing');
});

test('restoreFontAwesomeIcons reverses a converted button and leaves others untouched', () => {
    const converted = makeButton({ action: 'disable', className: 'right_menu_button st-agc-material-icon', text: 'comments_disabled' });
    const untouched = makeButton({ action: 'disable', className: 'right_menu_button fa-solid fa-comment-slash' });

    restoreFontAwesomeIcons(makeDoc([converted, untouched]));

    assert.equal(converted.classList.contains('st-agc-material-icon'), false);
    assert.ok(converted.classList.contains('fa-solid'));
    assert.ok(converted.classList.contains('fa-lg'));
    assert.ok(converted.classList.contains('fa-comment-slash'));
    assert.equal(converted.textContent, '');
    assert.equal(converted.getAttribute('data-action'), 'disable');
    assert.equal(untouched.className(), 'right_menu_button fa-solid fa-comment-slash');
});

/** A fake element for the injected <link>: attributes, children, and remove(). */
function makeFakeElement(tag = 'div') {
    const attrs = {};
    const children = [];
    const el = {
        tagName: tag,
        textContent: '',
        _children: children,
        _parent: null,
        setAttribute: (k, v) => { attrs[k] = String(v); },
        getAttribute: (k) => (k in attrs ? attrs[k] : null),
        appendChild: (child) => { child._parent = el; children.push(child); return child; },
        remove: () => {
            if (el._parent) {
                const i = el._parent._children.indexOf(el);
                if (i >= 0) el._parent._children.splice(i, 1);
            }
        },
    };
    return el;
}

/** A fake document whose querySelectorAll returns the given member-list buttons. */
function makeFakeDocument({ buttons = [] } = {}) {
    const appended = [];
    return {
        head: { _children: appended, querySelector: () => null, appendChild: (el) => appended.push(el) },
        createElement: (tag) => makeFakeElement(tag),
        querySelectorAll: (selector) => (selector === MEMBER_SELECTOR ? buttons : []),
        _appended: appended,
    };
}

/** Runs `fn` with globalThis.document set to `doc`, restoring the previous value. */
function withDocument(doc, fn) {
    const previous = globalThis.document;
    if (doc === undefined) delete globalThis.document;
    else globalThis.document = doc;
    try {
        return fn();
    } finally {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
    }
}

test('initMaterialIcons converts member buttons without injecting any font link', () => {
    const button = makeButton({ action: 'disable', className: 'right_menu_button fa-solid fa-comment-slash' });
    const doc = makeFakeDocument({ buttons: [button] });

    withDocument(doc, () => initMaterialIcons());

    // The font is self-hosted via @font-face in style.css; init must not append
    // any external stylesheet <link> to the document.
    assert.equal(doc._appended.length, 0);
    assert.ok(button.classList.contains('st-agc-material-icon'));
    assert.equal(button.textContent, 'comments_disabled');
});

test('disposeMaterialIcons restores buttons', () => {
    const button = makeButton({
        action: 'disable',
        className: 'right_menu_button st-agc-material-icon',
        text: 'comments_disabled',
    });
    const doc = makeFakeDocument({ buttons: [button] });

    withDocument(doc, () => disposeMaterialIcons());

    assert.equal(button.classList.contains('st-agc-material-icon'), false);
    assert.ok(button.classList.contains('fa-solid'));
    assert.ok(button.classList.contains('fa-comment-slash'));
    assert.equal(button.textContent, '');
});

test('disposeMaterialIcons warns instead of throwing without a document', () => {
    const originalWarn = console.warn;
    let warned = false;
    console.warn = () => { warned = true; };
    try {
        withDocument(undefined, () => {
            assert.doesNotThrow(() => disposeMaterialIcons());
        });
        assert.equal(warned, true);
    } finally {
        console.warn = originalWarn;
    }
});

test('initMaterialIcons warns instead of throwing without a document', () => {
    const originalWarn = console.warn;
    let warned = false;
    console.warn = () => { warned = true; };
    try {
        withDocument(undefined, () => {
            assert.doesNotThrow(() => initMaterialIcons());
        });
        assert.equal(warned, true);
    } finally {
        console.warn = originalWarn;
    }
});