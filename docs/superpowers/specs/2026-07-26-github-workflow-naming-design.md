# GitHub Workflow Naming Design

## Goal

Make Tavernary's GitHub Actions menu self-explanatory and prevent maintainers
from confusing project-submission workflows with Kit-submission workflows.

## Naming convention

Every workflow display name uses:

`Category: Clear action and outcome`

Category prefixes group related workflows alphabetically. Actions use plain
language rather than internal lifecycle terms such as "triage" or "apply."

## Workflow display names

| Workflow file | New display name |
| --- | --- |
| `admit-issue.yml` | `Submission intake: Check issue eligibility` |
| `triage-submission.yml` | `Project submissions: Validate submission` |
| `generate-project-submission.yml` | `Project submissions: Create review PR` |
| `project-submission-lifecycle.yml` | `Project submissions: Process review result` |
| `triage-kit-submission.yml` | `Kit submissions: Validate submission` |
| `apply-kit-submission.yml` | `Kit submissions: Publish approved Kit` |
| `apply-kit-withdrawal.yml` | `Kit submissions: Withdraw published Kit` |
| `refresh-catalog.yml` | `Catalog maintenance: Refresh source data` |
| `enrich-catalog.yml` | `Catalog maintenance: Enrich project metadata` |
| `backfill-repository-identities.yml` | `Catalog maintenance: Backfill repository IDs` |
| `ci.yml` | `Site: Validate changes` |
| `deploy-pages.yml` | `Site: Deploy to GitHub Pages` |

Workflow filenames remain unchanged so existing workflow dispatch references do
not need migration.

## Run names

Where the event supplies a useful identifier, workflow runs should identify the
object and action:

- `Project #<issue>: Validate submission`
- `Project #<issue>: Create review PR`
- `Project #<issue>: Process review result`
- `Kit #<issue>: Validate submission`
- `Kit #<issue>: Publish approved Kit`
- `Kit #<issue>: Withdraw published Kit`
- `Catalog: Refresh <scope>`
- `Catalog: Enrich project metadata`
- `Catalog: Backfill repository IDs`
- `Site: Validate <ref>`
- `Site: Deploy <source SHA>`

Automatic intake runs should include the issue number when available. Dynamic
expressions must support every trigger declared by the workflow and use a safe
fallback when a trigger does not expose an issue number.

## Scope and verification

This change updates workflow `name` and `run-name` metadata only. It does not
change triggers, permissions, inputs, jobs, scripts, or publication behavior.

Verification must parse every workflow, assert the approved display names, and
confirm that existing cross-workflow dispatches still target the unchanged
filenames.
