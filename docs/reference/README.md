# Reference and contracts

## Visual and immutable references

- `mockups/catalog-wall-responsive-v7.html` is the immutable visual acceptance
  fixture for V1.
- `assets/tavernary-logo.png` and `assets/icons/*.svg` are source design assets.

Do not use reference fixtures as runtime imports. Production builds read from
`public/` and source code.

## Machine contracts

- [Project record schema](project-record-schema.md)
- [GitHub snapshot schema](github-snapshot-schema.md)
- [Catalog statuses and manifests](catalog-statuses-and-manifests.md)
- [Controlled vocabularies](controlled-vocabularies.md)
- [Enrichment run report contract](catalog-enrichment-report.md)

## Operational outputs

- `data/snapshots/github-refresh.json`: latest sanitized refresh manifest.
- `data/snapshots/github/*.json`: generated GitHub evidence.
- `data/snapshots/github/kits/*.json`: kit reaction snapshots.
- `data/reports/enrichment-report.json`: latest enrichment run report.
- `src/generated/catalog.json`: generated browser input artifact.

Current contracts are the source of truth for contributions, validation, and
ops review. For historical implementation rationale and V1 context, read
[`production-development-handoff.md`](../architecture/production-development-handoff.md).
