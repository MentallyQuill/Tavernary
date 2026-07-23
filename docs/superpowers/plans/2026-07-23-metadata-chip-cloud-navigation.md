# Metadata Chip Cloud and Compact Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scrolling metadata checkbox list with a searchable OR-filter chip cloud and reduce only the desktop function-navigation height while applying the approved header and category copy.

**Architecture:** Preserve the existing single-file v7 Companion mockup and its current card, search, query-chip, mobile-drawer, and metadata filtering logic. Change only the generated metadata option markup and presentation, then compact the desktop-only navigation strip through scoped CSS so the mobile Browse selector retains its current dimensions.

**Tech Stack:** Static HTML, CSS container queries, vanilla JavaScript, PowerShell contract checks, Node.js syntax checks, and the in-app browser.

## Global Constraints

- `.superpowers/` remains intentionally ignored and must not be staged.
- The submission action reads exactly `Submit Project`.
- Remove `How Activity Works`; keep `About`.
- Rename `Character & World Authoring` to `Character & Worldbuilding` on desktop and mobile.
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

### Task 1: Header Copy and Desktop Function Navigation

**Files:**
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`

**Interfaces:**
- Consumes: `.top-actions`, `.category-strip`, `.category`, `.category .icon`, `.all-symbol`, and matching desktop/mobile category labels.
- Produces: the approved header copy and a desktop-only `50px` category strip with `34px` buttons and `18px` symbols.

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
  '<span>Character &amp; Worldbuilding</span>'
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

Keep `data-category="authoring"` and the `#i-authoring` symbol unchanged so
existing filtering continues to work.

- [ ] **Step 4: Compact only the desktop category strip**

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

- [ ] **Step 5: Run copy, navigation, and JavaScript contracts**

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
  'Boolean(query) && !selected && !matches'
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
