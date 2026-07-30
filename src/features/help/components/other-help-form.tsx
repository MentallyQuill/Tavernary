"use client";

import Link from "next/link";
import { useState } from "react";

import type {
  OtherHelpCategory,
  OtherHelpPayload,
} from "@/features/help/help-manifest.mjs";
import { OTHER_HELP_CATEGORIES } from "@/features/help/help-options";
import { openHelpRequest } from "@/features/help/help-transport";

import {
  HelpErrorSummary,
  HelpSelectField,
  HelpTextArea,
  HelpTextField,
} from "./help-form-fields";
import { HelpReview } from "./help-review";

const categoryLabels: Record<OtherHelpCategory, string> = {
  "using-tavernary": "Using Tavernary",
  "existing-request": "An existing request",
  "suggest-improvement": "Suggest an improvement",
  "documentation-policy": "Documentation or policy",
  other: "Something else",
};

function nullable(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isValidHttpsUrl(value: string) {
  const candidate = value.trim();
  if (!candidate) return true;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isOtherHelpCategory(value: string): value is OtherHelpCategory {
  return OTHER_HELP_CATEGORIES.includes(value as OtherHelpCategory);
}

export function displayOtherHelpCategory(category: OtherHelpCategory) {
  return categoryLabels[category];
}

export function OtherHelpForm({ siteRevision }: { siteRevision: string }) {
  const [category, setCategory] = useState<OtherHelpCategory | "">("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [relevantUrl, setRelevantUrl] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);

  const payload: OtherHelpPayload | null = isOtherHelpCategory(category)
    ? {
        category,
        subject: subject.trim(),
        description: description.trim(),
        relevant_url: nullable(relevantUrl),
      }
    : null;

  function validate() {
    const nextErrors: string[] = [];
    if (!isOtherHelpCategory(category)) {
      nextErrors.push("Choose what you need help with.");
    }
    if (!subject.trim()) nextErrors.push("Enter a subject.");
    if (!description.trim()) nextErrors.push("Describe what you need.");
    if (subject.length > 120)
      nextErrors.push("Subject must be 120 characters or fewer.");
    if (description.length > 3_000) {
      nextErrors.push("Description must be 3,000 characters or fewer.");
    }
    if (relevantUrl.length > 500) {
      nextErrors.push("Relevant URL must be 500 characters or fewer.");
    }
    if (!isValidHttpsUrl(relevantUrl)) {
      nextErrors.push("Enter a valid HTTPS relevant URL.");
    }
    setErrors(nextErrors);
    return nextErrors.length === 0;
  }

  async function openReview() {
    if (!payload) {
      throw new Error("The Help request is no longer ready for review.");
    }
    return openHelpRequest({
      formUrl: "https://github.com/MentallyQuill/Tavernary/issues/new",
      template: "04-other.yml",
      manifestFieldId: "help-manifest",
      manifest: {
        schema_version: 1,
        request_kind: "other-help",
        origin: { page_url: "/help/other/", site_revision: siteRevision },
        payload,
      },
      prefills: [
        ["category", displayOtherHelpCategory(payload.category)],
        ["subject", payload.subject],
        ["description", payload.description],
        ["relevant-url", payload.relevant_url ?? ""],
      ],
      pasteInstruction:
        "Paste the Help manifest copied by Tavernary into the manifest field.",
    });
  }

  const relevantUrlLabel =
    category === "existing-request"
      ? "GitHub issue or pull request (optional)"
      : "Relevant URL (optional)";
  const categoryError = errors.find(
    (error) => error === "Choose what you need help with.",
  );
  const relevantUrlError = errors.find((error) => /relevant url/i.test(error));

  if (reviewing && payload) {
    return (
      <HelpReview
        rows={[
          {
            label: "Category",
            value: displayOtherHelpCategory(payload.category),
          },
          { label: "Subject", value: payload.subject },
          { label: "Description", value: payload.description },
          { label: "Relevant URL", value: payload.relevant_url ?? "" },
        ]}
        onBack={() => setReviewing(false)}
        onCancel={() => setReviewing(false)}
        openReview={openReview}
        returnFocusId="other-category"
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
      <section
        className="help-routing-reminders"
        aria-label="Find a more specific path"
      >
        <p>
          Adding a project?{" "}
          <Link href="/submit/project/">Submit a new project.</Link>
        </p>
        <p>
          Creating, editing, or withdrawing a Kit?{" "}
          <Link href="/?mode=kits">Create or manage a Kit.</Link>
        </p>
        <p>
          Need support for a listed project?{" "}
          <Link href="/">Find the project in the catalog</Link> and use its own
          repository or support channel.
        </p>
        <p>
          Reporting a Tavernary vulnerability?{" "}
          <Link href="/help/security/">Report it privately.</Link>
        </p>
      </section>
      <HelpSelectField
        id="other-category"
        label="What do you need help with?"
        value={category}
        error={categoryError}
        onChange={(event) => {
          const nextCategory = event.target.value;
          setCategory(isOtherHelpCategory(nextCategory) ? nextCategory : "");
        }}
      >
        <option value="">Choose a topic</option>
        {OTHER_HELP_CATEGORIES.map((option) => (
          <option key={option} value={option}>
            {displayOtherHelpCategory(option)}
          </option>
        ))}
      </HelpSelectField>
      <HelpTextField
        id="other-subject"
        label="Subject"
        value={subject}
        maxLength={120}
        onChange={(event) => setSubject(event.target.value)}
        error={errors.find((error) => error.includes("subject"))}
        hint="Everything you submit will be public on GitHub. Do not include secrets or private personal information."
        count={`${subject.length}/120`}
      />
      <HelpTextArea
        id="other-description"
        label="Description"
        value={description}
        maxLength={3_000}
        onChange={(event) => setDescription(event.target.value)}
        error={errors.find((error) => error.includes("Describe what you need"))}
        count={`${description.length}/3000`}
      />
      <HelpTextField
        id="other-relevant-url"
        label={relevantUrlLabel}
        value={relevantUrl}
        type="url"
        maxLength={500}
        onChange={(event) => setRelevantUrl(event.target.value)}
        error={relevantUrlError}
        count={`${relevantUrl.length}/500`}
      />
      <div className="help-actions">
        <button type="submit" className="help-continue-action">
          Review request
        </button>
      </div>
    </form>
  );
}
