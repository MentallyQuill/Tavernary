# Provider-Neutral Enrichment Sources

**Date:** 2026-07-27

**Status:** Approved design

## Summary

Tavernary will enrich projects through explicit source adapters instead of
assuming every automatic source is a GitHub repository. Repository adapters
will prefer README content over short repository descriptions. An allowlisted
Reddit adapter will make canonical Reddit post sources eligible for automatic
enrichment without introducing a general-purpose web crawler.

This design also records two catalog decisions:

- disable Lumiverse ChatRoom and Lumiverse SpotifyControls as removed projects;
- move Writer's Block 5 from manual to automatic enrichment while retaining its
  canonical Reddit permalink.

The approved first-class Codeberg provider design remains authoritative for
Codeberg identity, evidence, refresh, and publication behavior. This design
defines the enrichment-source contract that GitHub and Codeberg repository
providers share.

## Goals

- Use the most complete source material available for model enrichment.
- Prefer a usable repository README over the repository's short description.
- Support automatic enrichment for recognized Reddit post permalinks.
- Keep automatic external-page fetching restricted to explicit source
  adapters.
- Preserve source provenance in durable enrichment reports.
- Keep failures isolated to the affected project and compatible with the
  existing durable retry workflow.
- Delist the two requested Lumiverse projects without deleting historical
  registry records.

## Non-goals

- Crawling arbitrary external URLs.
- Fetching Reddit comments, user profiles, linked downloads, or outbound pages.
- Adding support for GitLab or arbitrary Forgejo/Gitea hosts.
- Replacing the approved Codeberg provider architecture.
- Inferring mirror relationships across GitHub and Codeberg.
- Changing enrichment output validation, controlled vocabularies, or provider
  selection.

## Source Adapter Contract

The enrichment runner will consume a normalized source result rather than call
a GitHub-specific README loader directly.

```ts
type EnrichmentSourceKind =
  | "readme"
  | "description"
  | "reddit-body"
  | "reddit-title"
  | "confirmed-fallback";

type EnrichmentSourceResult =
  | {
      status: "ready";
      sourceKind: Exclude<
        EnrichmentSourceKind,
        "confirmed-fallback"
      >;
      text: string;
      provenance: Record<string, string | number | null>;
    }
  | {
      status: "fallback";
      sourceKind: "confirmed-fallback";
      provenance: Record<string, string | number | null>;
    }
  | {
      status: "source-not-ready" | "failed";
      reasonCode: string;
      message: string;
      provenance: Record<string, string | number | null>;
    };
```

Each adapter owns host-specific retrieval and normalization. Shared enrichment
logic owns provider invocation, output validation, retries, safe registry
writes, reporting, publication, and deployment verification.

Adapter selection is determined from the canonical registry source:

- `github` selects the GitHub repository adapter;
- `codeberg` selects the Codeberg repository adapter after the approved
  Codeberg provider work introduces that source type;
- `url` selects a page adapter only when the canonical URL matches an explicit
  supported identity, initially a Reddit post permalink;
- unsupported URLs remain manual and are never fetched by automatic
  enrichment.

## Repository Source Priority

GitHub and Codeberg repository adapters use this order:

1. Retrieve and normalize the README at the immutable repository head used by
   the evidence snapshot.
2. If the README is non-empty, textual, and usable, return it as `readme`.
3. Otherwise, use a non-empty repository description as `description`.
4. If neither source is usable and absence was confirmed, return
   `confirmed-fallback`.
5. Treat authentication, rate-limit, identity, stale-snapshot, malformed
   response, and transient upstream failures as source failures rather than
   confirmed absence.

The model receives only one selected source body. README-first enrichment will
therefore generally send more text and cost more than description-first
enrichment, but it should produce more accurate summaries and classifications.
Existing input-size bounds and untrusted-content handling continue to apply.

The deterministic fallback remains:

`No README file found.`

It remains a curated outcome, not a provider failure.

## Reddit Adapter

The first external-page adapter supports canonical Reddit post permalinks
recognized by Tavernary's source-identity parser.

It will:

- fetch only the canonical Reddit post through a fixed Reddit origin;
- use a bounded machine-readable post response rather than scrape arbitrary
  rendered HTML;
- if Reddit denies the post-listing request, use a separately bounded official
  oEmbed response only as an identity-checked title fallback;
- validate that the returned post ID matches the canonical registry identity;
- normalize the post's self-text and title as plain untrusted text;
- use substantive self-text as `reddit-body`;
- fall back to a substantive title as `reddit-title`;
- exclude comments, author history, embeds, media payloads, linked artifacts,
  and outbound URLs;
- reject redirects outside the existing allowlisted Reddit hosts;
- bound response size, redirect count, text length, request duration, and
  retry behavior;
- classify deleted, removed, private, quarantined, rate-limited, malformed, and
  transient responses with explicit reason codes.

A post with no usable body but a usable title may be enriched from the title.
A title recovered from oEmbed is treated the same way; oEmbed HTML is inspected
only for the canonical post ID and is never passed to the provider.
A confirmed post with neither usable body nor title produces a source failure,
not the repository-specific `No README file found.` fallback.

## Enrichment Policy

Automatic eligibility becomes capability-based rather than equivalent to
`source.type === "github"`.

Eligible automatic records must be:

- published;
- marked `enrichment_policy: "automatic"`; and
- backed by a registered automatic source adapter.

Policy defaults become:

- GitHub repository: automatic;
- Codeberg repository: automatic;
- recognized Reddit post permalink: automatic;
- other external URL: manual;
- GitHub organization collection: manual.

Manual records continue to require `enrichment_note`. Automatic records
continue to forbid it. Schema and semantic validation must reject an automatic
URL record when no registered adapter recognizes its canonical source.

`refresh_policy` remains independent. Reddit records may retain
`refresh_policy: "paused"` because repository activity refresh and editorial
enrichment are separate concerns.

## Durable State and Reporting

The existing rollout state machine remains responsible for primary attempts,
repair retries, checkpoint publication, and deployment verification.

Durable entries will record adapter-neutral provenance:

- project ID;
- source kind;
- canonical source identity;
- immutable repository head and README path/ref for repository sources;
- Reddit post ID for Reddit sources;
- provider model and latency for model-backed outcomes;
- reason code, repair hint, and sanitized message for failures.

Reports and logs must not store README text, Reddit post text, prompts, raw
provider content, authorization headers, cookies, or secrets.

The source kinds reported by this design are:

- `readme`;
- `description`;
- `reddit-body`;
- `reddit-title`;
- `confirmed-fallback`.

Manual exclusions continue to be reported separately from attempted automatic
records.

## Requested Registry Changes

Lumiverse ChatRoom and Lumiverse SpotifyControls remain in the canonical
registry for history and source-identity duplicate detection, but change to:

```json
{
  "visibility": "disabled",
  "visibility_reason": "removed"
}
```

Disabled records are not selected for enrichment or emitted as visible catalog
cards.

Writer's Block 5 retains its canonical Reddit source and changes to:

```json
{
  "enrichment_policy": "automatic"
}
```

Its manual `enrichment_note` is removed. Its provisional summary and metadata
remain unchanged until a successful automatic enrichment pass writes validated
curated output.

## Failure Handling

- Missing or unusable repository README falls through to the repository
  description.
- Confirmed absence of both repository sources uses the curated fallback.
- A stale or mismatched repository snapshot is `source-not-ready`.
- Reddit identity mismatch is a permanent source failure for that attempt.
- Reddit rate limits and upstream failures are retryable within existing
  durable retry bounds.
- Deleted, removed, or inaccessible Reddit posts remain unresolved and leave
  the registry record unchanged.
- Unsupported external URL hosts remain manual and are not attempted.
- Provider output failures retain existing validation and repair behavior.
- One project failure does not roll back successfully validated projects.

## Security and Resource Bounds

- Automatic page adapters are registered in code; registry data cannot select
  an arbitrary adapter or request origin.
- Reddit requests use fixed allowed origins and bounded redirects.
- Repository requests use the fixed provider API origins established by their
  provider adapters.
- Embedded credentials, non-HTTPS sources, unexpected response types, and
  identity changes are rejected.
- Upstream content is treated strictly as untrusted model input and is never
  executed or rendered as HTML.
- Fetch sizes, selected text size, pagination, concurrency, timeouts, and retry
  counts are bounded.
- Runtime browser code does not fetch enrichment sources.

## Verification Strategy

Implementation will follow test-driven development.

### Source contract tests

- A repository with both sources selects README content.
- A repository with no usable README selects its description.
- A repository with neither source produces confirmed fallback.
- Empty, binary, badge-only, oversized, and malformed README content follows
  the correct fallback or failure path.
- GitHub and Codeberg normalized repository inputs produce the same selection
  semantics.

### Reddit adapter tests

- Canonical Reddit permalinks select the Reddit adapter.
- Substantive self-text is preferred over the title.
- A missing body falls back to the title.
- Comments and outbound content are excluded.
- Redirect, post-ID mismatch, deletion, removal, rate-limit, timeout,
  oversized-response, and malformed-payload cases receive deterministic
  classifications.
- Arbitrary external URLs are not eligible for automatic enrichment.

### Policy and orchestration tests

- Recognized Reddit URL records may be automatic and forbid
  `enrichment_note`.
- Unsupported URL records must remain manual with a note.
- Codeberg records use automatic policy once the approved provider source type
  exists.
- Selection includes published automatic GitHub, Codeberg, and Reddit records.
- Disabled records are excluded.
- Retry state and sanitized reports preserve the new source kinds.

### Catalog tests

- Both Lumiverse records are disabled with reason `removed`.
- Writer's Block 5 is automatic, provisional before enrichment, and has no
  manual note.
- Catalog build omits disabled Lumiverse cards.
- A successful Writer's Block 5 enrichment produces validated curated
  metadata.
- Full schema validation, unit tests, catalog build, typecheck, export, and
  relevant workflow tests pass.

### Live proof

After deterministic verification:

1. Read a GitHub project with both a README and description and prove that the
   durable result records `source_kind: "readme"`.
2. Read the canonical Writer's Block 5 Reddit post through the new adapter and
   verify the normalized source without logging its full body.
3. Run targeted automatic enrichment for Writer's Block 5 and verify the
   registry record, generated card, deployment artifact, and durable report.
4. After the approved Codeberg provider implementation is available, run the
   existing Codeberg smoke and verify README-first enrichment through the same
   normalized contract.

## Acceptance Criteria

- GitHub enrichment uses README before description.
- Codeberg enrichment uses the same README-first contract when its approved
  provider implementation lands.
- Recognized Reddit posts can be automatically enriched through the allowlisted
  adapter.
- Unsupported external URLs remain manual and are never automatically fetched.
- Writer's Block 5 is eligible for automatic enrichment.
- Lumiverse ChatRoom and Lumiverse SpotifyControls no longer appear in the
  public catalog.
- Durable reports distinguish source selection and failures without retaining
  source bodies or secrets.
- Deterministic tests and live proof pass before the behavior is considered
  complete.
