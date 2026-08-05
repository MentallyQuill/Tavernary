# TavernKeeper Immediate-Danger Policy and Red-Publication Design

- **Status:** Proposed for review; product direction approved
- **Date:** 2026-08-04
- **Canonical location:** Tavernary
- **Repositories:** `MentallyQuill/Tavernary` and
  `MentallyQuill/TavernKeeper`

This design supersedes the color-selection and synthesis-publication rules in
sections 4.2, 15.3, 17, 17.1, and related acceptance language of the
2026-07-31 cross-repository security design. Implementation must update that
canonical design, both repositories' public policy documentation, and
operations guidance so the repository does not retain two contradictory risk
definitions.

## 1. Decision

Red will mean **immediate user danger at the exact scanned commit**. It will not
mean that a scanner found a dependency advisory whose upstream severity is
critical.

Tavernary and TavernKeeper will use these public levels:

- **Low concern / teal:** the completed review did not identify a material
  security concern. This is not a safety certification.
- **Material concern / orange:** the review identified a credible weakness,
  suspicious behavior with unresolved applicability, or a vulnerability that
  deserves user attention but does not meet the immediate-danger threshold.
- **Immediate danger / red:** strong evidence shows that installing or using
  this exact commit presents an immediate danger. Users should not install or
  use it until the danger is resolved.
- **Not assessed / gray:** no complete, current assessment is available.

Red is an action recommendation, not a synonym for maliciousness. Every red
result must separately identify its danger basis as one of:

- `malicious_or_compromised`: high-confidence evidence of deliberately harmful
  or compromised behavior;
- `critical_exploitable_vulnerability`: a high-confidence, critical-impact
  vulnerability that is readily exploitable in the shipped project;
- `mixed`: both bases are present.

The public label and text must distinguish these bases. A non-malicious but
immediately exploitable vulnerability may be red. A critical dependency
advisory without demonstrated shipped reachability and ready exploitability is
not red.

## 2. Why the current behavior is wrong

TavernKeeper contextual policy 1 permits any `material_vulnerability` to carry
`recommended_risk: high`. The TavernKeeper report directory then colors the
entire project red when any item has that recommendation.

Tavernary applies a stricter project evidence rule: high requires
high-confidence credible malicious behavior, or a high-confidence critical and
readily exploitable material vulnerability. Its prose-synthesis model returned
high for four reports that did not satisfy that rule. Tavernary rejected the
unsupported escalation and quarantined the synthesis result, so the projects
did not appear as assessed cards even though their technical reports were
public.

This creates both product failures the policy must prevent:

1. dependency advisory severity can overstate ordinary community-extension
   risk and desensitize users to red; and
2. a valid future red technical report can disappear from Tavernary because a
   secondary prose-generation step failed.

## 3. Policy invariants

The implementation must enforce all of these invariants:

1. Scanner severity locates evidence; it never directly selects a public color.
2. Project risk is deterministic and cannot be raised or lowered by prose
   synthesis.
3. A valid report meeting the immediate-danger rule always publishes on
   Tavernary, even when model synthesis is unavailable or invalid.
4. Red never automatically hides, quarantines, delists, or downranks a project.
   Visibility is necessary for community awareness. Moderation remains a
   separate human-reviewed process.
5. Red always includes a public danger basis. Users can distinguish a malicious
   or compromised project from a non-malicious exploitable flaw.
6. Teal never says safe, trusted, clean, certified, or verified.
7. Every assessment remains bound to an immutable repository ID and exact
   commit SHA.
8. Invalid report identity, digest, schema, or evidence binding still fails
   closed. The no-hide guarantee begins only after Tavernary has validated the
   technical report itself.

## 4. Deterministic decision table

The same pure decision table will be covered by fixtures in both repositories.
It evaluates TavernKeeper assessments and observations after their V5 schema
and evidence bindings have been validated.

| Evidence at the scanned commit | Project level | Danger basis |
| --- | --- | --- |
| At least one `credible_malicious_behavior` item with `confidence: high` | red / immediate danger | `malicious_or_compromised` |
| At least one `material_vulnerability` item with `confidence: high`, `impact: critical`, and `exploitability: readily_exploitable` | red / immediate danger | `critical_exploitable_vulnerability` |
| Both qualifying forms | red / immediate danger | `mixed` |
| Other contextualized material vulnerabilities or unresolved suspicious security behavior | orange / material concern | `none` |
| Expected behavior and minor weaknesses only | teal / low concern | `none` |

A model-generated interaction chain may explain related findings, but it may
not independently elevate a project to red. If combined evidence truly creates
immediate danger, TavernKeeper's contextual reviewer must emit a bound
observation that itself satisfies the decision table.

For dependency advisories, `critical` upstream severity is insufficient on its
own. Red requires evidence that the affected version is present in the shipped
project, the vulnerable path is reachable in the SillyTavern extension's real
runtime role, an attacker or untrusted input can exercise it, and exploitation
can cause critical user harm without speculative prerequisites. Failure to
establish that chain produces orange or teal according to the remaining
evidence.

## 5. TavernKeeper changes

### 5.1 Contextual policy 2

TavernKeeper will introduce contextual-review policy 2 and prompt
`contextual-review-v2`. Scanner policy remains version 3 because scanner
selection and execution do not change. Technical Report and Preferred Index
remain V5 because the existing fields already carry the correlated
disposition, impact, exploitability, confidence, and recommendation needed by
the rule.

The prompt and validated contract will require:

- `recommended_risk: high` only for an item meeting the immediate-danger
  decision table;
- `credible_malicious_behavior` only when confidence is high;
- non-qualifying `material_vulnerability` items to use
  `recommended_risk: material`;
- explicit examination of dependency role, shipped version, runtime
  reachability, attacker control, and concrete harm; and
- no inference from scanner or advisory severity alone.

The validator, not prompt compliance alone, enforces these rules. Invalid model
output receives the existing bounded repair attempts and otherwise fails the
scan rather than publishing a policy-contradictory report.

### 5.2 Report-site presentation

The reports landing page, history, and report summaries will use
`Low concern`, `Material concern`, and `Immediate danger`. Red cards and report
headers will state the derived danger basis. Finding-level technical severity
and advisory data remain visible; they are not relabeled or discarded.

The landing filter currently described as the highest recommendation will be
defined by the deterministic project decision. This prevents an upstream
critical advisory from branding the project red while preserving the advisory
inside the full report.

### 5.3 Targeted queue priority

The existing Tavernary targeted-scan workflow is the authorized requeue path.
It resolves an exact published GitHub URL to an immutable repository ID,
refreshes the target SHA, and dispatches only that ID to TavernKeeper.

TavernKeeper currently marks these entries `staff_requested` but schedules all
due entries by ticket only. Batch planning will sort due staff-requested entries
before ordinary entries while retaining ticket order within each group. Staff
requests still respect an emergency pause, active-scan coalescing, retry delay,
and the global maximum batch size.

### 5.4 Policy documentation

TavernKeeper's README, architecture, operations, report-site advisory copy, and
versioned contextual-policy documentation will define red as immediate danger
and explain dependency reachability. Any language equating the maximum scanner
or advisory severity with the project level will be removed.

## 6. Tavernary changes

### 6.1 Deterministic color and danger basis

Tavernary will derive `risk_level` and `danger_basis` from the validated V5
report using the decision table. The synthesis provider will no longer choose
the project color. Its job is limited to bounded headline, summary, explanatory
counts, citations, malicious-evidence wording, and interaction explanations.

The tracked Tavernary summary contract will store the deterministic danger
basis so UI code never infers maliciousness from color or free-form prose. The
summary policy/schema version will be bumped and existing low/material entries
will migrate with `danger_basis: none`; there are no currently published high
Tavernary summaries to migrate.

### 6.2 Nonblocking narrative fallback

For every valid V5 report, Tavernary first constructs a safe deterministic
assessment. It then attempts optional model synthesis. A valid model response
may replace only the explanatory prose and cited interaction detail. It cannot
replace the deterministic color or danger basis.

If synthesis returns invalid output, times out, is rate limited, is
unavailable, or fails its provider-security boundary, Tavernary will publish
the deterministic assessment instead of omitting the report. Fallback copy is
fixed policy-owned text and includes:

- the deterministic public level;
- the exact danger basis for red;
- the validated finding counts;
- a statement that the detailed generated summary was unavailable; and
- a link to the complete TavernKeeper technical report.

Synthesis failures may remain visible to maintainers as nonblocking enrichment
incidents and may be retried. They must not remove the report ID from
`preferred_report_ids`, suppress its card status, or prevent site deployment.
The existing four blocking `unsupported_escalation` quarantines will resolve
when their obsolete reports leave the TavernKeeper preferred index.

### 6.3 Public card copy

The scan popover will use:

- `Low concern`
- `Material concern`
- `Immediate danger`

For red, it will add a dedicated `Danger basis` row with human text for
malicious/compromised behavior, a critical readily exploitable vulnerability,
or both. Material reports continue to show advisory and finding details without
implying malware. The About page will document the same policy and state that
red projects remain listed to provide community awareness.

Tavernary's canonical cross-repository security design, About copy, importer
operations documentation, and maintainer incident language will be updated in
the same change. A synthesis incident will be called a narrative-enrichment
incident rather than a project/report quarantine.

## 7. Exact report reset

The following four current reports were created under contextual policy 1 and
are the complete destructive reset scope:

| Repository | Repository ID | Scanned SHA | Report ID |
| --- | ---: | --- | --- |
| `bmen25124/SillyTavern-Flowchart` | `1073040696` | `b7c091b0ba227df5913453c311bdf264d7c454be` | `26739aff81e20755a030668422b0905530cf33daa868f00849dca2a0c7d17ff3` |
| `AventurasTeam/Aventuras` | `1126279204` | `babb1a0d69288bffafe4ca80fa3ed96847c52229` | `b2e3d941a135807741f81f5598e3fe993c9f6ebc5bd7b513682c8d0a73129f25` |
| `bmen25124/SillyTavern-Character-Creator` | `956654271` | `8ddf5ba08188fa8044469518d540c7dded4db701` | `6fb95c8c0f96125ad3cf0d906f15ae13fa8f436190ae80851d4fcfdbdfababe6` |
| `twitter/twemoji` | `26291683` | `bad3bceeafc901ace42a3dfe0421db6388daafb9` | `4efc45df08f6177f4a0a910e33d8cf1cfeb2ba000fd91ebf161bb6983e378244` |

For each exact identity, the reset removes:

- its entry from `reports/index.json`;
- its immutable `reports/github/<repository-id>/<sha>/3/<report-id>/`
  directory; and
- its corresponding repository-history entry and generated history page. If
  that was the repository's only report, the empty history directory is
  removed.

The generated site is rebuilt from source artifacts; generated `.site` files
are not hand-edited. No other report, queue entry, retry, worktree, or user-owned
file is touched. Git commit history preserves recoverability and the reset is a
dedicated reviewable change.

## 8. Migration and production order

The release is deliberately ordered so no report can be rescanned under the old
policy or disappear behind prose synthesis:

1. Reverify the four exact identities against current TavernKeeper main and the
   live reports index; verify their current Tavernary source IDs, healthy target
   SHAs, quarantine records, and absence from active scans.
2. Pause TavernKeeper through the supported staff operation with a bounded
   policy-migration reason.
3. Implement, review, merge, deploy, and hydrate-verify Tavernary's
   deterministic classification, danger-basis UI, and nonblocking fallback.
4. Implement, review, merge, and deploy TavernKeeper contextual policy 2,
   immediate-danger presentation, and staff queue priority.
5. Commit the exact four-report reset on current TavernKeeper main. Rebuild and
   verify the report site, merge, deploy Pages, and prove the four old report
   URLs and preferred-index entries are absent while unrelated reports remain.
6. Run Tavernary report reconciliation. Verify all four obsolete blocking
   quarantines resolve and the current published snapshot remains valid.
7. Dispatch Tavernary's protected targeted workflow once for each canonical
   repository URL:
   - `https://github.com/bmen25124/SillyTavern-Flowchart`
   - `https://github.com/AventurasTeam/Aventuras`
   - `https://github.com/bmen25124/SillyTavern-Character-Creator`
   - `https://github.com/twitter/twemoji`
8. Verify four exact current-SHA queue entries are accepted with
   `staff_requested: true`, are ordered ahead of ordinary due work, and do not
   duplicate active or queued targets.
9. Resume TavernKeeper and follow all four through scan, policy-2 contextual
   review, publication, Pages deployment, Tavernary import, Tavernary Pages
   deployment, and hydrated live cards.

The expected outcome from the evidence currently visible is orange rather than
red, but acceptance does not hardcode a desired result. Each new report must be
allowed to reach whichever level contextual policy 2 and the deterministic
decision table support.

If a gate fails before resumption, the queue remains paused. Before rescanning,
the dedicated reset commit can be reverted to restore the old artifacts. After
new policy-2 reports exist, recovery is fix-forward; old policy-1 product
results are not silently restored.

## 9. Verification

### 9.1 TavernKeeper automated proof

Tests will cover:

- a critical dependency advisory with only plausible or uncertain runtime
  exploitability produces material, not high;
- only the two immediate-danger evidence forms permit high;
- credible malicious disposition without high confidence is rejected;
- prompt repair cannot bypass the validator;
- landing, history, and report pages label and subtype red correctly;
- staff-requested due entries precede ordinary due tickets without bypassing
  pauses or retry timing;
- the exact reset removes only the four identified reports; and
- all type, unit, formatting, workflow-policy, package, and production-site
  checks pass.

### 9.2 Tavernary automated proof

Tests will cover:

- deterministic low, material, malicious red, vulnerability red, and mixed red
  projections;
- model output cannot raise or lower risk or alter danger basis;
- invalid-output, timeout, rate-limit, provider, and security-boundary synthesis
  failures still publish a valid red preferred summary using fallback copy;
- only invalid technical-report identity, digest, schema, or evidence binding
  remains blocking;
- existing summaries and import incidents migrate without losing unrelated
  history;
- card text and accessible labels distinguish malicious red from vulnerability
  red; and
- unit, type, lint, build, static export, browser, and colored visual coverage
  pass.

### 9.3 Live proof

Completion requires evidence for both repositories' source, merged remote SHA,
Actions checks, exact Pages deployment SHA, fresh public JSON, and hydrated UI.
For each of the four rescans, record:

- current Tavernary target SHA and accepted TavernKeeper queue ticket;
- contextual policy 2, prompt version 2, scanner policy 3, report ID, and report
  digest;
- public technical report and history URL;
- deterministic project level and danger basis;
- Tavernary imported summary identity and freshness;
- live desktop and mobile card/popover behavior; and
- proof that a red result, if any, remains published and visible.

## 10. Definition of done

The migration is complete only when:

1. The four policy-1 red report artifacts are absent from the current public
   TavernKeeper product and remain recoverable through Git history.
2. Contextual policy 2 prevents advisory severity alone from producing red.
3. Tavernary derives color and danger basis deterministically from validated
   report evidence.
4. Every valid future red report publishes on Tavernary even when optional
   synthesis fails.
5. Red public UI distinguishes malicious/compromised behavior from a critical
   readily exploitable vulnerability and never auto-hides the listing.
6. All four projects are requeued at their refreshed exact SHAs and complete
   the normal production scan path.
7. Their new reports, Tavernary assessments, exact-SHA links, freshness, and
   hydrated public UI are verified live.
8. The ordinary queue resumes without losing or mutating unrelated work.
