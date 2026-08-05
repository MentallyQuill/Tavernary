# TavernKeeper Cross-Repository Contextual Security Design

- **Status:** Approved design; implementation pending
- **Original date:** 2026-07-31
- **Revised:** 2026-08-02
- **Canonical location:** Tavernary
- **Repositories:** `MentallyQuill/Tavernary` and `MentallyQuill/TavernKeeper`

## 1. Executive summary

TavernKeeper is a separate public AGPL-3.0 repository that performs advisory
security scans of eligible GitHub projects listed by Tavernary. Tavernary owns
catalog eligibility, source identity, final project-level assessment, and the
public card experience. TavernKeeper owns exact-SHA acquisition, deterministic
scanning, evidence construction, contextual finding review, technical reports,
history, retries, and scan operations.

Deterministic scanners are candidate locators, not public judges. Their matches
identify concrete files, lines, data sources, sinks, package advisories, and
other evidence that merits contextual review. TavernKeeper groups related
matches by file, constructs bounded source context, and asks its configured
model to classify each item as expected behavior, a minor weakness, a material
vulnerability, or credible malicious behavior. The configured model is
replaceable without changing the cross-repository contract. The intended first
release model is `deepseek/deepseek-v4-flash-0731:thinking` through NanoGPT.

TavernKeeper publishes the complete sanitized technical record: deterministic
evidence, contextual assessments, coverage, limitations, and exact-SHA links.
Tavernary imports that structured record, deterministically derives the
repository-level grade and danger basis, and uses its strict-JSON Luna model
only to enrich the concise layman's summary. Prose synthesis cannot raise or
lower the project grade.

Production is fully automated. Humans may trigger, pause, resume, or force a
rescan, but no production report, finding disposition, project grade, or card
update waits for manual review. If required scanner coverage, model context,
schema validation, or evidence binding fails, no result is published. Optional
Tavernary narrative enrichment may degrade to fixed policy-owned copy without
hiding an otherwise valid report.

The two repositories communicate asynchronously through public versioned JSON
contracts and least-privilege GitHub App wake events. GitHub Actions performs
the work, TavernKeeper Pages hosts technical reports, and Tavernary publishes
the final card assessment. No runtime backend, database, webhook server,
scanning daemon, or second report repository is required.

## 2. Goals

TavernKeeper and Tavernary must together:

1. Detect evidence of credential theft, phishing, harmful persistence, trojan
   packages, hidden execution, bot infection, exploitable vulnerabilities,
   exposed secrets, unsafe automation, and related security concerns.
2. Distinguish those threats from powerful but expected SillyTavern extension
   behavior such as host-state access, UI mutation, model-provider calls,
   generation interception, and configuration persistence.
3. Bind every scan, finding, assessment, and public link to an immutable GitHub
   repository ID and exact commit SHA.
4. Inventory the complete current tree and scan the bounded recent history
   wherever a required tool supports it.
5. Run every applicable deterministic scanner without executing target code.
6. Preserve every normalized scanner match while treating it only as evidence
   for contextual classification.
7. Give the contextual reviewer sufficient project, file, data-flow, and code
   context to make a proportional judgment.
8. Produce plain-language explanations that nontechnical Tavernary visitors
   can understand without hiding the underlying technical evidence.
9. Publish sanitized immutable technical reports and a separately bound final
   Tavernary assessment with accessible card and history interfaces.
10. Keep model providers and models replaceable behind stable contracts.
11. Integrate without sharing repository write credentials or accepting public
    scan requests.
12. Fail closed on incomplete scans or assessments and recover through bounded
    retry and circuit-breaker behavior.
13. Process at most five repositories per batch and preserve the approved
    Top-30, new-submission, and older-project priority lanes.

## 3. Non-goals

This design does not provide:

- Safety certification, malware prevention, or a guarantee that a project is
  free of unknown harmful behavior
- Runtime execution, behavioral detonation, package installation, target
  builds, target tests, target Actions, macros, or target containers
- A public or project-owner scan request surface
- Staff dismissal of individual findings, manual recoloring, or publication
  approval
- Automatic hiding, ranking, quarantine, moderation, or delisting
- Private-repository, Codeberg, Reddit, arbitrary-download, or preset scanning
- A reduced production scan for large repositories
- A token-budget guess that silently truncates source or evidence
- An independent whole-repository model search untethered from deterministic
  evidence; the model reviews every scanner candidate with surrounding project
  and source context and may add only directly related cited observations
- Majority voting in which numerous green findings cancel a serious finding
- Publication of hidden model reasoning, raw secrets, raw provider responses,
  or untrusted scanner prose
- Long-term compatibility readers for development-only report schemas V1-V4

## 4. Product semantics

### 4.1 Advisory meaning

TavernKeeper reports what its named scanners and contextual review policy found
at one commit. Tavernary reports the final automated assessment of that same
evidence. Neither result means safe, trusted, verified, certified, or free of
unknown malicious behavior.

Public language may say that no material concern was identified under the
completed policy. It must not say that a project is safe, clean, or certified.
The scan icon factually communicates that scanning and assessment occurred.

### 4.2 Risk levels and colors

Risk and freshness are separate dimensions. The final assessment stores a
semantic `risk_level` and maps it to Tavernary's theme colors:

- `low` / teal: no material danger was identified. This is a broad range from
  no concerns through minor sensitivities, weaknesses, or hardening advice.
- `material` / orange: one or more credible security weaknesses could plausibly
  harm users and should be considered, but the evidence does not support a
  high-danger conclusion.
- `high` / red: strong evidence shows immediate danger at the exact scanned
  commit. This requires high-confidence credible malicious or compromised
  behavior, or a high-confidence critical and readily exploitable vulnerability.
  Upstream advisory severity alone is insufficient.

Teal is not limited to a perfect repository. A project with ordinary cautions
remains teal when those cautions do not create meaningful danger. The panel and
report explain the cautions rather than inventing a fourth risk grade.

Tavernary also presents:

- Gray for an eligible source without a complete final assessment.
- Super-dark teal for an unsupported source or project kind.

Color is always paired with text. Public copy uses `Low concern`,
`Material concern`, and `Immediate danger` rather than `safe` or `clean`. Every
red result separately identifies malicious/compromised behavior, a critical
readily exploitable vulnerability, or both. Red does not automatically hide or
delist the project; visibility provides community awareness.

### 4.3 Freshness

Freshness is computed by Tavernary from the assessed SHA and the repository SHA
observed during the most recent successful site-wide refresh:

- `current`: the SHAs match.
- `stale`: the SHAs differ and an updated scan is pending or queued.

The scan icon retains its risk color when stale. A small clock marker and
accessible label communicate staleness. A stale red assessment remains red; a
stale teal assessment remains teal. The panel links the scanned SHA so visitors
can inspect or download the exact assessed revision.

### 4.4 Eligible catalog entries

Active GitHub-backed projects marked eligible by Tavernary may be scanned.
Presets are unsupported even when stored on GitHub because they do not execute
as extensions or applications. Codeberg, Reddit, arbitrary download pages, and
other unsupported sources receive no scan request. TavernKeeper accepts no
arbitrary clone URL and derives checkout coordinates from Tavernary's validated
GitHub repository identity.

## 5. Repository responsibilities

### 5.1 Tavernary owns

- Catalog eligibility and project kind
- Active source identity, immutable GitHub repository ID, canonical owner/name,
  and current healthy head SHA
- The public exact-SHA target manifest
- Staff authorization for targeted scans by exact GitHub URL
- V5 technical-report import and evidence-floor validation
- Strict-JSON Luna repository-level synthesis
- The final risk level, public summary, malicious-evidence statement, cited
  finding IDs, and assessment history
- Public final-assessment history pages that bind every grade to its exact
  TavernKeeper technical report
- SHA freshness, card mapping, scan-icon state, panel contents, and public UI
- Catalog refresh and ordinary site deployment

### 5.2 TavernKeeper owns

- Scanner binaries, rules, configuration, and versioned scanner policy
- Safe exact-SHA checkout, current-tree inventory, and bounded history
- Scanner applicability and coverage requirements
- Finding normalization, sanitization, and stable evidence fingerprints
- File-centered evidence-context construction
- Versioned ecosystem context and contextual-review prompt policy
- Model/provider adapter, configured model, output validation, and retries
- Per-finding contextual dispositions, explanations, and developer actions
- Technical Report V5, Preferred Index V5, and immutable technical history
- Queue resolution, retries, circuit breaker, and staff incidents
- The Publisher App and TavernKeeper Pages deployment

TavernKeeper does not assign the final Tavernary project grade. Tavernary does
not rewrite the scanner evidence or TavernKeeper's per-finding assessments.
Neither repository directly edits the other.

### 5.3 Automation authority

Production evaluation and publication are fully automated. Staff may:

- Trigger one eligible repository through Tavernary's protected GitHub-URL
  action
- Pause or resume scanning
- Retry a failed target
- Start a global versioned policy-rescan campaign
- Change global scanner, context, prompt, or model policy through ordinary code
  review

Staff may not dismiss, edit, hide, recolor, or manually supersede an individual
finding or report. A correction is expressed through globally reviewed policy
and a new automated scan. Development inspection of canaries is a release test,
not a production approval gate.

## 6. Credentials and GitHub Apps

Two Actions-only wake Apps provide destination-scoped dispatch:

1. Tavernary mints a token for an App installed only on TavernKeeper and sends
   a non-authoritative reconcile wake.
2. TavernKeeper mints a token for an App installed only on Tavernary and sends
   an input-free import wake after verified technical-report publication.

Wake Apps receive only Actions write and required metadata read. A wake cannot
provide a clone URL, report URL, model, prompt, budget, or scanner mode. The
destination refetches its own public input. A targeted wake may include only a
validated repository-ID hint; TavernKeeper still refetches Tavernary's manifest
and derives the authoritative target.

`TavernKeeper Publisher` is installed only on TavernKeeper with contents write
and required metadata read but no Actions permission. Protected mutation jobs
mint a short-lived installation token, disable persisted checkout credentials,
and scope the token to TavernKeeper. Publisher authentication failure stops the
write; there is no `GITHUB_TOKEN` write fallback.

Installation tokens are opaque strings. Code and workflows make no prefix or
length assumptions, including assumptions invalidated by GitHub's stateless
`ghs_` token format.

The TavernKeeper model-provider credential is available only to the protected
scan environment. It is never exposed to target code, reports, artifacts, logs,
Tavernary, or the Publisher job. The endpoint, model identifier, and compatible
authentication mode are configuration rather than report-contract constants.

## 7. Architecture and handshake

```text
Tavernary V2 target manifest (repository ID + exact SHA)
  -> input-free wake, targeted hint, or scheduled reconciliation
  -> TavernKeeper selects at most five pending repositories
  -> disposable exact-SHA scan jobs
  -> inventory and every applicable deterministic scanner
  -> normalized candidate evidence
  -> file-centered evidence-context builder
  -> configured TavernKeeper contextual review model
  -> validated per-finding assessments
  -> Technical Report and Preferred Index V5
  -> verified TavernKeeper Pages deployment
  -> input-free Tavernary wake
  -> Tavernary validates and imports the bound V5 report
  -> Luna strict-JSON repository-level synthesis
  -> deterministic evidence-floor and citation validation
  -> tracked Tavernary assessment snapshot
  -> exact-commit Tavernary deployment
  -> final card color, concise panel, report link, and history
```

Both repositories also reconcile every six hours so a missed notification
cannot permanently lose work. Cross-repository wake events are notifications,
not trusted data planes.

### 7.1 Targeted staff scan

Tavernary exposes a staff-only workflow accepting one exact GitHub repository
URL. It normalizes the URL, resolves it to an active eligible source and
immutable repository ID, refreshes the target SHA, publishes the manifest, and
wakes TavernKeeper. TavernKeeper refetches that manifest and uses the same
production scanner, contextual reviewer, publisher, and Tavernary importer as
ordinary work.

No repository is hardcoded as a canary or allow-listed scanning target. A
targeted request receives queue priority and remains an intentional forced
rescan when created after a prior report.

### 7.2 SHA churn

Before acquisition begins, queued work coalesces to the manifest's newest SHA.
After exact-SHA acquisition begins, TavernKeeper finishes that immutable SHA
even if the repository advances. Tavernary may publish the completed result and
mark it stale; normal churn does not invalidate an otherwise complete report.

### 7.3 Cross-repository identity binding

Every Tavernary assessment binds all of the following:

- Tavernary source ID
- GitHub provider and immutable repository ID
- Canonical repository full name
- Exact target SHA
- TavernKeeper report ID and report digest
- Scanner-policy, context-policy, ecosystem-context, and report-schema versions
- TavernKeeper review model identifier
- Tavernary synthesis-policy and model identifiers

A mismatch at any layer fails import or synthesis and cannot update the card.

## 8. Backlog and scheduling

The ordinary queue is derived from Tavernary's live target manifest,
TavernKeeper's preferred V5 index, and secret-free retry state. It is not a
second hand-maintained database.

Each batch contains at most five repositories. Repository scan jobs use bounded
concurrency because individual repositories may be large. Work is prioritized:

1. Current Tavernary Top 30 projects
2. New submissions first cataloged after coverage begins
3. Older eligible projects

Within a lane, older pending work comes first. An age boost prevents starvation
without removing lane identity. Due retries return to their source lane.
Staff-targeted requests receive priority but do not bypass an active circuit
breaker or target retry protection.

There is no arbitrary repository-size admission gate and no guessed per-project
token cap. Large projects are split into evidence-oriented model requests while
preserving complete scanner and candidate coverage. If complete assessment
cannot be achieved, the repository fails cleanly and publishes nothing.

The ordinary backlog remains staff-paused through implementation and initial
canary validation.

## 9. Exact-SHA acquisition and isolation

Each target runs in a fresh GitHub-hosted job and disposable directory.
TavernKeeper:

- Resolves validated `owner/repository` coordinates from the immutable
  repository ID.
- Fetches only the history required by policy and checks out the exact SHA.
- Disables hooks, credential helpers, interactive prompts, Git LFS smudging,
  submodules, recursive cloning, and local filesystem protocols.
- Never runs target dependencies, scripts, Actions, tests, builds, binaries,
  containers, package managers, or install hooks.
- Rechecks that `HEAD` equals the requested SHA before assessment finalization.
- Removes the checkout when the disposable job ends.

Target content is untrusted data. File names, metadata, source, README text, and
scanner output cannot become commands, workflow expressions, report paths, or
HTML.

## 10. Inventory and coverage

Inventory precedes scanners and records every safe current-tree entry, byte
count, type, role, and content digest. It rejects path traversal, absolute
paths, portable-name collisions, unsafe links, and entries that cannot be
represented safely.

Inventory classifies dependency lockfiles, vendored dependencies, generated
bundles, minified files, binaries, archives, oversized files, tests, fixtures,
documentation, tooling, and first-party production text. Scanner-specific
exclusions remain visible as counts and bytes. Exclusion from one scanner never
implies exclusion from inventory or every scanner.

Protective tool runtime and output ceilings remain. Exceeding a ceiling fails
the scan rather than silently reducing coverage. A report may publish only when
every required applicable scanner and every contextual assessment completed.

## 11. Deterministic scanner layer

The required scanner policy initially includes:

1. TavernKeeper structural and data-flow candidate rules
2. Gitleaks over the current tree and up to twenty recent commits
3. OpenGrep with TavernKeeper-owned pinned rules
4. OSV-Scanner for supported manifests and lockfiles without installing
   dependencies
5. zizmor for applicable GitHub Actions workflows
6. Malcontent in a digest-pinned, network-disabled, read-only, capability-free
   trusted container

A scanner may return `not-applicable` only when inventory proves it has no
valid inputs. Missing tools, malformed output, timeout, output-limit failure, or
unexpected exit is failure rather than `not-applicable`.

Scanner severities are evidence attributes, not final risk grades. Scanner
matches must remain visible even when contextual review concludes that the
behavior is expected.

### 11.1 Rule-quality requirements

Candidate rules must be specific enough to point the reviewer at meaningful
evidence. Known false-positive classes become regression fixtures. In
particular:

- Startup-file rules distinguish actual shell startup paths from property names
  such as `profile.profileId`.
- Dynamic-execution rules distinguish operating-system process APIs from
  ordinary methods such as `RegExp.exec()`.
- Credential-transmission rules identify a plausible sensitive source and
  network or persistence sink instead of treating any credential keyword and
  any `fetch()` in the same file as exfiltration.
- Secret rules retain test/fixture role information so dummy material can be
  judged in context.

Contextual review is not an excuse to preserve obviously defective patterns.
Deterministic rules and model assessment improve independently.

## 12. Normalized candidate evidence

Every accepted scanner match becomes a normalized candidate containing:

- Stable candidate and evidence fingerprints
- Scanner name, version, rule ID, and scanner-supplied severity/confidence when
  available
- Trusted category and rule description
- Portable path and verified line range
- File role: production, test, fixture, documentation, tooling, generated,
  vendored, or unknown
- Sanitized source/sink, package/advisory, workflow, or history evidence
- Optional related candidate IDs

Raw secrets are replaced by type, length, and a nonreversible evidence digest.
Raw target prose, arbitrary URLs, ANSI, HTML, bidirectional controls, and
unvalidated scanner fields are never copied into public records or trusted
prompts.

Deduplication may group equivalent scanner matches but never drops provenance.
The report preserves every contributing scanner and evidence fingerprint.

## 13. Evidence-context builder

TavernKeeper groups candidates by file for contextual review. A request includes
all candidates in that file plus the minimum surrounding evidence needed to
understand behavior:

- Enclosing function, class, or module scope
- Relevant imports, local constants, configuration, and manifest declarations
- Direct callers, callees, data sources, transformations, and destinations
- Production/test/fixture/documentation/tooling classification
- Project README and manifest purpose in bounded sanitized form
- Other findings in the same file and directly related cross-file definitions
- For history findings, the flagged historical evidence SHA and bounded file
  context from that revision rather than an unrelated current-tree version
- Repository identity, exact SHA, project kind, and scanner coverage summary
- The trusted versioned ecosystem context

The model reviews a file group rather than an isolated line or one finding per
call. This provides context and avoids duplicated calls. If a file group exceeds
the provider context window, TavernKeeper splits it by coherent code scope while
repeating the project and file context needed to assess every candidate.

No fixed token estimate decides whether a project deserves complete review.
Every candidate must receive a valid assessment. Unresolved context causes
bounded expansion and retry; it never becomes a low-risk default.

## 14. Ecosystem context

`ecosystem_context_version` identifies a TavernKeeper-owned, reviewed context
document supplied as trusted policy rather than repository content. It tells
the reviewer:

- These are open-source AI-roleplay and SillyTavern-adjacent community projects.
- Many are hobbyist, AI-assisted, or vibe-coded in good faith and may have
  imperfect security practices.
- Legitimate extensions may read host state, intercept generations, store
  configuration, handle model-provider credentials, call external APIs, modify
  UI, and persist settings.
- Capability, security weakness, or a suspicious keyword is not by itself
  evidence of malicious intent.
- Rare genuine threats have included API-key phishing or theft, credential
  exfiltration, trojan packages, concealed execution, harmful persistence,
  bot infection, and malicious update behavior.
- Popularity, reputation, community affection, and open source availability are
  not proof of safety.

The reviewer evaluates whether behavior is proportional to the stated project
purpose, disclosed to users, directed to expected destinations, executed at an
expected time, and implemented without suspicious obfuscation or persistence.

Repository content is explicitly delimited as untrusted data and cannot change
the system policy, output schema, assessment vocabulary, or reviewer role.

## 15. TavernKeeper contextual review

### 15.1 Model-agnostic adapter

TavernKeeper uses an OpenAI-compatible chat-completions boundary with
configurable endpoint, authentication header, model identifier, timeout, and
transport settings. No provider or model name is hardcoded into report schemas
or scanner logic.

The expected first release configuration uses NanoGPT and
`deepseek/deepseek-v4-flash-0731:thinking`. A different compatible model may be
selected through reviewed configuration without changing evidence or report
contracts. TavernKeeper does not silently switch models within one report.

The adapter requests a single structured object per file group. It may extract
one JSON object from a model response, but the result must pass the complete
local schema and evidence validator. Malformed or incomplete output enters the
retry path. Hidden reasoning and provider-specific thinking fields are neither
stored nor published.

### 15.2 Per-finding assessment contract

Every deterministic candidate receives exactly one contextual assessment with:

- Candidate ID and cited evidence IDs
- `disposition`: `expected_behavior`, `minor_weakness`,
  `material_vulnerability`, or `credible_malicious_behavior`
- `impact`: `none`, `low`, `medium`, `high`, or `critical`
- `exploitability`: `unlikely`, `plausible`, or `readily_exploitable`
- `confidence`: `low`, `medium`, or `high`
- Recommended item risk: `low`, `material`, or `high`
- Concise technical explanation
- Concise layman's explanation
- Recommended developer action, including `none` when appropriate
- Exact supporting file and line references

`needs_more_context` is a control response, not an assessment. TavernKeeper
expands or restructures the context and retries. If the item remains unresolved,
the scan is incomplete and no report publishes.

The model may add a directly related contextual observation only when it cites
an exact supplied file/line range and explains its relationship to a scanner
candidate. TavernKeeper validates and stores these separately from scanner
matches; the model cannot invent uncited repository facts.

### 15.3 Item-risk semantics

- `low`: expected behavior or a minor hardening issue without meaningful user
  danger
- `material`: a credible, plausibly exploitable weakness that could harm users
  but probably does not represent malicious intent
- `high`: high-confidence credible malicious behavior, or a high-confidence
  critical flaw that is readily exploitable in the shipped runtime path

Intent and technical impact are separate. A severe accidental vulnerability may
be high risk without being labeled malicious. A suspicious-looking capability
may be low risk when its data flow and purpose are expected.

## 16. Technical Report and Index V5

### 16.1 Technical Report V5

V5 is the only accepted contextual-report contract. It contains:

- `schema_version: 5`, report ID, report digest, and supersession identity
- Source ID, provider, repository ID/name, canonical URL, and exact SHA
- Completion time and current-tree/history coverage
- Scanner, rule-catalog, inventory, context, ecosystem, prompt, and schema
  versions
- Contextual model and provider identifiers without credentials
- Every required tool's version and completed/not-applicable state
- All normalized candidates and contributing evidence
- Every validated per-finding assessment and contextual observation
- Counts by disposition, impact, exploitability, confidence, and item risk
- Sanitized limitations and model-independent coverage facts

Report identity is a digest of its canonical identity and content. JSON and
script-free HTML use immutable paths under:

```text
/reports/github/{repository_id}/{target_sha}/{scanner_policy_version}/{report_id}/
```

The report is the complete technical evidence record. It does not contain a
Tavernary project grade, hidden chain of thought, raw secret, raw scanner dump,
or raw model response.

### 16.2 Preferred Index V5

The public preferred index contains the minimum discovery projection needed to
locate and validate a repository's newest technical report: immutable identity,
exact SHA, policy versions, report ID/digest, counts, report URL, and technical
history URL.

Tavernary validates the index, then fetches a newly preferred immutable V5
report for deterministic assessment and optional narrative enrichment. Full
finding records are not hydrated into the public catalog bundle. Tavernary
stores only its bounded final card projection and assessment history.

### 16.3 Contract evolution

Report and index V1-V4 were development contracts and are not accepted by the
new importer. V4 scanner-only reports for Recursion and Wandlight are removed
from the current public index and Pages output. There is no compatibility matrix
or reinterpretation of those grades.

The Tavernary target manifest remains V2 because its identity contract is
independent and unchanged. Future report-contract changes require a new schema
version and a coordinated reader-before-writer rollout.

## 17. Tavernary repository-level assessment

Tavernary first derives `risk_level` and `danger_basis` from the validated V5
assessments and observations. It then gives Luna those assessments, counts,
project identity, exact SHA, and the required deterministic project advisory.
Luna does not receive target credentials, model-provider secrets, raw secret
values, hidden reasoning, or an unbounded repository corpus. It enriches the
already reviewed evidence; it does not replace TavernKeeper's source-context
review or select the project color.

The strict-JSON output contains:

- Required `risk_level`: `low`, `material`, or `high`, exactly matching the
  deterministic project advisory
- Plain-language headline and one- or two-sentence concise summary
- Minor-caution, material-concern, and high-danger counts
- A concise malicious-evidence statement
- Finding IDs supporting every material claim
- Optional interaction chains explaining relationships without changing risk
- TavernKeeper report ID and exact SHA

### 17.1 Deterministic project advisory

Tavernary calculates the exact grade before accepting Luna's output:

- A high-confidence `credible_malicious_behavior` assessment creates a `high`
  floor.
- A high-confidence critical and readily exploitable vulnerability creates a
  `high` floor even without malicious intent.
- Any other contextualized material vulnerability creates a `material` result.
- Expected behavior and minor weaknesses remain within the `low` range.

Green findings never cancel orange or red evidence. Luna may not raise or lower
the result. If combined evidence creates immediate danger, TavernKeeper must
emit a bound observation that itself meets the immediate-danger predicate.

Schema, citation, count, deterministic-risk, and identity validation occurs
after synthesis. Invalid output retries; if it remains invalid or the provider
is unavailable, Tavernary publishes fixed deterministic copy and records a
nonblocking narrative-enrichment incident.

## 18. Publication and atomicity

TavernKeeper scan jobs sanitize their candidate, encrypt it with AES-256-GCM,
upload only the ciphertext as a short-lived artifact, and delete plaintext
handoff files. A serialized publisher decrypts in ephemeral storage, validates
the entire batch, renders V5 JSON and script-free HTML, updates technical
history and the preferred index atomically, and pushes through the Publisher
App. Partial writes are rolled back before push.

Pages deploys only an exact commit proven to be on TavernKeeper `main`. After
the report, index, and deployment digests are verified, TavernKeeper wakes
Tavernary.

Tavernary imports only reports from the configured TavernKeeper origin and
valid immutable path. It validates identity, SHA, policy, digest, schemas,
counts, citations, and URLs before optional narrative enrichment. Every valid
report receives a deterministic tracked assessment and remains eligible for
the Tavernary card. Synthesis failure never removes a report from the preferred
set; it publishes policy-owned fallback copy instead.

Cross-repository publication cannot be one transaction, so each boundary is
idempotent and fail-closed. A failure never overwrites the last valid tracked
assessment.

## 19. Card, panel, report, and history experience

### 19.1 Scan icon placement

The scan icon appears immediately after the project's last title character,
inline with the title. The title yields enough space for the icon before
ellipsis clipping. A shield is not used because the interface does not imply a
safety guarantee.

### 19.2 Interaction and concise panel

Hover, keyboard focus, and click/tap expose the same anchored panel. The exact
heading is:

```text
TavernKeeper Scan Results
```

For an assessed project, the panel contains:

- `Low concern`, `Material concern`, or `Immediate danger`
- Tavernary's one- or two-sentence layman's summary
- A qualifier such as `3 minor cautions` or `No material concerns`
- Exact scanned SHA source-tree link, completion date, assessment date, and
  current/stale wording
- `View full report`
- A compact final-assessment history strip and `View scan history` link only
  when at least two assessments exist

The `malicious_evidence` field remains part of Tavernary's synthesis and data
contract, but the concise card panel does not render that longer statement.

The panel does not list every technical scanner match. Eligible unassessed
projects state that TavernKeeper has not scanned the project. Unsupported
projects state that TavernKeeper does not support the source or project type.

### 19.3 Full technical report

The report begins with approachable counts for scanner matches reviewed,
expected behavior, minor cautions, material concerns, and high danger. Material
and high-danger findings appear first. Expected or benign matches remain
available under a collapsed `Reviewed scanner matches - expected behavior`
section rather than being hidden.

Each finding presents, in order:

1. Plain-language conclusion
2. Why a scanner noticed it
3. Contextual security assessment
4. Possible effect on users
5. Recommended developer action
6. Exact GitHub file/line link
7. Deterministic scanner and evidence metadata

Coverage, policy, tool, and model metadata follow the user-facing explanation.
The report identifies the assessment as automated and explains its limitations.

### 19.4 History

TavernKeeper retains immutable technical-report history. Tavernary retains
immutable final-assessment history, and the compact card strip represents only
Tavernary's final contextual risk levels. The panel omits both the strip and its
history link when only one assessment exists, then shows them from the second
assessment onward. Every history point links to its exact TavernKeeper report
and scanned SHA.

`View scan history` links to Tavernary's final-assessment history page at
`/security/tavernkeeper/history/{source_id}/`. That page lists the final grade,
plain-language summary, assessment time, exact scanned SHA, policy/model
identity, and TavernKeeper report link for each completed assessment. The
TavernKeeper report separately links its technical-report history.

A forced same-SHA rescan creates a new report and assessment with its policy and
model versions; it may become preferred without erasing valid prior history.
The Recursion and Wandlight V4 development reports are a one-time exception:
they are removed rather than preserved as public history because they were not
contextual assessments under this design.

### 19.5 Performance and accessibility

Cards hydrate only the compact Tavernary projection. Full V5 evidence is fetched
by workflows, not browsers. History strips are bounded. The control includes an
accessible name with risk and freshness, visible focus, sufficient contrast,
reduced-motion support, keyboard parity, and mobile tap behavior. Mobile Safari
acceptance proves no layout takeover, clipping regression, scroll lock, or
material input delay.

## 20. Failure, retry, and circuit breaker

No degraded or partial report or assessment is published.

Failure includes incomplete scanner coverage, inventory error, unresolved model
context, provider timeout, token exhaustion, malformed model output, missing
assessment, invalid evidence citation, schema mismatch, floor violation,
publisher failure, and Tavernary synthesis or deployment failure.

After an initial failure, transient failures retry at approximately T+1, T+2,
and T+3 hours. Intermediate failures notify neither project owners nor staff.
If the third delayed retry fails, TavernKeeper creates or updates one
deduplicated operational incident for TavernKeeper staff. External project
owners do not receive operational-failure notices.

Repository-specific failures delay only that target. A systemic provider,
token, scanner, contract, authentication, state, or publication failure stops
ordinary scanning and engages the circuit breaker. Scanning remains stopped
until staff correct the cause and explicitly resume it. A failed targeted scan
does not bypass the breaker.

If TavernKeeper fails before V5 publication, nothing new is published. If
Tavernary Luna or import fails, the last valid assessment remains visible and
stale; a project without a prior valid assessment remains gray and unassessed.
No deterministic-only or template-only fallback is allowed.

## 21. Threat model and model safety

TavernKeeper assumes a target may contain malicious paths, enormous files,
archives, symlinks, secrets, prompt injection, terminal controls, scanner
exploits, and content crafted to corrupt reports, models, or workflows.

Controls include:

- Disposable exact-SHA jobs and no target execution
- Minimal network exposure and no repository write credentials in scan jobs
- Pinned trusted scanner tools and TavernKeeper-owned configuration
- Portable-path validation and bounded tool inputs/outputs
- Secret redaction before model calls, logs, artifacts, and reports
- A trusted system policy with repository text delimited as untrusted data
- No tools, shell, repository writes, or privileged actions available to the
  contextual model
- Strict schemas, enumerations, citation requirements, and evidence binding
- No execution or publication of model-generated commands, paths, or URLs
- Sanitized typed adapters rather than raw scanner/model-output publication
- Encrypted inter-job candidates and serialized Publisher App writes
- Hardened Tavernary fetching, digest validation, and atomic snapshot updates
- Staff-only target requests, bounded batching, coalescing, retries, and circuit
  breaker

Model confidence is not trusted by itself. A result becomes public only through
the evidence, schema, identity, and floor validators surrounding both model
stages.

## 22. Workflow responsibilities

### 22.1 Tavernary workflows

1. Build, validate, and publish the V2 exact-SHA target manifest.
2. Wake TavernKeeper when eligible sources change.
3. Resolve a protected staff-entered GitHub URL to an eligible repository ID,
   refresh its manifest entry, and send a targeted hint.
4. Import and validate the V5 preferred index and newly preferred reports.
5. Run Luna synthesis for complete unseen report identities.
6. Enforce evidence floors and validate strict output.
7. Commit the bounded final assessment snapshot through Tavernary's trusted
   publication path and deploy the exact commit.
8. Reconcile on schedule when wakes are missed.

### 22.2 TavernKeeper workflows

1. Reconcile on an input-free wake, schedule, or protected staff operation.
2. Resolve at most five queued repositories with bounded scan concurrency.
3. Acquire exact SHAs, inventory trees, and prepare scanner inputs.
4. Run every required applicable deterministic scanner.
5. Normalize candidates and build file-centered evidence contexts.
6. Run and validate contextual model assessments for every candidate.
7. Build and validate Technical Report and Preferred Index V5.
8. Encrypt candidate artifacts and serialize publication.
9. Deploy and verify TavernKeeper Pages.
10. Wake Tavernary and optionally continue the derived backlog.
11. Maintain pause, retry, circuit-breaker, and policy-campaign state.

Each repository remains a standard independent repository using ordinary
short-lived feature branches and pull requests. The architecture does not
depend on permanent dual branches or a shared monorepo.

## 23. Observability

Secret-free telemetry records:

- Queue lane, wait age, batch size, and scan concurrency
- Repository ID and exact SHA
- Inventory files/bytes, roles, and exclusion totals
- Per-tool duration, status, version, and candidate counts
- Context groups, retries, unresolved-context state, and validated assessment
  counts without source text
- Scanner, report, ecosystem, context, prompt, and synthesis policy versions
- Model/provider identifiers, duration, and token usage without prompts or raw
  responses
- Disposition, impact, confidence, and risk counts
- Retry class, attempt number, circuit state, and oldest backlog age
- Publisher commit, Pages deployment, Tavernary import, synthesis, and deployed
  assessment identity

Raw source, prompts containing source, raw scanner output, raw model output,
secrets, credentials, and decrypted candidate artifacts never enter logs or
telemetry.

## 24. Testing and acceptance

### 24.1 Deterministic and contextual fixtures

Automated fixtures must distinguish:

- `profile.profileId` from shell startup-file modification
- `RegExp.exec()` from operating-system command execution
- Dummy test credentials from deployable secrets
- Expected model-provider requests from credential exfiltration
- Minor credential-storage or browser-boundary weaknesses
- Material vulnerabilities such as unsafe message origins or exploitable
  injection
- Secret transmission to unrelated endpoints
- Concealed payload execution, trojan installers, and bot persistence
- README or source prompt injection attempting to override reviewer policy
- Duplicate findings and one behavior reported by several scanners

Tests cover inventory, adapters, normalization, role classification, evidence
context, context splitting, schema parsing, `needs_more_context`, exact
citations, related observations, count invariants, floor enforcement, summary
bounds, and report identity.

### 24.2 Failure and contract fixtures

Tests cover missing context, malformed output, unsupported enumerations, uncited
claims, quota/token exhaustion, provider timeout, retry exhaustion, circuit
breaking, incomplete scanners, stale SHAs, duplicate reports, same-SHA rescans,
publisher rollback, invalid origins, redirects, digest mismatch, and atomic
Tavernary snapshot preservation.

V5 is the only accepted report/index schema. Tests prove V1-V4 cannot update
Tavernary. Target Manifest V2 remains independently valid.

### 24.3 Interface fixtures

Tavernary tests low/teal, material/orange, high/red, gray, unsupported,
current, and stale states. UI tests cover inline icon placement, title clipping,
clock marker, exact panel copy, bounded summaries, history strip, SHA/report
links, keyboard, touch, focus, reduced motion, and mobile Safari.

### 24.4 Release gates

Both repositories run their complete lint, typecheck, unit, integration, build,
workflow-policy, and static-export checks. TavernKeeper also runs pinned real-
tool smoke tests and verifies that hostile fixtures and secret values do not
appear in generated output.

The contextual models are tested through controlled contract fixtures and the
real configured endpoints. Deterministic doubles may prove error paths, but the
release pipeline is not accepted solely from mocked model responses.

## 25. Migration and initial rollout

The first implementation milestone is a hard public reset of the invalid
scanner-only canaries:

1. Remove Recursion report SHA
   `1bce1fa73fe6c0fe8e767c773a832b94bb336720` and Wandlight report SHA
   `2d4f818c2ad5855b0faff387d88c3f64479865c6` from TavernKeeper's current
   published index, report output, and public history.
2. Remove their imported V4 summaries and history from Tavernary.
3. Deploy Tavernary with both projects visibly gray and `Not assessed`.
4. Verify that neither old report URL is served or linked by the live sites.

Git commit history and retained GitHub Actions logs are not rewritten; they
remain development provenance. The results, grades, and report pages disappear
from the current public product. They do not become neutral legacy points.

After the reset:

1. Implement and deploy Tavernary's V5 reader, Luna synthesis, evidence floors,
   and updated card projection.
2. Implement TavernKeeper's evidence-context builder, contextual model review,
   V5 report, and V5 preferred index.
3. Run Recursion through Tavernary's general targeted GitHub-URL action and the
   complete automated production path.
4. Run Wandlight through the same path.
5. Verify each technical report, layman's summary, final color, exact SHA,
   freshness, panel, accessibility, links, and first history entry live.
6. Resume ordinary Top-30/new/old scanning only after both canaries pass.

The canaries are expected to prove that benign extension behavior can remain in
the broad teal range while genuine weaknesses stay visible. Acceptance does not
hardcode a desired color or suppress credible evidence.

## 26. Definition of done

This design is complete when:

1. The invalid Recursion and Wandlight V4 reports are absent from both public
   products and both cards initially show `Not assessed`.
2. Tavernary publishes eligible exact-SHA targets and staff can prioritize one
   eligible repository using its exact GitHub URL.
3. TavernKeeper safely scans the exact SHA with every required deterministic
   tool without executing target code.
4. Every candidate receives complete file-centered contextual assessment under
   the versioned ecosystem policy.
5. Technical Report and Preferred Index V5 preserve normalized evidence and
   validated per-finding judgments without raw secrets or hidden reasoning.
6. Tavernary Luna produces a strict, cited project assessment that passes
   deterministic evidence floors.
7. No partial, truncated, unresolved, malformed, or model-free fallback report
   can update either public surface.
8. Publisher App writes, Pages deployment, wake events, Tavernary import, and
   deployment work with least privilege and opaque installation tokens.
9. Tavernary presents risk and freshness separately through the inline scan
   icon, concise panel, exact-SHA links, full report, and contextual history.
10. Production has no manual review or dismissal gate, while staff retain
    protected trigger, pause, resume, retry, and global policy controls.
11. Recursion and Wandlight pass the complete live V5 path and establish their
    first valid contextual history entries.
12. The ordinary five-repository batches can resume in Top-30, new-submission,
    and older-project priority order without arbitrary size or token gates.

## 27. References

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
