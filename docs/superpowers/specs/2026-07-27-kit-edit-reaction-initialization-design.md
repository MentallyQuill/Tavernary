# Kit Edit Reaction Initialization Design

## Problem

The Kit publication workflow passes the dispatched submission issue number to
the reaction initializer as the identity of the Kit that must receive a fresh
support snapshot.

That identity is correct for a create submission because a new Kit's
`source_issue_number` is the submission issue number. It is incorrect for an
edit submission because the canonical Kit preserves its original
`source_issue_number`. For example, edit issue `#121` targets
`super-awesome-test-kit-109`, whose source issue remains `#109`. The
initializer therefore fails after the edit has already passed validation and
application.

## Design

Use the canonical Kit ID as the required-initialization identity.

1. The apply-submission step emits the applied record's `kit_id` as a GitHub
   Actions step output.
2. The publication workflow passes that output to the reaction initializer as
   `REQUIRED_KIT_ID`.
3. The reaction initializer treats a failed refresh as fatal when the current
   Kit ID equals `REQUIRED_KIT_ID`.
4. The initializer fails explicitly when no published Kit has the required ID.

This preserves the existing contract that a newly published Kit must receive
its first support snapshot before publication continues. It also applies the
same protection to edits without conflating the edit issue with the canonical
Kit's immutable source issue.

## Compatibility

- Kit IDs and source issue numbers remain unchanged.
- Existing support snapshots remain keyed to Kit ID and retain their canonical
  source issue number.
- Scheduled catalog refreshes continue without a required Kit identity.
- Create submissions, edit submissions, and idempotent retries use the same
  workflow path.

## Error Handling

- If the required Kit ID is absent from the applied registry, publication
  fails before validation and commit.
- If fetching reactions for the required Kit fails, publication fails rather
  than committing a Kit without initialized community support.
- Failures for unrelated Kits retain the existing stale-snapshot behavior.

## Verification

Add one regression test that requires an edited Kit by canonical ID while its
source issue differs from the edit issue. Verify that the reaction fetch uses
the canonical source issue and succeeds.

Update workflow contract coverage to require:

- an output-producing apply step;
- `REQUIRED_KIT_ID` sourced from that output; and
- staging both the canonical Kit and reaction snapshot.

Run the focused Kit application, reaction, and workflow tests, followed by the
repository's full check.
