# Owner Summary and Reddit Retry Design

**Date:** 2026-07-30
**Status:** Approved for implementation planning

## Summary

Make owner-authored summary text optional whenever the owner explicitly leaves
summary policy on `automatic`. Tavernary's owner-request generation must still
resolve a valid, non-empty summary before applying the request.

Make Reddit project intake use Tavernary's existing bounded,
identity-checked Reddit enrichment adapter. Each intake wave receives three
source-load attempts spread across approximately 60–120 seconds. If the first
wave cannot obtain usable Reddit evidence, Tavernary retries automatically
after one hour and again after another hour. After the third failed wave,
ordinary source-availability failures publish a deterministic provisional
placeholder. Invalid URLs and Reddit identity mismatches remain blocked.

## Relationship to Existing Designs

This design narrowly supersedes two earlier decisions:

- `2026-07-30-project-generation-failure-recovery-design.md` remains
  authoritative except that eligible Reddit source-availability exhaustion may
  eventually publish a provisional placeholder after the durable retry budget.
- `2026-07-30-summary-validation-and-targeted-retry-design.md` remains
  authoritative for provider-output validation and provider-call budgets.
  Reddit source-load attempts are a separate network-read budget and do not
  count as provider repair calls.

All existing owner authority, manifest authority, source identity, exact-path,
copy-policy, publication, and catalog-schema contracts remain in force.

## Current-State Findings

The owner request currently rejects an empty summary at two independent
boundaries:

1. `batchPreflight()` in the browser rejects every blank card summary.
2. `normalizeProjectOwnerManifest()` rejects every blank summary regardless of
   `metadata.summary.mode`.

The downstream owner generator already treats automatic summary policy
correctly. It loads repository evidence, requests generated metadata, and
requires a valid non-empty resolved summary before applying either an edit or a
new card. Allowing a blank automatic proposal therefore does not permit a blank
catalog summary.

Reddit enrichment also already exists. The adapter:

- accepts canonical Reddit post identities;
- reads bounded Reddit JSON;
- uses post self-text when available;
- falls back to the post title when self-text is absent;
- uses identity-checked official Reddit oEmbed title data after a JSON `403`;
- excludes comments; and
- rejects a response for a different Reddit post.

Project-submission generation currently bypasses that adapter. Every
non-repository identity enters an early branch that calls
`draftProjectRecord()` with `enrichment: null`, so an automatic Reddit summary
falls back to the repository-specific placeholder `No README file found.`

Generation failure reconciliation can label the issue
`submission-retryable`, but no scheduled workflow redispatches those issues.
A failed issue can therefore remain retryable indefinitely.

## Goals

- Allow blank owner summary text only when summary policy is `automatic`.
- Keep manual owner summaries required and limited to 220 characters.
- Make review state clearly distinguish generated copy from submitted copy.
- Generate Reddit descriptions from the submitted Reddit post during intake.
- Give each Reddit retry wave three bounded source-load attempts.
- Retry failed waves automatically after one hour and after one additional
  hour.
- Publish a safe provisional placeholder after the third exhausted wave for
  ordinary Reddit availability failures.
- Keep invalid URL and source-identity failures fail-closed.
- Preserve sanitized, durable retry and exhaustion evidence.
- Keep placeholder records eligible for later automatic enrichment.

## Non-goals

- Crawling arbitrary web pages or unsupported external URL sources.
- Scraping Reddit HTML or passing embedded HTML to the metadata provider.
- Using Reddit comments as catalog evidence.
- Weakening source identity checks.
- Holding one GitHub Actions runner open during the two one-hour delays.
- Changing generated-summary length, copy-policy, or provider repair budgets.
- Making owner-authored manual metadata optional.
- Generalizing this retry schedule to every submission or provider failure.
- Adding an external scheduler, queue, database, or runtime service.

## Owner Summary Contract

### Browser behavior

The owner card editor keeps summary policy explicit:

- `automatic`: summary text is optional proposal context;
- `manual`: a non-empty owner summary is required.

The summary field remains available in both modes so an owner can supply
context without claiming manual authorship. Its hint explains that blank text
is allowed when Tavernary writes automatically. Switching to `manual` makes
the existing required validation active immediately.

Batch preflight rejects a blank summary only when that card's summary policy is
`manual`. Duplicate IDs, duplicate normalized titles, display-name
requirements, controlled vocabularies, compatibility, and all other batch
checks remain unchanged.

### Manifest behavior

Owner manifests retain their current exact-key shape and continue carrying a
string `summary` field. Automatic proposals normalize blank text to the empty
string. Manual proposals require normalized non-empty text.

The authoritative manifest normalizer applies the same conditional rule as
the browser. A handcrafted or stale manifest cannot bypass the manual-summary
requirement.

Review displays `Generated automatically` when an automatic proposal contains
no summary text. It must not render an unexplained blank value.

### Generation and application

Automatic owner metadata continues through the existing source-grounded
generation path. The preliminary candidate may contain an empty proposal, but
the generated metadata result must contain a valid summary before the request
can be applied.

The application boundary continues rejecting missing, blank, overlong, or
otherwise invalid resolved metadata. No empty catalog summary may be written.
Manual summary preservation continues using the verified owner/staff copy
path.

## Reddit Intake Architecture

### Preliminary record

After admission and source-identity validation, Reddit intake creates the same
preliminary project and source records used to determine metadata policy. The
Reddit source remains a `url` source with automatic summary and tag policy.

Unlike unsupported generic URL sources, a canonical Reddit identity proceeds
through `enrichRecord()` and the shared `loadEnrichmentSource()` boundary. That
boundary selects `loadRedditEnrichmentSource()` without adding a second Reddit
parser.

### One retry wave

One Reddit retry wave performs no more than three source-load attempts.
Attempts use the existing request byte limits, redirect allowlist, identity
checks, and per-request timeout.

The second attempt begins after approximately 30 seconds and the third after
approximately 60 additional seconds. Normal network time plus those backoffs
keeps a wave near the approved 60–120-second range. Processing stops
immediately when an attempt returns usable Reddit body or title evidence.

One source-load attempt may perform the adapter's JSON request and, when the
JSON response is `403`, its official oEmbed fallback. Those two bounded HTTP
requests together count as one source-load attempt because they are the
adapter's primary and fallback routes for the same post.

Backoff and time access must be injectable so unit tests use deterministic
virtual time rather than real waits.

After source evidence is ready, the existing enrichment provider and its
independent provider-attempt budget generate the requested description and
tags. Provider-output validation failures do not consume Reddit source retry
waves.

## Durable Retry State

### State authority

The project-submission issue is the durable retry authority. Tavernary records
one sanitized, marker-based machine state containing at least:

- schema version;
- issue number;
- canonical Reddit source identity;
- completed wave number;
- next eligible retry timestamp or `null`;
- latest stable reason code; and
- update timestamp.

The state contains no Reddit body text, provider output, credentials, or other
untrusted source content. Repeated failures update the same marker rather than
creating comment spam.

Generation re-reads the current issue and retry marker before using or
advancing state. The marker is ignored if its issue number or source identity
does not match the currently admitted manifest.

### Wave transitions

The state machine is:

```text
initial wave: 3 source-load attempts
  -> success: continue normal generation
  -> ordinary failure: record wave 1, due at +1 hour

second wave: 3 source-load attempts
  -> success: continue normal generation and clear retry state
  -> ordinary failure: record wave 2, due at +1 hour

third wave: 3 source-load attempts
  -> success: continue normal generation and clear retry state
  -> ordinary failure: publish provisional placeholder
```

Only one wave may run for an issue at a time. Existing workflow concurrency and
fresh issue-state validation prevent duplicate scheduled or manually
dispatched runs from advancing the same issue twice.

### Scheduled dispatcher

Add a lightweight scheduled workflow that runs every 15 minutes and can also
be dispatched manually for recovery. It:

1. lists open admitted project-submission issues in retryable state;
2. reads their marker-based Reddit retry state;
3. selects only matching states whose `next eligible retry` time has passed;
4. redispatches the existing project-submission generator; and
5. leaves not-yet-due, malformed, closed, superseded, or non-Reddit issues
   untouched.

A 15-minute sweep means an hourly retry is normally dispatched 60–75 minutes
after the preceding failed wave without keeping a runner asleep.

The dispatcher does not decide whether to publish a placeholder. The generator
owns that decision after revalidating the manifest, identity, current issue
state, and completed wave count.

## Failure Classification

The retry and placeholder path is available for ordinary Reddit
source-availability outcomes, including:

- network and timeout failures;
- rate limiting;
- Reddit server failures;
- JSON access blocked when the verified oEmbed fallback also fails;
- unavailable, removed, or deleted posts;
- unusable or malformed Reddit response data that still came from the expected
  bounded endpoint; and
- empty post body and title data.

The following remain blocked and never publish a placeholder:

- a malformed or unsupported source URL;
- a non-Reddit source entering the Reddit path;
- a Reddit response whose post identity differs from the submitted identity;
- an oEmbed response that does not prove the submitted post identity; and
- inconsistent issue, manifest, or durable retry identities.

Integrity failures move to the existing needs-information/fail-closed path.
They are not availability failures.

## Placeholder Contract

After the third exhausted wave, Tavernary writes a deterministic summary based
only on already-authoritative facts:

> A [project kind] shared through Reddit. Tavernary could not retrieve the post
> description after repeated attempts, so source details remain temporarily
> unavailable.

The implementation substitutes the normalized project kind and keeps the final
text within the catalog's summary limit. It makes no claim about project
features, quality, compatibility, authorship, or post content.

The generated record:

- keeps `metadata_policy.summary.mode` as `automatic`;
- keeps automatic tag policy;
- uses `metadata_status: "provisional"`;
- includes a sanitized exhaustion warning in the generation report and review
  pull request; and
- remains eligible for later automatic enrichment to replace the placeholder.

The placeholder is not represented as a validated provider copy result.
Publication transaction metadata must distinguish placeholder degradation from
source-grounded generated copy.

## Success and Cleanup

Any successful wave resumes the ordinary project-submission transaction:

```text
admission -> Reddit evidence -> generated metadata -> review PR
  -> CI -> exact-SHA publication -> deploy
```

Before success mutation, generation revalidates the issue and source identity.
On success it removes or marks complete the durable retry state, replaces
`submission-retryable` with `submission-pr-open`, and preserves unrelated
labels.

After placeholder publication, ordinary project lifecycle handling closes the
issue as usual. The registry's automatic metadata policy, not the closed issue,
is the authority for later enrichment repair.

## Observability

Sanitized reports and issue notices expose:

- current and maximum wave numbers;
- source-load attempt count for the wave;
- stable failure reason code;
- next retry eligibility time;
- whether source evidence, oEmbed fallback, or placeholder degradation was
  used; and
- the Actions run URL.

They must not expose Reddit body text, raw provider responses, credentials, or
policy-sensitive content.

Existing provider-call and repair-call telemetry remains separate from Reddit
source-load attempt telemetry.

## Testing

Implementation follows one-test-at-a-time red-green-refactor.

### Owner form and manifest

- Blank automatic summaries pass edit-card and add-cards browser preflight.
- Blank manual summaries fail browser preflight.
- The authoritative manifest accepts blank automatic proposals.
- The authoritative manifest rejects blank manual proposals.
- Switching between policies updates validation without changing policy
  implicitly.
- Review renders `Generated automatically` for blank automatic copy.
- Owner generation still refuses to apply a request without resolved non-empty
  metadata.

### Reddit source-load waves

- Reddit intake invokes the shared Reddit enrichment source.
- Self-text produces source-grounded generated metadata.
- Empty self-text uses the verified title.
- A JSON `403` still uses identity-checked oEmbed.
- One wave stops after the first successful source-load attempt.
- Failures run exactly three attempts with the approved backoff sequence.
- Source-load attempts and provider repair calls remain independently counted.

### Durable retry state

- First-wave exhaustion records wave one and a one-hour due time.
- Second-wave exhaustion records wave two and a new one-hour due time.
- Third-wave exhaustion produces the provisional placeholder.
- A successful later wave clears retry state and creates the normal proposal.
- Stale, malformed, source-mismatched, closed, and superseded states do not
  dispatch or advance.
- Concurrent or repeated dispatches cannot advance one issue twice.
- Repeated failures update one sanitized marker comment.

### Safety and placeholder

- Every approved availability failure can reach the placeholder only after all
  three waves.
- Malformed URLs and identity mismatches never publish a placeholder.
- Placeholder copy is deterministic, non-empty, within 220 characters, and
  contains no unsupported project claims.
- Placeholder records remain provisional and automatic.
- Placeholder transactions cannot claim validated provider copy.

### Workflow contracts

- The scheduled dispatcher runs every 15 minutes and supports manual recovery.
- Only due Reddit retry issues dispatch generation.
- Existing generation failure reconciliation preserves the durable retry
  state.
- A successful generation removes retryable state without disturbing unrelated
  issue labels.
- Workflow permissions, concurrency, and exact branch ownership remain
  constrained.

After focused unit and workflow-contract coverage passes, run the repository's
complete `npm.cmd run check` gate.

## Acceptance Criteria

- An owner can submit a blank summary while explicitly using automatic summary
  policy.
- A blank manual owner summary is rejected in both browser and manifest
  validation.
- No owner request can write a blank catalog summary.
- A new Reddit submission reads its canonical post before generating catalog
  copy.
- Each wave performs no more than three source-load attempts over approximately
  60–120 seconds.
- Failed waves retry automatically after one hour and after one additional
  hour.
- Ordinary availability exhaustion after wave three publishes the approved
  provisional placeholder.
- Invalid URLs and Reddit identity mismatches remain fail-closed.
- Retry state survives workflow runs and is safe against duplicate dispatch.
- Successful, retried, and placeholder publication paths remain auditable.
