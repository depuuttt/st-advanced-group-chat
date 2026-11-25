# Material Symbols Icons — Design

Date: 2026-11-25

> **Status: Implemented** and verified; the implementation plan has been removed.
>
> **Revision 2026-11-25:** font delivery changed from a Google Fonts `<link>` to
> a bundled, self-hosted `.woff2` loaded via `@font-face`. The Google Fonts
> request failed in some environments (e.g. Firefox `NS_ERROR_CORRUPTED_CONTENT`
> from ad-blockers / security software), leaving buttons showing raw ligature
> text. Bundling removes the network dependency; the sections below reflect the
> self-hosted approach.

## Intent

Make the group editor's member-row icons one visual family by switching them
all — this extension's model button and SillyTavern's own built-in row buttons
— from Font Awesome to Material Symbols **Rounded**, bundled with the extension.

## Goals

- All icons in a `.group_member` row render as Material Symbols Rounded.
- The extension's model button keeps its click/keyboard behavior and tooltip.
- SillyTavern's built-in buttons keep working identically (same `data-action`,
  same handlers) — only their look changes.

## Non-goals

- No changes to request routing, storage, or any non-icon UI.
- No icon changes outside the group member rows.

## Constraints

- SillyTavern does not load Material Symbols; the extension bundles the font
  (`fonts/material-symbols-rounded.woff2`) and loads it via `@font-face` in its
  own `style.css`, so the icons render offline with no network dependency.
- SillyTavern rebuilds the member list without events; the existing
  MutationObserver refresh in `src/member-model-button.js` is the natural
  place to also re-apply icon classes to freshly built rows.
- Material Symbols ligatures need the icon name as the element's text;
  Font Awesome icons use classes with empty text. Swapping therefore means
  replacing classes and setting text content per button.

## Approaches

- **Font delivery: bundled self-hosted `.woff2` (chosen)** over a Google Fonts
  `<link>` (the original choice — it failed behind ad-blockers / security
  software with `NS_ERROR_CORRUPTED_CONTENT`) and inline SVGs (loses font
  features, per-icon effort).
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

- The bundled variable font is loaded via `@font-face` in `style.css`
  (`font-family: 'Material Symbols Rounded'`, `font-weight: 100 700`,
  `font-display: swap`), with a relative `url()` so it resolves wherever
  SillyTavern serves the extension's files. Font settings (size, fill, weight)
  via the `.st-agc-material-icon` rule match the old `fa-lg`/`fa-xl` footprint
  so row layout does not shift.
- Because the font is bundled, the icons render offline; there is no network
  dependency and no external `<link>` to inject or clean up.

## Left to the builder

- Whether the swap lives in `member-model-button.js` or a new `src/` module
  registered as its own feature (leaning new module, per the feature-registry
  convention).
- Exact CSS for sizing/fill so Material glyphs sit on the FA baseline.

## Verification

- Unit tests with a fake DOM: rows rebuilt → built-in buttons get Material
  classes and ligature text, `data-action` untouched; our button unchanged
  behavior; init converts without injecting any font `<link>`; dispose
  restores Font Awesome classes.
- README updated (its description of the row markup/icon classes, and the
  bundled/offline font source).
- Manual check against the local SillyTavern per LOCAL.md.