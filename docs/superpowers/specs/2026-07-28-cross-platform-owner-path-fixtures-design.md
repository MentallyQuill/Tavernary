# Cross-platform owner path fixtures

## Problem

The Pages deployment workflow runs the complete test and build gate on Ubuntu.
Owner-request unit tests currently use Windows drive-qualified fixture paths
such as `C:/repo`. Node treats those paths as absolute on Windows but relative
on POSIX, so Ubuntu prefixes the workflow checkout directory and six assertions
fail before the Pages artifact can be built.

Focused content validation does not run these unit tests, which allows routine
catalog submission pull requests to pass while their subsequent full
deployment fails.

## Design

Keep production path handling unchanged. Replace the drive-qualified test
fixtures with absolute paths derived by Node's platform-native path utilities.
Build every expected registry, snapshot, and report path from those fixture
roots so the tests assert the same ownership, containment, write-order, and
rollback contracts on Windows and POSIX.

Do not weaken the full deployment gate or expand production support for foreign
path syntax. The defect is in the tests' portability, not in the production
workflow's real path inputs.

## Verification

Use the existing Ubuntu failures as the red proof, then demonstrate locally
that the focused owner-request tests pass with platform-native fixtures. Run
the complete `npm run check` command used by the Pages workflow. After pushing
the fix to `main`, verify that the resulting `Site: Deploy to GitHub Pages` run
builds, uploads, and deploys the exact pushed commit successfully.
