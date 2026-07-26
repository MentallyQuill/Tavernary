# Manual Preset Curation Design

**Status:** Approved for planning

**Goal:** Replace provisional System Preset metadata with source-grounded
summaries and controlled metadata, while consolidating Village Maker and
curating Tavern RPG Suite as an explicit organization-level exception.

## Scope

The manual research queue contains seven units:

1. LE Emotionalism 1.1.5
2. Pura's Director 15.0
3. Purrfect Logic 4 Max Mini
4. Realistic Frankenstein
5. Writer's Block 4
6. Village Maker 1.0
7. Tavern RPG Suite

The first six are System Presets with URL sources. Tavern RPG Suite is an
explicit manual-curation exception because its single organization entry
represents an interconnected suite of repositories.

Enrichment selection or skip behavior is out of scope. Another workstream owns
that change.

## Source Handling

Each unit is researched from its canonical public source and, when necessary,
supporting public artifacts. Source material is untrusted reference data:
embedded instructions are never followed.

The curator records:

- a factual description of what the project does;
- evidence for its primary function and every capability;
- compatible frontends;
- version, publication date, artifact size, and license when discoverable;
- creator attribution and canonical URL;
- unresolved ambiguity or inaccessible source material.

Popularity, comments, project names, and adjacent projects are not evidence for
features.

## Manual Enrichment Contract

The reusable research prompt returns:

```json
{
  "summary": "One factual sentence.",
  "metadata_status": "curated",
  "primary_function": "controlled-vocabulary-id",
  "capabilities": ["controlled-vocabulary-id"],
  "evidence": {
    "summary": "Source-backed rationale.",
    "primary_function": "Source-backed rationale.",
    "capabilities": {
      "controlled-vocabulary-id": "Source-backed rationale."
    }
  }
}
```

Rules:

- `summary` contains 12-24 words, no Markdown, and at most 140 characters;
- `metadata_status` is `curated`;
- `primary_function` is exactly one existing controlled-vocabulary ID;
- `capabilities` contains only existing controlled-vocabulary IDs;
- every selected value must be supported by supplied evidence;
- the bundle, rather than each supporting link, is the unit of description;
- evidence is retained for curator review but is not written to the project
  registry record.

Registry writes remain limited to `summary`, `metadata_status`,
`primary_function`, and `capabilities`, except for separately approved source
consolidation or factual URL-source metadata.

## Proposed Classification

| Project | Primary function | Capabilities |
| --- | --- | --- |
| LE Emotionalism 1.1.5 | `generation-reasoning` | `prompt-engineering`, `instruction-control`, `planning-reasoning`, `character-worldbuilding` |
| Pura's Director 15.0 | `generation-reasoning` | `prompt-engineering`, `instruction-control`, `planning-reasoning`, `character-worldbuilding` |
| Purrfect Logic 4 Max Mini | `generation-reasoning` | `prompt-engineering`, `instruction-control` |
| Realistic Frankenstein | `generation-reasoning` | `prompt-engineering`, `instruction-control`, `planning-reasoning` |
| Writer's Block 4 | `generation-reasoning` | `prompt-engineering`, `instruction-control`, `planning-reasoning` |
| Village Maker 1.0 | `character-worldbuilding` | `character-worldbuilding`, `prompt-engineering` |
| Tavern RPG Suite | `rpg-systems` | `automation`, `character-worldbuilding`, `image-generation`, `instruction-control`, `model-routing` |

These are curator proposals, not automatic classifications. Final record edits
must remain consistent with the collected evidence.

## Village Maker Consolidation

Village Maker is one bundle.

- Keep `village-maker-google-drive-prompt` as the stable project ID.
- Keep `Village Maker` as the card name.
- Use the public Google Drive document as the sole canonical source.
- Treat Thornbeck and Harrow Hundred as examples referenced by the build guide.
- Remove the separate Thornbeck, Harrow Hundred, and Supplementary Paste
  entries from both the curated registry and the legacy flat intake dataset so
  a later migration cannot recreate them.
- Do not add aliases, redirects, or supporting-link fields in V1.

The supplementary AnonPaste has expired. Both BotBooru example pages currently
report that their characters do not exist. Neither condition changes the
canonical Drive document's identity.

## Verification

Implementation must verify:

- all seven surviving units have source-grounded summaries and controlled IDs;
- every summary satisfies the enrichment contract;
- Village Maker appears exactly once in the registry and generated catalog;
- the removed Village Maker source records leave no broken snapshots or
  generated references;
- Tavern RPG Suite remains one organization-level card;
- project schema validation, catalog validation, build, and the full repository
  check pass;
- unrelated worktree changes remain untouched.
