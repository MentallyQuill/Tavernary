# Source-Backed Multi-Card Registry

## Status

Approved for implementation planning on 2026-07-29.

## Summary

Tavernary will separate a catalog card from the source that distributes it.
Every card remains an ordinary Frontend, Extension, or Preset project record,
but it references a non-public source record instead of embedding repository
identity and lifecycle fields directly.

This permits one GitHub repository to support several independently curated
cards without weakening ordinary duplicate-submission protection. Repository
owners and trusted Tavernary editors may prepare an atomic batch of up to ten
additional cards from an existing source through the Help system. Every batch
requires deliberate maintainer approval before merge.

Source records are not catalog cards, a public project type, a suite type, or a
new taxonomy. They are internal infrastructure for shared repository identity,
observation, and permanent delisting.

## Context

The current project schema assumes that one project card owns one source. That
works for most repositories but cannot accurately represent a repository such
as `Arif-salah/Megumin-Suite`, which may distribute an extension and several
meaningfully different Presets.

Automatically inferring those boundaries from repository contents would be
brittle. Only a human can decide whether two named configurations are minor
flavors of one Preset or materially different Presets deserving independent
cards.

Using a visible parent card would also distort the catalog. A repository is not
necessarily a visitor-facing product, and a parent project card would create a
fourth public kind with unclear filtering and metadata behavior.

The approved direction is therefore:

- internal source records;
- ordinary peer cards referencing those records;
- explicit human-authored card boundaries;
- existing Tavernary kinds and tags only; and
- separate soft card maintenance from permanent source delisting.

## Goals

- Permit one GitHub repository to back multiple Frontend, Extension, or Preset
  cards.
- Preserve strict duplicate blocking for ordinary project submissions.
- Let repository owners and trusted Tavernary editors propose additional cards
  by reusing the current Help editor.
- Prefill a new card from an existing card while keeping every card field
  editable.
- Accept between one and ten new cards in one atomic request.
- Permit only one unresolved add-card batch per immutable source at a time.
- Keep repository identity stable across GitHub renames and transfers.
- Fetch and store repository facts once per source.
- Make retiring or restoring a card routine, reversible listing maintenance.
- Keep permanent delisting repository-wide, destructive, and one-way.
- Preserve all existing project IDs and Kit references during migration.
- Migrate every current source type to one uniform canonical model even though
  the add-card workflow is GitHub-only.

## Non-goals

- Detecting card boundaries from files, directory names, releases, or README
  headings.
- Creating public `suite`, `variant`, `flavor`, `parent`, or `child` metadata.
- Adding a fourth public project kind.
- Supporting non-GitHub add-card batches in the first release.
- Allowing arbitrary GitHub collaborators or organization members to claim
  repository-owner authority.
- Automatically merging an add-card batch based only on verified owner
  authority.
- Allowing several concurrent add-card requests for the same source.
- Reusing a permanently delisted source for a new submission.
- Rewriting historical reports or legacy intake inventories as canonical
  source data.

## Terminology

### Source

An internal record representing one distribution location. For repository
providers, its identity is the provider plus the provider's immutable numeric
repository ID.

### Card

The existing public Tavernary project listing. Cards retain stable project IDs,
one existing project kind, editorial metadata, compatibility metadata, and
card-level lifecycle.

### Sibling cards

Cards that reference the same `source_id`. This is an internal relationship and
does not create public parent/child hierarchy.

### Effective visibility

Whether a card appears in the generated catalog after combining its card
status, its source status, and current source-health evidence.

## Core Invariants

1. Every card references exactly one existing source.
2. A source may be referenced by zero, one, or many cards.
3. One provider repository ID maps to exactly one source.
4. Project IDs remain globally unique and never change after publication.
5. Source IDs remain stable across repository renames and transfers.
6. Ordinary project submission cannot attach to an existing source.
7. Only the add-cards-from-source operation may create sibling cards.
8. Card retirement never delists or tombstones its source.
9. Source delisting affects every sibling card and permanently reserves the
   source identity.
10. Repository snapshots and refresh scheduling are source-owned.
11. Editorial enrichment policy remains card-owned.
12. All cards in an add-card batch validate and publish together or none do.

## Canonical Data Model

### Source registry

Add `data/registry/sources/*.json` and
`data/schemas/source.schema.json`.

A GitHub source has the conceptual shape:

```json
{
  "schema_version": 1,
  "id": "github-1189674883",
  "type": "github",
  "repository": "Arif-salah/Megumin-Suite",
  "repository_id": 1189674883,
  "status": "active",
  "status_reason": null,
  "refresh_policy": "automatic"
}
```

Source IDs are internal and deterministic:

- GitHub repository: `github-<repository-id>`
- Codeberg repository: `codeberg-<repository-id>`
- Existing GitHub organization source:
  `github-organization-<existing-project-id>`
- Existing URL source: `url-<existing-project-id>`

The migration-derived IDs for organization and URL records prioritize stable
identity over reconstructing identity from mutable URLs or organization names.
Future source creation uses the same provider namespace and a collision-checked
stable suffix assigned at admission time.

Repository source records own:

- provider and current canonical repository location;
- immutable provider repository ID;
- `refresh_policy`; and
- `status`, which is either `active` or `delisted`.

URL source records retain their existing distribution facts, including URL,
publication time, version, artifact size, and license fields. GitHub
organization records retain their organization and URL fields.

`status_reason` is `null` for an active source and `removed` for a permanently
delisted source. The GitHub issue, pull request, and publication transaction
remain the detailed audit history; the source record does not duplicate that
history.

### Project/card registry

The project schema advances from version 5 to version 6. Each project record:

- removes its inline `source`;
- adds `source_id`;
- removes `refresh_policy`;
- retains project ID, name, kind, summary, metadata status, frontends, primary
  function, capabilities, Preset compatibility, catalog dates, and enrichment
  policy; and
- replaces repository-overloaded `visibility` with card-owned
  `listing_status` and `listing_status_reason`.

The conceptual shape is:

```json
{
  "schema_version": 6,
  "id": "arif-salah-megumin-suite",
  "source_id": "github-1189674883",
  "name": "Megumin Suite",
  "kind": "extension",
  "summary": "…",
  "metadata_status": "curated",
  "frontends": ["sillytavern"],
  "primary_function": "interface-workflow",
  "capabilities": [],
  "cataloged_at": "2026-07-29T00:00:00.000Z",
  "catalog_cohort": "standard",
  "listing_status": "active",
  "listing_status_reason": null,
  "enrichment_policy": "manual",
  "enrichment_note": "…"
}
```

`listing_status` is:

- `active`: eligible for publication when its source is healthy and active;
- `quarantined`: temporarily hidden for card-specific review; or
- `retired`: softly removed and eligible for later restoration.

`listing_status_reason` is `null` for active cards and a controlled existing
policy reason for quarantined or retired cards. It must not represent
repository deletion, unavailability, or identity change; those are source
concerns.

Project IDs are not regenerated by the migration. New sibling card IDs are
generated once from the source's current readable namespace and the submitted
card title, for example:

```text
arif-salah-megumin-suite-v9-mirage
```

The generated ID is shown during review. A collision with any current or
retired project ID is a validation error. Repository renames and later title
edits never rename the project ID.

### Repository snapshots

The repository snapshot schema advances from version 3 to version 4:

- replace `project_id` with `source_id`;
- name snapshot files by `source_id`; and
- keep repository, source health, activity, contributors, community, license,
  and refresh evidence unchanged.

For example:

```text
data/snapshots/github/arif-salah-megumin-suite.json
                         ↓
data/snapshots/github/github-1189674883.json
```

The GitHub refresh manifest and its bounded timing history are also keyed by
`source_id`. Repository refresh selection operates once per source regardless
of sibling-card count.

### Effective visibility

A card is included in the public catalog only when:

1. its `listing_status` is `active`;
2. its source `status` is `active`; and
3. repository-backed source health permits publication under the existing
   source-health policy.

A source-health failure therefore affects every sibling without writing
duplicate status changes into each card. A card-specific safety review may
still quarantine only one card.

## Existing Data Migration

The migration covers the complete current canonical registry:

- 305 project records;
- 294 GitHub repository sources;
- 1 Codeberg repository source;
- 10 URL or GitHub organization sources;
- 295 repository snapshots;
- 2 existing permanently removed GitHub projects; and
- 7 Kits containing 48 unchanged project references.

At migration time every source is unique to one project, so source extraction
is deterministic. The migration does not decide any new card boundaries.

### Project and source conversion

For each current project:

1. derive its stable source ID;
2. write exactly one source record if that source ID has not already been
   written;
3. replace inline source identity with `source_id`;
4. move `refresh_policy` to the source;
5. retain `enrichment_policy` and editorial metadata on the card; and
6. map card/source lifecycle according to the rules below.

The migration fails instead of merging records when two current records claim
the same immutable repository ID with contradictory source facts.

### Lifecycle mapping

- `visibility: published` becomes an active card on an active source.
- `visibility: quarantined` with a card-specific safety reason becomes a
  quarantined card on an active source.
- Temporary repository identity or availability states move to source-health
  evidence, with the card otherwise active.
- `visibility: disabled` with `visibility_reason: removed` becomes an active
  historical card referencing a permanently delisted source.

The two current Lumiverse removals therefore become two delisted source
tombstones. Their card records remain available to validation and audit code
but cannot appear publicly or be restored through card maintenance.

### Deterministic migration tooling

A checked-in migration command performs a dry run by default and writes only
with an explicit flag. It:

- validates the complete version-5 registry before conversion;
- reports planned counts and paths;
- refuses missing or duplicate immutable repository IDs;
- writes source, project, snapshot, and refresh-manifest changes together;
- validates the complete version-6 result; and
- emits a parity report for review.

The generated diff is committed with the schema and consumer changes. The
migration tool performs mechanical identity extraction only; it does not
inspect repository contents or create sibling cards.

## Catalog, Kits, Enrichment, and Forks

### Catalog build

Catalog assembly joins:

```text
project card → source → repository snapshot
```

Source-derived repository facts may appear on several public cards. Card
metadata remains independent. The public catalog does not expose a parent card
or a suite type.

The initial migration must rebuild a public catalog equivalent to the
pre-migration catalog: 303 visible cards with the same project IDs, ordering,
editorial fields, and repository facts.

### Kits

Kit records continue to reference project IDs. No Kit data migration is
required.

A Kit component is unavailable when its card is not active, its source is
delisted, or repository source health makes it unavailable. Retiring one
sibling does not affect Kit components using another sibling.

### Enrichment

README and repository-description selection loads source evidence once, then
applies it to the selected card's enrichment operation. Enrichment state and
approved editorial copy remain card-specific.

Sibling cards created through the owner/editor Help workflow use curated
metadata and manual enrichment because the complete card copy was explicitly
authored and approved. Automatic repository observation remains active at the
source.

### Fork relationships

Repository ancestry belongs to the source. Fork discovery resolves parent
repository ID to a parent `source_id`.

When the parent source has exactly one active card, the existing internal
card-to-card fork link is preserved. When the parent source has several active
cards, Tavernary links to the parent repository rather than selecting an
arbitrary “primary” card. No primary-card field is introduced.

## Help System Experience

### Entry point

The existing **Manage your project listing** flow remains the entry point.
After selecting an eligible GitHub-backed card, the action list includes:

- Edit card details
- Add cards from this source
- Retire this card
- Restore this card, when the selected card is retired
- Update the repository location
- Permanently delist this source

The browser receives enough non-public selection data to locate retired cards
and sibling relationships, but retired cards remain absent from the public
catalog.

### Add cards from this source

The form begins with one draft prefilled from the selected card. The user may
add or remove draft cards up to a maximum of ten.

Every draft independently edits:

- title;
- kind: Frontend, Extension, or Preset;
- summary;
- supported frontends;
- primary function;
- capabilities; and
- for Presets, existing model-family and completion-format fields.

Changing a draft to or from Preset adds or removes the Preset-only controlled
fields under the existing validation rules. There is no subtype, suite,
variant, or flavor field.

The source is fixed for the entire batch and is not editable here. Repository
location changes use the separate source-move operation.

The form and review step display this notice:

> You may propose up to 10 cards from this GitHub repository in one request.
> Only one unresolved add-card request may exist for the repository at a time.
> Tavernary reviews the complete batch together.

The review step shows each generated project ID and full card diff. The
internal React keys used while drafting are opaque and never become project
identifiers.

### Batch validation and errors

Validation runs at the card, batch, source, and current-registry levels.

Card errors identify the affected draft and field. Batch errors identify:

- zero cards;
- more than ten cards;
- duplicate normalized titles or generated IDs within the batch;
- collision with any active, quarantined, or retired project ID; or
- inconsistent source references.

Source errors identify:

- missing source;
- non-GitHub source;
- delisted source;
- missing immutable repository ID;
- current repository identity mismatch; or
- another unresolved add-card request.

Tavernary reports exact mechanical validation failures. It does not infer that
two cards are semantically redundant or decide that a Preset flavor is
substantial enough to deserve a card. That judgment belongs to maintainer
review.

## Authority and Publication

### Who may submit

The add-card operation is admitted when the GitHub issue author is either:

- the verified current personal owner of the source repository; or
- a trusted Tavernary editor under the existing immutable-user-ID registry.

Owner authority remains personal-repository ownership only. Collaborators,
organization membership, commit authorship, and claimed identity are not
substitutes.

### Manual approval boundary

An admitted batch creates one issue, one automation branch, and one pull
request containing every proposed card plus generated consequences.

Unlike ordinary verified-owner card edits, the batch never auto-merges. A
Tavernary maintainer must deliberately approve and merge it. A trusted editor
may initiate the request and, when their normal repository permissions allow,
perform that maintainer approval.

The batch is atomic:

- all proposed cards validate;
- all appear in one review;
- all are included in one publication transaction; and
- all merge or none merge.

Maintainers who want only part of a batch request changes to that same pull
request. Automation does not silently accept the valid subset.

### Unresolved-request lock

The lock key is immutable `source_id`, never repository slug or project ID.
The workflow uses a source-scoped concurrency group and checks existing open
add-card issues and pull requests before admission.

If two requests race, one may be admitted. The other receives a clear comment
linking the unresolved request and is closed or marked rejected without
creating a second publication branch.

The lock clears only when the batch reaches a terminal merged, declined,
closed-without-merge, or invalid state. Ordinary card edits and source refreshes
do not occupy this lock.

## Card and Source Maintenance

### Edit card

Editing a card fingerprints and changes only the project record. Existing
verified-owner and trusted-editor publication rules continue to apply.

### Retire and restore card

Retirement changes one card to `retired`. Restoration returns that card to
`active` if its source remains active and current validation passes.

These are reversible card-maintenance operations and follow the same authority
and automatic-publication eligibility as ordinary card edits. Retiring the last
active card leaves an active source with no public cards; it does not create a
delist tombstone.

### Move source

A GitHub rename or transfer changes the current repository location in the
single source record and source-owned snapshot. The immutable repository ID,
source ID, and every sibling project ID remain unchanged.

The operation fingerprints the source record and verifies the current GitHub
repository by immutable ID before publication. It does not rewrite sibling
cards.

### Permanently delist source

Delisting changes the source to `delisted` and pauses refresh. Every sibling
card becomes effectively hidden without being rewritten or destroyed.

The Help experience lists all affected sibling cards and requires typed
confirmation of the repository identity, not merely one selected card title.
The wording describes the operation as permanent and repository-wide.

A delisted source:

- cannot be restored through card maintenance;
- cannot receive new sibling cards;
- cannot be recreated by ordinary submission; and
- continues to reserve its immutable repository identity.

Detailed history remains in GitHub issues, pull requests, and publication
transactions.

## Manifests, Transactions, and Stale-State Safety

The owner-management manifest advances to a new schema version and separates
card and source concurrency:

- card edit/retire/restore includes `project_id` and card fingerprint;
- source move/delist includes `source_id` and source fingerprint; and
- add-card batch includes `source_id`, source fingerprint, and one to ten
  complete proposed cards.

Publication transactions declare card paths, source paths, source-owned
snapshot paths, and generated consequences explicitly. Exact-head and
exact-file-set verification remains mandatory.

An add-card request is regenerated or rejected when:

- the source fingerprint changed;
- the source became delisted;
- ownership or trusted-editor authority changed;
- another card claimed a generated ID;
- vocabulary validation changed; or
- the issue body changed after triage.

The workflow must never reinterpret an old title or kind to recover from a
stale request.

## Duplicate Protection

Ordinary project submissions continue to reject:

- an existing canonical source URL;
- an existing normalized repository slug; or
- an existing immutable repository ID.

The source-aware duplicate detector returns the existing `source_id` and
associated cards for maintainer diagnostics, but it does not turn a normal
submission into an add-card request.

Only a valid Help manifest with `operation: add-cards-from-source` may create
projects referencing an existing source.

## Cutover and Compatibility

The schema, migration output, validators, catalog consumers, Help generators,
and GitHub workflows merge as one coordinated change. Tavernary must not leave
version-5 and version-6 canonical records mixed on the default branch.

Before merge:

1. identify open project-submission and owner-management publication pull
   requests generated against version-5 paths;
2. allow completed transactions to merge first where safe;
3. prevent remaining old transactions from auto-publishing after cutover; and
4. regenerate still-valid requests against the source-aware contracts.

Readable issue content remains useful, but an old generated pull request is
never rebased mechanically across the storage migration. Exact-SHA publication
guards should fail it closed.

Historical enrichment reports, old intake data, and prior GitHub issue bodies
are not rewritten. Generated catalog data is rebuilt from canonical records.

## Failure Handling

- Missing source reference: fail schema/catalog validation with project and
  source IDs.
- Conflicting immutable repository identity: fail the migration or mutation;
  never select one record automatically.
- Missing source snapshot: report one source-level error and suppress all
  dependent cards under existing health policy.
- Invalid card in a batch: report its index/title and field; write no branch.
- Partial filesystem write during generation: discard the generated branch
  state and create no publication transaction.
- Stale card fingerprint: reject only the card operation.
- Stale source fingerprint: reject source operations and the complete add-card
  batch.
- Delisted source: fail all add, move, and restore attempts closed.
- Ambiguous fork parent cards: link to the parent repository instead of
  guessing a parent card.

## Testing Strategy

### Schema and migration tests

- Every current version-5 record converts to one valid version-6 card and one
  valid source.
- All 305 project IDs remain unchanged.
- All 295 repository snapshots retain their repository and evidence payloads
  while changing only source ownership.
- The two current removed repositories become delisted source tombstones.
- Re-running dry-run analysis produces the same plan.
- Contradictory repository identity fails before writes.
- Mixed-schema canonical data fails validation.

### Catalog and Kit parity tests

- The migrated catalog contains the same 303 visible cards in the same order.
- Public fields and repository facts match the pre-migration fixture.
- Seven Kits retain all 48 project references.
- Retiring one sibling affects only its card and Kit components.
- Delisting a source suppresses every sibling and affected Kit component.
- Source refresh happens once when several cards reference the source.

### Help and manifest tests

- A selected GitHub card prefills the first draft completely.
- The user can edit every supported card field and kind.
- Preset-only fields appear and validate correctly.
- Batches of one and ten cards succeed.
- Zero and eleven cards fail.
- Per-card errors identify the correct draft.
- Project-ID collisions include active, quarantined, and retired cards.
- Non-GitHub and delisted sources cannot start a batch.
- Owner and trusted-editor authority are admitted.
- Collaborator, organization-member, and unrelated-user claims are rejected.
- The unresolved-request notice is visible in form and review states.

### Workflow and publication tests

- One batch produces one issue, branch, pull request, and transaction.
- No add-card batch auto-merges.
- A second concurrent request for the same source loses admission cleanly.
- Different sources may have unresolved batches concurrently.
- A stale source or issue body invalidates the complete batch.
- Maintainer-requested edits remain in the same atomic pull request.
- Card edit/retire/restore use card fingerprints.
- Source move/delist use source fingerprints.
- Existing ordinary duplicate submissions remain blocked.

### Lifecycle tests

- Retiring the last card leaves the source active.
- Restoring a retired card succeeds only for an active source.
- A repository rename updates one source and no project IDs.
- Permanent delisting hides every sibling, pauses refresh, and blocks source
  recreation.
- Delisting confirmation names the repository and lists all affected cards.

### Full verification

The implementation is complete only after:

- schema validation;
- deterministic migration parity;
- focused unit and workflow tests;
- the complete unit suite;
- catalog build;
- typecheck;
- static production build and export verification; and
- live GitHub canaries for one add-card batch, one source rename, one card
  retirement/restoration, and one source-wide delist using disposable fixtures
  or maintainer-approved real targets.

## Acceptance Criteria

- A GitHub repository can back several ordinary catalog cards.
- New sibling-card boundaries are explicitly authored and maintainer-approved,
  never inferred.
- One atomic request may contain one to ten cards.
- Only one unresolved add-card request exists per immutable source.
- Repository owners and trusted editors may submit; batches never auto-merge.
- Cards use only existing Tavernary kinds, compatibility fields, and tags.
- Repository rename changes source location without changing card identity.
- Card retirement is soft and reversible.
- Source delisting is repository-wide, permanent, and blocks re-entry.
- Existing project IDs and Kit references survive migration.
- Repository snapshots and refresh timing are source-owned.
- Initial migrated public output is equivalent to the current catalog.
