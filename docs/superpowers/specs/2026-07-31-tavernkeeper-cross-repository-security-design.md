# TavernKeeper Cross-Repository Security Scanning Design

- **Status:** Approved deterministic-production design
- **Original date:** 2026-07-31
- **Revised:** 2026-08-02
- **Canonical location:** Tavernary
- **Repositories:** `MentallyQuill/Tavernary` and `MentallyQuill/TavernKeeper`

## 1. Executive summary

TavernKeeper is a separate public AGPL-3.0 repository that performs advisory,
static security scans of eligible GitHub projects listed by Tavernary.
Tavernary decides which catalog sources are eligible and publishes their exact
repository identities and current SHAs. TavernKeeper owns scanner policy,
exact-SHA acquisition, deterministic scanning, result derivation, immutable
report publication, scan history, retry state, and operational incidents.

The production pipeline has no language-model dependency. TavernKeeper never
sends repository source, scanner output, or report data to a model provider.
Required deterministic scanners produce normalized evidence; a versioned
TavernKeeper policy decides which findings are reportable and derives the red
or teal conclusion. A deterministic renderer uses reviewed rule metadata and
bounded templates to create concise plain-language results.

The repositories communicate asynchronously through public versioned JSON
contracts and input-free GitHub App wake events. GitHub Actions performs the
work, TavernKeeper Pages hosts reports, and Tavernary imports validated report
summaries for the project-card interface. No backend, database, webhook server,
scanning daemon, or second report repository is required.

Production is fully automated. A complete result does not wait for staff
review, dismissal, recoloring, or approval. An incomplete scan publishes
nothing. Results are advisory and never certify, hide, quarantine, rank, or
delist a Tavernary project.

## 2. Goals

TavernKeeper must:

1. Detect deterministic evidence of credential exposure, credential theft,
   suspicious transmission, dangerous install behavior, vulnerable
   dependencies, unsafe GitHub automation, obfuscation, and other configured
   security concerns.
2. Bind every report to an immutable GitHub repository ID and exact commit SHA.
3. Inventory the complete current tree and scan the bounded recent history
   wherever the configured tool supports it.
4. Run every scanner applicable under one versioned policy without executing
   target code.
5. Derive the same assessment fields, findings, conclusion, and summary from
   identical evidence and policy inputs. Operational timestamps may differ.
6. Explain findings in concise language without generated prose or untrusted
   raw scanner text.
7. Publish sanitized immutable JSON and script-free HTML reports with history.
8. Integrate with Tavernary without sharing repository write credentials.
9. Fail closed: missing coverage, malformed evidence, tool failure, schema
   failure, or publication failure produces no report.
10. Support staff-targeted scans without exposing a public spend or abuse
    surface.
11. Recover from missed wake events through scheduled reconciliation.
12. Process the catalog fairly in batches of at most five repositories and at
    most two concurrent scan jobs.

## 3. Non-goals

V1 does not provide:

- Safety certification, malware prevention, or guarantees
- Runtime execution, behavioral detonation, builds, tests, package installs,
  macros, containers, or target Actions execution
- Semantic whole-repository language-model review
- Model-generated summaries, verdicts, or finding dispositions
- Public or owner-initiated scan requests
- Private-repository or non-GitHub scanning
- Preset scanning, including presets whose files happen to be stored on GitHub
- Automatic owner notification for operational failures
- Individual finding dismissal or staff recoloring
- Automatic moderation, hiding, ranking, quarantine, or delisting
- A special reduced scan for large repositories
- Separate standard and deep production modes

## 4. Product semantics

### 4.1 Advisory meaning

TavernKeeper reports what its named scanners and versioned rules found at one
commit. A teal result means no finding met the reportable threshold under that
policy. It does not mean safe, trusted, verified, certified, or free of unknown
malicious behavior.

Every public surface must use bounded language such as “No reportable concerns
were detected at this commit.” It must not say “safe,” “clean,” “secure,” or an
equivalent guarantee.

### 4.2 Public states

TavernKeeper publishes only:

- `teal`: every required applicable scanner completed and no normalized finding
  has both medium-or-higher severity and medium-or-higher confidence.
- `red`: every required applicable scanner completed and at least one normalized
  finding meets that threshold.

Tavernary derives presentation-only states:

- `orange`: the newest complete report is teal but its SHA no longer matches
  Tavernary's current healthy repository SHA; an updated scan is pending.
- `gray`: the eligible GitHub project has no complete TavernKeeper report.
- `unsupported`: the project source or project kind is outside scan policy.
  Tavernary renders this with its super-dark-teal token.

A red report remains red even when stale. A later forced or queued scan may
replace the preferred report only after the new scan completes and publishes.

### 4.3 Eligible catalog entries

Tavernary includes active GitHub-backed projects that its catalog policy marks
eligible. Codeberg, Reddit, arbitrary download pages, and presets are
unsupported. TavernKeeper accepts no arbitrary clone URL and derives checkout
coordinates only from Tavernary's validated GitHub repository identity.

## 5. Repository responsibilities

### 5.1 Tavernary owns

- Catalog eligibility and project kind
- Active source identity, immutable GitHub repository ID, canonical owner/name,
  and current healthy head SHA
- The public target manifest
- Staff authorization for targeted scans by exact GitHub URL
- Import validation and the tracked summary snapshot
- SHA freshness, presentation state, card mapping, and public UI
- Catalog refresh and ordinary site deployment

### 5.2 TavernKeeper owns

- Scanner binaries, rules, configuration, and versioned policy
- Safe exact-SHA checkout and full inventory
- Scanner applicability and coverage requirements
- Finding normalization, sanitization, evidence validation, confidence,
  severity, and reportable status
- Deterministic summaries and red/teal derivation
- Queue resolution, retries, circuit breaker, and staff incidents
- Immutable JSON/HTML reports, preferred index, and repository history
- The Publisher App and Pages deployment

Tavernary never adjudicates TavernKeeper security evidence. TavernKeeper never
decides catalog eligibility or modifies Tavernary content directly.

## 6. Credentials and GitHub Apps

Two Actions-only wake Apps provide destination-scoped dispatch:

1. Tavernary mints a token for an App installed only on TavernKeeper and sends
   an input-free reconcile wake.
2. TavernKeeper mints a token for an App installed only on Tavernary and sends
   an input-free import wake after verified publication.

Wake Apps receive only Actions write and required metadata read. A wake payload
cannot select a repository, SHA, priority, scanner mode, or report URL. The
destination reconciles its own public input.

`TavernKeeper Publisher` is installed only on TavernKeeper. It receives
contents write and required metadata read but no Actions permission. Mutation
jobs obtain a short-lived installation token from a protected TavernKeeper
environment, disable persisted checkout credentials, and scope the token to
the TavernKeeper repository. Publisher authentication failure stops the write;
there is no `GITHUB_TOKEN` write fallback.

Installation tokens are opaque strings with no length or prefix assumptions.
The built-in `GITHUB_TOKEN` remains contents-read for TavernKeeper scan jobs.
Neither repository receives a contents-write credential for the other.

The TavernKeeper scanning system has no model endpoint, model key, model
identifier, or provider credential. This constraint does not alter unrelated
Tavernary catalog-automation features.

## 7. Architecture and handshake

```text
Tavernary V2 target manifest
  -> input-free wake or six-hour reconciliation
  -> TavernKeeper resolves at most five pending repositories
  -> at most two disposable exact-SHA scan jobs
  -> inventory and all applicable deterministic scanners
  -> normalized evidence and deterministic Scan Package V1
  -> evidence validation, policy classification, summary, and V3 report
  -> encrypted one-day candidate artifact
  -> serialized validation and Publisher App commit to TavernKeeper main
  -> verified TavernKeeper Pages deployment
  -> input-free Tavernary wake
  -> Tavernary validates/imports V3 summaries and rebuilds cards
```

Both directions also reconcile every six hours so a missed notification cannot
permanently lose work.

### 7.1 Targeted staff scan

Tavernary exposes a staff-only workflow accepting one exact GitHub repository
URL. It validates staff identity, normalizes the URL, resolves it to one active
eligible source and immutable repository ID, and sends the same input-free
TavernKeeper wake. TavernKeeper refetches the manifest and derives the target;
the URL is never passed as a checkout instruction.

Repeated staff requests coalesce when the same SHA has completed since the
request entered the queue. A request created after a prior report remains an
intentional forced rescan.

### 7.2 SHA churn

Before checkout begins, queued work coalesces to the manifest's newest SHA.
After exact-SHA acquisition begins, TavernKeeper finishes and publishes that
immutable SHA even if Tavernary later observes a newer head. Tavernary keeps
the report linked to the scanned SHA and derives orange/pending for a stale
teal report. Repository churn never invalidates a complete historical report.

## 8. Backlog and scheduling

The ordinary queue is derived from Tavernary's live target manifest, the
preferred TavernKeeper report index, and secret-free operational retry state.
It is not a second hand-maintained database.

Each batch selects at most five repositories. The scan matrix runs at most two
jobs concurrently. Work is prioritized in three lanes:

1. Current Tavernary Top 30 projects
2. New submissions first cataloged after coverage begins
3. Older eligible projects

Within a lane, older pending work comes first. A thirty-day age boost prevents
starvation without erasing lane identity. Due retries return to their source
lane. Staff-targeted work enters the same non-cancelling queue and publication
path. A protected staff-targeted request may run during the initial ordinary-
backlog pause, but it does not bypass an active system circuit breaker or a
target's scheduled retry protection.

The initial rollout remains staff-paused. Normal backlog processing begins only
after Wandlight and Recursion pass the complete live acceptance path.

## 9. Exact-SHA checkout and isolation

Each repository runs in a fresh GitHub-hosted job with a disposable directory.
TavernKeeper:

- Resolves a validated `owner/repository` from the immutable repository ID.
- Fetches only the history needed by policy and checks out the exact SHA.
- Disables hooks, credential helpers, interactive prompts, Git LFS smudging,
  submodules, recursive cloning, and local filesystem protocols.
- Never runs target dependencies, scripts, Actions, tests, builds, binaries,
  containers, package managers, or install hooks.
- Rechecks that `HEAD` equals the requested SHA before scanning.
- Removes the checkout when the disposable job ends.

Target content is always untrusted data. File names, scanner fields, and
repository metadata cannot become commands, workflow expressions, HTML, or
unvalidated report paths.

## 10. Inventory and coverage

Inventory precedes scanners and records every safe current-tree entry, byte
count, type, and content digest. It rejects path traversal, absolute paths,
portable-name collisions, unsafe links, and other entries that cannot be
represented safely.

Inventory classifies dependency lockfiles, vendored dependencies, generated
bundles, minified files, binaries, archives, oversized files, unsafe entries,
and ordinary first-party text. Exclusions remain visible as counts and bytes.
Exclusion from one scanner never implies exclusion from inventory or all
scanners.

There is no catalog-size gate and no smaller policy for large repositories.
Every tool retains protective runtime and output ceilings. Exceeding a ceiling
fails the scan with no report rather than silently reducing coverage.

## 11. Required deterministic scanners

The initial policy requires:

1. **TavernKeeper static rules** for network install hooks, credential access
   paired with transmission, suspicious shell construction, Unicode controls,
   and other reviewed structural patterns.
2. **Gitleaks** over the bounded current and recent Git history, up to twenty
   commits, for exposed secrets and credentials.
3. **OpenGrep** with TavernKeeper-owned pinned rules for source patterns.
4. **OSV-Scanner** for supported manifests and lockfiles without resolving or
   installing dependencies.
5. **zizmor** for applicable GitHub Actions workflows.
6. **Malcontent** in its pinned trusted container with networking disabled, a
   read-only root filesystem, dropped capabilities, no-new-privileges, and the
   target mounted read-only.

A scanner may return `not-applicable` only when inventory proves it has no
valid inputs. Missing executables, malformed output, timeouts, output-limit
failures, or non-policy exits are failures, not `not-applicable` results.

Scanner additions and rule changes require a new scanner-policy version and
policy rescan; ClamAV and binary reverse engineering remain deferred.

## 12. Normalized findings and rule descriptions

Every accepted finding contains:

- Originating scanner and rule ID
- Category, severity, confidence, and policy status
- Portable path and optional verified line range
- Optional evidence SHA or advisory reference
- Trusted title, explanation, and remediation
- Stable evidence fingerprint

`policy_status` is:

- `reportable` when severity is medium-or-higher and confidence is
  medium-or-higher.
- `informational` otherwise.

Severity and confidence come from TavernKeeper's versioned adapters and rule
policy, not arbitrary scanner prose. Known TavernKeeper rules use specific
reviewed descriptions. Dynamic external findings use category templates filled
only with validated values such as package, installed version, advisory ID,
affected path, and fixed version. Unknown or malformed output fails validation;
TavernKeeper never improvises public text.

Raw secrets, source excerpts, target-supplied descriptions, ANSI sequences,
HTML, bidirectional controls, and arbitrary URLs are not copied into findings.

## 13. Deterministic Scan Package V1

After all applicable scanners complete, TavernKeeper constructs an internal
typed package containing:

- Repository ID, canonical owner/name, source ID, exact SHA, and history range
- Scanner, policy, rule-catalog, and package-schema versions
- Complete inventory and exclusion counts
- Each required tool's version and completed/not-applicable state
- Sorted normalized findings
- Evidence-validation inputs and coverage totals

The package contains no raw source corpus, raw scanner response, credential, or
generated text. Canonical sorting and serialization make its digest stable.
The package is an internal evidence boundary, not an additional public API.

The report builder validates every cited path, line, SHA, fingerprint, count,
and tool state against this package. Any mismatch publishes nothing.

## 14. Deterministic conclusion and summary

The policy derives:

- `red` when one or more findings have `policy_status: reportable`.
- `teal` when none do and all coverage requirements succeeded.

The concise summary is rendered from trusted templates and normalized counts.
It contains a bounded headline and detail suitable for the Tavernary card. A
teal detail says no reportable concerns were detected at the exact commit. A
red detail states the reportable count and highest severities/categories
without declaring malicious intent as fact.

The full report groups findings by severity and category, explains each rule in
plain language, lists remediation, names completed tools, shows inventory and
exclusions, links the exact GitHub SHA, and states limitations.

Identical package and policy inputs must produce identical assessment fields,
findings, conclusion, and summary. Completion time, workflow identity, and
supersession metadata may differ between forced rescans.

## 15. Public V3 contracts

### 15.1 Report V3

V3 is a new contract rather than a reinterpretation of model-based V2. It
contains:

- `schema_version: 3`, report ID/version, and optional superseded report ID
- Scanner, scanner-policy, rule-catalog, and package-schema versions
- Source ID, provider, repository ID/name, canonical URL, and exact SHA
- Completion time and deterministic assessment method
- History and inventory coverage
- Tool completion/applicability and evidence-validation state
- Result, bounded concise summary, finding counts, and normalized findings

V3 has no model, provider endpoint, prompt-policy, token, chunk, or automated
review-role fields. It does not use model-derived `confirmed` terminology.

The report ID is a SHA-256 digest of canonical report identity and content.
Public JSON and script-free HTML use immutable paths under:

```text
/reports/github/{repository_id}/{target_sha}/{scanner_policy_version}/{report_version}/
```

Each repository also has an immutable ordered history page and JSON document.

### 15.2 Preferred index V3

The preferred index contains the minimal card/import projection: immutable
identity, exact SHA, policy versions, result, summary, finding counts, coverage
totals, report URL, and history URL. Only one preferred entry may exist for a
repository/SHA/policy identity.

Tavernary accepts V3 only after local schema validation, semantic count checks,
safe canonical URLs, exact repository identity matching, active policy
matching, and duplicate rejection. Invalid remote data does not replace the
last valid tracked snapshot.

### 15.3 Evolution and rollout order

V1 and V2 schemas remain immutable historical contracts. Tavernary first
deploys a V3-capable importer while retaining safe historical parsing.
TavernKeeper then deploys the V3 publisher. The preferred public index changes
to V3 only after the reader is live. Contract changes thereafter require a new
schema version and coordinated reader-before-writer rollout.

## 16. Publication

Scan jobs sanitize their candidate, encrypt it with AES-256-GCM, upload only the
ciphertext as a one-day artifact, and delete plaintext handoff files. A single
publisher job decrypts in ephemeral storage and prevalidates the entire batch.

The publisher renders JSON and script-free HTML, updates history and the
preferred index atomically, validates generated files again, obtains a
short-lived Publisher App token, and pushes to TavernKeeper `main`. Partial
writes are rolled back before push. Pages deploys only an exact commit proven
to be on `main`.

After Pages content and index digests are verified, TavernKeeper sends an
input-free Tavernary wake. A failed push, deployment, or public verification
publishes no preferred result and does not wake Tavernary.

## 17. Tavernary card interface

### 17.1 Placement and icon

The scan icon appears immediately after the project's last title character,
inline with the title. The title yields enough space for the icon before
ellipsis clipping. A shield is not used because the interface does not imply a
safety guarantee.

### 17.2 Interaction

Hover, keyboard focus, and click/tap expose the same accessible anchored panel.
The panel does not navigate when opened and closes through outside interaction,
Escape, or its explicit close behavior. Mobile behavior must not depend on
hover.

The heading is exactly:

```text
TavernKeeper Scan Results
```

The panel contains only concise result content required for this feature:

- Deterministic layman's summary
- Exact scanned SHA link and freshness wording
- Nonzero reportable severity counts for red
- Compact recent teal/red history strip
- `View full scan history` link
- Link to the complete immutable report

Unscanned projects state concisely that TavernKeeper has not scanned the
project. Unsupported entries state that the source or project type is outside
TavernKeeper coverage.

### 17.3 Performance and accessibility

Card payloads use the compact preferred index only. Full findings are not
hydrated into the catalog. History strips are bounded. The control has an
accessible name containing state and freshness, visible focus, sufficient
contrast, reduced-motion support, and keyboard parity. Mobile Safari acceptance
must prove no layout takeover, clipping regression, scroll lock, or material
input delay.

## 18. Failure, retry, and circuit breaker

No degraded or partial report is ever published.

Repository-specific failures delay only that target. System-wide failures stop
ordinary scanning and engage the circuit breaker. The initial failure is
retried after one hour, again after two hours, and again after three hours,
measured from the first failure. Intermediate failures notify neither owners
nor staff.

If the third retry also fails, TavernKeeper creates or updates one deduplicated
`scanner-operations` issue for TavernKeeper staff and remains stopped until the
cause is corrected and staff resume operations. External project owners do not
receive operational error notices.

System failures include unavailable required scanner infrastructure,
TavernKeeper contract defects, Publisher authentication failure, corrupted
operational state, and widespread publication failure. A repository-specific
malformed tree, unsupported manifest, or target-only tool failure does not stop
unrelated repositories unless evidence indicates a system defect.

Success and terminal failure transitions clear matching active-scan state.

## 19. Staff controls and policy corrections

Protected TavernKeeper staff workflows may pause/resume operations, retry a
target, or start a versioned policy-rescan campaign. Humans initiate a targeted
repository scan only through Tavernary's exact-GitHub-URL action.

Public issues and comments cannot trigger scans. There is no individual false-
positive dismissal or manual recoloring. If an appeal exposes a scanner or
normalization defect, staff update global versioned policy through ordinary
code review and automatically rescan affected repositories. Historical reports
remain immutable and visible.

## 20. Threat model

TavernKeeper assumes a target may contain malicious paths, enormous files,
archives, symlinks, secrets, prompt-like text, terminal controls, scanner
exploits, and content crafted to corrupt reports or workflows.

Controls include:

- Disposable jobs and exact-SHA identity checks
- No target execution and minimal network exposure
- Pinned trusted tools and TavernKeeper-owned configuration
- Malcontent container isolation
- Portable-path validation and bounded inputs/outputs
- Restricted subprocess environments without write credentials
- Sanitized typed adapters instead of raw-output publication
- Encrypted inter-job candidates
- Serialized Publisher App writes and protected `main`
- Hardened Tavernary fetching, schema validation, URL validation, and atomic
  tracked-summary replacement
- Staff-only target requests, input-free cross-repository wakes, batching,
  concurrency limits, coalescing, and retry circuit breaker

Eliminating runtime model calls also eliminates repository-to-model prompt
injection, provider credential exposure, token-spend abuse, model output
hallucination, and provider availability from the scan trust boundary.

## 21. Workflows

### 21.1 Tavernary

1. Build and publish the V2 exact-SHA target manifest.
2. Send an input-free wake when eligible sources change.
3. Resolve a staff-entered exact GitHub URL to an eligible repository ID and
   send the same wake.
4. Import and validate the V3 preferred index after a wake or schedule.
5. Commit the validated summary snapshot through Tavernary's existing trusted
   publication path and rebuild/deploy the site.

### 21.2 TavernKeeper

1. Reconcile on an input-free wake, schedule, or approved staff operation.
2. Resolve at most five requests and scan at most two concurrently.
3. Prepare exact checkout, inventory, and applicable scanner inputs.
4. Run required deterministic scanners.
5. Build and validate Scan Package V1 and Report V3.
6. Encrypt candidate artifacts.
7. Serialize publication, update history/index, and push with Publisher App.
8. Deploy and verify Pages.
9. Wake Tavernary and optionally continue the backlog.
10. Maintain pause, retry, circuit-breaker, and policy-campaign state.

The former provider-check and deep-scan workflows are removed. Model secrets,
cache actions, model review steps, and model telemetry are absent from all
production workflows.

## 22. Observability

Secret-free telemetry records:

- Queue lane, wait age, batch size, and scan concurrency
- Repository ID and exact SHA, without repository source
- Inventory files/bytes and exclusion totals
- Per-tool duration, status, version, and normalized finding counts
- Package/report schema and policy versions
- Reportable/informational counts and derived result
- Retry class, attempt number, circuit-breaker state, and oldest backlog age
- Publisher commit, Pages deployment, and Tavernary import identity

Raw scanner output, source content, secrets, credentials, and encrypted
candidate plaintext never enter logs or telemetry.

## 23. Testing and acceptance

### 23.1 TavernKeeper

- Unit tests cover every adapter, normalizer, threshold, rule description,
  evidence check, summary template, count invariant, and result derivation.
- Hostile fixtures cover traversal, collisions, symlinks, binaries, archives,
  oversized content, bidirectional controls, ANSI, HTML, secret-like values,
  malformed scanner output, and unknown rules.
- Contract tests cover Scan Package V1, Report V3, Index V3, histories,
  immutable paths, and atomic publication.
- Workflow-policy tests prove target code cannot execute, write credentials are
  isolated, and no model credential or provider request exists in TavernKeeper
  scan workflows.
- Reproducibility tests prove identical evidence and policy produce identical
  assessment fields, findings, result, and summary.
- Real-tool smoke and release gates run pinned scanners against controlled
  fixtures.

### 23.2 Tavernary

- V3 schema, semantic counts, identity, policy, canonical URL, duplicate,
  redirect, size, timeout, and atomic-write tests.
- Red, teal, stale-orange, gray, unsupported, and stale-red state tests.
- Scan-icon placement, title clipping, panel contents, history strip, exact-SHA
  links, keyboard, touch, focus, reduced-motion, and mobile Safari tests.
- Invalid remote data preserves the last valid tracked snapshot.

### 23.3 Release and live canaries

Both repositories run their full check, typecheck, lint, unit, integration,
build, workflow-policy, and static-export gates. TavernKeeper additionally runs
the real pinned scanner gate.

The model-free pipeline is not accepted until staff-targeted production scans
of Wandlight and Recursion:

1. Complete with every applicable deterministic scanner.
2. Publish immutable V3 JSON/HTML reports and histories on TavernKeeper Pages.
3. Import through Tavernary's production V3 reader.
4. Hydrate on the live Tavernary cards with the correct icon, result, exact
   SHA, summary, history strip, and links.
5. Show no model-provider contact or model-token usage in workflows.

The ordinary backlog remains paused until both canaries pass.

## 24. Rollout

1. Commit this canonical revised design.
2. Implement and deploy Tavernary's V3 reader and card projection first.
3. Implement TavernKeeper's model-free package, policy, V3 report, and V3 index.
4. Remove source chunking, model review/synthesis, caches, provider check,
   provider secrets, deep mode, model telemetry, and superseded documentation.
5. Run local and CI gates in both repositories.
6. Deploy TavernKeeper writer and Pages changes.
7. Trigger Wandlight and Recursion through Tavernary's general staff-targeted
   GitHub-URL action.
8. Verify both live end to end.
9. Resume the Top-30/new/old backlog and monitor scanner runtime, failure rates,
   oldest work age, and red-result frequency.

There is no repository-size admission gate. Protective scanner ceilings remain
fail-closed and may be revised globally through versioned policy when real
evidence justifies it.

## 25. Definition of done

This design is complete when:

1. Tavernary publishes eligible exact-SHA targets and staff can request one
   eligible repository by exact GitHub URL.
2. TavernKeeper safely acquires exact SHAs and runs every applicable required
   deterministic scanner without target execution.
3. Scan Package V1 and Report/Index V3 enforce complete coverage, sanitized
   evidence, deterministic findings, conclusion, and summary.
4. No TavernKeeper scan-pipeline or Tavernary TavernKeeper-integration code,
   workflow, configuration, secret, cache, telemetry, or operational dependency
   invokes a language model.
5. Partial or failed work publishes nothing and follows the approved retries.
6. Publisher App writes, Pages deployment, wake events, and Tavernary imports
   work with least privilege and opaque installation tokens.
7. Tavernary presents the inline scan icon, exact result, freshness, concise
   layman's summary, compact history, and full links accessibly.
8. Historical reports remain immutable; false-positive corrections use global
   versioned policy and rescans rather than dismissal.
9. Wandlight and Recursion are verified on TavernKeeper Pages and the live
   Tavernary website before ordinary backlog scanning resumes.

## 26. References

- [GitHub Actions security hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [GitHub App installation authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation)
- [GitHub `GITHUB_TOKEN` scope](https://docs.github.com/en/actions/concepts/security/github_token)
- [GitHub App installation-token format change](https://github.blog/changelog/2026-05-15-github-app-installation-tokens-per-request-override-header/)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Open Source Vulnerability format](https://ossf.github.io/osv-schema/)
- [OSV-Scanner](https://github.com/google/osv-scanner)
- [Gitleaks](https://github.com/gitleaks/gitleaks)
- [zizmor](https://github.com/woodruffw/zizmor)
- [Malcontent](https://github.com/chainguard-dev/malcontent)
