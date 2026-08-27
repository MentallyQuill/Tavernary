"use client";

import type { OwnerCardDraft } from "@/features/help/project-owner-manifest.mjs";
import { siblingProjectId } from "@/features/catalog/source-record.mjs";
import type { OwnerProjectOption } from "@/lib/help/load-owner-project-options";

import {
  OwnerCardFields,
  type OwnerCardFieldVocabularies,
} from "./owner-card-fields";

export const ADD_CARD_NOTICE =
  "You may propose up to 10 cards from this GitHub repository in one request. Only one unresolved add-card request may exist for the repository at a time. Every card is submitted as one batch.";

let fallbackDraftSequence = 0;

function opaqueDraftId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  fallbackDraftSequence += 1;
  return `draft-${Date.now()}-${fallbackDraftSequence}`;
}

function sourceShape(project: OwnerProjectOption) {
  return {
    id: project.sourceId,
    type: "github" as const,
    repository: project.repository ?? "",
  };
}

export function createSourceCardDraft(
  project: OwnerProjectOption,
): OwnerCardDraft {
  const name = project.editable.name;
  return {
    draft_id: opaqueDraftId(),
    project_id: siblingProjectId(sourceShape(project), name),
    name,
    kind: project.kind,
    summary: project.editable.summary,
    frontends: [...project.editable.frontends],
    primary_function: project.editable.primaryFunction,
    tags: [...project.editable.tags],
    metadata: {
      summary: { mode: "automatic" },
      tags: { mode: "automatic" },
    },
    model_families: [...project.editable.modelFamilies],
    completion_formats: [...project.editable.completionFormats],
  };
}

export function SourceCardBatchEditor({
  sourceCard,
  cards,
  vocabularies,
  onChange,
}: {
  sourceCard: OwnerProjectOption;
  cards: OwnerCardDraft[];
  vocabularies: OwnerCardFieldVocabularies;
  onChange: (cards: OwnerCardDraft[]) => void;
}) {
  function updateCard(index: number, card: OwnerCardDraft) {
    const next = [...cards];
    next[index] = {
      ...card,
      project_id: siblingProjectId(sourceShape(sourceCard), card.name),
    };
    onChange(next);
  }

  function addCard() {
    if (cards.length >= 10) return;
    onChange([...cards, createSourceCardDraft(sourceCard)]);
  }

  function removeCard(index: number) {
    if (cards.length <= 1) return;
    onChange(cards.filter((_, candidate) => candidate !== index));
  }

  return (
    <section
      className="source-card-batch"
      aria-labelledby="source-card-heading"
    >
      <div className="source-card-batch-heading">
        <div>
          <h2 id="source-card-heading">Cards from {sourceCard.repository}</h2>
          <p>{ADD_CARD_NOTICE}</p>
        </div>
        <span className="source-card-count" role="status" aria-live="polite">
          {cards.length} / 10 cards
        </span>
      </div>

      <div className="source-card-drafts">
        {cards.map((card, index) => (
          <fieldset
            className="source-card-draft"
            key={card.draft_id}
            aria-label={`Card ${index + 1}: ${card.name || "Untitled"}`}
          >
            <legend>{`Card ${index + 1}: ${card.name || "Untitled"}`}</legend>
            <div className="source-card-project-id">
              Generated project ID: <code>{card.project_id}</code>
            </div>
            <OwnerCardFields
              card={card}
              index={index}
              vocabularies={vocabularies}
              automaticValues={{
                summary: sourceCard.editable.summary,
                tags: sourceCard.editable.tags,
              }}
              allowKindChange
              onChange={(next) => updateCard(index, next)}
            />
            <button
              type="button"
              className="help-link-action"
              disabled={cards.length === 1}
              onClick={() => removeCard(index)}
            >
              Remove Card {index + 1}
            </button>
          </fieldset>
        ))}
      </div>

      <button
        type="button"
        className="help-secondary-action"
        disabled={cards.length >= 10}
        onClick={addCard}
      >
        Add another card
      </button>
    </section>
  );
}
