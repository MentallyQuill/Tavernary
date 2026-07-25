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

## What happens after submission

### Projects

1. The issue is created with the selected form and basic machine checks
   (duplicates, source shape, and required fields).
2. A maintainer validates the issue data against Tavernary rules:
   - Frontends and Extensions require a public GitHub repo.
   - System Presets use approved non-GitHub source types only when policy allows.
   - `id`, `kind`, `summary`, `capabilities`, and `frontends` must be internally
     consistent.
3. The maintainer updates the canonical record in
   `data/registry/projects/<project-id>.json`.
4. A maintainer PR is created with generated artifact updates as needed.
5. `npm run catalog:validate` and `npm run catalog:build` run before merge when
   registry data changed.

Implementation path:

- `01-project-submission.yml` and `triage-submission.yml` handle intake validation.
- Project publication remains a maintainer-owned manual review, then PR workflow;
  there is no automatic publish workflow for project entries.

### Website issues

The issue is triaged as a runtime/site issue, not as registry metadata. Standard
PR workflow applies: changes in `src/`, `public/`, or test files, then verify
through normal gates.

### Kits

- Kit edits are submitted with `05-kit-submission.yml`, validated by
  `triage-kit-submission.yml`, then applied with `apply-kit-submission.yml` after
  maintainer review.
- Kit submissions are prepared by the in-browser builder and serialized into a
  stable JSON manifest on submit.

New Kits and edits are stored as pending records, while the currently published
Kit remains unchanged.
Maintainers review support signal, eligibility, and safety fit before publication.
Withdrawals are submitted with `07-kit-withdrawal.yml` and applied via
`apply-kit-withdrawal.yml`; GitHub identity must match the recorded author.

## Labels and maintainer actions

Issue labels indicate the maintainer queue bucket (`project-submission`,
`project-information`, `website-bug`, `kit-submission`, `kit-report`, `kit-withdrawal`).
They do not represent final publication state.

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
- Do not bypass manual review: submission is a request, maintainer merge is
  publication.
- Keep generated artifacts deterministic and avoid hand-editing generated files
  outside the approved scripts.
