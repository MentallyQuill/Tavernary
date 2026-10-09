# Maintainer operations runbook

This document describes the GitHub-only unattended-operation workflows and
the owner actions needed when credentials, permissions, or upstream policy need
repair. Routine publication and recovery use the shared canonical writer.

## Repo boundaries

Do not edit generated artifacts manually.

- Human-authored:
  - `data/registry/sources/*.json`
  - `data/registry/projects/*.json`
  - `data/registry/kits/*.json`
  - `data/moderation/*.json`
  - issue templates and workflow files
- Generated:
  - `data/snapshots/github/*.json`
  - `data/snapshots/codeberg/*.json`
  - `data/snapshots/github-refresh.json`
  - `data/snapshots/github/kits/*.json`
  - `data/reports/enrichment-report.json`
  - `src/generated/catalog.json`

## Issue intake and triage

### Issue admission

`.github/workflows/admit-issue.yml` runs on `opened`, `reopened`, and `edited`
issue events. Maintainers can also run it manually with an issue number to
recover a missed webhook; the manual path fetches the live open issue and
applies the same admission policy before routing it. External accounts may keep
their oldest 10 issues open across every public issue type. Ordering uses
creation time and then issue number; pull requests do not count. Repository
owners, members, and collaborators bypass this public-intake cap.

Admission labels are workflow state:

- `issue-admitted` allows initial Project or Kit submission triage.
- `issue-limit-reached` records a per-issue queue decision, not an account
  block.

Closing an issue restores capacity immediately; there are no stored counters to
reset. Reopening a limited issue reruns admission. If the open-issue lookup
fails, admission fails open so a legitimate report is not discarded or
stranded.

After a GitHub API outage, run **Submission intake: Check issue eligibility**
with the affected issue number. Do not dispatch triage first or manually publish
a submission that has not passed its normal Project or Kit validation.

### Submission triage

Two workflow handlers run on admitted-label and edited events for dedicated
triage automation:

- `.github/workflows/triage-submission.yml`
  - `[Project submission]` only (title-prefixed project submission issues)
- `.github/workflows/triage-kit-submission.yml`
  - `[Kit submission]` only (title-prefixed kit submission issues)

Other public issue flows are queue-only and reviewed manually:

- `[Project information]` (`02-project-information.yml`) stays on maintainer-driven review.
- `[Kit report]` (`06-kit-report.yml`) stays on maintainer-driven review.
- `[Website bug]` (`03-website-bug.yml`) goes to maintainer engineering triage.
- `[Other]` (`04-other.yml`) is a catch-all maintainer queue.
- `[Kit withdrawal]` (`07-kit-withdrawal.yml`) uses apply workflow after maintainer review.

`triage-issue.mjs` enforces project states:

- `needs-maintainer-review` while an admitted proposal is ready to generate
- `waiting-on-fork-parent` while its immediate upstream submission is open
- `needs-information` when a correctable source or metadata problem remains
- `duplicate-candidate` before automatically closing a confirmed duplicate
- `submission-retryable` when an external dependency failed transiently
- `submission-pr-open` while the generated PR is the active review surface
- `submission-declined` after that PR is closed without merging

`triage-kit-issue.mjs` owns the Kit-specific
`kit-publication-ready`/`needs-information`/`duplicate-candidate` flow. A
near-duplicate warning does not block publication; an exact duplicate does.

The triage workflow posts/updates one comment marker:

- `<!-- tavernary-submission-validation -->`
- `<!-- tavernary-kit-submission-validation -->`

Project triage does not publish a catalog record. An admitted decision
dispatches the separate generation workflow.

Valid Kit triage dispatches the separate serialized Kit publisher
automatically. Invalid Kit issues remain open for correction; direct the author
back to the retained Tavernary draft to open a fresh GitHub review.

## Project submission path

Keep repository Actions defaults read-only and Actions review approval disabled.
The Tavernary Publisher app creates generated review branches/PRs and the shared
writer performs canonical publication. `publish-project-transaction.yml` requests
that writer; automatic merge requires `PROJECT_AUTO_PUBLICATION_ENABLED=true`
and every authoritative check matching the exact validated head SHA.

1. The static Tavernary builder creates the authoritative manifest and opens
   `01-project-submission.yml` as a review mirror carrying
   `project-submission`. New intake uses manifest version 4 with
   independent summary/tag requests; manual values claim no authority.
2. `triage-submission.yml` normalizes the URL, maintains the generated title,
   inspects source facts, reconciles frontend vocabulary, and checks duplicates.
3. A duplicate receives the triage explanation and closes before generation. A
   correctable failure remains open with `needs-information`; direct the author
   back to `/submit/project/` to open a fresh review.
4. An admitted issue requests `generate-project-submission.yml` with its issue
   number. Its short owner/request job selects current work and wakes the shared
   writer. The writer reserves primary and repair model allowance before
   dispatching the authenticated budgeted generation job. That job creates
   `automation/project-submission-<issue-number>`, writes only declared registry,
   snapshot, and optional frontend-vocabulary files, validates/builds them, and
   opens one PR marked with `Closes #<issue-number>`.
5. The issue changes to `submission-pr-open`. The PR is the isolated CI,
   audit, and rollback transaction.
6. Successful dispatched CI triggers the serialized publisher, which refreshes
   current issue, authority, source, record, path, base, and head state before
   an exact-SHA merge publishes through `main` and closes the linked issue.
   The shared writer then waits for exact public revision/assets and both-browser
   confirmation before finalizing labels, notices and dependent recovery.
   `project-submission-lifecycle.yml` is a writer request bridge; branch cleanup
   retains the exact closed-PR head guard.
7. Close without merging only when declining the submission. Lifecycle
   automation applies `submission-declined`, posts one marked explanation,
   closes the issue as not planned, and performs the same guarded branch cleanup.

### Manual generation and recovery

Run **Project submissions: Create review PR** manually when an admitted issue did
not dispatch or a retryable dependency has recovered:

1. Open Actions -> **Project submissions: Create review PR** -> **Run workflow** on
   `main`.
2. Enter `issue_number`.
3. Leave `force_regeneration` false for the normal non-destructive path.

Leave `operation_key`, `request_run_id` and `budget_ticket` empty/default; the
writer supplies them after authenticated admission and allowance reservation.
For owner listing work, use **Project owner requests: Create review PR** with
the same request defaults. Its force flag does not authorize overwriting
maintainer changes. Successful native request history lets scheduled recovery
resume a dropped wake without another owner request.

The branch and PR are deterministic, so a safe rerun updates the existing
proposal rather than creating a second review. If the PR head no longer matches
the generation marker, the workflow stops because a maintainer changed the
branch. Keep those corrections and continue review without regeneration.

Set `force_regeneration: true` only after reviewing the PR and deciding that
automation may replace every marker-owned generated path. Forced regeneration
rebases the branch onto current `main`, replaces only the declared generated
paths, preserves unrelated branch files, and pushes with `--force-with-lease`.
It never uses an unguarded force push. If the generated branch moved after PR
closure, lifecycle cleanup leaves it intact for manual inspection.

New triage rejects retired manifest version 3 and asks the submitter to
regenerate through the current form. The generation path may upgrade version 3
only when an issue was already admitted before the cutover
(`needs-maintainer-review` or `submission-pr-open`). This compatibility path
prevents an admitted request from being stranded; it is not accepted for new
intake.

### Fork dependency recovery

For a child labeled `waiting-on-fork-parent`, inspect the marked validation
comment for the upstream issue number. If that upstream is still open, review
its generated PR normally; do not remove the waiting label or generate the
child early.

After verified publication, lifecycle requests wake the shared writer.
`retry-fork-dependencies.yml` also provides scheduled/manual wakes; it no longer
runs an independent scanner or publisher. The writer re-fetches the marked
upstream issue, numeric bot custody and current dependency state in a bounded
rotating batch. A terminal declined/deleted/private upstream admits the child
with name-only provenance; the parent's publication outcome does not block it.

If the retry workflow fails:

1. inspect the failed `retry-fork-dependencies.yml` run;
2. fix the transient GitHub/API or workflow problem;
3. rerun **Project submissions: Retry fork dependencies** on `main`;
4. confirm the child moves from `waiting-on-fork-parent` to either another
   immediate-parent wait or `needs-maintainer-review`.

If two system-created upstream issues exist for one repository identity, keep
the oldest valid issue, close the duplicate as a duplicate, and rerun the retry
workflow. Do not manually copy the child to a different issue; the ancestry
marker and stable repository ID are the deduplication authority.

A cycle or a chain reaching the 16-repository limit intentionally stops at
`needs-maintainer-review`. Inspect the ancestry marker, correct a bad repository
identity if present, or review the affected project manually. Do not raise the
bound to force automation through an unverified graph.

### Fork dependency backfill

Preview the exact snapshot paths and missing-upstream candidates:

```powershell
$env:GITHUB_TOKEN = gh auth token
npm run submissions:backfill-forks
Remove-Item Env:GITHUB_TOKEN
```

The default is read-only. After reviewing that report and explicitly approving
the mutation, apply it with:

```powershell
$env:GITHUB_TOKEN = gh auth token
$env:GITHUB_REPOSITORY = gh repo view --json nameWithOwner --jq .nameWithOwner
npm run submissions:backfill-forks -- --apply
Remove-Item Env:GITHUB_TOKEN
Remove-Item Env:GITHUB_REPOSITORY
```

The apply path updates only the reported GitHub snapshots, creates or reuses
normal upstream submission issues, and dispatches their triage. Run
`npm run catalog:build`, inspect the resulting public relationships, then use
the manual catalog verification checklist below before committing.

## Project information + website bug

- `[Project information]` helps maintainers patch or quarantine records.
- `[Website bug]` belongs to app/code changes in source and PR workflow.
- `[Other]` supports non-catalog escalations.

## Menu report triage and owner-listing recovery

The Menu has ordinary public routes: /menu/manage-project/,
/menu/report-project/, /menu/report-website/, /menu/report-kit/,
/menu/withdraw-kit/, and /menu/other/. Their text is public GitHub issue content. The private
/menu/security/ route goes to security/advisories/new and must never be
replaced with an /issues/new form. Tavernary does not provide support for
third-party projects; route those users to the listed project's own channel.

Triage project-information, website-bug, kit-report, and other-help reports as
maintainer-owned queues. Preserve the supplied manifest and public evidence in
the issue, and direct corrections to the matching Tavernary route before a
fresh GitHub review. Make a normal reviewed PR for site or catalog changes. A serious listing report may
retire or quarantine one card, pause source refresh, or preserve a source
delist tombstone rather than deleting historical records.

project-owner-request automation accepts the current personal GitHub owner of a
listing's verified repository ID and reviewed Tavernary staff. Staff authority
requires an immutable GitHub user ID in
`data/maintenance/trusted-tavernary-editors.json` plus a current trusted
repository association. Association alone does not grant authority. Trusted
owners, admins, and maintainers may edit any catalog card or source; source
moves still require an immutable GitHub repository identity. Other
rights-holder requests return to a human-reviewed project report. Common owner
failure reason codes are issue-author-not-owner, stale-owner-request,
project-not-found, unsupported-source, and owner-request-invalid; keep the
issue open with the recorded reason unless the workflow's terminal policy
closes it.

For an admitted owner request, the generated
automation/project-owner-request-<issue-number> PR is the validation and audit
transaction for:

- editing one card;
- **Add cards from this source**, as one to ten cards in one atomic batch;
- updating the repository location after a rename or transfer while preserving
  the immutable source ID and every project ID;
- retiring one card;
- restoring one retired card; and
- permanently delisting one source.

Only one unresolved add-card request per source may exist at a time. The lock
is source-wide, so sibling cards cannot open parallel batches. Add-card
transactions use manual publication mode and await maintainer merge even when
the actor is the verified repository owner. Values may be cloned into a draft,
but metadata-policy provenance is never cloned.

Retire or restore is a soft card operation. It changes only
`listing_status`/`listing_status_reason` and preserves the source, snapshot,
other cards, and Kit references. Permanent delist is the nuclear operation: it
marks the source tombstone, pauses refresh, and hides every card associated
with that source. Do not model routine card removal as a source delist.

`refresh_policy` is source-owned. Summary and tag policy are independently
card-owned under `metadata_policy`.

If generation failed or a retryable dependency recovered, rerun the owner
triage/generation workflow from main. Regeneration may update only marker-owned
generated paths. If a maintainer changed the PR branch, preserve those changes
and investigate before forcing a replacement. The automatic publisher applies
the authorized policy transition. Closing the generated PR
without merging declines the request; retain a delisted record as a tombstone
with its reason so it cannot be silently recreated.

## Automatic project publication operations

`PROJECT_AUTO_PUBLICATION_ENABLED` is the single emergency merge switch. Set it
to the exact string `true` to enable ordinary create, edit, source-move, retire,
restore, and source-delist publication. Add-card batches still await maintainer
merge. Intake and generation continue while it is absent or false;
queued transactions are reconstructed from current issues and current `main`
when publication resumes.

Keep the active main ruleset's strict native `verify` and `visual` checks, review
requirements and resolved-thread requirement. Keep Actions defaults read-only
and Actions review approval disabled. The scoped Publisher app supplies canonical
contents/PR/issue/dispatch authority; it must remain the allowed writer under
the existing main and automation-branch rules. Individual jobs retain their
declared limited Actions-token permissions.
The publisher accepts only a successful `workflow_dispatch` validation run for
an in-repository generated branch. It compares the common transaction marker,
current admitted issue, immutable actor and source authority, normalized input
digest, record fingerprint, current base, exact path allowlist, and exact head
SHA. A stale transaction regenerates; a temporary API or mergeability failure
retries; a lost authority or invalid path is rejected.

After native merge proof, shared reconciliation reconstructs publication from
co-committed canonical evidence, coalesces deployment work and confirms the
actually served export. Finalization then projects lifecycle, dependent recovery,
owner/copy notices and non-enforcing advisory work. Dropped wakes and missing
receipts do not authorize a repeated publication. Notification, advisory and
deployment failures preserve the canonical publication for recovery.
Verified-owner delisting creates `owner-delist-notice`; staff acknowledge it
only when follow-up is useful.

The advisory workflow is post-publication and non-enforcing. It stores only
sanitized state under `data/snapshots/policy-review/`, retries unavailable
evidence/provider results, and creates a neutral maintenance issue for
`review-suggested`. Consensual adult content, kink, fetish content, and ordinary
profanity are not policy conflicts.

Exceptional restoration of an owner-delisted repository is manual Tavernary
staff maintenance. Verify the current repository identity and ownership,
document the exception, restore the canonical source status, validate the
catalog, and publish through an ordinary staff-maintained change. Do not reopen
self-service submission for that repository.

### Current source-registry and transaction format

Sources live in `data/registry/sources/`; cards reference their stable source ID.
Identity backfill changes source records, not card identifiers. Publication
transaction schema version 2 binds the source, card, allowed paths and authority.
A legacy version-1 PR must regenerate from its still-open issue; the publisher
rejects it rather than guessing how to map old project-keyed paths. Historical
cutover observations belong to the verification ledger, not a new migration run.

## Refresh automation

Workflow: `.github/workflows/refresh-catalog.yml`

- Schedule: `17 7 * * *` UTC via `cron`.
- Manual modes:
  - `incremental` (default)
  - `baseline` with `batch_size` (1-24)
  - `project` with `source_id`
  - `forensic` with `source_id`
- Leave `operation_key` empty for scheduled/manual requests; the writer selects it.
- Requests and individual preparations have separate non-canceling
  `catalog-refresh-<request-or-operation-key>` concurrency.
- `if` guard allows scheduled or `refs/heads/main` manual dispatch.
- Steps:
  1. select current source requests from trusted main;
  2. dispatch pinned read-only preparation for the selected source;
  3. retain the immutable result/diagnostic artifact;
  4. revalidate native producer, source identity, input and paths in the writer;
  5. publish validated facts and observation times with current-main comparison;
  6. coalesce publishable revisions and confirm their actual public exports.

Baseline requests select a bounded provisional batch. Scheduled reconciliation
continues due work; `data/snapshots/github-refresh.json` records progress.

The refresh manifest uses schema version 3. Its aggregate counts remain the
dashboard contract, while `providers.github` and `providers.codeberg` report
isolated checked, changed, failed, request, and remaining-budget values.
Provider failures do not discard successful work from the other provider.

For Codeberg rate limits or outages:

1. Inspect `providers.codeberg` and the affected snapshots' `stale_since`.
2. Leave last-known evidence in place; do not hand-edit snapshot facts.
3. Retry a single project after the provider budget recovers.
4. Escalate repeated 404 or identity-change results for source verification.

Only `codeberg.org` is supported. Do not redirect the adapter to an arbitrary
Forgejo/Gitea origin or infer that GitHub and Codeberg repositories are mirrors.

## Enrichment automation

Owner request: `.github/workflows/request-catalog-enrichment.yml`; read-only preparation: `.github/workflows/enrich-catalog.yml`.

### Reconciled read-only preparation

The controller selects a metadata operation by its immutable source, observed
commit/description, independent automatic fields, project traits, policy and
tag vocabulary. The shared writer checks the normalized README/description
cache before reserving model allowance. A valid cache hit dispatches a
read-only cache update with no model ticket. A changed source reserves primary
and repair allowance in `data/maintenance/automation/model-budgets/global.json`
before dispatch, then binds it to one authenticated preparation run.

Preparation accepts `operation_key` and `budget_ticket`, runs pinned main code
for at most forty-five minutes, and emits an immutable data artifact. It cannot
write canonical files. The writer rechecks the actual source's numeric identity,
pinned content, automatic field authority, vocabulary and proposed output
digest before publishing the project and cache sidecar together. Advisory
preparation follows the same ticket rules and emits only non-blocking review
state. Manual transaction review inputs remain required.

The global ceiling is forty requests and two hundred thousand conservatively
requested tokens per UTC day, including repair allowance. The current primary
reservation covers three attempts and up to 180,000 requested tokens; configured
JSON repair reserves one further request and 15,000 tokens. Unused or unknown
allowance stays charged, so this pessimistic envelope can limit optional
metadata throughput to one operation per day. Required price accounting fails
closed when a configured model has no matching price. Budget/configuration
refusal saves a daily retry; transient provider failures use normal bounded
backoff. Inspect sanitized failure receipts and the budget state before changing
provider settings. Verified scan and catalog facts remain publishable without
model calls.

### Owner rollout and recovery

The owner records a request on trusted main code. For example:

```powershell
gh workflow run request-catalog-enrichment.yml --ref main -f enrichment_scope=all-automatic -f batch_size=20 -f model_concurrency=2
```

`pending` selects automatic fields still needing enrichment; `all-automatic`
selects every record with an automatic field. Neither scope overrides manual
field policy or changes `primary_function`. Select the running full report's
existing scope and configured model when resuming. A new request preserves
that report's complete manifest, primary/retry cursors, batch size, concurrency,
entries and exclusions; it never resets the legacy 180/281 checkpoint.

The five-minute request has read access and no model credentials. Authenticated
request metadata supplies authority to the shared writer. Each preparation
handles one record, runs for at most forty-five minutes and uses writer-reserved
global model allowance. No separate unbudgeted preflight is performed: the
first actual canary calls must return validated output from the configured
model. A representative five-to-seven-project canary must have a native
co-committed checkpoint and a verified retained bundle with browser proof
before the full report receives its canary authorization. An unchanged canary
may be served by a later catalog revision; identity, field policy, listing
authority and selected metadata must still match. A historical canary's green
Action or editable report fields alone cannot authorize full work.

Provider outages, invalid credentials/model configuration and exhausted
allowance retain pending work with bounded retry. Primary and retry passes
stop before further provider calls when allowance is unavailable. The shared
writer rechecks source identity, exact content, independent automatic fields
and owner decisions before publishing each checkpoint. Model-ready Reddit
sources use the actual post identity and freshly checked source content.
The ordinary catalog-data gate validates catalog/build output and essential
browser behavior; the full implementation suite is not rerun for each record.

Inspect the two private reports for selection mode, manual exclusions, cursors,
model/repair/rate-limit metrics and sanitized project reasons. Full deployment
finalization records the actual verified run once, and replay recovers an
already-committed approval without repeating model work. A terminal
`complete-with-errors` report leaves failed projects provisional and opens the
existing bounded native incident `[automation] Catalog enrichment has unresolved
projects`. A later clean full report closes it only with native publication,
retained-bundle and browser confirmation. Running, missing or edited proof
cannot clear the incident. The native incident mechanism respects owner edits
and dismissals. Historical `Catalog enrichment errors` notices remain under
owner control instead of being rewritten by the removed shell publisher.

When a canary fails, repair the affected source/provider and create a new owner
request. If a completed canary's input has changed before deployment, restore
or correct the affected authority/input through owner review before retrying;
do not manufacture approval by editing report control fields. Keep the running
full checkpoint intact. The scheduled controller also recovers a missed request
wake and resumes after an outage.
Every model-backed workflow uses the utility provider for its first structured
response. Configure the selected utility model with:

- `UTILITY_API_ENDPOINT` — the complete OpenAI-compatible
  `/chat/completions` URL
- `UTILITY_API_KEY`
- `UTILITY_MODEL`

Set the optional repository variable `UTILITY_REASONING_EFFORT` to a level
supported by that model (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`,
or `max`). An unset or empty variable preserves the existing model default.
This setting applies to primary requests only; JSON repair keeps its own
model-specific settings. The current NanoGPT GLM route requires reasoning:
use `low`, not `none`. A real EchoCore admission probe completed with valid
copy in 8 seconds at `low`; the default request timed out after 300 seconds.
A 4,096-token cap alone produced no answer content, so no primary output
cap was added. See [NanoGPT reasoning controls](https://nano-gpt.com/support)
for provider support; recheck a real request before changing model settings.

The existing enrichment secrets configure GPT-5.6 Luna as a JSON-only repair
provider:

- `TAVERNARY_ENRICHMENT_API_URL` — the complete OpenAI-compatible
  `/chat/completions` URL
- `TAVERNARY_ENRICHMENT_API_KEY`
- `TAVERNARY_ENRICHMENT_MODEL`

Provider configuration is validated before either API receives a request.
A `provider-configuration-invalid` error identifies `Primary provider` for
`UTILITY_*` settings or `JSON repair provider` for `TAVERNARY_ENRICHMENT_*`
settings. Both configurations must be valid, even when a response will not
need repair. Check the named role's URL, API key, and model; never print
secret values into workflow logs. After correcting configuration, regenerate
one blocked submission and verify its review PR before retrying the queue.

Luna is called at most once and only when the utility response is malformed
JSON, is not an object, or fails the requested JSON schema. It receives the
damaged utility response, the schema, and sanitized validation paths—not the
original repository, report, issue, README, or prompt content. Provider errors,
tool calls, missing content, unsafe oversized responses, and model mismatches
fail normally without a repair attempt.

### Locking a metadata field from model enrichment

The canonical policies live on the project card in
`data/registry/projects/<id>.json`. To preserve a trusted manual summary while
leaving tags automatic, set:

```json
"metadata_policy": {
  "summary": {
    "mode": "manual",
    "note": "Trusted Tavernary editor selection."
  },
  "tags": {
    "mode": "automatic"
  }
}
```

Use a short, trusted maintainer-facing note. Selection, provider requests, and
atomic writes all enforce each field lock independently. A card with both
fields manual is excluded from enrichment.

To return the summary to automatic enrichment, set:

```json
"summary": {
  "mode": "automatic"
}
```

Remove that field's manual `note` at the same time; automatic policies cannot
retain one. Metadata policy is card-owned and independent of the source-owned
`refresh_policy`: refresh controls repository evidence collection, while
metadata policy controls model-written editorial fields.

## Kit workflow

Workflow set:

- `.github/ISSUE_TEMPLATE/05-kit-submission.yml` issues route to
  `[Kit submission]`.
- `.github/workflows/triage-kit-submission.yml` applies labels:
  `kit-publication-ready`, `needs-information`, `duplicate-candidate`.
- Valid triage dispatches `.github/workflows/apply-kit-submission.yml`
  automatically with the issue number.
- `.github/workflows/apply-kit-submission.yml` applies valid edit/create issues:
  - re-fetches and validates issue content again, including the shared
    severe-language policy
  - accepts either the canonical Kit author or `tavernary-staff` authority from
    the reviewed immutable-ID registry plus current association
  - preserves Kit ID, canonical author, source issue, `published_at`, and
    support snapshot identity for a staff edit
  - prepares an immutable `data/registry/kits/<kit-id>.json` result without
    canonical write authority
  - lets the shared writer validate/build and publish with fresh authority,
    current-main and exact-path guards
  - serializes canonical publication under `canonical-publication`
  - treats an unchanged edit retry as a timestamp-preserving no-op
  - dispatches the deploy workflow for the exact pushed SHA
  - applies `kit-published` and closes the source issue only after the exact
    public revision/assets and Chromium/WebKit proof are confirmed
- `.github/workflows/apply-kit-withdrawal.yml` + `scripts/kits/apply-withdrawal.mjs`:
  - only Kit author numeric ID may withdraw
  - prepares withdrawn tombstone status without changing identity/history
  - publishes through the same writer and closes only after public confirmation.

If Kit validation fails, correct the manifest by editing the open issue.
Automation reruns triage. After valid triage, scheduled reconciliation can
recover dropped preparation/publication/confirmation wakes. Request a writer
reconcile pass when an immediate wake is needed. Do not hand-edit generated
registry or catalog artifacts. Verified publication evidence survives label or
issue-closure failures; finalization resumes without publishing the Kit again.

## Identity and moderation maintenance

### Quarantine recovery

If `source_health: identity-change`:

1. inspect the card's `source_id` and corresponding `data/registry/sources/<source-id>.json`;
2. verify the immutable upstream repository identity and owner authority;
3. submit a minimal reviewed source correction, preserving source/card IDs and tombstones;
4. request targeted refresh with `refresh-catalog.yml`, `mode=project`, and `source_id`;
5. use the source identity backfill workflow only for missing verified identities.

### Repository identity backfill workflow

Use this workflow for reproducible identity persistence:

- Workflow: `.github/workflows/backfill-repository-identities.yml`
- Trigger: `workflow_dispatch` on `main`
- Inputs:
  - `source_ids`: optional newline-separated source IDs, empty means all missing identities
- The request bridge dispatches writer mode `backfill-identities`; at most 256
  missing identities can be published per write.
- Canonical concurrency: `canonical-publication`
- Commit scope: only `data/registry/sources/*.json`
- Validation + guardrails:
  - `npm run catalog:validate`
  - unknown/duplicate IDs, identity conflicts, or validation failures block writing
  - fresh canonical validation and exact current-main comparison; a changed base
    defers the write instead of rebasing stale identity data

### Transient stale handling

- `source_health: unavailable` keeps last known values visible in pending state.
- No immediate manual action unless repeat incidents show prolonged stale patterns.

### Kit/record safety repair

- Follow `docs/maintenance/kits.md`.
- Keep Kit ID, source issue, `published_at`, and author identity unchanged.
- Preserve support snapshots; a staff edit must not rewrite reaction identity
  or history.

## Verification checklist for manual catalog mutations

For changes confined to the approved catalog/Kit/source/report data paths, run
the focused content gate from the repository root:

```powershell
npm run check:content
npm run test:content-e2e
```

The focused browser command covers both Chromium and WebKit. Required CI and
public deployment confirmation still gate the exact submitted revision.

For implementation, dependencies, schemas, vocabulary, configuration,
workflow changes, or uncertain classification, run the full gate:

```powershell
npm run check
```

Deployment trigger sequence:

- Refresh and Kit entrypoints request read-only preparation; the shared writer
  publishes validated canonical data.
- The deployment controller coalesces eligible revisions and publishes Pages.
  Every deployment still needs matching revision/assets and Chromium/WebKit
  confirmation.
- Owner enrichment uses `request-catalog-enrichment.yml`; budgeted read-only
  preparations and shared-writer canary/full admission preserve the frozen
  manifest, checkpoints, owner field policy and manual publication decisions.

## Recovery, credentials, and owner controls

Request an immediate shared-writer pass from current main:

```powershell
gh workflow run automation-writer.yml --repo MentallyQuill/Tavernary --ref main -f mode=reconcile
gh run list --repo MentallyQuill/Tavernary --workflow automation-writer.yml --limit 10
```

Inspect the selected native run with `gh run view <run-id> --log-failed`.
The receipt under `data/maintenance/automation/operations/<operation-key>.json`
records retry timing; co-committed publication and verified public deployment
prove completion. Keep pending receipts, frozen rollout manifests, owner
decisions and tombstones intact during diagnosis. A successful dispatch alone
does not prove publication or incident recovery.

A malformed operation receipt is isolated and reported through a sanitized
`receipt-invalid` incident. Other operations still reconstruct from native GitHub
and canonical publication evidence. When that exact operation writes a repaired
receipt, it replaces only its own path using the freshly read GitHub blob SHA.
Damaged publication records, model budgets and tombstones still stop unsafe work;
do not delete them to bypass validation.

For already-confirmed operations, workers and finalizers read the fresh issue,
complete deterministic PR branch history and saved worker instead of repeatedly
fetching global history. Canonical catalog, publication and deployment validation
still run. Missing, unsupported or stale receipts, changed revisions and ordinary
worker dispatch fall back to full discovery. A receipt cannot grant publication
authority.

Confirmation of a known completed deployment run reads fresh deployment and
rollback state without fetching unrelated issue or PR inventory. Recovery tied
to an operation still uses full discovery and exact publication authority.

The canonical writer and the owner restore deploy job share GitHub's bounded FIFO
queue: at most one runs, with up to one hundred pending runs in order. Pending
confirmation, publication and finalization are no longer replaced by each newer
reconciliation wake. The controller also completes at most one oldest eligible
confirmed operation inside its current serialized pass, within the existing
twenty-operation limit. It rereads authority and persists the actual resulting
receipt; a lost response cannot write retry state from an earlier candidate.
When the queue is full or a run is interrupted, durable state and scheduled
reconciliation remain the recovery mechanism. Inspect native run state before
issuing another manual wake.

Recognized GitHub primary and secondary rate limits, including HTTP 403 responses,
classify as `transient/provider-rate-limited`. Let the existing retry schedule back
off rather than repeatedly dispatching the writer. Safe CLI diagnostics expose only
HTTP status, a rate-limit flag and a bounded request path. An ordinary permission
denial remains `configuration/authentication-unavailable`; inspect the actual
diagnostic before changing App permissions or replacing credentials.

Scheduled reconciliation recovers dropped restore-confirmation wakes from bounded
native owner-run history within the ninety-day artifact window. Active confirmation
runs coalesce; repeated failures back off. Confirmation and bundle retention share
one slot in the twenty-operation pass. Completed restores still awaiting proof
protect their immutable bundles. For immediate recovery, request the exact native
restore run through the existing writer. Replace the placeholder with the
authenticated `restore-site.yml` run ID:

```powershell
gh workflow run automation-writer.yml --repo MentallyQuill/Tavernary --ref main -f mode=confirm-restore -f 'result_run_id=<restore-run-id>'
```

The writer independently authenticates the owner, restore-source artifact,
immutable release, current canonical state and actual public/browser proof.
For an ordinary Pages run, use `mode=confirm` with its exact native deployment
run ID. Automatic confirmation checks at most eight eligible native runs; missing
or expired metadata cannot hide an older build that is actually served. Integrity
failures stop recovery. Rebuilding one source SHA requires new exact build proof.
Retention dispatch has its own shared-lane slot and native failed-attempt backoff.
If an upload stopped before saving its archive and the Actions artifact expires,
retention can reconstruct the exact export currently served at the fixed site.
Every file must match its verified manifest; current catalog/target digests,
owner removals and both-browser public confirmation must pass. A different build
or corrupt file leaves the same draft unpublished. Already uploaded verified
archives resume directly without replacing their bytes.

The same writer safely retires eligible terminal receipt/publication pairs after
ninety days, using one slot and a bounded commit. Compact completion markers live
under `data/maintenance/automation/terminal/<key-prefix>/<operation-key>.json`;
the original records remain in Git history. A marker lets fresh inventory recover
the exact finalized receipt when the same input appears again. Preserve these
markers during diagnosis. Pending, unpaired or unproven records remain intact.
Deployment-proof cleanup requires successful native release inventory and keeps
the latest proofs, active deployment, retained bundles and pending/frozen references.
The cleanup adapter cannot delete registry identities or owner tombstones.

### Credentials and permissions

Check local CLI authentication with `gh auth status --hostname github.com`.
If that token expired, sign in again with `gh auth login --hostname github.com`.
An endpoint-specific 403 can indicate missing App/API permission; verify the
failed route and identity before replacing a valid token.

For Publisher failures, verify the installed app, numeric
`TAVERNARY_PUBLISHER_BOT_ID`, `TAVERNARY_PUBLISHER_CLIENT_ID`, and the
`TAVERNARY_PUBLISHER_APP_PRIVATE_KEY` secret in the `publisher` environment.
Repair the app installation or replace its key in GitHub settings, then use the
existing secret prompt without putting a secret in command text or logs:

```powershell
gh secret set TAVERNARY_PUBLISHER_APP_PRIVATE_KEY --repo MentallyQuill/Tavernary --env publisher
gh api repos/MentallyQuill/Tavernary/actions/permissions/workflow
gh api repos/MentallyQuill/Tavernary/rulesets/19711101
```

Expected Actions defaults are `default_workflow_permissions: read` and
`can_approve_pull_request_reviews: false`. Keep native `verify`/`visual`, review,
thread-resolution and exact-head requirements intact. Correct the scoped
installation/environment permissions when a check fails.

If token creation returns HTTP 422 with "The permissions requested are not
granted to this installation", open the Tavernary Publisher App's Permissions
and events settings. Repository Actions, Contents, Issues and Pull requests must
each allow Read and write. Save the change and approve the pending installation
permission update in GitHub installation settings. Request a fresh writer run
and verify its token-creation step succeeds. This failure does not mean the
owner's CLI token expired; replacing it does not repair the App installation.

The writer also requires repository Checks permission at Read-only for native
dependency CI evidence. Retain mode alone requests Workflows at Read and write:
GitHub requires that permission when creating or publishing a release for an
older verified revision whose workflow files differ from current main. Without
it, release creation can return HTTP 403 or 404 despite Contents write access.
See the [release API permission requirement](https://docs.github.com/en/rest/releases/releases#create-a-release).
Approve those installation permissions before deploying the scope change; the
other writer modes do not request Workflows write access. After repair, require
an actual Publisher-owned immutable release and a successful native restore
drill before treating bundle retention as recovered.

For model authentication, configured-model or billing failures, repair the
identified existing provider secret/model/price configuration. Inspect the
writer-owned global budget before changing a ceiling. Failed or interrupted
attempts remain conservatively charged; deleting budget state would permit
duplicate spending. Request reconciliation after repair and require positive
settled usage or verified progress before treating its notice as recovered.

### Emergency publication switch

Pause automatic project transaction merges, or resume after diagnosis:

```powershell
gh variable set PROJECT_AUTO_PUBLICATION_ENABLED --repo MentallyQuill/Tavernary --body false
gh variable set PROJECT_AUTO_PUBLICATION_ENABLED --repo MentallyQuill/Tavernary --body true
```

Use the applicable command, then request reconciliation. Generation can continue
while project merges are paused. Owner add-card batches and other manual
publication decisions retain their review requirement. To stop all canonical
work during a severe fault, disable `automation-writer.yml` in GitHub Actions;
after repair, re-enable that workflow and request a fresh reconcile pass.

### Verified presentation restore

List the bounded native release inventory and select a Publisher-owned immutable
verified site bundle:

```powershell
gh api 'repos/MentallyQuill/Tavernary/releases?per_page=100' --jq '.[] | select(.tag_name | startswith("site-bundle-")) | {id,tag_name,draft,immutable}'
gh workflow run restore-site.yml --repo MentallyQuill/Tavernary --ref main -f 'release_id=<verified-release-id>' -f 'reason=Restore verified presentation after incident review' -f dry_run=true
```

Review the native `site-restore-decision-<run-id>-<attempt>` artifact and both
browser results. Only the repository owner can request this workflow. A live
restore uses the same release/reason with `dry_run=false`; it rechecks current
canonical data and owner removals immediately before deployment. If current
catalog/target digests or tombstones conflict with that bundle, create a fresh
current-data export rather than overriding the guard. Restoration must never
resurrect withdrawn content or downgrade owner decisions. The active rollback
proof suppresses ordinary replay of the same canonical baseline, including builds
queued before the restore. Later genuine publishable changes can resume normal
deployment. Delayed confirmation rechecks current canonical data and owner
removals before probing and before recording the override.

### Owner responsibilities

The owner must maintain GitHub/App and provider credentials, available billing
and intended budgets, domain registration/renewal, and GitHub account/environment
permissions. Major dependency
or policy transitions that the constrained updater cannot safely verify require
review. Re-enable scheduled workflows if GitHub disables them for inactivity,
then request reconciliation and inspect native health/runtime/drill results.
GitHub-only checks cannot detect or report GitHub automation stopping completely
while GitHub itself is unavailable.

## GitHub operational incidents

### Supported runtime and retained-bundle checks

The constrained updater selects verified allowlisted Dependabot patch/minor
changes and requires exact-head native `verify` and `visual` success before
merging. It refreshes a stale substantive base. Operation-receipt bookkeeping
alone can preserve already-green CI only when complete Git ancestry and regular
receipt-file comparison prove equivalence; unknown paths, unsafe modes or missing
history still require refresh. Major or unallowlisted changes and expanded policy
remain owner review. Closed or drafted proposals preserve the owner's decision.

Production and workflow setup share `.node-version`, initially Node 24 LTS.
The official Node release schedule determines eligible successors. Weekly
compatibility checks run full verification on the current and next stable LTS;
Node 26 is not eligible before its official October 28, 2026 LTS date. The
serialized writer creates a constrained runtime PR and merges only after native
CI proves its exact head on both current and candidate runtimes. Closing or
drafting that PR preserves the owner's manual decision. Failed candidates retain
the working runtime and public export. An incident warns 90 days before end of
support; an expired runtime stays unhealthy until a supported transition merges.

The weekly restore drill authenticates the immutable bundle for the active
deployment, checks its integrity, restores it into a fresh temporary workspace,
and verifies Chromium and WebKit with outbound browser/provider requests blocked.
It has read-only credentials and performs no public deployment. A failed or
missing drill raises one operational incident. Recovery needs a successful native
restore and offline browser job less than eight days old.

The owner can request either check on current main with the GitHub CLI:

```powershell
gh workflow run check-runtime.yml --repo MentallyQuill/Tavernary --ref main
gh workflow run restore-drill.yml --repo MentallyQuill/Tavernary --ref main
gh run list --repo MentallyQuill/Tavernary --workflow restore-drill.yml --limit 5
```

Inspect the retained `site-restore-drill-<run-id>-<attempt>` artifact and native
job result. A local bundle round-trip is useful diagnosis; it does not replace
the actual GitHub retained-bundle drill. If GitHub disables schedules or a token
needs repair, the owner must re-enable automation or replace the credential.

The scheduled shared writer checks individual repository observations at
forty-eight hours, due factual report imports at twenty-four hours, and eligible
automatic submission/publication progress at two hours. A fresh companion clock
does not prove a repository was checked. Successful unchanged source checks
persist their own observation time; failed checks preserve prior observations.
Manual review waits and an explicit owner restore are excluded from automatic
stalled-work notices.

Incidents use numeric Publisher custody and one stable fingerprint. Unchanged
findings produce no comments or repeated edits. One incident mutation fits within
the existing twenty-operation pass; failure to write it does not discard the
catalog controller's result. The writer checks fresh findings and issue custody
before mutation. Starting another attempt is insufficient to close a stalled
work notice. Closure requires an observed recovery; absent proof leaves it open.

Inspect the indicated operation receipt and Actions run, repair the credential,
provider or allowance, and let the next scheduled pass observe recovery. The
diagnostics contain fixed reason codes and public operation identities, not raw
provider errors or credentials. A human closure or body edit is preserved.
Closing a notice as not planned explicitly dismisses it.

Metadata, advisory, optional report, project submission and owner-request producers reserve global model
allowance before dispatch. Their successful result carries safe usage evidence;
the shared writer settles it with the content publication after checking the
current producer and every bound ticket. Positive settled requests can prove
provider recovery. Token evidence is a conservative requested bound, not a
billing statement. Failed or interrupted requests and unused allowance remain
charged; a lost response cannot create more allowance. Owner enrichment admission
uses the same budgeted preparation and authenticated checkpoint/completion path.

A known model credential or configuration failure suppresses related preparation
across daily and monthly budget resets. After its twenty-four-hour retry delay,
one eligible job claims the shared probe through its durable model reservation.
An expired or unconfirmed dispatch remains charged and prevents a replacement
probe for twenty-four hours. A positive settled response after the failure clears
the circuit; a new failure opens it again. Cached work continues without model
spending. Repair the configured credential, then request reconciliation as above;
the existing cooldown still applies.

These checks run inside GitHub. If GitHub Actions stops running or the required
GitHub credential cannot write issues, it cannot report that outage itself.
GitHub availability and account/credential repair remain owner responsibilities.
