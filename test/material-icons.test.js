import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    MATERIAL_BY_ACTION,
    applyMaterialIcons,
    restoreFontAwesomeIcons,
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