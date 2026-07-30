"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  serializeKitWithdrawalManifest,
  type KitWithdrawalManifest,
} from "@/features/kits/kit-withdrawal-manifest.mjs";
import { openGitHubReview } from "@/features/submissions/github-handoff";

import {
  HelpChoiceGroup,
  HelpErrorSummary,
  HelpSelectField,
} from "./help-form-fields";
import { HelpReview } from "./help-review";

export interface KitWithdrawalOption {
  id: string;
  title: string;
  author: string;
  shareUrl: string;
}

function selectedKitId(kits: KitWithdrawalOption[], candidate: string | null) {
  return candidate && kits.some((kit) => kit.id === candidate) ? candidate : "";
}

export function KitWithdrawalForm({ kits }: { kits: KitWithdrawalOption[] }) {
  const searchParams = useSearchParams();
  const [kitId, setKitId] = useState(() =>
    selectedKitId(kits, searchParams.get("kit")),
  );
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const selected = kits.find((kit) => kit.id === kitId);
  const manifest: KitWithdrawalManifest | null =
    selected && confirmed
      ? {
          schema_version: 1,
          request_kind: "kit-withdrawal",
          kit_id: selected.id,
          confirmation: true,
        }
      : null;
  const confirmationError = errors.find((error) =>
    error.startsWith("Confirm that"),
  );

  function validate() {
    const nextErrors = [];
    if (!selected) nextErrors.push("Select a published Kit.");
    if (!confirmed) {
      nextErrors.push("Confirm that you request withdrawal of this Kit.");
    }
    setErrors(nextErrors);
    return nextErrors.length === 0;
  }

  async function openReview() {
    if (!selected || !manifest) {
      throw new Error("The Kit withdrawal is no longer ready for review.");
    }
    return openGitHubReview({
      formUrl: "https://github.com/MentallyQuill/Tavernary/issues/new",
      template: "07-kit-withdrawal.yml",
      manifestFieldId: "withdrawal-manifest",
      serializedManifest: serializeKitWithdrawalManifest(manifest),
      prefills: [
        ["title", `[Kit withdrawal]: ${selected.title}`],
        ["kit-id", selected.id],
        ["share-url", selected.shareUrl],
        ["confirmation", "I request withdrawal of this Kit."],
      ],
      pasteInstruction:
        "Paste the Kit withdrawal manifest copied by Tavernary here.",
      copyPrompt:
        "Copy this Kit withdrawal manifest, then paste it into the GitHub review:",
    });
  }

  if (reviewing && selected && manifest) {
    return (
      <HelpReview
        rows={[
          { label: "Kit", value: selected.title },
          { label: "Stable Kit ID", value: selected.id },
          { label: "Author", value: `@${selected.author}` },
          {
            label: "Effect",
            value:
              "Remove the Kit from the public catalog and create a retained withdrawal tombstone.",
          },
        ]}
        returnFocusId="withdrawal-kit"
        onBack={() => setReviewing(false)}
        onCancel={() => setReviewing(false)}
        openReview={openReview}
      />
    );
  }

  return (
    <form
      className="help-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (validate()) setReviewing(true);
      }}
    >
      <HelpErrorSummary errors={errors} />
      <p className="help-hint">
        Withdrawal removes the Kit from the public catalog but retains its
        history as a tombstone. Your numeric GitHub identity must match the
        Kit&apos;s recorded author.
      </p>
      <HelpSelectField
        id="withdrawal-kit"
        label="Kit"
        value={kitId}
        error={errors.find((error) => error === "Select a published Kit.")}
        onChange={(event) => {
          setKitId(selectedKitId(kits, event.target.value));
          setConfirmed(false);
        }}
      >
        <option value="">Select a published Kit</option>
        {kits.map((kit) => (
          <option key={kit.id} value={kit.id}>
            {kit.title} — @{kit.author}
          </option>
        ))}
      </HelpSelectField>
      <HelpChoiceGroup
        legend="Confirmation"
        hint="This request is public on GitHub and can only be applied for the recorded Kit author."
        error={confirmationError}
      >
        <label className="help-choice">
          <input
            type="checkbox"
            checked={confirmed}
            aria-invalid={Boolean(confirmationError)}
            onChange={(event) => setConfirmed(event.target.checked)}
          />{" "}
          I request withdrawal of this Kit
        </label>
      </HelpChoiceGroup>
      <div className="help-actions">
        <button type="submit" className="help-continue-action">
          Review request
        </button>
      </div>
    </form>
  );
}
