# Member-List Toolbar — Design (short)

Date: 2026-11-25
Follow-up to: 2026-11-25-hide-member-avatars-design.md (the eye toggle currently floats awkwardly between the pagination and the list card).

## Intent

Give the hide-avatars eye toggle a proper home: a compact toolbar strip that reads as the **header of the member-list card**, and can host buttons from future features.

## Goals

- One compact toolbar bar directly above `.rm_group_members`, visually part of the card: same background (`rgba(0,0,0,.3)`), same 1px border, the card's 10px top rounding on the bar, the list's top corners squared off while the bar exists — they read as one card.
- The eye toggle lives in the toolbar, right-aligned (matching the row icon clusters on the right).
- The toolbar is a plain container `div` (`st-agc-member-toolbar`) that future features can append buttons into.
- Works in the group editor and its popout (same markup, cloned).

## Non-goals

- No changes to SillyTavern's rows, search, tags, or pagination.
- No new feature buttons yet — the toolbar ships with only the eye toggle.

## Constraints

- SillyTavern wipes `.rm_group_members` children on every render, so the toolbar must be a **sibling above the list**, never a child of it (avoids a rebuild fight and list-scroll drift).
- The toolbar must be re-added after re-renders by the existing hide-member-avatars observer pass, reusing live nodes (WeakSet pattern from commit `dcc9c15`), and only touching the DOM when something changed.
- All SillyTavern/document access stays lazy, degrading to `[st_advanced_group_chat]` warns.

## Approaches

- **A. Header inside the list container** — rejected: ST deletes it on every rebuild; it also scrolls away (the card is the scroll container).
- **B. Toolbar sibling above the list, styled as the card's header (chosen)** — stable anchor point ST never rebuilds; CSS makes bar + list read as one card. Trades off: two elements that must be styled together.

## Decisions

- `src/hide-member-avatars.js` inserts a `st-agc-member-toolbar` div immediately before each `.rm_group_members` and moves the eye button into it (right-aligned). Sync reuse rules unchanged: live toolbar/button are kept, dead clones replaced.
- CSS in `style.css`: toolbar mirrors the card look (bg, border, top rounding, compact height ~28px, flex row, right-aligned content); adjacent selector `.st-agc-member-toolbar + .rm_group_members` squares the list's top corners and trims its top margin so the pair reads as one card. Without a toolbar (e.g. after dispose) the list looks exactly as today.
- Keyboard/a11y conventions of the eye button (role, tabindex, Enter/Space) unchanged.

## Left to the builder

- Exact paddings/sizing in `style.css` (tune against the live app).
- Whether the toolbar is inserted before the list or after the pagination when both exist (must sit flush against the card top).

## Verification

- Unit tests: toolbar inserted before the list, button inside it, reused across syncs, replaced when a dead clone, dispose removes toolbar + button; second sync performs zero DOM writes.
- Live check in the headless browser: toolbar looks attached to the card; real mouse clicks still toggle; popout shows the same toolbar.
