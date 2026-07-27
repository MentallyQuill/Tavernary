# Disabled Fork Pull Requests Contributor Design

## Problem

Tavernary discovers contributors for forks from authors of merged pull
requests against the fork. This avoids attributing inherited upstream commit
authors to the fork. GitHub returns `404 Not Found` from the pull-request
endpoint when a fork has pull requests disabled, causing project submission
generation to fail even though the repository and its owner are valid.

## Design

Keep merged pull requests as the contributor source for forks. If the first
fork pull-request request returns 404, query the repository metadata endpoint
to distinguish disabled pull requests from other not-found conditions.

When repository metadata succeeds and `has_pull_requests` is `false`, return a
completed contributor scan with no additional contributor accounts. The
repository owner remains the creator attribution through the existing catalog
attribution path. Do not fall back to the ordinary repository contributors
endpoint because it includes inherited upstream history.

If repository metadata is unavailable, malformed, or does not explicitly
report disabled pull requests, preserve the original 404 failure.

## Request Accounting

Count the metadata probe as an additional GitHub request. A disabled-pull-
request fork therefore completes with two requests: the failed pull-request
request and the successful metadata probe.

## Verification

Add a regression test that reproduces a fork pull-request 404 followed by
repository metadata containing `has_pull_requests: false`. Assert that the
scan completes with no accounts, a completed baseline, no continuation scan,
and two requests.

Retain the existing 404 failure behavior when the metadata probe does not
confirm disabled pull requests. Run the focused contributor tests and the
project-submission tests before the full repository check.
