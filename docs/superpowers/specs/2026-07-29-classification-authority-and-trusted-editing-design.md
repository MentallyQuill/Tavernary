# Classification Authority and Trusted Editing

## Summary

Tavernary will make project classification an explicit human-owned field
instead of model-enriched editorial metadata.

Project kind determines the primary function for Frontends and System Presets:

- `kind: "frontend"` always has `primary_function: "frontend"`;
- `kind: "preset"` always has `primary_function: "preset"`; and
- only `kind: "extension"` receives a selectable functional category.

Extension submitters will select the primary function in the project submission
builder. Tavernary will preserve that value. An intake-only model review may
confirm it or raise a possible-mismatch warning, but neither intake enrichment
nor scheduled enrichment may change it.

The existing project-owner request will retain its primary-function editor.
Authenticated Tavernary staff will be able to use that workflow for any card,
including cards whose third-party source does not qualify for ordinary owner
self-service. The existing Kit Builder will likewise allow authenticated
Tavernary staff to submit edits for any published Kit while preserving its
identity, author, original publication time, and source issue.

The migration will reconcile every structurally invalid or uncategorized
record, remove the `uncategorized` state and top navigation entry, and enforce
the new contract in submission, registry, build, query, and workflow
validation.

## Problem

Tavernary currently uses `primary_function` as both:

- a user-facing category; and
- one of four fields overwritten by model enrichment.

The model receives the project kind and the complete primary-function
vocabulary, but the validator checks only that the returned value belongs to
that vocabulary. It does not enforce a relationship between `kind` and
`primary_function`.

This allowed model output to classify Extensions as `frontend` after reading
phrases such as "frontend extension." The catalog's Frontends category is
driven by `primary_function`, so those Extensions appeared under Frontends even
though their structural kind remained correct.

The current registry contains:

- 16 Frontends, two of which do not have `primary_function: "frontend"`;
- 14 Presets spread across four unrelated primary-function values;
- 11 Extensions with `primary_function: "frontend"`; and
- 12 uncategorized records, consisting of ten Extensions and two Presets.

The 37 unique affected records require reconciliation. Hiding the
Uncategorized tab without repairing the records would leave unresolved data
and preserve the write path that created it.

## Goals

- Make the submitter-selected Extension category authoritative at intake.
- Make Frontend and Preset primary functions structural and deterministic.
- Keep the model useful as a non-mutating Extension classification reviewer.
- Prevent every enrichment path from changing `primary_function`.
- Keep project classification editable through reviewed project-owner
  requests.
- Let trusted Tavernary staff use project-owner requests for any card.
- Let trusted Tavernary staff edit any published Kit through the existing Kit
  Builder and publication path.
- Preserve project-owner maintainer review, Kit validation, stale-edit
  protection, exact-path mutation, and static-site architecture.
- Reconcile all 37 currently affected records and remove Uncategorized from
  the public and canonical taxonomy.

## Non-goals

- Letting the model silently correct or override a submitter.
- Adding Tavernary accounts, OAuth, a runtime API, or a database.
- Letting ordinary GitHub collaborators on third-party projects claim owner
  authority.
- Replacing the project-owner request PR workflow.
- Adding Kit editing to the project-owner form.
- Transferring Kit authorship or changing immutable Kit identity through a
  trusted staff edit.
- Reclassifying every currently published Extension whose existing
  substantive category is not structurally impossible.
- Making capability suggestions human-owned; enrichment may continue updating
  capabilities under the existing enrichment policy.

## Classification contract

### Frontends

A Frontend is structurally a Frontend:

```json
{
  "kind": "frontend",
  "primary_function": "frontend"
}
```

No submission control, owner request, generated proposal, or enrichment output
may assign another primary function to a Frontend.

### System Presets

A System Preset is structurally a Preset:

```json
{
  "kind": "preset",
  "primary_function": "preset"
}
```

`preset` becomes a controlled primary-function ID. Preset purpose,
compatibility, and behavior remain expressible through summary, capabilities,
model families, completion formats, and supported frontends. A Preset does not
borrow an Extension functional category.

### Extensions

An Extension must have exactly one substantive functional category selected
from:

- `memory-retrieval`: stores, summarizes, searches, retrieves, or injects
  conversational knowledge and continuity;
- `generation-reasoning`: changes how model output is prompted, sampled,
  continued, routed, or reasoned;
- `character-worldbuilding`: creates or manages characters, personas, lore,
  locations, expressions, or other narrative-world material;
- `rpg-systems`: provides game mechanics, rules, progression, statistics,
  quests, or structured world-state systems;
- `interface-workflow`: improves user-facing navigation, presentation,
  editing, productivity, accessibility, or media interaction; or
- `developer-infrastructure`: provides developer-facing APIs, scripting,
  proxies, interoperability, diagnostics, build support, or operational
  plumbing.

`frontend`, `preset`, and `uncategorized` are not valid Extension choices.

### No Uncategorized state

`uncategorized` will be removed from:

- `data/vocabularies/primary-functions.json`;
- the catalog category navigation;
- query parsing and serialization;
- category and purpose filter allowlists;
- submission and owner-request controls;
- enrichment fallback behavior; and
- accepted registry records.

A provisional summary does not imply provisional classification. A project may
retain `metadata_status: "provisional"` while its human-selected or structural
primary function is already authoritative.

## Project submission

### Browser form

The project submission builder continues to ask for **Project Type** first.

- Frontend: no Primary function control is shown. The manifest receives
  `primary_function: "frontend"`.
- System Preset: no Primary function control is shown. The manifest receives
  `primary_function: "preset"`.
- Extension: a required **Primary function** select is shown after Project
  Type. It contains only the six Extension categories.

Each Extension option includes a concise definition derived from the
controlled vocabulary so submitters can distinguish adjacent categories.
Changing Project Type resets or deterministically replaces the previous
primary-function value.

The review step and GitHub handoff display the chosen or structural primary
function explicitly.

### Manifest and fallback Issue Form

Project submission manifest schema version 3 adds required
`primary_function`.

The normalizer enforces:

- Frontend manifests use `frontend`;
- Preset manifests use `preset`; and
- Extension manifests use one of the six Extension categories.

The direct GitHub Issue Form adds a readable **Primary function** field. It is
required for Extension fallback submissions and must be blank or the
structural value for Frontend and Preset fallback submissions. Server-side
normalization remains authoritative because GitHub Issue Forms cannot express
all conditional enum rules.

Legacy schema-version-1 and schema-version-2 submissions do not receive a
model-derived category. They are returned for correction with an exact message
requesting a primary function. At design time, issue #146 is the only open
legacy project submission and must either complete before rollout or be
corrected to the version-3 contract.

### Canonical record generation

The submitted manifest, not enrichment output, supplies
`record.primary_function`.

Record generation may still use enrichment for:

- summary;
- `metadata_status`; and
- capabilities.

If summary enrichment is unavailable, the record may use the existing
provisional summary fallback without losing its submitted classification.

## Model classification review

### Scope

The classification review runs only for Extension intake. Frontends and
Presets are deterministic and do not need a model opinion.

Scheduled enrichment and `all-automatic` runs do not perform classification
review and do not request or write a primary function.

### Inputs

The intake reviewer receives:

- project name;
- structural kind (`extension`);
- submitted primary-function ID;
- source identity;
- prepared source description or README evidence;
- supported frontends; and
- all six Extension category IDs, labels, and definitions.

Category definitions must describe the project's primary purpose rather than
matching isolated words such as "frontend," "memory," or "character."

### Output

The reviewer returns one of:

- `confirmed`; or
- `possible-mismatch`, with one suggested Extension category and a short
  source-grounded explanation.

An invalid, unavailable, or timed-out classification review becomes
`classification-check-unavailable`. It does not invalidate the submitted
category or block record generation.

### Effect

The submitter's value always remains in the generated registry record.

`possible-mismatch` produces:

- a visible warning in the generated review PR;
- a visible warning in the source issue's automation comment;
- a `classification-review` issue label; and
- a maintainer checklist item comparing the submitted and suggested values.

The warning is non-blocking. A maintainer may preserve the submitted value or
edit the generated PR to another valid Extension category. The model never
performs that edit.

The PR report stores only the submitted ID, suggested ID, review status, and
bounded sanitized explanation. It does not store raw model payloads or source
content.

## Enrichment authority

### Scheduled and forced enrichment

The enrichment write boundary becomes:

- `summary`;
- `metadata_status`; and
- `capabilities`.

`primary_function` is removed from:

- the scheduled enrichment provider output schema;
- validation and repair messages for enrichment output;
- fallback enrichment output;
- enriched-record write construction;
- run reports that treat it as generated output; and
- type declarations describing enrichment writes.

`writeEnrichedRecord` must preserve the current primary function byte-for-byte
for pending, retry, and forced `all-automatic` runs.

### Project-owner policy effect

Primary function remains editable in the current **Edit card details** owner
request.

Because enrichment no longer owns primary function:

- changing only primary function or another non-enriched field preserves the
  existing `enrichment_policy` and `metadata_status`;
- changing summary or capabilities sets `metadata_status: "curated"` and
  `enrichment_policy: "manual"` under the existing whole-editorial-unit lock;
  and
- an existing manual enrichment policy remains manual.

The owner-request review shows this policy effect before GitHub handoff and in
the generated PR.

Owner-request normalization enforces the same kind/function relationship as
submission and registry validation. Frontend and Preset controls display their
structural value rather than allowing another selection. The dropdown remains
editable only for Extensions.

## Trusted Tavernary project editing

### Authority classes

Project-owner triage recognizes two independent authority routes:

1. **Third-party personal repository owner**
   - Retains the existing public GitHub repository, immutable repository ID,
     personal owner, and issue-author login checks.
   - May operate only on that repository's eligible card.
2. **Trusted Tavernary staff**
   - The refreshed GitHub issue supplies an immutable author ID that appears
     in Tavernary's reviewed trusted-editor registry.
   - GitHub also supplies a current host-repository `author_association` of
     `OWNER`, `MEMBER`, or `COLLABORATOR`, proving that the approved editor
     remains associated with the repository.
   - May use the project-owner request for any canonical card.
   - Does not need to own the listed third-party source.

`CONTRIBUTOR`, `FIRST_TIMER`, `FIRST_TIME_CONTRIBUTOR`, `MANNEQUIN`, `NONE`,
and missing associations are not trusted staff. Association alone is also
insufficient: GitHub does not expose the difference between every repository
permission level through `author_association`.

The canonical trusted-editor registry is
`data/maintenance/trusted-tavernary-editors.json`. It contains immutable GitHub
user IDs, current display logins for review, and an approved role of `owner`,
`admin`, or `maintainer`. The initial registry contains the current Tavernary
owner, GitHub user ID `2625904`. Adding, changing, or removing staff authority
is an ordinary reviewed repository change. This avoids requiring a broad
administration token in issue workflows while preventing an arbitrary
lower-permission collaborator from gaining catalog-wide edit authority.

The authority decision is derived from current GitHub issue data, never from a
manifest claim or freeform issue text. Triage refreshes the issue before
admission, and generation rechecks the issue ID, association, and trusted-editor
registry before writing.

### Any-card selection

The Manage Project page lists every canonical card for everyone because the
static browser cannot know the visitor's GitHub identity.

For records that do not qualify for ordinary owner self-service, the form
explains that only Tavernary staff may use this path. Triage rejects an
ordinary requester without creating a mutation branch.

Trusted staff may edit card details or request delisting for:

- personal or organization-owned GitHub records;
- Codeberg records;
- external URL Presets;
- records without a GitHub repository ID; and
- disabled records when the chosen operation permits their current state.

Repository-location changes retain their existing provider and immutable
identity constraints. Staff authority does not turn a source move into an
unreviewed replacement of one project with another.

### Manifest and audit trail

The project-owner manifest advances to a schema that can represent records
without a GitHub repository ID. Project ID, current source fingerprint,
original values, proposed values, and explanation remain required as
applicable.

Generation reports and PR markers record:

- authenticated actor login;
- authority route (`repository-owner` or `tavernary-staff`);
- operation;
- project ID;
- source issue;
- original and proposed values; and
- exact generated paths.

Every request still creates a maintainer-review PR and never auto-merges.

## Trusted Tavernary Kit editing

### Existing surface

Trusted staff use the existing published-Kit **Edit Kit** action and Kit
Builder. Kit editing is not duplicated in the project-owner form.

The builder continues to edit every currently editable Kit field:

- title;
- description; and
- ordered project membership.

All ordinary Kit validation, near-duplicate detection, severe-language
screening, project availability checks, composition rules, issue admission,
and publication checks remain active.

### Authority

An edit is authorized when either:

- the authenticated issue author ID matches the canonical Kit author ID; or
- the refreshed issue author ID appears in the trusted-editor registry and its
  current host-repository `author_association` is `OWNER`, `MEMBER`, or
  `COLLABORATOR`.

The triage path and final apply path both enforce the same rule from refreshed
GitHub issue data.

### Immutable provenance

A trusted staff edit preserves:

- Kit `id`;
- complete `author` object;
- `source_issue_number`;
- `published_at`; and
- existing reaction identity and snapshot association.

It changes only:

- title;
- description;
- ordered `project_ids`; and
- `updated_at` when content changed.

An ordinary author edit may continue refreshing the stored casing of that
author's own GitHub login. A staff edit by another person must not replace the
author login with the staff actor.

Kit edits retain the current validated publication contract: a valid admitted
issue dispatches the apply workflow, while an invalid or pending edit leaves
the published Kit unchanged. Trusted staff authority does not bypass or add a
separate manual Kit approval gate.

## Registry reconciliation

The migration changes 37 unique project records.

### Presets: structural conversion

All 14 Presets receive `primary_function: "preset"`:

- `casus-b-casus-custom-chatfill-ii`
- `daddytorgo-hash-frankengarage`
- `evening-truth-carrd-prompt`
- `le-emotionalism-1-1-5-prompt`
- `mentallyquill-st-wandlight`
- `puras-director-v15`
- `purrfect-logic-4-max-mini`
- `realistic-frankenstein-preset`
- `reddit-1v64r6z`
- `reddit-1v72pju`
- `ryah-st-freaky-d20-preset`
- `village-maker-google-drive-prompt`
- `writers-block-4`
- `zorgonatis-stabs-edh`

### Frontends: structural repair

These two Frontends receive `primary_function: "frontend"`:

- `mnehmos-mnehmos-quest-keeper-game`
- `sagesheep-narrativeengine-p`

### Extensions incorrectly classified as Frontends

These 11 records receive the following source-reviewed Extension categories:

| Project ID | Primary function |
| --- | --- |
| `amousepad-lumirealm` | `character-worldbuilding` |
| `archkr-lumiverse-lumimind` | `memory-retrieval` |
| `archkr-sillytavern-outfitswitch` | `character-worldbuilding` |
| `bronya-rand-prome-vn-extension` | `interface-workflow` |
| `cha1latte-marinara-avatar-background` | `interface-workflow` |
| `countcandy-sillytavern-extension-candyexpressions` | `character-worldbuilding` |
| `ikarusv-cotautoclean` | `interface-workflow` |
| `leandrojofre-sillytavern-stat-us-maximus` | `rpg-systems` |
| `sillytavern-extension-groupgreetings` | `character-worldbuilding` |
| `spicymarinara-sillytavern-spotify-music-extension` | `interface-workflow` |
| `zapoverde-sillytavern-vistalyze` | `character-worldbuilding` |

### Uncategorized Extensions

These ten records receive the following source-reviewed Extension categories:

| Project ID | Primary function |
| --- | --- |
| `aceeenvw-charswitchpro` | `interface-workflow` |
| `aeoness-swipe-sculpt` | `interface-workflow` |
| `brasen56-merged-world-tracker` | `rpg-systems` |
| `hornysilicon-charsaver` | `character-worldbuilding` |
| `kawaii-wolf-sillytavern-evenmoreflexiblecontinues` | `generation-reasoning` |
| `prolix-oc-lumiverse-chatroom` | `interface-workflow` |
| `prolix-oc-lumiverse-spotifycontrols` | `interface-workflow` |
| `selinawynters-ops-paramsentinel` | `generation-reasoning` |
| `sillytavern-extension-customsliders` | `interface-workflow` |
| `zompiexx-st-hands-free-voice` | `interface-workflow` |

Each of the 21 Extension corrections is a maintainer classification decision
based on the current canonical summary and public source evidence. Evidence
review includes repository descriptions, READMEs, and extension manifests
where a README is absent. The model classification reviewer did not generate
these migration values. The implementation records the exact mapping in tests
so future changes are deliberate and reviewable.

Disabled records are reconciled along with published records. Removing
Uncategorized therefore leaves no hidden invalid tombstones.

## Validation and query behavior

Canonical validation rejects:

- Frontends whose primary function is not `frontend`;
- Presets whose primary function is not `preset`;
- Extensions whose primary function is `frontend`, `preset`,
  `uncategorized`, missing, or unknown; and
- any record whose primary function is `uncategorized`.

Catalog building asserts the same relationship before generating public data.

The category navigation contains:

- All Projects;
- Frontends;
- System Presets; and
- the six Extension functional categories.

Frontends and System Presets continue to filter structurally by kind.
Extension category filters match `primary_function`. Query parsing discards
the removed `uncategorized` value from stale external URLs without throwing.
The active-query display cannot generate a new Uncategorized chip.

Kit purposes continue to derive only from non-Frontend components. Preset
components may display the structural Preset purpose or be excluded from
Extension-purpose aggregation according to the existing Kit presentation
contract; they must not reintroduce one of the Extension categories as their
primary function.

## Error handling

- Missing Extension category in a browser submission: keep the form in place
  and identify the required field.
- Invalid structural kind/function pair: reject before source probing or model
  calls.
- Legacy submission without a category: request correction; do not infer.
- Classification model mismatch: preserve the submitted value and warn.
- Classification model failure: preserve the submitted value and report that
  the optional check was unavailable.
- Enrichment output containing a primary function: reject the obsolete output
  shape during contract migration; never write it.
- Ordinary user targeting a staff-only card: explain the authority failure and
  generate no branch.
- Stale project or Kit edit: stop before mutation and request regeneration from
  current canonical state.
- Staff Kit edit attempting to change immutable provenance: reject the
  manifest or ignore no fields silently; the canonical apply result must retain
  provenance.

## Security and trust boundaries

- Project and Kit manifests remain untrusted.
- GitHub issue author login, ID, and `author_association` are read from the
  refreshed host-repository issue.
- A submitter cannot claim a trusted-editor ID, role, `OWNER`, `MEMBER`, or
  `COLLABORATOR` association in issue text.
- Staff authority requires both the reviewed immutable-ID registry and a
  current trusted GitHub association.
- Staff authority is scoped to reviewed project and Kit workflows; it does not
  bypass catalog validation, source identity rules, moderation, path
  allowlists, or PR approval.
- Classification explanations are sanitized, bounded, and treated as
  untrusted model output.
- Raw README text and provider payloads do not enter issue comments, PR bodies,
  reports, or generated catalog data.

## Testing

Implementation follows test-driven development.

### Submission tests

- The Extension form shows the six-category Primary function select.
- Frontend and Preset forms do not show the select.
- Frontend and Preset manifests contain their structural value.
- Extension manifests preserve the selected value through browser review,
  GitHub handoff, direct fallback parsing, triage, generation, and registry
  output.
- Project Type changes reset classification safely.
- Legacy and malformed manifests cannot invoke model classification as a
  fallback.

### Classification review tests

- Matching suggestions produce no warning.
- Mismatches preserve the submitted record value and produce sanitized review
  warnings.
- Invalid or unavailable review output preserves the submitted value.
- Frontend and Preset intake never calls the Extension classifier.
- Category definitions reach the provider.

### Enrichment tests

- Pending enrichment preserves primary function.
- Forced `all-automatic` enrichment preserves primary function.
- Retry and fallback paths preserve primary function.
- Provider schemas and repair prompts no longer request it.
- Owner-edited primary function survives every enrichment mode.

### Registry and catalog tests

- Every canonical record satisfies the kind/function matrix.
- No canonical record uses Uncategorized.
- The complete 37-record migration matches the approved structural and manual
  classifications.
- Uncategorized does not appear in navigation, query serialization, active
  filters, generated catalog labels, or Kit purposes.
- Stale `?category=uncategorized` URLs fall back safely.

### Project-owner tests

- Primary function is selectable only for Extensions.
- Frontend and Preset owner edits preserve their structural value.
- Ordinary personal GitHub owner authorization retains all current identity
  checks.
- Allowlisted owner, admin, and maintainer IDs with a current trusted
  association can edit every supported card shape.
- Unlisted IDs and other associations cannot use the staff route.
- Staff authority is rechecked before generation.
- Primary-function-only edits preserve enrichment policy.
- Summary or capability edits retain manual-enrichment protection.
- PR markers and reports distinguish owner and staff authority.

### Kit tests

- Authors can still edit their own Kits.
- Trusted staff can edit another author's Kit.
- Untrusted non-authors cannot edit a Kit.
- Staff edits preserve author, ID, source issue, publication time, and reaction
  identity.
- Staff edits update only editable content and `updated_at`.
- Triage and final apply independently reject missing authority.

### Full verification

- Focused unit suites pass at every test-first step.
- Full unit suite passes.
- Type checking, formatting, catalog validation, content checks, generated
  catalog build, static production build, Kit export, and workflow contract
  tests pass.
- Targeted project-submission, Help owner-request, catalog navigation, and Kit
  edit end-to-end tests pass.
- `git diff --check` reports no whitespace errors.

## Rollout

1. Add structural vocabulary and validation support for `preset`.
2. Add version-3 submitter classification and intake-only review warnings.
3. Remove primary function from enrichment authority.
4. Extend project-owner authority and preserve field-specific enrichment
   policy effects.
5. Extend existing Kit edit authorization while preserving provenance.
6. Reconcile all 37 records.
7. Remove Uncategorized from vocabulary, navigation, queries, and invariants.
8. Rebuild generated catalog data and run complete verification.
9. Merge as one coordinated contract change so no deployment accepts a
   category value that the active form or validator cannot represent.

## Success criteria

- No Frontend can have a primary function other than `frontend`.
- No Preset can have a primary function other than `preset`.
- Every Extension has one of the six approved Extension categories.
- Submitter-selected Extension classification survives intake unchanged.
- Model disagreement is visible but non-mutating.
- Scheduled and forced enrichment cannot alter primary function.
- Uncategorized no longer exists in canonical data or top navigation.
- Project owners retain reviewed correction access to eligible cards.
- Trusted Tavernary staff can submit reviewed edits for any card.
- Trusted Tavernary staff can edit any Kit without changing its provenance.
- All 37 affected records are reconciled and the full repository verification
  gate passes.
