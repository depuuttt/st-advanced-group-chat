# Member-List Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the hide-avatars eye toggle a proper home — a `st-agc-member-toolbar` strip that reads as the header of the member-list card, inserted as a sibling directly above `.rm_group_members`.

**Architecture:** `src/hide-member-avatars.js` changes its sync pass from "button after the pagination" to "toolbar div immediately before each `.rm_group_members`, button inside it". The toolbar is a plain container div that future features can append buttons into. Both toolbar and button follow the WeakSet live/dead-clone pattern; all writes stay guarded. CSS in `style.css` styles the bar as the card's header and uses an adjacent-sibling selector to square off the list's top corners, so bar + list read as one card and the list looks stock without a bar.

**Tech Stack:** Plain browser ES modules, no build step, no dependencies. Tests: Node built-in test runner (`npm test`) with the fake DOM in `test/hide-member-avatars.test.js`.

**Spec:** `docs/superpowers/specs/2026-11-25-member-list-toolbar-design.md`

## Global Constraints

- No build step, no third-party dependencies; plain ES modules.
- Every entry into SillyTavern/document APIs is lazy and degrades to a `console.warn` prefixed `[st_advanced_group_chat]` — the extension must never take the host down.
- The toolbar must be a **sibling above `.rm_group_members`, never a child** (ST wipes the list's children every render).
- Guard every DOM write in the sync path (`if (el.textContent !== next)`); reuse live listener-bound elements via WeakSet (HTML clones don't copy expandos); a second sync pass performs zero DOM writes.
- Members/settings keyed by avatar ID / group ID as today; no changes to ST's rows, search, tags, or pagination.
- Tests re-import nothing new: `test/hide-member-avatars.test.js` already imports the module directly.
- README changes must land in the same commit as behavior changes (`test/readme.test.js` asserts content).

## Review Focus

- **Popout clone:** the popout clones the drawer HTML, producing a second toolbar+button carrying classes but no listeners. Tests must exercise a cloned pair being replaced, not kept (Task 1, clone test).
- **Zero-write second pass:** this sync pass runs at observer rate; an unconditional `textContent` write feeds the refresh loop that killed real clicks (commit `dcc9c15`). Must be pinned by a counting test (Task 1, zero-writes test).
- **Toolbar moved by ST:** a re-render can leave our toolbar not-immediately-before the list (e.g. pagination re-inserted between). The sync pass must re-seat it, not duplicate it (Task 1, reseat test).
- **No pagination present:** the old anchor was the pagination; the new anchor is the list itself, so a list with no pagination still gets a toolbar. Covered by every Task 1 test (none of them needs a pagination element anymore).
- **Dispose completeness:** dispose must remove both toolbar and button (an empty class-carrying div left behind would style the card top wrong). Pinned in Task 1 dispose test.

---

### Task 1: Toolbar insertion and reuse in `syncHideAvatarUI`

**Files:**
- Modify: `src/hide-member-avatars.js`
- Test: `test/hide-member-avatars.test.js`

**Interfaces:**
- Consumes (unchanged): `getSettings/getHideAvatars/setHideAvatars` from `./model-overrides.js`; `translateText/handleButtonKeydown/mutationsTouchMemberList` from `./member-model-button.js`; module constants already defined.
- Produces: no new exports. Internal additions in `src/hide-member-avatars.js`:
  - `const TOOLBAR_CLASS = 'st-agc-member-toolbar';` alongside the other class constants.
  - `const liveToolbars = new WeakSet();` next to `liveButtons`.
  - `createToolbar(doc)` → `Element`: `doc.createElement('div')`, `className = TOOLBAR_CLASS` (just the class; no listeners).
- Disposition of the old anchor: `PAGINATION_SELECTOR` and the pagination loop are **deleted** from `syncHideAvatarUI`; the button-reuse logic moves into the new container loop. `disposeHideMemberAvatars` drops nothing else — its button/class cleanup stays, plus new toolbar cleanup.

- [ ] **Step 1: Update the existing anchoring tests and add the new failing tests**

In `test/hide-member-avatars.test.js`: first extend `installDocument`'s fake `doc.querySelectorAll` (line 111-119) with one more mapping — `if (selector === '.st-agc-member-toolbar') return created.filter((c) => c.classList.contains('st-agc-member-toolbar'));` — so toolbar queries (dispose, cleanup counts) resolve. The `makeElement`/`installDocument` helpers already support everything else needed — `insertBefore`, `nextElementSibling` relinking, class-list queries.

  1. Change `syncHideAvatarUI inserts one button after every pagination container` → `syncHideAvatarUI inserts a toolbar with the button before every member list`: build two `container` elements (class `rm_group_members`, each with its own `parent` via `parent.appendChild(container` — no pagination elements at all). After `syncHideAvatarUI()`, for each parent: one child has class `st-agc-member-toolbar`; that toolbar's `nextElementSibling === container` (toolbar sits immediately before the list); the toolbar's only child has class `st-agc-hide-avatars-button` with `role=button`, `tabindex=0`, `st-agc-material-icon`, `textContent === 'visibility'`.
  2. Change `syncHideAvatarUI does not duplicate the button on a second sync` to anchor on a container (keep all its assertions — live button node reused, not removed/re-created).
  3. Change `syncHideAvatarUI replaces a cloned button that carries the class but no live listener` to anchor on a container; also drop a stale *toolbar* clone (an element with class `st-agc-member-toolbar` appended to the parent before sync) and assert it is removed while the live toolbar survives.
  4. Add `syncHideAvatarUI reseats a toolbar that is no longer before the list`: after a first sync, append another element between toolbar and container (simulating ST re-inserting the pagination), then sync again; assert the toolbar is again `container`'s previous sibling and there is still exactly one toolbar.
  5. Add `a second sync pass performs zero DOM writes`: after a first sync, wrap `button.textContent` and `button.title` in counting `Object.defineProperty` setters (pattern of `test/material-icons.test.js:126-130`) and spy-count `parent.insertBefore`/`appendChild` calls on parent and toolbar (reassign `parent.insertBefore = (...args) => { inserts += 1; return original(...args); }`). Second sync → all counts `0`.
  6. Update `disposeHideMemberAvatars removes buttons, container class, and observer`: keep everything, add assertions that every `st-agc-member-toolbar` element is removed (`_removed === true`, none left in `doc.querySelectorAll`).
  7. The tests `syncHideAvatarUI skips a pagination with no parent` and `syncHideAvatarUI replaces a stale button that is not the immediate sibling` are pagination-anchored; the pagination loop no longer exists — delete both (the orphan-parent case is now the container loop's `if (!container.parentElement) continue;` — keep that guard and cover it by a sync over a parentless container that simply doesn't throw).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL in `test/hide-member-avatars.test.js` — no toolbar is created (querySelector finds no `st-agc-member-toolbar`).

- [ ] **Step 3: Implement the toolbar in `src/hide-member-avatars.js`**

  - Add `TOOLBAR_CLASS`, `liveToolbars`, `createToolbar(doc)` (interface above; body: `div`, class only).
  - Rewrite the second loop of `syncHideAvatarUI` to iterate `doc.querySelectorAll(MEMBER_LIST_SELECTOR)`:
    - Skip a container with no `parentElement` (guarded, same as today's pagination guard).
    - **Toolbar:** find existing `.${TOOLBAR_CLASS}` children of the parent. Keep the first one in `liveToolbars`, remove the rest (dead clones/leftovers — same rules as buttons). Create via `createToolbar(doc)` and `liveToolbars.add` when none is live.
    - **Seat the toolbar:** it must be `container`'s previous sibling — `container.previousElementSibling === toolbar && toolbar.parentNode === parent` means in place, write nothing; else `parent.insertBefore(toolbar, container)`.
    - **Button:** same live/dead logic as today, but the search-and-cleanup scope is the **toolbar** (its only child area), and the seat check is "last child of the toolbar" (`toolbar._children` in tests; in code: no `nextElementSibling` needed — `button.parentNode === toolbar && !button.nextElementSibling`). Insert with `toolbar.appendChild(button)` when out of place.
    - Keep the guarded `textContent`/`title` writes exactly as they are.
  - `disposeHideMemberAvatars`: after removing buttons, add the same loop for `.${TOOLBAR_CLASS}` elements; then remove the container class (already there).
  - Update the module doc-comment (lines 1–12) to describe the toolbar ("a toolbar strip above each member list hosts the toggle; future features can append buttons into it").

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all suites. (`test/readme.test.js` still passes: it matches `pagination|Current Members` and README keeps "Current Members", but README's "under the member-list pagination" sentence is now wrong for users — Task 2 fixes it.)

- [ ] **Step 5: Commit**

```bash
git add src/hide-member-avatars.js test/hide-member-avatars.test.js
git commit -m "feat: host the eye toggle in a member-list toolbar"
```

---

### Task 2: CSS card-header styling and README

**Files:**
- Modify: `style.css:53-68` (the hide-avatars block)
- Modify: `README.md:39-45` (Hide member avatars section)
- Test: `test/readme.test.js` (only if assertions must change — they do not; keep `pagination|Current Members` satisfied by mentioning Current Members)

**Interfaces:**
- Consumes: `st-agc-member-toolbar` class name from Task 1; ST's card look on `.rm_group_members` (`background: rgba(0,0,0,.3)`, 1px border, 10px rounding — from the spec, confirm against the live install).
- Produces: `.st-agc-member-toolbar` + `.st-agc-member-toolbar + .rm_group_members` rules; button restyling inside the toolbar.

- [ ] **Step 1: Write the toolbar CSS in `style.css`**

  - `.st-agc-member-toolbar`: `display: flex`, `align-items: center`, `justify-content: flex-end` (button right-aligned per spec), `min-height: 28px`, `padding: 0 10px` (tune in Step 3), `background: rgba(0,0,0,.3)`, `border: 1px solid` matching the card's border color variable (copy the exact value from ST's `.rm_group_members` rule), `border-bottom: none`, `border-radius: 10px 10px 0 0`.
  - `.st-agc-member-toolbar + .rm_group_members`: `border-top-left-radius: 0; border-top-right-radius: 0; margin-top: 0;` so the pair reads as one card; without a toolbar nothing matches and the list looks stock.
  - Button inside the toolbar: drop the `margin: 4px 0` / `width: fit-content` block from `.st-agc-hide-avatars-button` (no longer floating); keep the `:focus-visible` outline.

- [ ] **Step 2: Update `README.md` and run tests**

Replace "a toggle sits under the member-list pagination (the bar with the page arrows)" with wording for the toolbar: "a toolbar strip sits directly above the **Current Members** list, reading as the list card's header; the eye toggle at its right edge hides every member's avatar". Keep the "each group remembers" and "purely visual" sentences.

Run: `npm test` — Expected: PASS (readme test still matches `Current Members`; nothing else reads these strings).

- [ ] **Step 3: Tune against the live app (headless Edge + CDP)**

Per memory `live-verification-headless-cdp`: back up `data/default-user/settings.json`; ST runs at `http://localhost:8000`; the installed copy at `public/scripts/extensions/third-party/st-advanced-group-chat` is a git checkout — `git reset --hard` to this branch after committing Steps 1–2, then open a fresh CDP tab (`/json/new`, 1920×1080 via `Emulation.setDeviceMetricsOverride`, expand the PTMT pane). Checks:
  - Toolbar rect sits flush above the list rect (no gap, no double border — one rounded card silhouette).
  - `Input.dispatchMouseEvent` mousedown→mouseup on the eye button still toggles (the churn-bug regression).
  - Open the popout: same toolbar there, and toggling from either surface updates both.
  - Compare the toolbar's border color/background against ST's own card panels; adjust Step 1's values, recommit if they changed.

- [ ] **Step 4: Commit**

```bash
git add style.css README.md
git commit -m "feat: style the member-list toolbar as the card header"
```

---

### Task 3: Live verification sweep

**Files:**
- No repo files (driver scripts under `%TEMP%\st-agc-debug\` per the memory; not committed).

- [ ] **Step 1: Full sweep in the headless browser**

With the Task-2 commit deployed to the installed checkout: open a group editor, `await import('/scripts/group-chats.js'); openGroupById(ctx.groups[0].id)`.
  - Toolbar present in both drawer and popout, flush against the card, eye right-aligned.
  - Pagination still works (page arrows) — no ST breakage.
  - Real mouse click toggles; hidden state survives a list re-render (scroll the list / re-open the editor).
  - Second observer pass does not churn the toolbar (no flicker; breakpoints or a MutationObserver count on the toolbar's subtree stay flat).
  - Console clean of `[st_advanced_group_chat]` warns.

- [ ] **Step 2: Report**

If anything fails, use superpowers:systematic-debugging before touching code. Nothing to commit when it all passes — Tasks 1–2 carry the deliverables. Report the sweep results to your human partner.