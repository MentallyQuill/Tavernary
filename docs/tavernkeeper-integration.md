# TavernKeeper advisory-scan integration

TavernKeeper is a separate public service for advisory scans of eligible
Tavernary GitHub repositories. Tavernary decides which listed repositories are
eligible; TavernKeeper owns scanner policy and immutable reports. This is a
static, asynchronous integration: no runtime server, API route, webhook
receiver, database, public scan request, Codeberg scan, or automatic listing
moderation is involved.

Production behavior follows the mandatory automation boundary in
[`development-rules.md`](development-rules.md).

## What the indicator means

TavernKeeper reports what it observed at one immutable commit. A current report
is not a guarantee that a repository is safe, and an outdated report says
nothing about later commits. A scan belongs to a GitHub repository ID, so cards
that share that repository display the same imported report state.

- Teal means the defined scan policy completed at the displayed SHA and
  TavernKeeper published a teal result.
- Red means TavernKeeper published a red result. An older red result remains
  red until a newer complete scan publishes.
- Orange means the latest complete result was teal but covers an older SHA; an
  updated scan is pending.
- Gray means an eligible GitHub source is unscanned or its current source state
  is unavailable without a red result to preserve.
- Dark teal identifies a source type TavernKeeper does not support.

Low-confidence, low-severity, and informational observations do not turn an
indicator red. Results never hide, delist, quarantine, rank, certify, or
otherwise moderate a Tavernary listing. Tavernary does not notify project
owners automatically.

## Public versioned contracts

Tavernary publishes its schema-version-2 target manifest at
`https://tavernary.org/security/tavernkeeper-targets.json`.
Its checked-in schema is
[`data/schemas/tavernkeeper-targets.v2.schema.json`](../data/schemas/tavernkeeper-targets.v2.schema.json).
It contains only active, healthy public GitHub sources with a positive immutable
repository ID and a lowercase 40-character snapshot SHA. Each entry has the
Tavernary source ID, GitHub repository ID and full name, exact `target_sha`, and
Tavernary-derived canonical GitHub URL, project kinds, and catalog priority
metadata; it contains no commands, clone URLs, branch names, scan modes,
budgets, or requester-provided values.

Tavernary imports TavernKeeper's schema-version-2 preferred report index from
`https://mentallyquill.github.io/TavernKeeper/reports/index.json`. Its pinned
consumer schema is
[`data/schemas/tavernkeeper-report-index.v2.schema.json`](../data/schemas/tavernkeeper-report-index.v2.schema.json).
The importer accepts only the configured HTTPS origin and report path, bounded
public DNS responses and payloads, valid schema and aggregate counts, one
preferred identity per repository/SHA/policy, the matching active Tavernary
source identity, the active scanner-policy version, and an immutable report URL
under `https://mentallyquill.github.io/TavernKeeper/reports/`.

The report identity is provider plus repository ID, exact target SHA,
scanner-policy version, scan mode, and report version. Tavernary retains the
newest twelve preferred historical conclusions for the compact card strip and
links to TavernKeeper's immutable full-history page. Only an identity-and-SHA
match can produce a current teal or red state.

## Review pipeline and Tavernary boundary

For the initial release, TavernKeeper records per-tool factual outcomes, runs a
complete DeepSeek chunk review across every planned repository chunk, and then
performs one final repository synthesis. It does not use an
analyzer/challenger/arbiter model chain or a second security model.

Tavernary is only the deterministic consumer of that published result. It
matches repository identity, target SHA, and scanner policy, then maps a
current teal result to teal, an older teal result to orange, and any current or
older red result to red. Eligible repositories without a report remain gray,
and unsupported source types remain dark teal. Tavernary does not call Luna or
any other security model in the initial release.

## Handshake and recovery

Tavernary refreshes snapshots, builds and validates the exact-SHA manifest,
deploys it with **Site: Deploy to GitHub Pages**, and then conditionally wakes
TavernKeeper's `reconcile.yml` workflow. TavernKeeper independently fetches
the public manifest, performs its own isolated work, publishes a sanitized
index and immutable reports, and wakes Tavernary's **Security: Reconcile
TavernKeeper reports** workflow. That workflow imports validated summaries,
checks the full site, commits only a changed sanitized summary file, and
deploys the exact commit.

Both directions reconcile every six hours: Tavernary imports on
`41 */6 * * *`, and TavernKeeper reconciles targets on `13 */6 * * *`. A wake
is non-authoritative: it carries no target, SHA, mode, budget, priority, or
report URL. A missed wake does not roll back a valid publication; the next
scheduled reconciliation repairs it. If import or validation fails, do not
edit or overwrite the prior tracked summary: correct the public producer or
local validation problem, then rerun the input-free import workflow after the
contract is healthy.

Tavernary staff may also run the protected targeted-scan Action with one exact
GitHub repository URL already backing a published card. Tavernary refreshes
that source, deploys and verifies the resulting manifest, then sends only the
repository ID as a non-authoritative hint. TavernKeeper refetches the public
manifest and runs the same automatic production scanner and publisher.

## GitHub Apps and secrets

The two wake-up directions use different one-way GitHub Apps. Tavernary stores
only `TAVERNKEEPER_WAKE_APP_ID` and `TAVERNKEEPER_WAKE_APP_PRIVATE_KEY`; that
App is installed only on `MentallyQuill/TavernKeeper` and has `Actions: write`
plus mandatory metadata read. TavernKeeper stores
`TAVERNARY_WAKE_APP_ID` and `TAVERNARY_WAKE_APP_PRIVATE_KEY` for the opposite
App, installed only on Tavernary with the same destination-only permission.
Neither App receives contents-write permission, and neither repository receives
the other repository's contents token. The normal `GITHUB_TOKEN` remains
repository-local. Workflows treat every installation token as an opaque masked
string and never parse, log, cache, artifact, or persist its format.

If App-token creation or dispatch fails after the manifest is publicly
verified, Pages remains valid and the scheduled reconciliation is the recovery
path. Do not add payload parameters or broaden App permissions to compensate.

## Scanner boundary and owner appeals

TavernKeeper scans in isolated disposable runners. Target repositories are
untrusted data: their scripts, hooks, Actions, packages, tests, builds,
containers, macros, binaries, and interpreters are never executed. Reports are
sanitized and immutable; raw model and tool output, source excerpts, payloads,
and secrets are not public report content.

TavernKeeper staff alone may pause, resume, retry, deep-scan, rescan policy, or
inspect diagnostics. A project owner may appeal a false positive by identifying
an immutable report and finding fingerprint to TavernKeeper staff. An appeal
neither triggers a scan nor changes Tavernary or suppresses a finding. If the
appeal exposes a scanner defect, staff change global versioned policy through
ordinary code review and TavernKeeper automatically rescans affected targets.
Staff never edit, dismiss, recolor, or supersede one report manually.
