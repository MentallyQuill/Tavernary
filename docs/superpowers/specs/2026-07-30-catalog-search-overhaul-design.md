# Catalog Search Overhaul Design

**Date:** 2026-07-30
**Status:** Approved for implementation planning

## Summary

Tavernary's homepage is a search-first catalog, but its current search treats
the complete normalized query as one contiguous substring of one flattened
string. This causes intuitive multi-term searches such as `preset freaky` to
miss `Preset Introducing Freaky Frankenstein 50`. It also prevents meaningful
relevance ordering, field weighting, controlled typo tolerance, and useful
match explanations.

Replace the substring matcher with structured, client-side full-text search
powered by [MiniSearch](https://github.com/lucaong/minisearch). Tavernary will
own the search-document contract, field authority, query policy, relevance
boosts, sort transitions, fallbacks, and regression corpus. MiniSearch will
provide the inverted index, baseline relevance scoring, exact and prefix
matching, bounded fuzzy matching, field boosts, and match metadata.

The browser remains fully static. Search makes no runtime network calls and
does not require a hosted search service, account system, telemetry backend, or
production database.

## Goals

- Make ordinary multi-word searches work as users expect.
- Search every authoritative text field represented by project and Kit cards.
- Require every meaningful query term while allowing terms to appear in any
  order and across different fields.
- Rank search results by relevance by default.
- Give exact titles, aliases, repository identities, and title terms priority.
- Tolerate likely spelling mistakes conservatively.
- Preserve immediate search-as-you-type behavior.
- Compose search with every existing category, view, and filter constraint.
- Preserve shareable and reloadable URL query state.
- Explain otherwise invisible matches without cluttering ordinary cards.
- Keep search deterministic, testable, and entirely client-side.
- Provide a functional exact-token fallback if MiniSearch cannot initialize.

## Non-goals

- Semantic, vector, embedding, or natural-language intent search.
- A hosted search service or runtime search API.
- Search analytics or popularity-driven ranking.
- A public advanced query language.
- Automatic synonym inference from repository prose.
- Searching data that is unavailable to or intentionally excluded from the
  public catalog.

## Current-state findings

The generated catalog currently provides one lowercase `searchableText` string
per project or Kit. Project selection trims and lowercases the complete query,
then checks:

```ts
project.searchableText.includes(search)
```

The generated project string includes many useful values, but field boundaries
are lost and source types do not populate it consistently. Current indexed
values include some combination of:

- project name;
- kind;
- summary;
- primary-function label;
- frontend labels;
- controlled-tag labels and aliases;
- preset model families and completion formats;
- repository owner and contributor logins.

The current approach has four structural limitations:

1. Multi-word terms must be contiguous and ordered.
2. All fields have equal authority because they are flattened together.
3. No relevance score or match evidence exists.
4. Exact, prefix, and typo matches cannot be distinguished.

The current build also demonstrates why generated search data needs validation:
one manual-source card contains `[object Object]` in `searchableText` because a
primary-function vocabulary entry is joined instead of its label.

## Search architecture

### Tavernary-owned boundary

Add a focused search module that is the only application layer allowed to call
MiniSearch. Catalog selectors and React components consume Tavernary types and
functions rather than MiniSearch objects.

The boundary exposes concepts equivalent to:

```ts
interface CatalogSearchMatch {
  id: string;
  score: number;
  evidence: SearchEvidence[];
}

interface CatalogSearchResults {
  normalizedQuery: string;
  matches: CatalogSearchMatch[];
  correction: string | null;
}

searchProjects(index, query): CatalogSearchResults
searchKits(index, query): CatalogSearchResults
```

These names define the public search-module vocabulary. Internal helpers remain
private. The boundary must stay pure, deterministic, and independently
testable.

### Separate Project and Kit indexes

Projects and Kits use separate MiniSearch indexes because their searchable
fields, filters, and browsing sorts differ. Each index is created once per
generated catalog and memoized outside render-time query handling.

At the current catalog size—roughly 311 projects and eight Kits—index creation
and synchronous search should remain inexpensive. Do not introduce a worker or
serialized index unless measured browser performance or payload evidence
justifies one.

### Structured search documents

Catalog generation produces structured search documents rather than relying on
one undifferentiated text blob.

Project search fields:

- `title`;
- curated project aliases;
- canonical repository or source identity;
- summary;
- project kind;
- primary-function label and aliases;
- controlled-tag labels and aliases;
- frontend labels and aliases;
- model-family and completion-format labels and aliases;
- repository owner, organization, and contributor identities;
- relationship, predecessor, and parent-project names when published;
- other authoritative user-visible card metadata.

Kit search fields:

- Kit title;
- description;
- author identity;
- included-project names and aliases;
- frontend labels and aliases;
- purpose labels and aliases;
- model-family labels and aliases;
- other authoritative user-visible Kit-card metadata.

Fields derived from controlled vocabularies include both their canonical labels
and curated aliases. Repository identities include useful compact and separated
forms. Search must not infer unsupported aliases from arbitrary similarity.

The existing `searchableText` field may remain temporarily during migration but
must not remain the long-term search authority.

## Query normalization

Normalize indexed terms and user queries through one shared contract:

- Unicode-aware lowercase comparison;
- diacritic-insensitive matching;
- collapsed whitespace;
- punctuation, slashes, underscores, and hyphens treated as useful boundaries;
- compact and separated technical forms, such as `SillyTavern` and
  `silly tavern`;
- deterministic handling for usernames and repository identities;
- no query-state rewrite that changes the user's visible input.

Ignore only `a`, `an`, `and`, `for`, `of`, `the`, `to`, and `with`, and only
when at least one other meaningful term remains. Exact complete-title scoring
still considers the complete normalized phrase before function words are
removed. A query containing only function words remains searchable rather than
becoming empty.

Whitespace-only and capitalization-only edits do not change query meaning.

## Match eligibility

Every meaningful query term must match somewhere in the search document.
Terms:

- may appear in any order;
- may match different fields;
- may match exact terms, eligible prefixes, or eligible fuzzy terms;
- must all satisfy the match policy for the card to remain eligible.

MiniSearch uses `combineWith: "AND"` for ordinary searches.

Prefix matching is available for terms of at least three characters so
search-as-you-type remains useful without making one- and two-letter queries
excessively broad.

Conservative fuzzy policy:

- terms shorter than five characters receive no typo tolerance;
- terms of five to seven characters permit at most one edit;
- terms of eight or more characters permit at most two edits;
- exact and prefix matches always rank above fuzzy matches;
- fuzzy matching never changes the all-term requirement.

The implementation may tune MiniSearch's numeric fuzzy options to enforce these
absolute limits, but it may not broaden them without relevance-corpus evidence
and design review.

## Relevance ranking

Relevance ordering combines MiniSearch's term-frequency scoring and field
boosts with Tavernary-owned exactness and proximity bonuses.

Match priority, strongest to weakest:

1. Exact complete title.
2. Exact curated alias or canonical repository identity.
3. Exact query phrase inside the title.
4. All exact query terms in the title, with a proximity bonus.
5. Exact terms across title and high-authority metadata.
6. Exact terms in summaries, compatibility, maintainers, or relationships.
7. Prefix matches.
8. Conservative fuzzy matches.

Initial field weighting should follow this authority order:

1. title;
2. curated aliases;
3. repository or canonical source identity;
4. primary function and controlled tags;
5. summary;
6. frontends and model compatibility;
7. owners, organizations, and contributors;
8. relationships and other supporting metadata.

Exact numeric weights belong in the implementation plan and relevance corpus,
not in this design contract. Weight changes require evidence from the corpus.

Common terms such as `preset` contribute less than distinctive terms such as
`freaky`. Relevance ties fall back to recent activity and then stable
alphabetical identity.

For `preset freaky`, both exact title tokens match even though they are not
adjacent. `Preset Introducing Freaky Frankenstein 50` is therefore eligible
and ranks highly.

## Search and sort state

Project browsing currently offers:

- Recent Activity;
- Sustained Activity;
- Popularity;
- Alphabetical.

Kit browsing has an independent set of four Kit-specific sorts. Each mode
remembers its own browsing sort.

When the effective normalized query is empty:

- Relevance is absent from the active mode's sort dropdown;
- the remembered non-search browsing sort is active;
- all otherwise eligible cards remain visible.

When the effective normalized query becomes nonempty:

- Relevance appears as a fifth sort option;
- Relevance becomes active automatically;
- a search URL with no explicit sort means Relevance.

While a query is unchanged, the user may select any non-relevance sort. That
changes ordering only; it does not alter match eligibility.

Any meaningful query change restores Relevance. Whitespace-only or
capitalization-only edits do not reset a manual override.

When search is cleared:

- Relevance disappears immediately;
- the prior non-search browsing sort is restored;
- if no prior sort is known, use the mode's existing default.

A shared or reloaded search URL with an explicit non-relevance sort preserves
that override. A shared search with no explicit sort uses Relevance. If a
reloaded search has no remembered pre-search sort, clearing it falls back to
the mode default.

Browser back and forward navigation must restore the visible query, effective
sort, filters, and results without rewriting the search field.

## Selector and filter composition

Search determines the eligible card IDs and their relevance scores. Existing
category, view, and filter contracts continue to constrain that eligible set.

- OR semantics within an existing filter group remain unchanged.
- AND semantics across filter groups remain unchanged.
- Search remains ANDed with every selected category and filter.
- A manual sort comparator reorders the matching set.
- Relevance ordering applies only when Relevance is selected.
- Filters do not alter or recompute a card's textual relevance score.

Relationship views that intentionally replace ordinary selection retain their
existing explicit behavior unless the implementation plan identifies a
conflict and returns it for design review.

## Search-result feedback

Visible title or summary matches require no explanation.

When a card matches only through information that is hidden or secondary in
the current density, show one restrained search-only evidence line, such as:

- `Matched maintainer: MentallyQuill`
- `Matched compatibility: Claude`
- `Matched alias: World Info`

Evidence is user-facing context, not a score or debugging panel. Prefer the
highest-authority useful reason and avoid repeating information already obvious
in the visible title or summary.

No-result states distinguish:

- no card matching all meaningful terms;
- textual matches excluded by active filters;
- a likely spelling correction;
- an empty catalog mode.

Use MiniSearch suggestions only when exact and prefix all-term matching returns
no cards and a conservative correction produces at least one eligible card.
Present the correction as an explicit `Did you mean` action. Never silently
replace the user's query.

The existing `/` shortcut, active search chip, clear behavior, URL sharing,
keyboard access, and immediate visible result count remain.

Result-count announcements use a short accessibility-only delay so rapid
typing does not announce every intermediate character. Visual filtering remains
immediate.

## Failure handling

Search is core infrastructure and must degrade visibly but safely.

- Catalog generation rejects malformed search documents.
- Required search fields cannot be silently omitted for supported card types.
- Non-string values and accidental strings such as `[object Object]` fail
  validation.
- MiniSearch initialization or query failure falls back to deterministic exact
  all-term matching.
- Fallback search preserves filters and manual sorts.
- A failure never hides the complete catalog, mutates catalog data, or silently
  changes AND matching to OR.
- Development and test environments surface the underlying error.

The fallback does not need fuzzy matching, suggestions, or full relevance
quality. It exists to preserve basic catalog discovery.

## Relevance corpus

Maintain a versioned relevance corpus as the primary quality gate. Each case
can specify:

- query;
- required result IDs;
- forbidden result IDs;
- expected top result or ordered prefix;
- active mode;
- optional filters;
- optional manual sort;
- reason for the expectation.

The initial corpus covers at least:

- `preset freaky`;
- reversed and noncontiguous terms;
- exact titles and partial titles;
- conservative misspellings;
- aliases and repository names;
- creators, owners, organizations, human contributors, and bot contributors;
- project kinds, primary functions, tags, and frontend compatibility;
- model families and completion formats;
- punctuation, case, diacritic, compact, and hyphen variants;
- terms split across multiple fields;
- common terms paired with distinctive terms;
- false positives that fuzzy matching must reject;
- active filters and every manual sort override;
- Project and Kit search;
- hidden-field evidence selection.

Changes to tokenization, field weights, boosts, fuzzy limits, or source-field
coverage must update or extend the corpus and demonstrate why result quality
improves.

## Verification

### Unit tests

- shared normalization and tokenization;
- exact, prefix, fuzzy, and rejected-fuzzy boundaries;
- all-term matching across fields;
- order independence;
- field weights and exact-title boosts;
- phrase and proximity bonuses;
- deterministic tie-breaking;
- match-evidence selection;
- fallback exact-token search;
- Project and Kit index behavior;
- relevance-corpus expectations;
- search and sort state transitions;
- URL parse and serialization rules.

### Catalog-build tests

- complete search-document coverage for every generated card;
- authoritative field mapping for each source type;
- vocabulary-label and alias coverage;
- repository attribution coverage;
- no malformed or stringified object values;
- generated schema and static-export compatibility.

### Component and browser tests

- character-by-character multi-word typing;
- spaces retained in the visible input;
- Relevance appearing, activating, and disappearing;
- manual sort override and reset after meaningful edits;
- restoration of the prior browsing sort;
- reload, shared URL, and back/forward behavior;
- filter composition and filtered-zero-result messaging;
- visible hidden-field evidence;
- keyboard focus and clearing;
- screen-reader result-count announcement behavior;
- Project and Kit modes;
- desktop and mobile layouts.

### Performance and payload checks

- create each index once per catalog;
- measure index-construction and representative query time on the generated
  catalog;
- compare generated payload and production JavaScript size before and after;
- avoid a worker or serialized index unless measurements require one;
- keep input and visible result updates responsive on supported mobile
  browsers.

Performance measurements should detect substantial regressions without using
fragile machine-specific timing assertions as the sole CI gate.

## Migration sequence

1. Add the relevance corpus and failing search-engine contract tests.
2. Add MiniSearch and the isolated Tavernary search boundary.
3. Generate and validate structured Project and Kit search documents.
4. Replace substring eligibility with all-term MiniSearch results.
5. Add Tavernary exactness, phrase, proximity, and evidence logic.
6. Add Relevance and the approved sort-state transitions.
7. Add no-result, correction, evidence, URL, and accessibility behavior.
8. Remove obsolete flattened search authority after parity and corpus gates
   pass.
9. Run focused, full, static-export, browser, payload, and live-page
   verification before release.

## Acceptance criteria

- `preset freaky` returns and highly ranks
  `Preset Introducing Freaky Frankenstein 50`.
- Every meaningful query term is required across the complete structured card
  search document.
- Exact and title matches outrank prefix and fuzzy matches.
- Conservative typo limits reject unrelated cards.
- Search defaults to Relevance and resets to it after meaningful edits.
- Users may manually choose another sort for the unchanged query.
- Clearing search removes Relevance and restores the prior browsing sort.
- Project and Kit search remain immediate, shareable, filterable, and fully
  client-side.
- Every generated card passes search-document validation.
- The relevance corpus, full unit suite, static export, and browser search
  flows pass.
