"use client";

import Link from "next/link";
import { useState } from "react";

import {
  TAG_FACET_PREVIEW_LIMIT,
  TagBrowser,
} from "@/features/catalog/components/tag-browser";
import {
  CATALOG_DESCRIPTION_GUIDANCE,
  CATALOG_EMOJI_REMOVED_NOTICE,
  CATALOG_POLICY_ROUTE,
} from "@/features/catalog/catalog-policy.mjs";
import type { PublicTagDefinition } from "@/features/catalog/tag-vocabulary";
import { STRUCTURAL_PRIMARY_FUNCTIONS } from "@/features/catalog/primary-function-contract.mjs";
import { stripEmoji } from "@/features/catalog/emoji-free-text.mjs";
import type {
  OwnerCardDraft,
  OwnerProjectKind,
} from "@/features/help/project-owner-manifest.mjs";

import {
  HelpChoiceGroup,
  HelpSelectField,
  HelpTextArea,
  HelpTextField,
} from "./help-form-fields";

interface VocabularyOption {
  id: string;
  label: string;
}

export interface OwnerCardFieldVocabularies {
  frontends: VocabularyOption[];
  primaryFunctions: VocabularyOption[];
  tags: PublicTagDefinition[];
  modelFamilies: VocabularyOption[];
  completionFormats: VocabularyOption[];
}

function toggle(values: string[], id: string, checked: boolean) {
  if (checked) return values.includes(id) ? values : [...values, id];
  return values.filter((value) => value !== id);
}

function structuralPrimaryFunction(kind: OwnerProjectKind) {
  return kind === "extension" ? "" : STRUCTURAL_PRIMARY_FUNCTIONS[kind];
}

function fieldLabel(index: number, compact: boolean, label: string) {
  return compact
    ? `${label.charAt(0).toLocaleUpperCase()}${label.slice(1)}`
    : `Card ${index + 1} ${label}`;
}

export function OwnerCardFields({
  card,
  index,
  vocabularies,
  allowKindChange,
  compact = false,
  onChange,
}: {
  card: OwnerCardDraft;
  index: number;
  vocabularies: OwnerCardFieldVocabularies;
  allowKindChange: boolean;
  compact?: boolean;
  onChange: (card: OwnerCardDraft) => void;
}) {
  const [notice, setNotice] = useState("");
  const idPrefix = compact ? "owner-card" : `owner-card-${index + 1}`;
  const applicableTags = vocabularies.tags.filter((tag) =>
    tag.applicable_kinds.includes(card.kind),
  );

  function changeKind(kind: OwnerProjectKind) {
    const applicable = new Set(
      vocabularies.tags
        .filter((tag) => tag.applicable_kinds.includes(kind))
        .map((tag) => tag.id),
    );
    const tags = card.tags.filter((tag) => applicable.has(tag));
    const removedTags = tags.length !== card.tags.length;
    onChange({
      ...card,
      kind,
      primary_function: structuralPrimaryFunction(kind),
      tags,
      model_families: [],
      completion_formats: [],
    });
    setNotice(
      [
        "Kind changed. Choose the primary function and any required compatibility values for this card.",
        removedTags
          ? "Tags that do not apply to the new kind were removed."
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  return (
    <div className="owner-card-fields">
      {allowKindChange ? (
        <HelpSelectField
          id={`${idPrefix}-kind`}
          label={fieldLabel(index, compact, "kind")}
          value={card.kind}
          onChange={(event) =>
            changeKind(event.target.value as OwnerProjectKind)
          }
        >
          <option value="frontend">Frontend</option>
          <option value="extension">Extension</option>
          <option value="preset">Preset</option>
        </HelpSelectField>
      ) : (
        <p className="help-hint">
          Card type: <strong>{card.kind}</strong>
        </p>
      )}

      {notice ? (
        <p className="help-card-notice" role="status" aria-live="polite">
          {notice}
        </p>
      ) : null}

      <HelpTextField
        id={`${idPrefix}-name`}
        label={fieldLabel(index, compact, "display name")}
        value={card.name}
        maxLength={100}
        onChange={(event) => onChange({ ...card, name: event.target.value })}
      />
      <HelpTextArea
        id={`${idPrefix}-summary`}
        label={fieldLabel(index, compact, "summary")}
        value={card.summary}
        maxLength={220}
        rows={4}
        count={`${card.summary.length} / 220`}
        hint={
          <>
            {CATALOG_DESCRIPTION_GUIDANCE}{" "}
            <Link href={CATALOG_POLICY_ROUTE}>Catalog Policy</Link>
          </>
        }
        onChange={(event) => {
          const sanitized = stripEmoji(event.target.value);
          if (sanitized.removed) {
            setNotice(CATALOG_EMOJI_REMOVED_NOTICE);
          }
          onChange({
            ...card,
            summary: sanitized.value,
          });
        }}
      />
      <HelpSelectField
        id={`${idPrefix}-summary-policy`}
        label={fieldLabel(index, compact, "summary policy")}
        value={card.metadata.summary.mode}
        onChange={(event) =>
          onChange({
            ...card,
            metadata: {
              ...card.metadata,
              summary: {
                mode: event.target.value as "automatic" | "manual",
              },
            },
          })
        }
      >
        <option value="automatic">
          Let Tavernary write automatically (default)
        </option>
        <option value="manual">
          Use this summary as owner/editor-authored
        </option>
      </HelpSelectField>

      <HelpChoiceGroup
        legend={fieldLabel(index, compact, "supported frontends")}
      >
        {vocabularies.frontends.map((frontend) => (
          <label className="help-choice" key={frontend.id}>
            <input
              type="checkbox"
              checked={card.frontends.includes(frontend.id)}
              onChange={(event) =>
                onChange({
                  ...card,
                  frontends: toggle(
                    card.frontends,
                    frontend.id,
                    event.target.checked,
                  ),
                })
              }
            />
            <span>{frontend.label}</span>
          </label>
        ))}
      </HelpChoiceGroup>

      <HelpSelectField
        id={`${idPrefix}-primary-function`}
        label={fieldLabel(index, compact, "primary function")}
        value={card.primary_function}
        disabled={card.kind !== "extension"}
        onChange={(event) =>
          onChange({ ...card, primary_function: event.target.value })
        }
      >
        {card.kind === "extension" ? (
          <option value="">Choose a primary function</option>
        ) : null}
        {vocabularies.primaryFunctions
          .filter((option) =>
            card.kind === "extension"
              ? !["frontend", "preset"].includes(option.id)
              : option.id === STRUCTURAL_PRIMARY_FUNCTIONS[card.kind],
          )
          .map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
      </HelpSelectField>

      <div className="help-field">
        <span className="help-field-label">
          {fieldLabel(index, compact, "goals and traits")}
        </span>
        <TagBrowser
          tags={applicableTags}
          selected={card.tags}
          onToggle={(id: string) =>
            onChange({
              ...card,
              tags: card.tags.includes(id)
                ? card.tags.filter((tag) => tag !== id)
                : [...card.tags, id],
            })
          }
          previewLimit={TAG_FACET_PREVIEW_LIMIT}
          maxSelections={6}
          searchLabel={fieldLabel(index, compact, "tag search")}
          limitLabel="Up to six per card"
        />
      </div>
      <HelpSelectField
        id={`${idPrefix}-tag-policy`}
        label={fieldLabel(index, compact, "tag policy")}
        value={card.metadata.tags.mode}
        onChange={(event) =>
          onChange({
            ...card,
            metadata: {
              ...card.metadata,
              tags: { mode: event.target.value as "automatic" | "manual" },
            },
          })
        }
      >
        <option value="automatic">
          Let Tavernary select automatically (default)
        </option>
        <option value="manual">Use these tags as owner/editor-authored</option>
      </HelpSelectField>

      {card.kind === "preset" ? (
        <>
          <HelpChoiceGroup
            legend={fieldLabel(index, compact, "model families")}
          >
            {vocabularies.modelFamilies.map((model) => (
              <label className="help-choice" key={model.id}>
                <input
                  type="checkbox"
                  checked={card.model_families.includes(model.id)}
                  onChange={(event) =>
                    onChange({
                      ...card,
                      model_families: toggle(
                        card.model_families,
                        model.id,
                        event.target.checked,
                      ),
                    })
                  }
                />
                <span>{model.label}</span>
              </label>
            ))}
          </HelpChoiceGroup>
          <HelpChoiceGroup
            legend={fieldLabel(index, compact, "completion formats")}
          >
            {vocabularies.completionFormats.map((format) => (
              <label className="help-choice" key={format.id}>
                <input
                  type="checkbox"
                  checked={card.completion_formats.includes(format.id)}
                  onChange={(event) =>
                    onChange({
                      ...card,
                      completion_formats: toggle(
                        card.completion_formats,
                        format.id,
                        event.target.checked,
                      ),
                    })
                  }
                />
                <span>{format.label}</span>
              </label>
            ))}
          </HelpChoiceGroup>
        </>
      ) : null}
    </div>
  );
}
