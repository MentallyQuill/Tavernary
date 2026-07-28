# Project Submission Short Description Limit

## Goal

Prevent project submitters from providing a Short Description that cannot fit
Tavernary's catalog summary contract. The accepted maximum is 220 characters,
matching the existing catalog and enrichment validation.

## Form behavior

The project submission builder's Short Description textarea will use a native
`maxLength` of 220. A visible character counter directly associated with the
field will show the current count as `x/220 characters`, including when the
field is optional. The existing helper copy and required/optional rules remain
unchanged.

The hard input limit is intentional: users cannot type or paste beyond the
catalog limit, so Tavernary does not silently accept text it later clips.

## Validation boundary

The submission manifest normalizer will independently reject any non-empty
description longer than 220 characters with the error:

`Short Description must be 220 characters or fewer.`

This protects non-browser callers and manipulated submissions. Descriptions of
exactly 220 characters remain valid. Existing whitespace normalization remains
unchanged, and the limit applies to the normalized description.

## Error routing

The builder will associate the manifest error with the Short Description field
through its existing inline-error routing. The counter and helper text remain
part of the textarea's accessible description; the inline error is added when
validation fails.

## Testing

Focused tests will prove:

- the textarea exposes a 220-character maximum and visible counter;
- typing or pasting through the form cannot exceed 220 characters;
- the manifest accepts exactly 220 normalized characters;
- the manifest rejects 221 normalized characters with the field-specific
  message.

Implementation will follow a red-green cycle: add the failing builder and
normalizer tests first, confirm their expected failures, then make the smallest
production changes needed to pass them.
