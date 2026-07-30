# Manage-Project Searchable Combobox

## Status

Approved on 2026-07-30.

## Problem

The Manage your project listing form currently separates project lookup into a
search field and a native project select. Typing changes the select's options
without showing live results, so the search appears inert and the user must
interact with a second control to finish the same task.

## Design

Replace the search field and native select with one accessible searchable
combobox labeled **Project**.

- Opening or focusing the combobox shows the available projects.
- Typing filters immediately by card name, repository, or project ID.
- Matching projects appear below the input in a fixed-height, scrollable list.
- Each result shows enough identity to distinguish similarly named cards.
- Clicking a result or selecting it with the keyboard commits its project ID,
  displays its card name in the input, and closes the list.
- Typed text is never treated as a project selection by itself.
- Refocusing an unchanged committed selection reopens the available list.
- Editing the committed display text clears the committed selection and begins
  a new search.
- An empty result set displays **No matching projects**.

The combobox supports Arrow Up, Arrow Down, Home, End, Enter, Escape, Tab, and
pointer selection. Its input, popup, active option, selected option, validation
state, and result count use the appropriate combobox/listbox relationships and
announcements.

## Data and Scale

The form continues to receive `OwnerProjectOption` records from
`loadOwnerProjectOptions()`. That loader reads `data/registry/projects` and
`data/registry/sources` during each site build, so deployed project names and
identities stay aligned with the canonical catalog registry without a second
maintained list.

Filtering remains client-side. Scanning and rendering roughly 300 to 500 short
records is inexpensive, and the fixed-height popup prevents the page from
growing with the catalog. Virtualization and remote search are out of scope;
they would add complexity without a benefit at the expected catalog size.

## State and Existing Behavior

Committing a result calls the existing project-selection path, preserving draft
initialization, operation reset, error reset, URL-prefilled selection, and
owner-request behavior. A valid `?project=<id>` value initializes the combobox
with that project selected. Invalid or missing values leave it unselected.

The existing **Select a listed project.** validation remains. The error applies
to the combobox and clears through the existing selection reset behavior.

No registry, catalog-build, route, manifest, GitHub handoff, or owner-authority
contract changes.

## Testing

Component tests will prove:

- one combobox replaces the separate search and select controls;
- focus exposes the project list;
- typing filters by name, repository, and project ID with live visual results;
- an empty filter shows the no-match state;
- pointer and keyboard selection commit only real project IDs;
- arbitrary typed text does not satisfy required-project validation;
- clearing or editing a selected value clears the committed selection;
- Escape closes without selection and focus can reopen the list;
- URL-prefilled projects initialize correctly; and
- selecting a project still resets dependent owner-request state.

Focused component tests, typecheck, lint, formatting, and the relevant Help
end-to-end coverage must pass. The final implementation will also be checked at
desktop and mobile widths to confirm popup scrolling and containment.

## Acceptance Criteria

- Users search and select a project through one control.
- Matching projects are visible while the user types.
- The picker remains usable with at least 300 projects.
- Keyboard and pointer users can complete the same selection flow.
- Only a catalog-backed project can become the committed selection.
- Deployed options automatically reflect the canonical registry used by the
  latest site build.
