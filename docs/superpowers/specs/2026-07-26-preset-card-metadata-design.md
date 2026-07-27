# Preset Card Metadata Design

## Goal

Remove low-value absence labels from curated external System Preset cards while
preserving real preset facts and warnings that require user attention.

## Problem

External presets do not necessarily have GitHub repository evidence. The
current card treats missing repository facts as visible metadata:

- `Manual source`
- `Activity unavailable`
- `Release unavailable`
- `Popularity unavailable`
- `Repository size unavailable`

These labels dominate the card despite describing either implementation
provenance or fields that do not apply. Version information may also already be
visible in the preset header, making the release fallback redundant.

## Display Rules

System Preset cards use a type-aware metadata policy:

1. Show known preset facts:
   - version;
   - publication date; and
   - artifact file size.
2. Omit a preset fact when its value is unknown. Do not replace it with an
   unavailable-state label.
3. Do not show repository activity, popularity, or repository size absence on
   presets without repository evidence.
4. Do not show `Manual source`; manual curation is an internal provenance fact,
   not a user-facing warning.
5. Preserve actionable state:
   - provisional or pending details;
   - stale source information;
   - license status, including a missing license.
6. Leave Frontend and Extension card behavior unchanged.

A future explicit broken-source state would also be actionable, but this change
does not introduce a new catalog or source-status state.

For Pura's Director v15.0, the resulting card keeps `v15.0`, its title,
summary, tags, and `Missing` license state. The five-item fallback line is not
rendered.

## Accessibility

Hidden unavailable fields must also be omitted from the card's accessible
description. Known facts and actionable warnings remain available through the
existing visible text, accessible description, and tooltip behavior.

## Implementation Boundary

The change belongs in the project-card presentation logic. Registry records and
the generated catalog retain their existing null values and source-status
semantics; the card decides which facts are useful to display.

## Verification

Focused component tests will prove that:

- curated manual presets do not render the five low-value labels;
- known preset publication and file-size facts still render;
- version and license status still render;
- actionable pending and stale states remain visible;
- removed labels are absent from the accessible description; and
- representative Frontend and Extension cards retain their existing metadata.

The normal catalog checks and browser card tests will guard layout and
interaction behavior.
