# README-Based Catalog Enrichment Design

**Status:** Proposed for implementation

**Goal:** Replace generic provisional summaries for GitHub-backed catalog records with concise README-derived descriptions and final metadata, while preserving those editorial fields across every subsequent GitHub snapshot refresh.

## Decisions

- Use the hybrid approach: GitHub refreshes collect factual repository inputs; a separate enrichment pass generates editorial metadata from the repository short description and README.
- Publish generated results automatically after schema, source, and rendered-card validation.
- Generate one factual sentence per card, targeting roughly three visible lines and never exceeding four lines in the existing card summary area.
- Use the GitHub repository short description first, then README content.
- If neither source provides usable description material, write exactly `No README file found.`.
- Treat the fallback as curated and hide the `Provisional details` card state.
- Apply the same process to extensions, presets, and other GitHub-backed project kinds.
- Leave non-GitHub records out of this pass.

## Current contract

The curated registry owns `summary`, `metadata_status`, `primary_function`, `capabilities`, and source identity. The generated GitHub snapshot owns repository facts, activity, community counts, license facts, and refresh health. The catalog builder combines them; it does not derive a summary from a snapshot.

The current card summary is a four-line clamp at 11px text with a 65px summary area. The current intake migration creates generic summaries such as `An extension for SillyTavern.` and marks imported records `provisional`. The current snapshot schema does not include the GitHub repository short description or README content.

## Ownership and overwrite protection

The data flow will have an explicit write boundary:

```text
GitHub refresh
  -> data/snapshots/github/*.json
  -> catalog build
  -> factual card metrics

README enrichment
  -> data/registry/projects/*.json
  -> summary + metadata_status + primary_function + capabilities
  -> catalog build
  -> editorial card content
```

The refresh workflow must only stage snapshot files. It must not stage, generate, normalize, or rewrite files under `data/registry/projects/`. A later snapshot refresh must preserve an enriched registry record byte-for-byte except for intentional registry maintenance.

## Source collection

Extend the GitHub snapshot repository facts with the repository short description and README provenance sufficient for enrichment and auditing:

- `repository.description`: GitHub’s repository description or `null`.
- README availability and source identity: whether a README was found, its path, and the source commit/ref used for retrieval.
- Do not publish the full README into the catalog snapshot. The enrichment runner may retrieve the README content for generation, but the public catalog stores only the resulting summary and provenance needed by the registry contract.

README retrieval must use the repository’s default branch and authenticated GitHub API access when available. Missing, inaccessible, binary, or empty README content is treated as unavailable input rather than a workflow-fatal error for an otherwise healthy repository.

## Enrichment output

For every published GitHub-backed record:

- Replace the generic summary with one source-grounded sentence.
- Set `metadata_status` to `curated` after the output passes validation, including for `No README file found.`.
- Preserve the existing project identity, kind, frontend associations, and catalog timestamps unless a separate metadata decision changes them.
- Assign `primary_function` and `capabilities` only from the existing controlled vocabularies.
- Never infer unsupported capabilities, integrations, or claims from a project name alone.

The generator should prefer the repository short description when it is already specific and factual. Otherwise it should use the README’s opening project description and relevant usage section. README instructions, badges, install commands, changelogs, and author boilerplate should not be copied into the summary.

## Summary limits and validation

The enrichment contract is:

- exactly one sentence;
- no newline, markdown, heading, list, or citation markup;
- target 12–24 words;
- hard maximum 140 characters;
- factual, source-grounded wording;
- exact fallback `No README file found.` when no usable source text exists.

Add a deterministic validator that rejects empty output, multiple sentences, line breaks, markdown artifacts, over-limit text, and vocabulary IDs outside the checked-in vocabularies. Add a rendered-card test at the existing compact and standard card widths to verify the summary remains fully visible within the four-line clamp; the generator should target approximately three lines rather than relying on CSS truncation.

## Generation and publication flow

1. GitHub refresh updates repository snapshots, including the short description and README provenance.
2. Snapshot validation and the existing catalog checks run.
3. The enrichment runner selects GitHub-backed records whose metadata is provisional, whose summary is still a generic intake template, or whose source snapshot changed materially.
4. For each selected record, it retrieves the README input, produces the strict summary and controlled metadata, validates the result, and writes the registry record.
5. The runner emits a machine-readable report containing updated IDs, fallback IDs, source references, validation results, and failures.
6. A successful batch commits registry updates separately from snapshot commits, then rebuilds and deploys the catalog.
7. A later refresh may update factual snapshots but cannot overwrite the registry summaries or curated metadata.

Generation failures should stop publication for the affected batch rather than silently replacing an existing curated summary. A missing README is not a failure; it produces the explicit fallback. GitHub API rate limits, authentication errors, or malformed source data should be reported with the project ID and leave the prior registry record unchanged.

## Testing and acceptance

The implementation is complete when:

- all GitHub-backed records have either a README-derived summary or the exact fallback;
- no GitHub-backed record remains on an intake-template summary;
- all processed GitHub-backed records have `metadata_status: curated` and no `Provisional details` state;
- summaries pass the word, character, sentence, markdown, and rendered four-line checks;
- primary functions and capabilities contain only controlled-vocabulary IDs;
- missing or unusable README input produces `No README file found.` without failing unrelated records;
- a subsequent GitHub refresh changes snapshots and factual metrics without changing enriched summaries or curated metadata;
- non-GitHub records remain untouched by this pass;
- unit, catalog validation, build, typecheck, export, and relevant browser tests pass;
- the publication report provides an auditable count of enriched, fallback, skipped, and failed records.

## Deliberately deferred

- Enrichment of non-GitHub records.
- Manual editorial review queues for automatically generated summaries.
- Full README storage in the public catalog.
- Reclassification of records whose source material does not support a controlled vocabulary assignment.
