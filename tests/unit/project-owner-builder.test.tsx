import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ProjectOwnerBuilder } from "@/features/help/components/project-owner-builder";
import type { OwnerProjectOption } from "@/lib/help/load-owner-project-options";

let search = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

const projects: OwnerProjectOption[] = [
  {
    id: "owner-extension",
    name: "Owner Extension",
    kind: "extension",
    sourceType: "github",
    repository: "CurrentOwner/Extension",
    repositoryId: 42,
    eligibleShape: true,
    ineligibilityReason: null,
    sourceFingerprint: "a".repeat(64),
    listingState: {
      metadataStatus: "curated",
      visibility: "published",
      visibilityReason: null,
      refreshPolicy: "automatic",
      enrichmentPolicy: "automatic",
    },
    editable: {
      name: "Owner Extension",
      summary: "Current extension summary.",
      frontends: ["sillytavern"],
      primaryFunction: "interface-workflow",
      capabilities: ["automation"],
      modelFamilies: [],
      completionFormats: [],
    },
  },
  {
    id: "owner-preset",
    name: "Owner Preset",
    kind: "preset",
    sourceType: "github",
    repository: "CurrentOwner/Preset",
    repositoryId: 84,
    eligibleShape: true,
    ineligibilityReason: null,
    sourceFingerprint: "b".repeat(64),
    listingState: {
      metadataStatus: "curated",
      visibility: "published",
      visibilityReason: null,
      refreshPolicy: "automatic",
      enrichmentPolicy: "manual",
    },
    editable: {
      name: "Owner Preset",
      summary: "Current preset summary.",
      frontends: ["sillytavern"],
      primaryFunction: "preset",
      capabilities: ["prompt-engineering"],
      modelFamilies: ["claude"],
      completionFormats: ["chat-completion"],
    },
  },
  {
    id: "organization-suite",
    name: "Organization Suite",
    kind: "extension",
    sourceType: "github-organization",
    repository: null,
    repositoryId: null,
    eligibleShape: false,
    ineligibilityReason:
      "Organization suite listings require a public project report.",
    sourceFingerprint: "c".repeat(64),
    listingState: {
      metadataStatus: "curated",
      visibility: "published",
      visibilityReason: null,
      refreshPolicy: "paused",
      enrichmentPolicy: "manual",
    },
    editable: {
      name: "Organization Suite",
      summary: "A suite.",
      frontends: ["sillytavern"],
      primaryFunction: "interface-workflow",
      capabilities: [],
      modelFamilies: [],
      completionFormats: [],
    },
  },
];

const vocabularies = {
  frontends: [
    { id: "sillytavern", label: "SillyTavern" },
    { id: "risuai", label: "RisuAI" },
  ],
  primaryFunctions: [
    {
      id: "frontend",
      label: "Frontend",
      description: "A structural Frontend category.",
    },
    {
      id: "preset",
      label: "System Preset",
      description: "A structural System Preset category.",
    },
    {
      id: "interface-workflow",
      label: "Interface and workflow",
      description: "Improves user-facing navigation and productivity.",
    },
    {
      id: "generation-reasoning",
      label: "Generation and reasoning",
      description: "Changes how model output is prompted or reasoned.",
    },
  ],
  capabilities: [
    { id: "automation", label: "Automation" },
    { id: "prompt-engineering", label: "Prompt engineering" },
  ],
  modelFamilies: [
    { id: "claude", label: "Claude" },
    { id: "gemini", label: "Gemini" },
  ],
  completionFormats: [
    { id: "chat-completion", label: "Chat Completion" },
    { id: "text-completion", label: "Text Completion" },
  ],
};

function renderBuilder() {
  return render(
    <ProjectOwnerBuilder projects={projects} vocabularies={vocabularies} />,
  );
}

async function selectProject(
  user: ReturnType<typeof userEvent.setup>,
  id = "owner-extension",
) {
  await user.selectOptions(screen.getByLabelText("Project"), id);
}

function expectReviewRow(label: string, value: string) {
  expect(screen.getByText(label).closest("div")).toHaveTextContent(value);
}

afterEach(cleanup);

beforeEach(() => {
  search = "";
  vi.restoreAllMocks();
});

test("keeps the selected project visible while filtering other cataloged projects", async () => {
  search = "project=owner-extension";
  const user = userEvent.setup();
  renderBuilder();

  expect(screen.getByLabelText("Project")).toHaveValue("owner-extension");
  await user.type(screen.getByLabelText("Search listed projects"), "preset");

  expect(
    screen.getByRole("option", { name: /owner preset/iu }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("option", { name: /owner extension/iu }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Project")).toHaveValue("owner-extension");
});

test("explains staff-only shapes while keeping their edit controls available", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await selectProject(user, "organization-suite");

  expect(
    screen.getByText(
      /Organization suite listings require a public project report/iu,
    ),
  ).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Report this listing instead" }),
  ).toHaveAttribute("href", "/help/report-project?project=organization-suite");
  expect(
    screen.getByRole("radio", { name: "Edit card details" }),
  ).toBeVisible();
});

test("keeps edit, source, and delist fields in separate branches", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await selectProject(user);

  await user.click(screen.getByRole("radio", { name: "Edit card details" }));
  expect(screen.getByLabelText("Display name")).toBeVisible();
  expect(
    screen.queryByLabelText("Public GitHub repository URL"),
  ).not.toBeInTheDocument();

  await user.click(
    screen.getByRole("radio", { name: "Update repository location" }),
  );
  expect(screen.getByLabelText("Public GitHub repository URL")).toBeVisible();
  expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();

  await user.click(screen.getByRole("radio", { name: "Delist this project" }));
  expect(
    screen.getByRole("checkbox", {
      name: "I am requesting that Tavernary delist this project",
    }),
  ).toBeVisible();
  expect(
    screen.queryByLabelText("Public GitHub repository URL"),
  ).not.toBeInTheDocument();
});

test("shows a live summary counter and exact controlled metadata", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await selectProject(user);
  await user.click(screen.getByRole("radio", { name: "Edit card details" }));

  expect(screen.getByText("26 / 220")).toHaveAttribute("role", "status");
  await user.clear(screen.getByLabelText("Summary"));
  await user.type(screen.getByLabelText("Summary"), "Updated.");
  expect(screen.getByText("8 / 220")).toBeVisible();

  expect(
    screen.getAllByRole("checkbox", {
      name: /SillyTavern|RisuAI|Automation|Prompt engineering/u,
    }),
  ).toHaveLength(4);
  expect(screen.getByLabelText("Primary function")).toHaveValue(
    "interface-workflow",
  );
  expect(
    screen.getByText(/Interface and workflow:/u).closest("li"),
  ).toHaveTextContent("Improves user-facing navigation and productivity.");
  expect(
    screen.queryByRole("option", { name: "System Preset" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("checkbox", { name: "Claude" }),
  ).not.toBeInTheDocument();
});

test("removes emoji from an owner summary while preserving its wording", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await selectProject(user);
  await user.click(screen.getByRole("radio", { name: "Edit card details" }));

  const summary = screen.getByLabelText("Summary");
  await user.clear(summary);
  await user.type(summary, "This is damn useful 🧭 for ST-QuickReply.");

  expect(summary).toHaveValue("This is damn useful  for ST-QuickReply.");
  expect(
    screen.getByText(
      "Emojis aren't supported in catalog descriptions. The rest of your text has been kept.",
    ),
  ).toHaveAttribute("role", "status");
  expect(screen.getByRole("link", { name: "Catalog Policy" })).toHaveAttribute(
    "href",
    "/catalog-policy",
  );
});

test("shows compatibility controls only for Presets", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await selectProject(user, "owner-preset");
  await user.click(screen.getByRole("radio", { name: "Edit card details" }));

  expect(screen.getByRole("checkbox", { name: "Claude" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Gemini" })).not.toBeChecked();
  expect(
    screen.getByRole("checkbox", { name: "Chat Completion" }),
  ).toBeChecked();
  expect(
    screen.getByRole("checkbox", { name: "Text Completion" }),
  ).not.toBeChecked();
  expect(screen.getByLabelText("Primary function")).toHaveValue("preset");
  expect(screen.getByLabelText("Primary function")).toHaveAttribute("readonly");
});

test("builds a nullable-identity staff edit for a staff-only card", async () => {
  const user = userEvent.setup();
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  renderBuilder();
  await selectProject(user, "organization-suite");
  await user.click(screen.getByRole("radio", { name: "Edit card details" }));
  await user.clear(screen.getByLabelText("Display name"));
  await user.type(
    screen.getByLabelText("Display name"),
    "Organization Suite 2",
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  const opened = new URL(open.mock.calls[0]?.[0] as string);
  expect(
    JSON.parse(opened.searchParams.get("owner-request-manifest") ?? ""),
  ).toMatchObject({
    operation: "edit-card",
    project_id: "organization-suite",
    repository_id: null,
    proposed: { name: "Organization Suite 2" },
  });
});

test("connects each required owner choice to its inline error", async () => {
  const user = userEvent.setup();
  renderBuilder();

  await user.click(screen.getByRole("button", { name: "Review request" }));
  expect(screen.getByLabelText("Project")).toHaveAttribute("aria-describedby");
  expect(document.getElementById("owner-project-error")).toHaveTextContent(
    "Select a listed project.",
  );

  await selectProject(user);
  await user.click(screen.getByRole("button", { name: "Review request" }));
  expect(
    screen.getByRole("group", { name: "What would you like to do?" }),
  ).toHaveAttribute("aria-invalid", "true");

  await user.click(
    screen.getByRole("radio", { name: "Update repository location" }),
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));
  expect(screen.getByLabelText("Public GitHub repository URL")).toHaveAttribute(
    "aria-describedby",
  );

  await user.click(screen.getByRole("radio", { name: "Delist this project" }));
  await user.click(screen.getByRole("button", { name: "Review request" }));
  expect(
    screen.getByRole("group", { name: "Confirm delisting" }),
  ).toHaveAttribute("aria-invalid", "true");
});

test("connects required owner card text to its inline errors", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await selectProject(user);
  await user.click(screen.getByRole("radio", { name: "Edit card details" }));
  await user.clear(screen.getByLabelText("Display name"));
  await user.clear(screen.getByLabelText("Summary"));

  await user.click(screen.getByRole("button", { name: "Review request" }));

  expect(screen.getByLabelText("Display name")).toHaveAttribute(
    "aria-describedby",
  );
  expect(screen.getByLabelText("Summary")).toHaveAttribute("aria-describedby");
  expect(document.getElementById("owner-name-error")).toHaveTextContent(
    "Owner display name is required.",
  );
  expect(document.getElementById("owner-summary-error")).toHaveTextContent(
    "Owner summary is required.",
  );
});

test("requires the exact delist confirmation and explains the retained effect", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await selectProject(user);
  await user.click(screen.getByRole("radio", { name: "Delist this project" }));
  await user.click(screen.getByRole("button", { name: "Review request" }));

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Confirm that Tavernary should delist this project.",
  );
  await user.click(
    screen.getByRole("checkbox", {
      name: "I am requesting that Tavernary delist this project",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));

  expect(
    screen.getByText("Delisting disables, pauses, and retains the record."),
  ).toBeVisible();
  expectReviewRow("Before: visibility", "published");
  expectReviewRow("Before: visibility reason", "None");
  expectReviewRow("Before: refresh policy", "automatic");
  expectReviewRow("Before: enrichment policy", "automatic");
  expectReviewRow("After: visibility", "disabled");
  expectReviewRow("After: visibility reason", "removed");
  expectReviewRow("After: refresh policy", "paused");
  expectReviewRow("After: enrichment policy", "manual");
});

test("reviews card values before and after without claiming browser-side identity verification", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await selectProject(user);
  await user.click(screen.getByRole("radio", { name: "Edit card details" }));
  await user.clear(screen.getByLabelText("Summary"));
  await user.type(screen.getByLabelText("Summary"), "Owner-authored summary.");
  await user.click(screen.getByRole("checkbox", { name: "Automation" }));
  await user.click(screen.getByRole("button", { name: "Review request" }));

  expect(
    screen.getByText(
      "GitHub will verify either current personal-owner authority or reviewed Tavernary staff authority.",
    ),
  ).toBeVisible();
  expect(
    screen.getByText(
      "Summary or capability edits change model enrichment to manual.",
    ),
  ).toBeVisible();
  expectReviewRow("Before: summary", "Current extension summary.");
  expectReviewRow("After: summary", "Owner-authored summary.");
  expectReviewRow("Before: enrichment policy", "automatic");
  expectReviewRow("After: enrichment policy", "manual");
  expectReviewRow("Before: capabilities", "automation");
  expectReviewRow("After: capabilities", "None");
  expect(
    screen.queryByText(/identity has been verified/iu),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(/you are the verified owner/iu),
  ).not.toBeInTheDocument();
});

test("reports that a classification-only edit preserves enrichment authority", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await selectProject(user);
  await user.click(screen.getByRole("radio", { name: "Edit card details" }));
  await user.selectOptions(
    screen.getByLabelText("Primary function"),
    "generation-reasoning",
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));

  expectReviewRow("Before: primary function", "interface-workflow");
  expectReviewRow("After: primary function", "generation-reasoning");
  expectReviewRow("Before: enrichment policy", "automatic");
  expectReviewRow("After: enrichment policy", "automatic");
  expect(
    screen.getByText("This edit preserves the automatic enrichment policy."),
  ).toBeVisible();
});

test("reviews repository location before and after", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await selectProject(user);
  await user.click(
    screen.getByRole("radio", { name: "Update repository location" }),
  );
  await user.type(
    screen.getByLabelText("Public GitHub repository URL"),
    "https://github.com/CurrentOwner/Extension-Renamed",
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));

  expectReviewRow(
    "Before: repository",
    "https://github.com/CurrentOwner/Extension",
  );
  expectReviewRow(
    "After: repository",
    "https://github.com/CurrentOwner/Extension-Renamed",
  );
  expectReviewRow("Before: repository ID", "42");
  expectReviewRow("After: repository ID", "42");
});

test("hands off one complete edit manifest and preserves state after back", async () => {
  const user = userEvent.setup();
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  renderBuilder();
  await selectProject(user);
  await user.click(screen.getByRole("radio", { name: "Edit card details" }));
  await user.clear(screen.getByLabelText("Display name"));
  await user.type(screen.getByLabelText("Display name"), "Owner Extension 2");
  await user.click(screen.getByRole("button", { name: "Review request" }));
  await user.click(screen.getByRole("button", { name: "Back and edit" }));
  expect(screen.getByLabelText("Display name")).toHaveValue(
    "Owner Extension 2",
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  const opened = new URL(open.mock.calls[0]?.[0] as string);
  expect(opened.searchParams.get("template")).toBe(
    "08-project-owner-request.yml",
  );
  expect(opened.searchParams.get("request-type")).toBe("Edit card details");
  expect(opened.searchParams.get("project-id")).toBe("owner-extension");
  expect(opened.searchParams.get("repository")).toBe(
    "https://github.com/CurrentOwner/Extension",
  );
  expect(
    JSON.parse(opened.searchParams.get("owner-request-manifest") ?? ""),
  ).toEqual({
    schema_version: 1,
    request_kind: "project-owner",
    operation: "edit-card",
    project_id: "owner-extension",
    repository_id: 42,
    source_fingerprint: "a".repeat(64),
    original: {
      kind: "extension",
      name: "Owner Extension",
      summary: "Current extension summary.",
      frontends: ["sillytavern"],
      primary_function: "interface-workflow",
      capabilities: ["automation"],
      model_families: [],
      completion_formats: [],
    },
    proposed: {
      name: "Owner Extension 2",
      summary: "Current extension summary.",
      frontends: ["sillytavern"],
      primary_function: "interface-workflow",
      capabilities: ["automation"],
      model_families: [],
      completion_formats: [],
    },
    explanation: null,
  });
});

test("keeps review state and reports a blocked GitHub popup", async () => {
  const user = userEvent.setup();
  vi.spyOn(window, "open").mockReturnValue(null);
  renderBuilder();
  await selectProject(user);
  await user.click(
    screen.getByRole("radio", { name: "Update repository location" }),
  );
  await user.type(
    screen.getByLabelText("Public GitHub repository URL"),
    "https://github.com/CurrentOwner/Extension-Renamed",
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  expect(screen.getByRole("alert")).toHaveTextContent(
    "GitHub issue form could not be opened.",
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "GitHub could not be opened automatically.",
  );
  expect(screen.getByRole("alert")).not.toHaveTextContent(
    "fix the highlighted fields",
  );
  const fallback = screen.getByRole("link", {
    name: "Open the prepared GitHub form directly",
  });
  expect(fallback).toHaveAttribute(
    "href",
    expect.stringContaining("owner-request-manifest="),
  );
  expect(
    fallback.compareDocumentPosition(
      document.querySelector(".help-review-rows")!,
    ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Review your public request" }),
  ).toBeVisible();
});
