# Project Creator and Contributor Attribution

**Date:** 2026-07-25
**Status:** Approved design

## Goal

Make GitHub-backed project cards searchable by repository owner and every
GitHub contributor. Add a quiet attribution line below the project title in
standard desktop and mobile cards:

```text
Directive
by MentallyQuill
```

When the repository has additional human contributors, show:

```text
Directive
by MentallyQuill, plus 5 contributors
```

The complete contributor set, including bot and AI accounts, remains
searchable and is available from the attribution line on desktop. Compact mode
hides the attribution line at every viewport size.

## Product Rules

- Use stable GitHub usernames, not profile display names.
- Search matches the repository owner and every linked GitHub contributor,
  including bot and AI accounts.
- The visible `plus N contributors` count:
  - excludes the repository owner;
  - excludes bot and AI accounts;
  - uses singular grammar for one contributor;
  - is omitted when there are no additional human contributors or contributor
    data is not yet available.
- Bot and AI accounts remain present in search and in the complete contributor
  disclosure.
- A contributor is a linked GitHub account returned by GitHub's repository
  contributors endpoint. Anonymous commit identities are excluded because they
  do not have the stable GitHub username required by this feature.
- GitHub-backed projects show the attribution line. Non-GitHub sources do not.
- Standard desktop and mobile cards show the attribution line.
- Desktop and mobile compact cards hide the entire attribution line.
- The mobile attribution line is not a separate tap target. The card remains a
  single predictable link to the project's canonical URL.

## Data Architecture

### Existing boundary

Tavernary remains a static, build-time catalog:

```text
GitHub APIs
  -> data/snapshots/github/<project-id>.json
  -> scripts/catalog/build.mjs
  -> src/generated/catalog.json
  -> client-side search and cards
```

The browser does not call GitHub, and this feature introduces no runtime
backend.

Repository snapshots already capture the repository owner's GitHub username in
`repository.owner`. The refresh pipeline will add contributor facts to the same
snapshot so each project's generated GitHub data remains co-located.

### Snapshot contributor data

Repository snapshot schema v2 gains an optional contributor-data object. It is
optional for backward compatibility with existing snapshots that have not yet
been refreshed.

The object records:

- every linked contributor's GitHub `login`;
- the GitHub account `type`;
- the last successful contributor refresh timestamp;
- a contributor-specific stale timestamp, or `null` while current.

An absent contributor-data object means the project has not completed a
contributor refresh. It does not mean the project has zero contributors.

The stored list contains source facts. Bot and AI classification is derived
during the catalog build so display policy does not masquerade as GitHub data.

### Contributor collection

For every GitHub project selected by the existing refresh mode:

1. Use the already-observed repository owner and name.
2. Request `GET /repos/{owner}/{repo}/contributors?per_page=100`.
3. Follow every GitHub pagination page. Do not impose an application-level
   contributor cap.
4. Keep only linked GitHub accounts with non-empty usernames.
5. Deduplicate usernames case-insensitively.
6. Store the deterministic result in the project's repository snapshot.

Contributor requests are concurrency-limited. Their requests are included in
the refresh manifest's REST request accounting.

### Refresh failures

Contributor collection is supplemental to the repository observation:

- A project-specific contributor failure preserves the last successful
  contributor list and marks only that contributor data stale.
- A first contributor failure leaves contributor data unknown. The card can
  still identify the repository owner without inventing an empty contributor
  list.
- Contributor failure does not discard successfully observed activity,
  license, community, or repository facts.
- Authentication failure or GitHub rate exhaustion is systemic and stops the
  refresh.
- Existing snapshot failure recovery continues to preserve the last successful
  project snapshot.

## Generated Catalog Contract

Each GitHub-backed `CatalogProject` gains attribution data containing:

- `owner`: the repository owner's GitHub username;
- `contributors`: the complete, case-insensitively deduplicated contributor
  list;
- `humanContributorCount`: the number of additional non-bot contributors after
  excluding the owner;
- contributor freshness state sufficient to distinguish current, stale, and
  not-yet-collected data.

The build classifies an account as bot or AI when:

- GitHub reports account type `Bot`;
- the username ends in `[bot]`; or
- the normalized username is `claude` or starts with `claude-` or `claude_`.

The owner is excluded from contributor groups and from
`humanContributorCount`, even when GitHub also returns that username as a
repository contributor.

`searchableText` includes the owner and every contributor username before it is
lowercased. This makes human, bot, and AI identities searchable in every layout
mode.

For a GitHub project whose snapshot is still pending, the build derives the
owner username from the curated `owner/repository` identity. Contributor data
remains unknown until the first successful contributor refresh.

## Card Presentation

The standard card renders a `card-attribution` line directly below the title:

- `by MentallyQuill`
- `by MentallyQuill, plus 1 contributor`
- `by MentallyQuill, plus 5 contributors`

The attribution is smaller and more muted than the title while remaining
legible. It is visible on standard desktop and mobile cards.

`.compact-cards .card-attribution` is hidden, ensuring that compact mode omits
the line on desktop and mobile without maintaining two rendering paths.

### Desktop disclosure

Hovering the complete attribution line shows a tooltip that separates the
identities:

```text
Owner: MentallyQuill · Contributors: Alice, Bob · Bots/AI: Claude
```

Empty groups are represented clearly rather than as blank labels. For example:

```text
Owner: MentallyQuill · No additional contributors reported by GitHub
```

When contributor data has not completed its first refresh, the tooltip states
that contributor data is pending. Stale contributor data may still be shown
because it is the last successful known list.

### Mobile and accessibility

Mobile shows the attribution text but does not create a second interactive
target inside the card. Tapping the card continues to open its canonical GitHub
URL.

The card's existing accessible description includes:

- the owner;
- all additional human contributor usernames;
- all bot and AI contributor usernames; and
- contributor-data pending state when applicable.

This gives keyboard and screen-reader users the complete identity information
without adding another tab stop or competing with the title-summary tooltip
that already appears when the card link receives focus.

## Verification

### Refresh and schema tests

- Accept snapshot v2 files both with and without contributor data.
- Collect all pages from the contributors endpoint.
- Reject or recover from malformed contributor responses deterministically.
- Deduplicate usernames case-insensitively.
- Count contributor REST requests in refresh accounting.
- Preserve prior contributor data on a project-specific failure.
- Leave contributor data unknown after a first-time failure.
- Abort on authentication failure or exhausted rate limits.

### Build and search tests

- Generate owner and contributor attribution for GitHub projects.
- Derive the owner while contributor data is pending.
- Exclude non-GitHub projects from attribution.
- Exclude the owner and bot/AI accounts from the visible count.
- Retain bot/AI accounts in the complete list.
- Match search by owner, human contributor, and bot/AI contributor.

### Component and interaction tests

- Render zero, singular, and plural contributor copy.
- Render complete desktop tooltip groups, including bot/AI accounts.
- Include complete attribution in the card's accessible description.
- Keep mobile attribution non-interactive and preserve card navigation.
- Hide attribution in compact desktop and compact mobile layouts.

### End-to-end proof

Run the repository's catalog checks, unit suite, E2E suite, and visual suite.
When GitHub credentials are available, run a targeted Directive refresh and
catalog build, then verify that:

- its snapshot owner is `MentallyQuill`;
- its complete contributor list is stored;
- generated catalog search text contains those identities;
- the standard card renders the approved attribution; and
- compact mode omits it.

## Out of Scope

- Browser-time GitHub requests.
- A Tavernary runtime backend or contributor database service.
- Profile display names, avatars, biographies, or contributor profile cards.
- Anonymous commit identities without GitHub usernames.
- A mobile contributor popover, sheet, or secondary card action.
- Manual editorial contributor lists.
