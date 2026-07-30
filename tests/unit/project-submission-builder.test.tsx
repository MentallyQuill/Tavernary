import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import ProjectSubmissionPage from "@/app/submit/project/page";
import { ProjectSubmissionBuilder } from "@/features/submissions/components/project-submission-builder";
import trackedTags from "../../data/vocabularies/tags.json";
import {
  publicTagVocabulary,
  type TagVocabulary,
} from "../../scripts/catalog/tag-vocabulary.mjs";

const { openProjectSubmission } = vi.hoisted(() => ({
  openProjectSubmission: vi.fn().mockResolvedValue({
    mode: "prefilled",
    url: new URL("https://github.com/MentallyQuill/Tavernary/issues/new"),
  }),
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
const publicTags = publicTagVocabulary(trackedTags as TagVocabulary);

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

async function chooseMetadataOption(
  user: ReturnType<typeof userEvent.setup>,
  label: "Description choice" | "Tag choice",
  option: string,
) {
  await user.click(screen.getByLabelText(label));
  await user.click(
    screen.getByRole("option", { name: new RegExp(option, "u") }),
  );
}

async function reviewSubmission(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Review submission" }));
}

async function reviewAndContinue(user: ReturnType<typeof userEvent.setup>) {
  await reviewSubmission(user);
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));
}

function reviewRow(label: string) {
  const term = screen.getByText(label, { selector: "dt" });
  if (!term.parentElement) throw new Error(`Missing review row: ${label}`);
  return within(term.parentElement);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("requires a deliberate Project Type selection", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  const projectType = screen.getByLabelText("Project Type");
  expect(projectType).toHaveValue("");
  expect(
    screen.getByRole("option", { name: "Select a project type" }),
  ).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Review submission" }));

  expect(await screen.findByText("Project Type is required.")).toBeVisible();
  expect(projectType).toHaveFocus();
  expect(openProjectSubmission).not.toHaveBeenCalled();
});

test("keeps Extension selected through review, edit, and a fresh handoff", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "extension");
  await choosePrimaryFunction(user, "Interface and workflow");
  const sourceUrl = screen.getByLabelText("Project URL");
  await user.type(sourceUrl, "https://github.com/example/first");
  await user.clear(sourceUrl);
  await user.type(sourceUrl, "https://github.com/example/extension");
  await user.click(screen.getByLabelText("SillyTavern"));
  await user.type(
    screen.getByLabelText("Anything we should know? (optional)"),
    "Owner-tested workflow.",
  );

  await user.click(screen.getByRole("button", { name: "Review submission" }));

  expect(
    screen.getByRole("heading", { name: "Review your project submission" }),
  ).toBeVisible();
  expect(screen.getByText("Extension")).toBeVisible();
  expect(screen.getByText("Interface and workflow")).toBeVisible();
  expect(
    screen.getByText("https://github.com/example/extension"),
  ).toBeVisible();
  expect(screen.getByText("Let TavernAI write the description")).toBeVisible();
  expect(screen.getByText("Let Tavernary select tags")).toBeVisible();
  expect(screen.getByText("SillyTavern")).toBeVisible();
  expect(screen.getByText("Owner-tested workflow.")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Back and edit" }));

  expect(screen.getByLabelText("Project Type")).toHaveValue("extension");
  expect(screen.getByLabelText("Project Type")).toHaveFocus();
  await user.clear(screen.getByLabelText("Project URL"));
  await user.type(
    screen.getByLabelText("Project URL"),
    "https://github.com/example/reviewed-extension",
  );
  await user.click(screen.getByRole("button", { name: "Review submission" }));
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  expect(openProjectSubmission).toHaveBeenCalledWith(
    "https://github.com/MentallyQuill/Tavernary/issues/new",
    expect.objectContaining({
      schema_version: 4,
      project_type: "extension",
      primary_function: "interface-workflow",
      source_url: "https://github.com/example/reviewed-extension",
    }),
  );
});

test("defaults summary and tags to Tavernary automation", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "extension");

  expect(screen.getByLabelText("Description choice")).toHaveValue("automatic");
  expect(screen.getByLabelText("Tag choice")).toHaveValue("automatic");
  expect(screen.queryByLabelText("Short description")).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText("Search goals and traits"),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Project Name/u)).not.toBeInTheDocument();
  expect(
    screen.getByText(/root README first.+GitHub description second/iu),
  ).toBeVisible();
  expect(
    screen.getByText(
      "Only the verified repository owner or trusted Tavernary staff can set this description. If you are not the owner, leave this set to Let TavernAI write the description; any description you enter will be ignored.",
    ),
  ).toBeVisible();
  expect(
    screen.getByText(
      "Only the verified repository owner or trusted Tavernary staff can set these tags. If you are not the owner, leave this set to Let Tavernary select tags; any tags you select will be ignored.",
    ),
  ).toBeVisible();
});

test("reveals independent bounded manual metadata controls", async () => {
  const user = userEvent.setup();
  render(
    <ProjectSubmissionBuilder
      frontends={frontends}
      tagVocabulary={publicTags}
    />,
  );

  await user.selectOptions(screen.getByLabelText("Project Type"), "extension");
  await chooseMetadataOption(
    user,
    "Description choice",
    "Write the description myself",
  );
  await chooseMetadataOption(user, "Tag choice", "Set tags myself");

  expect(screen.getByLabelText("Short description")).toBeVisible();
  expect(screen.getByLabelText("Search goals and traits")).toBeVisible();
  expect(
    screen.getAllByText(/only the verified repository owner/iu),
  ).toHaveLength(2);
  expect(screen.getByText("0 / 6 selected")).toBeVisible();

  for (const label of [
    "Maintain long-term memory",
    "Manage context limits",
    "Retrieve relevant context",
    "Build worlds and lore",
    "Manage lorebooks",
    "Create character cards",
  ]) {
    await user.click(screen.getByLabelText(label));
  }

  expect(screen.getByText("6 / 6 selected")).toBeVisible();
  expect(
    screen.getByLabelText("Manage characters and personas"),
  ).toBeDisabled();
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
  await reviewSubmission(user);
  expect(reviewRow("Project Type").getByText("Frontend")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  expect(openProjectSubmission).toHaveBeenLastCalledWith(
    "https://github.com/MentallyQuill/Tavernary/issues/new",
    expect.objectContaining({
      schema_version: 4,
      project_type: "frontend",
      primary_function: "frontend",
    }),
  );

  openProjectSubmission.mockClear();
  await user.click(screen.getByRole("button", { name: "Back and edit" }));
  await user.selectOptions(screen.getByLabelText("Project Type"), "extension");
  expect(screen.getByLabelText("Primary function")).toHaveTextContent(
    "Select a primary function",
  );
  await choosePrimaryFunction(user, "Interface and workflow");
  await user.click(screen.getByLabelText("SillyTavern"));
  await reviewAndContinue(user);

  expect(openProjectSubmission).toHaveBeenLastCalledWith(
    "https://github.com/MentallyQuill/Tavernary/issues/new",
    expect.objectContaining({
      schema_version: 4,
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

  expect(screen.queryByText(frontendEligibility)).not.toBeInTheDocument();
  expect(
    screen.getByText("Choose a project type to see its source requirements."),
  ).toBeVisible();

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

  await chooseMetadataOption(
    user,
    "Description choice",
    "Write the description myself",
  );
  const description = screen.getByLabelText(/Short description/iu);
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

test("limits the Short Description to 220 characters with live feedback", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await chooseMetadataOption(
    user,
    "Description choice",
    "Write the description myself",
  );
  const description = screen.getByLabelText(/Short description/iu);
  expect(description).toHaveAttribute("maxlength", "220");
  expect(screen.getByText("0/220 characters")).toBeVisible();

  await user.type(description, "x".repeat(221));

  expect(description).toHaveValue("x".repeat(220));
  expect(screen.getByText("220/220 characters")).toBeVisible();
  expect(description).toHaveAttribute(
    "aria-describedby",
    expect.stringContaining("project-description-count"),
  );
});

test("rejects a generic public source host for a Frontend", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "frontend");
  await user.type(
    screen.getByLabelText("Project URL"),
    "https://example.com/frontend",
  );
  await reviewSubmission(user);

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
  await reviewAndContinue(user);

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

  await user.selectOptions(screen.getByLabelText("Project Type"), "frontend");
  await user.type(
    screen.getByLabelText("Project URL"),
    "https://example.com/frontend",
  );
  await reviewSubmission(user);

  expect(openProjectSubmission).not.toHaveBeenCalled();
  expect(screen.queryByLabelText(/Project Name/u)).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText(/Short description/iu),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Description choice")).toBeVisible();
  expect(screen.getByLabelText("Tag choice")).toBeVisible();
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
  await reviewAndContinue(user);

  expect(openProjectSubmission).toHaveBeenCalledWith(
    "https://github.com/MentallyQuill/Tavernary/issues/new",
    expect.objectContaining({
      schema_version: 4,
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

test("exposes a successful GitHub handoff in the retained review", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "frontend");
  await user.type(
    screen.getByLabelText("Project URL"),
    "https://github.com/example/frontend",
  );
  await reviewAndContinue(user);

  const status = await screen.findByRole("status");
  expect(status).toHaveTextContent(
    "GitHub review opened in a new tab. Create the issue there, or return here to make changes.",
  );
  expect(
    screen.getByRole("button", { name: "Open GitHub review again" }),
  ).toBeVisible();
});

test("exposes a failed GitHub handoff without discarding the review", async () => {
  openProjectSubmission.mockRejectedValueOnce(new Error("popup failed"));
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "frontend");
  await user.type(
    screen.getByLabelText("Project URL"),
    "https://github.com/example/frontend",
  );
  await reviewAndContinue(user);

  const status = await screen.findByRole("alert");
  expect(status).toHaveTextContent("popup failed");
  expect(
    screen.getByRole("heading", { name: "Review your project submission" }),
  ).toBeVisible();
});

test("blocks a non-HTTPS Frontend source before GitHub handoff", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "frontend");
  await user.type(
    screen.getByLabelText("Project URL"),
    "http://github.com/example/frontend",
  );
  await reviewSubmission(user);

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
  await reviewSubmission(user);

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
  await user.click(screen.getByLabelText("Chat Completion"));
  await reviewSubmission(user);

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
  expect(screen.getByLabelText("Model-Agnostic")).toBeChecked();
  expect(screen.getByLabelText("Claude")).toBeChecked();
  await reviewAndContinue(user);

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
  await reviewSubmission(user);
  expect(reviewRow("Project Type").getByText("System Preset")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  expect(openProjectSubmission).toHaveBeenCalledWith(
    "https://github.com/MentallyQuill/Tavernary/issues/new",
    expect.objectContaining({
      schema_version: 4,
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
