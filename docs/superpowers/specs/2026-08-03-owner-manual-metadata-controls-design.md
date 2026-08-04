# Owner Manual Metadata Controls Design

## Goal

Prevent verified owners from accidentally submitting revised catalog summaries or tags under automatic metadata authority. Correct project-owner request #233 so PR #234 publishes the submitted summary as verified owner-authored copy while leaving tags automatic.

## User experience

Summary and tag authority remain independent.

- In `automatic` mode, the existing summary and tags remain visible as read-only context. The summary input and tag browser cannot change their values.
- Selecting `manual` unlocks that field. Existing values remain prefilled so the owner can revise them instead of starting over.
- Switching a field from manual back to automatic restores its original values immediately. This prevents an edited value from remaining hidden inside an automatic proposal.
- A manual summary must be nonblank. Existing tag-count and vocabulary requirements continue to apply to manual tags.
- Review shows the resulting summary and tag modes explicitly before the GitHub handoff.

This behavior applies to both editing an existing card and proposing new cards from an existing source. New-card drafts begin in automatic mode with their generated default values visible but locked; owners select manual before authoring either field.

## Manifest contract

The machine-readable owner manifest remains authoritative. For `edit-card`, normalization rejects a proposal when an automatic summary differs from the original summary or automatic tags differ from the original tags. This server-side invariant protects workflow inputs created by stale clients or hand-edited GitHub issue bodies.

For `add-cards`, automatic values may remain populated as generation context because there is no original card to restore. The UI still locks those fields until manual mode is selected. Existing automatic-generation behavior for blank new-card summaries remains valid.

The validator returns field-specific errors that tell the owner to select manual before changing summary or tags.

## Live PR correction

Issue #233's authoritative manifest will be updated so `proposed.metadata.summary.mode` is `manual`. Its proposed summary remains exactly as submitted, and `proposed.metadata.tags.mode` remains `automatic` because the owner did not revise the tag selection.

The supported project-owner generation workflow will then be rerun for issue #233. PR #234 must show manual summary policy in the generated registry record and preserve the submitted summary subject only to the existing manual-copy preservation contract. The generated PR marker, file diff, workflow report, and required checks must agree.

## Testing

Component tests will prove that automatic fields are disabled, selecting manual unlocks them with their existing values, and returning to automatic restores the originals. Handoff tests will prove that only unlocked manual edits reach the manifest.

Manifest tests will prove that changed automatic summary or tags are rejected for existing cards, while unchanged automatic values, manual edits, and automatic new-card generation remain valid. Focused form, manifest, triage, and generation suites will run before the full repository verification appropriate to the changed surface.

## Scope boundaries

This change does not couple summary and tag policy, change metadata authority rules for community submissions, alter catalog enrichment prompts, or make tags manual in PR #234. It does not change unrelated owner operations such as retirement, restoration, source moves, or delisting.
