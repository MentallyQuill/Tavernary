# Provider Authentication Status Diagnostic

## Purpose

Distinguish an upstream HTTP 401 response from HTTP 403 when an OpenAI-compatible provider rejects Tavernary authentication. The current `provider-authentication-failed` code intentionally groups both statuses, which makes a bad credential indistinguishable from a valid credential denied access to a subscription route or model.

## Design

Keep `provider-authentication-failed` as the stable public error code. Attach only a sanitized diagnostic token, `http-401` or `http-403`, to the existing `EnrichmentProviderError`. Do not read, retain, or log the provider response body for either status. Existing cancellation and bounded-response behavior remains unchanged.

The CLI's existing error rendering will expose the diagnostic property in GitHub Actions logs without exposing request content, credentials, headers, or provider response text.

## Verification

Add focused provider tests for HTTP 401 and HTTP 403. Each test must prove the stable error code, exact sanitized diagnostic token, response-body cancellation, and absence of the private response-body marker from the serialized error. Run the focused provider test first, then the repository's normal verification gate before publication.

## Scope

No retry behavior, provider routing, workflow secret scope, model selection, or public copy changes. After the change reaches `main`, rerun only issue #504 as the canary and inspect its exact diagnostic before any queue drain.
