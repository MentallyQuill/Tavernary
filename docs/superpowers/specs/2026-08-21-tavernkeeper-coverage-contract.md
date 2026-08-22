# TavernKeeper Coverage Contract

## Goal

Report TavernKeeper risk and JavaScript/TypeScript analysis coverage as separate facts without disrupting existing Catalog v7 consumers.

## Contract

- Catalog v7 remains published at its existing URL and keeps its existing shape.
- Catalog v8 is published at a new stable URL.
- Every TavernKeeper report summary in Catalog v8 includes `javascriptAnalysisStatus` with one of `complete`, `incomplete`, or `legacy`.
- The value comes directly from the validated TavernKeeper report index entry selected for that report. It is never inferred from file extensions, prose, finding counts, or overall completion.
- CatalogCore parses both versions. Parsed v7 reports receive `javascriptAnalysisStatus: null`, meaning the older catalog did not carry the fact; `legacy` remains a distinct scanner-provided value.

## Presentation contract

- Risk describes concern among observed findings. Coverage describes whether JavaScript/TypeScript analysis completed.
- Low risk is described as “Low concern observed,” never as proof that a project is safe.
- Incomplete coverage is described as “Scan incomplete” and explains that some JavaScript/TypeScript code was not fully analyzed.
- Legacy coverage is described as “Coverage not recorded.”
- Incomplete-low results remain installable and do not reuse the material/high confirmation flow.
- Freshness remains independent from both risk and coverage.

## Compatibility and rollout

1. Tavernary publishes v8 beside the unchanged v7 artifact.
2. Companion upgrades to the v8 URL and accepts an existing v7 cache for continuity while immediately refreshing it.
3. Existing Companion versions continue receiving v7.
4. No project owner or extension author must change anything.
