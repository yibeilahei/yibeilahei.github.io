# Layout plan: adapters by format, pagers by writing mode

Step-by-step plan for Lazahata. Implement **one step at a time**. Do not mix a new pager, a new format, Auto/routing, and the EPUB-H cutover in the same change.

XTCH encoding (`encodeXthPage` → `buildXtchContainer`) does not change. Output on device is still 4-level grayscale at X4/X3 size. Only how the bitmaps are made changes.

## End state

```
drop files
     │
     ▼
match adapter by magic (not “is this EPUB?”)
     │
     ├── EPUB          zip + CSS (Foliate makeBook)
     ├── TXT           paragraphs → HTML
     ├── MOBI/AZW/AZW3 Foliate MOBI (refuse DRM)
     └── FB2           Foliate
     │
     ▼
same book shape: sections, HTML load(), toc, metadata, script
     │
     ▼
Auto (markup sniff) or user Vertical / Horizontal
     │
     ├── vertical pager    vertical-rl, column = page height, translateY
     └── horizontal pager  horizontal-tb, column = page width,  translateX
     │
     ▼
RGBA frames → XTCH
```

| Piece | Owns |
|---|---|
| Adapters | Bytes → HTML sections |
| Auto | `writing-mode` in CSS/HTML → vertical, else horizontal |
| Vertical pager | **All** 縦書き |
| Horizontal pager | **All** 横書き |
| XTCH encoder | Bitmaps → `.xtch` |

Queue shows **Vertical / Horizontal**, not CREngine / Foliate.

**True final:** CREngine is gone. Until Step 7 it remains an EPUB + horizontal specialist only.

## Locked decisions

- Split on **output writing mode**, not file type.
- `vertical.ts` stays 縦書き-only. Do not teach it 横書き.
- Horizontal is a **twin** of the current vertical pipeline (Foliate/`makeBook` or fake HTML sections → hidden iframe → CSS columns → `html-to-image`). Do **not** use `<foliate-view>` (ResizeObserver grows the iframe).
- Do not merge the two pagers into one `writingMode` function until both work on real files.
- **Auto** means tategaki markup, not language and not manga RTL:
  - Shared test: existing `textLooksVertical()` (`writing-mode: vertical-rl/lr` with prefixes, `primary-writing-mode` meta).
  - EPUB, AZW3/KF8, HTML, FB2, MOBI: sniff a sample of styles + body after the adapter can provide HTML/CSS.
  - TXT: no markup signal → **horizontal**. User can still pick Vertical for TXT.
  - Do **not** use script/glyphs, line length, filename, or `page-progression-direction` for Auto. RTL is the existing read-direction setting.
  - False horizontal is the safer miss. Override always wins.
- Kindle: detect PalmDoc `encryption`; if set, refuse with a clear error. No DRM path. No KFX / AZW4 in this plan.
- Do not feed TXT/MOBI/AZW/FB2 to CREngine. Do not wrap them as fake EPUBs to reuse `createVerticalPager` unless a later step explicitly says so (the plan does not).
- Script/fonts stay separate from writing mode (`detectScript` on text/language).

## Current vs final

```
TODAY                         FINAL
─────                         ─────
EPUB + H → CREngine           any  + H → horizontal pager
EPUB + V → vertical.ts        any  + V → vertical pager
TXT / MOBI → nothing          adapters + same two pagers
```

## How to slice

One step = **one** of: a pager, an adapter, routing/Auto, or moving EPUB-H off CREngine.

Do not combine:

| Don’t mix | Why |
|---|---|
| H pager + Kindle | Can’t tell if columns or `mobi.js` broke |
| Widen V + first Kindle | EPUB 縦書き regression blamed on AZW3 |
| EPUB-H cutover + TXT | Two layout changes, no baseline |
| Auto-from-language “just for JP TXT” | Breaks the one Auto rule |

## Steps

### Step 0 — Contract (no user-visible change)

Write the book shape and Auto rule into types/comments (not a new engine).

- A book is `sections` + HTML `load()` + metadata + toc + script.
- Auto: `textLooksVertical` on markup/CSS → V, else H.
- Override always wins.
- TXT: no markup signal → H.

Still only EPUB in the UI.

**Done when:** types/docs match this file; app behavior unchanged.

### Step 1 — Horizontal pager, TXT only

New 横書き twin: `horizontal-tb`, `column-width` = page width, measure `scrollWidth`, `translateX`, snapshot.

- TXT adapter: BOM (UTF-8 / UTF-16), paragraphs → simple HTML. Title from filename.
- Auto TXT = horizontal.
- Do **not** change `vertical.ts`.
- Do **not** touch EPUB-H / CREngine.
- User pick Vertical for TXT waits for Step 3.

**Done when:** drop `.txt` → 20-page preview → full XTCH; font, size, line height, align work. Check preview **page 2+** (first-page-repeat is the usual `html-to-image` + transform bug).

**Risk:** snapshot/transform only. Isolated from EPUB.

### Step 2 — Widen vertical intake only

`createVerticalPager` accepts any Foliate-shaped book, not “this `File` is an EPUB zip.”

- Script/title from book text/language; **keep EPUB zip sniff as fallback**.
- Still **only EPUB** calls it.
- EPUB 縦書き must look the same.

**Done when:** existing vertical EPUBs match before/after.

**Risk:** the only step that can regress 縦書き. Keep it tiny.

### Step 3 — TXT can use vertical

TXT adapter + user pick Vertical → existing (widened) V pager. One fake HTML section. Auto still H.

**Done when:** same `.txt`, Writing → Vertical, preview is 縦書き.

**Needs:** Steps 1 and 2.

### Step 4 — Shared Auto/routing

Drop handler stops assuming every file is an EPUB zip.

- Per adapter: gather a **sample** (EPUB: zip CSS as today; others: first HTML/CSS).
- One function: sample → `detectedVertical`.
- Queue: V/H from Auto or override → the matching pager.

No Kindle yet. EPUB Auto unchanged. TXT Auto stays H.

**Done when:** mixed drop of EPUB + TXT routes correctly; override still reconverts.

### Step 5 — MOBI / AZW / AZW3

One Kindle adapter:

- Magic `BOOKMOBI` (extension does not matter).
- Encrypted → error, do not open.
- Foliate `MOBI.open()` → same book shape (MOBI6 or KF8).
- Sample HTML/CSS → Auto (AZW3 can be V; old MOBI usually H).
- H → horizontal pager, V → vertical pager.

**Done when:** one DRM-free `.azw3` and one `.mobi` each work in Auto, and both overrides work.

**Risk:** slow unpack on drop (show Detecting…; do not full-decompress the book in the drop handler). KF8 CSS vs `vertical-rl !important`. Do not add FB2 here.

UI: `.azw` rides with MOBI/AZW3 (already listed as coming soon).

### Step 6 — FB2

Same pattern as Step 5. Foliate `makeBook` already opens FB2/FBZ. Auto from stylesheet/CSS; usually H.

### Step 7 — EPUB-H onto the horizontal pager (optional, last)

Point **horizontal EPUB** at the H pager. Keep CREngine behind a fallback or compare toggle until quality is good enough.

**Done when:** a few real EPUBs look acceptable vs today’s CREngine preview.

**Then:** stop preloading WASM on every visit; then delete CREngine.

This is a quality swap, not format work. Do not do it in the same change as TXT or Kindle.

## Dependency

```
Step 0 contract
    │
    ├─► 1 H pager + TXT ──► 3 TXT vertical (needs 2)
    │
    └─► 2 widen V intake ──► 3
              │
              └─► 4 shared Auto ──► 5 Kindle ──► 6 FB2
                                        │
                                        └─► 7 EPUB-H cutover
```

Steps 1 and 2 can proceed in parallel. 3 needs both. 5 needs 1, 2, and 4.

**Ship first:** 0 → 1 → 2 → 3 (TXT 横書き, TXT 縦書き, EPUB 縦書き unchanged except intake). Then Kindle is another adapter, not a new engine.

## Coarse roadmap

TXT (H then V) → routing → Kindle → FB2 → optional kill CREngine.

## Out of scope

- KFX, AZW4, DRM removal
- PDF, CBZ, CBR, DOCX
- Rebuilding CREngine WASM for extra formats
- Auto-vertical from Japanese/Chinese/Korean text
- Merging pagers before both axes work
