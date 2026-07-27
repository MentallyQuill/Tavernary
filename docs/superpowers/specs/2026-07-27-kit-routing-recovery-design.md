# Kit Routing Recovery Design

## Goal

Prevent valid Kit submissions from silently stopping after issue admission,
recover every historical Kit submission into an accurate lifecycle state, and
prove that newly published Kits reach the live site.

## Root Cause

Kit issue forms declare the `kit-submission` routing label, but that label does
not exist in the repository. GitHub therefore creates the issue without the
label. Admission still succeeds and adds `issue-admitted`, but the router sees
no route, dispatches no Kit validation workflow, and reports success.

The current router treats labels as its only routing authority. This is correct
when GitHub applies the form label, but it has no recovery mechanism when a
configured routing label is missing from the repository.

## Forward Routing Contract

Explicit routing labels remain authoritative:

- `project-submission` -> Project validation
- `kit-submission` -> Kit validation
- `kit-withdrawal` -> Kit withdrawal
- more than one routing label -> fail closed

Admission owns the existence of all three routing labels in addition to its
admission labels. If an issue arrives without a routing label, admission may
recover exactly one route from the issue form's structured field contract:

- Project submission: the required Project submission headings
- Kit submission: `Kit title`, `Kit description`, and `Kit manifest`
- Kit withdrawal: the required Kit withdrawal headings

Recovery does not route from a title prefix. It must match one complete,
unambiguous form shape. A partial, ordinary, or conflicting shape remains
unrouted.

When admission recovers a route, it adds the corresponding routing label and
emits that route in the same run. The matching worker is then dispatched
without requiring another issue event. Open, admitted edits use the same
self-healing behavior, so maintainers can retry corrected submissions by
editing the issue.

## Historical Reconciliation

A one-time, idempotent reconciliation audits every issue containing a Kit
manifest against the canonical Kit registry.

The inventory at design approval contains eight issues:

| Issue | Meaning | Canonical result |
| --- | --- | --- |
| #16 | Initial malformed-rendering attempt | Superseded by #18; remain closed |
| #18 | Published `Ultimate Harry Potter` create | Published |
| #19 | Duplicate create attempt | Superseded; remain closed as duplicate |
| #20 | Edit of Kit #18 | Edit already present in the canonical record |
| #30 | `Aiko's Loadout` create | Published |
| #31 | `Juuzz` create | Published |
| #63 | `Megumin Best` create | Published |
| #109 | Valid create stranded with route `none` | Publish through official workflows |

Reconciliation will:

1. Ensure `kit-submission` exists.
2. Add `kit-submission` to every historical Kit submission for provenance.
3. For published creates and applied edits, use `kit-published`, remove stale
   Kit triage labels, and retain a completed closed state.
4. Preserve superseded invalid or duplicate attempts as closed without
   republishing them, while assigning an accurate terminal label.
5. Route #109 through validation and publication instead of writing registry
   data manually.
6. Re-read every issue and canonical Kit record after mutation.

The process must preserve unrelated labels. Re-running it must not create a
second Kit, overwrite newer Kit content, or reopen terminal submissions.

## Publication and Deployment

The existing Kit workers remain the only production mutation path:

1. Admission dispatches Kit validation.
2. Validation re-fetches the live issue and validates its manifest.
3. Publication writes the canonical registry record and support snapshot.
4. Publication validates the catalog, pushes the exact commit, and dispatches
   Pages for that commit.
5. Bookkeeping labels and issue closure reflect the published result.

Historical reconciliation never edits `data/registry/kits` directly.

## Failure Handling

- Missing route labels are created before recovery.
- Ambiguous form shapes fail closed and dispatch nothing.
- Invalid Kit manifests receive actionable validation feedback.
- Already published creates and already applied edits reconcile bookkeeping
  without republishing.
- A failed publication leaves the issue open with non-terminal state.
- Deployment is verified independently from workflow completion and issue
  closure.

## Test Strategy

Use strict red-green-refactor cycles to prove:

- admission creates all routing labels;
- a complete unlabeled Kit form recovers `kit-submission` and route `kit`;
- route recovery happens in the same admission run;
- admitted issue edits can self-heal and retry;
- partial or ambiguous bodies remain unrouted;
- existing explicit labels remain authoritative;
- conflicting labels still fail closed;
- reconciliation classifies published creates, applied edits, superseded
  attempts, and unpublished valid submissions idempotently;
- workflow dispatch remains the only publication path.

Run focused admission, reconciliation, workflow, Kit validation, and Kit
publication tests, followed by the repository's complete check command.

## Completion Evidence

Completion requires all of the following:

- focused and full automated checks pass;
- all eight historical issues have the intended labels and terminal state;
- #109 has a canonical Kit record and generated catalog entry;
- the exact publication commit has a successful Pages deployment;
- the Kit is visible on the live Tavernary site;
- a final GitHub CLI audit finds no remaining unlabeled or stranded Kit
  submissions.

## Scope

This repair changes issue routing recovery, label provisioning, historical Kit
bookkeeping, and the recovery of #109. It does not change Kit validation rules,
catalog schemas, Kit composition, submission form fields, or the static-first
site architecture.
