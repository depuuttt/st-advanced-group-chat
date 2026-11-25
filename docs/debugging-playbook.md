# Debugging playbook: visible but un-clickable UI, and refresh loops

Written for future coding sessions (human or agent) working in this repository.
This documents a real bug class found here on 2026-11-25 — the hide-member-avatars
eye toggle rendered but clicks did nothing (fixed in commit `dcc9c15`) — so the
next feature does not rediscover it the slow way.

## The symptom to recognize

- An element renders and is clearly visible, but clicking it does nothing.
- Programmatic `.click()` on the element **works** (unit tests and fake DOMs pass).
- The MutationObserver-driven refresh passes "look correct" against SillyTavern's markup.

If you see this combination, suspect the pattern below before touching any code.

## Root-cause pattern (two halves that multiply)

**Half 1 — self-sustaining refresh loop.** A refresh/sync pass that runs inside a
MutationObserver callback must not mutate anything inside the observed subtree —
including "harmless" writes. In particular, `el.textContent = value` replaces the
text node **even when the value is identical**, producing a childList mutation.
If that element sits inside `.rm_group_members` (which both observers watch via
`mutationsTouchMemberList`), the mutation schedules another refresh, which
mutates again — an endless loop at animation-frame rate (~30 passes/sec).

**Half 2 — node replacement defeats real clicks.** If the same pass deletes and
re-creates a listener-bound element (instead of reusing it), the element's node
exists for only ~30 ms. A real user click is a mousedown → mouseup pair on the
*same node*; when a replacement lands between them, the browser dispatches the
`click` event to a node whose listeners are gone (or to nothing). Programmatic
`.click()` is synchronous and never straddles a replacement — which is exactly
why the tests passed while the real UI was dead.

Measured in this incident: ~360 button removal/add pairs per 3 idle seconds.

## Conventions that prevent it (treat as repo rules)

- **Guard every DOM write in a refresh/sync path.** Only write when the value
  actually differs: `if (el.textContent !== next) el.textContent = next;` Same
  for `title`, class toggles (`classList.toggle(c, force)` is a no-op when the
  state already matches — plain `add`/`remove` are not), and dataset/attributes.
- **Reuse listener-bound elements; never replace them per pass.** Follow
  `refreshMemberModelButtons` (`if (!button) { create + attach }`), not the old
  replace-always pattern. When an element must be distinguished from an HTML
  clone (the group-editor popout copies markup, cloning classes and attributes
  but **not** JavaScript properties or WeakSet membership), track live instances
  in a module-level `WeakSet` — see `liveButtons` in `src/hide-member-avatars.js`.
- **Mutation-free pass test.** A correct refresh pass, run twice with no upstream
  change, performs **zero** DOM writes the second time. Tests exist for this
  (`test/material-icons.test.js` — "does not rewrite textContent";
  `test/hide-member-avatars.test.js` — "the same button node survives"); add one
  for every new refresh/sync pass.
- When a click must survive SillyTavern's document-level handlers, keep the
  existing `stopPropagation` + fresh-listener conventions (see
  `src/member-model-button.js`).

## Verifying against the real app when fakes pass

Unit fakes cannot catch this bug class — they have no hit-testing, no
mousedown/mouseup, and no event loop. The repo's `LOCAL.md` (gitignored) points
at a local SillyTavern install; if its server is running (default
`http://localhost:8000`), reproduce in a real browser with a headless Edge and
Chrome DevTools Protocol, using plain Node (built-in `fetch`/`WebSocket`):

1. Launch: `msedge.exe --headless=new --remote-debugging-port=9223 --user-data-dir=$env:TEMP\some-profile --no-first-run http://localhost:8000`.
2. Connect to the page target from `GET /127.0.0.1:9223/json/list`, drive it with
   `Runtime.evaluate` (with `includeCommandLineAPI: true` to use `getEventListeners`).
3. Open a group editor from the page:
   `await import('/scripts/group-chats.js'); openGroupById(ctx.groups[0].id)`.
4. **Measure churn** before anything else — a `MutationObserver` on the button's
   parent for 3 idle seconds. Any removal/add pairs of your own element means the
   loop pattern above; count should be 0.
5. **Hit-test**: `document.elementFromPoint(center of getBoundingClientRect)`
   must be the element itself. Beware: the ProbablyTooManyTabs (PTMT) extension
   collapses panels to icons-only in narrow viewports, which makes rects 0×0 —
   set a 1920×1080 viewport via `Emulation.setDeviceMetricsOverride` and expand
   the pane by clicking its `.ptmt-tab`.
6. **Click with real input**, not `.click()`:
   `Input.dispatchMouseEvent` `mousePressed` + `mouseReleased` (~100 ms apart) at
   the element's center, then assert the state actually changed.
7. Clean up: the click toggles persisted settings — restore the pre-test value
   (back up `data/default-user/settings.json` first, per `LOCAL.md`), and kill
   only the Edge processes whose command line contains your `--user-data-dir`.

Two practical notes for driving the real install:

- **Deploying the extension under test.** The installed extension copy at
  `public/scripts/extensions/third-party/st-advanced-group-chat` (inside the
  SillyTavern checkout, not this repo) is itself a git checkout of this repo —
  push the branch, then `git reset --hard origin/<branch>` in that directory to
  deploy it. Open a fresh tab afterwards (`/json/new` on the debug port); a
  `Page.reload` kills the CDP session.
- Driver scripts (CDP client, churn measurement, hit-test, real-click) from the
  2026-11-25 session live in `%TEMP%\st-agc-debug\` — transient, treat them as
  scratch, not fixtures.

An earlier version of these scripts was used for the 2026-11-25 diagnosis; the
recipe above is the distilled form. Related background: the case study is
`docs/superpowers/specs/2026-11-25-hide-member-avatars-design.md` plus commit
`dcc9c15`, and the same-session fix pattern lives in `src/hide-member-avatars.js`.
