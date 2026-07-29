# Controlled vocabularies

Catalog filtering, labels, automated classification, and card text are built
from fixed vocabularies in `data/vocabularies`.

## Frontends

File: `data/vocabularies/frontends.json`

- `sillytavern`
- `lumiverse`
- `marinara-engine`
- `sonder-engine`

Schema: `id`, `label`, `description`.

Frontend compatibility is structured metadata. It is not a tag and does not
count toward the card tag limit.

## Goals and traits

File: `data/vocabularies/tags.json`

Schema: `data/schemas/tag-vocabulary.schema.json`

Each definition has:

- `id`: stable machine-readable identifier;
- `label`: user-facing chip and filter text;
- `facet`: `goal` or `trait`;
- `description`: concise public meaning;
- `aliases`: alternate search terms and unambiguous legacy-query terms;
- `applicable_kinds`: supported `frontend`, `extension`, or `preset` kinds;
- `inclusion_guidance`: private evidence boundary for automated
  classification; and
- `exclusion_guidance`: private near-miss boundary that prevents broad or
  keyword-only assignment.

Public catalog data contains `id`, `label`, `facet`, `description`, `aliases`,
and `applicable_kinds`. Classifier guidance is never shipped to the browser.

### Goals

Goals describe what someone deliberately wants to accomplish. Examples
include:

- maintain long-term memory;
- manage context limits;
- build worlds and lore;
- plan stories and scenes;
- generate images;
- run group roleplay;
- add RPG gameplay; and
- organize chats and messages.

### Traits

Traits describe a meaningful way a project works. Examples include:

- local-first;
- privacy-focused;
- agentic tool use;
- semantic retrieval;
- visual workflow;
- multi-user;
- multi-stage generation; and
- persistent state.

Each card has zero to six unique tag IDs. Zero is a valid result when the
available evidence does not justify a selection. Project kind, frontend
compatibility, primary function, model family, completion format, license, and
popularity remain separate structured metadata.

Catalog filtering uses OR within selected Goals, OR within selected Traits, and
AND between the two facets. Repeated `tag` URL parameters are canonical.
Legacy `capability` parameters migrate only when a value exactly normalizes to
one unique tracked tag alias.

The former `capabilities` vocabulary is migration input only. It is not copied
to cards or treated as evidence of manual provenance.

## Primary functions

File: `data/vocabularies/primary-functions.json`

- `frontend`
- `preset`
- `memory-retrieval`
- `generation-reasoning`
- `character-worldbuilding`
- `rpg-systems`
- `interface-workflow`
- `developer-infrastructure`

`frontend` and `preset` are structural values. Only Extensions choose among the
six functional IDs.

## Evidence and taxonomy maintenance

Root READMEs are the primary evidence for automated descriptions and tags.
Repository descriptions are secondary. Raw bytes and source metadata are kept
in the ignored, source-keyed cache:

```text
local-data/catalog-evidence/<provider>/<repository-id>/
```

The cache is not refreshed implicitly during builds:

```powershell
npm.cmd run catalog:evidence:refresh -- --all
npm.cmd run catalog:evidence:refresh -- --source <source-id>
npm.cmd run catalog:evidence:refresh -- --project <project-id>
```

Taxonomy candidate discovery reads that cache and writes an ignored local
report. It never edits the tracked vocabulary:

```powershell
npm.cmd run catalog:taxonomy:discover
```

The controlled vocabulary is curated from recurring, deliberately searchable
concepts. Do not add one-off implementation details, vague qualities such as
“customizable,” or metadata already represented by another field.

## Why these exist

- Prevent taxonomy drift across records, scripts, forms, and filters.
- Keep generated catalog output deterministic.
- Make filtering explainable and maintainable.
- Let automation choose only from reviewed user-facing concepts.
- Give moderation precise inclusion and exclusion boundaries without turning
  uncertainty into an alert.

Changing tag definitions changes the vocabulary hash. Re-run full-card
classification, catalog validation, build, tests, and rendered filter checks
before merge.
