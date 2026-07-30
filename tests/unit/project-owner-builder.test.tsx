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
  summary: { mode: "manual" as const },
  tags: { mode: "manual" as const },
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

function renderBuilder() {
  return render(
    <ProjectOwnerBuilder projects={projects} vocabularies={vocabularies} />,
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

  const opened = new URL(open.mock.calls[0]?.[0] as string);
  const manifest = JSON.parse(
    opened.searchParams.get("owner-request-manifest") ?? "",
  );
  expect(manifest).toMatchObject({
    schema_version: 2,
    operation: "add-cards",
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
});

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

test("describes retire and restore as reversible one-card maintenance", async () => {
  const user = userEvent.setup();
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

  await user.click(screen.getByRole("button", { name: "Back and edit" }));
  await selectProject(user, "owner-alpha-preset");
  await user.click(screen.getByRole("radio", { name: "Restore this card" }));
  expect(
    screen.getByText(
      "Restoring Alpha Preset returns this card to the public catalog without changing its repository or sibling cards.",
    ),
  ).toBeVisible();
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
