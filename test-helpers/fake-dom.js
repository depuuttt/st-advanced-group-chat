/**
 * A minimal fake DOM for exercising the member-list toolbar and its
 * contributors without a browser.
 *
 * `makeElement` builds an element carrying only what the extension reads:
 * class list, attributes, children, parent/sibling links, and the
 * insertion/removal methods. `installDocument` installs a fake SillyTavern plus
 * a fake `document` whose `querySelectorAll` answers `.rm_group_members` from
 * the supplied `containers` and any other `.class` selector from the elements
 * the document created, and counts MutationObserver instances so double-start
 * is observable.
 */

import { createFakeSillyTavern } from './fake-sillytavern.js';

/**
 * A fake DOM element carrying only what the module reads: class list, attributes,
 * children, parent/nextElementSibling links, and the insertion/removal methods.
 *
 * @param {string} [tag] Tag name.
 * @returns {object} The fake element.
 */
export function makeElement(tag = 'div') {
    const classes = new Set();
    const attrs = {};
    const children = [];
    const relink = () => {
        children.forEach((c, i) => {
            c.nextElementSibling = children[i + 1] ?? null;
            c.previousElementSibling = children[i - 1] ?? null;
        });
    };
    const detach = (child) => {
        if (child.parentNode?._children) {
            const i = child.parentNode._children.indexOf(child);
            if (i !== -1) child.parentNode._children.splice(i, 1);
        }
    };
    const el = {
        tagName: tag,
        textContent: '',
        title: '',
        _children: children,
        _listeners: [],
        _removed: false,
        parentNode: null,
        parentElement: null,
        nextElementSibling: null,
        previousElementSibling: null,
        get className() { return [...classes].join(' '); },
        set className(v) {
            classes.clear();
            String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
        },
        classList: {
            contains: (c) => classes.has(c),
            add: (...cs) => cs.forEach((c) => classes.add(c)),
            remove: (...cs) => cs.forEach((c) => classes.delete(c)),
            toggle: (c, force) => {
                const on = force === undefined ? !classes.has(c) : force;
                on ? classes.add(c) : classes.delete(c);
                return on;
            },
        },
        setAttribute: (k, v) => { attrs[k] = String(v); },
        getAttribute: (k) => (k in attrs ? attrs[k] : null),
        addEventListener: (type, fn) => el._listeners.push({ type, fn }),
        prepend: (child) => { detach(child); children.unshift(child); child.parentNode = el; child.parentElement = el; relink(); },
        appendChild: (child) => { detach(child); children.push(child); child.parentNode = el; child.parentElement = el; relink(); return child; },
        insertBefore: (child, ref) => {
            detach(child);
            const i = ref ? children.indexOf(ref) : children.length;
            children.splice(i === -1 ? children.length : i, 0, child);
            child.parentNode = el;
            child.parentElement = el;
            relink();
            return child;
        },
        remove: () => {
            el._removed = true;
            detach(el);
            if (el.parentNode?._children) {
                el.parentNode._children.forEach((c, i, arr) => {
                    c.nextElementSibling = arr[i + 1] ?? null;
                    c.previousElementSibling = arr[i - 1] ?? null;
                });
            }
            el.nextElementSibling = null;
            el.previousElementSibling = null;
        },
        querySelector: (sel) => {
            const cls = sel.startsWith('.') ? sel.slice(1) : null;
            return cls ? children.find((c) => c.classList.contains(cls)) ?? null : null;
        },
        querySelectorAll: (sel) => {
            const cls = sel.startsWith('.') ? sel.slice(1) : null;
            return cls ? children.filter((c) => c.classList.contains(cls)) : [];
        },
        click() {
            for (const { type, fn } of el._listeners) {
                if (type === 'click') fn({ stopPropagation() {} });
            }
        },
    };
    return el;
}

/**
 * Installs a fake SillyTavern plus a fake document serving `containers`
 * (`.rm_group_members`). The fake tracks every created element so any
 * per-class query works, and counts MutationObserver instances so double-start
 * is observable.
 *
 * @param {object} [options] Installation options.
 * @param {object[]} [options.containers] Elements answering `.rm_group_members`.
 * @param {boolean} [options.rafImmediate] Run queued animation frames synchronously.
 * @returns {object} Handles to the fake, the document, and restore/observability helpers.
 */
export function installDocument({ containers = [], rafImmediate = true } = {}) {
    const fake = createFakeSillyTavern({ groupId: 'group-1' });
    const restoreFake = fake.install();

    const created = [];
    const doc = {
        body: {},
        createElement: (tag) => {
            const el = makeElement(tag);
            created.push(el);
            return el;
        },
        querySelectorAll: (selector) => {
            if (selector === '.rm_group_members') return containers;
            const cls = selector.startsWith('.') ? selector.slice(1) : null;
            return cls ? created.filter((c) => c.classList.contains(cls)) : [];
        },
    };

    const previous = {
        document: globalThis.document,
        MutationObserver: globalThis.MutationObserver,
        requestAnimationFrame: globalThis.requestAnimationFrame,
        cancelAnimationFrame: globalThis.cancelAnimationFrame,
    };

    let observerCallback = null;
    let observerCount = 0;
    const observers = [];
    globalThis.document = doc;
    globalThis.MutationObserver = class {
        constructor(callback) {
            observerCallback = callback;
            observerCount += 1;
            observers.push(this);
            this.disconnected = false;
        }
        observe() {}
        disconnect() { this.disconnected = true; }
    };
    const cancelled = [];
    globalThis.requestAnimationFrame = (fn) => (rafImmediate ? (fn(), 1) : 1);
    globalThis.cancelAnimationFrame = (handle) => cancelled.push(handle);

    const restore = () => {
        globalThis.document = previous.document;
        globalThis.MutationObserver = previous.MutationObserver;
        globalThis.requestAnimationFrame = previous.requestAnimationFrame;
        globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
        restoreFake();
    };

    return {
        fake,
        doc,
        created,
        restore,
        cancelled,
        observers,
        getObserverCallback: () => observerCallback,
        getObserverCount: () => observerCount,
    };
}
