# GitHub Actions user guides

This page maps Tavernary workflows to common operational tasks.

## 1) How to handle Project Submissions

### Contributor flow

1. Open a project intake issue from `.github/ISSUE_TEMPLATE/01-project-submission.yml` (title starts with `[Project submission]`).
2. Keep the issue open. The body may come from the Tavernary submission builder or the form JSON fallback.

### Automation flow (automatic)

1. `admit-issue.yml` runs on issue open/reopen, validates structure and basic admission rules, then dispatches:
   - `triage-submission.yml` when the title indicates a project submission.
2. `triage-submission.yml` validates the issue, normalizes metadata, checks duplicates, and applies admission labels.
3. On admission, `generate-project-submission.yml` creates or updates:
   - branch `automation/project-submission-<issue-number>`
   - a maintainer review PR titled `[Project submission] ...`
   - generated file paths (project JSON + optional GitHub snapshot + frontends vocab file).
4. Reviewers approve by merging the generated PR.

### Maintainer follow-up

1. If the review PR is merged:
   - catalog publication is handled through the merged PR changes.
2. If the review PR is closed without merge:
   - `project-submission-lifecycle.yml` closes the issue as declined and marks lifecycle labels.
3. If maintainers edit generated files and must preserve those edits, rerun:
   - `generate-project-submission.yml` with `force_regeneration: true`.

## 2) How to handle Kit Submissions (new Kit)

1. Open a kit issue from `.github/ISSUE_TEMPLATE/05-kit-submission.yml` with title starting `[Kit submission]`.
2. Ensure the manifest includes:
   - `operation: "create"`
   - valid title/description/project IDs.
3. `triage-kit-submission.yml` runs on admission and validates JSON + labels.
4. After maintainer approval, use `apply-kit-submission.yml` with `issue_number` to publish.
5. Publication PR/issue path is recorded on the issue with maintainer labels/comments and the workflow dispatches deploy when successful.

## 3) How to handle Kit Edits

1. Submit a Kit issue with operation `"edit"` and the target `kit_id`:
   - Author must match the existing Kit author.
2. The same intake and triage path is used as normal kit submissions:
   - `triage-kit-submission.yml` validates eligibility and issue labels.
3. Maintainer review must complete in the issue-to-review context.
4. Publish by running:
   - `apply-kit-submission.yml` with `issue_number`.
5. The action applies the edited fields to the published Kit record and updates catalog metadata.

> Note: Kit edits do not change the live catalog immediately until `apply-kit-submission.yml` is run.

## 4) How to update Catalog Summaries (Enrich)

1. Open `enrich-catalog.yml` from Actions.
2. Select:
   - `enrichment_scope`: `pending` (default) or `all-automatic`
   - `batch_size` (default `20`)
   - `model_concurrency` (default `6`, allowed range `1`-`8`)
   - `model_timeout_seconds` (default `120` per provider request)
3. Run on `main`. The workflow:
   - writes enrichment output into catalog records
   - emits summary in the workflow run
   - commits enrichment changes on successful selection
   - retries transient preflight calls three times after the initial attempt
   - pauses new model work with bounded backoff when the provider returns `429`
   - reports model-call, repair-call, rate-limit, and cumulative-latency totals
   - keeps terminal project errors provisional and finishes
     `complete-with-errors` without stopping later projects
   - maintains one `Catalog enrichment errors` issue until a clean completed
     run resolves every project

A green `complete-with-errors` run means the automation completed safely but
some projects remain provisional after retry. Configuration, authentication,
model, state, publication, deployment, and issue-reporting failures still make
the Action red.

Useful when:
- pending summaries are stale/incomplete
- you want to re-enrich only automatic records in a controlled batch.

## 5) How to update Catalog Source Data (Refresh)

1. Open `refresh-catalog.yml` from Actions.
2. Choose:
   - `mode`: `incremental` (default), `baseline`, `project`, or `forensic`
   - `batch_size` (for baseline, default `12`)
   - `project_id` (required for `project` or `forensic`)
3. Run manually, or rely on scheduled incremental refresh (`17 7 * * *`).
4. Workflow behavior:
   - refreshes GitHub snapshots and related manifest inputs
   - refreshes Kit reaction/community support data
   - commits changed snapshots and dispatches `deploy-pages.yml` if needed.

## 6) Deploy Pages

### How to publish the site after catalog edits

1. Open `.github/workflows/deploy-pages.yml` from Actions.
2. Run manually when you need to publish a known commit, or rely on automatic dispatch from workflows that mutate published data.
3. Optionally pass `source_sha` (full 40-char commit hash) to pin deployment to that exact revision.
4. The workflow will:
   - checkout the requested commit
   - run validation + static export verification
   - build pages artifact
   - deploy to the configured GitHub Pages environment.

Typical callers:
- `apply-kit-submission.yml` and `apply-kit-withdrawal.yml` after Kit publication/withdrawal.
- `refresh-catalog.yml` after snapshot refresh changes.

---

## 7) The rest of the workflow tasks (as plain-language operations)

### 7.1 Route newly opened submission issues to the right validation path

- Workflow: `admit-issue.yml`
- What it does: checks if a new issue is eligible and dispatches to either project or Kit triage.

### 7.2 Build and maintain the generated project review PR

- Workflow: `generate-project-submission.yml`
- What it does: regenerates project proposal files on a dedicated branch and maintains the maintainer review PR.

### 7.3 Update issue state when a generated project review PR closes

- Workflow: `project-submission-lifecycle.yml`
- What it does: syncs merged/declined project submission PR outcomes back to the original issue and cleans up stale generated branches.

### 7.4 Apply an approved Kit withdrawal

- Workflow: `apply-kit-withdrawal.yml`
- What it does: verifies withdrawal author, marks the Kit as withdrawn in the canonical catalog, and triggers site publish.

### 7.5 Repair missing GitHub identity fields across project records

- Workflow: `backfill-repository-identities.yml`
- What it does: fills missing repository identity fields and commits corrected project records.

### 7.6 Retry front-end dependency checks for merged projects

- Workflow: `retry-frontend-dependencies.yml`
- What it does: re-runs dependency retry logic on merged projects when new frontend vocabulary data changes.

### 7.7 Validate code and UI before merging changes

- Workflow: `ci.yml`
- What it does: runs checks, tests, and visual/browser validation for repository changes.

If your team only wants task guides for common day-to-day ops, the first five sections
cover the user-facing submissions/refinement workflows. The remaining ones are
support/maintenance tasks and should be considered separately.
