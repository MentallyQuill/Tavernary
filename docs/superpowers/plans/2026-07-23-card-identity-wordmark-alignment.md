# Card Identity and Wordmark Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the standard-card type-icon frames, tighten icon-to-type spacing, preserve left alignment and project-kind color, and size the Tavernary wordmark to the tagline's measured text width.

**Architecture:** Change only the existing CSS rules in the single-file v7 mockup. Preserve all card markup and compact-card overrides. Verify the result through source contracts plus rendered text-range and element-bound measurements in desktop and 390px mobile previews.

**Tech Stack:** Static HTML/CSS, PowerShell contract checks, Node.js syntax checks, and the in-app browser.

## Global Constraints

- Modify only `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`.
- `.superpowers/` remains intentionally ignored and must not be staged.
- Leave the unrelated untracked `data/` directory untouched.
- Standard `.function-symbol` is `23px × 23px` with no border, background, or radius.
- Standard `.function-symbol .icon` remains `23px × 23px`.
- Preserve `color: var(--kind-color)` on standard and compact icons.
- Set the standard `.identity` gap to `4px`.
- Keep the identity and card-title left edges aligned.
- Preserve compact-card `17px` wrapper, `15px` icon, frameless treatment, and `6px` gap.
- Set `.brand-name` to `29.5px`.
- Preserve emblem sizes, the `7px` brand gap, tagline styling, header structure, and submission action.
- Keep the desktop top bar at `66px`.
- Reject mobile brand/`Submit Project` collisions at 390px.
- Preserve zero horizontal overflow and a clean browser console.

---

### Task 1: Apply the CSS Alignment Contract

**Files:**
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`
- Reference: `docs/superpowers/specs/2026-07-23-card-identity-wordmark-alignment-design.md`

**Interfaces:**
- Consumes: `.brand-name`, `.identity`, `.function-symbol`, `.function-symbol .icon`, and the existing `.compact-cards` overrides.
- Produces: a `29.5px` wordmark, frameless `23px` standard icons, and a `4px` standard identity gap without changing compact cards.

- [ ] **Step 1: Run the failing CSS contract**

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
$html=Get-Content -LiteralPath $file -Raw
$required=@(
  '(?s)\.brand-name\s*\{[^}]*font-size:\s*29\.5px',
  '(?s)\.identity\s*\{[^}]*gap:\s*4px',
  '(?s)\.function-symbol\s*\{[^}]*width:\s*23px',
  '(?s)\.function-symbol\s*\{[^}]*height:\s*23px',
  '(?s)\.function-symbol\s*\{[^}]*border:\s*0',
  '(?s)\.function-symbol\s*\{[^}]*border-radius:\s*0',
  '(?s)\.function-symbol\s*\{[^}]*background:\s*transparent'
)
$missing=@($required | Where-Object { $html -notmatch $_ })
if(-not $missing.Count){ throw 'Expected alignment contract to fail before implementation' }
"RED: missing $($missing.Count) alignment rules"
```

Expected: output beginning with `RED:` because the standard identity still has
a `38px` framed wrapper, an `8px` gap, and a `20px` inherited wordmark.

- [ ] **Step 2: Expand the wordmark rule**

Replace:

```css
.brand-name { color: #E18A24; }
```

with:

```css
.brand-name {
  color: #E18A24;
  font-size: 29.5px;
}
```

- [ ] **Step 3: Tighten the standard identity gap**

In the base `.identity` rule, replace:

```css
gap: 8px;
```

with:

```css
gap: 4px;
```

Do not change `.compact-cards .identity { gap: 6px; }`.

- [ ] **Step 4: Remove the standard icon frame**

Replace the base `.function-symbol` rule with:

```css
.function-symbol {
  width: 23px;
  height: 23px;
  display: grid;
  place-items: center;
  flex: none;
  border: 0;
  border-radius: 0;
  color: var(--kind-color);
  background: transparent;
}
```

Keep:

```css
.function-symbol .icon { width: 23px; height: 23px; }
```

Do not alter the compact wrapper or icon declarations.

- [ ] **Step 5: Run the green CSS, compact-preservation, and parser contract**

```powershell
$file='.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
$html=Get-Content -LiteralPath $file -Raw
$required=@(
  '(?s)\.brand-name\s*\{[^}]*font-size:\s*29\.5px',
  '(?s)\.identity\s*\{[^}]*gap:\s*4px',
  '(?s)\.function-symbol\s*\{[^}]*width:\s*23px',
  '(?s)\.function-symbol\s*\{[^}]*height:\s*23px',
  '(?s)\.function-symbol\s*\{[^}]*border:\s*0',
  '(?s)\.function-symbol\s*\{[^}]*border-radius:\s*0',
  '(?s)\.function-symbol\s*\{[^}]*color:\s*var\(--kind-color\)',
  '(?s)\.function-symbol\s*\{[^}]*background:\s*transparent',
  '(?s)\.compact-cards \.identity\s*\{\s*gap:\s*6px',
  '(?s)\.compact-cards \.function-symbol\s*\{[^}]*width:\s*17px',
  '(?s)\.compact-cards \.function-symbol\s*\{[^}]*height:\s*17px',
  '(?s)\.compact-cards \.function-symbol \.icon\s*\{[^}]*width:\s*15px',
  '(?s)\.compact-cards \.function-symbol \.icon\s*\{[^}]*height:\s*15px'
)
$missing=@($required | Where-Object { $html -notmatch $_ })
if($missing.Count){ throw "Missing CSS contracts: $($missing -join ', ')" }

$scripts=[regex]::Matches($html,'(?s)<script>(.*?)</script>')
if($scripts.Count -ne 1){ throw "Expected one inline script, found $($scripts.Count)" }
$temp=Join-Path $env:TEMP 'tavernary-card-identity-alignment.js'
Set-Content -LiteralPath $temp -Value $scripts[0].Groups[1].Value -Encoding utf8
node --check $temp
if($LASTEXITCODE -ne 0){ throw 'Inline JavaScript parse failed' }
'Card identity CSS contract passed'
```

Expected: `Card identity CSS contract passed`.

- [ ] **Step 6: Record the ignored-mockup checkpoint**

```powershell
git status --short
git check-ignore -v '.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html'
```

Expected: the mockup is ignored and unstaged; `?? data/` remains untouched. Do
not create an implementation commit for the ignored file.

---

### Task 2: Verify Rendered Alignment and Responsive Safety

**Files:**
- Verify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`

**Interfaces:**
- Consumes: the updated wordmark and identity CSS, desktop/mobile preview controls, card-density control, and the first visible repository card.
- Produces: rendered desktop, compact, mobile, overflow, parser, and console evidence for the approved measurements.

- [ ] **Step 1: Reload the existing v7 mockup tab**

Reload `http://localhost:60370/#` through the in-app browser. Restore desktop
preview, standard cards, clear filters, and all 14 projects.

- [ ] **Step 2: Measure the standard card identity**

For the first visible card, read the rendered rectangles and computed styles
for `.identity`, `.function-symbol`, `.function-symbol .icon`, `.kind`, and
`.card-title`.

Confirm:

- symbol width and height are within `0.1px` of `23px`;
- icon width and height are within `0.1px` of `23px`;
- computed border width is `0px`;
- computed background is transparent;
- symbol color equals the card's computed `--kind-color`;
- symbol left edge and title left edge differ by less than `0.1px`;
- heading left edge minus symbol right edge is within `0.2px` of `4px`.

- [ ] **Step 3: Measure wordmark and tagline text edges**

Use `Range.selectNodeContents()` to measure the actual glyph bounds rather than
the flex-item bounds.

Confirm:

- `.brand-name` computed font size is `29.5px`;
- wordmark and tagline left edges differ by less than `0.1px`;
- wordmark and tagline right edges differ by less than `1px`;
- desktop `.topbar` height remains within `0.1px` of `66px`;
- the page has no horizontal overflow.

- [ ] **Step 4: Verify compact-card overrides**

Switch to compact cards and confirm:

- wrapper is `17px × 17px`;
- icon is `15px × 15px`;
- border width is `0px`;
- background is transparent;
- compact identity gap remains `6px`.

Restore standard cards.

- [ ] **Step 5: Verify the 390px mobile header**

Switch to mobile preview and confirm:

- `.brand-name` remains `29.5px`;
- brand content and `Submit Project` rectangles do not intersect;
- emblem remains `55px × 55px`;
- the page and `#site-preview` have zero horizontal overflow.

Switch back to desktop preview.

- [ ] **Step 6: Inspect the final desktop mockup**

Capture and inspect a desktop screenshot. Confirm the frameless icons remain
legible in their project-kind colors, type headings sit close to the symbols,
and the Tavernary wordmark visually shares the tagline's text edges.

- [ ] **Step 7: Check browser console warnings and errors**

```javascript
await tab.dev.logs({ levels: ["error", "warning"], limit: 50 })
```

Expected: `[]`.

- [ ] **Step 8: Run the final source verification**

Rerun Task 1 Step 5 in a fresh PowerShell process.

Expected: `Card identity CSS contract passed`.

- [ ] **Step 9: Restore and finalize the deliverable**

Leave the mockup in desktop preview with standard cards, clear searches and
filters, the collapsed capability cloud, and all 14 projects visible. Finalize
the v7 browser tab as the deliverable.

Run:

```powershell
git status --short
```

Expected: no tracked implementation changes because the mockup is ignored;
`?? data/` remains untouched.
