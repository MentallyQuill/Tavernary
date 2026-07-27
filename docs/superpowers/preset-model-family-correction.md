# Preset Model-Family Metadata Correction

**Status:** Manual review in progress  
**Purpose:** Record confirmed model-family compatibility for every preset before making registry changes.

## How to use this document

Review the presets in order, one at a time. For each preset, provide either:

- `Model-Agnostic`; or
- one or more model-family labels from the controlled vocabulary below.

Prefer a Reddit research post as the canonical source when one is available,
over a Google Drive, direct-download, or other artifact link. If the
compatibility depends on a particular preset version, prompt format, or
configuration, record that in **Research notes**. A preset may be model-agnostic
while also carrying named model-family tags as recommended compatibility tags.
Do not update the registry until all ten entries have been reviewed.

The current values below are copied from the registry as of 2026-07-26. They
are included only as a comparison point; they are not treated as confirmed.

## Controlled model-family vocabulary

`Model-Agnostic`, `Claude`, `GPT`, `Gemini`, `Gemma`, `DeepSeek`, `GLM`,
`MiniMax`, `MiMo`, `Kimi`, `Qwen`, `Llama`, and `Mistral`.

`Model-Agnostic` may be combined with named model families when the preset is
generally usable across models but specifically recommends or documents those
families.

## Review queue

### 1. FrankenGarage

- Registry ID: `daddytorgo-hash-frankengarage`
- Registry file: `data/registry/projects/daddytorgo-hash-frankengarage.json`
- Source: <https://github.com/daddytorgo-hash/FrankenGarage>
- Current model-family tags: Claude, Gemini, DeepSeek, GLM
- Confirmed model-family compatibility: Model-Agnostic, Claude, Gemini, DeepSeek, GLM
- Research notes: The source describes FrankenGarage as model-agnostic while specifically naming Claude, Gemini, DeepSeek, and GLM as recommended compatible families.

### 2. LE_EMOTIONALISM 1.1.5

- Registry ID: `le-emotionalism-1-1-5-prompt`
- Registry file: `data/registry/projects/le-emotionalism-1-1-5-prompt.json`
- Source: <https://www.reddit.com/r/SillyTavernAI/comments/1v46vqe/le_emotionalism_version_115_emotionalbased_preset/>
- Current model-family tags: GLM, Claude, Kimi, MiMo
- Confirmed model-family compatibility: Model-Agnostic, GLM, Claude, Kimi, MiMo
- Research notes: The source reports GLM 5.2 as the primary target, with Claude, Kimi K3/K2.7, and MiMo V2.5 Pro tested successfully. DeepSeek V4 Pro Preview is explicitly reported as not working, so DeepSeek is not a confirmed compatibility tag.

### 3. Wandlight

- Registry ID: `mentallyquill-st-wandlight`
- Registry file: `data/registry/projects/mentallyquill-st-wandlight.json`
- Source: <https://github.com/MentallyQuill/ST-Wandlight>
- Current model-family tags: Model-Agnostic
- Confirmed model-family compatibility: Model-Agnostic, Claude, GPT, GLM, DeepSeek
- Research notes: Confirmed as model-agnostic with specific compatibility for Claude, GPT, GLM, and DeepSeek.

### 4. Pura's Director v15.0

- Registry ID: `puras-director-v15`
- Registry file: `data/registry/projects/puras-director-v15.json`
- Source: <https://platberlitz.github.io>
- Current model-family tags: Model-Agnostic
- Confirmed model-family compatibility: Model-Agnostic, Claude, Gemini, GPT, GLM, Kimi, Qwen, MiMo, Gemma
- Research notes: Reports model-agnostic compatibility, with specific testing on Opus, Gemini, GPT, GLM, Kimi K3 and K2.x, Qwen, StepFlash, MiMo, and Gemma 4. StepFlash is recorded as a reported model name but is not mapped to a controlled family yet. Smaller tested models include Rocinante 12B, Psionia 24B, Wizard LM 8X 22B, and Bailic 11B; retain these as evidence for possible future smaller-model filtering rather than adding them as current family tags.

### 5. Purrfect Logic 4 Max Mini

- Registry ID: `purrfect-logic-4-max-mini`
- Registry file: `data/registry/projects/purrfect-logic-4-max-mini.json`
- Source: <https://old.reddit.com/r/SillyTavernAI/comments/1twlef0/purrfect_logic_4_max_mini_update_token_cleanup/>
- Current model-family tags: DeepSeek
- Confirmed model-family compatibility: Model-Agnostic, DeepSeek, GLM
- Research notes: Confirmed as model-agnostic with specific compatibility for DeepSeek and GLM.

### 6. Realistic Frankenstein

- Registry ID: `realistic-frankenstein-preset`
- Registry file: `data/registry/projects/realistic-frankenstein-preset.json`
- Source: <https://old.reddit.com/r/SillyTavernAI/comments/1tyuh6h/realistic_frankenstein_my_new_family_of_freaky>
- Current model-family tags: GLM, DeepSeek, Gemini, Claude
- Confirmed model-family compatibility: Model-Agnostic, GLM, DeepSeek, Gemini, Claude
- Research notes: Confirmed as model-agnostic with specific compatibility for GLM, DeepSeek, Gemini, and Claude.

### 7. Writer's Block 5

- Registry ID: `reddit-1v64r6z`
- Registry file: `data/registry/projects/reddit-1v64r6z.json`
- Source: <https://www.reddit.com/r/SillyTavernAI/comments/1v64r6z/update_writers_block_5_a_prose_and_narrative/>
- Current model-family tags: Model-Agnostic
- Confirmed model-family compatibility: Model-Agnostic, GLM, DeepSeek, MiMo
- Research notes: Confirmed as model-agnostic with specific compatibility for GLM, DeepSeek, and MiMo.

### 8. Village Maker

- Registry ID: `village-maker-google-drive-prompt`
- Registry file: `data/registry/projects/village-maker-google-drive-prompt.json`
- Source: <https://www.reddit.com/r/SillyTavernAI/comments/1v3rfm4/village_maker_v10_dating_sim_cards_thornbeck/>
- Current model-family tags: Claude
- Confirmed model-family compatibility: Claude
- Research notes: Confirmed compatibility with Claude.

### 9. Writer's Block 4

- Registry ID: `writers-block-4`
- Registry file: `data/registry/projects/writers-block-4.json`
- Source: <https://old.reddit.com/r/SillyTavernAI/comments/1tnsxh6/update_writers_block_4_the_quest_for_tokens_a>
- Current model-family tags: GLM, Gemma, DeepSeek
- Confirmed model-family compatibility: Model-Agnostic, GLM, DeepSeek, MiMo
- Research notes: Same compatibility determination as Writer's Block 5: model-agnostic with specific compatibility for GLM, DeepSeek, and MiMo.

### 10. Stab's Directives

- Registry ID: `zorgonatis-stabs-edh`
- Registry file: `data/registry/projects/zorgonatis-stabs-edh.json`
- Source: <https://github.com/Zorgonatis/Stabs-EDH>
- Current model-family tags: GLM, DeepSeek
- Confirmed model-family compatibility: GLM
- Research notes: Confirmed compatibility with GLM.

## Final application checklist

- [x] All ten presets have confirmed model-family compatibility.
- [ ] Any `Model-Agnostic` decision is recorded together with named recommended families when the source provides them.
- [ ] Any ambiguity or version-specific limitation is recorded in the notes.
- [ ] Registry tags will be updated from this document in a separate change.
- [ ] Catalog build and compatibility validation will be run after the registry update.
