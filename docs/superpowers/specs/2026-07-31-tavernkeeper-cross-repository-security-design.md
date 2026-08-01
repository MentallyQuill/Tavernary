# TavernKeeper Cross-Repository Security Scanning Design

- **Status:** Approved in design dialogue; awaiting written-spec review
- **Date:** 2026-07-31
- **Canonical location:** Tavernary
- **Repositories:** `MentallyQuill/Tavernary` and `MentallyQuill/TavernKeeper`

## 1. Executive Summary

TavernKeeper is a separate, public, AGPL-3.0 repository that performs advisory security scans of GitHub repositories listed by Tavernary. Tavernary remains the authority over which repositories are eligible. TavernKeeper remains the authority over scanner policy and immutable scan reports.

The two repositories communicate asynchronously through public, versioned JSON contracts and authenticated GitHub Actions wake-up events. Tavernary publishes an exact-SHA target manifest. TavernKeeper scans those targets in disposable GitHub-hosted runners, commits sanitized reports to its normal `main` branch, and publishes them through GitHub Pages. Tavernary imports validated summaries and displays an inline colored scan indicator beside each project title.

No target code is executed. No scan result hides, quarantines, ranks, or certifies a Tavernary listing. A green scan indicator means only that TavernKeeper completed the defined scan policy at the displayed commit without actionable findings. It never means safe, verified, or trusted.

This design requires no persistent backend, database, webhook receiver, scanning daemon, or additional report repository. GitHub Actions performs the work; GitHub Pages serves the contracts and reports.

## 2. Goals

TavernKeeper must:

1. Detect evidence of malware, credential theft, suspicious network transmission, dangerous installation behavior, malicious or vulnerable dependencies, unsafe GitHub automation, obfuscation, and other code requiring review.
2. Bind every result to one immutable GitHub repository identity and exact commit SHA.
3. Combine reproducible deterministic scanners with required, runtime-configured OpenAI-compatible model review.
4. Inspect the complete current tree deterministically and bounded recent history where the scanner supports it.
5. Offer a staff-only deep mode that sends every eligible first-party text file through model review.
6. Publish useful public evidence without publishing secrets, raw payloads, or source excerpts.
7. Integrate into Tavernary without giving TavernKeeper a Tavernary write credential.
8. Remain inexpensive and operable for a small staff while handling very small and very large repositories.
9. Fail closed: an incomplete operation publishes no report.
10. Recover from missed notifications through scheduled reconciliation.

## 3. Non-Goals

V1 does not provide:

- Malware prevention, certification, guarantees, or automatic moderation
- Automatic hiding, quarantine, delisting, or search-ranking changes
- Codeberg or other non-GitHub scanning
- Private repository scanning
- Public scan requests or externally supplied scan options
- Automatic external repository-owner notification
- Runtime sandbox execution or behavioral malware detonation
- Package installation, builds, tests, macros, containers, or target Actions execution
- Automatic substitution of another model
- A database, server, dynamic application API, webhook service, or resident scanner
- ClamAV or full binary reverse engineering before catalog evidence justifies them

## 4. Product Semantics

### 4.1 Advisory only

TavernKeeper reports observations about one commit. It does not decide whether Tavernary lists a project. Findings never hide or reorder a card.

### 4.2 Repository-level identity

A scan belongs to a GitHub repository, not a Tavernary card. When multiple Tavernary cards share one GitHub source, TavernKeeper scans once and every card displays the same repository-level result.

### 4.3 Supported entries

A V1 target requires:

- An active Tavernary GitHub source
- A positive immutable GitHub repository ID
- At least one published Tavernary card backed by the source
- A healthy Tavernary repository snapshot
- A full lowercase 40-character head SHA

Codeberg, URL-only, and organization-level entries are excluded and display no scan indicator.

### 4.4 Public result vocabulary

Only complete scans produce reports. A successful public report has one of two results:

- `green`: no active medium-or-higher finding with medium-or-higher confidence
- `yellow`: at least one active medium-or-higher finding with medium-or-higher confidence

Gray is a Tavernary presentation state, not a TavernKeeper report result. It means Tavernary has no completed report that can support a current colored scan indicator. Causes include a pending first scan, an outdated report, an unavailable current source snapshot, or an operation that failed and therefore published nothing.

Low-confidence observations and low or informational findings remain visible but do not turn a scan indicator yellow.

## 5. Responsibility and Trust Boundaries

### 5.1 Tavernary owns

- Project, card, and source eligibility
- Immutable source-to-card mapping
- Current repository snapshot SHA
- The public target manifest and its schema
- Local report-summary validation and storage
- Freshness calculation
- Card scan indicator and popover presentation
- Tavernary deployment

### 5.2 TavernKeeper owns

- Scanner and prompt policy
- Scanner applicability rules
- Scan queue and retry state
- Target checkout and isolation
- Deterministic and model scanning
- Finding normalization, confidence, redaction, and result derivation
- Immutable reports and report index
- Staff incidents, manual retries, deep scans, policy rescans, and adjudications
- TavernKeeper deployment

### 5.3 One-way credentials

Two separate GitHub Apps provide wake-up capability:

1. `Tavernary -> TavernKeeper`
   - Private credentials stored only in Tavernary
   - App installed only on TavernKeeper
   - TavernKeeper repository permission: `Actions: write`

2. `TavernKeeper -> Tavernary`
   - Private credentials stored only in TavernKeeper
   - App installed only on Tavernary
   - Tavernary repository permission: `Actions: write`

Neither bridge app receives repository contents write permission. Installation tokens are short-lived and restricted to the one destination repository.

The built-in `GITHUB_TOKEN` remains repository-local. TavernKeeper never receives a Tavernary contents token, and Tavernary never receives a TavernKeeper contents token.

## 6. Architecture and Handshake

The operating loop begins when Tavernary refreshes repository state and publishes its exact-SHA target manifest. Tavernary wakes TavernKeeper, whose reconciler computes and scans the missing work in isolation. TavernKeeper then publishes its report index and wakes Tavernary. Tavernary validates and imports the summaries before rebuilding its static catalog and card scan indicators.

The wake-up events are deliberately non-authoritative. A payload cannot select a repository, SHA, scan mode, token budget, priority, or report URL. It says only that the receiver should reconcile its public input contract.

Both repositories also reconcile every six hours. A failed wake-up does not invalidate a successful publication; scheduled reconciliation repairs the missed event.

### 6.1 Tavernary-to-TavernKeeper sequence

1. Tavernary refreshes repository snapshots.
2. Tavernary generates and validates the target manifest.
3. Tavernary deploys the manifest through GitHub Pages.
4. If the manifest changed, Tavernary uses its one-way GitHub App to dispatch TavernKeeper's reconcile workflow.
5. TavernKeeper fetches the public manifest and computes work independently.

### 6.2 TavernKeeper-to-Tavernary sequence

1. TavernKeeper completes one or more scans.
2. A serialized publisher validates and commits sanitized reports to TavernKeeper `main`.
3. TavernKeeper deploys the updated report site and verifies the public index.
4. TavernKeeper uses its one-way GitHub App to dispatch Tavernary's import workflow.
5. Tavernary fetches and validates the public report index independently.
6. Tavernary commits only sanitized local summaries, rebuilds, and deploys.

## 7. Public Contracts

### 7.1 Target manifest

Tavernary owns `security/tavernkeeper-targets.json` and its JSON Schema.

```json
{
  "schema_version": 1,
  "generated_at": "2026-07-31T18:00:00Z",
  "repositories": [
    {
      "source_id": "github-123456",
      "provider": "github",
      "repository_id": 123456,
      "repository": "owner/project",
      "target_sha": "0123456789abcdef0123456789abcdef01234567",
      "canonical_url": "https://github.com/owner/project"
    }
  ]
}
```

Rules:

- One entry per GitHub repository ID
- Stable ordering by repository ID
- Exact SHA from Tavernary's healthy repository snapshot
- Canonical URL derived by Tavernary, never accepted from a scan requester
- No commands, budgets, scan modes, branch names, or arbitrary clone URLs
- Strict schema with unknown fields rejected

### 7.2 Report identity

A report is identified by:

```text
provider + repository ID + target SHA + scanner-policy version + scan mode + report version
```

A stable report ID is derived from those canonical fields. The immutable path is:

```text
reports/github/{repository-id}/{sha}/{policy-version}/{mode}/{report-version}/
```

The report version distinguishes a later adjudication or corrected result under otherwise identical identity fields. A report points to the report it supersedes when applicable.

### 7.3 Report index

TavernKeeper owns `reports/index.json` and its JSON Schema. Each preferred-report entry contains only:

- Schema and report IDs
- GitHub repository ID
- Tavernary source ID
- Canonical repository full name
- Exact target SHA
- Scanner and scanner-policy versions
- Standard or deep mode
- Completion timestamp
- Green or yellow result
- Severity and confidence totals
- Concise coverage totals
- Immutable report URL
- Superseded-report ID when applicable

The index may retain preferred entries for older SHAs so Tavernary can explain an outdated result. For one repository ID, SHA, and active scanner-policy version, exactly one complete report is preferred: the newest staff adjudication, otherwise the newest completed deep scan, otherwise the standard scan. Superseded reports remain addressable at their immutable URLs but are never selected as preferred.

### 7.4 Tavernary import validation

Tavernary must:

- Fetch only the configured HTTPS TavernKeeper Pages origin
- Reject cross-origin redirects
- Apply time and response-size limits
- Reject unknown fields and schema versions
- Reject invalid SHAs, dates, report IDs, result values, duplicate identities, and unsafe URLs
- Match GitHub repository ID first
- Then require source ID and canonical repository full name to agree
- Import summaries only for currently known sources
- Keep a valid older report so it can be shown as outdated
- Derive freshness locally from Tavernary's current healthy snapshot SHA
- Never trust a remote `current`, `fresh`, or card-color claim
- Replace the local summary atomically only after the entire index validates
- Preserve the previous valid import when fetch or validation fails

### 7.5 Contract evolution

Schemas are strict. An additive field that an existing consumer would reject requires a new schema version.

For target-manifest changes, TavernKeeper adds support before Tavernary publishes the new version. For report-index changes, Tavernary adds support before TavernKeeper publishes the new version. Each producer continues publishing the older supported version until its consumer is deployed.

Previously published report bodies and URLs remain immutable.

## 8. Backlog and Queue Design

The backlog is derived rather than stored as a conventional queue:

```text
Tavernary desired targets - TavernKeeper completed current reports = backlog
```

Only retry and circuit-breaker metadata is persisted as operational state. TavernKeeper stores it in a secret-free `operations/state.json` document on `main`; it contains no source, finding, scanner output, or provider detail. The same serialized writer used for report publication owns updates to this document. Every reconciler reads it before selecting work. A repository-specific entry delays only that target, while a system-wide circuit breaker prevents ordinary scans and continuation batches but still permits the hourly recovery attempts and staff controls.

On every wake-up, continuation, or scheduled reconciliation, TavernKeeper:

1. Fetches the latest target manifest.
2. Reads its completed-report index.
3. Removes targets covered by the current SHA and policy version.
4. Removes SHAs superseded by newer manifest entries.
5. Removes targets active in the current serialized drain workflow.
6. Sorts remaining work by priority and age.
7. Selects at most five repositories.
8. Runs at most two repository scan jobs concurrently.
9. Publishes successful repository-specific results together.
10. Recomputes the backlog from the authoritative documents.
11. Dispatches another batch immediately if work remains.

Priority order:

1. Newly listed repositories with no prior report
2. Existing repositories whose current SHA is unscanned
3. Automatic retries whose scheduled time has arrived
4. Staff-started policy-rescan campaigns

Staff-only deep scans use a separate priority lane. Age-based priority prevents starvation.

A frequently updated repository occupies one queue position. If it advances through multiple SHAs before its scan starts, TavernKeeper scans only the latest published target. Immediately before invoking the configured model, TavernKeeper refetches the manifest; an obsolete queued SHA is abandoned before model spend and replaced by the current SHA.

If the SHA changes after model review begins, the historical report may complete and publish, but Tavernary will render it gray/outdated until the newer target completes.

## 9. Exact-SHA Checkout and Inventory

TavernKeeper must obtain repository contents temporarily. It does so only inside a disposable GitHub-hosted Actions runner.

Checkout behavior:

- Create an empty temporary directory.
- Initialize Git locally.
- Add a validated `https://github.com/{owner}/{repo}.git` remote derived from the contract.
- Fetch only the requested SHA with a history depth sufficient for at most 20 commits.
- Check out detached at that exact SHA.
- Verify `HEAD` equals the requested SHA.
- Disable hooks, credential helpers, interactive prompts, Git LFS smudging, submodules, recursive cloning, target filters, and local filesystem protocols.
- Never use repository-provided Git configuration or clone URLs.

Inventory behavior:

- Use filesystem metadata operations that do not follow links.
- Normalize all paths relative to the checkout.
- Reject or exclude symbolic links, junctions, absolute paths, traversal, unsafe control characters, and ambiguous case collisions.
- Count files and bytes before expensive work.
- Classify text, binary, archive, generated, minified, lock, workflow, executable, and unusual-Unicode files.
- Apply high security ceilings for repository bytes, file count, file size, archive depth, expanded bytes, and compression ratio.
- A legitimate repository above an ordinary operational threshold may be routed to a staff-approved specially isolated scan. Security ceilings cannot be overridden by target content.

The checkout is deleted when the job ends. It is never committed to TavernKeeper, uploaded as an artifact, or copied to Tavernary.

## 10. Scanner Pipeline

Every report requires all applicable stages to complete.

### 10.1 Safe inventory

The custom inventory is always required. It establishes coverage and refuses filesystem tricks before other tools run.

### 10.2 Gitleaks

Gitleaks is always required.

- Scan the complete current tree.
- Scan up to the newest 20 reachable commits.
- Force full redaction.
- Normalize rule, path, line, and fingerprint fields.
- Never retain the matched secret or raw report.

### 10.3 OpenGrep

OpenGrep is always required with TavernKeeper-owned rules covering:

- Credential access combined with outbound transmission
- Token, cookie, storage, or environment harvesting
- Dynamic execution and interpreter spawning
- Obfuscated or encoded payload construction
- Network-capable installation hooks
- Suspicious persistence or startup behavior
- Download-and-execute chains
- Host and user reconnaissance connected to exfiltration

Target-provided OpenGrep configuration and ignores are not honored.

### 10.4 OSV-Scanner

OSV-Scanner is required when supported manifests or lockfiles exist. It must not install, resolve through a target package manager, or modify dependencies. With no supported input it records `not-applicable`.

### 10.5 zizmor

zizmor is required when GitHub Actions workflow or action definitions exist. With no applicable automation files it records `not-applicable`.

### 10.6 malcontent

malcontent is required when executables, opaque binaries, or archives exist. TavernKeeper supplies its own bounded archive, concurrency, risk, and output settings. Container pulls and target registry credentials are disabled. With no applicable artifacts it records `not-applicable`.

### 10.7 Deferred tools

ClamAV and deeper binary reverse engineering remain deferred. Evidence from real catalog scans can justify a later policy addition.

### 10.8 Applicability versus failure

`not-applicable` is a successful coverage state. `unavailable`, timeout, crash, malformed output, or parse failure is an operation failure. TavernKeeper never converts missing required coverage into a green or yellow report.

## 11. Standard and Deep Scans

For model review, an eligible file is a regular, safely inventoried, first-party text file within the per-file security ceiling. Raw binaries, archives, dependency lockfiles, vendored dependencies, generated bundles, and heavily minified files are ineligible for model input but remain covered by applicable deterministic stages and are counted in the report. TavernKeeper owns these classifications; target-provided ignore files and scanner configuration do not change them.

### 11.1 Standard scan

- Deterministic scanners inspect the complete current tree.
- Gitleaks inspects bounded recent history.
- The change range starts at the newest previously scanned ancestor.
- The configured model receives normalized deterministic findings and every eligible file changed in that range.
- If no previously scanned ancestor is reachable, the change range covers up to the newest 20 commits.

### 11.2 Staff-only deep scan

- Repeats every deterministic stage.
- Sends every eligible first-party text file through the configured model review.
- Excludes raw binaries, archives, dependency lockfiles, vendored dependencies, generated bundles, and heavily minified files from model input.
- Reports excluded-category file and byte counts.
- Produces a new immutable preferred report without deleting the standard report.
- Requires TavernKeeper write permission and approval through the protected staff operations environment.

## 12. Streaming Model Review

Model review is required, but TavernKeeper is provider- and model-agnostic. It speaks the OpenAI-compatible Chat Completions protocol and reads the full HTTPS endpoint, API key, and model identifier at runtime from `TAVERNKEEPER_API_ENDPOINT`, `TAVERNKEEPER_API_KEY`, and `TAVERNKEEPER_MODEL`. Scanner policy pins the protocol and safety ceilings, not a vendor or model. TavernKeeper posts to the configured endpoint exactly; it does not append a route, follow cross-origin redirects, or silently substitute a different endpoint or model.

Changing the endpoint origin, configured model identifier, prompt-policy version, or scanner-policy version creates a distinct cache and report identity. Every published report records the actual provider origin and model identifier used. The planned release configuration is NanoGPT with `deepseek/deepseek-v4-flash`; that choice is operational configuration, not architecture. NanoGPT's subscription route is used only when the configured model is covered by the subscription.

There is no fixed per-repository aggregate token limit and no predicted whole-job token budget. Repository size determines the number of model calls.

Processing rules:

1. Inventory selects the complete eligible corpus for the chosen mode.
2. Files are grouped into deterministic byte-bounded chunks that remain comfortably below the configured model's per-request context limit.
3. Small repositories naturally produce one chunk; large repositories produce more.
4. Related files, directory context, entry points, manifests, imports, and deterministic findings remain together where possible.
5. Oversized eligible source files are split on stable semantic boundaries with bounded overlap.
6. Every eligible file must be represented in a successful model response before publication.
7. After all chunks complete, a final bounded synthesis receives normalized findings and relationship metadata, not the entire source corpus again.
8. Actual input and output token counts are recorded after every provider response, together with cache-read, reasoning, or other usage categories when the provider returns them.

Before a chunk leaves the runner, secret-like literal values are replaced with stable redaction markers while path and line mapping are preserved. The system prompt treats repository text as untrusted data, forbids following source instructions, forbids safety claims, forbids quoting secrets, and requires the public finding schema.

Model output is strictly validated. A model finding must reference a submitted repository path and allowed line range. The model may add or explain findings. It cannot erase a deterministic finding, reduce deterministic severity, declare scanner coverage complete, or claim that a repository is safe.

### 12.1 Chunk cache

Successful sanitized chunk results may be cached privately by:

```text
content hashes + endpoint origin + model ID + prompt-policy version + scanner-policy version
```

The cache never contains raw source chunks, prompts, credentials, or raw model responses. Cache loss changes cost and runtime only. Incomplete cached work is never public.

If quota or provider availability fails midway, TavernKeeper publishes nothing, stops the queue, and retries from the first uncached chunk after recovery.

### 12.2 Allowance behavior

The operating allowance is approximately 60 million tokens per month. TavernKeeper does not impose a lower artificial monthly cutoff and does not degrade scans as allowance becomes low. It records actual usage and warns staff at 50%, 75%, and 90% when reliable allowance accounting is available.

Provider quota exhaustion is a system-wide hard failure. No partial report is published.

## 13. Finding and Report Model

Each normalized finding contains:

- Stable fingerprint
- Originating scanner or a normalized `model:<provider>` identity
- Rule ID and category
- `critical`, `high`, `medium`, `low`, or `info` severity
- `high`, `medium`, or `low` confidence
- Repository-relative path
- Positive line or bounded line range when available
- Evidence commit SHA when a finding originates in bounded history rather than the current tree
- Concise title
- Redacted explanation
- Optional remediation guidance
- Optional public rule-documentation reference
- Active or staff-dismissed disposition in a superseding adjudication

Each immutable report contains:

- Contract, scanner, and scanner-policy versions
- Stable report ID and optional superseded-report ID
- GitHub repository identity and exact target SHA
- Standard or deep mode
- Completion time and bounded history base
- Per-tool version, applicability, and completion
- Model provider, model, and actual usage totals
- Inventory and excluded-category totals
- Finding totals by severity, confidence, category, and disposition
- Sanitized normalized findings

Reports never contain:

- Raw secret values
- Raw source excerpts
- Reusable malicious payloads
- Raw scanner output
- Model prompts or raw responses
- Local checkout paths
- Workflow or provider credentials

## 14. Report Storage and Publication

TavernKeeper uses one normal `main` branch. It does not use a generated report branch or a third repository.

```text
src/                         scanner implementation
rules/                       TavernKeeper-owned policy
schemas/                     public JSON contracts
operations/state.json        secret-free retry and circuit-breaker state
reports/
  index.json
  github/{repository-id}/{sha}/{policy-version}/{mode}/{report-version}/
docs/                        architecture, rules, and operations
```

Publication is serialized:

1. Isolated scan jobs produce sanitized candidate reports.
2. The publisher downloads sanitized candidates only.
3. It validates each candidate against TavernKeeper's schema.
4. It rejects identity mismatches, unsafe text, forbidden URLs, secret-shaped evidence, and existing immutable paths.
5. It writes JSON and escaped static HTML.
6. It deterministically rebuilds `reports/index.json`.
7. It commits generated files directly to TavernKeeper `main` using the repository-local token.
8. It deploys the report site explicitly through the same trusted workflow.
9. It verifies the public index before waking Tavernary.

Reports remain indefinitely unless a legal or credential-exposure emergency requires removal. A removal is an audited exceptional operation.

Report HTML is static and script-free. It escapes all repository-controlled text, applies a restrictive content-security policy, loads no remote images, and links only to the canonical GitHub repository, immutable commit, public TavernKeeper rule documentation, and Tavernary.

## 15. Tavernary Scan Indicator and Popover

### 15.1 Placement

The scan indicator appears directly after the project title's final visible character on the same line. A short title leaves ordinary empty card space after the scan indicator. A constrained long title truncates before the scan indicator rather than pushing the scan indicator to a card corner.

The title and scan indicator use an inline flex row:

- The title uses only its required width until constrained.
- The scan indicator follows with a small fixed gap.
- The scan indicator never shrinks or ellipsizes.
- A long title ellipsizes earlier to reserve scan indicator space.
- The ellipsis never overlaps or consumes the scan indicator.

The scan indicator is an independent button. Tavernary's card markup must preserve whole-card repository navigation without nesting that button inside a link. The card becomes a semantic container with a stretched primary repository link and higher-layer independent controls for TavernKeeper, Kit actions, and relationship actions.

The glyph is the supplied Remix Icon `scan-2-fill` shape in a `0 0 24 24` view box. Tavernary stores it locally, renders it with `currentColor`, and does not use it as TavernKeeper branding or a safety certification. The individual icon remains governed by the Remix Icon License v1.0 and is identified separately from Tavernary's AGPL application code.

### 15.2 Visual states

- Green scan indicator: current complete green report
- Yellow scan indicator: current complete yellow report
- Gray scan indicator: pending, outdated, or current-source state unavailable because no complete report supports a confirmed current SHA
- No scan indicator: unsupported source type

Color is never the only signal. Accessible labels name the state as `TavernKeeper scan: ...` and never use `safe`, `trusted`, `verified`, `protected`, or similar certification language. The scan glyph communicates only that TavernKeeper has scan state to show.

### 15.3 Interaction

The scan indicator opens a non-modal anchored popover:

- Desktop pointer hover
- Keyboard focus
- Touch tap
- Remains open while pointer or focus is within the scan indicator or panel
- Closes after a short anti-flicker pointer-exit delay
- Closes on Escape, outside click, focus leaving, or another scan indicator opening
- Repositions to avoid viewport collision
- Is not clipped by card or catalog containers
- Removes transition motion when reduced motion is requested

### 15.4 Concise contents

The popover contains only:

1. Title: `TavernKeeper Scan Results`
2. Plain-language state
3. Nonzero severity counts
4. Visible short scanned SHA with the full SHA available accessibly
5. Scan date
6. `View full report` link when a report exists

Green example:

```text
TavernKeeper Scan Results
No review-level findings
2 low - 1 informational
Scanned abc1234 on July 31, 2026
View full report
```

Yellow example:

```text
TavernKeeper Scan Results
Review suggested
1 high - 2 medium
Scanned abc1234 on July 31, 2026
View full report
```

Gray example:

```text
TavernKeeper Scan Results
Current scan pending
The previous result does not cover this commit.
```

Detailed coverage, policy versions, excluded files, scanner names, and technical disclaimers remain in the full TavernKeeper report.

The green wording never says safe, verified, trusted, or certified.

## 16. Failure, Retry, and Circuit-Breaker Policy

A scan is atomic: complete report or no report.

### 16.1 Retry sequence

For the same classified error fingerprint, retry times are measured from the initial failure rather than cumulatively:

1. Initial attempt at `T+0`
2. Retry one at or after `T+1 hour`
3. Retry two at or after `T+2 hours`
4. Retry three at or after `T+3 hours`
5. Notify TavernKeeper staff only if retry three also fails

A successful retry clears pending incident state silently and, for a transient system-wide failure, releases the temporary circuit breaker so backlog draining can continue. A materially different error starts a new classified sequence. A suspected compromise of TavernKeeper's own credentials bypasses the delay.

An hourly retry reconciler reads a small secret-free operational state document containing target identity, error fingerprint, initial-failure time, attempt number, next eligible retry time, and circuit-breaker state. Intermediate failed attempts are recorded without failing the top-level retry workflow or opening an issue, avoiding premature GitHub failure notifications. If retry three fails, the workflow fails visibly and opens or updates one deduplicated issue labeled `scanner-operations`.

### 16.2 Repository-specific failures

Examples:

- Repository or exact SHA unavailable
- Repository-specific safety limit
- Applicable scanner cannot parse repository input
- Model output repeatedly fails schema validation for one repository

Behavior:

- Publish no report for that target.
- Preserve earlier immutable reports.
- Continue unrelated targets.
- Tavernary remains gray when no earlier report matches the current SHA.
- After retry exhaustion, open or update the deduplicated TavernKeeper staff issue.

### 16.3 System-wide failures

Examples:

- Required scanner missing or broken
- Configured-model authentication, quota, or provider-wide failure
- Public contract incompatibility
- Candidate report validation failure suggesting a publisher defect
- Report commit or Pages publication failure

Behavior:

- Publish nothing from the affected operation.
- Stop the remaining queue.
- Prevent later batches from starting.
- Preserve current public indexes and reports.
- After retry exhaustion, leave the circuit breaker engaged and fail visibly.
- Require TavernKeeper staff to resolve the incident and explicitly resume scanning.

Operational incidents notify TavernKeeper staff only. External repository owners are not contacted automatically.

## 17. Staff Controls and Appeals

Only TavernKeeper staff can:

- Pause or resume operations
- Retry one repository and exact SHA
- Approve specially isolated scanning for a legitimate oversized repository
- Run a deep scan
- Start a scanner-policy rescan campaign
- Inspect private diagnostics
- Adjudicate a finding
- Close an operational incident

Privileged workflows use a protected TavernKeeper staff environment with required reviewer approval where GitHub supports it.

Project maintainers may submit a false-positive appeal identifying an immutable report and finding fingerprint. An appeal:

- Does not trigger a scan
- Does not modify Tavernary
- Does not suppress a finding automatically
- Is reviewed by TavernKeeper staff

An accepted appeal creates a new immutable superseding adjudication/report version. Reusable dismissals become TavernKeeper-owned reviewed policy rules. Target-provided ignore files or scanner configuration never control TavernKeeper policy.

Complete reports publish automatically without mandatory staff review.

## 18. Threat Model and Isolation

TavernKeeper assumes a target repository may intentionally attack the scanner.

### 18.1 Job isolation

- Each repository receives its own scan job and temporary directory.
- At most two repository scans run concurrently.
- Targets never share scanner processes or checkout paths.
- The publication job receives sanitized candidate reports only.

### 18.2 Execution isolation

- Target scripts, hooks, Actions, packages, tests, builds, containers, macros, binaries, and interpreters are never executed.
- Trusted scanners use argument arrays with shell execution disabled.
- Scanner subprocesses receive a restricted environment without GitHub write tokens, model-provider credentials, or unrelated secrets.
- Scanner versions and downloaded artifacts are pinned and checksum-verified.
- Runtime, memory, output, file, and archive work are bounded.

### 18.3 Credential separation

- Scan jobs have read-only access to TavernKeeper source and public targets.
- Only the configured model request step receives `TAVERNKEEPER_API_ENDPOINT`, `TAVERNKEEPER_API_KEY`, and `TAVERNKEEPER_MODEL`.
- Only the serialized publication job receives TavernKeeper contents write permission.
- Only deployment jobs receive Pages and identity-token permission.
- Bridge Apps receive destination Actions write permission only.

### 18.4 Data isolation

- Source is untrusted data, never instructions.
- Model inputs are bounded and redacted.
- Logs suppress source excerpts, secrets, payloads, and hostile control characters.
- Raw tool and model outputs remain ephemeral.
- HTML and JSON publication pass a final secret-pattern and unsafe-content gate.

### 18.5 Spend abuse

- No public scan endpoint exists.
- Tavernary's manifest is the only automatic authority.
- One repository occupies one queue slot and obsolete SHAs coalesce.
- Exact-SHA, content-hash, model, prompt-policy, and scanner-policy keys prevent duplicate spend.
- A manifest freshness check occurs before configured-model calls.
- Staff controls are permission-gated.

## 19. Workflows

### 19.1 Tavernary

1. Repository refresh and target-manifest generation
2. Pages deployment and conditional TavernKeeper wake-up
3. Report-index reconciliation every six hours and on authenticated wake-up
4. Sanitized summary commit, catalog rebuild, and Pages deployment

A wake-up failure does not roll back a valid deployment. Reconciliation is the recovery mechanism.

### 19.2 TavernKeeper

1. CI for scanner source, rules, contracts, and workflow policy
2. Target reconciliation every six hours, on authenticated wake-up, and on continuation
3. Five-target batch planning
4. Maximum two-repository scan concurrency
5. Hourly due-retry reconciliation
6. Serialized report commit and Pages deployment
7. Conditional Tavernary wake-up after public verification
8. Staff-only retry, deep scan, policy campaign, pause, resume, and adjudication

All first-party GitHub Actions are pinned to full commit SHAs. Workflow permissions are declared per job at the narrowest level.

## 20. Observability

Every run reports secret-free operational counts:

- Desired, pending, active, completed, retrying, blocked, and superseded targets
- Oldest pending age
- Batch throughput
- Per-scanner applicability and runtime
- Actual configured-model input, cache-read, reasoning, and output usage
- Chunk cache hit and miss counts
- Retry classification and attempt number
- Report commit, Pages verification, and wake-up timestamps
- Contract, scanner, prompt-policy, and scanner-policy versions

The public report includes approved per-report usage totals. Operational failure details remain in staff-visible workflow logs and deduplicated issues.

## 21. Testing and Acceptance

### 21.1 Contract tests

- Each producer owns its schema.
- Each consumer vendors and tests a pinned copy.
- Shared fixtures prove acceptance and rejection behavior.
- Unknown fields, versions, duplicate identities, invalid SHAs, unsafe URLs, and cross-origin redirects fail.

### 21.2 TavernKeeper tests

- Exact-SHA identity and detached checkout
- Symlink, junction, traversal, case collision, Unicode, archive bomb, and oversized input
- Booby-trapped hooks, package scripts, Actions, binaries, and tests proving zero execution
- Shell-disabled command invocation and restricted environments
- Gitleaks redaction and bounded history
- TavernKeeper OpenGrep rules
- OSV, zizmor, and malcontent applicability
- Scanner crash and malformed-output classification
- Streaming model chunks, cache resume, prompt injection, and strict response parsing
- Deterministic fingerprints and report derivation
- Secret and unsafe-HTML publication rejection
- Immutable paths and deterministic index generation
- Initial attempt plus three delayed retries
- Repository-specific continuation and system-wide circuit breaking
- Workflow permissions and action pinning

### 21.3 Tavernary tests

- Target deduplication by immutable GitHub repository ID
- Unsupported-source exclusion
- Report origin, size, schema, identity, and URL validation
- Current, outdated, pending, stale-source, and unsupported scan indicator states
- One report shared across multiple cards from one source
- Inline title/scan indicator layout and long-title ellipsis
- Whole-card navigation without nested controls
- Hover, focus, touch, Escape, outside click, viewport collision, and reduced motion
- Static-export presence of the target manifest
- Both wake-up workflows and both scheduled fallbacks

### 21.4 Release gates

- No target fixture executes.
- No seeded secret appears in logs, cache, report JSON, or HTML.
- Both repositories accept the same contract fixtures.
- Required-tool and model failures publish nothing.
- Wake-up and scheduled recovery both succeed in each direction.
- Tavernary never derives green or yellow from an unmatched or unhealthy SHA.
- Responsive and keyboard tests pass for inline scan indicators and popovers.
- TavernKeeper staff rehearse pause, retry, incident, resume, deep scan, oversized scan, policy campaign, and appeal adjudication.

## 22. Rollout

1. Implement contracts and hostile fixtures without live publication.
2. Scan controlled benign and intentionally malicious fixture repositories.
3. Scan only the approved `MentallyQuill/Wandlight` and `MentallyQuill/Recursion` canaries and manually inspect reports. `MentallyQuill/Saga` remains optional and requires a separate staff decision.
4. Prove five-repository batching, two-runner concurrency, coalescing, and continuation against synthetic manifests and fixtures without scanning any repository outside `MentallyQuill`.
5. Keep live operations restricted to the approved canary allowlist during implementation acceptance.
6. Enable normal bidirectional wake-ups and scheduled reconciliation.
7. Enable staff-only deep scans after standard scanning is stable.
8. Monitor retry rates, false-positive appeals, model usage, and oldest backlog age before changing concurrency or scanner policy.

## 23. Technology and Repository Governance

TavernKeeper is a public `MentallyQuill/TavernKeeper` repository licensed under AGPL-3.0. Third-party scanners remain separate programs under their own licenses.

The intended implementation stack is:

- Node.js 24
- TypeScript with strict checking
- Zod for service and public contracts
- Vitest for unit and integration tests
- GitHub Actions for scanning and publication
- GitHub Pages for static contracts and reports
- Static script-free HTML reports

Tavernary retains its existing Next.js static-export, React, TypeScript, Ajv, Vitest, and GitHub Pages architecture.

## 24. Definition of Done

The system is complete only when:

1. Tavernary publishes a valid exact-SHA GitHub target manifest.
2. Tavernary successfully wakes TavernKeeper through the one-way App.
3. TavernKeeper proves five-repository backlog behavior with maximum concurrency two while live acceptance scans only the approved Wandlight and Recursion repositories.
4. TavernKeeper scans without executing target content.
5. Every applicable required scanner and configured-model call completes before publication.
6. TavernKeeper publishes immutable sanitized reports and verifies Pages.
7. TavernKeeper successfully wakes Tavernary through the opposite one-way App.
8. Tavernary imports only identity- and SHA-valid summaries.
9. Cards display an inline green, yellow, or gray scan indicator with the approved concise popover.
10. Failed operations publish nothing and follow the approved delayed retry policy.
11. Staff can perform every privileged operation and appeal adjudication.
12. Cross-repository, hostile-fixture, accessibility, static-export, and workflow-permission gates pass.

## 25. References

- [GitHub `GITHUB_TOKEN` scope](https://docs.github.com/en/actions/concepts/security/github_token)
- [GitHub workflow dispatch REST API](https://docs.github.com/en/rest/actions/workflows)
- [GitHub App authentication from Actions](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow)
- [Gitleaks](https://github.com/gitleaks/gitleaks)
- [OpenGrep](https://github.com/opengrep/opengrep)
- [OSV-Scanner](https://github.com/google/osv-scanner)
- [zizmor](https://docs.zizmor.sh/)
- [malcontent](https://github.com/chainguard-dev/malcontent)
- [NanoGPT Chat Completions API](https://docs.nano-gpt.com/api-reference/endpoint/chat-completion)
- [DeepSeek V4 Flash on NanoGPT](https://nano-gpt.com/models/text/deepseek/deepseek-v4-flash)
- [Remix Icon](https://github.com/Remix-Design/RemixIcon)
