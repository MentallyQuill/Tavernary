import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import { ProjectPicker } from "@/features/help/components/project-picker";
import type { OwnerProjectOption } from "@/lib/help/load-owner-project-options";

const baseProject = {
  kind: "extension" as const,
  sourceType: "github" as const,
  repositoryId: 42,
  eligibleShape: true,
  ineligibilityReason: null,
  projectFingerprint: "b".repeat(64),
  sourceFingerprint: "a".repeat(64),
  siblings: [],
  sourceState: {
    status: "active" as const,
    refreshPolicy: "automatic" as const,
  },
  listingState: {
    metadataStatus: "curated",
    listingStatus: "active" as const,
    listingStatusReason: null,
  },
  editable: {
    name: "Alpha",
    summary: "Current extension summary.",
    frontends: ["sillytavern"],
    primaryFunction: "interface-workflow",
    tags: ["automate-workflows"],
    metadataPolicy: {
      summary: { mode: "automatic" as const },
      tags: { mode: "automatic" as const },
    },
    modelFamilies: [],
    completionFormats: [],
  },
};

const projects: OwnerProjectOption[] = [
  {
    ...baseProject,
    id: "owner-alpha",
    name: "Alpha",
    sourceId: "github-42",
    sourceUrl: "https://github.com/Owner/Alpha",
    repository: "Owner/Alpha",
  },
  {
    ...baseProject,
    id: "owner-alpha-preset",
    name: "Alpha Preset",
    kind: "preset",
    sourceId: "github-42",
    sourceUrl: "https://github.com/Owner/Alpha",
    repository: "Owner/Alpha",
    editable: {
      ...baseProject.editable,
      name: "Alpha Preset",
      primaryFunction: "preset",
      modelFamilies: ["claude"],
      completionFormats: ["chat-completion"],
    },
  },
  {
    ...baseProject,
    id: "removed-card",
    name: "Removed Card",
    sourceId: "github-84",
    sourceUrl: "https://github.com/Owner/Removed",
    repository: "Owner/Removed",
    repositoryId: 84,
    eligibleShape: false,
    ineligibilityReason: "This repository source is permanently delisted.",
    sourceState: {
      status: "delisted",
      refreshPolicy: "paused",
    },
    editable: { ...baseProject.editable, name: "Removed Card" },
  },
];

afterEach(cleanup);

test("shows and filters live catalog-backed project results", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<ProjectPicker projects={projects} value="" onChange={onChange} />);

  const picker = screen.getByRole("combobox", { name: "Project" });
  await user.click(picker);
  expect(screen.getAllByRole("option")).toHaveLength(3);

  await user.type(picker, "owner/removed");
  expect(screen.getByRole("option", { name: /Removed Card/iu })).toBeVisible();
  expect(screen.queryByRole("option", { name: /Alpha Preset/iu })).toBeNull();

  await user.clear(picker);
  await user.type(picker, "owner-alpha-preset");
  await user.click(screen.getByRole("option", { name: /Alpha Preset/iu }));
  expect(onChange).toHaveBeenLastCalledWith("owner-alpha-preset");
  expect(picker).toHaveValue("Alpha Preset");

  await user.clear(picker);
  await user.type(picker, "does not exist");
  expect(screen.getByText("No matching projects")).toBeVisible();
});

test("commits only real projects through keyboard navigation", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<ProjectPicker projects={projects} value="" onChange={onChange} />);

  const picker = screen.getByRole("combobox", { name: "Project" });
  await user.click(picker);
  await user.keyboard("{End}{Enter}");
  expect(onChange).toHaveBeenLastCalledWith("removed-card");
  expect(picker).toHaveValue("Removed Card");

  await user.click(picker);
  await user.keyboard("{Escape}");
  expect(picker).toHaveAttribute("aria-expanded", "false");

  await user.click(picker);
  await user.keyboard("{Tab}");
  expect(picker).toHaveAttribute("aria-expanded", "false");

  await user.click(picker);
  await user.clear(picker);
  await user.type(picker, "not-a-project");
  expect(onChange).not.toHaveBeenCalledWith("not-a-project");
});
