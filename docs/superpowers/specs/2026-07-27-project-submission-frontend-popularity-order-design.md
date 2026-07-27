# Project Submission Frontend Popularity Order Design

## Goal

Order the **Supported frontends** choices in the Project Submit form by the
same frontend-card popularity used by the Projects and Kits filter sections.

## Existing Behavior

The submission page derives its options from published frontend catalog cards
and sorts them alphabetically. The catalog filters instead pass frontend
options through `orderFrontendOptionsByPopularity`, which uses only matching
`kind: "frontend"` cards and their `community.aggregate` values.

The shared helper sorts scored frontends by descending aggregate, places
unscored frontends afterward, and resolves ties deterministically by label and
ID.

## Design

Load the catalog once in the server-rendered submission page. Build the same
submission option records as today, then pass those options and the loaded
catalog projects through `orderFrontendOptionsByPopularity` before rendering
`ProjectSubmissionBuilder`.

The client-side builder remains responsible only for searching, selecting, and
serializing the supplied options. Its search continues to filter the ordered
array without re-sorting it, so matching results preserve popularity order.

This reuses the catalog-domain ordering contract without duplicating its
comparator or coupling the client-side submission form to full catalog project
records.

## Data and Submission Semantics

This change affects presentation order only.

- Selected frontend IDs retain the user's selection order.
- The generated project manifest is unchanged.
- Frontend popularity scores and calculations are unchanged.
- Only published frontend cards can provide an option's popularity score.
- Unscored options remain available after scored options.

## Verification

Add a rendered regression test for the submission page that exposes the
Supported frontends controls and asserts their order matches the shared
popularity contract. Run the focused test first through a red-green cycle, then
run the relevant submission and frontend-order unit tests, lint, and the
production build.

## Out of Scope

- Changing the catalog popularity calculation.
- Displaying popularity values in the submission form.
- Reordering selected frontend chips or serialized frontend IDs.
- Changing search, validation, eligibility, or submission behavior.
