# Utility-First JSON Repair Design

## Context

Tavernary currently sends every structured model request through the shared
`TAVERNARY_ENRICHMENT_*` credential contract. The same transport serves catalog
enrichment, submitted-copy preservation, project and owner-request generation,
catalog-policy review, TavernKeeper report synthesis, and tag-taxonomy
discovery. GPT-5.6 Luna therefore performs routine generation even though most
responses can be produced more cheaply by DeepSeek V4 Flash through NanoGPT.

The repository now has two credential sets:

- `UTILITY_API_ENDPOINT`, `UTILITY_API_KEY`, and `UTILITY_MODEL` identify the
  NanoGPT/DeepSeek utility provider.
- `TAVERNARY_ENRICHMENT_API_URL`, `TAVERNARY_ENRICHMENT_API_KEY`, and
  `TAVERNARY_ENRICHMENT_MODEL` retain the existing GPT-5.6 Luna provider.

## Decision

Use the utility provider for every first-pass structured model request. Extend
the shared structured-output transport with one bounded Luna repair attempt
that runs only when the utility provider returns textual output that cannot be
parsed as one JSON object or cannot satisfy the request's JSON Schema.

Luna is a JSON repair provider, not an alternate generator. It receives the
damaged utility output, the compact target schema, and sanitized structural
validation diagnostics. It never receives the original prompt, README, source
evidence, TavernKeeper report, project context, or workflow instructions.

## Goals

- Route every model-backed Tavernary workflow through `UTILITY_*` first.
- Use Luna at most once and only for repairable JSON syntax or schema failure.
- Keep all existing domain validators and fail-closed behavior authoritative.
- Prevent provider, authentication, quota, timeout, and semantic failures from
  becoming Luna generation fallbacks.
- Restrict both credential sets to steps that actually execute model calls.
- Keep the feature dormant after merge until operators intentionally change the
  live primary-model configuration; opening this pull request must not dispatch
  or mutate live workflows.

## Non-goals

- Luna does not redo a catalog summary, policy judgment, security assessment,
  taxonomy discovery, or submission analysis.
- Luna does not receive source material to independently solve the task.
- The repair layer does not retry transport failures or make a second repair
  attempt.
- This change does not alter catalog policy, TavernKeeper advisory policy,
  enrichment eligibility, publication rules, or workflow schedules.
- This change does not modify secret values or dispatch model-backed workflows.

## Architecture

### Provider configuration

Add one shared environment adapter that returns an explicit two-provider
configuration:

```js
{
  primary: {
    apiUrl: process.env.UTILITY_API_ENDPOINT,
    apiKey: process.env.UTILITY_API_KEY,
    model: process.env.UTILITY_MODEL,
  },
  jsonRepair: {
    apiUrl: process.env.TAVERNARY_ENRICHMENT_API_URL,
    apiKey: process.env.TAVERNARY_ENRICHMENT_API_KEY,
    model: process.env.TAVERNARY_ENRICHMENT_MODEL,
  },
}
```

Provider constructors continue to accept explicit configuration for tests and
callers, but production entry points use this adapter. Configuration is
validated before any request. The primary configuration is always required.
The repair configuration is optional at the low-level transport boundary so
local callers can remain fail-closed without Luna, while workflow contract
tests require it in every production model path.

### Shared structured-output transport

The existing `createStructuredProviderTransport` remains the single network
boundary. Its request flow becomes:

1. Send the complete task to the primary utility provider.
2. Validate the HTTP response, returned model identity, message envelope, and
   bounded textual content exactly as today.
3. Parse one JSON object.
4. Compile and apply the exact `response_format.json_schema.schema` with AJV.
5. Return immediately when parsing and schema validation succeed.
6. If textual output exists but JSON parsing or schema validation fails, make
   one repair request to Luna.
7. Parse and schema-validate Luna's response locally, then return it with the
   primary provider identity plus bounded repair metadata.

Repair is not eligible when content is absent, tool calls are present, content
parts are unsafe, the primary model identity is wrong, the provider rejects the
request, or any network/timeout/quota/authentication error occurs.

### Repair request

The repair request uses OpenAI-compatible Chat Completions with:

- the configured Luna model;
- `reasoning_effort: "none"` for GPT-5.6 models;
- the original strict JSON Schema as `response_format`;
- a hard one-call limit;
- a bounded completion-token ceiling and bounded response bytes;
- a system instruction to preserve the damaged output's meaning and values,
  correct only JSON syntax/shape, and return no commentary;
- a user payload containing only the damaged output, compact schema, and
  sanitized AJV paths/keywords.

The repair response is never logged or persisted as raw text. If Luna fails,
returns an unexpected model, or still violates the schema, Tavernary throws the
original sanitized primary invalid-response error.

### Domain validation

JSON Schema validation proves structural conformance only. Each existing
provider-specific validator remains authoritative for evidence references,
allowed tag IDs, summary policy, security citations, policy-review consistency,
and other semantic requirements.

Valid JSON that later fails one of those validators follows the existing
workflow behavior. Existing inexpensive self-repair loops continue to call the
utility provider. Workflows without a semantic retry remain unavailable or
fail closed. Luna is never selected because a conclusion or summary is poor.

### Metadata

Existing `requestedModel`, `returnedModel`, and `latencyMs` fields continue to
describe the primary utility request. When repair occurs, transport metadata
adds a small optional `jsonRepair` object containing the sanitized diagnostic,
requested and returned repair model IDs, latency, and success state. It contains
no prompt, response, source, or credentials. Existing consumers that do not
need repair telemetry may ignore it.

## Workflow credential scope

The following workflows receive both credential sets only on their
model-execution steps:

- `enrich-catalog.yml`
- `generate-project-submission.yml`
- `generate-project-owner-request.yml`
- `import-tavernkeeper-reports.yml`
- `review-catalog-policy.yml`

Job-level model credentials in the generation and policy-review workflows move
to the exact steps that invoke model-backed code. Checkout, validation,
publication, Git, and issue-management steps do not receive either provider's
credentials.

Tag-taxonomy discovery is not currently a production workflow, but its CLI uses
the same environment adapter so it follows the same routing contract whenever
operators invoke it.

## Error handling

- Primary transport errors retain their existing sanitized error codes.
- JSON parsing and schema diagnostics are allowlisted and contain no response
  text.
- Repair failure preserves the original primary diagnostic.
- Repair never recursively invokes itself.
- Missing repair configuration preserves the current fail-closed primary
  invalid-response behavior.
- No secret value, raw provider body, damaged output, or repair output appears
  in thrown messages, workflow summaries, reports, or logs.

## Testing

Implementation follows Red-Green-Refactor:

- Shared transport tests prove successful DeepSeek output makes zero Luna
  calls.
- Syntax and schema failure tests prove exactly one minimal Luna request and
  successful local revalidation.
- Negative tests prove no Luna call for tool calls, missing content, model
  mismatch, authentication, quota, timeout, network, or semantic validation
  failure.
- Leakage tests prove the repair payload omits the original request messages and
  representative README, policy, and TavernKeeper source markers.
- Failure tests prove invalid Luna output rethrows the original primary
  diagnostic and cannot recurse.
- Provider-constructor tests prove all structured providers inherit the shared
  behavior.
- Workflow tests prove exact secret names and step-level credential isolation.
- The complete repository check, build, and diff validation run before publish.

## Release boundary

The feature is developed on `codex/utility-json-repair` and submitted as a draft
pull request. It is not merged in this task. No provider check, enrichment run,
submission generation, policy review, taxonomy discovery, or TavernKeeper
import is dispatched. Integration waits until the separate TavernKeeper
"scanning pass redux" work is finished so switching the shared models cannot
interfere with that development.
