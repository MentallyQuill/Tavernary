# Enrichment Quality and Policy Design

**Status:** Approved for planning

**Goal:** Produce warmer, fuller catalog summaries while giving maintainers an
explicit per-project switch that prevents automated enrichment from processing
or overwriting projects that require manual curation.

## Decisions

- Configure the enrichment provider with an explicit temperature of `0.95`.
- Generate natural, source-grounded summaries that target two sentences,
  24-36 words, and at most 220 characters.
- Keep the existing four-line standard-card clamp and one-line compact-card
  treatment.
- Add a required `enrichment_policy` field to every canonical project record.
- Allow `enrichment_policy` to be either `automatic` or `manual`.
- Require a non-empty `enrichment_note` when the policy is `manual`.
- Treat source type, rather than project kind, as the default automation
  boundary.
- Make every published GitHub-backed project automatic by default, including
  GitHub-hosted System Presets.
- Make URL-hosted presets and organization-level records manual by default.
- Allow any GitHub-backed record to be marked manual when its source requires
  special editorial handling.
- Never let `--force`, a stale selection manifest, retry processing, or a
  concurrent run override a manual policy.

## Canonical Record Shape

Canonical project records live in `data/registry/projects/*.json`.
`data/catalog/projects.json` is historical intake data and is not the runtime or
maintenance source of truth.

An automatically enriched project contains:

```json
{
  "enrichment_policy": "automatic"
}
```

A manually curated project contains:

```json
{
  "enrichment_policy": "manual",
  "enrichment_note": "Multi-repository suite; requires manual curation."
}
```

The project schema requires `enrichment_policy` on every record. It permits
`enrichment_note` only as a non-empty string for manual records. Automatic
records omit the note.

`refresh_policy` remains independent:

- `refresh_policy` controls machine-generated GitHub activity and repository
  snapshots.
- `enrichment_policy` controls model-generated editorial fields in the
  canonical project record.

The policy names describe the intended maintenance state directly and avoid the
ambiguity of a broad `skip_github_actions` boolean.

## Source and Project-Kind Rules

Automation follows the evidence source, not the catalog kind:

| Source | Project kind | Default enrichment policy | Behavior |
| --- | --- | --- | --- |
| GitHub repository | frontend | `automatic` | README enrichment allowed |
| GitHub repository | extension | `automatic` | README enrichment allowed |
| GitHub repository | preset | `automatic` | README enrichment allowed |
| Stable external URL | preset | `manual` | Maintainer curates metadata |
| GitHub organization | extension | `manual` | Maintainer curates the aggregate |

The same summary, vocabulary, provenance, and validation contract applies to
GitHub-hosted presets as to other GitHub-backed projects. Presets remain
standardized catalog records; automation only reduces the work required to
extract their source-grounded metadata.

Tavern RPG Suite remains one organization-level card with:

```json
{
  "enrichment_policy": "manual",
  "enrichment_note": "Multi-repository suite; requires manual curation."
}
```

Individual GitHub repositories may also use `manual` when a bundled product,
unusual README, or other documented condition makes automatic enrichment
unsafe. The note records the reason beside the affected project.

## Summary Contract

The provider request explicitly sends:

```json
{
  "temperature": 0.95
}
```

The prompt asks for concise editorial prose grounded only in the supplied
repository description and README:

- exactly two complete sentences;
- 24-36 words total;
- at most 220 characters;
- no Markdown;
- no unsupported claims, popularity language, rankings, or promotional hype;
- the first sentence identifies the project and its primary purpose;
- the second sentence describes a distinctive workflow, capability, or user
  benefit supported by the source.

Temperature alone does not provide the desired tone. The prompt must replace
the current "one factual sentence" instruction with a natural, informative
two-sentence contract, while the validator enforces the new length and shape.

Fallback summaries remain deterministic and exempt from the two-sentence and
word-count requirements. They must continue to use the exact approved fallback
text so missing source material does not cause invented descriptions.

## Selection and Write Protection

Manual policy is enforced at every boundary:

1. **Selection:** batch, canary, scheduled, and targeted selection exclude
   manual records.
2. **Reporting:** skipped manual records use a stable reason code and include
   their project ID and `enrichment_note` in the machine-readable report.
3. **Execution:** `enrichRecord` refuses a manual record even if a caller
   bypasses normal selection.
4. **Write boundary:** immediately before an atomic registry write, the action
   re-reads the canonical record and refuses the write if its current policy is
   manual.
5. **Force and retry:** `--force` and retry processing may reprocess automatic
   records but never override manual policy.

An explicitly targeted manual project produces an informative skipped result,
not a provider call and not a silent success. Batch runs count manual records as
excluded rather than failed.

The final write boundary is authoritative. This protects a maintainer who
changes a record to manual after a rollout manifest was prepared or while
another enrichment run is in progress.

## Intake, Migration, and Existing Records

The schema migration adds `enrichment_policy` to every canonical registry
record:

- `github` source -> `automatic`;
- `url` source -> `manual` with a concise source-specific note;
- `github-organization` source -> `manual` with a concise aggregation note.

Submission and intake paths apply the same defaults. A maintainer may change a
GitHub-backed project to manual before accepting it.

Existing GitHub-hosted presets stay eligible for automatic README enrichment.
Existing URL-hosted presets stay in the manual curation workflow. The approved
manual preset curation design remains valid and does not need to absorb
GitHub-backed presets.

After the new summary contract ships, a controlled forced enrichment rollout
updates existing automatic GitHub-backed records. Manual records remain locked
throughout that rollout. This one-time rollout is required because already
curated records are not normally selected again.

## Workflow and UI

No browser UI or new central exclusion list is required. A maintainer edits the
affected canonical JSON record directly:

```json
"enrichment_policy": "manual",
"enrichment_note": "Requires manual curation because ..."
```

Changing it back to `automatic` and removing the note makes the project
eligible for a later run. Catalog validation catches missing policies,
unsupported values, missing manual notes, and invalid source-policy
combinations before changes merge.

Workflow summaries expose:

- automatic candidates;
- manual exclusions;
- successful enrichments;
- fallbacks;
- failures.

This keeps routine maintenance understandable without requiring maintainers to
cross-reference a second list.

## Verification

Implementation must verify:

- every canonical project record has a valid `enrichment_policy`;
- GitHub frontends, extensions, and presets default to `automatic`;
- URL and organization records are `manual` and carry notes;
- Tavern RPG Suite is manual and cannot be processed or overwritten;
- selection excludes manual records in normal, forced, canary, retry, and
  targeted modes;
- a policy change made after selection is honored at the write boundary;
- the provider request sends temperature `0.95`;
- ready-source summaries require exactly two sentences, 24-36 words, no
  Markdown, and at most 220 characters;
- deterministic fallbacks remain accepted;
- summaries remain legible within the four-line standard-card clamp at desktop
  and mobile widths;
- compact cards retain their one-line ellipsis and expose the full summary
  through the existing title tooltip;
- validation, focused unit tests, the catalog build, and the full repository
  check pass;
- the one-time forced rollout updates automatic records without changing manual
  records.

## Out of Scope

- Automatically enriching URL-hosted preset pages.
- Crawling arbitrary download, social, paste, or document-hosting services.
- Automatically splitting organization-level suites into repository cards.
- Adding a browser-based catalog administration interface.
- Replacing controlled primary-function or capability vocabularies.
- Letting force mode bypass an explicit manual policy.
