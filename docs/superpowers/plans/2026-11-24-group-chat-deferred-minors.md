# Deferred Review Minors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close out the seven Minor findings from the code review of the group-chat per-member models extension.

**Architecture:** Six small changes across three source files and one new feature module. The only behaviour change is pruning overrides whose group or member no longer exists; the rest are correctness, accessibility, and localization cleanups.

**Tech Stack:** JavaScript ES modules, SillyTavern extension APIs, HTML/DOM, CSS. No build step, no third-party dependency.

**Spec:** `docs/superpowers/specs/2026-11-24-group-chat-deferred-minors-design.md`

## Global Constraints

- Target SillyTavern 1.19.1.
- No third-party dependency and no build step.
- The override storage shape does not change: `extensionSettings['st_advanced_group_chat'].modelOverrides[groupId][memberId] = 'model-name'`.
- Never delete a saved override that is still in use. This is the one failure mode that cannot be undone.
- Do not read the payload of `GROUP_CHAT_DELETED`. It is a chat ID from two call sites and a chat name from a third.
- `t` from the SillyTavern context is tagged-template only: `t('literal')` throws because it calls `strings.reduce`. Always write `` t`literal` ``.
- English source strings are both the translation key and the fallback when no locale is loaded.
- `group.members` is only trusted for pruning when it is an array.

## Review Focus

- **A live override must survive a prune.** A member removed from one group keeps their model in every other group. → Task 1.
- **A group that has not loaded its `members` array keeps its overrides.** → Task 1.
- **`groups` unavailable or not an array makes the prune a no-op, not a wipe.** → Task 1.
- **Space on the focused model button must not scroll the page.** → Task 3.
- **With no SillyTavern locale loaded, every string renders in English rather than empty.** → Task 4.

---

### Task 1: Settings defaults factory and orphan pruning

**Files:**
- Modify: `src/model-overrides.js`
- Test: `test/model-overrides.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `createDefaultSettings() -> { modelOverrides: {} }` — a fresh object on every call.
  - `pruneModelOverrides(settings, groups) -> number` — removes overrides whose group or member is gone; returns how many were removed; never persists.

- [ ] **Step 1: Write the failing tests**

Add to `test/model-overrides.test.js`:

```js
test('createDefaultSettings returns a fresh object each call', () => {
    const first = createDefaultSettings();
    first.modelOverrides['g1'] = { 'a.png': 'm' };
    assert.deepEqual(createDefaultSettings(), { modelOverrides: {} });
});

test('pruneModelOverrides removes an override for a deleted group', () => {
    const settings = { modelOverrides: { 'gone-group': { 'a.png': 'm' } } };
    assert.equal(pruneModelOverrides(settings, []), 1);
    assert.deepEqual(settings.modelOverrides, {});
});

test('pruneModelOverrides removes an override for a member no longer in the group', () => {
    const settings = { modelOverrides: { g1: { 'a.png': 'm', 'b.png': 'm' } } };
    const groups = [{ id: 'g1', members: ['b.png'] }];
    assert.equal(pruneModelOverrides(settings, groups), 1);
    assert.deepEqual(settings.modelOverrides, { g1: { 'b.png': 'm' } });
});

test('pruneModelOverrides keeps overrides that are still in use', () => {
    const settings = { modelOverrides: { g1: { 'a.png': 'm' } } };
    const groups = [{ id: 'g1', members: ['a.png'] }];
    assert.equal(pruneModelOverrides(settings, groups), 0);
    assert.deepEqual(settings.modelOverrides, { g1: { 'a.png': 'm' } });
});

test('pruneModelOverrides leaves a member override alone in the groups that still contain them', () => {
    const settings = { modelOverrides: { g1: { 'a.png': 'm1' }, g2: { 'a.png': 'm2' } } };
    const groups = [{ id: 'g1', members: [] }, { id: 'g2', members: ['a.png'] }];
    assert.equal(pruneModelOverrides(settings, groups), 1);
    assert.deepEqual(settings.modelOverrides, { g1: {}, g2: { 'a.png': 'm2' } });
});

test('pruneModelOverrides is a no-op when groups is not an array', () => {
    const settings = { modelOverrides: { g1: { 'a.png': 'm' } } };
    assert.equal(pruneModelOverrides(settings, undefined), 0);
    assert.deepEqual(settings.modelOverrides, { g1: { 'a.png': 'm' } });
});

test('pruneModelOverrides keeps overrides when a group has no members array', () => {
    const settings = { modelOverrides: { g1: { 'a.png': 'm' } } };
    assert.equal(pruneModelOverrides(settings, [{ id: 'g1' }]), 0);
    assert.deepEqual(settings.modelOverrides, { g1: { 'a.png': 'm' } });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/model-overrides.test.js`
Expected: FAIL — `createDefaultSettings` and `pruneModelOverrides` are not exported.

- [ ] **Step 3: Implement both functions in `src/model-overrides.js`**

Replace the frozen `DEFAULT_SETTINGS` constant with `createDefaultSettings()` returning `{ modelOverrides: {} }`, and update `getSettings()` to call it for both the initial creation and the missing-key backfill.

Add `pruneModelOverrides(settings, groups)`: return 0 when `settings?.modelOverrides` or `groups` is not an array; for each group ID, delete the group entry when no group in `groups` has that ID, otherwise delete each member ID that a `group.members` array does not contain; return the total number of deleted entries.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/model-overrides.test.js`
Expected: PASS

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/model-overrides.js test/model-overrides.test.js
git commit -m "Prune overrides for deleted groups and members"
```

---

### Task 2: Wire pruning to SillyTavern's group events

**Files:**
- Create: `src/override-pruning.js`
- Modify: `index.js`
- Test: `test/override-pruning.test.js`

**Interfaces:**
- Consumes: `pruneModelOverrides(settings, groups) -> number` and `getSettings() -> object|null` from Task 1.
- Produces: `initOverridePruning() -> void`, `disposeOverridePruning() -> void`.

- [ ] **Step 1: Teach the shared fake about groups, then write the failing tests**

`test-helpers/fake-sillytavern.js` has no `groups` on its context yet. Add a
`groups` option to `createFakeSillyTavern({ groupId, characters, groups = [] })`
and put it on the context object beside `characters`.

Then add `test/override-pruning.test.js`. Each test builds its own fake with
`createFakeSillyTavern`, sets
`fake.context.extensionSettings.st_advanced_group_chat`, and reads results back
from there and from `fake.state.saveCount`.

```js
test('initOverridePruning prunes immediately and saves once', () => {
    // one live group, plus an override for a group that no longer exists
    // -> after initOverridePruning(): the orphan is gone and saveCount is 1
});

test('initOverridePruning does not save when nothing was pruned', () => {
    // every override belongs to a live group and a current member
    // -> after initOverridePruning() and after fake.emit('group_updated'):
    //    saveCount is 0
});

test('initOverridePruning prunes when a member leaves a group', () => {
    // live override for a.png; then set groups[0].members = []
    // -> after fake.emit('group_updated'): a.png is gone and saveCount is 1
});

test('initOverridePruning prunes when a group is deleted', () => {
    // live override; then set groups.length = 0
    // -> after fake.emit('group_chat_deleted', 'some-chat-id'):
    //    the override is gone, whatever the payload says
});

test('disposeOverridePruning stops reacting to group events', () => {
    // init, dispose, then empty groups[0].members and emit group_updated
    // -> nothing is pruned and saveCount is 0
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/override-pruning.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/override-pruning.js`**

`initOverridePruning()` runs one prune and, when it removed anything, calls `saveSettingsDebounced()`; then subscribes the same handler to `GROUP_UPDATED` and `GROUP_CHAT_DELETED`. Neither handler reads the event payload — both call `getSettings()`, `SillyTavern.getContext().groups`, and `pruneModelOverrides`, and save when the count is above zero. Read the context through a try/catch returning null, matching `src/request-routing.js`.

`disposeOverridePruning()` removes both listeners.

- [ ] **Step 4: Register the feature in `index.js`**

```js
import { initOverridePruning, disposeOverridePruning } from './src/override-pruning.js';
registerFeature({ name: 'override-pruning', init: initOverridePruning, dispose: disposeOverridePruning });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/override-pruning.test.js`
Expected: PASS

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add src/override-pruning.js index.js test/override-pruning.test.js
git commit -m "Prune orphaned overrides when SillyTavern's groups change"
```

---

### Task 3: Keyboard activation for the model button

**Files:**
- Modify: `src/member-model-button.js`
- Test: `test/member-model-button.test.js`

**Interfaces:**
- Consumes: `openMemberModelInput(groupId, memberId) -> Promise<void>` (existing).
- Produces: `handleButtonKeydown(event) -> boolean` — true when the key activates the button, after calling `preventDefault()` and `stopPropagation()`.

- [ ] **Step 1: Write the failing tests**

```js
function makeKeyEvent(key) {
    const event = { key, prevented: false, stopped: false };
    event.preventDefault = () => { event.prevented = true; };
    event.stopPropagation = () => { event.stopped = true; };
    return event;
}

test('handleButtonKeydown activates on Enter and Space', () => {
    for (const key of ['Enter', ' ']) {
        const event = makeKeyEvent(key);
        assert.equal(handleButtonKeydown(event), true);
        assert.equal(event.prevented, true, `${key} should prevent the default scroll`);
    }
});

test('handleButtonKeydown ignores every other key', () => {
    for (const key of ['a', 'Tab', 'Escape', 'ArrowDown']) {
        const event = makeKeyEvent(key);
        assert.equal(handleButtonKeydown(event), false);
        assert.equal(event.prevented, false);
    }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/member-model-button.test.js`
Expected: FAIL — `handleButtonKeydown` is not exported.

- [ ] **Step 3: Implement the handler and wire it in `src/member-model-button.js`**

Export `handleButtonKeydown(event)` returning false for any key other than `Enter` and `' '`, and otherwise calling `preventDefault()` and `stopPropagation()` before returning true.

In `refreshMemberModelButtons`, add a `keydown` listener beside the existing `click` listener that calls `openMemberModelInput(getContextOrNull()?.groupId ?? null, memberId)` when `handleButtonKeydown(event)` returns true.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/member-model-button.test.js`
Expected: PASS

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/member-model-button.js test/member-model-button.test.js
git commit -m "Activate the model button from the keyboard"
```

---

### Task 4: Localize the user-facing strings

**Files:**
- Modify: `src/member-model-button.js`
- Test: `test/member-model-button.test.js`

**Interfaces:**
- Consumes: `getContextOrNull()` (existing), `getButtonState(override) -> { hasOverride, title }` (existing).
- Produces: `translateText(strings, ...values) -> string` — uses the SillyTavern context's `t` when present, otherwise interpolates the English source strings.

- [ ] **Step 1: Write the failing tests**

```js
test('translateText falls back to the English source string with no locale loaded', () => {
    const restore = createFakeSillyTavern().install();
    try {
        assert.equal(translateText`Set a model for this member`, 'Set a model for this member');
        assert.equal(translateText`Model: ${'gpt-5'}`, 'Model: gpt-5');
    } finally {
        restore();
    }
});

test('translateText uses the SillyTavern translation function when one is available', () => {
    const fake = createFakeSillyTavern();
    fake.context.t = (strings, ...values) =>
        strings.reduce((acc, s, i) => acc + s + (values[i] !== undefined ? `<${values[i]}>` : ''), '');
    const restore = fake.install();
    try {
        assert.equal(translateText`Model: ${'gpt-5'}`, 'Model: <gpt-5>');
    } finally {
        restore();
    }
});

test('getButtonState titles are produced through the translation helper', () => {
    const restore = createFakeSillyTavern().install();
    try {
        assert.equal(getButtonState('gpt-5').title, 'Model: gpt-5');
        assert.equal(getButtonState('').title, 'Set a model for this member');
    } finally {
        restore();
    }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/member-model-button.test.js`
Expected: FAIL — `translateText` is not exported.

- [ ] **Step 3: Implement `translateText` and use it in `src/member-model-button.js`**

`translateText` is a tagged template: read `t` from `getContextOrNull()`, call it when it is a function, and otherwise reduce the strings and values into the English source text. Wrap the `t` call in a try/catch that falls back to the same reduction.

Route the four strings through it: the unset title `Set a model for this member`, the active title `` `Model: ${override}` ``, the dialog header `Member model`, and the dialog body `` `Model for ${label}. Leave empty to use SillyTavern's selected model.` ``. `getButtonState` becomes the single place the two titles are produced.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/member-model-button.test.js`
Expected: PASS

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/member-model-button.js test/member-model-button.test.js
git commit -m "Localize the member model button strings"
```

---

### Task 5: Correct the avatar lookup order and the README

**Files:**
- Modify: `src/member-model-button.js`
- Modify: `README.md`
- Test: `test/member-model-button.test.js`, `test/readme.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no new exports. `resolveMemberAvatarId(row)` keeps its signature.

- [ ] **Step 1: Write the failing tests**

```js
test('resolveMemberAvatarId prefers jQuery stored data over a data-id attribute', () => {
    const row = makeRow({ id: 'attribute.png' });
    const restoreJquery = installFakeJquery(new Map([[row, { id: 'store.png' }]]));
    try {
        assert.equal(resolveMemberAvatarId(row), 'store.png');
    } finally {
        restoreJquery();
    }
});
```

Add to `test/readme.test.js`:

```js
test('README describes the member row markup accurately', () => {
    assert.match(readme, /jQuery/i);
    assert.match(readme, /data-chid/);
    assert.doesNotMatch(readme, /carry the member's avatar as `data-id`/i);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/member-model-button.test.js test/readme.test.js`
Expected: FAIL — the attribute wins today, and the README still claims rows carry `data-id`.

- [ ] **Step 3: Reorder the lookup and correct the README in `src/member-model-button.js` and `README.md`**

Try jQuery's data store first, then the `data-id` attribute, then `data-chid`. Comment that SillyTavern sets the row's avatar with `.data()`, which writes only jQuery's store, so the attribute branch is a forward-compatible fallback.

In the README's Compatibility section, replace the claim that rows "carry the member's avatar as `data-id`" with an accurate description: SillyTavern stores the avatar in jQuery's data store under `data-id` and the character index in the `data-chid` attribute, and the extension reads either.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/member-model-button.test.js test/readme.test.js`
Expected: PASS

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/member-model-button.js README.md test/member-model-button.test.js test/readme.test.js
git commit -m "Prefer jQuery stored member data and describe it accurately"
```

---

### Task 6: Cancel a queued refresh on dispose

**Files:**
- Modify: `src/member-model-button.js`
- Test: `test/member-model-button.test.js`

**Interfaces:**
- Consumes: `initMemberModelButtons() -> void` and `disposeMemberModelButtons() -> void` (existing).
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

```js
test('disposeMemberModelButtons cancels a refresh that is still queued', () => {
    const cancelled = [];
    let observerCallback = null;
    const previous = {
        document: globalThis.document,
        MutationObserver: globalThis.MutationObserver,
        requestAnimationFrame: globalThis.requestAnimationFrame,
        cancelAnimationFrame: globalThis.cancelAnimationFrame,
        SillyTavern: globalThis.SillyTavern,
    };

    globalThis.document = { body: {}, querySelectorAll: () => [] };
    globalThis.MutationObserver = class {
        constructor(callback) { observerCallback = callback; }
        observe() {}
        disconnect() {}
    };
    globalThis.requestAnimationFrame = () => 77;
    globalThis.cancelAnimationFrame = (handle) => cancelled.push(handle);
    delete globalThis.SillyTavern;

    try {
        initMemberModelButtons();
        const memberList = { nodeType: 1, matches: () => true };
        observerCallback([{ target: memberList, addedNodes: [] }]);

        disposeMemberModelButtons();

        assert.deepEqual(cancelled, [77]);
    } finally {
        globalThis.document = previous.document;
        globalThis.MutationObserver = previous.MutationObserver;
        globalThis.requestAnimationFrame = previous.requestAnimationFrame;
        globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
        if (previous.SillyTavern === undefined) delete globalThis.SillyTavern;
        else globalThis.SillyTavern = previous.SillyTavern;
    }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/member-model-button.test.js`
Expected: FAIL — nothing is cancelled.

- [ ] **Step 3: Track and cancel the handle in `src/member-model-button.js`**

Store the handle returned by `requestAnimationFrame` (or the `setTimeout` fallback) in a module-level variable when a refresh is scheduled, clear it when the callback runs, and cancel it in `disposeMemberModelButtons`. Reset the `refreshScheduled` flag there too.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/member-model-button.test.js`
Expected: PASS

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/member-model-button.js test/member-model-button.test.js
git commit -m "Cancel a queued member list refresh when the extension disposes"
```