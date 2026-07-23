# Collapse Icon, Mobile Controls, and Catalog Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the v7 Tavernary mockup with the supplied collapse icon, a non-overflowing 390 px mobile control row, and richer two-row metadata tags for all fourteen mock projects.

**Architecture:** Make presentation and mock-data changes within the existing single-file v7 Companion artifact. Preserve the current density-toggle behavior and filter/sort logic; only replace the SVG symbol, adjust mobile sizing, and update static chip markup.

**Tech Stack:** Static HTML, CSS container queries, vanilla JavaScript, PowerShell contract checks, Node.js syntax checks, and the in-app browser.

## Global Constraints

- Use collapse path `M23 26l-7-7-7 7M9 6l7 7 7-7` with `viewBox="0 0 32 32"` and `currentColor`.
- The 390 px mobile preview must have no horizontal overflow.
- The mobile sort dropdown is exactly `120px` wide.
- All, Active, New, and Released remain unabbreviated and fully visible at `10px`.
- Compatible frontends lead every chip list.
- Standard cards show no more than two rows and six chips.
- Compact cards retain one clipped row.
- `.superpowers/` remains intentionally untracked.

---

### Task 1: Collapse Icon and Mobile Control Fit

**Files:**
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`

**Interfaces:**
- Consumes: `#i-density`, `#density-toggle`, `.catalog-controls`, `.view-tabs`, and `.sort`.
- Produces: the supplied inward-chevron symbol and a three-column mobile row sized `34px minmax(0, 1fr) 120px`.

- [ ] **Step 1: Run the failing icon and layout contract**

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
$html=Get-Content -LiteralPath $file -Raw
@('viewBox="0 0 32 32"','M23 26l-7-7-7 7M9 6l7 7 7-7',
  'grid-template-columns: 34px minmax(0, 1fr) 120px',
  'font-size: 10px') |
  ForEach-Object { if(-not $html.Contains($_)){throw "Missing $_"} }
```

Expected: FAIL with `Missing viewBox="0 0 32 32"`.

- [ ] **Step 2: Replace the density symbol**

Replace `#i-density` with:

```html
<symbol id="i-density" viewBox="0 0 32 32">
  <path d="M23 26l-7-7-7 7M9 6l7 7 7-7"/>
</symbol>
```

The inherited `.icon` rules already provide `fill: none` and
`stroke: currentColor`.

- [ ] **Step 3: Fit the mobile controls**

Within `@container site (max-width: 760px)`, use:

```css
.catalog-controls {
  width: 100%;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 120px;
  gap: 6px;
  overflow: visible;
}
.view-tabs button {
  min-width: 0;
  padding-inline: 4px;
  flex: 1;
  font-size: 10px;
}
.sort {
  width: 120px;
  min-width: 0;
  padding-left: 8px;
}
```

- [ ] **Step 4: Run the icon and layout contract**

Run Step 1 again.

Expected: PASS with no output.

---

### Task 2: Curated Mock Catalog Tags

**Files:**
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`

**Interfaces:**
- Consumes: each card’s existing `.chips` container and `.chip.frontend` styling.
- Produces: frontend-first chip lists with at most six chips per project.

- [ ] **Step 1: Run the failing tag contract**

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
$html=Get-Content -LiteralPath $file -Raw
$required=@('Extension runtime','Versioned manifests','Compatibility lanes',
  'Long-term memory','Structured planning','Character metadata',
  'External service','Quick actions','Shared utilities','Provider routing',
  'Cross-chat','Campaign assistance','Prompt ordering','Character roleplay')
foreach($tag in $required){
  if(-not $html.Contains(">$tag</span>")){throw "Missing tag $tag"}
}
```

Expected: FAIL with `Missing tag Extension runtime`.

- [ ] **Step 2: Replace each project’s chip list**

Use these exact ordered lists:

```text
Lumiverse: Lumiverse | Extension runtime | Full-stack | Permissions | Versioned manifests
Marinara Engine: Marinara | Agents | Writer | State tracking | Compatibility lanes
Memory Books: SillyTavern | Long-term memory | Lorebooks | Automatic | Reviewable
Recursion: SillyTavern | Structured planning | Multi-provider | Review | Validation
Directive: SillyTavern | Campaigns | State tracking | Timekeeping | Simulation
CarrotKernel: SillyTavern | Character metadata | Worldbuilding | Structured tags | Authoring
VectFox: SillyTavern | Lumiverse | Vector RAG | Long-term memory | External service
Chat Top Bar: SillyTavern | Navigation | Chat controls | Quick actions
LALib: SillyTavern | Shared utilities | Dependency | Developer tools
Polyceph: SillyTavern | Multi-model | Orchestration | Provider routing
Smart Memory: SillyTavern | Long-term memory | Cross-chat | Group chat | Reviewable
RPG Companion: SillyTavern | Marinara | Deprecated | State tracking | Campaign assistance
Celia V5.4: SillyTavern | Chat Completion | Prompt ordering | Regex | POV controls | 302 prompt blocks
Marinara’s Essentials: SillyTavern | Chat Completion | Character roleplay | Regex | Logit bias | Adult
```

Every frontend entry uses `class="chip frontend"`; every other entry uses
`class="chip"`.

- [ ] **Step 3: Add tooltip vocabulary**

Extend `capabilityTips` with:

```js
"Extension runtime": "Provides an installable extension runtime",
"Full-stack": "Supports frontend and backend extension code",
"Permissions": "Declares extension permissions",
"Versioned manifests": "Uses versioned extension manifests",
"Writer": "Contains writing-agent features",
"State tracking": "Tracks roleplay or campaign state",
"Compatibility lanes": "Maintains versioned compatibility lanes",
"Long-term memory": "Preserves information across long-running roleplay",
"Reviewable": "Supports review before applying generated changes",
"Structured planning": "Adds structured planning stages",
"Multi-provider": "Supports specialized model providers",
"Validation": "Validates generated output against guidance",
"Timekeeping": "Tracks campaign or simulation time",
"Character metadata": "Organizes structured character metadata",
"Structured tags": "Uses structured tags for organization",
"Authoring": "Supports character or world authoring",
"External service": "May require an external service",
"Chat controls": "Adds controls to the chat interface",
"Quick actions": "Provides frequently used actions",
"Shared utilities": "Provides utilities shared by other projects",
"Developer tools": "Supports extension development",
"Provider routing": "Routes work among model providers",
"Cross-chat": "Preserves information across chats",
"Campaign assistance": "Assists campaign play and state management",
"Prompt ordering": "Controls prompt-block ordering",
"Regex": "Includes companion regex scripts",
"Character roleplay": "Configured for character-focused roleplay"
```

- [ ] **Step 4: Run tag and JavaScript contracts**

Run Step 1, then:

```powershell
$html=Get-Content -LiteralPath '.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html' -Raw
$script=[regex]::Match($html,'<script>([\s\S]*?)</script>').Groups[1].Value
$temp=Join-Path $env:TEMP 'tavernary-v7-tags.js'
Set-Content -LiteralPath $temp -Value $script -Encoding utf8
node --check $temp
```

Expected: both commands exit 0.

---

### Task 3: Browser Verification

**Files:**
- Verify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`

**Interfaces:**
- Consumes: the completed v7 Companion mockup.
- Produces: visual and interaction evidence for the icon, control fit, and tag rows.

- [ ] **Step 1: Verify standard desktop**

Check:

- the density icon uses the 32-unit inward-chevron geometry;
- every card has no more than six chips;
- all compatible frontends lead;
- standard chip containers remain no taller than 40 px;
- longer tag lists use no more than two rows;
- filtering and popularity sorting still work.

- [ ] **Step 2: Verify 390 px mobile**

Switch to Mobile and check:

- `.catalog-controls` has no horizontal overflow;
- filter, status tabs, and sort share one row;
- the sort control is 120 px wide;
- “Released” is fully contained within its button;
- the site has no horizontal overflow.

- [ ] **Step 3: Verify compact density**

Enable compact cards and check:

- summaries remain hidden;
- chips remain in one 18 px clipped row;
- license remains visible;
- richer tag content does not increase compact card height.

- [ ] **Step 4: Final static verification**

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
$html=Get-Content -LiteralPath $file -Raw
$required=@('M23 26l-7-7-7 7M9 6l7 7 7-7',
  'grid-template-columns: 34px minmax(0, 1fr) 120px',
  'Versioned manifests','Compatibility lanes','302 prompt blocks')
foreach($item in $required){
  if(-not $html.Contains($item)){throw "Missing $item"}
}
'Collapse, mobile, and tag verification passed'
```

Expected: `Collapse, mobile, and tag verification passed`.

- [ ] **Step 5: Leave the deliverable open**

Restore standard density and Desktop preview, keep v7 open as the deliverable,
and do not stage `.superpowers/`.
