# Preset Model and Completion Filtering

## Summary

Tavernary will add curated model-family and completion-format metadata to
System Presets. Users will be able to filter Presets by either dimension and
filter Kits by the model compatibility derived from their included Presets.
The project submission flow will collect the same metadata for new Presets.

The taxonomy deliberately stops at durable model families. It does not encode
providers, model generations, parameter counts, or performance tiers.

## Goals

- Help users find Presets that support the model family they intend to use.
- Let users distinguish Chat Completion Presets from Text Completion Presets.
- Let users find Kits containing at least one Preset compatible with a selected
  model family.
- Make compatibility visible on Preset cards.
- Collect structured compatibility claims during Preset submission.
- Keep the vocabulary curated and stable as individual models change.

## Non-goals

- Cataloging every model version or fine-tune.
- Representing model providers as compatibility values.
- Inferring compatibility from a model's owner, API provider, filename, or
  repository topic.
- Adding completion-format filtering to Kits in this iteration.
- Adding model compatibility to Frontends or Extensions.
- Adding model-family chips to Kit cards.
- Automatically accepting a new model family into the public vocabulary.

## Vocabulary

### Model families

The initial model-family vocabulary is:

| ID | Public label | Search aliases |
| --- | --- | --- |
| `model-agnostic` | Model-Agnostic | universal, any model |
| `claude` | Claude | Anthropic, Opus, Sonnet, Haiku |
| `gpt` | GPT | ChatGPT, OpenAI |
| `gemini` | Gemini | Google Gemini |
| `gemma` | Gemma | Google Gemma |
| `deepseek` | DeepSeek | DeepSeek |
| `glm` | GLM | ChatGLM, Zhipu |
| `minimax` | MiniMax | MiniMax |
| `mimo` | MiMo | Xiaomi MiMo |
| `kimi` | Kimi | Moonshot, Moonshot AI |
| `qwen` | Qwen | Alibaba, Tongyi |
| `llama` | Llama | Meta Llama |
| `mistral` | Mistral | Mixtral |

The public label describes a model family, not a company or consumer product.
For example, Claude is one family; Opus, Sonnet, and Haiku do not receive
separate chips. Gemini and Gemma remain separate because Preset authors may
target either family independently. `GPT` is the public family label, while
`ChatGPT` and `OpenAI` remain searchable aliases.

The vocabulary lives in a dedicated curated data file so labels, aliases, and
descriptions have one source of truth. Adding a future family requires a
deliberate vocabulary change; new model releases within an existing family do
not.

### Completion formats

The completion-format vocabulary contains:

- `chat-completion` — Chat Completion
- `text-completion` — Text Completion

Every Preset must declare at least one format. A Preset may declare both.

## Canonical project data

The project schema gains two Preset-only fields:

```json
{
  "model_families": ["claude", "gpt"],
  "completion_formats": ["chat-completion"]
}
```

Rules:

- Both fields are required when `kind` is `preset`.
- Both fields are absent for Frontends and Extensions.
- Both arrays contain unique curated IDs.
- `model_families` contains at least one value.
- `completion_formats` contains at least one value.
- `model-agnostic` is mutually exclusive with every named model family.
- A Preset can support multiple named model families.
- A Preset can support both completion formats.

The project schema version will advance. All existing Preset records must be
backfilled before the new schema is adopted. Backfill must use source or author
evidence; Tavernary will not silently assume Chat Completion or
Model-Agnostic. If a record cannot be classified confidently, implementation
stops on that record for an explicit maintainer decision rather than inventing
metadata.

## Built catalog

The catalog build maps canonical IDs to labeled metadata:

```ts
preset: {
  version: string | null;
  publishedAt: string | null;
  artifactSizeBytes: number | null;
  modelFamilies: CatalogLabel[];
  completionFormats: CatalogLabel[];
}
```

Labels and aliases are added to each Preset's searchable text. Existing
non-Preset catalog objects retain `preset: null`.

Each built Kit gains a derived `modelFamilies` collection. It is the union of
the model-family metadata on all available Preset components in that Kit. Kits
with no available Preset have no model compatibility.

`model-agnostic` is retained in the derived Kit metadata because it affects
matching behavior. No model metadata is written into canonical Kit records;
the Kit remains an ordered collection of project IDs, and compatibility stays
derived from its components.

## Filter behavior

### Presets

The project query gains repeatable URL parameters:

- `model=<family-id>`
- `completion=<format-id>`

Multiple selected values within either dimension use OR semantics. Different
dimensions use AND semantics. For example:

```text
model=claude&model=gpt&completion=chat-completion
```

matches a Chat Completion Preset supporting Claude or GPT.

When any named model family is selected, a Model-Agnostic Preset also matches.
When `model-agnostic` itself is selected, only explicitly Model-Agnostic
Presets match.

Selecting a model or completion filter naturally excludes Frontends and
Extensions because those project kinds have no Preset compatibility metadata.
The filters remain available in the All Projects view as well as the System
Presets category, consistent with other project filters.

Filter counts represent the result of applying that option under the current
query. Therefore, a named model's count includes Model-Agnostic Presets.

### Kits

The Kit query gains a repeatable `model=<family-id>` parameter. Multiple
selected families use OR semantics.

A Kit matches a named family when at least one available included Preset:

- explicitly supports that family; or
- is Model-Agnostic.

A Kit matches the `model-agnostic` filter only when at least one available
included Preset is explicitly Model-Agnostic.

The same rules drive Kit filter counts. Other Kit filters continue to combine
with model compatibility using AND semantics.

### Filter presentation

The existing **Capabilities & characteristics** area becomes a structured
metadata section rather than one undifferentiated chip list:

- Existing capabilities
- Model family
- Completion format

The groups reuse Tavernary's current chip controls and selected-state styling.
Model family and Completion format are visible only when they have applicable
results. The Kit filter panel adds a **Capabilities & characteristics** section
containing Model family; it does not add Completion format in this iteration.

The section remains compact on desktop and in the mobile filter sheet. No new
interaction pattern or chip style is introduced.

## Preset card presentation

Preset cards display model-family and completion-format metadata alongside the
existing frontend and capability metadata. The chips use the same component
and visual language as current metadata chips but remain semantically grouped
for accessible labeling.

Model-Agnostic appears as its own chip. Individual model versions, aliases,
and completion endpoints are not rendered.

Card accessible text includes:

- supported model families; and
- supported completion formats.

Frontends, Extensions, and Kit cards are unchanged.

## Submission flow

### Tavernary submission builder

When Project Type is **System Preset**, the form shows two required sections:

1. **Supported model families**
2. **Completion format**

Supported model families use the curated family choices. Named families allow
multi-select. Model-Agnostic is exclusive:

- choosing Model-Agnostic clears all named families and any unlisted-family
  entry;
- choosing a named or unlisted family clears Model-Agnostic.

The model-family section also offers **Other or not listed** with a required
free-text family name when enabled. This captures a compatibility claim for
maintainer review without automatically expanding the public vocabulary.

Completion format provides Chat Completion and Text Completion as independent
checkboxes. At least one is required; both may be selected.

These sections are hidden and omitted from the manifest for Frontends and
Extensions. Switching away from System Preset clears their values to prevent
stale hidden data.

### Submission manifest

The builder emits the next manifest schema version with Preset-only data:

```json
{
  "schema_version": 2,
  "preset_compatibility": {
    "model_families": {
      "known_ids": ["claude", "gpt"],
      "other": []
    },
    "completion_formats": ["chat-completion"]
  }
}
```

An unlisted model family is represented as trimmed plain text in `other`.
Manifest normalization deduplicates IDs and text values and enforces the
Model-Agnostic exclusivity rule.

Version 1 manifests remain parseable for already-open submissions. A version 1
Preset submission missing compatibility metadata is sent to
`needs-information`; the workflow does not infer values. New builder
submissions always emit version 2.

### GitHub fallback form and workflows

The fallback GitHub issue form gains:

- **Supported model families**
- **Model-Agnostic**
- **Other model family**
- **Completion formats**

The parser normalizes those fields into the same manifest shape used by the
builder. Triage, admission, generated project records, pull-request checklists,
and validation all carry the structured compatibility data end to end.

An unlisted family requires maintainer reconciliation before publication:

- map it to an existing curated family;
- add a justified new vocabulary entry; or
- request clarification.

## Error handling

- Unknown family or completion IDs are rejected during validation.
- Empty Preset compatibility selections produce field-level form errors.
- Model-Agnostic combined with another family produces a validation error in
  both browser and workflow paths.
- Unlisted-family text is trimmed, deduplicated case-insensitively, and limited
  to a short plain-text value.
- A Kit referencing a flagged or unavailable Preset derives compatibility only
  from its available built component data.
- Invalid query values are ignored during URL parsing, consistent with current
  catalog behavior.

## Migration

Implementation follows this order:

1. Add the curated vocabularies and validation rules.
2. Audit and backfill every canonical Preset using source-backed evidence.
3. Advance the canonical project schema.
4. Extend the catalog build and TypeScript catalog contracts.
5. Add project and Kit query/filter behavior.
6. Add Preset card metadata.
7. Extend the submission builder, manifest, fallback form, and workflows.
8. Rebuild generated catalog artifacts.

No canonical Kit migration is needed because Kit compatibility is derived.

## Verification

Focused unit coverage will prove:

- vocabulary IDs and aliases are unique;
- Preset-only schema requirements and Model-Agnostic exclusivity;
- project build output and searchable aliases;
- Kit model-family union derivation;
- named-family matching includes Model-Agnostic;
- explicit Model-Agnostic matching remains specific;
- multi-model OR behavior and cross-dimension AND behavior;
- URL parse/serialize round trips for project and Kit queries;
- filter counts follow semantic matching;
- Preset cards render grouped model and completion chips;
- submission builder required fields, exclusivity, reset behavior, and
  serialized schema version 2;
- version 1 intake compatibility and `needs-information` behavior;
- workflow parsing, validation, and draft-record propagation.

Browser coverage will prove:

- desktop and mobile project filters;
- desktop and mobile Kit model filtering;
- filter state survives shareable URL reloads;
- Preset card metadata is visible and accessible;
- the System Preset submission path supports one model, multiple models,
  Model-Agnostic, both completion formats, and an unlisted family;
- Frontends and Extensions do not expose or serialize Preset-only fields.

The final verification pass includes schema/catalog validation, unit tests,
static export build, focused Playwright runs, and visual inspection of the
affected desktop and mobile surfaces.

