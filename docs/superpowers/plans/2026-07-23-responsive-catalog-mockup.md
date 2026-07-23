# Responsive Catalog Mockup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the approved Tavernary catalog mockup with optional Popularity sorting, scrollbar-free responsive navigation, a compact mobile layout, and a mockup-only Desktop/Mobile preview control.

**Architecture:** Create a new visual-companion HTML iteration from the approved v5 mockup. Keep all behavior self-contained in that HTML file: DOM data attributes provide sort inputs, container queries provide real width-driven responsiveness, and a preview toolbar changes the catalog container width to exercise the same responsive rules without changing the browser window.

**Tech Stack:** Semantic HTML, CSS Grid, CSS container queries, vanilla JavaScript, the existing Brainstorm Companion server, and Playwright with the installed Chrome executable for visual and interaction verification.

## Global Constraints

- Keep `Recently active` as the default sort.
- Popularity is optional and uses `stargazers_count + forks_count + subscribers_count`.
- Popularity ties preserve the prior stable order.
- Projects without GitHub community data are unscored and sort after scored projects, not as zero.
- Desktop and tablet show eight equal-width function categories without a native horizontal scrollbar.
- Mobile uses a compact `Browse: All Projects` selector.
- Mobile filters use a full-width slide-over with an active-filter count.
- Mobile uses one project-card column without dropping tile metadata.
- The `Desktop | Mobile` control is visibly mockup-only and is not part of the production design.
- Mobile preview width is exactly `390px`.
- Preserve four-line summaries, two visible chip rows, license colors, tooltip behavior, frontend OR filtering, and project-kind filtering.
- Create a new mockup filename; do not overwrite the approved v5 file.
- Keep `.superpowers/` untracked.

---

### Task 1: Create the v6 Mockup and Add Popularity Sorting

**Files:**
- Source: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-presets-community-v5.html`
- Create: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v6.html`

**Interfaces:**
- Consumes: existing `.repo-card` elements and each card's `.community[data-stars][data-forks][data-watchers]`.
- Produces: `getCommunityScore(card): number | null`, `applySort(): void`, `#sort-projects`, and stable `data-original-order` values.

- [ ] **Step 1: Copy v5 to a new v6 mockup**

Run:

```powershell
Copy-Item -LiteralPath '.superpowers/brainstorm/1335-1784816109/content/catalog-wall-presets-community-v5.html' -Destination '.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v6.html'
```

Expected: `catalog-wall-responsive-v6.html` exists and v5 remains unchanged.

- [ ] **Step 2: Run the failing static sort check**

Run:

```powershell
$p='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v6.html'
$h=Get-Content -LiteralPath $p -Raw
if ($h -notmatch 'id="sort-projects"') { throw 'Missing sort control id' }
if ($h -notmatch 'value="popularity"') { throw 'Missing Popularity option' }
if ($h -notmatch 'function getCommunityScore') { throw 'Missing score function' }
if ($h -notmatch 'function applySort') { throw 'Missing sort function' }
```

Expected: FAIL with `Missing sort control id`.

- [ ] **Step 3: Give the sort control explicit values**

Replace the mock sort select with:

```html
<select class="sort" id="sort-projects" aria-label="Sort projects">
  <option value="recent">Recently active</option>
  <option value="popularity">Popularity</option>
  <option value="alphabetical">Alphabetical</option>
</select>
```

- [ ] **Step 4: Add stable sorting behavior**

Add beside the existing DOM references:

```js
const tileGrid = document.getElementById("tile-grid");
const sortSelect = document.getElementById("sort-projects");

cards.forEach((card, index) => {
  card.dataset.originalOrder = String(index);
});

function getCommunityScore(card) {
  const community = card.querySelector(".community");
  if (!community) return null;
  return Number(community.dataset.stars)
    + Number(community.dataset.forks)
    + Number(community.dataset.watchers);
}

function applySort() {
  const mode = sortSelect.value;
  const ordered = [...cards].sort((left, right) => {
    const stable = Number(left.dataset.originalOrder)
      - Number(right.dataset.originalOrder);

    if (mode === "alphabetical") {
      const leftTitle = left.querySelector(".card-title").textContent.trim();
      const rightTitle = right.querySelector(".card-title").textContent.trim();
      return leftTitle.localeCompare(rightTitle) || stable;
    }

    if (mode === "popularity") {
      const leftScore = getCommunityScore(left);
      const rightScore = getCommunityScore(right);
      if (leftScore === null && rightScore === null) return stable;
      if (leftScore === null) return 1;
      if (rightScore === null) return -1;
      return rightScore - leftScore || stable;
    }

    return stable;
  });

  ordered.forEach((card) => tileGrid.appendChild(card));
}

sortSelect.addEventListener("change", applySort);
applySort();
```

- [ ] **Step 5: Re-run the static sort check**

Run the command from Step 2.

Expected: PASS with no output.

- [ ] **Step 6: Verify sorting in a browser**

Use Playwright against the companion URL and evaluate:

```js
const original = await page.locator(".card-title").allTextContents();
await page.selectOption("#sort-projects", "popularity");
const popular = await page.locator(".card-title").allTextContents();
await page.selectOption("#sort-projects", "recent");
const restored = await page.locator(".card-title").allTextContents();

if (popular[0] !== "Lumiverse") throw new Error("Popularity did not rank the highest aggregate first");
if (popular.slice(-2).join("|") !== "Celia V5.4|Marinara’s Essentials") {
  throw new Error("Unscored presets were not placed last");
}
if (restored.join("|") !== original.join("|")) {
  throw new Error("Recently active did not restore stable order");
}
```

Expected: all assertions pass.

### Task 2: Remove Desktop Overflow and Add the Mobile Category Selector

**Files:**
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v6.html`

**Interfaces:**
- Consumes: existing `.category[data-category]` buttons, SVG function symbols, and `activeCategory`.
- Produces: `#mobile-category-menu`, `.mobile-category-option`, `selectCategory(category): void`, and container-query responsive behavior.

- [ ] **Step 1: Run the failing navigation check**

Run:

```powershell
$p='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v6.html'
$h=Get-Content -LiteralPath $p -Raw
if ($h -notmatch 'repeat\(8,\s*minmax\(0,\s*1fr\)\)') { throw 'Desktop categories can still overflow' }
if ($h -notmatch 'id="mobile-category-menu"') { throw 'Missing mobile category selector' }
if ($h -notmatch '@container site \(max-width: 760px\)') { throw 'Missing mobile container query' }
```

Expected: FAIL.

- [ ] **Step 2: Make the catalog a named responsive container**

Insert `<div class="site-preview" id="site-preview">` immediately before
`<header class="topbar">`, and insert its closing `</div>` immediately after
the existing `.workspace` closing tag.

```html
<div class="site-preview" id="site-preview">
  <header class="topbar">
```

The end of the wrapper must be:

```html
  </div>
</div>

<script>
```

Add:

```css
.site-preview {
  width: 100%;
  min-height: 100vh;
  position: relative;
  container: site / inline-size;
  background: var(--bg);
}
```

- [ ] **Step 3: Remove the desktop horizontal overflow**

Change the category strip to:

```css
.category-strip {
  min-height: 72px;
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  align-items: stretch;
  gap: 8px;
  padding: 9px 20px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
  overflow: hidden;
}

.category {
  min-width: 0;
  width: 100%;
}
```

- [ ] **Step 4: Add the mobile category selector**

Insert after the desktop category strip:

```html
<details class="mobile-category" id="mobile-category-menu">
  <summary id="mobile-category-trigger">
    <span class="mobile-category-label">
      <span id="mobile-category-icon"><span class="all-symbol"><i></i><i></i><i></i><i></i></span></span>
      <span><small>Browse</small><b id="mobile-category-current">All Projects</b></span>
    </span>
    <svg class="icon"><use href="#i-chevron"/></svg>
  </summary>
  <div class="mobile-category-options">
    <button class="mobile-category-option active" type="button" data-category="all"><span class="all-symbol"><i></i><i></i><i></i><i></i></span><span>All Projects</span></button>
    <button class="mobile-category-option" type="button" data-category="frontend"><svg class="icon"><use href="#i-frontend"/></svg><span>Frontends</span></button>
    <button class="mobile-category-option" type="button" data-category="memory"><svg class="icon"><use href="#i-memory"/></svg><span>Memory & Retrieval</span></button>
    <button class="mobile-category-option" type="button" data-category="generation"><svg class="icon"><use href="#i-generation"/></svg><span>Generation & Reasoning</span></button>
    <button class="mobile-category-option" type="button" data-category="authoring"><svg class="icon"><use href="#i-authoring"/></svg><span>Character & World Authoring</span></button>
    <button class="mobile-category-option" type="button" data-category="rpg"><svg class="icon"><use href="#i-rpg"/></svg><span>RPG Systems & Suites</span></button>
    <button class="mobile-category-option" type="button" data-category="interface"><svg class="icon"><use href="#i-interface"/></svg><span>Interface & Workflow</span></button>
    <button class="mobile-category-option" type="button" data-category="dev"><svg class="icon"><use href="#i-dev"/></svg><span>Developer Infrastructure</span></button>
  </div>
</details>
```

Add:

```css
.mobile-category { display: none; }

@container site (max-width: 760px) {
  .category-strip { display: none; }
  .mobile-category {
    display: block;
    position: relative;
    padding: 9px 13px;
    border-bottom: 1px solid var(--line);
    background: var(--surface);
  }
  .mobile-category summary {
    min-height: 42px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    border: 1px solid var(--line-strong);
    border-radius: 7px;
    color: var(--text);
    background: var(--surface-3);
    cursor: pointer;
    list-style: none;
  }
  .mobile-category summary::-webkit-details-marker { display: none; }
  .mobile-category-label,
  .mobile-category-option {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .mobile-category-label small {
    display: block;
    color: var(--muted);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  .mobile-category-label b { font-size: 12px; }
  .mobile-category-options {
    display: grid;
    gap: 4px;
    position: absolute;
    top: calc(100% - 5px);
    right: 13px;
    left: 13px;
    z-index: 70;
    padding: 7px;
    border: 1px solid var(--line-strong);
    border-radius: 7px;
    background: #0b0d0e;
    box-shadow: 0 16px 38px rgba(0,0,0,.5);
  }
  .mobile-category-option {
    min-height: 40px;
    padding: 7px 9px;
    border: 0;
    border-radius: 5px;
    color: var(--muted);
    background: transparent;
    text-align: left;
  }
  .mobile-category-option:hover,
  .mobile-category-option.active {
    color: var(--text);
    background: var(--surface-3);
  }
}
```

- [ ] **Step 5: Share category selection behavior**

Refactor the category click handler to:

```js
const mobileCategoryMenu = document.getElementById("mobile-category-menu");
const mobileCategoryCurrent = document.getElementById("mobile-category-current");
const mobileCategoryIcon = document.getElementById("mobile-category-icon");
const mobileCategoryOptions = [...document.querySelectorAll(".mobile-category-option")];

function selectCategory(category) {
  activeCategory = category;
  categories.forEach((item) => {
    item.classList.toggle("active", item.dataset.category === category);
  });
  mobileCategoryOptions.forEach((item) => {
    item.classList.toggle("active", item.dataset.category === category);
  });
  const selected = mobileCategoryOptions.find((item) => item.dataset.category === category);
  mobileCategoryCurrent.textContent = selected.querySelector("span:last-child").textContent;
  mobileCategoryIcon.replaceChildren(selected.firstElementChild.cloneNode(true));
  mobileCategoryMenu.open = false;
  updateResults();
}

categories.forEach((button) => {
  button.addEventListener("click", () => selectCategory(button.dataset.category));
});

mobileCategoryOptions.forEach((button) => {
  button.addEventListener("click", () => selectCategory(button.dataset.category));
});
```

Replace the Clear All category-reset statements with:

```js
selectCategory("all");
```

- [ ] **Step 6: Verify desktop widths and mobile selection**

Use Playwright:

```js
const widths = await page.locator(".category").evaluateAll((elements) =>
  elements.map((element) => Math.round(element.getBoundingClientRect().width))
);
if (new Set(widths).size !== 1) throw new Error("Desktop categories are not equal width");
if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) {
  throw new Error("Desktop page still has horizontal overflow");
}

await page.evaluate(() => document.getElementById("site-preview").style.width = "390px");
await page.click("#mobile-category-trigger");
await page.click('.mobile-category-option[data-category="memory"]');
if (await page.locator("#result-count").textContent() !== "3") {
  throw new Error("Mobile category selection did not filter results");
}
```

Expected: equal widths, no desktop overflow, and the mobile selector changes the result set.

### Task 3: Add Preview Controls and Complete the Mobile Layout

**Files:**
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v6.html`

**Interfaces:**
- Consumes: `#site-preview`, existing `.filter-toggle`, `.filters`, and all filter inputs.
- Produces: `setPreviewMode(mode): void`, `#preview-desktop`, `#preview-mobile`, `#filter-count`, `.filter-close`, and `updateFilterCount(): void`.

- [ ] **Step 1: Run the failing preview-control check**

Run:

```powershell
$p='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v6.html'
$h=Get-Content -LiteralPath $p -Raw
if ($h -notmatch 'id="preview-desktop"') { throw 'Missing Desktop preview button' }
if ($h -notmatch 'id="preview-mobile"') { throw 'Missing Mobile preview button' }
if ($h -notmatch 'function setPreviewMode') { throw 'Missing preview mode function' }
if ($h -notmatch 'id="filter-count"') { throw 'Missing filter count' }
```

Expected: FAIL.

- [ ] **Step 2: Add the mockup-only preview toolbar**

Place before `#site-preview`:

```html
<aside class="preview-toolbar" aria-label="Mockup viewport preview">
  <span>Mockup preview</span>
  <div class="preview-tabs">
    <button class="active" id="preview-desktop" type="button">Desktop</button>
    <button id="preview-mobile" type="button">Mobile</button>
  </div>
</aside>
```

Add:

```css
.preview-toolbar {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  position: sticky;
  top: 0;
  z-index: 200;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  background: #090a0b;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .08em;
}
.preview-tabs {
  display: flex;
  padding: 3px;
  border: 1px solid var(--line-strong);
  border-radius: 7px;
  background: var(--surface);
}
.preview-tabs button {
  padding: 6px 10px;
  border: 0;
  border-radius: 4px;
  color: var(--muted);
  background: transparent;
  cursor: pointer;
}
.preview-tabs button.active {
  color: var(--text);
  background: var(--surface-3);
}
body.previewing-mobile {
  background:
    linear-gradient(45deg, #111 25%, transparent 25%) 0 0 / 20px 20px,
    linear-gradient(45deg, transparent 75%, #111 75%) 0 0 / 20px 20px,
    #0a0b0c;
}
body.previewing-mobile .site-preview {
  width: 390px;
  margin: 18px auto 60px;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  box-shadow: 0 24px 70px rgba(0,0,0,.55);
}
```

- [ ] **Step 3: Add preview-mode behavior**

Add:

```js
const desktopPreview = document.getElementById("preview-desktop");
const mobilePreview = document.getElementById("preview-mobile");

function setPreviewMode(mode) {
  const mobile = mode === "mobile";
  document.body.classList.toggle("previewing-mobile", mobile);
  desktopPreview.classList.toggle("active", !mobile);
  mobilePreview.classList.toggle("active", mobile);
  desktopPreview.setAttribute("aria-pressed", String(!mobile));
  mobilePreview.setAttribute("aria-pressed", String(mobile));
}

desktopPreview.addEventListener("click", () => setPreviewMode("desktop"));
mobilePreview.addEventListener("click", () => setPreviewMode("mobile"));
setPreviewMode("desktop");
```

- [ ] **Step 4: Make the mobile header, toolbar, cards, and filter drawer responsive**

Replace the existing mobile media block with a `@container site (max-width: 760px)` block containing:

```css
.topbar {
  height: auto;
  grid-template-columns: 1fr auto;
  gap: 10px;
  padding: 11px 13px;
}
.global-search {
  grid-column: 1 / -1;
  grid-row: 2;
}
.top-link { display: none; }
.top-actions .submit { padding-inline: 8px; }
.workspace { display: block; min-height: 0; }
.filters {
  display: none;
  position: absolute;
  inset: 0;
  z-index: 80;
  padding: 20px 18px 50px;
  overflow-y: auto;
  border: 0;
  background: rgba(13,15,16,.98);
}
.filters.open {
  display: block;
  animation: filter-in .16s ease-out;
}
.filter-close { display: block; }
.catalog { padding: 16px 13px 50px; }
.catalog-toolbar {
  align-items: flex-start;
  flex-direction: column;
}
.catalog-controls {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
}
.filter-toggle { display: block; }
.view-tabs {
  grid-column: 1 / -1;
  width: 100%;
  justify-content: stretch;
}
.view-tabs button { flex: 1; }
.sort { width: 100%; }
.tile-grid { grid-template-columns: 1fr; }
.repo-card { min-height: 248px; }
```

Also add:

```css
@keyframes filter-in {
  from { opacity: 0; transform: translateX(-12px); }
}
```

- [ ] **Step 5: Add a drawer close control and active-filter count**

Replace the filter heading with:

```html
<div class="filter-head">
  <strong>Filters</strong>
  <div class="filter-head-actions">
    <button class="clear" type="button">Clear all</button>
    <button class="filter-close" type="button">Close</button>
  </div>
</div>
```

Add desktop defaults:

```css
.filter-head-actions { display: flex; align-items: center; gap: 10px; }
.filter-close {
  display: none;
  border: 0;
  color: var(--text-2);
  background: transparent;
  cursor: pointer;
}
```

Change the filter button to:

```html
<button class="filter-toggle" type="button">
  Filters <span id="filter-count" hidden>0</span>
</button>
```

Add:

```js
const filterCount = document.getElementById("filter-count");
const filterClose = document.querySelector(".filter-close");

function updateFilterCount() {
  const total = [...document.querySelectorAll(".filters input[type='checkbox']")]
    .filter((input) => input.checked).length;
  filterCount.textContent = String(total);
  filterCount.hidden = total === 0;
}

document.querySelector(".filter-toggle").addEventListener("click", () => {
  filters.classList.add("open");
});
filterClose.addEventListener("click", () => filters.classList.remove("open"));

document.querySelectorAll(".filters input[type='checkbox']").forEach((input) => {
  input.addEventListener("change", updateFilterCount);
});
```

Add this final line inside the existing Clear All click handler:

```js
updateFilterCount();
```

Remove the previous filter-toggle handler that merely toggled `.open`, then
initialize the count once:

```js
updateFilterCount();
```

- [ ] **Step 6: Re-run static checks and JavaScript parsing**

Run:

```powershell
$p='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v6.html'
$h=Get-Content -LiteralPath $p -Raw
@(
  'id="sort-projects"',
  'value="popularity"',
  'function getCommunityScore',
  'function applySort',
  'repeat\(8,\s*minmax\(0,\s*1fr\)\)',
  'id="mobile-category-menu"',
  '@container site \(max-width: 760px\)',
  'id="preview-desktop"',
  'id="preview-mobile"',
  'function setPreviewMode',
  'id="filter-count"',
  'class="filter-close"'
) | ForEach-Object {
  if ($h -notmatch $_) { throw "Missing required mockup contract: $_" }
}
node -e "const fs=require('fs');const h=fs.readFileSync('$p','utf8');new Function(h.split('<script>').at(-1).split('</script>')[0]);console.log('JavaScript syntax OK');"
```

Expected: all static checks pass and output includes `JavaScript syntax OK`.

- [ ] **Step 7: Run complete desktop and mobile browser verification**

Use Playwright at `1440x1000`:

```js
if ((await page.locator(".repo-card").count()) !== 14) throw new Error("Expected 14 cards");

await page.click("#preview-mobile");
const frameWidth = await page.locator("#site-preview").evaluate((element) =>
  Math.round(element.getBoundingClientRect().width)
);
if (frameWidth !== 390) throw new Error(`Expected 390px mobile preview, got ${frameWidth}`);
if (await page.locator(".mobile-category").evaluate((element) =>
  getComputedStyle(element).display === "none"
)) throw new Error("Mobile category selector is hidden");
if (await page.locator(".category-strip").evaluate((element) =>
  getComputedStyle(element).display !== "none"
)) throw new Error("Desktop categories remain visible in mobile preview");
if ((await page.locator(".repo-card").first().evaluate((element) =>
  Math.round(element.getBoundingClientRect().width)
)) < 350) throw new Error("Mobile card is unexpectedly narrow");

await page.click(".filter-toggle");
if (!(await page.locator(".filters").evaluate((element) =>
  element.classList.contains("open")
))) throw new Error("Mobile filter drawer did not open");
await page.click(".filter-close");
if (await page.locator(".filters").evaluate((element) =>
  element.classList.contains("open")
)) throw new Error("Mobile filter drawer did not close");

await page.click("#preview-desktop");
if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) {
  throw new Error("Desktop preview has horizontal overflow");
}
```

Expected: every assertion passes.

- [ ] **Step 8: Perform visual QA**

Capture and inspect:

1. Desktop at `1440x1000`.
2. Desktop at `1180x800` to confirm no category scrollbar.
3. Mobile preview at `390px` with filters closed.
4. Mobile preview at `390px` with the filter drawer open.
5. Popularity-selected desktop view.

Confirm:

- no clipped category labels;
- no native horizontal scrollbar;
- no card overflow;
- no tooltip clipping at the preview-frame edge;
- the preview toolbar is visually distinct from the production-shaped site;
- mobile controls have usable tap targets;
- Popularity sorting does not change the result count or active filters.

- [ ] **Step 9: Leave the companion ready for review**

Confirm the Brainstorm Companion returns HTTP 200 and provide the complete keyed URL. Do not stage `.superpowers/`.
