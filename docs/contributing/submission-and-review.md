# Submission and maintainer review flow

Tavernary accepts user-facing intake only through structured GitHub issue forms. No
form publishes records directly.

## Contribution routing

Use the issue chooser and choose the narrowest form:

- **Project submission** - new catalog entry requests.
- **Project information** - corrections for existing catalog records.
- **Website bug** - search, filter, sorting, rendering, and copy issues.
- **Kit submission** - new Kit creation or draft edit.
- **Kit report** - unsafe, duplicate, misleading, or broken Kit concerns.
- **Kit withdrawal** - project author requests to pull their Kit.
- **Other** - non-critical support questions.

Security issues are always handled via `SECURITY.md` private reporting and never
through public issue forms.

## Open issue limit

External GitHub accounts may keep up to 10 open issues in Tavernary at one
time. The limit spans all public issue types; edits and comments do not consume
additional slots. Closing an issue restores one slot immediately.

If an account already has 10 older open issues, Tavernary closes the newer issue
with a neutral explanation. The author may close or resolve another issue and
then reopen the limited issue. New and established GitHub accounts follow the
same rule.

## What happens after submission

### Projects

1. The submitter uses Tavernary's static builder or the native GitHub fallback
   form. The builder's frontend choices come from the current catalog rather
   than a separately maintained dropdown.
2. Automation normalizes the source, updates an automatically generated issue
   title, checks URL and source eligibility, reconciles supported frontends,
   probes public source facts, and checks duplicate URL/repository identity.
3. An obvious duplicate is labeled and closed before a pull request is created.
   A correctable problem remains open with `needs-information` and an exact
   explanation.
4. An admitted issue creates one deterministic branch and one generated review
   PR containing the proposed registry record, initial snapshot when available,
   and any required frontend-vocabulary addition.
5. The generated PR is the sole human review. Maintainers verify the source,
   project type, frontends, factual summary, classification, and warnings. They
   may correct the generated files directly in the PR.
6. Merging publishes through the normal catalog and Pages path. The PR's
   `Closes #<issue-number>` link closes the intake issue.
7. Closing the generated PR without merging marks the issue
   `submission-declined`, closes it as not planned, and safely removes the
   unchanged automation branch.

If the submitted GitHub repository is a fork, Tavernary reviews its immediate
upstream first. Automation reuses an existing open Project submission for that
repository or creates a normal system-authored submission with explicit fork
ancestry provenance. The downstream issue remains open with
`waiting-on-fork-parent`; after the upstream merges or reaches a terminal
declined/unavailable state, the retry workflow resumes the downstream review.
This repeats root-to-leaf for a fork of a fork, one immediate parent at a time.
A terminal upstream does not prevent the child from receiving its own review.

Contributors should edit the issue only until its generated PR exists. Once the
issue carries `submission-pr-open`, corrections belong on the PR so its review
state remains authoritative. Maintainers do not perform a second issue review.

Implementation path:

- `01-project-submission.yml` accepts the stable manifest or readable fallback
  fields.
- `triage-submission.yml` handles idempotent validation, title updates,
  duplicate closure, and dispatch.
- `generate-project-submission.yml` creates or updates
  `automation/project-submission-<issue-number>` and its review PR.
- `project-submission-lifecycle.yml` synchronizes merge or decline back to the
  issue and deletes only the unchanged generated branch.

Fork ancestry changes sequencing, not the review boundary. Every generated
upstream is a normal Project submission and PR; automation never auto-approves
it. Cycles and ancestry beyond 16 repositories stop at
`needs-maintainer-review`.

Frontends and Extensions require an exact public GitHub repository. A System
Preset may use another stable public HTTPS page; external presets remain
manually curated and use paused source refresh. Selecting **Other or not
listed** intentionally pauses admission until that frontend can be reconciled
with current catalog vocabulary.

### Website issues

The issue is triaged as a runtime/site issue, not as registry metadata. Standard
PR workflow applies: changes in `src/`, `public/`, or test files, then verify
through normal gates.

### Kits

- Kit creates and author-owned edits use `05-kit-submission.yml`.
- Kit submissions are prepared by the in-browser builder and serialized into a
  stable JSON manifest on submit. The builder blocks severe language in the
  title and description.
- `triage-kit-submission.yml` validates the latest manifest, including the same
  severe-language policy used by the Kit Builder.
- A valid issue dispatches `apply-kit-submission.yml` automatically. The
  publisher revalidates, writes the registry record, runs repository gates,
  pushes `main`, requests exact-SHA Pages deployment, and closes the issue.
- A correctable validation failure remains open. Edit the issue and automation
  reruns without consuming another issue slot.

The currently published Kit remains unchanged until every publication gate
passes. Near-duplicate composition is a non-blocking warning; exact duplicate
project sets remain invalid.
Withdrawals are submitted with `07-kit-withdrawal.yml` and applied via
`apply-kit-withdrawal.yml`; GitHub identity must match the recorded author.

## Labels and maintainer actions

Issue labels include both queue ownership (`project-submission`,
`project-information`, `website-bug`, `kit-submission`, `kit-report`,
`kit-withdrawal`) and automation state (`needs-information`,
`kit-publication-ready`, `kit-published`, `waiting-on-fork-parent`,
`needs-maintainer-review`, `submission-pr-open`, `submission-declined`).
Project publication still occurs through a maintainer merge; valid Kit creates
and edits publish automatically.

For full Kit maintainer constraints and safety paths, see
[Kit submission and moderation](kits.md) and
[`Kit maintenance`](../maintenance/kits.md).

- Maintainers set effective record state via `visibility`, `visibility_reason`, and
  `metadata_status` in canonical registry files.
- If a record requires temporary hold, they can set `refresh_policy: paused` or hide
  entries via visibility changes and document the reason.
- For repeated source identity failures, the source block is fixed or moved to
  quarantine before public metadata review resumes.

See maintainer operating flow for exact sequencing in
[`../maintenance/operations-runbook.md`](../maintenance/operations-runbook.md).

## Practical review checklist

- Keep contributions to one intent per issue.
- Include evidence links (release notes, announcements, docs, changelog).
- Do not bypass the Project review PR or the reviewed Kit safety-repair path.
- Correct an automatically rejected Kit by editing its open issue.
- Keep generated artifacts deterministic and avoid hand-editing generated files
  outside the approved scripts.
