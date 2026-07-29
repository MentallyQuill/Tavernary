# Provenance-Aware Catalog Copy and Automated Project Publication

## Summary

Tavernary will make project creation and authorized project editing fully
automated while retaining generated pull requests as isolated validation,
audit, and publication transactions.

Project summary handling will depend on authenticated authorship:

- a verified personal GitHub repository owner or trusted Tavernary staff
  member receives a preservation-oriented copy pass;
- a community submitter receives an evidence-synthesized summary using the
  README first, repository description second, and submitted description
  third; and
- every resulting summary passes a shared catalog-copy policy contract.

The preservation lane returns wording unchanged whenever possible. It makes
only the smallest necessary corrections for emoji, clearly incorrect
punctuation, obvious spelling mistakes, deterministic catalog constraints, or
catalog-policy conflicts. It preserves project names, terminology, voice,
sentence order, and summary structure.

Generated project pull requests will no longer require staff approval.
Creation, card edits, source moves, and delisting keep their domain-specific
validation but emit one shared publication-transaction contract. A common
GitHub Actions publisher validates the exact candidate, rechecks authority and
current state, runs content CI, and merges the exact validated SHA.

A separate asynchronous model review examines published source evidence for
potential catalog-policy concerns. It never blocks, removes, or reverses a
listing. A suggested review creates a neutral maintenance issue with bounded,
sanitized evidence context so Tavernary staff can decide whether any action is
appropriate.

## Goals

- Detect whether a new GitHub project submission was authored by the current
  personal repository owner.
- Preserve verified-owner and trusted-staff summary wording and structure
  whenever catalog requirements allow.
- Build community-submitted summaries from public source evidence rather than
  treating community wording as authoritative.
- Prevent emoji in project-description controls without blocking profanity or
  using a deterministic offensive-word list.
- Permit consensual adult sexual content, kink, fetish-oriented roleplay, and
  ordinary profanity.
- Neutralize catalog wording that conflicts with policy without automatically
  adjudicating project eligibility.
- Publish new projects and authorized project changes without staff approval.
- Retain generated PRs as isolated candidate commits, validation boundaries,
  audit history, and rollback surfaces.
- Use one shared transaction and auto-publication architecture for project
  creation, card edits, source moves, and delisting.
- Notify staff after a verified owner delists a project.
- Create non-blocking post-publication maintenance notices for model-suggested
  catalog-policy review.
- Preserve the static-first architecture and GitHub-owned identity, workflow,
  and audit model.

## Non-goals

- Tavernary accounts, OAuth, a runtime API, a database, or an externally hosted
  bot.
- A separate bot account, GitHub App, or contributor identity for merging.
- Direct issue-to-`main` project publication.
- Automatic removal, quarantine, or rejection based on model policy review.
- A hard-coded slur, profanity, sexual-content, or offensive-word list.
- Censoring consensual adult sexual content or ordinary profanity.
- Broad stylistic rewriting of owner or trusted-staff summaries.
- Letting README instructions alter provider behavior or workflow authority.
- Letting a manifest claim owner or staff authority.
- Automatically restoring an owner-delisted project.
- Moving Kit publication into the project PR transaction system. Kits retain
  their existing publication architecture while reusing trusted-staff
  authority where applicable.

## Design principles

### Authorship changes editorial authority

Repository ownership does not decide whether a public project may be
submitted. It decides how Tavernary treats the supplied summary.

Verified owners and trusted staff have editorial authority over their proposed
wording. Community submitters provide useful context, but Tavernary grounds the
published summary in project-owned public evidence.

### Minimal transformation is the owner contract

The preservation lane returns the proposed summary exactly unchanged unless a
specific catalog requirement requires an edit. When an edit is necessary, it
changes only the smallest relevant span and preserves unaffected wording,
sentence order, sentence count, emphasis, voice, and structure.

Improving style, enforcing a preferred catalog voice, optimizing sentence
count, normalizing unfamiliar vocabulary, or making text more marketable never
justifies an owner or staff rewrite.

### Models edit copy but do not adjudicate eligibility

The publication-stage model can produce catalog-safe wording and a sanitized
advisory signal. The post-publication model can suggest staff review. Neither
model may reject, delist, quarantine, or reverse a project.

### Pull requests are machine transactions

Generated PRs remain part of the architecture even after human approval is
removed. They isolate the proposed commit, run exact content validation,
surface the complete diff, serialize merge behavior, retain GitHub history,
and support ordinary reverts.

### Domain rules remain domain-owned

Creation and editing do not become one monolithic workflow. Each domain
producer owns its validation and mutation. Both emit the same transaction
contract and use the same final publisher.

## Authority classes

### Verified repository owner

New-submission owner authority requires:

- a public GitHub repository;
- a personal `User` owner rather than an organization;
- a refreshed issue actor with a positive immutable GitHub user ID;
- a refreshed repository owner with a positive immutable GitHub user ID; and
- exact actor-ID and owner-ID equality.

Login comparison may support diagnostics but is not the authority primitive.
Collaborators, organization members, commit authors, and profile names do not
establish repository-owner authority.

The existing project-owner request retains its stronger operation-specific
repository identity checks.

### Trusted Tavernary staff

Trusted staff authority consumes the reviewed contract introduced by
`2026-07-29-classification-authority-and-trusted-editing-design.md`:

- immutable actor ID in
  `data/maintenance/trusted-tavernary-editors.json`;
- approved role of `owner`, `admin`, or `maintainer`; and
- current host-repository `OWNER`, `MEMBER`, or `COLLABORATOR`
  `author_association`.

Authority is refreshed during triage, generation, and final publication.

### Community submitter

Every submitter who is neither the verified personal GitHub repository owner
nor trusted Tavernary staff uses the community evidence-synthesis lane.

This includes:

- ordinary third-party submitters;
- GitHub repository collaborators;
- organization members submitting organization-owned repositories;
- unverified Codeberg owners; and
- external-source submitters.

## Summary authority

### New verified-owner or staff submission

When the verified owner or trusted staff supplied a non-empty description,
that description enters the preservation-oriented copy pass.

When no description was supplied, Tavernary uses evidence synthesis. The
browser cannot require a description conditionally because authoritative
identity is established only after GitHub creates the issue.

An owner- or staff-authored summary sets:

```json
{
  "metadata_status": "curated",
  "enrichment_policy": "manual"
}
```

The enrichment note references the source issue and authority route. Automatic
repository refresh remains independent.

An evidence-synthesized owner or staff submission retains the normal automatic
enrichment policy.

### New community submission

Community summaries use these sources in strict priority order:

1. prepared usable README at the observed immutable source head;
2. current repository description;
3. submitted description.

Lower-priority evidence may fill a genuine gap but may not override conflicting
README evidence. The provider receives each source in a separately labeled
field rather than one undifferentiated text blob.

### Owner or staff edit

An unchanged summary remains byte-for-byte unchanged and does not invoke the
copy provider.

A changed summary enters the preservation-oriented copy pass. Summary or
capability changes retain the trusted-edit design's curated/manual enrichment
protection. Classification-only, name-only, frontend, and compatibility edits
preserve current enrichment and metadata policy.

Other project-information reports do not exercise editorial authority and
cannot directly enter the automated mutation path.

## Preservation-oriented copy contract

The system instruction requires the provider to:

- return the proposed summary unchanged unless a specific catalog requirement
  requires an edit;
- change only the smallest necessary span;
- preserve exact wording and summary structure whenever possible;
- preserve meaning, positioning, factual claims, sentence order, sentence
  count, emphasis, and voice;
- preserve project names, repository names, frontend names, handles,
  identifiers, capitalization, and supplied protected terms exactly;
- preserve unfamiliar terms and possible community terminology when uncertain;
- normalize only necessary whitespace;
- correct only clearly incorrect punctuation;
- correct only high-confidence spelling errors in ordinary prose;
- remove emoji;
- neutralize catalog-policy violations without concealing supported adult
  subject matter;
- permit ordinary profanity; and
- avoid stylistic improvement, marketing, expansion, remastering, or
  catalog-voice normalization.

Protected terms derive from:

- canonical or proposed project name;
- repository owner and repository name;
- selected frontend display names;
- known catalog project names appearing in the input; and
- stable identifiers appearing in the proposed summary.

The structured result is:

```json
{
  "summary": "Catalog-ready text.",
  "result": "accepted-unchanged",
  "change_reasons": [],
  "policy_signal": "none"
}
```

`result` is one of:

- `accepted-unchanged`
- `accepted-with-light-edits`
- `accepted-with-policy-rewrite`

Allowed change reasons are:

- `emoji-removed`
- `whitespace-normalized`
- `punctuation-corrected`
- `obvious-spelling-corrected`
- `graphic-wording-neutralized`
- `slur-removed`
- `discriminatory-framing-neutralized`

`accepted-unchanged` requires byte-for-byte equality with the input after the
browser and manifest's existing required normalization. Light edits are
localized formatting or high-confidence spelling corrections. A policy
rewrite can be broader only when necessary, and still preserves unaffected
wording and structure.

Deterministic validation enforces:

- exact structured response keys and enums;
- summary length and plain-text catalog constraints;
- no line breaks, Markdown, or active markup;
- no emoji;
- protected-term preservation;
- equality for `accepted-unchanged`; and
- consistency between result and change reasons.

An invalid output receives one sanitized repair attempt. Provider
unavailability or repeated invalid output enters a retryable publication state.
Tavernary never falls back to unreviewed owner or community prose after the
critical copy stage.

## Description-field behavior

The project submission and project-management description controls remove
emoji from:

- keyboard input;
- paste;
- drag and drop;
- mobile composition; and
- programmatic input events handled by React.

Only emoji are removed. Surrounding text is preserved.

The accessible status reads:

> Emojis aren't supported in catalog descriptions. The rest of your text has
> been kept.

The permanent guidance reads:

> Keep the description suitable for a public project catalog. Mature and
> consensual adult themes are permitted, but content promoting hatred or
> discrimination, sexual exploitation of minors, or other material prohibited
> by Tavernary's Catalog Policy is not. Ordinary profanity is permitted.

The guidance links to the public Catalog Policy. No client-side
offensive-language detector is added.

## Catalog Policy

Tavernary adds a public Catalog Policy linked from submission,
project-management, project-reporting, and automated-maintenance surfaces.

The policy states:

- Tavernary is an index and does not endorse every listed project.
- Catalog descriptions must be suitable for a public project directory.
- Consensual adult sexual content, kink, fetish-oriented roleplay, and ordinary
  profanity are permitted.
- Tavernary may neutralize graphic wording without concealing that a project
  supports adult subject matter.
- Promotion of hatred or discrimination is prohibited.
- Sexual exploitation or sexual content involving minors is prohibited.
- Automated review signals are advisory rather than violation determinations.
- Community reports are the primary enforcement-review path.
- Verified owners may permanently delist their own projects through the
  product workflow.
- Owner wording may receive minimal catalog-policy corrections.
- Community summaries are grounded in README evidence first.

The policy has a stable version identifier included in model requests,
transaction reports, and advisory-review state.

## Publication transaction architecture

New submissions and project-owner requests remain separate producers. Both
emit a common `ProjectPublicationTransaction`.

```text
New submission  ─┐
                 ├─> generated transaction PR -> exact CI -> common publisher
Owner/staff edit ┘
```

The transaction contains:

- schema version;
- operation: `create`, `edit-card`, `move-source`, or `delist`;
- project ID;
- canonical source identity;
- source issue number;
- authenticated actor ID and login;
- authority route: `community-submitter`, `repository-owner`, or
  `tavernary-staff`;
- original-record fingerprint when applicable;
- normalized-input digest;
- exact generated paths;
- base commit SHA;
- generated head SHA;
- producer type;
- copy-policy result and sanitized reasons;
- policy version; and
- required final domain revalidation.

The marker is evidence rather than authority. The publisher accepts it only
when:

- the PR belongs to the Tavernary repository;
- the head uses the exact expected operation branch;
- the refreshed issue remains open, admitted, and in the expected lifecycle
  state;
- the normalized issue input still matches the transaction digest;
- the current PR head exactly matches the generated SHA;
- no human or unrelated automation changed the branch;
- every changed path belongs to the operation allowlist;
- current authority and source identity pass;
- the original-record fingerprint remains current for edits;
- the branch is based on current `main`; and
- the exact candidate passes the complete content-validation gate.

Creation and edit generation may run concurrently. Final merges use one
non-cancelling publication concurrency group. Path and identity collision
checks prevent transactions affecting the same project, source, snapshot, or
controlled vocabulary from racing.

When `main` advances, automation updates or regenerates the candidate from
current state and reruns validation. It never merges a stale candidate.

Human edits to a generated transaction branch invalidate automatic
publication. Recovery regenerates a fresh machine-owned candidate rather than
accepting an unvalidated patch.

## GitHub Actions publisher

The common publisher is GitHub Actions automation using Tavernary's existing
`GITHUB_TOKEN`. No separate bot account, contributor, service, or GitHub App is
required. GitHub may display the actor as `github-actions[bot]`.

Generation and publication use separate jobs and least-privilege permissions.
The publication job verifies the exact head SHA and merges through the GitHub
API with an expected-SHA condition.

GitHub can suppress secondary workflow events caused by `GITHUB_TOKEN`.
Generated PR publication therefore does not assume a `pull_request` event ran
CI. The existing content-validation gate is factored into a reusable workflow
or shared command invoked by:

- ordinary pull-request CI; and
- generated transaction publication for the exact candidate SHA.

A GitHub ruleset or branch protection is a rollout prerequisite:

- stable content validation is required;
- force-push and branch deletion are blocked;
- administrator recovery remains possible; and
- the narrowly scoped publication path may merge validated transactions.

## Domain publication rules

### Create

Immediately before merge, automation revalidates:

- open admitted issue and unchanged normalized input;
- public supported source;
- immutable source identity;
- current repository visibility and identity;
- no canonical or in-flight duplicate;
- resolved fork and frontend dependencies;
- valid generated record and snapshot;
- available project ID; and
- no path collision with another transaction.

The authority route selects summary behavior but does not grant exclusive
submission rights over a public project.

### Edit card

Immediately before merge, automation revalidates:

- actor ID, login, association, and authority route;
- trusted-editor registry membership when applicable;
- repository-owner identity when applicable;
- current canonical record;
- original-record fingerprint;
- normalized manifest digest;
- operation-specific editable fields;
- kind and classification invariants; and
- exact before/after mutation.

### Move source

Automatic source moves require:

- repository-owner or trusted-staff authority;
- unchanged immutable repository ID;
- current public location returned by GitHub;
- matching registry and snapshot identity; and
- no destination collision.

Authority cannot replace one project with unrelated code.

### Delist

Repository owners and trusted staff may automatically publish a delisting after
final authority and state revalidation.

The canonical transition remains:

```json
{
  "visibility": "disabled",
  "visibility_reason": "removed",
  "refresh_policy": "paused",
  "enrichment_policy": "manual"
}
```

The retained tombstone blocks ordinary automated resubmission by project ID
and immutable repository identity, including after repository rename or
transfer. No owner or automated staff relist operation is exposed.

The tombstone remains technically reversible for an exceptional manual
Tavernary staff maintenance change with fresh source validation and explicit
repository history.

## Delisting confirmation

Before an owner or trusted staff member can prepare a delisting request, an
accessible dialog displays:

> **Permanently delist `<project name>`?**
>
> You are about to remove `<project name>` from Tavernary. This delisting
> applies to `<owner/repository>`.
>
> The project will be removed from the public catalog. You will not be able to
> reverse this decision or resubmit the project. Kits containing this project
> may also be affected.

The dialog instructs:

> Type `<project name>` to confirm permanent delisting.

There is no acknowledgment checkbox. The destructive
**Permanently delist project** button remains visible but disabled until the
complete project name matches case-insensitively after trimming leading and
trailing whitespace. Internal characters must otherwise match.

On a match:

- the button becomes enabled with destructive styling;
- the field displays a positive confirmation state; and
- an accessible live status announces:
  **Project name matches. Permanent delisting is now available.**

Changing the value to a non-match disables the action again. Enter does not
accidentally confirm before the required match.

The manifest records the confirmation value and normalized project identity.
Direct GitHub fallback requests must provide the same exact confirmation.
Workflow validation remains authoritative.

## Owner-delisting notification

A successfully merged verified-owner delisting creates an idempotent,
non-blocking staff maintenance issue.

Suggested title:

> `[Owner delisting notice] <project name>`

The issue states:

> A verified repository owner automatically delisted this project. The
> authority and immutable repository identity checks passed, and the delisting
> transaction has already merged. No staff approval is required.
>
> Review is optional unless the affected-Kit information requires follow-up.

It includes:

- project name, ID, and canonical source;
- verified owner login and immutable GitHub ID;
- source request and merged transaction PR;
- publication timestamp;
- optional owner note escaped as inert plain text;
- resulting canonical state; and
- currently published Kits referencing the project.

It receives `owner-delist-notice` and remains open until staff acknowledge it.
Notification failure does not roll back delisting and retries independently.

Trusted-staff delistings do not create a redundant owner-delisting notice.

## Publication decisions

Every transaction reaches one machine-owned state:

- `ready-to-publish`: every authoritative and deterministic check passed;
- `retryable`: provider, network, GitHub, merge-race, or temporary source
  failure;
- `needs-information`: user-controlled input or dependency requires
  correction; or
- `rejected`: confirmed duplicate, unsupported operation, lost authority, or
  definitive identity failure.

Policy signals never affect this decision.

Retryable work uses bounded exponential backoff followed by scheduled recovery.
User-correctable issues remain open with exact guidance. Systemic CI,
permission, or workflow failures create a maintenance alert rather than
requiring staff approval of otherwise valid transactions.

## Post-publication advisory review

The second model stage runs asynchronously after publication. It never delays,
rejects, delists, quarantines, or reverses a project.

It receives bounded public evidence:

- prepared README at the published immutable source head;
- repository description;
- project kind and canonical identity;
- published catalog summary; and
- current Catalog Policy version.

The prompt requires contextual interpretation. Isolated terms, quotations,
historical discussion, fictional antagonists, security documentation, and
incidental language do not establish project purpose. Consensual adult sexual
content, kink, fetish content, and ordinary profanity are explicit non-
violations.

The output status is:

- `clear`
- `review-suggested`
- `review-unavailable`

Advisory categories are:

- `potential-hate-or-discrimination`
- `potential-sexual-content-involving-minors`
- `potential-other-catalog-policy-conflict`

One model call is sufficient because the output has no enforcement authority.

Review deduplication uses:

- project ID;
- immutable source identity;
- source-head SHA or equivalent evidence fingerprint; and
- Catalog Policy version.

Card edits do not repeatedly scan an unchanged README. New projects, source
moves, new evidence fingerprints, and policy-version changes can schedule a
fresh review. Provider failures enter a durable retry queue and do not affect
the listing.

## Advisory maintenance issue

`review-suggested` creates or updates one neutral maintenance issue per
project.

The issue begins:

> **Automated advisory only:** This issue is not a violation determination. No
> enforcement action was taken automatically.

It contains:

- project ID, name, and canonical source;
- advisory category;
- exact submitted summary when one existed;
- final published summary;
- sanitized copy-change reasons;
- a brief neutral model-generated explanation;
- immutable README evidence link when the flag is source-derived;
- originating transaction and merged PR;
- evidence fingerprint;
- review timestamp;
- policy version; and
- idempotency marker.

The submitted summary is bounded and escaped as inert plain text. It cannot
activate mentions, links, issue references, Markdown, or HTML.

README-originated notices may include the submitted summary as context but
must label it as non-causal unless the review actually used it as evidence.
They link to the immutable README and use a short sanitized paraphrase. They do
not reproduce slurs, graphic detail, long source excerpts, raw model reasoning,
or complete README content.

An open issue is updated rather than duplicated. A later model result never
automatically closes a staff task or overrides a human decision.

## Neutral copy-adjustment notice

When the publication-stage copy pass changes verified-owner or trusted-staff
wording, the source request receives:

> Tavernary automatically adjusted the proposed summary to meet catalog copy
> standards. The project's supported subject matter was retained.

Detailed policy reasons are not posted on the source request. They remain in
the bounded transaction report and, when review is suggested, the maintenance
issue.

## Community reporting and enforcement

Community reports remain the primary enforcement mechanism. Existing project
listing reports can lead Tavernary staff to correct, quarantine, or delist a
record.

The decision to enforce is human-authored. The resulting trusted-staff project
mutation uses the same automatic PR publication system and requires no second
staff merge approval.

## Durable data contracts

### Project publication transaction

Stores:

- operation and producer;
- actor and authority route;
- source issue;
- normalized input digest;
- source and record fingerprints;
- generated paths;
- base and head SHAs;
- copy-policy result;
- policy version; and
- validation and publication state.

### Copy-policy result

Stores:

- preservation or evidence-synthesis mode;
- result enum;
- bounded change reasons;
- advisory signal status;
- provider model identifier;
- prompt-contract version; and
- no raw source evidence.

### Advisory-review state

Stores per project:

- immutable source identity;
- reviewed evidence fingerprint;
- policy version;
- status;
- advisory category when applicable;
- review timestamp;
- retry state; and
- maintenance issue number when applicable.

This state follows Tavernary's durable report pattern. Operational report
writes are serialized and excluded from project-publication triggers so they
cannot recursively schedule new project reviews.

Administrative provenance, actor IDs, copy reasons, advisory status, and
maintenance issue references do not enter the generated public catalog.

## Security and trust boundaries

- Manifests, issue fields, source text, provider output, PR bodies, and
  transaction markers are untrusted.
- Refreshed GitHub issue and repository data establish actor and source
  identity.
- Authority is rechecked at triage, generation, and publication.
- Source evidence is explicitly delimited as untrusted reference data.
- Provider responses use strict structured schemas.
- Raw provider payloads and chain-of-thought are never persisted.
- Credentials and environment details never enter reports.
- Complete README content never enters issues or PR descriptions.
- Transaction branches belong to the base repository and exact expected
  prefixes.
- Changed paths use operation-specific allowlists.
- Final merge compares the expected SHA.
- Final publication is serialized.

The bot-owned source-issue transaction marker retains the generated SHA and
input digest. Any issue, authority, base, path, or head mismatch invalidates the
candidate.

## Failure handling

### Transient

Network, provider, rate-limit, GitHub API, source-service, and merge-race
failures retry with bounded backoff and scheduled recovery.

### User-correctable

Malformed fields, missing delisting confirmation, changed issue input, and
unresolved dependencies remain open with specific correction guidance.

### Definitive

Confirmed duplicates, unsupported sources or operations, lost authority,
identity replacement, and permanent self-service resubmission blocks follow
existing rejection lifecycle behavior.

### Systemic

CI regressions, invalid workflow configuration, permission failures, and
repeated publication failures create a maintenance alert and pause the affected
transaction.

After merge:

- notification failure does not roll back publication;
- advisory-review failure does not affect publication;
- deployment failure retries deployment and alerts maintenance; and
- owner-delisting notification failure retries independently.

## Emergency pause and recovery

A repository-controlled emergency switch pauses automatic project merges
without disabling intake or deleting queued transactions.

When publication resumes:

- queued work is reloaded from current issues;
- authority and source state are refreshed;
- candidates are regenerated from current `main`;
- validation reruns; and
- stale SHAs are never blindly resumed.

Exceptional restoration of an owner-delisted project remains a manual staff
maintenance change outside automated product workflows.

## Testing

Implementation follows test-driven development.

### Form and policy tests

- Emoji removal covers typing, paste, drop, composition, and React input.
- Surrounding text is preserved.
- Ordinary profanity is accepted.
- Accessible status and policy links render.
- Delisting requires the complete case-insensitive project-name match.
- The destructive button visibly and accessibly changes state.
- Approved delisting wording is exact.

### Summary authority tests

- Personal GitHub owner IDs select the preservation lane.
- Organization, collaborator, and Codeberg cases select community synthesis.
- Trusted staff select the preservation lane.
- No-change owner output remains exactly equal.
- Light edits modify only necessary text.
- Protected names and unfamiliar terms survive.
- Community evidence follows README, repository description, submission.
- Critical provider failure enters retry rather than unsafe fallback.
- Owner and staff summaries receive manual enrichment protection.

### Transaction tests

- Every operation produces the common marker.
- Every operation enforces its path allowlist.
- Changed issue input, authority, source identity, record fingerprint, base,
  or head prevents merge.
- Exact candidate validation is invoked explicitly.
- Only the validated SHA can merge.
- Concurrent transactions serialize safely.
- Stale candidates regenerate.
- Merge races retry without duplicate publication.
- Policy signals never affect publication eligibility.

### Advisory tests

- Consensual adult content, kink, and profanity do not trigger review.
- Isolated words, quotations, fictional antagonists, and security discussion
  do not create automatic conclusions.
- Suggested review creates a neutral maintenance issue.
- Submitted summaries are inert.
- README concerns link to immutable evidence with sanitized paraphrase.
- Evidence fingerprints deduplicate.
- Unavailable reviews retry durably.
- Review never delists or blocks.

### Delisting tests

- Authority is rechecked before publication.
- Owner delisting merges automatically.
- Owner delisting creates the staff notice.
- Staff delisting avoids the redundant notice.
- Self-service resubmission cannot bypass the tombstone.
- Manual restoration remains technically possible.

### Repository verification

- Focused unit suites pass after each red-green cycle.
- Complete unit suite passes.
- Workflow contract tests pass.
- Catalog validation and generation pass.
- Type checking, lint, formatting, and palette audit pass.
- Static production build and export verification pass.
- Submission and project-management end-to-end tests pass.
- Accessibility checks pass.
- `git diff --check` passes.

## Integration and rollout

Implementation consumes the completed classification/trusted-edit branch and
does not duplicate its authority or classification contracts.

Internal implementation may be sequenced, but one V1 switch enables automatic
publication for:

- project creation;
- verified-owner card edits;
- trusted-staff card edits;
- authorized source moves; and
- authorized delisting.

Before enabling automatic merge:

1. Merge and verify the trusted-edit dependency.
2. Configure compatible GitHub branch protection or a ruleset.
3. Establish the stable required content-validation check.
4. Confirm least-privilege workflow permissions.
5. Audit open submission and owner-request PRs.
6. Document emergency pause, regeneration, and recovery.

Live certification proves:

1. community intake generates, validates, merges, and deploys without staff
   approval;
2. verified-owner intake preserves wording and locks enrichment;
3. verified-owner and trusted-staff edits merge automatically;
4. stale authority and tampered heads refuse publication;
5. an advisory signal publishes normally and creates a maintenance notice;
6. an owner delisting merges and notifies staff; and
7. the emergency switch leaves transactions queued and safely regenerates them
   on resume.

## Success criteria

- Valid routine project creation and authorized edits require no staff
  approval.
- Generated PRs remain the exact CI and audit boundary.
- Verified-owner and trusted-staff summaries remain unchanged unless a
  necessary catalog correction applies.
- Community summaries are README-first.
- No emoji reaches catalog descriptions through supported forms or provider
  output.
- Ordinary profanity and consensual adult subject matter remain permitted.
- Model policy signals never block or remove listings.
- Suggested policy review creates actionable neutral maintenance notices.
- Verified-owner delisting notifies staff after publication.
- Owner-facing delisting is permanent through product workflows while
  exceptional manual staff restoration remains possible.
- GitHub Actions merge only the exact validated transaction SHA.
- Queued work survives transient failures and emergency publication pauses.
