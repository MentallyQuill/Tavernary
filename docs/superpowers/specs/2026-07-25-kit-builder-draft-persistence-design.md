# Kit Builder Draft Persistence Design

**Status:** Approved

**Date:** 2026-07-25

**Scope:** Browser-local persistence for one unfinished Kit Builder draft

## Goal

Tavernary preserves an unfinished Kit Builder draft across page refreshes,
browser closure, and computer restarts. Returning to the site restores the
draft exactly enough for the user to continue composing it without adding an
account, backend, or runtime API.

The saved draft remains indefinitely. Tavernary removes it only when the user
explicitly discards or replaces it, or when the submission handoff completes
successfully.

## Relationship to Existing Kits Designs

This document is a focused amendment to:

- `docs/superpowers/specs/2026-07-24-kits-design.md`
- `docs/superpowers/specs/2026-07-25-unified-kit-selection-design.md`

It supersedes statements that Kit drafts exist only in memory, do not survive
refresh, or are not locally persisted. It does not change Kit publication,
manual approval, catalog selection, Kit membership, moderation, or ranking.

## Storage Choice

Use `window.localStorage`.

The Kit Builder already uses local storage for its independent collapsed/open
preference. A Kit draft is one small JSON record, so IndexedDB would add
unnecessary lifecycle and migration complexity. Cookies are unsuitable because
they are size-constrained and may be sent with requests.

Browser storage is an availability enhancement, not a publication surface:

- it is local to the current browser profile and device;
- it does not synchronize across devices;
- clearing site data removes it;
- private-browsing behavior depends on the browser;
- no Tavernary account, consent banner, or backend is introduced.

## Persisted Record

Store one versioned record under a dedicated key such as
`tavernary:kit-builder-draft:v1`.

```ts
interface StoredKitBuilderDraftV1 {
  schemaVersion: 1;
  savedAt: string;
  draftOrigin: "create" | "duplicate" | "edit";
  originalProjectIds: string[];
  draft: {
    operation: "create" | "edit";
    kitId: string | null;
    title: string;
    description: string;
    projectIds: string[];
  };
}
```

The record contains only Kit authoring state:

- create or edit operation;
- canonical Kit ID for an edit;
- title and description;
- ordered canonical project IDs;
- create, duplicate, or edit origin;
- original ordered project IDs used by duplicate validation;
- schema version and save timestamp.

Do not persist:

- the collapsed/open preference, which retains its existing storage key;
- catalog query, filters, scroll position, or focused control;
- pending project batch selection before **Add to Kit**;
- validation messages, touched fields, or submit-attempt UI;
- derived project objects or other catalog data;
- GitHub identity, credentials, clipboard contents, or submission URLs.

Persisting canonical IDs instead of complete project objects keeps the record
small and allows restoration against the current catalog.

## Save Lifecycle

Write the record after every meaningful draft mutation:

- starting Create, Duplicate, or Edit;
- changing title or description;
- adding, removing, replacing, or reordering a project;
- applying a project-selection batch.

Writes use the next complete normalized state, not a partial patch. The storage
adapter catches quota, security, and unavailable-storage errors. The in-memory
workspace remains usable if persistence fails.

The draft has no age-based expiry. `savedAt` supports diagnostics and future
migrations but does not invalidate a record.

Starting another Create, Duplicate, or Edit operation replaces the current
in-memory and saved draft, matching the Kit Builder's existing single-draft
model.

## Restore Lifecycle

On the client, read and validate the stored record before initializing the Kit
Builder workspace.

When valid:

1. restore Build mode, draft origin, and original project IDs;
2. resolve ordered project IDs against the current catalog;
3. keep every project that still resolves;
4. omit unknown or no-longer-available project IDs;
5. show one concise notice naming or counting omitted entries;
6. mark the restored draft dirty so existing navigation protection applies.

Restoration does not automatically expand the Kit Builder. Its existing
collapsed/open preference remains authoritative. The restored membership still
drives project-card **In Kit** state and the collapsed draft count.

A restored Edit draft whose Kit no longer exists remains editable as an edit
draft but cannot submit until existing validation or a focused restoration
error explains that the source Kit is unavailable. Tavernary must not silently
convert it into a new Kit.

Malformed JSON, an unknown schema version, invalid field types, an invalid
operation/Kit-ID combination, duplicate IDs, or a structurally impossible
record is ignored safely. Tavernary removes an invalid record so it does not
fail on every visit, then starts in the ordinary Intro or Inspect state.

## Clearing the Draft

Remove the saved record when:

- the user explicitly discards the draft;
- the user starts another draft and thereby replaces it;
- the submission transport completes its successful handoff.

Tavernary cannot observe whether the user ultimately submits the prefilled
GitHub issue after it opens in another tab. For this feature, successful
submission means that Tavernary successfully completed its existing GitHub
prefill or clipboard fallback handoff without throwing. A failed handoff keeps
the saved draft.

Inspecting a published Kit, changing catalog mode, collapsing the builder,
refreshing the page, closing the browser, or restarting the computer does not
clear the draft.

The builder must expose an explicit **Discard draft** action. It clears both
the in-memory workspace and the saved record. Because discarding is immediate
and irreversible within Tavernary, its label must name the draft action
unambiguously; no generic **Cancel** label is used.

## Multiple Tabs

All tabs share the same saved draft.

The storage adapter subscribes to the browser `storage` event:

- a valid newer record replaces the receiving tab's draft;
- removal returns the receiving tab to Intro unless a selected published Kit
  requires Inspect mode;
- the writing tab updates itself through ordinary React state and does not
  depend on receiving its own storage event;
- rapid edits use last-write-wins semantics.

Tavernary does not add merge UI, locks, or concurrent editing infrastructure
for one browser-local draft. A tab receiving an external replacement should
announce that the draft was updated in another tab.

## Architecture

Keep serialization and browser APIs outside the Kit workspace reducer/hook.

```text
Kit Builder mutation
        |
        v
useKitBuilder workspace -----> kit-draft-storage adapter
        ^                              |
        |                              v
        +-------- restore / storage event
```

Recommended boundaries:

- `kit-draft-storage.ts` owns the key, schema validation, normalization,
  reading, writing, clearing, and storage-event subscription;
- `use-kit-builder.ts` owns workspace transitions and decides when a complete
  draft becomes authoritative;
- catalog/project lookup owns restoration reconciliation;
- components render restoration notices and the explicit discard action;
- submission transport reports success or failure without directly mutating
  browser storage.

The storage adapter must be safe during server rendering: server snapshots
contain no draft, and browser APIs are accessed only on the client.

## Failure Handling

- Storage unavailable or full: continue with in-memory authoring.
- Write failure: preserve the live draft and expose at most one quiet,
  actionable notice that browser persistence is unavailable.
- Corrupt or unsupported record: clear it and start safely.
- Missing catalog projects: restore the remainder, preserve order, and explain
  omissions.
- Failed submission handoff: keep the draft.
- Cross-tab replacement: accept the newer complete record and announce it.
- Cleared browser data: behave as a first visit; no recovery is promised.

No storage failure may block project browsing, Kit inspection, or ordinary Kit
authoring.

## Testing and Verification

Implementation follows red-green-refactor TDD.

### Storage unit coverage

- round-trips every persisted field;
- rejects malformed JSON and unsupported schema versions;
- rejects invalid operation and Kit-ID combinations;
- normalizes duplicate project IDs while preserving order;
- safely handles unavailable, throwing, or quota-limited local storage;
- clears only the dedicated draft key;
- emits and consumes cross-tab changes.

### Workspace and component coverage

- restores Create, Duplicate, and Edit drafts;
- restores title, description, ordered membership, origin, and originals;
- marks a restored draft dirty;
- does not expand a collapsed builder during restoration;
- keeps the open/collapsed preference independent;
- persists each meaningful mutation;
- does not persist pending pre-application batch selection;
- reconciles missing projects and displays one concise notice;
- does not silently convert a missing-source Edit into Create;
- explicit discard clears memory and storage;
- a replacement operation overwrites the prior saved draft;
- successful submission handoff clears the record;
- failed submission handoff preserves it;
- external tab writes and removals update the workspace.

### Browser coverage

At desktop and mobile widths:

1. create a draft and enter title, description, and projects;
2. reload and verify the complete draft and project order;
3. close and recreate the page context with the same browser profile;
4. verify the draft remains while the builder preserves its independent
   collapsed/open preference;
5. remove a catalog project from the test fixture and verify partial recovery;
6. discard and confirm a subsequent visit starts without the draft;
7. simulate successful and failed submission handoffs;
8. modify and clear the draft from a second tab.

Static export, hydration, accessibility, and the complete existing Kit test
suites must continue to pass.

## Out of Scope

- Tavernary accounts or authentication;
- backend, database, or runtime API storage;
- cross-device or cross-browser synchronization;
- multiple named drafts or draft history;
- draft export or import;
- merge conflict resolution;
- restoring pending batch selection;
- automatic expiry;
- recovery after the user clears site data;
- changes to Kit submission review or publication.
