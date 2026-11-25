# Material Symbols Icons — Design

Date: 2026-11-25

> **Status: Implemented** and verified; the implementation plan has been removed.

## Intent

Make the group editor's member-row icons one visual family by switching them
all — this extension's model button and SillyTavern's own built-in row buttons
— from Font Awesome to Material Symbols **Rounded**, loaded from Google Fonts.

## Goals

- All icons in a `.group_member` row render as Material Symbols Rounded.
- The extension's model button keeps its click/keyboard behavior and tooltip.
- SillyTavern's built-in buttons keep working identically (same `data-action`,
  same handlers) — only their look changes.

## Non-goals

- No changes to request routing, storage, or any non-icon UI.
- No icon changes outside the group member rows.
- No bundling of font files (chosen: Google Fonts link, per user decision).

## Constraints

- SillyTavern does not load Material Symbols; the extension injects the
  Google Fonts stylesheet itself.
- SillyTavern rebuilds the member list without events; the existing
  MutationObserver refresh in `src/member-model-button.js` is the natural
  place to also re-apply icon classes to freshly built rows.
- Material Symbols ligatures need the icon name as the element's text;
  Font Awesome icons use classes with empty text. Swapping therefore means
  replacing classes and setting text content per button.

## Approaches

- **Font delivery: Google Fonts link (chosen)** over self-hosted font files
  (user's call) and inline SVGs (loses font features, per-icon effort).
- **Style: Rounded (chosen)** over Outlined and Sharp (user's call).
- **Application: JS class/text swap in the existing refresh pass (chosen)**
  over a CSS-only override. CSS cannot form ligatures via `content`, so
  using the ligature-based font requires setting each button's text to the
  icon name; that is a DOM change, done in JS.
- Not chosen: editing SillyTavern's template — impossible from an extension;
  the rows are rebuilt by SillyTavern at any time.

## Decisions

- Icon mapping:

| Button (`data-action`) | Font Awesome today | Material Symbols Rounded |
|---|---|---|
| (ours) model | `fa-robot` | `smart_toy` |
| disable / enable | `fa-comment-slash` | `comments_disabled` |
| speak | `fa-comment` | `chat_bubble` |
| up | `fa-chevron-up` | `keyboard_arrow_up` |
| down | `fa-chevron-down` | `keyboard_arrow_down` |
| view | `fa-image-portrait` | `portrait` |
| remove | `fa-xmark` | `close` |
| add | `fa-plus` | `add` |

- The Google Fonts `<link>` is injected once at feature init; a duplicate
  check guards re-init. Font settings (size, fill, weight) via the
  extension's own CSS or inline styles, matching the old `fa-lg`/`fa-xl`
  footprint so row layout does not shift.
- If the font fails to load (offline), buttons show the icon name as text —
  accepted trade-off of the Google Fonts choice, noted here.

## Left to the builder

- Whether the swap lives in `member-model-button.js` or a new `src/` module
  registered as its own feature (leaning new module, per the feature-registry
  convention).
- Exact CSS for sizing/fill so Material glyphs sit on the FA baseline.

## Verification

- Unit tests with a fake DOM: rows rebuilt → built-in buttons get Material
  classes and ligature text, `data-action` untouched; our button unchanged
  behavior; dispose removes injected `<link>`.
- README updated (its description of the row markup/icon classes).
- Manual check against the local SillyTavern per LOCAL.md.