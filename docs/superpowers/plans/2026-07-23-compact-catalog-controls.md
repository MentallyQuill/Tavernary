# Compact Catalog Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a v7 Tavernary mockup with a shorter catalog header, compact mobile controls, an orange wordmark, and a functional standard/compact card-density toggle.

**Architecture:** Copy the approved v6 single-file mockup to v7, then make presentation-only HTML, CSS, and JavaScript changes within that file. Density is represented by a `compact-cards` class on `#site-preview`; existing card data, filtering, sorting, links, and tooltip behavior remain unchanged.

**Tech Stack:** Static HTML, CSS container queries, vanilla JavaScript, PowerShell contract checks, Node.js syntax checks, and the in-app browser.

## Global Constraints

- Standard mode is the initial state.
- The “Tavernary” wordmark color is exactly `#E18A24`; the square `T` mark remains neutral.
- The mobile preview width is 390 px and must not horizontally overflow.
- Compact mode hides summaries, aggregate score, and repository size.
- Compact mode shows one clipped metadata-chip row with compatible frontends first and the license at the far right.
- Sorting, searching, filtering, links, tooltips, and license semantics must remain unchanged.
- `.superpowers/` is intentionally untracked; do not stage or commit mockup files.

---

### Task 1: Compact Header and Responsive Control Layout

**Files:**
- Create: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`
- Source: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v6.html`

**Interfaces:**
- Consumes: the v6 responsive preview toolbar, category selector, filter drawer, sort dropdown, and card catalog.
- Produces: `#density-toggle`, `.brand-name`, `.catalog-title-row`, icon-only `.filter-toggle`, and an empty-capable `#active-query`.

- [ ] **Step 1: Write and run the failing header contract**

Run:

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
if (-not (Test-Path $file)) { throw 'v7 mockup missing' }
$html=Get-Content -LiteralPath $file -Raw
@('class="brand-name"','id="density-toggle"','Catalog refreshed 43 min ago','aria-label="Open filters"') |
  ForEach-Object { if (-not $html.Contains($_)) { throw "Missing $_" } }
if ($html.Contains('Development activity reflects meaningful source work')) {
  throw 'Old activity subtitle remains'
}
```

Expected: FAIL with `v7 mockup missing`.

- [ ] **Step 2: Copy v6 to v7**

Run:

```powershell
Copy-Item -LiteralPath '.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v6.html' `
  -Destination '.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
```

- [ ] **Step 3: Implement the header markup**

In v7:

- Change the title to `Tavernary — Compact Catalog`.
- Add these symbols to `.icon-defs`:

```html
<symbol id="i-filter" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></symbol>
<symbol id="i-density" viewBox="0 0 24 24"><path d="M5 6h14M5 10h14M5 14h14M5 18h14"/></symbol>
```

- Wrap the brand text:

```html
<span class="brand-name">Tavernary</span>
```

- Replace `.catalog-heading` contents with:

```html
<div class="catalog-title-row">
  <h1><span id="result-count">14</span> projects</h1>
  <button class="density-toggle" id="density-toggle" type="button"
    aria-label="Use compact cards" aria-pressed="false"
    data-tooltip="Use compact cards">
    <svg class="icon" aria-hidden="true"><use href="#i-density"/></svg>
  </button>
</div>
<p>Catalog refreshed 43 min ago</p>
```

- Replace the visible Filters label with:

```html
<button class="filter-toggle" type="button" aria-label="Open filters"
  data-tooltip="Open filters">
  <svg class="icon" aria-hidden="true"><use href="#i-filter"/></svg>
  <span id="filter-count" hidden>0</span>
</button>
```

- Remove the static refresh chip from `#active-query`, leaving the element empty.

- [ ] **Step 4: Implement header and mobile-control CSS**

Add:

```css
.brand-name { color: #E18A24; }
.catalog-title-row { display: flex; align-items: center; gap: 8px; }
.density-toggle {
  width: 30px; height: 30px; display: grid; place-items: center;
  padding: 0; border: 1px solid var(--line); border-radius: 6px;
  color: var(--muted); background: var(--surface); cursor: pointer;
}
.density-toggle:hover,
.density-toggle[aria-pressed="true"] { color: var(--text); background: var(--surface-3); }
.density-toggle .icon { width: 16px; height: 16px; }
.active-query { display: none; min-height: 0; margin-bottom: 0; }
.active-query:not(:empty) {
  display: flex;
  min-height: 30px;
  margin-bottom: 14px;
}
```

Replace the mobile `.catalog-controls` rules with a single-row grid:

```css
.catalog-controls {
  width: 100%;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) minmax(92px, auto);
  gap: 6px;
  overflow: visible;
}
.filter-toggle {
  width: 34px;
  padding: 0;
  display: grid;
  place-items: center;
  position: relative;
}
.filter-toggle .icon { width: 17px; height: 17px; }
.filter-toggle #filter-count {
  position: absolute;
  top: -5px;
  right: -5px;
}
.view-tabs { grid-column: auto; width: 100%; }
.view-tabs button { min-width: 0; padding-inline: 6px; flex: 1; }
.sort { width: 100%; min-width: 0; padding-left: 8px; }
```

- [ ] **Step 5: Run the header contract**

Run the command from Step 1.

Expected: PASS with no output.

---

### Task 2: Functional Compact Card Density

**Files:**
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`

**Interfaces:**
- Consumes: `#density-toggle`, `#site-preview`, `.repo-card`, `.summary`, `.community`, `.repo-size`, `.artifact-size`, `.chips`, and `.function-symbol`.
- Produces: `setDensityMode(compact: boolean): void` and the `.compact-cards` presentation state.

- [ ] **Step 1: Write and run the failing density contract**

Run:

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
$html=Get-Content -LiteralPath $file -Raw
@('function setDensityMode(compact)', '.compact-cards .summary',
  '.compact-cards .community', '.compact-cards .repo-size',
  '.compact-cards .chips', '.compact-cards .function-symbol') |
  ForEach-Object { if (-not $html.Contains($_)) { throw "Missing $_" } }
```

Expected: FAIL with `Missing function setDensityMode(compact)`.

- [ ] **Step 2: Add compact-card CSS**

Add:

```css
.compact-cards .repo-card {
  min-height: 0;
  height: auto;
  padding: 11px 12px;
}
.compact-cards .card-top {
  min-height: 20px;
  align-items: center;
}
.compact-cards .identity { gap: 6px; }
.compact-cards .function-symbol {
  width: 17px;
  height: 17px;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.compact-cards .function-symbol .icon { width: 15px; height: 15px; }
.compact-cards .kind { max-width: none; font-size: 8px; line-height: 1; }
.compact-cards .development {
  display: flex;
  align-items: center;
  gap: 9px;
}
.compact-cards .development .activity,
.compact-cards .development .commit-age,
.compact-cards .development .source-age,
.compact-cards .development .preset-version {
  display: flex;
}
.compact-cards .community,
.compact-cards .repo-size,
.compact-cards .artifact-size { display: none; }
.compact-cards .card-title { margin: 8px 0 10px; font-size: 15px; }
.compact-cards .summary { display: none; }
.compact-cards .card-bottom {
  margin-top: 0;
  padding-top: 8px;
  align-items: center;
}
.compact-cards .chips {
  min-height: 18px;
  max-height: 18px;
  flex-wrap: nowrap;
  align-items: center;
}
```

- [ ] **Step 3: Add density state behavior**

Declare:

```js
const sitePreview = document.getElementById("site-preview");
const densityToggle = document.getElementById("density-toggle");
```

Add:

```js
function setDensityMode(compact) {
  sitePreview.classList.toggle("compact-cards", compact);
  densityToggle.setAttribute("aria-pressed", String(compact));
  const label = compact ? "Use standard cards" : "Use compact cards";
  densityToggle.setAttribute("aria-label", label);
  densityToggle.dataset.tooltip = label;
}

densityToggle.addEventListener("click", () => {
  setDensityMode(!sitePreview.classList.contains("compact-cards"));
});
```

Call `setDensityMode(false)` during initialization.

- [ ] **Step 4: Run the density and syntax contracts**

Run the density contract from Step 1, then:

```powershell
$html=Get-Content -LiteralPath '.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html' -Raw
$script=[regex]::Match($html,'<script>([\s\S]*?)</script>').Groups[1].Value
$temp=Join-Path $env:TEMP 'tavernary-v7-check.js'
Set-Content -LiteralPath $temp -Value $script -Encoding utf8
node --check $temp
```

Expected: both commands exit 0.

---

### Task 3: Live Desktop and Mobile Verification

**Files:**
- Verify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`

**Interfaces:**
- Consumes: the completed v7 mockup through the Brainstorm Companion.
- Produces: browser evidence for layout, density behavior, filter count, category filtering, and popularity sorting.

- [ ] **Step 1: Load v7 in the existing Companion**

Select `catalog-wall-responsive-v7.html` as the active mockup and reload the existing Tavernary tab.

- [ ] **Step 2: Verify desktop standard mode**

Check:

- `Tavernary` computes to `rgb(225, 138, 36)`.
- The subtitle is `Catalog refreshed 43 min ago`.
- The boxed refresh chip is absent.
- Eight desktop categories have equal widths.
- The site and category row have no horizontal overflow.
- Standard Lumiverse card shows its summary, community score, repository size, and metadata chips.

- [ ] **Step 3: Verify desktop compact mode**

Click the uniquely located `Use compact cards` button and check:

- `aria-pressed="true"` and accessible name changes to `Use standard cards`.
- Lumiverse summary, community score, and repository size are not displayed.
- Type icon has no border/background and is no taller than 17 px.
- The chip container is one row and no taller than 18 px.
- The license remains visible.
- Popularity sorting still places Lumiverse first.

- [ ] **Step 4: Verify mobile standard and compact controls**

Switch the preview to Mobile and check:

- page width is 390 px with no horizontal overflow;
- Filters is icon-only and is left of the status tabs;
- the status tabs are in the center and sort is on the right;
- selecting SillyTavern produces a `1` badge on the Filters icon;
- the filter drawer opens and closes;
- Memory & Retrieval still filters to three projects;
- the density toggle works without changing those filter results.

- [ ] **Step 5: Run final static verification**

Run:

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
$html=Get-Content -LiteralPath $file -Raw
$required=@('#E18A24','id="density-toggle"','aria-label="Open filters"',
  'function setDensityMode(compact)', '.compact-cards .summary',
  '@container site (max-width: 760px)')
foreach($item in $required) {
  if(-not $html.Contains($item)) { throw "Missing $item" }
}
if($html.Contains('Development activity reflects meaningful source work')) {
  throw 'Old subtitle remains'
}
'v7 static verification passed'
```

Expected: `v7 static verification passed`.

- [ ] **Step 6: Leave the deliverable in standard desktop mode**

Restore Standard density and Desktop preview, keep the v7 tab open as the deliverable, and do not stage `.superpowers/`.
