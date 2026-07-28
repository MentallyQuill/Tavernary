"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import type {
  WebsiteBugCategory,
  WebsiteBugPayload,
} from "@/features/help/help-manifest.mjs";
import { WEBSITE_BUG_CATEGORIES } from "@/features/help/help-options";
import { openHelpRequest } from "@/features/help/help-transport";

import {
  HelpErrorSummary,
  HelpTextArea,
  HelpTextField,
} from "./help-form-fields";
import { HelpReview } from "./help-review";

const categoryLabels: Record<WebsiteBugCategory, string> = {
  "search-filter-sort": "Search, filters, or sorting",
  "navigation-link": "Navigation or link",
  "display-layout-theme": "Display, layout, or theme",
  "form-submission-handoff": "Form submission or GitHub handoff",
  "kit-builder-catalog-interaction": "Kit builder or catalog interaction",
  accessibility: "Accessibility",
  "performance-loading": "Performance or loading",
  "other-website-behavior": "Other website behavior",
};

function nullable(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isWebsiteBugCategory(value: string): value is WebsiteBugCategory {
  return WEBSITE_BUG_CATEGORIES.includes(value as WebsiteBugCategory);
}

function safeTavernaryPage(value: string) {
  const candidate = value.trim();
  if (!candidate) return "";
  if (candidate.startsWith("/") && !candidate.startsWith("//")) {
    return candidate;
  }

  try {
    const url = new URL(candidate);
    if (
      url.protocol === "https:" &&
      url.hostname === "tavernary.org" &&
      !url.username &&
      !url.password
    ) {
      return url.toString();
    }
  } catch {
    // The form will show the normal validation error for an unsafe value.
  }
  return "";
}

export function displayWebsiteBugCategory(category: WebsiteBugCategory) {
  return categoryLabels[category];
}

export function WebsiteReportForm({ siteRevision }: { siteRevision: string }) {
  const searchParams = useSearchParams();
  const [category, setCategory] = useState<WebsiteBugCategory | "">("");
  const [pageUrl, setPageUrl] = useState(() =>
    safeTavernaryPage(searchParams.get("from") ?? ""),
  );
  const [actualBehavior, setActualBehavior] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [reproductionSteps, setReproductionSteps] = useState("");
  const [browser, setBrowser] = useState("");
  const [device, setDevice] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [handoffError, setHandoffError] = useState("");

  const payload: WebsiteBugPayload | null = isWebsiteBugCategory(category)
    ? {
        category,
        page_url: pageUrl.trim(),
        actual_behavior: actualBehavior.trim(),
        expected_behavior: expectedBehavior.trim(),
        reproduction_steps: reproductionSteps.trim(),
        browser: nullable(browser),
        device: nullable(device),
        additional_context: nullable(additionalContext),
      }
    : null;

  function validate() {
    const nextErrors: string[] = [];
    if (!isWebsiteBugCategory(category)) {
      nextErrors.push("Choose what kind of website problem this is.");
    }
    if (!safeTavernaryPage(pageUrl)) {
      nextErrors.push("Enter a Tavernary page URL or site-relative path.");
    }
    if (!actualBehavior.trim())
      nextErrors.push("Describe what happens instead.");
    if (!expectedBehavior.trim())
      nextErrors.push("Describe what should happen.");
    if (!reproductionSteps.trim()) {
      nextErrors.push("Describe how to reproduce the problem.");
    }
    if (actualBehavior.length > 2_000) {
      nextErrors.push(
        "What happens instead must be 2,000 characters or fewer.",
      );
    }
    if (expectedBehavior.length > 1_000) {
      nextErrors.push("What should happen must be 1,000 characters or fewer.");
    }
    if (reproductionSteps.length > 2_000) {
      nextErrors.push("How to reproduce it must be 2,000 characters or fewer.");
    }
    if (browser.length > 120) {
      nextErrors.push("Browser must be 120 characters or fewer.");
    }
    if (device.length > 120) {
      nextErrors.push("Device must be 120 characters or fewer.");
    }
    if (additionalContext.length > 1_000) {
      nextErrors.push(
        "Additional public context must be 1,000 characters or fewer.",
      );
    }
    setErrors(nextErrors);
    return nextErrors.length === 0;
  }

  async function continueOnGitHub() {
    if (!payload || !safeTavernaryPage(pageUrl)) return;
    setHandoffError("");
    setContinuing(true);
    try {
      await openHelpRequest({
        formUrl: "https://github.com/MentallyQuill/Tavernary/issues/new",
        template: "03-website-bug.yml",
        manifestFieldId: "help-manifest",
        manifest: {
          schema_version: 1,
          request_kind: "website-bug",
          origin: {
            page_url: "/help/report-website/",
            site_revision: siteRevision,
          },
          payload,
        },
        prefills: [
          ["category", displayWebsiteBugCategory(payload.category)],
          ["page-url", payload.page_url],
          ["actual-behavior", payload.actual_behavior],
          ["expected-behavior", payload.expected_behavior],
          ["reproduction-steps", payload.reproduction_steps],
          ["browser", payload.browser ?? ""],
          ["device", payload.device ?? ""],
          ["additional-context", payload.additional_context ?? ""],
        ],
        pasteInstruction:
          "Paste the Help manifest copied by Tavernary into the manifest field.",
      });
    } catch (error) {
      setHandoffError(
        error instanceof Error
          ? error.message
          : "GitHub could not be opened. Please try again.",
      );
    } finally {
      setContinuing(false);
    }
  }

  if (reviewing && payload) {
    return (
      <>
        <HelpErrorSummary errors={handoffError ? [handoffError] : []} />
        <HelpReview
          rows={[
            {
              label: "Category",
              value: displayWebsiteBugCategory(payload.category),
            },
            { label: "Page", value: payload.page_url },
            { label: "What happens instead", value: payload.actual_behavior },
            { label: "What should happen", value: payload.expected_behavior },
            { label: "How to reproduce it", value: payload.reproduction_steps },
            { label: "Browser", value: payload.browser ?? "" },
            { label: "Device", value: payload.device ?? "" },
            {
              label: "Additional public context",
              value: payload.additional_context ?? "",
            },
          ]}
          onBack={() => setReviewing(false)}
          onCancel={() => setReviewing(false)}
          onContinue={continueOnGitHub}
          continuing={continuing}
        />
      </>
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
        Have an idea for Tavernary?{" "}
        <Link href="/help/other/">Suggest an improvement.</Link> A Tavernary
        vulnerability? <Link href="/help/security/">Report it privately.</Link>
      </p>
      <div className="help-field">
        <label htmlFor="website-category">
          What kind of website problem is this?
        </label>
        <select
          id="website-category"
          value={category}
          aria-invalid={errors.includes(
            "Choose what kind of website problem this is.",
          )}
          onChange={(event) => {
            const nextCategory = event.target.value;
            setCategory(isWebsiteBugCategory(nextCategory) ? nextCategory : "");
          }}
        >
          <option value="">Choose a website problem</option>
          {WEBSITE_BUG_CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {displayWebsiteBugCategory(option)}
            </option>
          ))}
        </select>
      </div>
      <HelpTextField
        id="website-page-url"
        label="What page has the problem?"
        value={pageUrl}
        maxLength={500}
        onChange={(event) => setPageUrl(event.target.value)}
        error={errors.find((error) => error.includes("Tavernary page URL"))}
        hint="Use a Tavernary page URL or a site-relative path. Everything you submit will be public on GitHub."
      />
      <HelpTextArea
        id="website-actual-behavior"
        label="What happens instead?"
        value={actualBehavior}
        maxLength={2_000}
        onChange={(event) => setActualBehavior(event.target.value)}
        error={errors.find((error) => error.includes("what happens instead"))}
        count={`${actualBehavior.length}/2000`}
      />
      <HelpTextArea
        id="website-expected-behavior"
        label="What should happen?"
        value={expectedBehavior}
        maxLength={1_000}
        onChange={(event) => setExpectedBehavior(event.target.value)}
        error={errors.find((error) => error.includes("what should happen"))}
        count={`${expectedBehavior.length}/1000`}
      />
      <HelpTextArea
        id="website-reproduction-steps"
        label="How can we reproduce it?"
        value={reproductionSteps}
        maxLength={2_000}
        onChange={(event) => setReproductionSteps(event.target.value)}
        error={errors.find((error) => error.includes("how to reproduce"))}
        count={`${reproductionSteps.length}/2000`}
      />
      <HelpTextField
        id="website-browser"
        label="Browser (optional)"
        value={browser}
        maxLength={120}
        onChange={(event) => setBrowser(event.target.value)}
        count={`${browser.length}/120`}
      />
      <HelpTextField
        id="website-device"
        label="Device (optional)"
        value={device}
        maxLength={120}
        onChange={(event) => setDevice(event.target.value)}
        count={`${device.length}/120`}
      />
      <HelpTextArea
        id="website-additional-context"
        label="Additional public context (optional)"
        value={additionalContext}
        maxLength={1_000}
        onChange={(event) => setAdditionalContext(event.target.value)}
        count={`${additionalContext.length}/1000`}
      />
      <p className="help-hint">
        GitHub cannot receive attachments through this handoff. You can add
        screenshots or recordings on GitHub before creating the issue.
      </p>
      <div className="help-actions">
        <button type="submit" className="help-continue-action">
          Review request
        </button>
      </div>
    </form>
  );
}
