# Search Plus OR Design

## Goal

Allow one Tavernary search to combine multiple ordinary searches with `+`, so
the complete result set and its copied URL can be shared. Each clause keeps the
existing all-meaningful-terms, relevance, prefix, fuzzy, alias, metadata,
Project, Kit, filter, and sort behavior.

## Syntax

- `vectfox+summaryception` means `(vectfox) OR (summaryception)`.
- `Stab's Directives+Directive` means
  `(Stab's AND Directives) OR (Directive)`.
- Any number of nonempty clauses is accepted, so `a+b+c` is valid.
- Whitespace around a clause is normalized by the existing search rules.
- Empty clauses are ignored. `a++b` and `a+b+` behave like `a+b`.
- A result matching more than one clause appears once.
- This release adds no exclusion, quoting, field-filter, or precedence syntax.

The visible field continues to preserve exactly what the user types while
editing. The URL continues to use one `q` parameter. `URLSearchParams` encodes
a literal operator as `%2B`, so a copied OR search restores `+`; an ordinary
URL such as `?q=preset+freaky` retains standard form semantics and restores the
space-separated search `preset freaky`.

## Search architecture

Add a focused expression parser to search normalization. It splits the raw
value on literal `+`, applies the current clause normalization independently,
drops empty clauses, and exposes a canonical expression meaning joined by `+`.
This keeps `a b` distinct from `a+b` for result-cache validation and search-sort
transitions without changing ordinary query meaning.

The existing MiniSearch index remains Tavernary's only search engine. Its
public `search()` operation runs each normalized clause through the current
single-clause AND search, unions the matches, and sorts the union with the
existing relevance scores and deterministic ID fallback. When one project
matches multiple clauses, retain the match with the highest score and its
evidence; equal scores retain the earlier clause's match.

The exact-token degraded fallback uses the same clause parser and union rules,
so a MiniSearch initialization or execution failure does not silently revert
OR to AND. The result is marked degraded under the existing contract.

Correction candidates remain clause-local. The returned correction replaces
correctable clauses and preserves the other normalized clauses, but the
existing UI continues to surface a correction only through its current
no-result behavior.

## URL and UI behavior

No new URL parameter or filter control is introduced. The existing catalog
query parser, serializer, raw search draft, browser history, active query chip,
clear action, Project/Kit mode, and copied browser URL remain authoritative.
The serializer's standard percent encoding is sufficient; it must be covered by
a regression test proving `%2B` round-trips to a visible literal `+`.

Search remains ANDed with every selected catalog filter. Filters operate on the
union exactly as they operate on ordinary search results. Relevance remains the
default search sort, and changing between `a b` and `a+b` is a meaningful query
change that restores Relevance after a manual sort override.

## Failure handling and edge cases

- No meaningful clauses produces the existing empty-search behavior.
- One meaningful clause uses ordinary search behavior without a special path
  visible to callers.
- Duplicate clauses do not duplicate cards.
- A query-time MiniSearch exception degrades the complete expression to the
  exact-token OR fallback.
- Existing literal-plus URL compatibility is preserved through `%2B`; no escape
  grammar is added in this release.

## Verification

Unit coverage must prove clause normalization, multi-clause union, multi-word
AND semantics inside a clause, duplicate suppression, empty-clause handling,
best-score retention, correction composition, and degraded exact-token OR
behavior. Query-state coverage must prove literal `+` serializes as `%2B`,
round-trips through parsing, and remains distinct from a space-separated query.

Browser coverage must type `vectfox+summaryception`, show the normal matches for
both clauses, confirm the URL contains `%2B`, reload the copied URL, and confirm
the exact visible expression and results return. It must also cover
`Stab's Directives+Directive` to prove spaces inside a clause retain ordinary
all-term behavior.

Before merge, run focused search/query tests, the full unit suite, lint,
typecheck, production build, static-export verification, and the focused
browser scenario.

## Acceptance criteria

- `vectfox+summaryception` returns the union of both ordinary searches.
- `Stab's Directives+Directive` returns the union of its multi-word and
  single-word clauses.
- Every clause preserves normal Tavernary search behavior.
- Duplicate cards appear once at their best relevance score.
- Copied URLs restore the literal `+`, visible query, filters, sort, and result
  set.
- Ordinary space-separated searches and `?q=preset+freaky` URLs retain their
  existing meaning.
- Project and Kit search, exact-token degradation, corrections, and filters do
  not regress.
