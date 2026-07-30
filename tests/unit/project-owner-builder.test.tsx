import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ProjectOwnerBuilder } from "@/features/help/components/project-owner-builder";
import type { OwnerProjectOption } from "@/lib/help/load-owner-project-options";

let search = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

const metadataPolicy = {
  summary: { mode: "automatic" as const },
  tags: { mode: "automatic" as const },
};

const commonEditable = {
  summary: "Current extension summary.",
  frontends: ["sillytavern"],
  primaryFunction: "interface-workflow",
  tags: ["automate-workflows"],
  metadataPolicy,
  modelFamilies: [],
  completionFormats: [],
};

const projects: OwnerProjectOption[] = [
  {
    id: "owner-alpha",
    name: "Alpha",
    kind: "extension",
    sourceId: "github-42",
    sourceType: "github",
    sourceUrl: "https://github.com/Owner/Alpha",
    repository: "Owner/Alpha",
    repositoryId: 42,
    eligibleShape: true,
    ineligibilityReason: null,
    projectFingerprint: "b".repeat(64),
    sourceFingerprint: "a".repeat(64),
    siblings: [
      {
        id: "owner-alpha-preset",
        name: "Alpha Preset",
        listingStatus: "retired",
      },
    ],
    sourceState: { status: "active", refreshPolicy: "automatic" },
    listingState: {
      metadataStatus: "curated",
      listingStatus: "active",
      listingStatusReason: null,
    },
    editable: { ...commonEditable, name: "Alpha" },
  },
  {
    id: "owner-alpha-preset",
    name: "Alpha Preset",
    kind: "preset",
    sourceId: "github-42",
    sourceType: "github",
    sourceUrl: "https://github.com/Owner/Alpha",
    repository: "Owner/Alpha",
    repositoryId: 42,
    eligibleShape: true,
    ineligibilityReason: null,
    projectFingerprint: "c".repeat(64),
    sourceFingerprint: "a".repeat(64),
    siblings: [{ id: "owner-alpha", name: "Alpha", listingStatus: "active" }],
    sourceState: { status: "active", refreshPolicy: "automatic" },
    listingState: {
      metadataStatus: "curated",
      listingStatus: "retired",
      listingStatusReason: "owner-request",
    },
    editable: {
      ...commonEditable,
      name: "Alpha Preset",
      summary: "A preset from the Alpha repository.",
      primaryFunction: "preset",
      tags: ["creative-writing"],
      modelFamilies: ["claude"],
      completionFormats: ["chat-completion"],
    },
  },
  {
    id: "removed-card",
    name: "Removed Card",
    kind: "extension",
    sourceId: "github-84",
    sourceType: "github",
    sourceUrl: "https://github.com/Owner/Removed",
    repository: "Owner/Removed",
    repositoryId: 84,
    eligibleShape: false,
    ineligibilityReason: "This repository source is permanently delisted.",
    projectFingerprint: "d".repeat(64),
    sourceFingerprint: "e".repeat(64),
    siblings: [],
    sourceState: { status: "delisted", refreshPolicy: "paused" },
    listingState: {
      metadataStatus: "curated",
      listingStatus: "active",
      listingStatusReason: null,
    },
    editable: { ...commonEditable, name: "Removed Card" },
  },
];

const vocabularies = {
  frontends: [
    { id: "sillytavern", label: "SillyTavern" },
    { id: "risuai", label: "RisuAI" },
  ],
  primaryFunctions: [
    { id: "frontend", label: "Frontend" },
    { id: "preset", label: "System Preset" },
    { id: "interface-workflow", label: "Interface and workflow" },
    { id: "generation-reasoning", label: "Generation and reasoning" },
  ],
  tags: [
    {
      id: "automate-workflows",
      label: "Automate workflows",
      facet: "goal" as const,
      description: "Automate repeated work.",
      aliases: [],
      applicable_kinds: ["frontend", "extension"] as const,
    },
    {
      id: "creative-writing",
      label: "Creative writing",
      facet: "goal" as const,
      description: "Support creative writing.",
      aliases: [],
      applicable_kinds: ["frontend", "extension", "preset"] as const,
    },
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `trait-${index + 1}`,
      label: `Trait ${index + 1}`,
      facet: "trait" as const,
      description: `Trait ${index + 1}.`,
      aliases: [],
      applicable_kinds: ["extension"] as const,
    })),
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
const currentTagVocabularyHash = "f".repeat(64);

function renderBuilder() {
  return render(
    <ProjectOwnerBuilder
      projects={projects}
      tagVocabularyHash={currentTagVocabularyHash}
      vocabularies={vocabularies}
    />,
  );
}

async function selectProject(
  user: ReturnType<typeof userEvent.setup>,
  id = "owner-alpha",
) {
  await user.selectOptions(screen.getByLabelText("Project"), id);
}

afterEach(cleanup);

beforeEach(() => {
  search = "";
  vi.restoreAllMocks();
});

test("offers only source- and card-valid maintenance operations", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await selectProject(user);

  for (const label of [
    "Edit card details",
    "Add cards from this source",
    "Retire this card",
    "Update repository location",
    "Permanently delist this source",
  ]) {
    expect(screen.getByRole("radio", { name: label })).toBeVisible();
  }
  expect(
    screen.queryByRole("radio", { name: "Restore this card" }),
  ).not.toBeInTheDocument();

  await selectProject(user, "owner-alpha-preset");
  expect(
    screen.getByRole("radio", { name: "Restore this card" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("radio", { name: "Retire this card" }),
  ).not.toBeInTheDocument();

  await selectProject(user, "removed-card");
  for (const label of [
    "Add cards from this source",
    "Restore this card",
    "Update repository location",
  ]) {
    expect(
      screen.queryByRole("radio", { name: label }),
    ).not.toBeInTheDocument();
  }
});

test("clones one complete card without cloning metadata provenance", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await selectProject(user);
  await user.click(
    screen.getByRole("radio", { name: "Add cards from this source" }),
  );

  expect(
    screen.getByText(
      "You may propose up to 10 cards from this GitHub repository in one request. Only one unresolved add-card request may exist for the repository at a time. Tavernary reviews the complete batch together.",
    ),
  ).toBeVisible();
  expect(screen.getByLabelText("Card 1 display name")).toHaveValue("Alpha");
  expect(screen.getByLabelText("Card 1 summary policy")).toHaveValue(
    "automatic",
  );
  expect(screen.getByLabelText("Card 1 tag policy")).toHaveValue("automatic");
  expect(
    screen.getByRole("checkbox", { name: "Automate workflows" }),
  ).toBeChecked();
  expect(screen.getByText("owner-alpha-alpha")).toBeVisible();
});

test("enforces the ten-card batch boundary and keeps at least one draft", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await selectProject(user);
  await user.click(
    screen.getByRole("radio", { name: "Add cards from this source" }),
  );

  const add = screen.getByRole("button", { name: "Add another card" });
  for (let index = 1; index < 10; index += 1) await user.click(add);
  expect(add).toBeDisabled();
  expect(screen.getAllByRole("group", { name: /^Card \d+:/u })).toHaveLength(
    10,
  );

  const remove = screen.getAllByRole("button", { name: /Remove Card/u });
  for (let index = remove.length - 1; index > 0; index -= 1) {
    await user.click(remove[index]!);
  }
  expect(screen.getAllByRole("group", { name: /^Card \d+:/u })).toHaveLength(1);
  expect(screen.getByRole("button", { name: /Remove Card 1/u })).toBeDisabled();
});

test("gives each add-card draft its own six-tag allowance", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await selectProject(user);
  await user.click(
    screen.getByRole("radio", { name: "Add cards from this source" }),
  );
  await user.click(screen.getByRole("button", { name: "Add another card" }));
  const [first, second] = screen.getAllByRole("group", {
    name: /^Card \d+:/u,
  });

  for (const label of [
    "Creative writing",
    "Trait 1",
    "Trait 2",
    "Trait 3",
    "Trait 4",
  ]) {
    await user.click(within(first!).getByLabelText(label));
  }
  expect(within(first!).getByText("6 / 6 selected")).toBeVisible();
  expect(within(second!).getByLabelText("Creative writing")).toBeEnabled();

  for (const label of [
    "Creative writing",
    "Trait 1",
    "Trait 2",
    "Trait 3",
    "Trait 4",
  ]) {
    await user.click(within(second!).getByLabelText(label));
  }
  expect(within(second!).getByText("6 / 6 selected")).toBeVisible();
  expect(within(first!).getByText("6 / 6 selected")).toBeVisible();
});

test("blocks the whole batch for duplicate generated IDs or one invalid card", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await selectProject(user);
  await user.click(
    screen.getByRole("radio", { name: "Add cards from this source" }),
  );
  await user.click(screen.getByRole("button", { name: "Add another card" }));
  await user.click(screen.getByRole("button", { name: "Review request" }));

  expect(screen.getByRole("alert")).toHaveTextContent(
    /duplicate project IDs|project ID does not match/iu,
  );
  expect(
    screen.queryByRole("heading", { name: "Review your public request" }),
  ).not.toBeInTheDocument();

  await user.clear(screen.getByLabelText("Card 2 display name"));
  await user.type(screen.getByLabelText("Card 2 display name"), "Beta");
  await user.clear(screen.getByLabelText("Card 2 summary"));
  await user.click(screen.getByRole("button", { name: "Review request" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Owner summary is required.",
  );
});

test("reviews and hands off one atomic multi-card manifest", async () => {
  const user = userEvent.setup();
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  renderBuilder();
  await selectProject(user);
  await user.click(
    screen.getByRole("radio", { name: "Add cards from this source" }),
  );
  await user.clear(screen.getByLabelText("Card 1 display name"));
  await user.type(screen.getByLabelText("Card 1 display name"), "V9 Mirage");
  await user.click(screen.getByRole("button", { name: "Review request" }));

  expect(screen.getByText("Card 1: V9 Mirage")).toBeVisible();
  expect(screen.getByText("owner-alpha-v9-mirage")).toBeVisible();
  expect(screen.getByText("Summary policy: automatic")).toBeVisible();
  expect(screen.getByText("Tag policy: automatic")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));
  expect(
    await screen.findByText(/GitHub review opened in a new tab/u),
  ).toBeVisible();

  const opened = new URL(open.mock.calls[0]?.[0] as string);
  const manifest = JSON.parse(
    opened.searchParams.get("owner-request-manifest") ?? "",
  );
  expect(manifest).toMatchObject({
    schema_version: 2,
    operation: "add-cards",
    tag_vocabulary_hash: currentTagVocabularyHash,
    source_id: "github-42",
    source_fingerprint: "a".repeat(64),
    proposed_cards: [
      {
        project_id: "owner-alpha-v9-mirage",
        name: "V9 Mirage",
        metadata: {
          summary: { mode: "automatic" },
          tags: { mode: "automatic" },
        },
      },
    ],
  });
  expect(manifest.proposed_cards[0].draft_id).not.toBe(
    manifest.proposed_cards[0].project_id,
  );

  await user.click(screen.getByRole("button", { name: "Back and edit" }));
  expect(screen.getByLabelText("Card 1 display name")).toHaveValue("V9 Mirage");
  await user.click(screen.getByRole("button", { name: "Review request" }));
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));
  const reopenedManifest = JSON.parse(
    new URL(open.mock.calls[1]?.[0] as string).searchParams.get(
      "owner-request-manifest",
    ) ?? "",
  );
  expect(reopenedManifest).toEqual(manifest);
});

test(
  "preserves all ten add-card drafts through back, edit, and reopen",
  async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.spyOn(window, "open").mockReturnValue(window);
    renderBuilder();
    await selectProject(user);
    await user.click(
      screen.getByRole("radio", { name: "Add cards from this source" }),
    );

    const add = screen.getByRole("button", { name: "Add another card" });
    for (let index = 2; index <= 10; index += 1) {
      await user.click(add);
      const name = screen.getByLabelText(`Card ${index} display name`);
      await user.clear(name);
      await user.type(name, `Alpha Card ${index}`);
    }
    await user.type(
      screen.getByLabelText("Public note (optional)"),
      "Review this complete ten-card source batch.",
    );
    await user.click(screen.getByRole("button", { name: "Review request" }));
    expect(screen.getByText("Card 10: Alpha Card 10")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Continue on GitHub" }),
    );
    const firstManifest = JSON.parse(writeText.mock.calls[0]?.[0] ?? "");
    expect(firstManifest.proposed_cards).toHaveLength(10);

    await user.click(screen.getByRole("button", { name: "Back and edit" }));
    expect(screen.getByLabelText("Card 10 display name")).toHaveValue(
      "Alpha Card 10",
    );
    await user.click(screen.getByRole("button", { name: "Review request" }));
    await user.click(
      screen.getByRole("button", { name: "Continue on GitHub" }),
    );
    const reopenedManifest = JSON.parse(writeText.mock.calls[1]?.[0] ?? "");
    expect(reopenedManifest).toEqual(firstManifest);
  },
  15_000,
);

test("uses independent metadata choices for ordinary edits", async () => {
  const user = userEvent.setup();
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  renderBuilder();
  await selectProject(user);
  await user.click(screen.getByRole("radio", { name: "Edit card details" }));
  await user.selectOptions(screen.getByLabelText("Summary policy"), "manual");
  await user.selectOptions(screen.getByLabelText("Tag policy"), "automatic");
  await user.clear(screen.getByLabelText("Display name"));
  await user.type(screen.getByLabelText("Display name"), "Alpha Updated");
  await user.click(screen.getByRole("button", { name: "Review request" }));
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  const opened = new URL(open.mock.calls[0]?.[0] as string);
  expect(
    JSON.parse(opened.searchParams.get("owner-request-manifest") ?? ""),
  ).toMatchObject({
    operation: "edit-card",
    tag_vocabulary_hash: currentTagVocabularyHash,
    source_id: "github-42",
    project_id: "owner-alpha",
    project_fingerprint: "b".repeat(64),
    proposed: {
      name: "Alpha Updated",
      metadata: {
        summary: { mode: "manual" },
        tags: { mode: "automatic" },
      },
    },
  });
});

test("makes edited summary and tags manual while preserving an explicit automatic choice", async () => {
  const user = userEvent.setup();
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  renderBuilder();
  await selectProject(user);
  await user.click(screen.getByRole("radio", { name: "Edit card details" }));

  expect(screen.getByLabelText("Summary policy")).toHaveValue("automatic");
  expect(screen.getByLabelText("Tag policy")).toHaveValue("automatic");

  const summary = screen.getByRole("textbox", { name: /^Summary$/u });
  await user.clear(summary);
  await user.type(summary, "An owner-authored replacement summary.");
  await user.click(screen.getByRole("checkbox", { name: "Creative writing" }));

  expect(screen.getByLabelText("Summary policy")).toHaveValue("manual");
  expect(screen.getByLabelText("Tag policy")).toHaveValue("manual");

  await user.selectOptions(
    screen.getByLabelText("Summary policy"),
    "automatic",
  );
  await user.type(
    screen.getByLabelText("Public note (optional)"),
    "Keep automatic summary generation.",
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));

  expect(screen.getByText("Summary: automatic; tags: manual")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Back and edit" }));
  expect(screen.getByLabelText("Summary policy")).toHaveValue("automatic");
  expect(screen.getByLabelText("Tag policy")).toHaveValue("manual");
  await user.click(screen.getByRole("button", { name: "Review request" }));
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  const opened = new URL(open.mock.calls[0]?.[0] as string);
  const manifest = JSON.parse(
    opened.searchParams.get("owner-request-manifest") ?? "",
  );
  expect(manifest).toMatchObject({
    operation: "edit-card",
    source_id: "github-42",
    project_id: "owner-alpha",
    repository_id: 42,
    proposed: {
      summary: "An owner-authored replacement summary.",
      tags: ["automate-workflows", "creative-writing"],
      metadata: {
        summary: { mode: "automatic" },
        tags: { mode: "manual" },
      },
    },
  });
  expect(opened.searchParams.get("request-type")).toBe("Edit card details");
  expect(opened.searchParams.get("source-id")).toBe("github-42");
  expect(opened.searchParams.get("project-id")).toBe("owner-alpha");
  expect(opened.searchParams.get("explanation")).toBe(
    "Keep automatic summary generation.",
  );
  expect(opened.searchParams.has("public-note")).toBe(false);
});

test("removes emoji from an owner summary and explains the edit", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await selectProject(user);
  await user.click(screen.getByRole("radio", { name: "Edit card details" }));

  const summary = screen.getByRole("textbox", { name: /^Summary$/u });
  await user.clear(summary);
  await user.type(summary, "This is damn useful 🧭 for ST-QuickReply.");

  expect(summary).toHaveValue("This is damn useful  for ST-QuickReply.");
  expect(
    screen.getByText(
      "Emojis aren't supported in catalog descriptions. The rest of your text has been kept.",
    ),
  ).toBeVisible();
});

test("describes retire and restore as reversible one-card maintenance", async () => {
  const user = userEvent.setup();
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  renderBuilder();
  await selectProject(user);
  await user.click(screen.getByRole("radio", { name: "Retire this card" }));
  expect(
    screen.getByText(
      "Retiring Alpha hides only this card. The repository and sibling cards stay listed, and this card can be restored later.",
    ),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Review request" }));
  expect(screen.getByText("After: retired")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));
  expect(
    JSON.parse(
      new URL(open.mock.calls[0]?.[0] as string).searchParams.get(
        "owner-request-manifest",
      ) ?? "",
    ),
  ).toMatchObject({
    operation: "retire-card",
    project_id: "owner-alpha",
    proposed: {
      listing_status: "retired",
      listing_status_reason: "owner-request",
    },
  });

  await user.click(screen.getByRole("button", { name: "Back and edit" }));
  await selectProject(user, "owner-alpha-preset");
  await user.click(screen.getByRole("radio", { name: "Restore this card" }));
  expect(
    screen.getByText(
      "Restoring Alpha Preset returns this card to the public catalog without changing its repository or sibling cards.",
    ),
  ).toBeVisible();
});

test("reviews and hands off a restore-card transaction", async () => {
  const user = userEvent.setup();
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  renderBuilder();
  await selectProject(user, "owner-alpha-preset");
  await user.click(screen.getByRole("radio", { name: "Restore this card" }));
  await user.type(
    screen.getByLabelText("Public note (optional)"),
    "Restore the retired sibling.",
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));

  expect(screen.getByText("After: active")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  const opened = new URL(open.mock.calls[0]?.[0] as string);
  expect(
    JSON.parse(opened.searchParams.get("owner-request-manifest") ?? ""),
  ).toMatchObject({
    operation: "restore-card",
    source_id: "github-42",
    project_id: "owner-alpha-preset",
    proposed: { listing_status: "active", listing_status_reason: null },
    explanation: "Restore the retired sibling.",
  });
});

test("reviews and hands off a move-source transaction", async () => {
  const user = userEvent.setup();
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  renderBuilder();
  await selectProject(user);
  await user.click(
    screen.getByRole("radio", { name: "Update repository location" }),
  );
  await user.type(
    screen.getByLabelText("Public GitHub repository URL"),
    "https://github.com/Owner/Alpha-Renamed",
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));

  expect(screen.getByText("Owner/Alpha")).toBeVisible();
  expect(screen.getByText("Owner/Alpha-Renamed")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  const opened = new URL(open.mock.calls[0]?.[0] as string);
  expect(
    JSON.parse(opened.searchParams.get("owner-request-manifest") ?? ""),
  ).toMatchObject({
    operation: "move-source",
    source_id: "github-42",
    repository_id: 42,
    original: { repository: "Owner/Alpha", repository_id: 42 },
    proposed: { repository: "Owner/Alpha-Renamed", repository_id: 42 },
  });
  expect(opened.searchParams.get("project-id")).toBe("");
});

test("permanently delists one source only after repository confirmation", async () => {
  const user = userEvent.setup();
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  renderBuilder();
  await selectProject(user);
  await user.click(
    screen.getByRole("radio", {
      name: "Permanently delist this source",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));

  const dialog = screen.getByRole("dialog", {
    name: "Permanently delist Owner/Alpha?",
  });
  expect(within(dialog).getByText("Alpha")).toBeVisible();
  expect(within(dialog).getByText("Alpha Preset")).toBeVisible();
  const confirmation = within(dialog).getByLabelText(
    "Type Owner/Alpha to confirm permanent delisting.",
  );
  await user.type(confirmation, "Owner/Alpha");
  await user.click(
    within(dialog).getByRole("button", {
      name: "Permanently delist source",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  const opened = new URL(open.mock.calls[0]?.[0] as string);
  expect(
    JSON.parse(opened.searchParams.get("owner-request-manifest") ?? ""),
  ).toMatchObject({
    operation: "delist-source",
    source_id: "github-42",
    source_fingerprint: "a".repeat(64),
    delist_confirmation: "Owner/Alpha",
  });
});
