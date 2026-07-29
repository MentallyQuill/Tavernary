# Controlled vocabularies

Catalog filtering, labels, and card text are built from fixed vocabularies in `data/vocabularies`.

## Frontends

File: `data/vocabularies/frontends.json`

- `sillytavern`
- `lumiverse`
- `marinara-engine`
- `sonder-engine`

Schema: `id`, `label`, `description`.

## Capabilities

File: `data/vocabularies/capabilities.json`

IDs include:

- `automation`
- `character-worldbuilding`
- `extension-development`
- `image-generation`
- `instruction-control`
- `model-routing`
- `multi-frontend`
- `planning-reasoning`
- `prompt-engineering`
- `review-validation`

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

## Why these exist

- Prevent taxonomy drift across records and scripts.
- Keep generated catalog deterministic.
- Make filtering explainable and maintainable for moderation and UI validation.

Changing vocabulary entries requires both update and full validation/build gates (`npm run check`) before merge.
