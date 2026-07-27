# Kit Upvote on GitHub Design

## Summary

Published Kit cards gain a bottom-right **Upvote on GitHub** control. The
control opens the Kit's canonical GitHub issue in a new tab, where the visitor
can add GitHub's `+1` reaction. Tavernary's existing automated support refresh
continues to import those reactions into the catalog's supporter count and
Trending score.

This feature adds the missing voting affordance without adding Tavernary
accounts, OAuth, a runtime API, or a voting database.

## Interaction

- Every published Kit card shows an **Upvote on GitHub** external link.
- The link opens
  `https://github.com/MentallyQuill/Tavernary/issues/{sourceIssueNumber}` in a
  new tab.
- The tooltip and accessible name are both **Upvote on GitHub**.
- GitHub remains the voting surface. The visitor adds or removes GitHub's
  thumbs-up reaction there.
- The Tavernary control does not use `aria-pressed` or claim that the current
  visitor has voted because the static site does not know the visitor's GitHub
  identity.
- The existing supporter count remains in the Kit card's metadata row.
- Clicking the upvote control must not open the Kit inspector or trigger any
  other Kit-card action.

## Visual Contract

The upvote control reuses the project-card Kit-membership control as its exact
visual contract:

- the same 44 by 44 pixel hit target;
- the same 28 by 28 pixel square face;
- the same bottom-right offset;
- the same border, corner radius, background, and shadow;
- the same dark foreground color used by the existing plus glyph;
- the same hover, focus-visible, active, reduced-motion, and coarse-pointer
  behavior.

The supplied `upvote.svg` contributes the arrow path. Its hard-coded dimensions,
black fill, XML declaration, and provenance comment are not copied into the
rendered component. The production SVG uses the existing control's sizing and
`currentColor`, so the arrow and plus glyph remain visually consistent.

The Kit card reserves the same footer space that project cards reserve for
their bottom-right membership control. Copy and Report remain usable and do not
overlap the upvote hit target.

## Data Flow and Automation

No new backend is required:

1. The generated `CatalogKit` already exposes the immutable
   `sourceIssueNumber`.
2. The upvote link derives the canonical issue URL from that number.
3. A signed-in GitHub visitor adds a `+1` reaction to the issue.
4. The scheduled `refresh-catalog.yml` workflow runs daily.
5. `scripts/kits/refresh-reactions.mjs` reads every published Kit's issue
   reactions, excludes bots and blocked identities, and updates the Kit support
   snapshots.
6. Catalog validation runs before changed snapshots are committed.
7. When snapshots change, the workflow pushes them and dispatches the Pages
   deployment automatically.

There is no routine maintainer action. A vote can take until the next scheduled
refresh to appear on Tavernary.

Existing support semantics remain unchanged:

- one effective vote per durable GitHub user ID;
- only `+1` reactions count;
- removing a reaction removes current support;
- first-reaction timestamps remain durable for Trending;
- ordinary Kit edits retain support history;
- stale snapshots remain available when a refresh fails.

## Failure Behavior

- If GitHub is unavailable when the visitor follows the link, GitHub owns the
  error experience; Tavernary remains usable.
- If a scheduled reaction refresh fails, the existing snapshot is retained and
  marked stale by the current refresh pipeline.
- If a Kit has never had a successful support refresh, its support remains
  unavailable rather than being presented as zero.
- Popup blockers should not affect the interaction because the control is a
  normal external link rather than a scripted popup.

## Implementation Boundaries

Expected production changes are limited to:

- a focused Kit upvote control or shared card-corner control component;
- Kit-card composition and event isolation;
- shared styling derived from the existing project-card Kit control;
- focused unit, browser, accessibility, responsive, and visual coverage.

The implementation does not change reaction collection, schemas, canonical Kit
records, Trending calculations, GitHub workflows, or generated catalog shape.

## Verification

Tests must prove:

- the link uses the Kit's `sourceIssueNumber`;
- it opens in a new tab with safe external-link attributes;
- its accessible name and tooltip are **Upvote on GitHub**;
- activating it does not select or open the Kit;
- the up-arrow uses the supplied path and inherits `currentColor`;
- the 44-pixel hit target and 28-pixel face match the project-card plus control;
- footer content does not overlap the control on desktop or mobile;
- keyboard focus and coarse-pointer behavior remain accessible;
- reduced-motion behavior matches the existing control;
- fixture and ordinary static exports render the new control correctly.

The final implementation must pass the focused Kit unit tests, Kit browser and
visual suites, and the repository's full `npm.cmd run check` gate.
