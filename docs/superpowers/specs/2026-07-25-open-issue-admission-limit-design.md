# Open Issue Admission Limit Design

**Date:** 2026-07-25
**Status:** Approved

## Goal

Add modest, account-level friction against public issue flooding without
restricting new GitHub accounts, limiting harmless edits, introducing a
Tavernary backend, or burdening enthusiastic contributors.

Each external GitHub account may have at most 10 open issues in Tavernary at
one time. Closing an issue immediately restores one slot.

## Scope

The cap counts every public repository issue, regardless of which Tavernary
issue form created it:

- project submissions;
- project-information reports;
- website bug reports;
- other inquiries;
- Kit submissions and edits;
- Kit reports; and
- Kit withdrawals.

Pull requests do not count. Comments and edits do not consume additional slots.
Repository owners, members, and collaborators are exempt so maintainer work and
trusted automation cannot be blocked by the public intake limit.

The limit is deliberately independent of account age. Tavernary does not add a
daily creation quota, CAPTCHA, new blocklist, or external service in this
change. GitHub's platform abuse controls remain the backstop for account
rotation and repeated open-close churn.

## Admission flow

A single issue-admission workflow handles `issues.opened` and
`issues.reopened`.

For an external author, admission:

1. identifies the author by GitHub numeric user ID;
2. retrieves that author's open issues in this repository;
3. excludes pull requests;
4. sorts issues by creation timestamp, then issue number; and
5. admits the oldest 10.

This ordering makes burst handling deterministic. Every concurrent check can
independently reach the same decision about which 10 issues remain open.

An admitted issue receives the `issue-admitted` label. An issue outside the
oldest 10:

- has `issue-admitted` removed if it was present;
- receives `issue-limit-reached`;
- receives one marker-based explanatory comment; and
- is closed with a neutral, non-punitive state.

The comment explains that Tavernary allows 10 open issues per account and that
closing or resolving an existing issue restores capacity. It does not describe
the author as abusive or place the author on a moderation list.

When a previously limited issue is reopened, admission runs again. If capacity
exists, automation removes `issue-limit-reached`, adds `issue-admitted`, and
leaves the issue open. If the account is still at its limit, automation updates
the existing marker comment if necessary and closes the issue again.

## Submission validation

Project and Kit validation must not race ahead of admission.

Their workflows no longer validate directly on `issues.opened`. Initial
validation begins when the admission workflow adds `issue-admitted`. Subsequent
`issues.edited` events validate only when the issue:

- still has `issue-admitted`;
- is open; and
- retains the appropriate Project or Kit submission title prefix.

Edits remain unlimited and receive prompt validation feedback. Each validation
workflow uses an issue-specific concurrency group with
`cancel-in-progress: true`, so a newer edit supersedes an older validation run
for the same issue.

The validators use repository code but no installed npm dependencies.
Validation workflows retain checkout and the pinned Node setup while removing
`npm ci`. This keeps the established Node 24 runtime contract and avoids the
most expensive repeated setup work.

## Existing moderation behavior

This feature is queue admission, not user moderation.

The existing Kit blocked-user check remains unchanged because removing an
existing safety mechanism is outside this design. No equivalent Project
blocklist, automatic account block, account-age rule, or escalating penalty is
added.

An attacker may still create closed-history noise by repeatedly closing issues
or rotating GitHub accounts. Preventing that completely would require a
time-based creation quota, broader GitHub interaction restrictions, or a
Tavernary-controlled submission service. Those measures are deferred until
observed launch behavior justifies their additional scope.

## Failure handling

Admission fails open when GitHub cannot reliably determine the author's current
open-issue rank: the issue remains open and receives `issue-admitted`. A
transient API or workflow failure must not discard or strand a legitimate
report. The failed admission check remains visible to maintainers and can be
rerun.

Label creation is idempotent. The explanatory comment uses a stable hidden
marker so retries update one comment instead of adding duplicates. Admission
and limitation transitions synchronize only the labels owned by this feature.

Existing open issues are not retroactively closed when the feature deploys.
They count toward the author's limit when that author next opens or reopens an
issue.

## Testing

Unit coverage verifies:

- all public issue types share one count;
- pull requests are excluded;
- numeric identity, not mutable login text, determines ownership;
- the oldest 10 issues are admitted deterministically;
- the 11th issue is limited;
- closing an issue restores capacity;
- reopening rechecks capacity;
- collaborators and maintainers bypass the cap;
- retries reuse the marker comment; and
- API uncertainty fails open.

Workflow contract tests verify:

- admission runs on `opened` and `reopened`;
- initial Project and Kit validation requires `issue-admitted`;
- edits validate only admitted, open submission issues;
- per-issue concurrency cancels obsolete runs; and
- validation no longer runs `npm ci`.

Focused triage tests continue to prove that valid Project and Kit submissions
receive their existing validation labels and comments after admission.

## Acceptance criteria

- An external account can keep at most 10 Tavernary issues open.
- The cap spans every public issue form and excludes pull requests.
- Closing an issue restores one slot immediately.
- Excess issues are neutrally explained and closed, not treated as account
  abuse.
- New accounts remain eligible under the same rules as established accounts.
- Edits and comments remain unrestricted.
- Project and Kit validation runs only after admission.
- Rapid edits supersede obsolete validation runs.
- Repeated validation does not install npm dependencies.
- No backend, CAPTCHA, daily quota, or new blocklist is introduced.
