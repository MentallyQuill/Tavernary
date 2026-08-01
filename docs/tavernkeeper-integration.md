# TavernKeeper advisory-scan integration

TavernKeeper is a separate public service for advisory scans of eligible
Tavernary GitHub repositories. Tavernary decides which listed repositories are
eligible; TavernKeeper owns scanner policy and immutable reports. This is a
static, asynchronous integration: no runtime server, API route, webhook
receiver, database, public scan request, Codeberg scan, or automatic listing
moderation is involved.

## What the indicator means

TavernKeeper reports what it observed at one immutable commit. A current report
is not a guarantee that a repository is safe, and an outdated report says
nothing about later commits. A scan belongs to a GitHub repository ID, so cards
that share that repository display the same imported report state.

- Green means the defined scan policy completed at the displayed SHA with no
  active medium-or-higher finding at medium-or-higher confidence.
- Yellow means at least one active medium-or-higher finding at
  medium-or-higher confidence.
- Gray is Tavernary's state when no current completed report can support a
  color: the first scan is pending, the report is outdated, the current source
  is unavailable, or an operation failed and published nothing.

Low-confidence, low-severity, and informational observations do not turn an
indicator yellow. Results never hide, delist, quarantine, rank, certify, or
otherwise moderate a Tavernary listing. Tavernary does not notify project
owners automatically.

## Public versioned contracts

Tavernary publishes its schema-version-1 target manifest at
`https://mentallyquill.github.io/Tavernary/security/tavernkeeper-targets.json`.
Its checked-in schema is
[`data/schemas/tavernkeeper-targets.schema.json`](../data/schemas/tavernkeeper-targets.schema.json).
It contains only active, healthy public GitHub sources with a positive immutable
repository ID and a lowercase 40-character snapshot SHA. Each entry has the
Tavernary source ID, GitHub repository ID and full name, exact `target_sha`, and
Tavernary-derived canonical GitHub URL; it contains no commands, clone URLs,
branch names, scan modes, budgets, or requester-provided values.

Tavernary imports TavernKeeper's schema-version-1 preferred report index from
`https://mentallyquill.github.io/TavernKeeper/reports/index.json`. Its pinned
consumer schema is
[`data/schemas/tavernkeeper-report-index.schema.json`](../data/schemas/tavernkeeper-report-index.schema.json).
The importer accepts only the configured HTTPS origin and report path, bounded
public DNS responses and payloads, valid schema and aggregate counts, one
preferred identity per repository/SHA/policy, the matching active Tavernary
source identity, the active scanner-policy version, and an immutable report URL
under `https://mentallyquill.github.io/TavernKeeper/reports/`.

The report identity is repository ID plus exact target SHA, scanner-policy
version, mode, and report version. Tavernary retains validated older-SHA
summaries so it can describe an outdated result, but only an identity-and-SHA
match can produce green or yellow on a current card.

## Handshake and recovery

Tavernary refreshes snapshots, builds and validates the exact-SHA manifest,
deploys it with **Site: Deploy to GitHub Pages**, and then conditionally wakes
TavernKeeper's `reconcile.yml` workflow. TavernKeeper independently fetches
the public manifest, performs its own isolated work, publishes a sanitized
index and immutable reports, and wakes Tavernary's **Security: Reconcile
TavernKeeper reports** workflow. That workflow imports validated summaries,
checks the full site, commits only a changed sanitized summary file, and
deploys the exact commit.

Both directions reconcile every six hours (Tavernary's import schedule is
`41 */6 * * *`). A wake is non-authoritative: it carries no target, SHA, mode,
budget, priority, or report URL. A missed wake does not roll back a valid
publication; the next scheduled reconciliation repairs it. If import or
validation fails, do not edit or overwrite the prior tracked summary: correct
the public producer or local validation problem, then rerun the input-free
import workflow after the contract is healthy.

## GitHub Apps and secrets

The two wake-up directions use different one-way GitHub Apps. Tavernary stores
only `TAVERNKEEPER_WAKE_APP_ID` and `TAVERNKEEPER_WAKE_APP_PRIVATE_KEY`; that
App is installed only on `MentallyQuill/TavernKeeper` and has `Actions: write`
plus mandatory metadata read. TavernKeeper stores the opposite App's private
credentials, installed only on Tavernary with the same destination-only
permission. Neither App receives contents-write permission, and neither
repository receives the other repository's contents token. The normal
`GITHUB_TOKEN` remains repository-local.

If App-token creation or dispatch fails after the manifest is publicly
verified, Pages remains valid and the scheduled reconciliation is the recovery
path. Do not add payload parameters or broaden App permissions to compensate.

## Scanner boundary and owner appeals

TavernKeeper scans in isolated disposable runners. Target repositories are
untrusted data: their scripts, hooks, Actions, packages, tests, builds,
containers, macros, binaries, and interpreters are never executed. Reports are
sanitized and immutable; raw model and tool output, source excerpts, payloads,
and secrets are not public report content.

TavernKeeper staff alone may pause, resume, retry, deep-scan, rescan policy,
approve oversized work, inspect diagnostics, or adjudicate. A project owner
may appeal a false positive by identifying an immutable report and finding
fingerprint to TavernKeeper staff. An appeal neither triggers a scan nor
changes Tavernary or suppresses a finding automatically. An accepted appeal
produces a new immutable superseding report; Tavernary only imports the
validated preferred result.
