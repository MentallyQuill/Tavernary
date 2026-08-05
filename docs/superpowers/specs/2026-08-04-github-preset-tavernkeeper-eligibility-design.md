# GitHub Preset TavernKeeper Eligibility Design

**Status:** Approved for implementation on 2026-08-04.

## Purpose

TavernKeeper eligibility is determined by whether a published Tavernary project is backed by an active, healthy GitHub repository with a stable repository ID and an exact 40-character head SHA. Project kind does not affect eligibility.

This policy supersedes the earlier assumption that presets should be excluded because they do not execute as extensions or applications. A preset repository can still contain dangerous links, prompt instructions, executable examples, regex scripts, helper code, or other security-relevant material. TavernKeeper therefore scans the entire exact-SHA repository for GitHub-backed presets through the same pipeline used for extensions and frontends.

## Eligibility Contract

A project is eligible when all of the following are true:

- The project is published and active in Tavernary.
- Its source is a single GitHub repository, not an organization page or arbitrary URL.
- The source is active and has a positive immutable GitHub repository ID.
- Tavernary has a matching healthy GitHub snapshot with no stale marker.
- The snapshot repository identity matches the registered source identity.
- The snapshot supplies a lowercase 40-character head SHA.

The project may be an extension, frontend, or preset. Non-GitHub URLs, Codeberg sources, GitHub organization pages without a single repository identity, inactive sources, unhealthy snapshots, stale snapshots, identity mismatches, and malformed or missing SHAs remain ineligible.

## Architecture and Data Flow

Tavernary remains the eligibility authority. Its target-manifest builder publishes one repository target per eligible GitHub repository at the exact observed SHA. Preset-only repositories carry `project_kinds: ["preset"]`; repositories shared by multiple cards carry the sorted unique kinds represented by their eligible published cards.

TavernKeeper already accepts `preset` in its target contract and scan-session types. It consumes the expanded manifest without a scanner or report-schema change, inventories and scans the entire repository, publishes the existing immutable technical report, and wakes Tavernary through the existing reconciliation path.

Tavernary's card-status projection uses the same source boundary. An eligible GitHub-backed preset with no assessment is gray and unassessed or unavailable according to snapshot state. When an assessment exists, the preset receives the normal risk color, exact-SHA freshness state, report link, and history behavior. Unsupported state is reserved for sources that are not active GitHub repositories.

The protected staff-targeted scan resolver accepts an active preset card when its canonical URL resolves to the same registered GitHub repository identity. It continues rejecting arbitrary or unregistered repositories and continues dispatching only the repository ID as a non-authoritative hint.

## Implementation Scope

The change removes the obsolete preset-kind exclusion from three existing Tavernary boundaries:

1. Target-manifest metadata construction.
2. Catalog card scan-status derivation.
3. Staff targeted-scan request resolution.

Existing GitHub identity, health, exact-SHA, publication, authorization, wake, and report-validation checks remain unchanged. No new scanner mode, source adapter, queue lane, report schema, public API, or user-controlled clone input is introduced.

Normative TavernKeeper integration documentation will describe source-based eligibility. Historical acceptance documentation will retain its record of the earlier rollout but state that its preset exclusion was later superseded by this design.

## Failure Handling and Safety

- A missing or unhealthy snapshot prevents manifest publication but does not relabel an otherwise GitHub-backed card as a permanently unsupported source; the card uses the existing unavailable state.
- Repository identity conflicts and malformed SHAs continue to fail closed.
- TavernKeeper continues treating checked-out repositories as untrusted data and does not execute target dependencies, scripts, builds, tests, Actions, or executables.
- Existing bounded retries, failure-domain isolation, exact-SHA report identity, and advisory, not guarantee, language remain unchanged.

## Verification

Regression coverage must prove:

- A healthy preset-only GitHub source appears in the V3 target manifest with `project_kinds: ["preset"]` and its existing popularity rank.
- A GitHub-backed preset follows gray, assessed, stale, and unavailable card states instead of unsupported state.
- Non-GitHub sources remain unsupported.
- The staff resolver accepts a published preset repository and still rejects unsupported source types, inactive sources, unregistered repositories, and unauthorized operators.
- Existing extension/frontend behavior remains unchanged.
- The generated production target manifest contains every currently active, healthy, exact-SHA GitHub preset repository.

Focused unit tests run first through a red-green cycle. Tavernary's complete `npm.cmd run check` gate and static-export verification run before publication. After merge, the exact merged SHA, Pages deployment, deployed target manifest, TavernKeeper reconciliation, and eventual imported preset assessment state are verified through the existing production workflow.

## Out of Scope

- Scanning arbitrary preset download URLs, Reddit posts, Codeberg repositories, or GitHub organization pages.
- Limiting scans to files believed to be preset artifacts.
- Adding preset-specific risk rules or changing TavernKeeper's assessment model.
- Changing catalog ranking, report presentation, moderation, or listing visibility.
