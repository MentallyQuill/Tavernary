# Kit Builder Frontend Discovery Design

**Status:** Approved

**Date:** 2026-07-26

**Scope:** Make the empty Kit Builder Frontend slot teach and initiate the
existing catalog-card selection workflow

## Goal

Users must understand that a Kit's Frontend is added from a catalog card rather
than selected inside the Kit Builder. The empty Frontend slot becomes an
explicit shortcut to the existing Frontend project-kind filter while clearly
describing the next action.

The shortcut must never apply an invisible filter. It changes the same catalog
query state used by the visible **Frontend** checkbox, active-filter summary,
URL, and project results. Users can remove the filter through the normal
checkbox or active-filter control.

## Interaction

When the Kit draft does not contain a Frontend, the empty slot renders as one
button:

- primary copy: **Add a Frontend**
- supporting copy: **Choose one from the catalog cards**
- accessible name: **Show Frontend cards**

Activating the button adds `frontend` to the existing `query.kinds` array. It
does not maintain separate component state, toggle the filter off, or clear the
current search, category, sort, density, or other filters. If `frontend` is
already present, activation leaves the query unchanged.

Because the normal query is updated:

- the visible **Frontend** project-kind checkbox becomes checked;
- the active-filter summary shows the Frontend filter;
- the URL serializes the Frontend filter normally;
- the catalog results update through the existing project selector;
- the user can uncheck or remove the filter through existing controls.

The filtered project cards retain their established behavior. The card body
opens GitHub, and the visible `+` control selects that Frontend for the Kit.
Applying the selection through the existing selection dock adds or replaces the
draft Frontend.

When the draft contains a Frontend, the slot keeps its current selected-project
presentation, desktop drag-to-remove affordance, and explicit removal control.

## State Ownership

`CatalogPage` remains the owner of `CatalogQuery`. It provides a focused
callback to the Kit Builder for revealing Frontend cards. The callback performs
an idempotent union of `frontend` into `query.kinds` through `setQuery`.

The Kit Builder owns no filter state. `KitBuilderPanel`, `KitBuilder`, and
`KitFrontendSlot` only pass and invoke the callback while the slot is empty.
The existing filter panel, active-query display, URL serializer, and project
selector all continue to derive from the shared catalog query.

## Visual and Accessibility Contract

The empty slot keeps the Frontend border and background language so it remains
visually part of the Kit composition. Its new button treatment must:

- look actionable at rest without resembling a selected Frontend card;
- expose clear hover, active, and keyboard-focus states using existing semantic
  color and focus tokens;
- preserve the current Kit Builder width and mobile layout;
- keep both lines readable without clipping at supported widths;
- use native button keyboard behavior;
- expose its purpose independently of the visible copy.

The selected Frontend state remains unchanged. The shortcut is absent whenever
a Frontend is already in the draft.

## Edge Cases

- Existing search and filters may combine with the Frontend kind filter and
  produce no results. The shortcut does not silently discard those choices;
  the visible filter controls and active-query summary let the user adjust
  them.
- Repeated activation is idempotent and must not uncheck Frontend.
- Manual removal of the Frontend filter immediately restores the user's normal
  catalog query behavior.
- Removing a Frontend from the draft restores the actionable empty slot.
- Mobile continues to use the same shared query. The checked state is visible
  when the existing filter sheet is opened, and the active-filter summary
  exposes the applied filter in the catalog.

## Testing and Verification

Implementation follows red-green-refactor TDD.

Component and integration tests verify:

- the empty slot renders the two-line instruction as a button named
  **Show Frontend cards**;
- activating it adds `frontend` through the shared catalog query;
- activation preserves existing filters and is idempotent;
- the normal Frontend checkbox becomes checked;
- the active-filter summary and URL reflect the filter;
- catalog results update to the filtered project set;
- manually unchecking Frontend removes the filter;
- selecting and applying a Frontend through its card still populates the slot;
- the selected slot retains its current remove and drag behavior;
- removing the draft Frontend restores the shortcut;
- desktop and mobile layouts do not clip or overflow the new copy;
- hover, focus, and active states are visible and theme-token compliant.

Rendered verification must run against a freshly generated static export before
Playwright checks. Desktop and mobile proof should exercise the shortcut,
visible filter state, card selection, populated slot, and manual filter removal.

## Out of Scope

- a new Frontend picker inside the Kit Builder;
- automatically adding a Frontend to the draft;
- hidden or Kit-Builder-local filter state;
- clearing unrelated search or filter choices;
- changing project-card links, `+` controls, or batch application;
- changing Extensions & Presets selection behavior;
- changing Kit validation, submission, persistence, or moderation.
