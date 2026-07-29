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

## Help reports and project-owner requests

The site Help hub (`/help/`) prepares public GitHub reports only after the
visitor reviews the request. Its five ordinary routes are `/help/manage-project/`,
`/help/report-project/`, `/help/report-website/`, `/help/report-kit/`, and
`/help/other/`; `/help/security/` leads only to GitHub's private
`security/advisories/new` flow. Do not put credentials, private personal data,
or unreported Tavernary vulnerability details in an ordinary report.

`project-owner-request` accepts either the current personal GitHub owner of a
listing's verified repository identity or a reviewed Tavernary staff actor.
Staff authority comes from an immutable GitHub user ID in
`data/maintenance/trusted-tavernary-editors.json` plus a current trusted
repository association; association alone does not grant authority. Trusted
staff may request edits for any card, including organization, external, and
disabled records. Rights-holder requests from other actors remain
human-reviewed `project-information` reports. No third-party project support is
provided through Tavernary; refer users to that project's own channel.

An admitted owner request generates or safely updates
`automation/project-owner-request-<issue-number>` and its review PR. The PR is
the sole review surface. A rerun is safe only while marker-owned generated paths
remain unchanged; a maintainer-edited branch is preserved for review instead of
being overwritten. Merge applies the edit/source move/delist; closing without
merge declines the request. Summary or capability edits switch to manual
enrichment so automation cannot overwrite approved editorial content. A
primary-function-only edit preserves the current enrichment policy. This is
separate from `refresh_policy`, which only governs automatic source-evidence
refreshes.

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
   than a separately maintained dropdown. Only Extensions show the
   primary-function dropdown: the submitted Extension primary function is authoritative.
   Frontends receive `frontend` and System Presets receive `preset`
   structurally.
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
   may correct the generated files directly in the PR. An intake model may
   confirm the submitted category or add a sanitized `classification-review`
   mismatch warning, but it never changes `primary_function`.
6. Merging publishes through the normal catalog and Pages path. The PR's
   `Closes #<issue-number>` link closes the intake issue.
7. Closing the generated PR without merging marks the issue
   `submission-declined`, closes it as not planned, and safely removes the
   unchanged automation branch.

If the submitted repository is a fork, Tavernary reviews its immediate
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

Frontends and Extensions require a public GitHub or Codeberg repository.
The code must be visible without signing in, but an open-source license is not
required. External System Presets remain manually curated and use paused source
refresh. Duplicate repository identity is provider-local: a GitHub repository
and a Codeberg repository are not treated as mirrors unless a maintainer curates
that relationship. Arbitrary Forgejo and Gitea hosts are not accepted.
Selecting **Other or not listed**
intentionally pauses admission until that Frontend can be reconciled with the
current catalog vocabulary.

### Website issues

The issue is triaged as a runtime/site issue, not as registry metadata. Standard
PR workflow applies: changes in `src/`, `public/`, or test files, then verify
through normal gates.

### Kits

- Kit creates, author-owned edits, and trusted Tavernary staff edits use
  `05-kit-submission.yml`.
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

Trusted Kit edit authority is recorded as `tavernary-staff` only when the
actor's immutable ID appears in
`data/maintenance/trusted-tavernary-editors.json` and the refreshed issue still
has a trusted association. The final apply workflow re-fetches and revalidates
that actor. A staff edit preserves the canonical Kit author, source issue,
`published_at`, Kit ID, and support snapshot identity; only editable content and
`updated_at` change.

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
