# Twice-Daily Mountain Catalog Refresh Design

## Goal

Run the catalog source refresh every day at 6:17 AM and 6:17 PM Mountain
time.

## Design

Use one GitHub Actions schedule with the cron expression `17 6,18 * * *` and
the IANA timezone `America/Denver`. GitHub's timezone-aware scheduling keeps
both runs at the requested local times across MST and MDT transitions.

Manual refresh dispatch and all refresh behavior remain unchanged.

## Documentation

Update the maintenance runbook, GitHub Actions user guide, README, and system
overview so they describe the twice-daily Mountain schedule rather than the
old once-daily UTC schedule.

## Verification

Extend the existing workflow safety test to assert both the cron expression
and `America/Denver` timezone. Run that focused test and parse the workflow
through the repository's existing YAML-based workflow tests.
