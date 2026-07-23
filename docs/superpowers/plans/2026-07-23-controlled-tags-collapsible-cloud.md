# Controlled Tags and Collapsible Cloud Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v7 mock catalog's 48 project-specific capability labels with the approved 18-tag controlled vocabulary and limit the initial capability filter cloud to four rendered rows with an exact expand/collapse count.

**Architecture:** Preserve the existing single-file mockup and generate the filter directly from literal card-chip labels, maintaining the approved one-to-one contract. Add one stateful disclosure control beneath the existing cloud. A small layout function sorts selected/common tags, measures actual wrapped rows, hides only overflow rows, and reruns after selection, search, resize, or preview-mode changes.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, PowerShell contract checks, Node.js syntax checks, and the in-app browser.

## Global Constraints

- Modify only `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`.
- `.superpowers/` remains intentionally ignored and must not be staged.
- Leave the unrelated untracked `data/` directory untouched.
- Use exactly the 18 labels in `docs/superpowers/specs/2026-07-23-controlled-tag-taxonomy-design.md`.
- Card and filter labels are literal and one-to-one; do not add aliases or a mapping layer.
- Compatible frontends remain separate leading card chips.
- Project kind remains separate.
- Preserve metadata-filter OR logic and its AND relationship with every other facet.
- Preserve removable query chips, `Clear all`, desktop/mobile parity, card density behavior, and the lack of an inner metadata scrollbar.
- Selected tags remain visible when collapsed. If selected tags require more than four rows, selection visibility takes priority.
- Metadata search affects the option cloud only until the user selects a tag.
- The disclosure copy is `+ N more tags` when collapsed and `Show fewer tags` when expanded.
- Search suppresses the disclosure control and temporarily reveals every matching tag.

---

### Task 1: Replace Project-Specific Labels with the Controlled Vocabulary

**Files:**
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`
- Reference: `docs/superpowers/specs/2026-07-23-controlled-tag-taxonomy-design.md`

**Interfaces:**
- Consumes: `.repo-card`, `.chip:not(.frontend)`, `buildMetadataFilters()`, `tagKey()`, and `capabilityTips`.
- Produces: exactly 18 possible literal capability labels, the approved assignments for all 14 mock projects, and matching tooltip text.

- [ ] **Step 1: Run the failing controlled-vocabulary contract**

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
$html=Get-Content -LiteralPath $file -Raw
$allowed=@(
  'Memory & Retrieval',
  'Planning & Reasoning',
  'Model Routing',
  'Review & Validation',
  'State & Simulation',
  'Campaigns & RPG',
  'Character & Worldbuilding',
  'Prompt Engineering',
  'Text Processing',
  'Interface & Navigation',
  'Developer Tools',
  'Extension Development',
  'Automation',
  'Agents',
  'Multi-user',
  'External Service',
  'Deprecated',
  'Adult Content'
)
$cards=[regex]::Matches($html,'(?s)<article class="repo-card".*?</article>')
$actual=@(
  $cards | ForEach-Object {
    [regex]::Matches($_.Value,'<span class="chip(?! frontend)[^"]*">([^<]+)</span>') |
      ForEach-Object { $_.Groups[1].Value.Trim() }
  } | Sort-Object -Unique
)
$unexpected=@($actual | Where-Object { $_ -notin $allowed })
$missing=@($allowed | Where-Object { $_ -notin $actual })
if(-not $unexpected.Count -and -not $missing.Count){
  throw 'Expected old project-specific tags before implementation'
}
"RED: unexpected=$($unexpected.Count), missing=$($missing.Count)"
```

Expected: output beginning with `RED:` because the current cards contain 41
singleton or project-specific labels and do not contain the full approved set.

- [ ] **Step 2: Replace every card's non-frontend chip sequence**

Keep each card's leading frontend chips unchanged. Replace only the remaining
capability chips with these exact sequences:

```html
<!-- Lumiverse -->
<span class="chip">Developer Tools</span><span class="chip">Extension Development</span><span class="chip">Automation</span>

<!-- Marinara Engine -->
<span class="chip">Agents</span><span class="chip">State &amp; Simulation</span><span class="chip">Extension Development</span>

<!-- Memory Books -->
<span class="chip">Memory &amp; Retrieval</span><span class="chip">Review &amp; Validation</span><span class="chip">Automation</span>

<!-- Recursion -->
<span class="chip">Planning &amp; Reasoning</span><span class="chip">Model Routing</span><span class="chip">Review &amp; Validation</span><span class="chip">Automation</span>

<!-- Directive -->
<span class="chip">Campaigns &amp; RPG</span><span class="chip">State &amp; Simulation</span><span class="chip">Character &amp; Worldbuilding</span><span class="chip">Automation</span>

<!-- CarrotKernel -->
<span class="chip">Character &amp; Worldbuilding</span><span class="chip">Developer Tools</span>

<!-- VectFox -->
<span class="chip">Memory &amp; Retrieval</span><span class="chip">External Service</span>

<!-- Chat Top Bar -->
<span class="chip">Interface &amp; Navigation</span>

<!-- LALib -->
<span class="chip">Developer Tools</span><span class="chip">Extension Development</span>

<!-- Polyceph -->
<span class="chip">Planning &amp; Reasoning</span><span class="chip">Model Routing</span>

<!-- Smart Memory -->
<span class="chip">Memory &amp; Retrieval</span><span class="chip">Review &amp; Validation</span><span class="chip">Multi-user</span>

<!-- RPG Companion -->
<span class="chip">Campaigns &amp; RPG</span><span class="chip">State &amp; Simulation</span><span class="chip">Deprecated</span>

<!-- Celia V5.4 -->
<span class="chip">Prompt Engineering</span><span class="chip">Text Processing</span><span class="chip">Character &amp; Worldbuilding</span>

<!-- Marinara's Essentials -->
<span class="chip">Prompt Engineering</span><span class="chip">Text Processing</span><span class="chip">Character &amp; Worldbuilding</span><span class="chip">Adult Content</span>
```

- [ ] **Step 3: Replace `capabilityTips` with the controlled vocabulary**

```javascript
const capabilityTips = {
  "Memory & Retrieval": "Stores, searches, or recalls roleplay information",
  "Planning & Reasoning": "Adds structured planning or reasoning stages",
  "Model Routing": "Routes work among models or providers",
  "Review & Validation": "Reviews or validates generated changes",
  "State & Simulation": "Tracks or simulates persistent roleplay state",
  "Campaigns & RPG": "Supports campaigns, game systems, or RPG play",
  "Character & Worldbuilding": "Supports character or world creation",
  "Prompt Engineering": "Provides structured prompts or prompt controls",
  "Text Processing": "Transforms, orders, or matches generated text",
  "Interface & Navigation": "Adds interface controls or navigation",
  "Developer Tools": "Provides utilities for project developers",
  "Extension Development": "Supports building or running extensions",
  "Automation": "Automates a recurring roleplay workflow",
  "Agents": "Provides role-based or task-oriented agents",
  "Multi-user": "Supports group or multi-user conversations",
  "External Service": "May require a service outside the frontend",
  "Deprecated": "The project is deprecated or superseded",
  "Adult Content": "Includes adult-oriented content or behavior"
};
```

Retain the existing frontend-specific tooltip branch and the existing fallback
after this object.

- [ ] **Step 4: Run the green vocabulary, assignment, and parser contract**

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
$html=Get-Content -LiteralPath $file -Raw
$allowed=@(
  'Memory & Retrieval','Planning & Reasoning','Model Routing',
  'Review & Validation','State & Simulation','Campaigns & RPG',
  'Character & Worldbuilding','Prompt Engineering','Text Processing',
  'Interface & Navigation','Developer Tools','Extension Development',
  'Automation','Agents','Multi-user','External Service','Deprecated',
  'Adult Content'
)
$cards=[regex]::Matches($html,'(?s)<article class="repo-card".*?</article>')
$actual=@(
  $cards | ForEach-Object {
    [regex]::Matches($_.Value,'<span class="chip(?! frontend)[^"]*">([^<]+)</span>') |
      ForEach-Object { [System.Net.WebUtility]::HtmlDecode($_.Groups[1].Value.Trim()) }
  } | Sort-Object -Unique
)
$unexpected=@($actual | Where-Object { $_ -notin $allowed })
$missing=@($allowed | Where-Object { $_ -notin $actual })
if($unexpected.Count){ throw "Unexpected tags: $($unexpected -join ', ')" }
if($missing.Count){ throw "Missing tags: $($missing -join ', ')" }
if($actual.Count -ne 18){ throw "Expected 18 tags, found $($actual.Count)" }

$expected=@{
  'Lumiverse'=@('Developer Tools','Extension Development','Automation')
  'Marinara Engine'=@('Agents','State & Simulation','Extension Development')
  'Memory Books'=@('Memory & Retrieval','Review & Validation','Automation')
  'Recursion'=@('Planning & Reasoning','Model Routing','Review & Validation','Automation')
  'Directive'=@('Campaigns & RPG','State & Simulation','Character & Worldbuilding','Automation')
  'CarrotKernel'=@('Character & Worldbuilding','Developer Tools')
  'VectFox'=@('Memory & Retrieval','External Service')
  'Chat Top Bar'=@('Interface & Navigation')
  'LALib'=@('Developer Tools','Extension Development')
  'Polyceph'=@('Planning & Reasoning','Model Routing')
  'Smart Memory'=@('Memory & Retrieval','Review & Validation','Multi-user')
  'RPG Companion'=@('Campaigns & RPG','State & Simulation','Deprecated')
  'Celia V5.4'=@('Prompt Engineering','Text Processing','Character & Worldbuilding')
  'Marinara Essentials'=@('Prompt Engineering','Text Processing','Character & Worldbuilding','Adult Content')
}
foreach($card in $cards){
  $name=[regex]::Match($card.Value,'<a class="card-title"[^>]*>([^<]+)</a>').Groups[1].Value
  $name=[System.Net.WebUtility]::HtmlDecode($name)
  $lookupName=if($name -match '^Marinara.*Essentials$'){'Marinara Essentials'}else{$name}
  $tags=@(
    [regex]::Matches($card.Value,'<span class="chip(?! frontend)[^"]*">([^<]+)</span>') |
      ForEach-Object { [System.Net.WebUtility]::HtmlDecode($_.Groups[1].Value.Trim()) }
  )
  if(($tags -join '|') -ne ($expected[$lookupName] -join '|')){
    throw "$name tags differ: $($tags -join ', ')"
  }
}

$scripts=[regex]::Matches($html,'(?s)<script>(.*?)</script>')
if($scripts.Count -ne 1){ throw "Expected one inline script, found $($scripts.Count)" }
$temp=Join-Path $env:TEMP 'tavernary-controlled-tags.js'
Set-Content -LiteralPath $temp -Value $scripts[0].Groups[1].Value -Encoding utf8
node --check $temp
if($LASTEXITCODE -ne 0){ throw 'Inline JavaScript parse failed' }
'Controlled vocabulary contract passed'
```

Expected: `Controlled vocabulary contract passed`.

- [ ] **Step 5: Record the ignored-mockup checkpoint**

```powershell
git status --short
git check-ignore -v '.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
```

Expected: the mockup is reported as ignored and is not staged; the unrelated
`?? data/` entry remains untouched. Do not create an implementation commit for
the ignored mockup.

---

### Task 2: Add the Four-Row Disclosure Control

**Files:**
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`

**Interfaces:**
- Consumes: `#metadata-search`, `#metadata-options`, `.metadata-option`, `metadataChecks`, `updateMetadataList()`, `buildMetadataFilters()`, and `setPreviewMode(mode)`.
- Produces: `#metadata-more`, `.collapsed-hidden`, `metadataExpanded: boolean`, `sortMetadataRows()`, `getCollapsedRows(rows): Set<Element>`, and `scheduleMetadataLayout()`.

- [ ] **Step 1: Run the failing disclosure-control contract**

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
$html=Get-Content -LiteralPath $file -Raw
$required=@(
  'id="metadata-more"',
  'class="metadata-more"',
  '.metadata-option.collapsed-hidden',
  'let metadataExpanded = false;',
  'function sortMetadataRows()',
  'function getCollapsedRows(rows)',
  'function scheduleMetadataLayout()',
  'aria-controls="metadata-options"'
)
$missing=@($required | Where-Object { -not $html.Contains($_) })
if(-not $missing.Count){ throw 'Expected disclosure contract to fail before implementation' }
"RED: missing $($missing.Count) disclosure markers"
```

Expected: `RED: missing 8 disclosure markers`.

- [ ] **Step 2: Add the disclosure button below the cloud**

```html
<div class="metadata-options" id="metadata-options"></div>
<button class="metadata-more" id="metadata-more" type="button"
  aria-expanded="false" aria-controls="metadata-options" hidden></button>
```

- [ ] **Step 3: Add collapsed-row and disclosure styling**

Place these rules immediately after the existing metadata chip focus rule:

```css
.metadata-option.collapsed-hidden { display: none; }
.metadata-more {
  width: 100%;
  min-height: 30px;
  margin-top: 8px;
  padding: 6px 9px;
  border: 1px dashed var(--line);
  border-radius: 6px;
  color: var(--text-2);
  background: transparent;
  font: inherit;
  font-size: 9px;
  text-align: left;
  cursor: pointer;
}
.metadata-more:hover {
  color: var(--text);
  border-color: var(--line-strong);
  background: var(--surface);
}
.metadata-more:focus-visible {
  outline: 2px solid var(--line-strong);
  outline-offset: 2px;
}
.metadata-more[hidden] { display: none; }
```

- [ ] **Step 4: Add disclosure state beside the metadata references**

```javascript
const metadataMore = document.getElementById("metadata-more");
let metadataChecks = [];
let metadataExpanded = false;
let metadataLayoutFrame = 0;
```

Keep `activeCategory` immediately after these declarations.

- [ ] **Step 5: Sort generated tags by selection, project count, then label**

When creating each metadata row in `buildMetadataFilters()`, add:

```javascript
row.dataset.count = String(entry.count);
```

Replace alphabetical creation ordering with count-first ordering:

```javascript
[...index.entries()]
  .sort((left, right) =>
    right[1].count - left[1].count
      || left[1].label.localeCompare(right[1].label)
  )
```

Add this function after `buildMetadataFilters()`:

```javascript
function sortMetadataRows() {
  [...metadataOptions.querySelectorAll(".metadata-option")]
    .sort((left, right) => {
      const leftSelected = left.querySelector("input").checked ? 1 : 0;
      const rightSelected = right.querySelector("input").checked ? 1 : 0;
      return rightSelected - leftSelected
        || Number(right.dataset.count) - Number(left.dataset.count)
        || left.dataset.name.localeCompare(right.dataset.name);
    })
    .forEach((row) => metadataOptions.appendChild(row));
}
```

- [ ] **Step 6: Add rendered-row measurement**

```javascript
function getCollapsedRows(rows) {
  rows.forEach((row) => row.classList.remove("collapsed-hidden"));
  metadataOptions.getBoundingClientRect();

  const rowTops = [];
  rows.forEach((row) => {
    if (!rowTops.includes(row.offsetTop)) rowTops.push(row.offsetTop);
  });

  const lastSelectedRow = rows.reduce((last, row) => {
    if (!row.querySelector("input").checked) return last;
    return Math.max(last, rowTops.indexOf(row.offsetTop));
  }, -1);
  const lastVisibleRow = Math.max(3, lastSelectedRow);

  return new Set(
    rows.filter((row) => rowTops.indexOf(row.offsetTop) <= lastVisibleRow)
  );
}

function scheduleMetadataLayout() {
  cancelAnimationFrame(metadataLayoutFrame);
  metadataLayoutFrame = requestAnimationFrame(updateMetadataList);
}
```

- [ ] **Step 7: Replace `updateMetadataList()` with search and disclosure behavior**

```javascript
function updateMetadataList() {
  const query = metadataSearch.value.trim().toLowerCase();
  const rows = [...metadataOptions.querySelectorAll(".metadata-option")];

  rows.forEach((row) => {
    const selected = row.querySelector("input").checked;
    const matches = row.dataset.name.toLowerCase().includes(query);
    row.classList.toggle("selected", selected);
    row.classList.toggle(
      "filtered-out",
      Boolean(query) && !selected && !matches
    );
    row.classList.remove("collapsed-hidden");
  });

  sortMetadataRows();
  const available = [...metadataOptions.querySelectorAll(".metadata-option")]
    .filter((row) => !row.classList.contains("filtered-out"));

  if (query) {
    metadataMore.hidden = true;
    return;
  }

  const collapsedRows = getCollapsedRows(available);
  const hiddenRows = available.filter((row) => !collapsedRows.has(row));

  if (!metadataExpanded) {
    hiddenRows.forEach((row) => row.classList.add("collapsed-hidden"));
  }

  metadataMore.hidden = hiddenRows.length === 0;
  metadataMore.setAttribute("aria-expanded", String(metadataExpanded));
  metadataMore.textContent = metadataExpanded
    ? "Show fewer tags"
    : `+ ${hiddenRows.length} more tags`;
}
```

- [ ] **Step 8: Wire disclosure, resize, preview-mode, and initialization**

Add these listeners beside the existing metadata listener:

```javascript
metadataMore.addEventListener("click", () => {
  metadataExpanded = !metadataExpanded;
  updateMetadataList();
});
window.addEventListener("resize", scheduleMetadataLayout);
```

At the end of `setPreviewMode(mode)`, add:

```javascript
scheduleMetadataLayout();
```

Ensure initialization retains this order:

```javascript
buildMetadataFilters();
updateMetadataList();
updateFrontendList();
updateQueryChips();
updateResults();
updateFilterCount();
```

- [ ] **Step 9: Run the green disclosure and parser contract**

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
$html=Get-Content -LiteralPath $file -Raw
$required=@(
  'id="metadata-more"',
  'class="metadata-more"',
  '.metadata-option.collapsed-hidden',
  'let metadataExpanded = false;',
  'function sortMetadataRows()',
  'function getCollapsedRows(rows)',
  'function scheduleMetadataLayout()',
  'aria-controls="metadata-options"',
  'metadataMore.addEventListener("click"',
  'window.addEventListener("resize", scheduleMetadataLayout);',
  'scheduleMetadataLayout();',
  '`+ ${hiddenRows.length} more tags`',
  '"Show fewer tags"'
)
$missing=@($required | Where-Object { -not $html.Contains($_) })
if($missing.Count){ throw "Missing: $($missing -join ', ')" }
$scripts=[regex]::Matches($html,'(?s)<script>(.*?)</script>')
if($scripts.Count -ne 1){ throw "Expected one inline script, found $($scripts.Count)" }
$temp=Join-Path $env:TEMP 'tavernary-collapsible-cloud.js'
Set-Content -LiteralPath $temp -Value $scripts[0].Groups[1].Value -Encoding utf8
node --check $temp
if($LASTEXITCODE -ne 0){ throw 'Inline JavaScript parse failed' }
'Disclosure contract passed'
```

Expected: `Disclosure contract passed`.

- [ ] **Step 10: Record the ignored-mockup checkpoint**

```powershell
git status --short
git check-ignore -v '.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
```

Expected: the live mockup remains ignored and unstaged; `data/` remains
untouched.

---

### Task 3: Verify Taxonomy, Disclosure, and Responsive Behavior

**Files:**
- Verify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`

**Interfaces:**
- Consumes: the completed controlled card tags, generated metadata chips, `#metadata-more`, metadata search, removable query chips, `Clear all`, mobile filter drawer, preview controls, and card density control.
- Produces: static, parser, desktop, mobile, accessibility, and console evidence for the approved design.

- [ ] **Step 1: Reload the v7 mockup in the existing in-app browser tab**

Use the browser controller to reload `http://localhost:60370/#`. Confirm the
page contains `14 projects`, `Capabilities & characteristics`, and the
`Desktop`/`Mobile` mockup controls.

- [ ] **Step 2: Verify the desktop collapsed cloud**

In desktop preview with no filters:

- confirm exactly 18 metadata chips exist in the DOM;
- confirm only the chips in the first four measured `offsetTop` groups are
  visible;
- confirm `#metadata-more` is visible, has `aria-expanded="false"`, and its
  `N` equals the number of `.collapsed-hidden` rows;
- confirm the initial ordering is descending card count, then alphabetical;
- confirm the metadata container has no vertical scrollbar;
- confirm the page has no horizontal overflow.

- [ ] **Step 3: Verify expansion, collapse, and selected-tag priority**

- activate `+ N more tags`;
- confirm all 18 chips are visible and the button reads `Show fewer tags`;
- select `Adult Content`;
- collapse the cloud;
- confirm `Adult Content` remains visible and sorts before unselected tags;
- confirm every other visible unselected tag fits within the allowed rendered
  rows;
- remove the `Adult Content` query chip and confirm its filter chip becomes
  unselected.

- [ ] **Step 4: Verify metadata search and OR filtering**

- enter `model` in metadata search;
- confirm `Model Routing` appears and catalog count remains `14`;
- clear search;
- select `Model Routing` and `Memory & Retrieval`;
- confirm OR results are `Recursion`, `Polyceph`, `Memory Books`, `VectFox`,
  and `Smart Memory`;
- confirm the result count is `5`;
- confirm both selected tags remain visible in collapsed mode;
- activate `Clear all` and confirm all 14 projects return, no metadata tags are
  selected, the metadata search is empty, and no query chips remain.

- [ ] **Step 5: Verify mobile recalculation and outer scrolling**

Switch to the 390 px mobile preview and open filters:

- confirm the collapsed cloud recalculates against the mobile width;
- confirm no more than four rows are visible without selections;
- confirm the hidden count matches `.collapsed-hidden`;
- expand and collapse once;
- confirm the metadata cloud has no inner scrollbar;
- confirm the outer filter drawer owns vertical scrolling;
- confirm there is no horizontal overflow.

Close filters and switch back to desktop preview.

- [ ] **Step 6: Verify unchanged card-density behavior**

- switch to compact cards and confirm summaries, aggregate score, and
  repository size remain hidden;
- confirm one clipped card-chip row and visible licenses;
- restore standard cards and confirm summaries plus up to two chip rows return.

- [ ] **Step 7: Check browser console warnings and errors**

```javascript
await tab.dev.logs({ levels: ["error", "warning"], limit: 50 })
```

Expected: `[]`.

- [ ] **Step 8: Run the final static and JavaScript verification**

Run the complete green contracts from Task 1 Step 4 and Task 2 Step 9 in one
fresh PowerShell process.

Expected:

```text
Controlled vocabulary contract passed
Disclosure contract passed
```

- [ ] **Step 9: Restore and finalize the deliverable**

Leave the mockup in this state:

- desktop preview;
- standard card density;
- empty global and metadata searches;
- no selected filters or query chips;
- collapsed capability cloud;
- all 14 projects visible.

Finalize the v7 browser tab as the deliverable. Then run:

```powershell
git status --short
```

Expected: no tracked implementation changes because the mockup is intentionally
ignored; the unrelated `?? data/` directory remains untouched.
