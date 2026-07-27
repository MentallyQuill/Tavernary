# Preset Model Recommendation Filtering

## Status

Approved on 2026-07-26.

## Context

Tavernary currently treats `model-agnostic` as mutually exclusive with named
model-family tags. Its filter matcher also treats every Model-Agnostic Preset
as a match for every named model family.

That contract prevents the catalog from expressing two independent facts:

- a Preset is broadly usable across model families; and
- the Preset has been tested with, works especially well with, or is
  recommended for particular model families.

The model-family tags will instead become explicit discovery claims.

## Goals

- Allow `model-agnostic` to coexist with named model-family tags.
- Make named model filters identify Presets explicitly recommended for those
  families.
- Keep Model-Agnostic available as its own explicit discovery filter.
- Apply the same matching semantics to Presets, Kits, filter counts, and
  shareable queries.
- Record Wandlight as Model-Agnostic with Claude, GLM, and DeepSeek
  recommendations.

## Non-goals

- Introducing a second recommendation field or compatibility scoring system.
- Ranking one recommended model family above another.
- Claiming that an omitted named family is incompatible.
- Changing the controlled model-family vocabulary.
- Reclassifying Presets other than Wandlight in this change.
- Changing completion-format filtering.

## Data contract

The existing `model_families` array remains the sole model-family field.
`model-agnostic` may appear alongside any number of named family IDs:

```json
{
  "model_families": [
    "model-agnostic",
    "claude",
    "glm",
    "deepseek"
  ]
}
```

The meanings are:

- `model-agnostic`: the Preset is intended to work broadly across model
  families.
- A named family: the Preset is tested with, works especially well with, or is
  specifically recommended for that family.

The array continues to require at least one unique, curated model-family ID.
The existing Preset-only and unknown-ID validation rules remain unchanged.
Only the exclusivity rule is removed.

An omitted named family means "not explicitly recommended," not
"incompatible."

## Filtering contract

Model-family filters use exact tag membership:

- `model=claude` matches a Preset only when its `model_families` contains
  `claude`.
- `model=model-agnostic` matches a Preset only when its `model_families`
  contains `model-agnostic`.
- A Preset tagged with both values matches both filters.
- Multiple selected model families retain OR semantics.
- Model-family filters continue to combine with other filter dimensions using
  AND semantics.

The current shortcut that makes every Model-Agnostic Preset match every named
family is removed. Filter counts use the same exact-membership matcher as
catalog results.

Kit model-family metadata remains the union of the tags on its available
Preset components. Kit filtering uses the same exact-membership and OR rules.

URL parameter names and serialization do not change.

## Presentation and submission

Preset cards continue to render every declared model-family tag. A Preset may
therefore display Model-Agnostic alongside one or more named recommendations.
No new card component or visual treatment is required.

The submission builder, manifest validation, GitHub fallback intake, and
catalog validation will permit Model-Agnostic alongside named families.
Selection controls will no longer clear Model-Agnostic when a named family is
chosen, or clear named families when Model-Agnostic is chosen.

Submission copy should distinguish the meanings without adding a new field:
Model-Agnostic communicates broad usability, while named selections communicate
tested or recommended families.

## Wandlight migration

`mentallyquill-st-wandlight` changes from:

```json
"model_families": ["model-agnostic"]
```

to:

```json
"model_families": ["model-agnostic", "claude", "glm", "deepseek"]
```

No other Preset record is reclassified by this change.

## Error handling

- Unknown model-family IDs remain validation errors.
- Empty Preset model-family arrays remain validation errors.
- Canonical registry arrays continue to require unique IDs; submission
  manifests continue to normalize duplicate selections to one ID.
- A combined Model-Agnostic and named-family selection is no longer an error.
- Invalid URL filter values continue to be ignored.

## Verification

Focused tests will prove:

- validation accepts `model-agnostic` combined with named families;
- manifest normalization and submission intake preserve combined tags;
- submission controls allow combined selection without clearing either value;
- named filters do not match Presets tagged only `model-agnostic`;
- the Model-Agnostic filter does not match Presets tagged only with named
  families;
- a combined-tag Preset matches each of its explicit filters;
- multiple selected families retain OR behavior;
- filter counts use exact membership;
- Kit filtering uses the same exact-membership contract;
- Wandlight builds with all four intended tags; and
- cards and accessible text render all four Wandlight tags.

The final verification pass will run catalog validation, focused unit tests,
the static export build, and the affected catalog browser tests.
