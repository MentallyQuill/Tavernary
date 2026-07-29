# Catalog Tag System and Metadata Policy Schema v6

## Status

Approved for implementation on 2026-07-29.

## Summary

Tavernary will replace its sparse capability labels with a curated discovery
taxonomy built around two user-facing facets:

- **Goals** describe what someone is deliberately trying to accomplish.
- **Traits** describe how a project behaves or what meaningfully distinguishes
  it.

Every catalog card may have zero to six tags. Frontend compatibility, project
kind, model family, and completion format remain separate structured metadata
and do not count toward that limit.

The project schema advances from version 5 to one combined version 6. This
cutover incorporates the source/card separation approved by the companion
Multi Projects design: repository identity, refresh, snapshots, and destructive
source lifecycle belong to a non-public source record, while tags, summaries,
and their independent editorial policies belong to each card.

TavernAI selects automatic tags and summaries from the root README as primary
evidence and the repository description as secondary evidence. Verified
repository owners and trusted Tavernary editors may instead set either field
manually. Community submitters retain the ability to suggest the existing
structured compatibility and context fields, but cannot override source-derived
display names or manual summary/tag authority.

## Context

The current capability system has three related problems:

1. Many cards have only frontend compatibility and little useful discovery
   metadata.
2. The capability vocabulary is too coarse for the larger catalog.
3. The existing filter and intake controls do not scale cleanly to roughly one
   hundred discoverable concepts.

The existing `enrichment_policy` also protects summary and capabilities as one
unit. That is too broad. An owner may want to write a summary while allowing
TavernAI to maintain tags, or choose tags while allowing TavernAI to refresh the
summary.

The Multi Projects work exposes another boundary: several cards may share one
repository source while retaining different goals, traits, summaries, and
compatibility metadata. Source evidence can be fetched once, but classification
and policy remain card-specific.

## Goals

- Provide a focused, searchable taxonomy based on deliberate discovery needs.
- Populate the complete catalog from current repository evidence.
- Keep the vocabulary useful at approximately one hundred entries without
  turning the filter rail or intake form into a long checklist.
- Store raw README evidence and source metadata locally for repeatable future
  analysis without committing the corpus.
- Refresh the local corpus only through an explicit incremental command.
- Select automatic tags at project intake and package them with the generated
  pull request.
- Let verified owners and trusted editors independently choose manual summary
  and tag modes.
- Ignore unauthorized manual summary and tag content completely.
- Preserve permissive community intake for existing structured fields and
  additional context.
- Keep automated validation quiet: block structural failures, not subjective
  semantic disagreements.
- Migrate the entire canonical project registry in one coordinated cutover.
- Integrate cleanly with source-backed peer cards and source-owned evidence.

## Non-goals

- Treating tags as an unconstrained folksonomy.
- Allowing submitters to create new vocabulary entries.
- Automatically adding tags to the vocabulary during intake.
- Inferring whether one repository contains several independently listable
  cards.
- Moving frontend, project kind, model family, or completion format into tags.
- Adding public suite, subtype, component, variant, or parent-card metadata.
- Summarizing or rewriting the local README corpus.
- Persisting full classifier evidence in each public project record.
- Creating staff alerts for ordinary uncertainty or mild semantic disagreement.
- Automatically rewriting manual metadata.
- Supporting mixed version-5 and version-6 canonical project records.

## Relationship to the Multi Projects Source Registry

The source-registry feature owns:

- canonical source records;
- project `source_id` conversion;
- source-owned refresh policy and repository snapshots;
- card listing lifecycle and source delisting;
- source-aware Help operations and publication transactions; and
- shared source loading for sibling cards.

This tag-system feature owns:

- the final version-6 tag and metadata-policy fields;
- the curated tag vocabulary;
- raw evidence-corpus tooling;
- automatic summary/tag selection;
- project-submission summary/tag controls;
- tag-aware owner/editor card editing;
- scalable catalog filtering;
- the complete tag backfill; and
- tag-specific tests and reports.

The source-registry implementation may exist as an intermediate branch, but the
default branch must receive one coherent final version-6 project contract. It
must never contain two different canonical shapes both described as version 6.
The tag implementation will therefore integrate the stable source-registry
branch before final migration and verification.

## Core Invariants

1. Every canonical project record has `schema_version: 6`.
2. Every card references exactly one canonical `source_id`.
3. Tags and metadata policy are card-owned even when sibling cards share a
   source.
4. A card has between zero and six unique tag IDs.
5. Every tag ID exists in the tracked vocabulary and applies to the card kind.
6. Frontends, project kind, model families, and completion formats are not
   tags.
7. Summary and tag policies are independent.
8. An automatic policy has no manual note.
9. A manual policy has a trusted, automation-generated provenance note.
10. Only verified repository owners and trusted Tavernary editors can establish
    manual summary or tag policy.
11. Unauthorized manual summary/tag values are discarded, not treated as
    evidence or suggestions.
12. Automatic classification selects only existing vocabulary IDs.
13. Inconclusive evidence may produce zero tags without blocking publication.
14. Manual fields are never overwritten by automated enrichment.
15. Repository evidence is fetched once per source but interpreted separately
    for each card.
16. Goals use OR semantics, traits use OR semantics, and the two facets combine
    with AND.
17. Canonical version-5 and version-6 project records may not coexist.

## Canonical Project Schema

The combined version-6 project record has the source-backed card shape from the
Multi Projects design and the metadata fields below:

```json
{
  "schema_version": 6,
  "id": "aikohanasaki-sillytavern-memorybooks",
  "source_id": "github-1001051404",
  "name": "SillyTavern MemoryBooks",
  "kind": "extension",
  "summary": "Automatically creates structured scene memories and stores them as lorebook entries.",
  "metadata_status": "curated",
  "frontends": ["sillytavern"],
  "primary_function": "memory-retrieval",
  "tags": [
    "maintain-long-term-memory",
    "manage-lorebooks",
    "automated-workflow"
  ],
  "cataloged_at": "2026-07-23T00:00:00Z",
  "catalog_cohort": "standard",
  "listing_status": "active",
  "listing_status_reason": null,
  "metadata_policy": {
    "summary": {
      "mode": "automatic"
    },
    "tags": {
      "mode": "automatic"
    }
  }
}
```

Preset-only `model_families` and `completion_formats` remain unchanged.

Version 6 removes these project fields:

- inline `source`;
- project-owned `refresh_policy`;
- `visibility` and `visibility_reason`, as defined by the source-registry
  migration;
- `capabilities`;
- `enrichment_policy`; and
- `enrichment_note`.

It adds:

- `source_id`;
- `listing_status` and `listing_status_reason`;
- `tags`; and
- `metadata_policy`.

`metadata_status` remains separate. It describes editorial maturity, not who
controls future summary or tag updates.

## Metadata Policy

Summary and tag policy entries use exact discriminated shapes:

```json
{
  "mode": "automatic"
}
```

or:

```json
{
  "mode": "manual",
  "note": "Verified repository owner selection."
}
```

Allowed trusted notes are generated by Tavernary automation rather than copied
from form input. Initial controlled messages are:

- `Verified repository owner selection.`
- `Trusted Tavernary editor selection.`
- a migrated summary note copied from a previously trusted
  `enrichment_note`, when applicable.

Manual notes are required, non-empty, bounded strings. Automatic entries reject
`note`.

The policy matrix is independent:

| Summary | Tags | Automated behavior |
| --- | --- | --- |
| automatic | automatic | Generate and refresh both. |
| manual | automatic | Preserve summary; generate and refresh tags. |
| automatic | manual | Generate and refresh summary; preserve tags. |
| manual | manual | Preserve both. |

Source refresh remains governed by the source record's `refresh_policy` and is
not inferred from metadata policy.

## Tag Vocabulary

`data/vocabularies/tags.json` is the single tracked source of truth. It has a
schema and a versioned document:

```json
{
  "schema_version": 1,
  "tags": [
    {
      "id": "maintain-long-term-memory",
      "label": "Maintain long-term memory",
      "facet": "goal",
      "description": "Preserve and retrieve important context across long conversations.",
      "aliases": ["memory", "persistent context", "long-term context"],
      "applicable_kinds": ["extension", "preset"],
      "inclusion_guidance": [
        "The project explicitly stores, retrieves, consolidates, or injects durable conversation memory."
      ],
      "exclusion_guidance": [
        "Do not use for ordinary chat history display without durable memory behavior."
      ]
    }
  ]
}
```

Vocabulary rules:

- IDs are stable lowercase kebab-case.
- Labels are concise user-facing actions or traits.
- Every tag has exactly one `goal` or `trait` facet.
- Descriptions explain the discovery meaning, not implementation detail.
- Aliases improve search and classifier recall but are not additional tags.
- Applicable kinds constrain obviously irrelevant selections.
- Inclusion and exclusion guidance are classifier instructions.
- Duplicate normalized labels, IDs, or aliases are invalid.
- No tag is added merely because it appears once in the corpus.
- Similar concepts are combined when users would not deliberately distinguish
  them while filtering.

The static browser payload receives only:

- `id`;
- `label`;
- `facet`;
- `description`;
- `aliases`; and
- `applicable_kinds`.

Classifier-only inclusion and exclusion guidance are stripped during catalog
build.

## Taxonomy Discovery

The initial taxonomy is derived from the complete local evidence corpus.
Existing capability IDs may seed candidate searches, but they are not blindly
translated into final tags.

Discovery proceeds in four stages:

1. Extract candidate goals and traits for each card with direct evidence.
2. Normalize wording and combine synonyms.
3. Report frequency, applicable kinds, representative evidence, and ambiguous
   boundaries.
4. Curate the tracked vocabulary and then classify every card against that
   closed set.

The discovery command produces a local candidate report. It never modifies
`tags.json` automatically. Intake classification never expands the taxonomy.

The taxonomy should be as granular as deliberate discovery requires. It has no
arbitrary target count, but it must represent recurring catalog concepts well
enough that the larger catalog is materially more discoverable than the
current capability set.

## Local Evidence Corpus

Evidence is source-owned so sibling cards do not duplicate the same README:

```text
local-data/
  catalog-evidence/
    github/
      1001051404/
        README.md
        source.json
    codeberg/
      1699613/
        README.md
        source.json
```

The exact repository README filename and bytes are preserved. `source.json`
contains:

- provider;
- `source_id`;
- immutable repository ID when available;
- canonical repository location;
- default branch;
- README path and download URL;
- fetched commit SHA;
- ETag or provider equivalent when available;
- content SHA-256;
- fetch time; and
- outcome when the root README or repository description is unavailable.

Repository description may be stored in `source.json`; it does not require a
rewritten text artifact.

`local-data/catalog-evidence/` is ignored by Git. The corpus is neither a
generated public artifact nor part of package publication.

The evidence command:

- refreshes explicitly, never on a schedule;
- supports all sources and selected source/project IDs;
- resolves a project ID through its source;
- uses conditional requests or commit identity to skip unchanged content;
- writes atomically per source;
- reports fetched, unchanged, missing, and failed counts;
- preserves the last valid raw evidence when a refresh request fails; and
- never writes canonical project metadata.

At intake, automation fetches source evidence transiently. It does not compare
the new project against the entire corpus. The corpus informs the vocabulary;
the current source evidence informs classification.

## Automatic Summary and Tag Selection

TavernAI receives:

- the root README as primary evidence;
- the repository description as secondary evidence;
- the card's source-derived display name;
- card kind and existing structured compatibility context;
- the public tag vocabulary fields plus classifier guidance; and
- instructions to return only supported structured JSON.

It does not use unauthorized manual summary or tag text. Additional context
remains available to maintainers but is not promoted to evidence for automatic
summary or tag claims.

One request may generate whichever automatic fields are needed:

```json
{
  "summary": {
    "value": "A concise 24–30 word project description.",
    "evidence": ["readme:12-18"]
  },
  "tags": [
    {
      "id": "maintain-long-term-memory",
      "evidence": ["readme:42-55"]
    }
  ]
}
```

The runtime contract validates:

- only requested automatic fields are returned;
- summary length and existing style constraints;
- zero to six unique vocabulary IDs;
- applicable project kinds; and
- at least one compact evidence reference per selected tag.

Evidence references and generator/vocabulary versions belong to the enrichment
report or publication transaction, not the canonical card.

Malformed output receives one bounded repair attempt under the existing durable
enrichment pattern. If tags remain malformed or evidence is inconclusive,
Tavernary uses an empty automatic tag set and records a low-noise diagnostic.
It does not block an otherwise valid submission or create a staff-review alert.
A summary failure continues to follow the existing summary-generation failure
contract rather than accepting unauthorized submitter prose.

Clearly contradicted facts may be omitted or deterministically corrected only
when repository evidence is explicit. Ambiguous semantic disagreements pass
without error or staff escalation.

## Shared-Source Classification

Source evidence is loaded once, but each sibling card is classified
independently using its name, kind, and card context.

The classifier must not copy tags from a sibling merely because both cards use
the same source. It selects a tag only when source evidence can be associated
with the specific card. If a multi-offering README does not distinguish the
card clearly, zero automatic tags is valid.

The Add cards from this source workflow is a trusted owner/editor operation.
Each draft may set manual summary and tags. When content is cloned from an
existing card:

- values may seed the new draft;
- `metadata_policy` provenance is not cloned;
- summary and tag mode each default to automatic; and
- manual provenance is established only from the verified actor's explicit
  selection for that draft.

The batch limit remains ten cards, while the tag limit is six per card.

## Public Project Submission

The project submission form removes the editable display-name field. Tavernary
derives the card name from the observed repository/project name.

Community submitters continue to provide:

- project kind;
- primary function;
- supported frontends;
- Preset model families and completion formats;
- existing system-Preset information; and
- additional context.

### Summary control

The form shows a dropdown before any summary input:

- **Let TavernAI write the description** — default.
- **Write the description myself**.

Default helper text explains:

> TavernAI writes the description from the root README first and the
> repository's GitHub description second.

Selecting manual reveals the existing bounded description field with the
220-character limit.

Gray authority text explains that manual descriptions are honored only for the
verified repository owner or trusted Tavernary staff. A non-owner's manual text
is ignored completely.

### Tag control

The form shows a separate dropdown:

- **Let Tavernary select tags** — default.
- **Set tags myself**.

Selecting manual reveals the shared searchable tag picker. The picker:

- supports search by label, alias, and description;
- displays Goals and Traits as separate groups;
- pins selected chips;
- uses a bounded scroll area rather than expanding the page;
- shows a `selected / 6` counter;
- prevents a seventh selection; and
- supports pointer, keyboard, and screen-reader interaction.

Gray authority text explains that manual tags are honored only for the verified
repository owner or trusted Tavernary staff. Non-owner selections are ignored.

### Manifest and authority

The submission manifest advances as one coordinated contract and carries the
requested summary and tag mode plus conditional values. It does not claim that
the submitter is authorized.

During triage:

1. resolve the repository and immutable owner identity;
2. resolve trusted Tavernary editor authority;
3. honor manual fields only for an authorized actor;
4. discard unauthorized values before drafting or generation;
5. run TavernAI for each automatic field; and
6. package the final card and policy provenance in the generated pull request.

Non-owner community input for the retained structured fields remains advisory
and permissive under existing validation.

## Owner and Trusted-Editor Editing

The existing project editor replaces capabilities with the shared tag picker
and exposes independent summary/tag modes.

An authorized actor may:

- keep a field automatic;
- switch a field to manual and provide its value;
- switch a manual field back to automatic, which requests regeneration; or
- edit one manual field without changing the other field's policy.

The manifest fingerprints the original card and carries complete proposed
policy objects. Trusted automation supplies the provenance note. Form input
cannot inject arbitrary notes.

The shared Multi Projects add-card form uses the same controls for each draft.

## Catalog Card Presentation

Cards replace capability chips with zero to six tag chips. Frontend
compatibility remains a separate chip and does not consume the tag budget.

Tag chips use the public vocabulary label and description. The card does not
need to label each chip as Goal or Trait; those facets are explicit in the
filter experience and accessible metadata.

Searchable text includes tag labels and aliases, but classifier-only guidance
is never shipped to the browser.

## Filter Experience

The existing **Capabilities & characteristics** section becomes
**Goals & traits**.

It uses one bounded tag browser:

- one search field across both facets;
- selected chips pinned above unselected results;
- separate Goals and Traits headings;
- scrollable results with a stable maximum height;
- label, alias, and description matching;
- no `Show more` expansion;
- no page-height growth proportional to vocabulary size; and
- an empty-search state that does not clear current selections.

The catalog query stores selected tag IDs. Matching derives their facets from
the vocabulary:

```text
matches any selected Goal
AND
matches any selected Trait
```

When one facet has no selections, it imposes no constraint.

Canonical URLs use repeated `tag` parameters. During the transition, valid
legacy `capability` parameters are accepted when they identify a current tag,
then serialized back as canonical `tag` parameters.

Active-filter chips display tag labels and remove one selection at a time.
Filter count includes every selected tag.

The component must remain usable in both the desktop filter rail and mobile
filter sheet.

## Version-5 to Combined-Version-6 Migration

The final migration integrates the source-registry conversion and the tag
conversion before merge. The default branch never contains mixed canonical
records.

For the metadata-owned portion:

1. Remove `capabilities`.
2. Add the evidence-derived `tags` array.
3. Remove `enrichment_policy` and `enrichment_note`.
4. Add independent summary and tag policy objects.

Policy mapping is:

- Existing `enrichment_policy: automatic` maps summary to automatic.
- Existing `enrichment_policy: manual` maps summary to manual and preserves its
  trusted note.
- Every migrated tag policy begins automatic unless a verified owner or trusted
  editor explicitly approves the new v6 tags as manual.

Existing capabilities are candidate hints only. They do not establish manual
tag provenance and are not copied without current source evidence.

The migration:

- consumes the complete source-backed candidate registry;
- requires the complete evidence corpus for automatic tag backfill;
- classifies every card independently;
- writes all canonical cards in one operation;
- validates all tag IDs, kinds, limits, and policies;
- emits a deterministic distribution and evidence report;
- rebuilds the generated catalog;
- proves project ID, ordering, public visibility, Kit, and source parity; and
- fails before writes when the candidate result is incomplete or invalid.

The report includes:

- total cards;
- cards with zero through six tags;
- goal and trait usage frequency;
- cards with no sufficient evidence;
- invalid or repaired classifier outputs;
- manual/automatic summary counts;
- manual/automatic tag counts; and
- vocabulary version and content hash.

Zero-tag cards are reviewed as evidence gaps, not automatically treated as
errors.

## Validation and Failure Handling

Hard validation errors are structural:

- mixed project schema versions;
- missing or unknown `source_id`;
- unknown or duplicate tag IDs;
- more than six tags;
- a tag applied to an unsupported kind;
- invalid metadata-policy shape;
- missing manual provenance;
- manual note on an automatic field;
- unknown vocabulary facet;
- duplicate normalized vocabulary identity; or
- malformed submission/owner manifest.

Soft semantic conditions do not block:

- a project with zero tags;
- a plausible but incomplete tag set;
- an ambiguous README claim;
- a community structured-field suggestion that is not explicitly contradicted;
- a summary/tag interpretation that a human might phrase differently; or
- sibling cards with overlapping tags.

Automation may make deterministic corrections only for explicit repository
facts. Indeterminate conditions pass silently. Low-confidence diagnostics stay
in generated reports rather than producing staff queues or public errors.

Corpus refresh failures preserve prior valid evidence and report the failed
source. Intake evidence failure follows the automatic metadata failure contract
without accepting unauthorized manual content.

## Testing Strategy

### Vocabulary and schema

- Version 6 requires `tags` and `metadata_policy`.
- Removed capability/enrichment fields are rejected.
- Zero and six tags pass; seven fail.
- Unknown, duplicate, or kind-inapplicable tags fail.
- Automatic and manual policy shapes validate exactly.
- Manual notes are required and bounded.
- Classifier-only guidance is absent from the browser payload.
- Mixed canonical schema versions fail.

### Evidence corpus

- Source identity determines the storage directory.
- Sibling cards resolve to one evidence directory.
- Raw README bytes are preserved.
- Metadata includes commit, content hash, and fetch outcome.
- Conditional refresh skips unchanged content.
- Failed refresh preserves the last valid evidence.
- Selected-source and full-corpus modes report accurate counts.
- Corpus paths remain ignored by Git.

### Classification and migration

- Classifier output is constrained to the vocabulary and six-tag maximum.
- Each tag requires evidence.
- One malformed response receives one repair attempt.
- Persistent tag failure yields an empty automatic set and diagnostic.
- Manual fields are excluded from generation.
- Existing manual summary policy migrates independently.
- Existing capabilities do not create manual tag provenance.
- Every canonical card migrates once with the same project ID.
- Re-running the migration produces the same canonical output.
- Migration distribution and parity reports are deterministic.

### Submission and owner editing

- Both dropdowns default to automatic.
- Conditional inputs remain hidden until manual mode is selected.
- Tag selection stops at six.
- Search matches labels, aliases, and descriptions.
- Owner/staff manual values and generated notes are honored.
- Non-owner manual summary and tags are discarded before generation.
- Community structured fields and additional context remain present.
- Display name is absent from ordinary intake and source-derived in the draft.
- Summary and tag policies change independently.
- Add-card drafts reset policy provenance and enforce six tags per card.

### Catalog filtering and cards

- Tags render as card chips; frontend remains independent.
- Searchable catalog text includes public tag metadata.
- Goal selections use OR.
- Trait selections use OR.
- Goals and traits combine with AND.
- Query parsing and serialization use repeated `tag` parameters.
- Valid legacy capability parameters normalize to tags.
- Selected chips remain pinned during search.
- The tag browser remains bounded with a large fixture vocabulary.
- Keyboard and accessible labels cover search, selection, removal, and limits.

### Enrichment and workflows

- Automatic summary and tags may be generated together.
- Either field may be generated without the other.
- Manual summary or tags are never overwritten.
- Reports include policy decisions, evidence, vocabulary version, and repair
  outcome.
- Project submission and owner-edit workflows package the correct final policy.
- Exact-file-set and stale-state publication guards remain intact.
- Source-owned evidence is fetched once for sibling-card operations.

### Full verification

Before merge readiness:

- run formatting checks;
- run lint;
- run palette audit;
- validate the complete catalog;
- build the generated catalog;
- run focused schema, migration, classifier, form, filter, and workflow tests;
- run the complete unit suite;
- run typecheck;
- run the production build;
- verify the static export;
- exercise submission and owner-edit flows in the browser at desktop and mobile
  widths;
- inspect the bounded tag filter with a large vocabulary; and
- review the complete migration diff and distribution report.

## Acceptance Criteria

- Every canonical card uses the combined version-6 source-backed schema.
- The catalog contains a curated Goals-and-Traits vocabulary derived from
  stored raw source evidence.
- Every card has zero to six evidence-backed tags.
- The entire current catalog receives a deliberate correction pass.
- Raw README evidence and metadata are available locally and ignored by Git.
- Corpus refresh is explicit and incremental.
- Catalog cards and queries use tags rather than capabilities.
- Goals and Traits implement OR-within and AND-between semantics.
- The filter remains bounded and searchable with roughly one hundred tags.
- Intake defaults summary and tags to automatic.
- Manual controls scale and communicate the owner/staff authority boundary.
- Unauthorized manual content is discarded completely.
- Summary and tag automation/manual policy is independent.
- Automatic generation uses root README first and repository description
  second.
- Owner/editor card editing and Multi Projects add-card drafts use the same
  scalable tag and policy controls.
- Source evidence is shared while sibling card metadata remains independent.
- Semantic uncertainty is non-blocking and does not create routine staff noise.
- Focused, full, build, export, and rendered verification all pass.
