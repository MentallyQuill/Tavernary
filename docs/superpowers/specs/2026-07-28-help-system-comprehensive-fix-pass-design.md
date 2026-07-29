# Help System Comprehensive Fix Pass

## Summary

This pass repairs the mobile spacing and overlap defects visible in the Help
forms, then closes the adjacent formatting, validation, review-navigation, and
owner-request workflow gaps found during the bug hunt. It does not redesign
the Help information architecture or change any request manifest.

## Confirmed root causes

- Every interactive Help form uses `className="help-form"`, but the Help
  stylesheet has no `.help-form` layout rule. Direct form children therefore
  render with zero vertical separation.
- The Kit report's affected-project fieldset bypasses the shared
  `HelpChoiceGroup`, so it receives browser-native borders and fieldset
  spacing.
- Four Kit-report strings contain mojibake rather than a real em dash or
  ellipsis.
- The Kit-author routing reminder is rendered in both the page lead and the
  form.
- Several required selects and choice groups expose `aria-invalid` without an
  associated inline error. Conditional select guidance is not consistently
  included in `aria-describedby`.
- Returning from the review screen remounts the form without restoring focus.
- The owner-request lifecycle workflow starts a successful no-op job for every
  closed pull request before its script decides the PR is unrelated.

## Design

### Shared form layout

`.help-form` will use the same `display: grid` and `18px` vertical gap contract
as the existing submission form. The rule applies to all five interactive Help
routes and preserves the existing field-internal `8px` gap. Help forms must
remain free of horizontal overflow at 320px.

### Shared accessible controls

`HelpSelectField` will become the single wrapper for Help selects. It will
render the persistent label, optional hint, optional inline error,
`aria-invalid`, and a merged `aria-describedby` value.

`HelpChoiceGroup` will accept an optional hint and will expose both hint and
error IDs through `aria-describedby`. An errored choice group will also expose
`aria-invalid="true"`. The Kit affected-project control will use this shared
component, removing native fieldset presentation.

The project, Kit, website, other-help, and owner forms will use these
primitives for their selects. Owner request type, repository move, and delist
confirmation errors will appear next to the corresponding control as well as
in the focusable error summary.

### Review focus

`HelpReview` will accept a `returnFocusId`. Back and Cancel will retain their
existing state behavior, then focus that stable form control after React
remounts the form. Each form will choose its first durable input or select as
the return target.

### Kit formatting and routing

All corrupt Kit ellipses and em dashes will be replaced with Unicode `…` and
`—`. The Kit-author routing reminder will remain inside `KitReportForm`, where
its two existing links are tested, and the duplicate page-lead reminder will be
removed.

### Owner-request Actions routing

The owner-request lifecycle job will have a job-level condition matching only
`automation/project-owner-request-` head branches. Unrelated closed PR events
will still appear as GitHub workflow runs because `pull_request` cannot filter
by head-branch prefix, but their job will be skipped before checkout or Node
setup. The in-script exact marker and repository checks remain defense in
depth.

The Actions user guide will document the public Help triage path, owner request
triage/generation/review lifecycle, the branch guard, and manual recovery
entrypoints.

## Verification

- Unit tests prove select/choice error associations, review focus restoration,
  Kit formatting, owner inline validation, and the lifecycle job guard.
- Playwright at 320px proves all interactive Help forms have nonzero direct
  child spacing, no horizontal overflow, one Kit-author reminder, no mojibake,
  and a themed affected-project choice group.
- Existing Help E2E flows prove manifests and GitHub handoffs are unchanged.
- The full repository check and focused visual suite must pass.

## Non-goals

- Changing Help manifests, Issue Form field IDs, labels, or public URLs.
- Automatically merging owner request pull requests.
- Replacing GitHub as the public request and identity layer.
- Centralizing all PR lifecycle workflows behind a new dispatcher.
