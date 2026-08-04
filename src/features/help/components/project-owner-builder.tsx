"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import type {
  OwnerCardDraft,
  OwnerEditableValues,
  OwnerOperation,
  ProjectOwnerManifest,
} from "@/features/help/project-owner-manifest.mjs";
import { normalizeProjectOwnerManifest } from "@/features/help/project-owner-manifest.mjs";
import { openHelpRequest } from "@/features/help/help-transport";
import type { OwnerProjectOption } from "@/lib/help/load-owner-project-options";

import {
  HelpChoiceGroup,
  HelpErrorSummary,
  HelpTextArea,
  HelpTextField,
} from "./help-form-fields";
import { HelpReview, type HelpReviewRow } from "./help-review";
import {
  OwnerCardFields,
  type OwnerCardFieldVocabularies,
} from "./owner-card-fields";
import { PermanentDelistDialog } from "./permanent-delist-dialog";
import { ProjectPicker } from "./project-picker";
import {
  createSourceCardDraft,
  SourceCardBatchEditor,
} from "./source-card-batch-editor";

export type OwnerBuilderVocabularies = OwnerCardFieldVocabularies;

const operationLabels: Record<OwnerOperation, string> = {
  "edit-card": "Edit card details",
  "add-cards": "Add cards from this source",
  "retire-card": "Retire this card",
  "restore-card": "Restore this card",
  "move-source": "Update repository location",
  "delist-source": "Permanently delist this source",
};

function startingProjectId(
  projects: OwnerProjectOption[],
  candidate: string | null,
) {
  return candidate && projects.some((project) => project.id === candidate)
    ? candidate
    : "";
}

function createEditDraft(project: OwnerProjectOption): OwnerCardDraft {
  return {
    draft_id: "edit-card",
    project_id: project.id,
    name: project.editable.name,
    kind: project.kind,
    summary: project.editable.summary,
    frontends: [...project.editable.frontends],
    primary_function: project.editable.primaryFunction,
    tags: [...project.editable.tags],
    metadata: {
      summary: { mode: project.editable.metadataPolicy.summary.mode },
      tags: { mode: project.editable.metadataPolicy.tags.mode },
    },
    model_families: [...project.editable.modelFamilies],
    completion_formats: [...project.editable.completionFormats],
  };
}

function editableValues(card: OwnerCardDraft): OwnerEditableValues {
  return {
    name: card.name,
    summary: card.summary,
    frontends: [...card.frontends],
    primary_function: card.primary_function,
    tags: [...card.tags],
    metadata: structuredClone(card.metadata),
    model_families: [...card.model_families],
    completion_formats: [...card.completion_formats],
  };
}

function originalValues(project: OwnerProjectOption) {
  return {
    kind: project.kind,
    ...editableValues(createEditDraft(project)),
  };
}

function parseGitHubRepository(value: string) {
  try {
    const url = new URL(value.trim());
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLocaleLowerCase() !== "github.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      parts.length !== 2
    ) {
      return null;
    }
    const repository = parts[1]?.replace(/\.git$/iu, "");
    if (
      !parts[0] ||
      !repository ||
      !/^[A-Za-z0-9_.-]+$/u.test(parts[0]) ||
      !/^[A-Za-z0-9_.-]+$/u.test(repository)
    ) {
      return null;
    }
    return `${parts[0]}/${repository}`;
  } catch {
    return null;
  }
}

function operationsFor(project: OwnerProjectOption): OwnerOperation[] {
  if (project.sourceState.status !== "active") {
    return [];
  }
  const operations: OwnerOperation[] = ["edit-card"];
  if (project.listingState.listingStatus === "active") {
    operations.push("retire-card");
  } else if (project.listingState.listingStatus === "retired") {
    operations.push("restore-card");
  }
  if (project.eligibleShape) {
    operations.push("add-cards", "move-source", "delist-source");
  }
  return operations;
}

function normalizedTitle(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
}

function batchPreflight(cards: OwnerCardDraft[]) {
  const errors: string[] = [];
  const ids = new Map<string, number>();
  const titles = new Map<string, number>();
  cards.forEach((card, index) => {
    const label = `Card ${index + 1} (${card.name.trim() || "Untitled"})`;
    if (!card.name.trim())
      errors.push(`${label}: Owner display name is required.`);
    if (!card.summary.trim() && card.metadata.summary.mode === "manual")
      errors.push(`${label}: Owner summary is required.`);
    const priorId = ids.get(card.project_id);
    if (priorId !== undefined) {
      errors.push(
        `${label}: duplicate project ID also used by Card ${priorId + 1}.`,
      );
    } else {
      ids.set(card.project_id, index);
    }
    const title = normalizedTitle(card.name);
    const priorTitle = titles.get(title);
    if (title && priorTitle !== undefined) {
      errors.push(
        `${label}: duplicate normalized title also used by Card ${priorTitle + 1}.`,
      );
    } else if (title) {
      titles.set(title, index);
    }
  });
  return errors;
}

function reviewValue(values: string[]) {
  return values.join(", ") || "None";
}

function summaryReviewValue(summary: string, mode: "automatic" | "manual") {
  return mode === "automatic" ? "Generated automatically" : summary;
}

function reviewRows(
  manifest: ProjectOwnerManifest,
  project: OwnerProjectOption,
): HelpReviewRow[] {
  if (manifest.operation === "add-cards") {
    return [
      { label: "Source", value: project.repository },
      ...manifest.proposed_cards.map((card, index) => ({
        label: `Card ${index + 1}: ${card.name}`,
        value: (
          <div className="owner-card-review">
            <code>{card.project_id}</code>
            <span>Type: {card.kind}</span>
            <span>
              Summary:{" "}
              {summaryReviewValue(card.summary, card.metadata.summary.mode)}
            </span>
            <span>Frontends: {reviewValue(card.frontends)}</span>
            <span>Primary function: {card.primary_function}</span>
            <span>Goals and traits: {reviewValue(card.tags)}</span>
            <span>Summary policy: {card.metadata.summary.mode}</span>
            <span>Tag policy: {card.metadata.tags.mode}</span>
            {card.kind === "preset" ? (
              <>
                <span>Model families: {reviewValue(card.model_families)}</span>
                <span>
                  Completion formats: {reviewValue(card.completion_formats)}
                </span>
              </>
            ) : null}
          </div>
        ),
      })),
    ];
  }
  if (manifest.operation === "edit-card") {
    return [
      { label: "Card", value: project.name },
      { label: "Before: display name", value: manifest.original.name },
      { label: "After: display name", value: manifest.proposed.name },
      { label: "Before: summary", value: manifest.original.summary },
      {
        label: "After: summary",
        value: summaryReviewValue(
          manifest.proposed.summary,
          manifest.proposed.metadata.summary.mode,
        ),
      },
      {
        label: "Before: goals and traits",
        value: reviewValue(manifest.original.tags),
      },
      {
        label: "After: goals and traits",
        value: reviewValue(manifest.proposed.tags),
      },
      {
        label: "Metadata choices",
        value: `Summary: ${manifest.proposed.metadata.summary.mode}; tags: ${manifest.proposed.metadata.tags.mode}`,
      },
    ];
  }
  if (
    manifest.operation === "retire-card" ||
    manifest.operation === "restore-card"
  ) {
    return [
      { label: "Card", value: project.name },
      {
        label: "Lifecycle",
        value: `After: ${manifest.proposed.listing_status}`,
      },
    ];
  }
  if (manifest.operation === "move-source") {
    return [
      { label: "Before: repository", value: manifest.original.repository },
      { label: "After: repository", value: manifest.proposed.repository },
      {
        label: "Immutable repository ID",
        value: String(manifest.proposed.repository_id),
      },
    ];
  }
  return [
    { label: "Repository", value: project.repository },
    {
      label: "Affected cards",
      value: [project.name, ...project.siblings.map((card) => card.name)].join(
        ", ",
      ),
    },
    { label: "Confirmation", value: manifest.delist_confirmation },
    { label: "Effect", value: "Permanent source delisting" },
  ];
}

function policyStatement(
  manifest: ProjectOwnerManifest,
  project: OwnerProjectOption,
) {
  if (manifest.operation === "add-cards") {
    return "Tavernary maintainers review and approve the complete card batch together.";
  }
  if (manifest.operation === "retire-card") {
    return `Retiring ${project.name} is reversible and affects only this card.`;
  }
  if (manifest.operation === "restore-card") {
    return `Restoring ${project.name} is reversible card maintenance.`;
  }
  if (manifest.operation === "delist-source") {
    return `This permanently delists ${project.repository} and every card from that source.`;
  }
  if (manifest.operation === "move-source") {
    return "The repository location changes while its immutable identity and sibling cards stay the same.";
  }
  return "Summary and tag authorship choices are independent for this card.";
}

export function ProjectOwnerBuilder({
  projects,
  tagVocabularyHash,
  vocabularies,
}: {
  projects: OwnerProjectOption[];
  tagVocabularyHash: string;
  vocabularies: OwnerBuilderVocabularies;
}) {
  const searchParams = useSearchParams();
  const initialId = startingProjectId(projects, searchParams.get("project"));
  const initialProject = projects.find((project) => project.id === initialId);
  const [projectId, setProjectId] = useState(initialId);
  const [operation, setOperation] = useState<OwnerOperation | "">("");
  const [editCard, setEditCard] = useState<OwnerCardDraft | null>(
    initialProject ? createEditDraft(initialProject) : null,
  );
  const [batchCards, setBatchCards] = useState<OwnerCardDraft[]>(
    initialProject ? [createSourceCardDraft(initialProject)] : [],
  );
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [explanation, setExplanation] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [reviewManifest, setReviewManifest] =
    useState<ProjectOwnerManifest | null>(null);
  const [delistDialogOpen, setDelistDialogOpen] = useState(false);

  const selected = projects.find((project) => project.id === projectId);
  const availableOperations = selected ? operationsFor(selected) : [];

  function selectProject(id: string) {
    const project = projects.find((candidate) => candidate.id === id);
    setProjectId(project?.id ?? "");
    setOperation("");
    setEditCard(project ? createEditDraft(project) : null);
    setBatchCards(project ? [createSourceCardDraft(project)] : []);
    setRepositoryUrl("");
    setExplanation("");
    setErrors([]);
    setReviewing(false);
    setReviewManifest(null);
    setDelistDialogOpen(false);
  }

  function chooseOperation(next: OwnerOperation) {
    setOperation(next);
    setErrors([]);
    setReviewing(false);
    setReviewManifest(null);
    if (next === "add-cards" && selected) {
      setBatchCards([createSourceCardDraft(selected)]);
    }
  }

  function candidateManifest(confirmation = "") {
    if (
      !selected ||
      !operation ||
      !selected.sourceId ||
      (operation === "move-source" &&
        (!selected.repository || !selected.repositoryId))
    ) {
      return null;
    }
    const base = {
      schema_version: 2,
      request_kind: "project-owner",
      operation,
      source_id: selected.sourceId,
      repository_id: selected.repositoryId,
      explanation: explanation.trim() || null,
    };
    if (operation === "edit-card" && editCard) {
      return {
        ...base,
        tag_vocabulary_hash: tagVocabularyHash,
        project_id: selected.id,
        project_fingerprint: selected.projectFingerprint,
        original: originalValues(selected),
        proposed: editableValues(editCard),
      };
    }
    if (operation === "add-cards") {
      return {
        ...base,
        tag_vocabulary_hash: tagVocabularyHash,
        source_fingerprint: selected.sourceFingerprint,
        proposed_cards: batchCards,
      };
    }
    if (operation === "retire-card") {
      return {
        ...base,
        project_id: selected.id,
        project_fingerprint: selected.projectFingerprint,
        original: { listing_status: "active", listing_status_reason: null },
        proposed: {
          listing_status: "retired",
          listing_status_reason: "owner-request",
        },
      };
    }
    if (operation === "restore-card") {
      return {
        ...base,
        project_id: selected.id,
        project_fingerprint: selected.projectFingerprint,
        original: {
          listing_status: "retired",
          listing_status_reason: "owner-request",
        },
        proposed: { listing_status: "active", listing_status_reason: null },
      };
    }
    if (operation === "move-source") {
      return {
        ...base,
        source_fingerprint: selected.sourceFingerprint,
        original: {
          repository: selected.repository,
          repository_id: selected.repositoryId,
        },
        proposed: {
          repository: parseGitHubRepository(repositoryUrl) ?? "",
          repository_id: selected.repositoryId,
        },
      };
    }
    return {
      ...base,
      source_fingerprint: selected.sourceFingerprint,
      original: { status: "active" },
      proposed: {
        status: "delisted",
        status_reason: "removed",
        refresh_policy: "paused",
      },
      delist_confirmation: confirmation,
    };
  }

  function validateAndReview(confirmation = "") {
    const nextErrors: string[] = [];
    if (!selected) nextErrors.push("Select a listed project.");
    if (selected && availableOperations.length === 0) {
      nextErrors.push(
        selected.ineligibilityReason ??
          "This source cannot use owner maintenance.",
      );
    }
    if (!operation) nextErrors.push("Choose an owner request type.");
    if (operation === "add-cards") {
      nextErrors.push(...batchPreflight(batchCards));
    }
    if (operation === "move-source" && !parseGitHubRepository(repositoryUrl)) {
      nextErrors.push("Enter one public GitHub repository URL.");
    }
    const candidate = candidateManifest(confirmation);
    if (candidate && selected) {
      const result = normalizeProjectOwnerManifest(candidate, {
        ...vocabularies,
        tagVocabularyHash,
        source: {
          id: selected.sourceId,
          type: selected.sourceType,
          repository: selected.repository,
          repository_id: selected.repositoryId,
        },
      });
      if (!result.valid) nextErrors.push(...result.errors);
      else setReviewManifest(result.manifest);
    }
    const unique = [...new Set(nextErrors)];
    setErrors(unique);
    if (unique.length === 0 && candidate) setReviewing(true);
    return unique.length === 0;
  }

  async function openReview() {
    if (!selected || !operation || !reviewManifest) {
      throw new Error("The owner request is no longer ready for review.");
    }
    return openHelpRequest({
      formUrl: "https://github.com/MentallyQuill/Tavernary/issues/new",
      template: "08-project-owner-request.yml",
      manifestFieldId: "owner-request-manifest",
      manifest: reviewManifest,
      prefills: [
        ["request-type", operationLabels[operation]],
        ["source-id", reviewManifest.source_id],
        [
          "project-id",
          "project_id" in reviewManifest ? reviewManifest.project_id : "",
        ],
        ["repository", selected.sourceUrl ?? ""],
        ["explanation", explanation.trim()],
      ],
      pasteInstruction:
        "Paste the copied Tavernary owner request manifest into this field.",
    });
  }

  if (reviewing && selected && reviewManifest) {
    return (
      <>
        <p className="help-hint">
          GitHub will verify either current personal-owner authority or reviewed
          Tavernary staff authority.
        </p>
        <p className="owner-policy-statement">
          {policyStatement(reviewManifest, selected)}
        </p>
        <HelpReview
          rows={[
            {
              label: "Request type",
              value: operationLabels[reviewManifest.operation],
            },
            ...reviewRows(reviewManifest, selected),
            { label: "Public note", value: explanation.trim() || "None" },
          ]}
          onBack={() => setReviewing(false)}
          onCancel={() => {
            setReviewing(false);
            setReviewManifest(null);
          }}
          openReview={openReview}
          returnFocusId="owner-review"
        />
      </>
    );
  }

  return (
    <>
      <form
        className="help-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (operation === "delist-source" && selected) {
            setErrors([]);
            setDelistDialogOpen(true);
            return;
          }
          validateAndReview();
        }}
      >
        <p className="help-hint">
          GitHub verifies current personal repository ownership after
          submission. Trusted Tavernary staff may submit reviewed maintenance
          requests for any active listing, including listings from other
          sources.
        </p>
        <HelpErrorSummary errors={errors} />
        <ProjectPicker
          projects={projects}
          value={projectId}
          invalid={errors.includes("Select a listed project.")}
          onChange={selectProject}
        />

        {selected?.ineligibilityReason ? (
          <div className="help-inline-note">
            <p>{selected.ineligibilityReason}</p>
            {selected.sourceType !== "github" &&
            selected.sourceState.status === "active" ? (
              <p>
                If you own this listing, use the help request below so staff can
                review proof of ownership before making changes.
              </p>
            ) : null}
            <Link href={`/help/report-project?project=${selected.id}`}>
              {selected.sourceType === "github"
                ? "Report this listing instead"
                : "Request staff help with this listing"}
            </Link>
          </div>
        ) : null}

        {selected && availableOperations.length > 0 ? (
          <HelpChoiceGroup
            legend="What would you like to do?"
            error={
              errors.includes("Choose an owner request type.")
                ? "Choose an owner request type."
                : undefined
            }
          >
            {availableOperations.map((value) => (
              <label className="help-choice" key={value}>
                <input
                  type="radio"
                  name="owner-operation"
                  value={value}
                  checked={operation === value}
                  onChange={() => chooseOperation(value)}
                />
                <span>{operationLabels[value]}</span>
              </label>
            ))}
          </HelpChoiceGroup>
        ) : null}

        {operation === "edit-card" && editCard ? (
          <OwnerCardFields
            card={editCard}
            index={0}
            vocabularies={vocabularies}
            automaticValues={{
              summary: selected.editable.summary,
              tags: selected.editable.tags,
            }}
            allowKindChange={false}
            compact
            onChange={setEditCard}
          />
        ) : null}

        {operation === "add-cards" && selected ? (
          <SourceCardBatchEditor
            sourceCard={selected}
            cards={batchCards}
            vocabularies={vocabularies}
            onChange={setBatchCards}
          />
        ) : null}

        {operation === "retire-card" && selected ? (
          <p className="help-lifecycle-note">
            Retiring {selected.name} hides only this card. The repository and
            sibling cards stay listed, and this card can be restored later.
          </p>
        ) : null}

        {operation === "restore-card" && selected ? (
          <p className="help-lifecycle-note">
            Restoring {selected.name} returns this card to the public catalog
            without changing its repository or sibling cards.
          </p>
        ) : null}

        {operation === "move-source" && selected ? (
          <HelpTextField
            id="owner-repository"
            label="Public GitHub repository URL"
            value={repositoryUrl}
            placeholder={`https://github.com/${selected.repository ?? "owner/repository"}`}
            onChange={(event) => setRepositoryUrl(event.target.value)}
          />
        ) : null}

        {operation === "delist-source" && selected ? (
          <div className="help-inline-note help-danger-note">
            <p>
              This permanently delists {selected.repository} and hides all{" "}
              {selected.siblings.length + 1} cards from the source.
            </p>
            <ul>
              <li>{selected.name}</li>
              {selected.siblings.map((card) => (
                <li key={card.id}>{card.name}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {operation ? (
          <HelpTextArea
            id="owner-explanation"
            label="Public note (optional)"
            value={explanation}
            maxLength={operation === "delist-source" ? 500 : 1_000}
            count={`${explanation.length} / ${operation === "delist-source" ? 500 : 1_000}`}
            onChange={(event) => setExplanation(event.target.value)}
          />
        ) : null}

        <div className="help-actions">
          <button
            id="owner-review"
            type="submit"
            className="help-continue-action"
          >
            Review request
          </button>
        </div>
      </form>

      {selected &&
      operation === "delist-source" &&
      delistDialogOpen &&
      selected.repository ? (
        <PermanentDelistDialog
          repository={selected.repository}
          cards={[
            { id: selected.id, name: selected.name },
            ...selected.siblings.map((card) => ({
              id: card.id,
              name: card.name,
            })),
          ]}
          onCancel={() => setDelistDialogOpen(false)}
          onConfirm={(confirmation) => {
            setDelistDialogOpen(false);
            validateAndReview(confirmation);
          }}
        />
      ) : null}
    </>
  );
}
