# Kit Publication Label Bookkeeping Design

## Goal

Ensure successful Kit publication applies the `kit-published` label when GitHub
label operations are available, without allowing optional issue bookkeeping to
turn a completed registry publication or deployment dispatch into a failed run.

## Root Cause

The publication workflow calls `gh label view kit-published`, but GitHub CLI has
no `label view` subcommand. The check therefore always fails. When the label
already exists, the subsequent unforced `gh label create` also fails, and the
workflow incorrectly reports that the label could not be ensured instead of
applying it to the issue.

## Design

In `.github/workflows/apply-kit-submission.yml`, replace both unsupported label
existence checks with one supported, idempotent command:

```bash
gh label create kit-published \
  --color "1d76db" \
  --description "Kit publication has been applied to the catalog." \
  --force
```

If that command succeeds, attempt to add `kit-published` to the source issue. If
ensuring or applying the label fails, emit the existing visible bookkeeping
warning. In either failure case, continue to the issue-close operation.

The order remains:

1. Publish and push the canonical Kit.
2. Dispatch deployment for the exact published commit.
3. Ensure and apply the optional `kit-published` label.
4. Close the source issue as completed.

## Error Handling

Label creation and issue labeling remain best-effort bookkeeping. Their failures
must not fail the workflow or prevent issue closure after publication and
deployment dispatch have succeeded. Issue-close failures also remain warning
only.

## Testing

Update the workflow-hardening unit test to require:

- no use of unsupported `gh label view`;
- `gh label create kit-published` includes `--force`;
- label ensuring happens before `gh issue edit --add-label kit-published`;
- the existing warning-only and post-deployment ordering contracts remain.

The regression test must fail against the current workflow before the workflow
is changed, then pass after the minimal workflow correction.

## Non-goals

- Backfilling `kit-published` onto issue #127.
- Changing Kit publication, deployment, validation, or issue-closing semantics.
- Refactoring unrelated GitHub Actions workflows.
