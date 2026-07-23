# Restrained Palette, Taxonomy, and Metadata Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the Tavernary v7 mockup with its approved header identity, deep-teal foundation, three project kinds, and filterable controlled metadata.

**Architecture:** Preserve the existing single-file Companion mockup and its current search, sort, responsive, and density behavior. Add the supplied logo as a local Companion asset, remap presentation through CSS custom properties, collapse every card into the Frontend/Extension/Preset taxonomy, and build the metadata facet from the card chip vocabulary so filter labels and card metadata cannot drift apart.

**Tech Stack:** Static HTML, CSS container queries, vanilla JavaScript, PowerShell contract checks, Node.js syntax checks, and the in-app browser.

## Global Constraints

- `.superpowers/` remains intentionally untracked.
- The exact visible tagline is `Where AI roleplay tools gather`.
- The exact submission label is `Submit Repository`.
- Desktop logo size is `48px × 48px`; mobile logo size is `44px × 44px`.
- Project kinds are only Frontend, Extension, and Preset.
- Extension uses `#E18A24`, Frontend uses `#D62839`, and Preset and fresh activity use `#57C5A3`.
- Missing and Proprietary licenses both use `#6F7E82`; their labels and tooltips remain distinct.
- Functional-category navigation remains neutral.
- Within one filter group, selected values use OR logic. Different groups combine with AND logic.
- No selected filters shows all fourteen mock projects.
- Card chips remain informational; the whole card continues to open its canonical source.
- Standard and compact card contracts, popularity sorting, and the 390 px mobile no-overflow requirement remain unchanged.

---

### Task 1: Header Logo and Identity

**Files:**
- Copy: `C:\Users\Keptin\Downloads\Tavernary-logo.png`
- Create: `.superpowers/brainstorm/1335-1784816109/content/assets/Tavernary-logo.png`
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`

**Interfaces:**
- Consumes: the existing `.brand`, `.brand-mark`, `.brand-name`, `.topbar`, and `.submit` elements.
- Produces: `.brand-logo`, `.brand-copy`, and `.brand-tagline`, with the approved copy and responsive sizing.

- [ ] **Step 1: Run the failing header contract**

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
$asset='.superpowers/brainstorm/1335-1784816109/content/assets/Tavernary-logo.png'
$html=Get-Content -LiteralPath $file -Raw
if(-not (Test-Path -LiteralPath $asset)){throw 'Missing Tavernary logo asset'}
@('class="brand-logo"','assets/Tavernary-logo.png',
  'Where AI roleplay tools gather','>Submit Repository</a>') |
  ForEach-Object { if(-not $html.Contains($_)){throw "Missing $_"} }
```

Expected: FAIL with `Missing Tavernary logo asset`.

- [ ] **Step 2: Copy the supplied transparent logo**

```powershell
$source='C:\Users\Keptin\Downloads\Tavernary-logo.png'
$assetDir='.superpowers/brainstorm/1335-1784816109/content/assets'
New-Item -ItemType Directory -Path $assetDir -Force | Out-Null
Copy-Item -LiteralPath $source -Destination (Join-Path $assetDir 'Tavernary-logo.png') -Force
```

- [ ] **Step 3: Replace the boxed `T` brand markup**

Use:

```html
<a class="brand" href="#" aria-label="Tavernary home">
  <img class="brand-logo" src="assets/Tavernary-logo.png" alt="">
  <span class="brand-copy">
    <span class="brand-name">Tavernary</span>
    <span class="brand-tagline">Where AI roleplay tools gather</span>
  </span>
</a>
```

Change the submission link text to:

```html
<a class="submit" href="#">Submit Repository</a>
```

- [ ] **Step 4: Add the responsive brand styles**

Replace `.brand-mark` styling with:

```css
.brand-logo {
  width: 48px;
  height: 48px;
  flex: none;
  object-fit: contain;
}
.brand-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  line-height: 1;
}
.brand-name { color: #E18A24; }
.brand-tagline {
  margin-top: 5px;
  color: var(--muted);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: .015em;
  white-space: nowrap;
}
.submit {
  border: 1px solid #E18A24;
  color: #E18A24;
  background: var(--surface-2);
}
```

Inside the existing mobile container query, add:

```css
.brand-logo { width: 44px; height: 44px; }
.brand-tagline { display: none; }
```

Keep `.topbar` at `66px`.

- [ ] **Step 5: Run the header contract**

Run Step 1 again.

Expected: PASS with no output.

---

### Task 2: Foundation Palette and Three-Kind Taxonomy

**Files:**
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`

**Interfaces:**
- Consumes: root CSS variables, functional-category controls, `.kind-option`, `.function-symbol`, `.kind`, `.license`, and all fourteen `.repo-card` elements.
- Produces: the approved foundation variables, exactly three kind variables, neutral functional navigation, and cards classified as Frontend, Extension, or Preset.

- [ ] **Step 1: Run the failing palette and taxonomy contract**

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
$html=Get-Content -LiteralPath $file -Raw
$required=@(
  '--bg: #07181D','--surface: #0B2229','--surface-2: #102B33',
  '--surface-3: #173740','--line: #284A52','--line-strong: #3B6068',
  '--text: #F3F1E8','--text-2: #CBD6D3','--muted: #6F7E82',
  '--kind-extension: #E18A24','--kind-frontend: #D62839',
  '--kind-preset: #57C5A3'
)
foreach($item in $required){if(-not $html.Contains($item)){throw "Missing $item"}}
$forbidden=@('--kind-agent','--kind-suite','--kind-library','--kind-prompt',
  'value="agent"','value="suite"','value="library"','value="prompt"',
  'data-kind="suite"','data-kind="library"','var(--pastel-red)')
foreach($item in $forbidden){if($html.Contains($item)){throw "Forbidden $item"}}
if(([regex]::Matches($html,'class="filter-option kind-option"')).Count -ne 3){
  throw 'Project Kind filter must contain exactly three options'
}
```

Expected: FAIL with `Missing --bg: #07181D`.

- [ ] **Step 2: Replace the root palette**

Use these root variables:

```css
:root {
  --bg: #07181D;
  --surface: #0B2229;
  --surface-2: #102B33;
  --surface-3: #173740;
  --line: #284A52;
  --line-strong: #3B6068;
  --text: #F3F1E8;
  --text-2: #CBD6D3;
  --muted: #6F7E82;
  --faint: #6F7E82;
  --accent: #F3F1E8;
  --accent-ink: #07181D;
  --focus: #CBD6D3;
  --kind-extension: #E18A24;
  --kind-frontend: #D62839;
  --kind-preset: #57C5A3;
  --mint: #57C5A3;
  --radius: 8px;
  --sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

Remove the agent, suite, library, prompt, and pastel-red variables. Replace
hard-coded opaque charcoal UI surfaces with the nearest approved foundation
variable. Transparent shadows and color mixes may derive from the approved
colors.

- [ ] **Step 3: Neutralize functional-category navigation**

Keep default functional-category icons and labels at `var(--muted)`, hover at
`var(--text-2)` on `var(--surface-2)`, and selected state at `var(--text)` on
`var(--surface-3)` with `var(--line-strong)`. Remove category-specific inline
colors or CSS custom properties from desktop and mobile category controls.

- [ ] **Step 4: Limit Project Kind filters to three options**

Replace the Project Kind group body with:

```html
<div class="filter-option kind-option" style="--kind-color:var(--kind-frontend)"><label><input type="checkbox" value="frontend"><span class="kind-box" aria-hidden="true"></span>Frontend</label><span class="count">2</span></div>
<div class="filter-option kind-option" style="--kind-color:var(--kind-extension)"><label><input type="checkbox" value="extension"><span class="kind-box" aria-hidden="true"></span>Extension</label><span class="count">10</span></div>
<div class="filter-option kind-option" style="--kind-color:var(--kind-preset)"><label><input type="checkbox" value="preset"><span class="kind-box" aria-hidden="true"></span>Preset</label><span class="count">2</span></div>
```

- [ ] **Step 5: Reclassify the mock cards**

Use this exact mapping:

```text
Lumiverse: frontend
Marinara Engine: frontend
Memory Books: extension
Recursion: extension
Directive: extension
CarrotKernel: extension
VectFox: extension
Chat Top Bar: extension
LALib: extension
Polyceph: extension
Smart Memory: extension
RPG Companion: extension
Celia V5.4: preset
Marinara's Essentials: preset
```

For Directive, LALib, and RPG Companion, replace their old kind variable,
`data-kind`, and visible `.kind` text with Extension equivalents. Keep their
functional symbols and `data-category` values unchanged because those express
function, not project kind.

- [ ] **Step 6: Apply restrained color semantics**

Use:

```css
.function-symbol {
  border-color: var(--kind-color);
  color: var(--kind-color);
  background: color-mix(in srgb, var(--kind-color) 10%, var(--surface-3));
}
.kind { color: var(--text-2); }
.license.osi { color: var(--text-2); }
.license.missing,
.license.proprietary { color: var(--muted); }
.preset-version { color: var(--kind-preset); }
```

Keep the existing dotted underline on Missing so it remains visually distinct
from Proprietary. Preserve all license tooltips.

- [ ] **Step 7: Run palette, taxonomy, and JavaScript contracts**

Run Step 1, then:

```powershell
$html=Get-Content -LiteralPath '.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html' -Raw
$script=[regex]::Match($html,'<script>([\s\S]*?)</script>').Groups[1].Value
$temp=Join-Path $env:TEMP 'tavernary-v7-palette.js'
Set-Content -LiteralPath $temp -Value $script -Encoding utf8
node --check $temp
```

Expected: both commands exit 0.

---

### Task 3: Filterable Metadata Facet

**Files:**
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`

**Interfaces:**
- Consumes: `.chip:not(.frontend)` labels as the controlled metadata vocabulary, `cards`, `updateResults()`, `updateQueryChips()`, and `updateFilterCount()`.
- Produces: `#metadata-search`, `#metadata-options`, `metadataChecks`, `selectedMetadata()`, `buildMetadataFilters()`, and `updateMetadataList()`.

- [ ] **Step 1: Run the failing metadata-filter contract**

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
$html=Get-Content -LiteralPath $file -Raw
@('id="metadata-search"','id="metadata-options"',
  'function buildMetadataFilters()','function selectedMetadata()',
  'function updateMetadataList()','metadataMatch') |
  ForEach-Object { if(-not $html.Contains($_)){throw "Missing $_"} }
```

Expected: FAIL with `Missing id="metadata-search"`.

- [ ] **Step 2: Add the metadata filter shell**

Insert this group after Project Kind:

```html
<div class="filter-group">
  <h3>Capabilities &amp; characteristics</h3>
  <input class="metadata-search" id="metadata-search" type="search"
    placeholder="Search metadata…" aria-label="Search capabilities and characteristics">
  <div class="metadata-options" id="metadata-options"></div>
</div>
```

Add:

```css
.metadata-search {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--text);
  background: var(--bg);
  outline: none;
}
.metadata-search:focus { border-color: var(--line-strong); }
.metadata-options {
  max-height: 190px;
  margin-top: 8px;
  overflow-y: auto;
  scrollbar-color: var(--line-strong) var(--surface);
}
.metadata-option.filtered-out { display: none; }
```

- [ ] **Step 3: Build filter options from controlled card chips**

Add these bindings beside the existing frontend and kind filter bindings:

```js
const metadataSearch = document.getElementById("metadata-search");
const metadataOptions = document.getElementById("metadata-options");
let metadataChecks = [];
```

Add:

```js
function tagKey(label) {
  return label.trim().toLowerCase();
}

function buildMetadataFilters() {
  const index = new Map();
  cards.forEach((card) => {
    card.querySelectorAll(".chip:not(.frontend)").forEach((chip) => {
      const label = chip.textContent.trim();
      const key = tagKey(label);
      const entry = index.get(key) || { label, count: 0 };
      entry.count += 1;
      index.set(key, entry);
    });
  });

  [...index.entries()]
    .sort((left, right) => left[1].label.localeCompare(right[1].label))
    .forEach(([key, entry]) => {
      const row = document.createElement("div");
      row.className = "filter-option metadata-option";
      row.dataset.name = entry.label;
      row.innerHTML = `<label><input type="checkbox" value="${key}"> ${entry.label}</label><span class="count">${entry.count}</span>`;
      metadataOptions.appendChild(row);
    });

  metadataChecks = [...metadataOptions.querySelectorAll("input")];
  metadataChecks.forEach((input) => {
    input.addEventListener("change", () => {
      updateMetadataList();
      updateQueryChips();
      updateResults();
      updateFilterCount();
    });
  });
}

function selectedMetadata() {
  return new Set(
    metadataChecks.filter((input) => input.checked).map((input) => input.value)
  );
}

function updateMetadataList() {
  const query = metadataSearch.value.trim().toLowerCase();
  document.querySelectorAll(".metadata-option").forEach((row) => {
    const selected = row.querySelector("input").checked;
    row.classList.toggle("selected", selected);
    row.classList.toggle(
      "filtered-out",
      Boolean(query) && !row.dataset.name.toLowerCase().includes(query)
    );
  });
}
```

The controlled vocabulary is the maintained chip markup. Do not import
freeform GitHub topics.

- [ ] **Step 4: Add OR-within and AND-between filtering**

In `updateResults()`, create:

```js
const selectedTags = selectedMetadata();
```

For each card, create:

```js
const cardTags = new Set(
  [...card.querySelectorAll(".chip:not(.frontend)")].map((chip) =>
    tagKey(chip.textContent)
  )
);
const metadataMatch = selectedTags.size === 0
  || [...selectedTags].some((tag) => cardTags.has(tag));
```

Set visibility with:

```js
const visible = categoryMatch
  && searchMatch
  && frontendMatch
  && kindMatch
  && metadataMatch;
```

This is OR among metadata selections and AND against category, search,
frontend, and kind selections.

- [ ] **Step 5: Add removable metadata query chips**

Make the opening cleanup in `updateQueryChips()` remove:

```js
activeQuery.querySelectorAll(
  ".frontend-query, .kind-query, .metadata-query"
).forEach((chip) => chip.remove());
```

After the Project Kind chip loop, add:

```js
metadataChecks.filter((input) => input.checked).forEach((input) => {
  const label = input.closest(".metadata-option").dataset.name;
  const chip = document.createElement("span");
  chip.className = "query-chip metadata-query";
  chip.innerHTML = `${label} <button type="button" aria-label="Remove ${label} filter">×</button>`;
  chip.querySelector("button").addEventListener("click", () => {
    input.checked = false;
    updateMetadataList();
    updateQueryChips();
    updateResults();
    updateFilterCount();
  });
  activeQuery.appendChild(chip);
});
```

- [ ] **Step 6: Initialize and clear metadata state**

Add:

```js
metadataSearch.addEventListener("input", updateMetadataList);
```

Before the existing final `updateFrontendList()` call, initialize:

```js
buildMetadataFilters();
updateMetadataList();
```

In the Clear all handler, add:

```js
metadataSearch.value = "";
updateMetadataList();
```

The generated metadata checkboxes use their own change listeners above, which
update results, query chips, option state, and the shared filter count.

- [ ] **Step 7: Run metadata and JavaScript contracts**

Run Step 1, then:

```powershell
$html=Get-Content -LiteralPath '.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html' -Raw
$script=[regex]::Match($html,'<script>([\s\S]*?)</script>').Groups[1].Value
$temp=Join-Path $env:TEMP 'tavernary-v7-metadata.js'
Set-Content -LiteralPath $temp -Value $script -Encoding utf8
node --check $temp
```

Expected: both commands exit 0.

---

### Task 4: Browser and Regression Verification

**Files:**
- Verify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`
- Verify: `.superpowers/brainstorm/1335-1784816109/content/assets/Tavernary-logo.png`

**Interfaces:**
- Consumes: the completed v7 Companion mockup.
- Produces: visual and interaction evidence that identity, palette, taxonomy, metadata filtering, density, and responsive behavior work together.

- [ ] **Step 1: Verify standard desktop identity and palette**

Check:

- the transparent bottle logo is visually legible at `48px`;
- the top bar remains `66px` high;
- the tagline reads exactly `Where AI roleplay tools gather`;
- `Submit Repository` is orange and correctly capitalized;
- page, surfaces, cards, borders, and text use the approved deep-teal foundation;
- functional-category controls remain neutral;
- only type symbols and Project Kind checkbox outlines use project-kind accents;
- Frontend is crimson, Extension is orange, and Preset is mint;
- OSI licenses use secondary text while Missing and Proprietary use the same
  muted gray with distinct labels and tooltips.

- [ ] **Step 2: Verify taxonomy**

Check:

- Project Kind contains exactly Frontend, Extension, and Preset;
- counts are 2, 10, and 2;
- Directive, LALib, and RPG Companion display Extension;
- Suite, Agent Framework, Shared Library, Dependency, and related distinctions
  remain available as metadata where present rather than project kinds.

- [ ] **Step 3: Verify metadata filter logic**

Check:

- searching metadata narrows only the filter-option list, not catalog results;
- selecting `Prompt ordering` and `Character roleplay` shows the OR union;
- also selecting Project Kind `Preset` preserves both matching preset cards,
  demonstrating AND between groups;
- selecting an incompatible Project Kind produces the empty state;
- removable query chips clear their associated metadata checkboxes;
- Clear all restores all fourteen projects;
- card chips themselves remain informational and whole-card navigation still
  opens the canonical source.

- [ ] **Step 4: Verify standard and compact mobile**

Switch to Mobile and check:

- the logo is `44px` and the tagline is hidden;
- the 390 px preview has no horizontal overflow;
- the filter drawer contains the searchable metadata section;
- the filter, All/Active/New/Released, and sort controls still share one row;
- Standard cards retain summaries and two chip rows;
- Compact cards retain one chip row, hide summaries/community/size, and keep
  license labels visible.

- [ ] **Step 5: Run the final static contract**

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
$asset='.superpowers/brainstorm/1335-1784816109/content/assets/Tavernary-logo.png'
$html=Get-Content -LiteralPath $file -Raw
$required=@(
  'Where AI roleplay tools gather','>Submit Repository</a>',
  '--bg: #07181D','--kind-extension: #E18A24',
  '--kind-frontend: #D62839','--kind-preset: #57C5A3',
  'id="metadata-options"','function buildMetadataFilters()','metadataMatch'
)
foreach($item in $required){if(-not $html.Contains($item)){throw "Missing $item"}}
if(-not (Test-Path -LiteralPath $asset)){throw 'Missing Tavernary logo asset'}
if(([regex]::Matches($html,'class="filter-option kind-option"')).Count -ne 3){
  throw 'Project Kind filter must contain exactly three options'
}
'Tavernary palette, taxonomy, and metadata verification passed'
```

Expected: `Tavernary palette, taxonomy, and metadata verification passed`.

- [ ] **Step 6: Leave the deliverable open**

Restore Standard density and Desktop preview. Keep v7 open as the deliverable
and do not stage `.superpowers/`.
