# Graphite Teal Theme Design

**Date:** 2026-07-25
**Status:** Approved

## 1. Objective

Adopt the supplied Graphite Teal theme across Tavernary as one canonical,
site-wide color system. Preserve every supplied color value exactly while
leaving layout, typography, copy, responsive behavior, interaction behavior,
motion, logos, favicons, illustrations, and other brand artwork unchanged.

The migration must be semantic rather than a direct hex substitution.
Graphite defines structure, teal defines general interaction and selection,
crimson identifies Frontends, mint identifies System Presets, and heritage
orange identifies functional categories and primary actions. Dedicated status
colors remain separate from project classification.

## 2. Canonical Token Architecture

Replace the existing compact color vocabulary in `src/styles/tokens.css` with
the complete supplied Graphite Teal token set. The new variables are the sole
canonical production color system; do not retain the old variables as aliases.

### 2.1 Foundation mapping

| Existing role | New canonical role |
| --- | --- |
| `--color-page` | `--color-bg-canvas` |
| Header surface | `--color-bg-header` |
| Navigation and filter sidebar | `--color-bg-sidebar` |
| `--color-surface-primary` | Contextual background token |
| `--color-surface-card` | `--color-bg-surface` |
| `--color-surface-raised` | Raised, hover, or active token by state |
| `--color-border` | Subtle, default, or divider token by context |
| `--color-border-strong` | Strong or hover border token by state |
| Existing text tokens | Primary, secondary, muted, disabled, heading, inverse, or link token by role |
| Generic mint focus and selection | Teal interaction and focus tokens |
| `--color-kind-frontend` | Frontend token family |
| `--color-kind-preset` | Preset token family |
| `--color-kind-extension` | Functional or primary-action token family by meaning |
| `--color-filled-control-text` | Action text, inverse text, or checkmark token by control |

Variables that currently serve unrelated purposes must be split at their
selector sites. In particular, mint must no longer simultaneously mean Preset,
focus, temporary selection, activity, and licensing.

### 2.2 Exact token values

Use the following supplied values without modification:

```css
:root {
  --color-bg-canvas: #0D1117;
  --color-bg-header: #101820;
  --color-bg-sidebar: #121A1F;
  --color-bg-surface: #182228;
  --color-bg-surface-raised: #1C282E;
  --color-bg-surface-hover: #223138;
  --color-bg-surface-active: #153B39;
  --color-bg-input: #10191E;
  --color-bg-overlay: #202C32;
  --color-bg-disabled: #171F23;

  --color-border-subtle: #223038;
  --color-border-default: #2B3A40;
  --color-border-strong: #3E535B;
  --color-border-hover: #506870;
  --color-divider: #26363D;

  --color-text-primary: #E6EDF3;
  --color-text-secondary: #A8B3BA;
  --color-text-muted: #829099;
  --color-text-disabled: #5F6B72;
  --color-text-inverse: #0D1117;
  --color-heading: #F0F5F7;
  --color-link: #6EE7D8;
  --color-link-hover: #99F6E4;

  --color-accent-teal: #2DD4BF;
  --color-accent-teal-hover: #5EEAD4;
  --color-accent-teal-pressed: #14B8A6;
  --color-accent-teal-muted: #238F85;
  --color-accent-teal-bg: #153B39;
  --color-accent-teal-bg-hover: #1B4A46;
  --color-accent-teal-border: #28635E;
  --color-accent-teal-text: #8CE9DE;
  --color-focus-ring: #5EEAD4;

  --color-frontend: #D62839;
  --color-frontend-hover: #E33B4C;
  --color-frontend-pressed: #B71F30;
  --color-frontend-bg: #35181F;
  --color-frontend-bg-hover: #431D25;
  --color-frontend-border: #7C2936;
  --color-frontend-text: #FF8B95;

  --color-preset: #57C5A3;
  --color-preset-hover: #72D4B6;
  --color-preset-pressed: #3EAC8C;
  --color-preset-bg: #15352E;
  --color-preset-bg-hover: #1B443A;
  --color-preset-border: #347A67;
  --color-preset-text: #8BE0C5;

  --color-functional: #E18A24;
  --color-functional-hover: #F0A145;
  --color-functional-pressed: #C87416;
  --color-functional-bg: #3B2814;
  --color-functional-bg-hover: #4A3217;
  --color-functional-border: #8A5720;
  --color-functional-text: #FFC171;

  --color-action-primary-bg: #E18A24;
  --color-action-primary-hover: #F0A145;
  --color-action-primary-pressed: #C87416;
  --color-action-primary-text: #161008;
  --color-action-secondary-bg: #1C282E;
  --color-action-secondary-hover: #26363D;
  --color-action-secondary-border: #3E535B;
  --color-action-secondary-text: #E6EDF3;

  --color-control-bg: #10191E;
  --color-control-bg-hover: #172329;
  --color-control-border: #304249;
  --color-control-border-hover: #486068;
  --color-control-border-focus: #2DD4BF;
  --color-control-text: #E6EDF3;
  --color-control-placeholder: #718087;
  --color-checkbox-bg: #121A1F;
  --color-checkbox-border: #506168;
  --color-checkbox-checked: #2DD4BF;
  --color-checkbox-checkmark: #071413;

  --color-success: #3FB950;
  --color-success-bg: #16351F;
  --color-success-border: #2E6B3D;
  --color-success-text: #7EE787;
  --color-warning: #D29922;
  --color-warning-bg: #3A2D12;
  --color-warning-border: #7A5B18;
  --color-warning-text: #E3B341;
  --color-danger: #F85149;
  --color-danger-bg: #3D1B1F;
  --color-danger-border: #8C2F35;
  --color-danger-text: #FF7B72;
  --color-info: #58A6FF;
  --color-info-bg: #162B45;
  --color-info-border: #315F91;
  --color-info-text: #79C0FF;

  --color-activity-current: #2DD4BF;
  --color-activity-recent: #829099;
  --color-activity-dormant: #5F6B72;
  --color-progress-track: #26363D;
  --color-progress-fill: #57C5A3;
  --color-license-open: #57C5A3;
  --color-license-proprietary: #A8B3BA;
  --color-license-missing: #829099;

  --shadow-card:
    0 1px 2px rgb(0 0 0 / 24%),
    0 4px 12px rgb(0 0 0 / 12%);
  --shadow-overlay:
    0 12px 32px rgb(0 0 0 / 40%);
}
```

Non-color layout tokens such as radii, heights, maximum widths, and motion
values remain in the token file unchanged.

## 3. Component Remapping

### 3.1 Application structure

- The document and page canvas use `--color-bg-canvas`.
- The site header uses `--color-bg-header`.
- The category/navigation strip and filter sidebar use
  `--color-bg-sidebar`.
- Cards and ordinary panels use `--color-bg-surface`.
- The Kit Builder and elevated in-page panels use
  `--color-bg-surface-raised`.
- Modals, popovers, and detached menus use `--color-bg-overlay`.
- Inputs and selects use the form-control token family.
- Disabled regions use `--color-bg-disabled` and disabled text.

### 3.2 Navigation and general interaction

- Active navigation uses the teal background, border, and text family.
- All Projects uses teal as its identifying mark.
- Kits is neutral when inactive and teal when selected.
- A category icon keeps its classification color inside a teal selected
  navigation container.
- Links, focus rings, search focus, range-control interaction, and transient
  selection use teal.
- Hover and pressed states use the exact supplied state tokens rather than
  opacity or generated colors.

### 3.3 Project cards and classification

- Default cards use the graphite surface, default border, and approved card
  shadow.
- Hover uses the supplied hover surface and hover border.
- Keyboard focus uses the teal focus treatment.
- Frontend identity uses crimson for graphical accents and
  `--color-frontend-text` for compact text.
- System Preset identity uses the mint token family.
- Generation and Reasoning, Character and Worldbuilding, RPG Systems and
  Suites, Memory and Retrieval, Interface and Workflow, Developer
  Infrastructure, and Uncategorized use the orange functional family.
- Icons and labels continue to distinguish individual functional categories.
- Cards do not gain full-color category backgrounds or accent stripes.
- Color never carries classification without an accompanying label or symbol.

### 3.4 Kits and primary actions

- A temporarily selected project uses the teal selection treatment, replacing
  the former mint outline.
- Persistent In Kit state remains orange.
- Add and remove controls remain explicit and separate from the card body,
  which continues to open GitHub.
- Primary add and submission controls use the orange primary-action family.
- Secondary controls use the supplied secondary-action family.
- Builder section identity follows project classification: Frontend crimson,
  Preset mint, and functional orange.

### 3.5 Metadata and status

- Current activity is teal; recent and dormant activity use their supplied
  greys.
- Progress uses the graphite track and mint fill.
- Open licensing is mint; proprietary and missing licensing use neutral greys.
- Success, warning, danger, and information use only their dedicated semantic
  families.
- Crimson Frontend styling is not reused for errors. Labels and icons make
  both meanings explicit.

### 3.6 About and document surfaces

Replace the undefined `--color-accent` currently used by About-page links with
`--color-link`, and use `--color-link-hover` for their hover state. Update the
inline document background in `src/app/layout.tsx` from `#07181d` to the exact
canvas value `#0D1117` so the pre-CSS first paint matches the theme.

## 4. Scope Boundaries

This change includes:

- canonical tokens;
- production CSS and TSX color assignments;
- hover, pressed, focus, selected, disabled, and status states;
- palette enforcement;
- unit, visual, end-to-end, build, and export verification.

This change excludes:

- layout or spacing changes;
- typography changes;
- copy changes;
- interaction redesign;
- responsive behavior changes;
- motion changes;
- recoloring raster logos, favicons, illustrations, or other artwork;
- adding a user-selectable theme or light mode.

## 5. Palette Enforcement

Update `scripts/audit-palette.mjs` so production sources may use only:

1. the exact supplied Graphite Teal hex values;
2. the three exact translucent-black shadow values in `--shadow-card` and
   `--shadow-overlay`;
3. `transparent`, `currentColor`, and `inherit`;
4. the single activity interpolation
   `color-mix(in srgb, var(--color-activity-current) var(--commit-freshness), var(--color-activity-recent))`.

The audit must continue rejecting:

- any other hex value;
- named colors;
- arbitrary functional color notation;
- arbitrary `color-mix()` expressions;
- partial opacity outside the three translucent-black values inside the
  `--shadow-card` and `--shadow-overlay` declarations in
  `src/styles/tokens.css`.

Tests must prove both acceptance of the canonical theme and rejection of
unauthorized colors.

## 6. Verification

### 6.1 Unit and contract coverage

Update existing palette and visual-contract tests and add assertions for:

- exact canonical token values;
- removal of legacy production color tokens;
- graphite canvas, header, sidebar, cards, overlays, and controls;
- teal navigation, links, focus, and temporary selection;
- crimson Frontend, mint Preset, and orange functional identity;
- teal pending Kit selection and orange persistent In Kit state;
- orange primary actions and graphite secondary actions;
- form-control hover, focus, checked, placeholder, and disabled states;
- dedicated activity, progress, licensing, and semantic-status roles;
- permitted shadows and rejected unauthorized color syntax.

### 6.2 Visual and behavioral coverage

Use the existing visual and end-to-end suites to inspect desktop and mobile
versions of:

- Catalog;
- Kits;
- Kit Builder;
- About;
- first paint and static export.

Review default, hover, focus-visible, pressed, selected, persistent,
disabled, empty, and overlay states where the test harness exposes them.

### 6.3 Accessibility

The supplied values are immutable. Accessibility failures must be corrected by
choosing the correct supplied foreground/background token pairing, adding or
retaining text and icon cues, or changing the non-color presentation. Do not
alter the supplied values.

### 6.4 Completion gate

Run the repository's complete check so formatting, linting, palette
enforcement, catalog validation, type checking, unit tests, production build,
and static export agree. Run the existing catalog and Kits end-to-end and
visual suites after the complete check.

## 7. Acceptance Criteria

The migration is complete when:

- every supplied token exists with its exact supplied value;
- no legacy production color token remains in use;
- every production color assignment has one clear semantic role;
- general interaction is teal;
- category identity is crimson, mint, or orange as specified;
- temporary Kit selection is teal and persistent Kit membership is orange;
- status colors are not reused for category identity;
- arbitrary production colors remain audit failures;
- no layout, responsive, interaction, motion, or artwork regression is
  introduced;
- the full automated and visual verification suite passes.
