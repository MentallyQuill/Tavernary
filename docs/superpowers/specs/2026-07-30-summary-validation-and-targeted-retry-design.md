# Summary Validation and Targeted Retry

## Problem

Tavernary's automatic summary generation currently requires exactly two
sentences and 24–36 words in addition to the catalog's 220-character limit.
Those stylistic requirements reject otherwise useful source-grounded copy and
make project intake unnecessarily fragile.

The provider returns one summary candidate per call. New-project intake can
therefore fail after receiving a structurally valid candidate that violates a
stylistic rule, while routine catalog enrichment can spend repair calls on the
same rules. Generating several candidates in one response would complicate the
structured-output contract and increase the output cost of every call,
including successful calls.

## Decisions

### Summary acceptance

Automatically generated summaries must:

- contain between 120 and 220 characters, inclusive;
- be a non-empty string;
- contain no line breaks;
- contain no Markdown or list syntax; and
- contain no URLs or recognizable domain-style links.

Summary validation will not enforce:

- a word-count range;
- a sentence count; or
- a particular sentence structure.

The existing structured-output, source-evidence, allowed-tag, and catalog-copy
policy checks remain authoritative. A valid summary does not make an otherwise
invalid provider response acceptable.

The URL prohibition has no domain exceptions. A future dedicated links field
or display box is outside this change.

### Candidate generation

Each provider call requests one source-grounded summary candidate. Tavernary
validates the complete structured response and accepts the first response that
passes every applicable check.

Tavernary will not truncate, splice, rank, or rewrite rejected candidates.
When another attempt is permitted, its repair input uses the latest rejected
response and its deduplicated validation errors.

### Attempt budgets

The maximum provider-call budget is context dependent:

- ordinary bulk-enrichment primary pass: one call total;
- new-project intake: five calls total; and
- targeted bulk retry after a failed primary item: five calls total.

An initial call counts toward the total. A five-call budget therefore means one
initial call and no more than four repair calls. Processing stops immediately
after the first valid response.

Only structured-output validation failures are eligible for in-process repair
calls. Source-readiness, authentication, authorization, model mismatch,
transport, rate-limit, timeout, and provider server failures retain their
existing handling and do not trigger repeated validation-repair calls.

After the final permitted call fails validation, Tavernary preserves the
existing terminal `output-invalid` behavior. The existing tag-only fallback
remains available when removing invalid generated tags leaves a fully valid
summary and copy-policy result.

## Architecture

### Shared summary contract

The summary validator remains the authoritative boundary for generated
metadata. Its length checks change to the inclusive 120–220 range, its word and
sentence checks are removed, and it gains URL/domain detection.

URL detection must reject, at minimum:

- absolute URLs such as `https://example.com/path`;
- protocol-relative URLs such as `//example.com/path`;
- `www.` addresses; and
- recognizable bare domain names such as `example.com`.

The check applies to the generated summary value, not to structured evidence or
the project's canonical source URL stored elsewhere in the catalog.

The provider JSON schema mirrors the same 120-character minimum and
220-character maximum. Runtime validation remains authoritative because a
provider may ignore or imperfectly enforce the requested schema.

### Provider prompt

The enrichment system prompt asks for one natural, source-grounded summary
between 120 and 220 characters. It explicitly requires single-line plain text
without Markdown, list syntax, URLs, or domain-style links.

The prompt no longer requests exactly two sentences, 24–36 words, or a preferred
word range. Repair guidance reports the applicable validation defect without
reintroducing those deleted stylistic requirements.

### Bounded generation loop

The existing generate-and-validate sequence becomes a reusable bounded loop
with an explicit maximum-attempt input.

For every attempt, the loop:

1. calls the provider once;
2. validates the complete structured response;
3. returns immediately when validation succeeds;
4. applies the existing tag-only fallback when eligible;
5. stops with `output-invalid` when the budget is exhausted; or
6. builds the next repair request from the latest rejected output and errors.

The loop exposes the actual provider-call and repair-call counts through the
existing telemetry fields.

### Call-site budgets

Project-submission intake explicitly selects the five-call budget.

The bulk-enrichment orchestrator selects its budget from the run phase:

- `primary` selects one call;
- `retry` selects five calls.

The retry phase remains targeted through the existing retry queue; successful
primary items are not regenerated. This prevents routine bulk enrichment from
incurring the larger budget.

Other callers do not silently inherit the expensive intake policy. They must
select a budget explicitly or use a conservative default of one call.

## Data flow

For project intake:

1. Tavernary observes the submitted repository and loads source evidence.
2. The intake path constructs the existing enrichment request.
3. The bounded loop receives a five-call maximum.
4. Tavernary accepts the first complete valid response.
5. If every response is invalid, intake reports the existing retryable
   generation failure.

For bulk enrichment:

1. The primary phase gives each selected record one provider call.
2. Failed non-systemic items enter the existing retry queue.
3. The targeted retry phase gives each queued item up to five calls.
4. Items still invalid after that budget become final failures under the
   existing report semantics.

## Error handling and observability

Validation errors remain specific and sanitized. New or changed messages cover:

- summaries shorter than 120 characters;
- summaries longer than 220 characters;
- line breaks;
- Markdown or list syntax; and
- URLs or domain-style links.

Deleted word-count and sentence-count messages must not appear in prompts,
repair hints, reports, or tests.

Provider telemetry records the actual call count, including early success. A
successful first intake response reports one provider call; a success on the
fifth response reports five calls and four repair calls.

The workflow's existing reconciliation behavior remains responsible for
turning terminal intake failure into a retryable submission state. This design
does not add automatic workflow redispatches or unbounded retries.

## Verification

Focused tests must prove:

1. summaries at exactly 120 and 220 characters pass;
2. summaries below 120 or above 220 characters fail;
3. word count and sentence count no longer affect acceptance;
4. multiline text, Markdown, lists, URLs, `www.` addresses, and bare domains
   fail;
5. canonical source URLs and structured evidence remain valid outside the
   summary value;
6. the provider prompt and JSON schema express the 120–220 contract and URL
   prohibition;
7. intake succeeds on any of attempts one through five and never makes a sixth
   call;
8. intake returns `output-invalid` after five invalid responses;
9. bulk primary makes one call and queues an invalid item for retry;
10. targeted bulk retry succeeds on any of attempts one through five and never
    makes a sixth call;
11. successful primary bulk items never enter the expensive retry path;
12. each repair uses the latest rejected output and validation errors;
13. non-validation provider failures do not trigger the bounded repair loop;
14. tag-only fallback behavior remains intact; and
15. provider and repair-call telemetry reflects early success and exhaustion.

After focused unit coverage passes, run the repository's complete
`npm.cmd run check` gate.

## Non-goals

This change does not:

- generate or rank multiple summary candidates in one provider response;
- add a links field, links box, or new catalog-card UI;
- permit URLs from selected domains;
- change owner-authored manual-summary limits or authority;
- weaken evidence, tag, source, or copy-policy validation;
- retry systemic provider or source failures; or
- change the catalog schema.
