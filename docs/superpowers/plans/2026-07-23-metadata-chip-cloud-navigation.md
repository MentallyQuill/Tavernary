# Metadata Chip Cloud and Compact Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scrolling metadata checkbox list with a searchable OR-filter chip cloud, install the four approved function icons, and reduce only the desktop function-navigation height while applying the approved header and category copy.

**Architecture:** Preserve the existing single-file v7 Companion mockup and its current card, search, query-chip, mobile-drawer, and metadata filtering logic. Replace the four existing inline function-symbol definitions with normalized geometry from the supplied SVGs so every existing desktop, mobile, and card `<use>` updates together. Change only the generated metadata option markup and presentation, then compact the desktop-only navigation strip through scoped CSS so the mobile Browse selector retains its current dimensions.

**Tech Stack:** Static HTML, CSS container queries, vanilla JavaScript, PowerShell contract checks, Node.js syntax checks, and the in-app browser.

## Global Constraints

- `.superpowers/` remains intentionally ignored and must not be staged.
- The submission action reads exactly `Submit Project`.
- Remove `How Activity Works`; keep `About`.
- Rename `Character & World Authoring` to `Character & Worldbuilding` on desktop and mobile.
- Replace the four inline function icons with the supplied mappings:
  - Memory & Retrieval: `C:\Users\Keptin\Downloads\memory.svg`
  - Generation & Reasoning: `C:\Users\Keptin\Downloads\generation.svg`
  - Character & Worldbuilding: `C:\Users\Keptin\Downloads\feather.svg`
  - RPG Systems & Suites: `C:\Users\Keptin\Downloads\d20.svg`
- Preserve the existing `i-memory`, `i-generation`, `i-authoring`, and `i-rpg`
  symbol IDs so navigation and card icons update together.
- Normalize supplied SVG fills and strokes to `currentColor`; do not add external
  image paths or duplicate icon markup at each use site.
- Desktop function navigation is approximately `50px` high with `34px` buttons and `18px` icons.
- Mobile `Browse: All Projects` dimensions remain unchanged.
- Metadata options use one naturally wrapping chip cloud with no inner scrollbar.
- Each metadata chip includes a label and result count.
- Selected metadata chips use a raised surface, strong border, primary text, and a visible checkmark.
- Selected metadata chips remain visible and sort first while searching.
- Multiple selected metadata chips retain OR logic.
- Metadata search changes only the option cloud until a chip is selected.
- Existing removable query chips stay synchronized with metadata selections.
- No selected filters shows all fourteen projects.

---

### Task 1: Header Copy, Function Icons, and Desktop Navigation

**Files:**
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`
- Source: `C:\Users\Keptin\Downloads\memory.svg`
- Source: `C:\Users\Keptin\Downloads\generation.svg`
- Source: `C:\Users\Keptin\Downloads\feather.svg`
- Source: `C:\Users\Keptin\Downloads\d20.svg`

**Interfaces:**
- Consumes: `.top-actions`, `.category-strip`, `.category`, `.category .icon`, `.all-symbol`, the `i-memory`, `i-generation`, `i-authoring`, and `i-rpg` symbols, and matching desktop/mobile category labels.
- Produces: the approved header copy, the four supplied function icons across all existing `<use>` sites, and a desktop-only `50px` category strip with `34px` buttons and `18px` symbols.

- [ ] **Step 1: Run the failing copy and navigation contract**

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
$html=Get-Content -LiteralPath $file -Raw
$required=@(
  '>Submit Project</a>',
  'min-height: 50px;',
  'height: 34px;',
  '.category .icon { width: 18px; height: 18px;',
  '.category .all-symbol {',
  '<span>Character &amp; Worldbuilding</span>',
  '<symbol id="i-memory" viewBox="0 0 24 24" fill="none" stroke="currentColor"',
  '<symbol id="i-generation" viewBox="0 0 487.6 487.6" fill="currentColor" stroke="none"',
  '<symbol id="i-authoring" viewBox="0 0 512 512" fill="currentColor" stroke="none"',
  '<symbol id="i-rpg" viewBox="-16 0 512 512" fill="currentColor" stroke="none"',
  'M12,4.36V20.59',
  'M453.8,20.525H173.1',
  'M512 0C460.22',
  'M106.75 215.06L1.2'
)
foreach($item in $required){
  if(-not $html.Contains($item)){throw "Missing $item"}
}
if($html.Contains('How activity works')){throw 'How Activity Works still present'}
if($html.Contains('Character & World Authoring')){throw 'Old category label still present'}
if(([regex]::Matches($html,'<span>Character &amp; Worldbuilding</span>')).Count -ne 2){
  throw 'Worldbuilding label must appear in desktop and mobile navigation'
}
```

Expected: FAIL with `Missing >Submit Project</a>`.

- [ ] **Step 2: Apply the approved header copy**

Replace the top actions with:

```html
<nav class="top-actions">
  <a class="top-link" href="#">About</a>
  <a class="submit" href="#">Submit Project</a>
</nav>
```

- [ ] **Step 3: Rename the category in both navigation surfaces**

Replace the visible desktop and mobile labels with:

```html
<span>Character &amp; Worldbuilding</span>
```

Keep `data-category="authoring"` and the existing `#i-authoring` reference
unchanged so existing filtering continues to work.

- [ ] **Step 4: Replace the four shared inline symbols**

Use the supplied SVG geometry to replace only these existing definitions:

| Existing symbol | Supplied source | Rendering normalization |
|---|---|---|
| `i-memory` | `memory.svg` | Keep `viewBox="0 0 24 24"`; set `fill="none"`, `stroke="currentColor"`, `stroke-width="1.91"`, and `stroke-miterlimit="10"` on the symbol; copy all eight source paths without their `.cls-1` classes. |
| `i-generation` | `generation.svg` | Keep `viewBox="0 0 487.6 487.6"`; set `fill="currentColor"` and `stroke="none"` on the symbol; copy the source path. |
| `i-authoring` | `feather.svg` | Keep `viewBox="0 0 512 512"`; set `fill="currentColor"` and `stroke="none"` on the symbol; copy the source path. |
| `i-rpg` | `d20.svg` | Keep `viewBox="-16 0 512 512"`; set `fill="currentColor"` and `stroke="none"` on the symbol; copy the source path. |

Do not copy the XML declarations, comments, fixed `width`/`height`, `<defs>`,
embedded styles, source IDs, or wrapper `<svg>` elements. Keep the existing
symbol IDs, and do not change any `<use href="#i-*">` call sites.

The filled icons need `stroke="none"` because the global `.icon` rule defaults
to stroked line art. The memory icon remains stroked and unfilled.

Replace the four definitions with this normalized markup:

```html
<symbol id="i-memory" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.91" stroke-miterlimit="10">
  <path d="M12,4.36V20.59a1.92,1.92,0,0,1-1.91,1.91,1.93,1.93,0,0,1-1.91-1.91v0a2.45,2.45,0,0,1-.48,0,3.35,3.35,0,0,1-3.34-3.34,3.19,3.19,0,0,1,.08-.7A4.29,4.29,0,0,1,3.6,8.79,3.24,3.24,0,0,1,3.41,7.7,3.34,3.34,0,0,1,6.27,4.4v0a2.87,2.87,0,0,1,5.73,0Z"/>
  <path d="M6.75,11.05a3.35,3.35,0,0,1,0-6.69"/>
  <path d="M8.18,13.91h0A3.82,3.82,0,0,1,12,17.73h0"/>
  <path d="M9.14,7.23h0A2.86,2.86,0,0,0,12,4.36h0"/>
  <path d="M12,4.36V20.59a1.92,1.92,0,0,0,1.91,1.91,1.93,1.93,0,0,0,1.91-1.91v0a2.45,2.45,0,0,0,.48,0,3.35,3.35,0,0,0,3.34-3.34,3.19,3.19,0,0,0-.08-.7,4.29,4.29,0,0,0,.84-7.76,3.24,3.24,0,0,0,.19-1.09,3.34,3.34,0,0,0-2.86-3.3v0a2.87,2.87,0,0,0-5.73,0Z"/>
  <path d="M17.25,11.05a3.35,3.35,0,0,0,0-6.69"/>
  <path d="M15.82,13.91h0A3.82,3.82,0,0,0,12,17.73h0"/>
  <path d="M14.86,7.23h0A2.86,2.86,0,0,1,12,4.36h0"/>
</symbol>
<symbol id="i-generation" viewBox="0 0 487.6 487.6" fill="currentColor" stroke="none">
  <path d="M453.8,20.525H173.1c-18.6,0-33.8,15.2-33.8,33.8v117.4H19.5c-10.8,0-19.5,8.7-19.5,19.5v186.8c0,10.8,8.7,19.5,19.5,19.5h27.7v64.6c0,4.4,5.3,6.6,8.4,3.5l68.1-68.1h195.4c10.8,0,19.5-8.7,19.5-19.5v-114.9h11.2l59.3,59.3c3.8,3.8,8.8,5.9,14.2,5.9c5.1,0,10-1.9,13.8-5.4c4-3.8,6.3-9.1,6.3-14.7v-45.1h10.4c18.6,0,33.8-15.2,33.8-33.8v-175C487.6,35.725,472.5,20.525,453.8,20.525z M127.7,215.425h151.7v20.2H127.7V215.425z M58.9,215.425h45.7v20.2H58.9V215.425z M58.9,254.725h104.8v20.2H58.9V254.725z M58.9,294.025h151.7v20.2H58.9V294.025z M163.7,353.525H58.9v-20.2h104.8V353.525z M279.7,353.525h-92.9v-20.2h92.9V353.525z M233.7,314.225v-20.2h45.7v20.2H233.7z M279.7,274.925h-92.9v-20.2h92.9V274.925z M456.7,229.325c0,1.6-1.3,2.8-2.8,2.8h-41.5v49.8l-49.8-49.8h-23.9v-41c0-10.8-8.7-19.5-19.5-19.5h-149v-117.3c0-1.6,1.3-2.8,2.8-2.8h280.8c1.6,0,2.8,1.3,2.8,2.8v175H456.7z"/>
</symbol>
<symbol id="i-authoring" viewBox="0 0 512 512" fill="currentColor" stroke="none">
  <path d="M512 0C460.22 3.56 96.44 38.2 71.01 287.61c-3.09 26.66-4.84 53.44-5.99 80.24l178.87-178.69c6.25-6.25 16.4-6.25 22.65 0s6.25 16.38 0 22.63L7.04 471.03c-9.38 9.37-9.38 24.57 0 33.94 9.38 9.37 24.59 9.37 33.98 0l57.13-57.07c42.09-.14 84.15-2.53 125.96-7.36 53.48-5.44 97.02-26.47 132.58-56.54H255.74l146.79-48.88c11.25-14.89 21.37-30.71 30.45-47.12h-81.14l106.54-53.21C500.29 132.86 510.19 26.26 512 0z"/>
</symbol>
<symbol id="i-rpg" viewBox="-16 0 512 512" fill="currentColor" stroke="none">
  <path d="M106.75 215.06L1.2 370.95c-3.08 5 .1 11.5 5.93 12.14l208.26 22.07-108.64-190.1zM7.41 315.43L82.7 193.08 6.06 147.1c-2.67-1.6-6.06.32-6.06 3.43v162.81c0 4.03 5.29 5.53 7.41 2.09zM18.25 423.6l194.4 87.66c5.3 2.45 11.35-1.43 11.35-7.26v-65.67l-203.55-22.3c-4.45-.5-6.23 5.59-2.2 7.57zm81.22-257.78L179.4 22.88c4.34-7.06-3.59-15.25-10.78-11.14L17.81 110.35c-2.47 1.62-2.39 5.26.13 6.78l81.53 48.69zM240 176h109.21L253.63 7.62C250.5 2.54 245.25 0 240 0s-10.5 2.54-13.63 7.62L130.79 176H240zm233.94-28.9l-76.64 45.99 75.29 122.35c2.11 3.44 7.41 1.94 7.41-2.1V150.53c0-3.11-3.39-5.03-6.06-3.43zm-93.41 18.72l81.53-48.7c2.53-1.52 2.6-5.16.13-6.78l-150.81-98.6c-7.19-4.11-15.12 4.08-10.78 11.14l79.93 142.94zm79.02 250.21L256 438.32v65.67c0 5.84 6.05 9.71 11.35 7.26l194.4-87.66c4.03-1.97 2.25-8.06-2.2-7.56zm-86.3-200.97l-108.63 190.1 208.26-22.07c5.83-.65 9.01-7.14 5.93-12.14L373.25 215.06zM240 208H139.57L240 383.75 340.43 208H240z"/>
</symbol>
```

- [ ] **Step 5: Compact only the desktop category strip**

Replace the desktop category rules with:

```css
.category-strip {
  min-height: 50px;
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  align-items: center;
  gap: 6px;
  padding: 6px 20px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
  overflow: hidden;
}
.category {
  min-width: 0;
  width: 100%;
  height: 34px;
  padding: 5px 10px;
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid transparent;
  border-radius: 7px;
  color: var(--muted);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: color .15s, background .15s, border-color .15s;
}
.category .icon { width: 18px; height: 18px; flex: none; }
.category .all-symbol {
  width: 18px;
  height: 18px;
  gap: 2px;
}
.category span { font-size: 10px; line-height: 1.15; }
```

Do not change the global `.all-symbol` dimensions or any rules inside
`@container site (max-width: 760px)`. This keeps the mobile Browse selector and
menu options at their current sizes.

- [ ] **Step 6: Run copy, icon, navigation, and JavaScript contracts**

Run Step 1, then:

```powershell
$html=Get-Content -LiteralPath '.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html' -Raw
$script=[regex]::Match($html,'<script>([\s\S]*?)</script>').Groups[1].Value
$temp=Join-Path $env:TEMP 'tavernary-v7-compact-nav.js'
Set-Content -LiteralPath $temp -Value $script -Encoding utf8
node --check $temp
```

Expected: both commands exit 0.

---

### Task 2: Searchable Metadata Chip Cloud

**Files:**
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`

**Interfaces:**
- Consumes: `buildMetadataFilters()`, `updateMetadataList()`, `metadataChecks`, `.metadata-options`, `.metadata-option`, `updateQueryChips()`, and `updateResults()`.
- Produces: `.metadata-filter-chip`, `.metadata-check`, `.metadata-label`, and `.metadata-count`, while retaining the existing checkbox values and OR filtering.

- [ ] **Step 1: Run the failing chip-cloud contract**

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
$html=Get-Content -LiteralPath $file -Raw
$required=@(
  'class="metadata-filter-chip"',
  'class="metadata-check" aria-hidden="true">&#10003;</span>',
  'class="metadata-label"',
  'class="metadata-count"',
  'display: flex;',
  'flex-wrap: wrap;',
  '.metadata-option.selected { order: 0; }',
  'Boolean(query) && !selected'
)
foreach($item in $required){
  if(-not $html.Contains($item)){throw "Missing $item"}
}
if($html.Contains('max-height: 190px;')){throw 'Metadata chip cloud still height-capped'}
if($html.Contains('scrollbar-color: var(--line-strong) var(--surface);')){
  throw 'Metadata chip cloud still has an inner scrollbar'
}
```

Expected: FAIL with `Missing class="metadata-filter-chip"`.

- [ ] **Step 2: Replace the metadata option container styles**

Use:

```css
.metadata-options {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 6px;
  overflow: visible;
}
.metadata-option {
  min-width: 0;
  display: inline-flex;
  order: 1;
}
.metadata-option.selected { order: 0; }
.metadata-option.filtered-out { display: none; }
```

Remove `max-height`, `overflow-y`, and scrollbar styling from
`.metadata-options`.

- [ ] **Step 3: Add accessible chip styles**

Add:

```css
.metadata-filter-chip {
  min-height: 25px;
  padding: 5px 7px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--text-2);
  background: var(--surface);
  font-size: 9px;
  line-height: 1;
  cursor: pointer;
  transition: color .14s, border-color .14s, background .14s;
}
.metadata-filter-chip input {
  width: 1px;
  height: 1px;
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.metadata-check {
  display: none;
  color: var(--text);
  font-weight: 900;
}
.metadata-count {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.metadata-option:hover .metadata-filter-chip {
  border-color: var(--line-strong);
  background: var(--surface-2);
}
.metadata-option.selected .metadata-filter-chip {
  border-color: var(--line-strong);
  color: var(--text);
  background: var(--surface-3);
}
.metadata-option.selected .metadata-check { display: inline; }
.metadata-option:focus-within .metadata-filter-chip {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--text-2) 18%, transparent);
}
```

Selection remains identifiable through the checkmark and structure, not color
alone.

- [ ] **Step 4: Generate chip markup without changing filter values**

In `buildMetadataFilters()`, replace the generated row markup with:

```js
row.innerHTML = `
  <label class="metadata-filter-chip">
    <input type="checkbox" value="${key}">
    <span class="metadata-check" aria-hidden="true">&#10003;</span>
    <span class="metadata-label">${entry.label}</span>
    <span class="metadata-count">${entry.count}</span>
  </label>
`;
```

Keep:

```js
row.className = "metadata-option";
row.dataset.name = entry.label;
```

The existing `metadataChecks`, query-chip removal, OR matching, Clear all, and
filter-count listeners continue to consume the generated checkbox values.

- [ ] **Step 5: Keep selected chips visible and ordered first during search**

Replace `updateMetadataList()` with:

```js
function updateMetadataList() {
  const query = metadataSearch.value.trim().toLowerCase();
  document.querySelectorAll(".metadata-option").forEach((row) => {
    const selected = row.querySelector("input").checked;
    const matches = row.dataset.name.toLowerCase().includes(query);
    row.classList.toggle("selected", selected);
    row.classList.toggle(
      "filtered-out",
      Boolean(query) && !selected && !matches
    );
  });
}
```

Search still does not call `updateResults()`, so catalog results do not change
until a chip is selected.

- [ ] **Step 6: Run chip-cloud and JavaScript contracts**

Run Step 1, then:

```powershell
$html=Get-Content -LiteralPath '.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html' -Raw
$script=[regex]::Match($html,'<script>([\s\S]*?)</script>').Groups[1].Value
$temp=Join-Path $env:TEMP 'tavernary-v7-chip-cloud.js'
Set-Content -LiteralPath $temp -Value $script -Encoding utf8
node --check $temp
```

Expected: both commands exit 0.

---

### Task 3: Browser and Regression Verification

**Files:**
- Verify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`

**Interfaces:**
- Consumes: the completed v7 Companion mockup.
- Produces: visual and interaction evidence for desktop navigation density, metadata chip behavior, and unchanged mobile/card behavior.

- [ ] **Step 1: Verify desktop copy and navigation geometry**

In Desktop Standard mode, verify:

- only `About` and `Submit Project` remain in the top actions;
- `Character & Worldbuilding` appears in the desktop strip;
- the strip measures approximately `50px`;
- each category button measures approximately `34px`;
- category icons measure approximately `18px`;
- Memory & Retrieval uses the supplied brain icon;
- Generation & Reasoning uses the supplied overlapping-dialogue icon;
- Character & Worldbuilding uses the supplied feather icon;
- RPG Systems & Suites uses the supplied d20 icon;
- each replacement appears consistently in the desktop strip, mobile category
  menu, and matching project cards;
- all four icons inherit the surrounding `currentColor` styling;
- all eight categories remain equal-width and fully visible;
- the strip has no horizontal overflow.

- [ ] **Step 2: Verify metadata chip-cloud presentation**

Verify:

- all generated metadata options render as wrapping pill-shaped chips;
- no independent metadata scrollbar exists;
- each chip contains a label and count;
- selecting a chip displays its checkmark and raised selected treatment;
- keyboard focus produces a visible focus ring;
- the outer filter rail/page, rather than the metadata cloud, owns vertical
  scrolling.

- [ ] **Step 3: Verify metadata behavior**

Verify:

- entering `suite` in metadata search leaves the catalog count at `14`;
- with `Prompt ordering` selected, searching `suite` keeps both selected
  `Prompt ordering` and matching `Suite` visible;
- selecting `Character roleplay` alongside `Prompt ordering` shows the OR union
  of `Celia V5.4` and `Marinara's Essentials`;
- selected metadata chips appear before unselected chips;
- removable query chips clear their corresponding filter chips;
- Clear all restores `14` projects and no selected chips.

- [ ] **Step 4: Verify mobile and card regressions**

Switch to Mobile and verify:

- the `Browse: All Projects` selector retains its previous height;
- `Character & Worldbuilding` appears in the mobile menu;
- the filter drawer shows the full chip cloud without an inner metadata
  scrollbar;
- the 390 px preview has no horizontal overflow;
- Standard cards retain summaries and two metadata rows;
- Compact cards retain one clipped metadata row, hide summaries/community/size,
  and keep license labels visible.

- [ ] **Step 5: Run the final static contract**

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
$html=Get-Content -LiteralPath $file -Raw
$required=@(
  '>Submit Project</a>',
  '<span>Character &amp; Worldbuilding</span>',
  'min-height: 50px;',
  'height: 34px;',
  'class="metadata-filter-chip"',
  'class="metadata-check" aria-hidden="true">&#10003;</span>',
  '.metadata-option.selected { order: 0; }',
  'Boolean(query) && !selected && !matches',
  '<symbol id="i-memory" viewBox="0 0 24 24" fill="none" stroke="currentColor"',
  '<symbol id="i-generation" viewBox="0 0 487.6 487.6" fill="currentColor" stroke="none"',
  '<symbol id="i-authoring" viewBox="0 0 512 512" fill="currentColor" stroke="none"',
  '<symbol id="i-rpg" viewBox="-16 0 512 512" fill="currentColor" stroke="none"',
  'M12,4.36V20.59',
  'M453.8,20.525H173.1',
  'M512 0C460.22',
  'M106.75 215.06L1.2'
)
foreach($item in $required){
  if(-not $html.Contains($item)){throw "Missing $item"}
}
$forbidden=@(
  'How activity works',
  'Character & World Authoring',
  'max-height: 190px;',
  'scrollbar-color: var(--line-strong) var(--surface);'
)
foreach($item in $forbidden){
  if($html.Contains($item)){throw "Forbidden $item"}
}
if(([regex]::Matches($html,'<span>Character &amp; Worldbuilding</span>')).Count -ne 2){
  throw 'Worldbuilding label must appear twice'
}
'Tavernary chip cloud and compact navigation verification passed'
```

Expected: `Tavernary chip cloud and compact navigation verification passed`.

- [ ] **Step 6: Leave the deliverable open**

Restore Standard density and Desktop preview, clear search and filters, keep
v7 open as the deliverable, and do not stage `.superpowers/`.
