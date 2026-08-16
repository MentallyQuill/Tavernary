# Neutral Activity Indicator Design

## Goal

Remove the visual implication that Tavernary endorses a project's quality or
safety through its activity indicator. Activity remains a factual repository
signal, visually distinct from TavernKeeper risk results.

## Approved presentation

- Replace the visible `N/12` and provisional `~N/12` values with the literal
  label `Activity`.
- Render active weekly bars with the existing title-white
  `--color-text-primary` token.
- Preserve inactive and provisional weekly bars in their existing neutral gray
  treatments.
- Render the newest recency label in `--color-text-primary`, then preserve the
  existing gradual one-month fade to `--color-activity-recent` gray as the
  repository becomes quieter.
- Keep the twelve-week graph, detailed tooltip text, accessibility label,
  evidence status, and underlying activity calculations unchanged.

## Scope

The change is limited to the project-card activity presentation and its tests.
It does not change catalog sorting, activity evidence, TavernKeeper scan colors,
or other semantic color tokens.

## Verification

Automated coverage will assert that project cards show `Activity` rather than a
ratio while retaining the factual tooltip and twelve weekly bars. Style contract
coverage will assert title-white active bars and a title-white-to-gray recency
gradient. Existing unit, visual-contract, and responsive browser tests will be
run to catch layout or presentation regressions on desktop and mobile.
