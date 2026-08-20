# Using the catalog

The catalog is designed for browsing first and narrowing down when you have a
better idea of what you want.

![Search and filters in the catalog](../assets/screenshots/search-and-filters.png)

## Search

Type a few meaningful words. All meaningful words are required, but they can
appear in any order, so `preset freaky` and `freaky preset` can find the same
project.

Search rule: all meaningful words are required, but they can appear in any
order.

Use `+` when you want either search idea to match. For example,
`memory+lore` finds projects matching `memory` or `lore`. A search can look at
project names, aliases, descriptions, kinds, functions, tags, frontends,
compatibility, maintainers, and relationships.

The catalog is careful with very short words and typos. This prevents a tiny
mistake from filling the page with unrelated results. If Tavernary suggests a
correction, it will not change your search until you choose the suggestion.

## Sort and filter

When you search, **Relevance** puts the closest matches first. You can choose a
different sort while you look around. Clearing the search returns to the browse
sort you were using.

Filters let you narrow by project kind, supported frontend, and metadata such
as Goals and traits. Choices inside one filter group use OR logic. Different
groups use AND logic. In plain language: “show me projects matching any of
these tags, but also matching this kind.”

The URL remembers the current search and filters, so you can copy or share a
view without making an account.

## Read a project card

Start at the top of the card:

- **Name and kind** tell you what the project calls itself and what sort of
  thing it is.
- **Summary** gives a short description. It may be creator-written or clearly
  marked as generated from source evidence.
- **Frontend and compatibility** tell you what the project is meant to work
  with.
- **Source** takes you to the creator's repository or public source page.
- **Recent Activity** shows the latest qualifying source change or release.
- **Sustained Activity** shows active weeks across the latest 12-week window.

![A close look at a project card](../assets/screenshots/project-card.png)

## Understand the activity labels

`N/12` means the project had qualifying source activity in N of the latest
twelve fixed UTC weeks. It is not a commit count. One busy week and one quiet
week each count as one active week.

Documentation-only, lockfile-only, generated/vendor-only, merge-only, and
whitespace-only changes are not treated as meaningful source activity. A
project can still be useful even when it has no recent activity.

**Popularity** is a combined signal made from GitHub stars, forks, and
watchers. It is a way to compare attention, not a promise of quality.

## Understand scan notes

TavernKeeper starts with deterministic open-source security scanners. Its
contextual review helps explain why a hit appeared and whether it may be in a
test, build script, dependency, or player-facing path.

Scan information is safety awareness and analysis. It is not an endorsement,
certification, or a replacement for reading the source. A green-looking card
does not mean “risk-free,” and a warning means “look more closely,” not
automatically “malicious.”

## When information is incomplete

Some cards are **Provisional** while their description, tags, or source facts
are still being checked. **Pending enrichment** means Tavernary does not yet
have a verified fact. Temporary refresh trouble may leave older facts visible
with a stale note. A confirmed deletion, private source, or identity change
may temporarily remove a project from the public catalog.

## Before you try a project

Open the source link. Read the project's own documentation, license, release
history, and support expectations. Only then decide whether to install it, run
it, or give it access to your SillyTavern setup.

If a catalog card needs attention, use [Getting help](getting-help.md).
