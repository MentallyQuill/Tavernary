# Quill Logo and Card Identity Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the approved quill-and-inkwell artwork in Tavernary's desktop and mobile headers and increase only standard-card type-icon spacing to `8px`.

**Architecture:** Copy the supplied PNG into the ignored mockup bundle and select it through the existing `.brand-logo` CSS so the enormous legacy inline data URI does not require an unsafe generated-text rewrite. Change only the existing base and mobile logo sizing rules, the brand gap, and the base identity gap; preserve the compact-card override. Verify source contracts, asset identity, rendered geometry, responsive safety, and browser logs.

**Tech Stack:** Static HTML/CSS, PNG asset, PowerShell contract checks, Node.js syntax checks, and the in-app browser.

## Global Constraints

- Modify only `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`.
- Create only `.superpowers/brainstorm/1335-1784816109/content/Tavernary_logo.png`.
- `.superpowers/` remains intentionally ignored and must not be staged.
- Leave the unrelated untracked `data/` directory untouched.
- Use `C:\Users\Keptin\Downloads\Tavernary_logo.png` as the source artwork.
- The copied PNG must retain SHA-256 `283E3206FC0E5F6AA0BE2410AF9A58E5F694216411DDED210FA29A1D9BD71189`.
- Render the logo at `45px × 60px` on desktop and `41px × 55px` on mobile.
- Keep `object-fit: contain` and use a `6px` emblem-to-copy gap.
- Preserve the `28.85px` Tavernary wordmark and its measured alignment with the tagline.
- Preserve vertical centering against the complete wordmark-and-tagline block.
- Keep the desktop top-bar height unchanged.
- Reject mobile brand/`Submit Project` collisions.
- Set the standard `.identity` gap to `8px`.
- Preserve the frameless `23px` standard icon, project-kind color, and title-left alignment.
- Preserve the compact-card `17px` wrapper, `15px` icon, and `6px` identity gap.
- Preserve zero horizontal overflow and a clean browser console.

---

### Task 1: Apply the Approved Logo and Spacing Contract

**Files:**
- Create: `.superpowers/brainstorm/1335-1784816109/content/Tavernary_logo.png`
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html:118-132`
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html:635-640`
- Modify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html:1034`
- Reference: `docs/superpowers/specs/2026-07-23-quill-logo-spacing-design.md`

**Interfaces:**
- Consumes: the supplied `316px × 421px` transparent PNG and existing `.brand`, `.brand-logo`, `.identity`, and `.compact-cards .identity` rules.
- Produces: a relative mockup logo asset, aspect-ratio-aware desktop/mobile logo boxes, a `6px` brand gap, and an `8px` standard identity gap.

- [ ] **Step 1: Run the failing CSS and asset contract**

```powershell
$dir='.superpowers\brainstorm\1335-1784816109\content'
$file=Join-Path $dir 'catalog-wall-responsive-v7.html'
$asset=Join-Path $dir 'Tavernary_logo.png'
$html=Get-Content -LiteralPath $file -Raw
$required=@(
  '(?s)\.brand\s*\{[^}]*gap:\s*6px',
  '(?s)\.brand-logo\s*\{[^}]*content:\s*url\(["'']\./Tavernary_logo\.png["'']\)',
  '(?s)\.brand-logo\s*\{[^}]*width:\s*45px',
  '(?s)\.brand-logo\s*\{[^}]*height:\s*60px',
  '(?s)\.identity\s*\{[^}]*gap:\s*8px',
  '(?s)\.compact-cards \.identity\s*\{\s*gap:\s*6px',
  '(?s)@media\s*\(max-width:\s*700px\).*?\.brand-logo\s*\{\s*width:\s*41px;\s*height:\s*55px'
)
$missing=@($required | Where-Object { $html -notmatch $_ })
if((Test-Path -LiteralPath $asset) -or -not $missing.Count){
  throw 'Expected logo and spacing contract to fail before implementation'
}
"RED: asset missing; $($missing.Count) CSS rules missing"
```

Expected: output beginning with `RED:` because the corrected asset is absent
and the old dimensions and spacing are still active.

- [ ] **Step 2: Copy the approved binary asset**

Binary image files cannot be represented safely by a text patch, so copy the
user-supplied asset directly into the ignored mockup bundle:

```powershell
$source='C:\Users\Keptin\Downloads\Tavernary_logo.png'
$target='F:\git\Tavernary\.superpowers\brainstorm\1335-1784816109\content\Tavernary_logo.png'
Copy-Item -LiteralPath $source -Destination $target -Force
$hash=(Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash
if($hash -ne '283E3206FC0E5F6AA0BE2410AF9A58E5F694216411DDED210FA29A1D9BD71189'){
  throw "Unexpected copied logo hash: $hash"
}
```

Expected: no output and exit code `0`.

- [ ] **Step 3: Apply the desktop header rules**

Use `apply_patch` to change:

```css
.brand {
  display: flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  font-size: 20px;
  font-weight: 740;
  letter-spacing: -.035em;
}
.brand-logo {
  content: url("./Tavernary_logo.png");
  width: 45px;
  height: 60px;
  flex: none;
  object-fit: contain;
}
```

The `content` replacement intentionally leaves the old inline source untouched
while rendering the approved local asset.

- [ ] **Step 4: Increase only the standard-card identity gap**

Use `apply_patch` to change the base rule to:

```css
.identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
```

Do not change:

```css
.compact-cards .identity { gap: 6px; }
```

- [ ] **Step 5: Apply the mobile logo dimensions**

Use `apply_patch` to change the existing mobile override to:

```css
.brand-logo { width: 41px; height: 55px; }
```

- [ ] **Step 6: Run the green source, asset, and parser contract**

```powershell
$dir='.superpowers\brainstorm\1335-1784816109\content'
$file=Join-Path $dir 'catalog-wall-responsive-v7.html'
$asset=Join-Path $dir 'Tavernary_logo.png'
$html=Get-Content -LiteralPath $file -Raw
$required=@(
  '(?s)\.brand\s*\{[^}]*gap:\s*6px',
  '(?s)\.brand-logo\s*\{[^}]*content:\s*url\(["'']\./Tavernary_logo\.png["'']\)',
  '(?s)\.brand-logo\s*\{[^}]*width:\s*45px',
  '(?s)\.brand-logo\s*\{[^}]*height:\s*60px',
  '(?s)\.brand-logo\s*\{[^}]*object-fit:\s*contain',
  '(?s)\.identity\s*\{[^}]*gap:\s*8px',
  '(?s)\.compact-cards \.identity\s*\{\s*gap:\s*6px',
  '(?s)@media\s*\(max-width:\s*700px\).*?\.brand-logo\s*\{\s*width:\s*41px;\s*height:\s*55px'
)
$missing=@($required | Where-Object { $html -notmatch $_ })
if($missing.Count){ throw "Missing CSS contracts: $($missing -join ', ')" }

$hash=(Get-FileHash -Algorithm SHA256 -LiteralPath $asset).Hash
if($hash -ne '283E3206FC0E5F6AA0BE2410AF9A58E5F694216411DDED210FA29A1D9BD71189'){
  throw "Unexpected logo hash: $hash"
}

$scripts=[regex]::Matches($html,'(?s)<script>(.*?)</script>')
if($scripts.Count -ne 1){ throw "Expected one inline script, found $($scripts.Count)" }
$temp=Join-Path $env:TEMP 'tavernary-quill-logo-spacing.js'
Set-Content -LiteralPath $temp -Value $scripts[0].Groups[1].Value -Encoding utf8
node --check $temp
if($LASTEXITCODE -ne 0){ throw 'Inline JavaScript parse failed' }
'Quill logo and spacing contract passed'
```

Expected: `Quill logo and spacing contract passed`.

- [ ] **Step 7: Confirm the ignored implementation boundary**

```powershell
git status --short
git check-ignore -v `
  '.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html' `
  '.superpowers/brainstorm/1335-1784816109/content/Tavernary_logo.png'
```

Expected: both implementation files are ignored and unstaged; `?? data/`
remains untouched. Do not create an implementation commit for ignored files.

---

### Task 2: Verify Rendered Logo Geometry and Responsive Safety

**Files:**
- Verify: `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`
- Verify: `.superpowers/brainstorm/1335-1784816109/content/Tavernary_logo.png`

**Interfaces:**
- Consumes: the updated CSS, copied PNG, desktop/mobile preview controls, card-density control, and the first visible project card.
- Produces: rendered desktop, compact, mobile, overflow, asset-request, parser, and console evidence.

- [ ] **Step 1: Reload the existing mockup tab**

Reload `http://localhost:60370/#` through the in-app browser. Restore desktop
preview, standard cards, clear filters, and all projects.

- [ ] **Step 2: Verify the desktop logo and wordmark**

Measure `.brand`, `.brand-logo`, `.brand-copy`, `.brand-name`, and
`.brand-tagline` through the rendered page.

Confirm:

- `.brand-logo` renders at `45px × 60px`;
- the rendered image is the quill-and-inkwell artwork and is not clipped or
  distorted;
- `.brand` computed `column-gap` is `6px`;
- the logo and complete `.brand-copy` block are vertically centered;
- `.brand-name` remains `28.85px`;
- wordmark and tagline text-range left edges differ by less than `0.1px`;
- wordmark and tagline text-range right edges differ by less than `1px`;
- the desktop top-bar height is unchanged from the pre-edit rendered value;
- the page has no horizontal overflow.

- [ ] **Step 3: Verify standard and compact card gaps**

For the first visible card, measure `.function-symbol`, `.kind`, `.identity`,
and `.card-title`.

In standard mode confirm:

- symbol left edge and title left edge differ by less than `0.1px`;
- heading left edge minus symbol right edge is within `0.2px` of `8px`;
- the icon remains frameless, `23px × 23px`, and colored by
  `--kind-color`.

Switch to compact mode and confirm:

- heading left edge minus symbol right edge is within `0.2px` of `6px`;
- wrapper remains `17px × 17px`;
- icon remains `15px × 15px`.

Restore standard mode.

- [ ] **Step 4: Verify the mobile header**

Switch to the 390px mobile preview and confirm:

- `.brand-logo` renders at `41px × 55px`;
- `.brand` computed `column-gap` remains `6px`;
- the artwork is not clipped or distorted;
- brand content and `Submit Project` rectangles do not intersect;
- the page and `#site-preview` have zero horizontal overflow.

Switch back to desktop preview.

- [ ] **Step 5: Inspect desktop and mobile screenshots**

Capture both previews. Confirm the portrait logo is visually legible, sits
close enough to the wordmark to read as one identity, remains centered against
both text lines, and does not overpower the header.

- [ ] **Step 6: Check resource and console logs**

Confirm `Tavernary_logo.png` loaded with HTTP status `200`, then inspect:

```javascript
await tab.dev.logs({ levels: ["error", "warning"], limit: 50 })
```

Expected: `[]`.

- [ ] **Step 7: Run the final source verification**

Rerun Task 1 Step 6 in a fresh PowerShell process.

Expected: `Quill logo and spacing contract passed`.

- [ ] **Step 8: Restore and finalize the deliverable**

Leave the mockup in desktop preview with standard cards, clear searches and
filters, the collapsed capability cloud, and all projects visible. Finalize the
v7 browser tab as the deliverable.

Run:

```powershell
git status --short
```

Expected: no tracked implementation changes because the mockup bundle is
ignored; `?? data/` remains untouched.
