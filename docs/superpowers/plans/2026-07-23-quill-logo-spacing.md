# Header Lockup, Presets Navigation, and Card Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Tavernary text to the header's left edge with the approved
quill-and-inkwell artwork on its right, add Presets to desktop and mobile
project navigation, and preserve the approved card spacing.

**Architecture:** Keep the exact supplied PNG embedded in the existing
single-file mockup and reorder the rendered brand children with CSS `order`
properties so the enormous inline image source remains untouched. Add the
supplied Presets geometry to the shared SVG symbol sheet, add matching desktop
and mobile navigation controls, and special-case the category predicate so
Presets filters by project kind without removing presets from their functional
category.

**Tech Stack:** Static HTML/CSS/SVG, vanilla JavaScript, PowerShell contract
checks, Node.js syntax checks, and the in-app browser.

## Global Constraints

- Modify only `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`.
- `.superpowers/` remains intentionally ignored and must not be staged.
- Leave the unrelated untracked `data/` directory untouched.
- Preserve the embedded logo's decoded SHA-256:
  `283E3206FC0E5F6AA0BE2410AF9A58E5F694216411DDED210FA29A1D9BD71189`.
- Render the logo at `45px × 60px` on desktop and `41px × 55px` on mobile.
- Render `.brand-copy` before `.brand-logo` without rewriting the legacy
  `<img>` source line.
- Keep a `6px` brand gap and center the artwork against the full text block.
- Preserve the `28.85px` wordmark and its alignment with the tagline.
- Keep the desktop top-bar height unchanged and reject mobile collisions.
- Use both paths from `C:\Users\Keptin\Downloads\preset.svg`, converted to
  `currentColor`.
- Add Presets immediately after Frontends in desktop and mobile navigation.
- Use nine equal desktop category columns.
- Use `#57C5A3` for the Presets navigation icon and label.
- Filter Presets by `data-kind="preset"` without changing card
  `data-category` values.
- Keep All Projects as the default.
- Preserve the standard-card `8px` identity gap and compact-card `6px` gap.
- Preserve zero horizontal overflow and a clean browser console.

---

### Task 1: Reorder the Header Brand Lockup

**Files:**
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html:118-150`
- Reference: `docs/superpowers/specs/2026-07-23-quill-logo-spacing-design.md`

**Interfaces:**
- Consumes: `.brand`, `.brand-logo`, `.brand-copy`, and the existing desktop
  and mobile logo dimensions.
- Produces: text at the left content edge followed by the artwork at a `6px`
  gap, with DOM markup and embedded image bytes unchanged.

- [ ] **Step 1: Run the failing brand-order contract**

```powershell
$file='.superpowers\brainstorm\1335-1784816109\content\catalog-wall-responsive-v7.html'
$html=Get-Content -LiteralPath $file -Raw
$required=@(
  '(?s)\.brand-logo\s*\{[^}]*order:\s*2',
  '(?s)\.brand-copy\s*\{[^}]*order:\s*1',
  '(?s)\.brand\s*\{[^}]*gap:\s*6px',
  '(?s)\.identity\s*\{[^}]*gap:\s*8px',
  '(?s)\.compact-cards \.identity\s*\{\s*gap:\s*6px'
)
$missing=@($required | Where-Object { $html -notmatch $_ })
if(-not $missing.Count){ throw 'Expected brand-order contract to fail' }
"RED: missing $($missing.Count) brand-order rules"
```

Expected: `RED: missing 2 brand-order rules`.

- [ ] **Step 2: Order the artwork after the text**

Use `apply_patch` to make this exact local change without touching the embedded
`content` line:

```diff
       flex: none;
+      order: 2;
       object-fit: contain;
```

- [ ] **Step 3: Anchor the text before the artwork**

Use `apply_patch` to add:

```css
.brand-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  order: 1;
  line-height: 1;
}
```

- [ ] **Step 4: Run the green brand source contract**

Rerun Step 1, replacing the final assertion with:

```powershell
if($missing.Count){ throw "Missing brand-order rules: $($missing -join ', ')" }
'Brand-order contract passed'
```

Expected: `Brand-order contract passed`.

---

### Task 2: Add Kind-Based Presets Navigation

**Files:**
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html:201-236`
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html:1135-1162`
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html:1184-1212`
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html:1591-1603`

**Interfaces:**
- Consumes: `--kind-preset`, the shared SVG symbol sheet, desktop `.category`
  buttons, mobile `.mobile-category-option` buttons, `activeCategory`, and each
  card's `dataset.kind` and `dataset.category`.
- Produces: `#i-preset`, desktop and mobile `data-category="preset"` controls,
  a nine-column strip, and a Presets-only kind predicate.

- [ ] **Step 1: Run the failing Presets navigation contract**

```powershell
$file='.superpowers\brainstorm\1335-1784816109\content\catalog-wall-responsive-v7.html'
$html=Get-Content -LiteralPath $file -Raw
$required=@(
  'grid-template-columns:\s*repeat\(9,\s*minmax\(0,\s*1fr\)\)',
  '<symbol id="i-preset" viewBox="0 0 24 24"',
  '(?s)\.category\[data-category="preset"\].*?color:\s*var\(--kind-preset\)',
  '<button class="category" data-category="preset">',
  '<button class="mobile-category-option" type="button" data-category="preset">',
  'activeCategory === "preset"\s*\?\s*card\.dataset\.kind === "preset"'
)
$missing=@($required | Where-Object { $html -notmatch $_ })
if(-not $missing.Count){ throw 'Expected Presets navigation contract to fail' }
"RED: missing $($missing.Count) Presets navigation rules"
```

Expected: output beginning with `RED:`.

- [ ] **Step 2: Expand and color the category controls**

Use `apply_patch` to change the strip to:

```css
grid-template-columns: repeat(9, minmax(0, 1fr));
```

After the existing category active rule, add:

```css
.category[data-category="preset"],
.mobile-category-option[data-category="preset"] {
  color: var(--kind-preset);
}
```

- [ ] **Step 3: Add the supplied Presets symbol**

Insert this symbol after `#i-frontend`:

```html
<symbol id="i-preset" viewBox="0 0 24 24" fill="currentColor" stroke="none">
  <path fill-rule="evenodd" clip-rule="evenodd" d="M12.0002 8C9.79111 8 8.00024 9.79086 8.00024 12C8.00024 14.2091 9.79111 16 12.0002 16C14.2094 16 16.0002 14.2091 16.0002 12C16.0002 9.79086 14.2094 8 12.0002 8ZM10.0002 12C10.0002 10.8954 10.8957 10 12.0002 10C13.1048 10 14.0002 10.8954 14.0002 12C14.0002 13.1046 13.1048 14 12.0002 14C10.8957 14 10.0002 13.1046 10.0002 12Z"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M11.2867 0.5C9.88583 0.5 8.6461 1.46745 8.37171 2.85605L8.29264 3.25622C8.10489 4.20638 7.06195 4.83059 6.04511 4.48813L5.64825 4.35447C4.32246 3.90796 2.83873 4.42968 2.11836 5.63933L1.40492 6.83735C0.67773 8.05846 0.954349 9.60487 2.03927 10.5142L2.35714 10.7806C3.12939 11.4279 3.12939 12.5721 2.35714 13.2194L2.03927 13.4858C0.954349 14.3951 0.67773 15.9415 1.40492 17.1626L2.11833 18.3606C2.83872 19.5703 4.3225 20.092 5.64831 19.6455L6.04506 19.5118C7.06191 19.1693 8.1049 19.7935 8.29264 20.7437L8.37172 21.1439C8.6461 22.5325 9.88584 23.5 11.2867 23.5H12.7136C14.1146 23.5 15.3543 22.5325 15.6287 21.1438L15.7077 20.7438C15.8954 19.7936 16.9384 19.1693 17.9553 19.5118L18.3521 19.6455C19.6779 20.092 21.1617 19.5703 21.8821 18.3606L22.5955 17.1627C23.3227 15.9416 23.046 14.3951 21.9611 13.4858L21.6432 13.2194C20.8709 12.5722 20.8709 11.4278 21.6432 10.7806L21.9611 10.5142C23.046 9.60489 23.3227 8.05845 22.5955 6.83732L21.8821 5.63932C21.1617 4.42968 19.678 3.90795 18.3522 4.35444L17.9552 4.48814C16.9384 4.83059 15.8954 4.20634 15.7077 3.25617L15.6287 2.85616C15.3543 1.46751 14.1146 0.5 12.7136 0.5H11.2867ZM10.3338 3.24375C10.4149 2.83334 10.7983 2.5 11.2867 2.5H12.7136C13.2021 2.5 13.5855 2.83336 13.6666 3.24378L13.7456 3.64379C14.1791 5.83811 16.4909 7.09167 18.5935 6.38353L18.9905 6.24984C19.4495 6.09527 19.9394 6.28595 20.1637 6.66264L20.8771 7.86064C21.0946 8.22587 21.0208 8.69271 20.6764 8.98135L20.3586 9.24773C18.6325 10.6943 18.6325 13.3057 20.3586 14.7523L20.6764 15.0186C21.0208 15.3073 21.0946 15.7741 20.8771 16.1394L20.1637 17.3373C19.9394 17.714 19.4495 17.9047 18.9905 17.7501L18.5936 17.6164C16.4909 16.9082 14.1791 18.1618 13.7456 20.3562L13.6666 20.7562C13.5855 21.1666 13.2021 21.5 12.7136 21.5H11.2867C10.7983 21.5 10.4149 21.1667 10.3338 20.7562L10.2547 20.356C9.82113 18.1617 7.50931 16.9082 5.40665 17.6165L5.0099 17.7501C4.55092 17.9047 4.06104 17.714 3.83671 17.3373L3.1233 16.1393C2.9058 15.7741 2.97959 15.3073 3.32398 15.0186L3.64185 14.7522C5.36782 13.3056 5.36781 10.6944 3.64185 9.24779L3.32398 8.98137C2.97959 8.69273 2.9058 8.2259 3.1233 7.86067L3.83674 6.66266C4.06106 6.28596 4.55093 6.09528 5.0099 6.24986L5.40676 6.38352C7.50938 7.09166 9.82112 5.83819 10.2547 3.64392L10.3338 3.24375Z"/>
</symbol>
```

- [ ] **Step 4: Add desktop and mobile Presets controls**

Immediately after each Frontends control, add:

```html
<button class="category" data-category="preset"><svg class="icon"><use href="#i-preset"/></svg><span>Presets</span></button>
```

```html
<button class="mobile-category-option" type="button" data-category="preset"><svg class="icon"><use href="#i-preset"/></svg><span>Presets</span></button>
```

- [ ] **Step 5: Filter Presets by project kind**

Replace the category predicate with:

```javascript
const categoryMatch =
  activeCategory === "all" ||
  (activeCategory === "preset"
    ? card.dataset.kind === "preset"
    : card.dataset.category === activeCategory);
```

- [ ] **Step 6: Run the green Presets and parser contract**

Rerun Step 1, replacing the final assertion with:

```powershell
if($missing.Count){ throw "Missing Presets rules: $($missing -join ', ')" }

$scripts=[regex]::Matches($html,'(?s)<script>(.*?)</script>')
if($scripts.Count -ne 1){ throw "Expected one inline script, found $($scripts.Count)" }
$temp=Join-Path $env:TEMP 'tavernary-header-presets.js'
Set-Content -LiteralPath $temp -Value $scripts[0].Groups[1].Value -Encoding utf8
node --check $temp
if($LASTEXITCODE -ne 0){ throw 'Inline JavaScript parse failed' }
'Presets navigation and parser contracts passed'
```

Expected: `Presets navigation and parser contracts passed`.

---

### Task 3: Verify Responsive Layout and Filter Behavior

**Files:**
- Verify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`

**Interfaces:**
- Consumes: the revised brand order, nine category controls, Presets filter,
  compact-card toggle, and mobile preview.
- Produces: rendered geometry, filter-count, icon-color, overflow, parser, and
  console evidence.

- [ ] **Step 1: Reload and verify the desktop header**

Reload `http://localhost:60370/#`, restore desktop preview and standard cards,
and clear all filters.

Confirm:

- `.brand-copy` begins at the topbar's `24px` left content edge;
- `.brand-logo` is to the right of `.brand-copy`;
- artwork-left minus copy-right is within `0.2px` of `6px`;
- artwork and the full copy block are vertically centered;
- artwork is `45px × 60px`;
- wordmark is `28.85px` and remains aligned to the tagline within `1px`;
- topbar remains `66px` tall;
- no header collision or horizontal overflow exists.

- [ ] **Step 2: Verify the desktop category strip**

Confirm:

- nine category controls exist;
- Presets immediately follows Frontends;
- all nine controls have equal rendered widths within `0.2px`;
- the Presets icon and label compute to `rgb(87, 197, 163)`;
- no label or icon clips and the page has zero horizontal overflow.

- [ ] **Step 3: Verify Presets and functional filtering**

Click Presets and confirm:

- exactly two cards are visible;
- every visible card has `data-kind="preset"`;
- no non-preset card is visible;
- the heading reports `2 projects`;
- Presets is active in desktop and mobile control state.

Click Generation & Reasoning and confirm both preset cards remain included
among the visible generation projects. Click All Projects and confirm all
projects return and All Projects is active.

- [ ] **Step 4: Verify compact-card spacing**

Switch to compact cards and confirm the wrapper remains `17px × 17px`, the icon
remains `15px × 15px`, and icon-to-label spacing remains `6px`. Restore
standard cards and confirm its icon-to-label spacing remains `8px`.

- [ ] **Step 5: Verify the 390px mobile view**

Switch to mobile and confirm:

- text begins at the mobile header's `13px` left content edge;
- artwork is to the right at a `6px` gap and renders `41px × 55px`;
- brand content does not intersect `Submit Project`;
- the mobile category menu lists Presets immediately after Frontends;
- selecting mobile Presets shows the same two preset cards;
- the page and `#site-preview` have zero horizontal overflow.

- [ ] **Step 6: Inspect screenshots and browser logs**

Capture desktop and mobile screenshots. Confirm the revised lockup reads as one
balanced identity and the ninth category remains legible.

Run:

```javascript
await tab.dev.logs({ levels: ["error", "warning"], limit: 50 })
```

Expected: `[]`.

- [ ] **Step 7: Run final source and repository checks**

Rerun Task 1 Step 4 and Task 2 Step 6 in a fresh PowerShell process.

Run:

```powershell
git status --short
git check-ignore -v `
  '.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
```

Expected: all source contracts pass, the mockup remains ignored and unstaged,
and `?? data/` remains untouched.

- [ ] **Step 8: Restore the deliverable**

Leave the mockup in desktop preview with All Projects active, standard cards,
clear filters and searches, the collapsed capability cloud, and all projects
visible. Finalize the v7 tab as the deliverable.
