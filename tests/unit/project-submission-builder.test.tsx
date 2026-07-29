import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import ProjectSubmissionPage from "@/app/submit/project/page";
import { ProjectSubmissionBuilder } from "@/features/submissions/components/project-submission-builder";

const { openProjectSubmission } = vi.hoisted(() => ({
  openProjectSubmission: vi.fn().mockResolvedValue("prefilled"),
}));

vi.mock("@/features/submissions/submission-transport", () => ({
  openProjectSubmission,
}));

vi.mock("@/lib/catalog/load-catalog", () => ({
  loadCatalog: () => ({
    schemaVersion: 2,
    generatedAt: "2026-07-27T00:00:00.000Z",
    kits: [],
    projects: [
      {
        id: "alpha-frontend",
        name: "Alpha",
        kind: "frontend",
        canonicalUrl: "https://github.com/example/alpha",
        frontends: [{ id: "alpha", label: "Alpha", description: "Frontend." }],
        community: { stars: 4, forks: 0, subscribers: 0, aggregate: 4 },
      },
      {
        id: "zulu-frontend",
        name: "Zulu",
        kind: "frontend",
        canonicalUrl: "https://github.com/example/zulu",
        frontends: [{ id: "zulu", label: "Zulu", description: "Frontend." }],
        community: { stars: 12, forks: 0, subscribers: 0, aggregate: 12 },
      },
    ],
  }),
}));

const frontends = [
  {
    id: "sillytavern",
    label: "SillyTavern",
    canonicalUrl: "https://github.com/SillyTavern/SillyTavern",
  },
  {
    id: "lumiverse",
    label: "Lumiverse",
    canonicalUrl: "https://github.com/prolix-oc/Lumiverse",
  },
];

const frontendEligibility =
  "Frontends and Extensions require a public GitHub or Codeberg repository.";

async function choosePrimaryFunction(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(screen.getByLabelText("Primary function"));
  await user.click(
    screen.getByRole("option", { name: new RegExp(label, "u") }),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("offers the six defined primary functions only for Extensions", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  expect(screen.queryByLabelText("Primary function")).not.toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText("Project Type"), "extension");

  const primaryFunction = screen.getByLabelText("Primary function");
  expect(primaryFunction).toBeVisible();
  expect(
    screen.queryByText(
      /Stores, summarizes, searches, retrieves, or injects conversational knowledge and continuity/u,
    ),
  ).not.toBeInTheDocument();

  await user.click(primaryFunction);

  expect(
    within(screen.getByRole("listbox")).getAllByRole("option"),
  ).toHaveLength(6);
  expect(
    screen.getByText(
      /Stores, summarizes, searches, retrieves, or injects conversational knowledge and continuity/u,
    ),
  ).toBeVisible();

  await user.selectOptions(screen.getByLabelText("Project Type"), "preset");
  expect(screen.queryByLabelText("Primary function")).not.toBeInTheDocument();
});

test("submits selected and structural primary functions without stale values", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "extension");
  await choosePrimaryFunction(user, "Memory and retrieval");
  await user.selectOptions(screen.getByLabelText("Project Type"), "frontend");
  await user.type(
    screen.getByLabelText("Project URL"),
    "https://github.com/example/frontend",
  );
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  expect(openProjectSubmission).toHaveBeenLastCalledWith(
    "https://github.com/MentallyQuill/Tavernary/issues/new",
    expect.objectContaining({
      schema_version: 3,
      project_type: "frontend",
      primary_function: "frontend",
    }),
  );

  openProjectSubmission.mockClear();
  await user.selectOptions(screen.getByLabelText("Project Type"), "extension");
  expect(screen.getByLabelText("Primary function")).toHaveTextContent(
    "Select a primary function",
  );
  await choosePrimaryFunction(user, "Interface and workflow");
  await user.click(screen.getByLabelText("SillyTavern"));
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  expect(openProjectSubmission).toHaveBeenLastCalledWith(
    "https://github.com/MentallyQuill/Tavernary/issues/new",
    expect.objectContaining({
      schema_version: 3,
      project_type: "extension",
      primary_function: "interface-workflow",
    }),
  );
});

test("orders supported frontends by frontend-card popularity", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionPage />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "extension");

  const frontendChoices = screen.getAllByRole("checkbox");
  expect(frontendChoices[0]).toHaveAccessibleName("Zulu");
  expect(frontendChoices[1]).toHaveAccessibleName("Alpha");
});

test("shows Frontend eligibility only at relevant submission decisions", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  expect(screen.getByText(frontendEligibility)).toBeVisible();

  await user.selectOptions(screen.getByLabelText("Project Type"), "extension");

  expect(screen.getByText(frontendEligibility)).toBeVisible();
  expect(
    screen.getByRole("combobox", { name: "Search supported frontends" }),
  ).toBeVisible();
  expect(
    screen.queryByLabelText("Frontend-independent"),
  ).not.toBeInTheDocument();
  expect(screen.getByText("0 selected")).toBeVisible();
  expect(screen.getByLabelText("SillyTavern")).not.toBeChecked();

  await user.click(screen.getByLabelText("Other or not listed"));
  expect(screen.getAllByText(frontendEligibility)).toHaveLength(2);
  expect(
    screen.getByText(
      "This project will stay blocked until the missing frontend is submitted, reviewed, and merged.",
    ),
  ).toBeVisible();
});

test("removes emoji from the submitted description while preserving its wording", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  const description = screen.getByLabelText(/Short Description/u);
  await user.type(description, "This is damn useful 🧭 for ST-QuickReply.");

  expect(description).toHaveValue("This is damn useful  for ST-QuickReply.");
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

test("rejects a generic public source host for a Frontend", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.type(
    screen.getByLabelText("Project URL"),
    "https://example.com/frontend",
  );
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  expect(openProjectSubmission).not.toHaveBeenCalled();
  expect(screen.getAllByText(frontendEligibility)).toHaveLength(2);
});

test("accepts an exact public Codeberg repository for an Extension", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "extension");
  await choosePrimaryFunction(user, "Interface and workflow");
  await user.type(
    screen.getByLabelText("Project URL"),
    "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
  );
  await user.click(screen.getByLabelText("Lumiverse"));
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  expect(openProjectSubmission).toHaveBeenCalledWith(
    "https://github.com/MentallyQuill/Tavernary/issues/new",
    expect.objectContaining({
      source_url: "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
    }),
  );
});

test("does not request metadata as a substitute for a repository", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.type(
    screen.getByLabelText("Project URL"),
    "https://example.com/frontend",
  );
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  expect(openProjectSubmission).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Project Name (optional)")).toBeVisible();
  expect(screen.getByLabelText("Short Description (optional)")).toBeVisible();
  expect(screen.getAllByText(frontendEligibility)).toHaveLength(2);
});

test("allows a System Preset to be frontend-independent", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "preset");
  await user.click(screen.getByLabelText("Frontend-independent"));

  expect(screen.getByText("No frontend selection required.")).toBeVisible();
});

test("submits multiple current frontend identities in the manifest", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "extension");
  await choosePrimaryFunction(user, "Developer infrastructure");
  await user.type(
    screen.getByLabelText("Project URL"),
    "https://github.com/example/extension",
  );
  await user.click(screen.getByLabelText("SillyTavern"));
  await user.click(screen.getByLabelText("Lumiverse"));
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  expect(openProjectSubmission).toHaveBeenCalledWith(
    "https://github.com/MentallyQuill/Tavernary/issues/new",
    expect.objectContaining({
      schema_version: 3,
      project_type: "extension",
      primary_function: "developer-infrastructure",
      source_url: "https://github.com/example/extension",
      frontends: {
        known_ids: ["sillytavern", "lumiverse"],
        other: [],
      },
      frontend_independent: false,
    }),
  );
});

test("exposes a successful GitHub handoff as a success status", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.type(
    screen.getByLabelText("Project URL"),
    "https://github.com/example/frontend",
  );
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  const status = await screen.findByRole("status");
  expect(status).toHaveTextContent("GitHub opened with your submission.");
  expect(status).toHaveAttribute("data-status", "success");
});

test("exposes a failed GitHub handoff as an error alert", async () => {
  openProjectSubmission.mockRejectedValueOnce(new Error("popup failed"));
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.type(
    screen.getByLabelText("Project URL"),
    "https://github.com/example/frontend",
  );
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  const status = await screen.findByRole("alert");
  expect(status).toHaveTextContent(
    "Tavernary could not open GitHub. Please try again.",
  );
  expect(status).toHaveAttribute("data-status", "error");
});

test("blocks a non-HTTPS Frontend source before GitHub handoff", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.type(
    screen.getByLabelText("Project URL"),
    "http://github.com/example/frontend",
  );
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  expect(openProjectSubmission).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Project URL")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getAllByText(frontendEligibility)).toHaveLength(2);
});

test("associates an invalid not-listed frontend URL with its field", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "extension");
  await user.type(
    screen.getByLabelText("Project URL"),
    "https://github.com/example/extension",
  );
  await user.click(screen.getByLabelText("Other or not listed"));
  await user.type(screen.getByLabelText("Other frontend name"), "New UI");
  await user.type(
    screen.getByLabelText("Other frontend URL"),
    "http://example.com/frontend",
  );
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  const otherUrl = screen.getByLabelText("Other frontend URL");
  expect(openProjectSubmission).not.toHaveBeenCalled();
  expect(otherUrl).toHaveAttribute("aria-invalid", "true");
  expect(otherUrl).toHaveAttribute(
    "aria-describedby",
    "other-frontend-url-error",
  );
  expect(
    screen.getByText("Other frontend URL must be a public HTTPS source URL."),
  ).toBeVisible();
});

test("requires an enabled unlisted model family without clearing Model-Agnostic", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "preset");
  await user.click(screen.getByLabelText("Model-Agnostic"));
  await user.click(screen.getByLabelText("Other model family"));

  expect(screen.getByLabelText("Model-Agnostic")).toBeChecked();
  await user.type(
    screen.getByLabelText("Project URL"),
    "https://example.com/preset",
  );
  await user.type(screen.getByLabelText("Project Name (required)"), "Preset");
  await user.type(
    screen.getByLabelText("Short Description (required)"),
    "A preset.",
  );
  await user.click(screen.getByLabelText("Chat Completion"));
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  const otherModel = screen.getByLabelText("Other model family name");
  expect(openProjectSubmission).not.toHaveBeenCalled();
  expect(otherModel).toHaveAttribute("aria-invalid", "true");
  expect(otherModel).toHaveAttribute(
    "aria-describedby",
    "other-model-family-error",
  );
  expect(
    screen.getByText("Other model family name is required."),
  ).toBeVisible();
});

test("serializes Model-Agnostic with recommended and unlisted families", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "preset");
  await user.type(
    screen.getByLabelText("Project URL"),
    "https://github.com/example/preset",
  );
  await user.click(screen.getByLabelText("Model-Agnostic"));
  await user.click(screen.getByLabelText("Claude"));
  await user.click(screen.getByLabelText("Other model family"));
  await user.type(
    screen.getByLabelText("Other model family name"),
    "FutureModel",
  );
  await user.click(screen.getByLabelText("Chat Completion"));
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  expect(screen.getByLabelText("Model-Agnostic")).toBeChecked();
  expect(screen.getByLabelText("Claude")).toBeChecked();
  expect(openProjectSubmission).toHaveBeenCalledWith(
    "https://github.com/MentallyQuill/Tavernary/issues/new",
    expect.objectContaining({
      preset_compatibility: {
        model_families: {
          known_ids: ["model-agnostic", "claude"],
          other: ["FutureModel"],
        },
        completion_formats: ["chat-completion"],
      },
    }),
  );
});

test("serializes multiple model families and both completion formats for a Preset", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "preset");
  await user.type(
    screen.getByLabelText("Project URL"),
    "https://github.com/example/preset",
  );
  await user.click(screen.getByLabelText("Claude"));
  await user.click(screen.getByLabelText("Gemini"));
  await user.click(screen.getByLabelText("Chat Completion"));
  await user.click(screen.getByLabelText("Text Completion"));
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  expect(openProjectSubmission).toHaveBeenCalledWith(
    "https://github.com/MentallyQuill/Tavernary/issues/new",
    expect.objectContaining({
      schema_version: 3,
      project_type: "preset",
      primary_function: "preset",
      preset_compatibility: {
        model_families: {
          known_ids: ["claude", "gemini"],
          other: [],
        },
        completion_formats: ["chat-completion", "text-completion"],
      },
    }),
  );
});
