import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";

import { TagBrowser } from "@/features/catalog/components/tag-browser";
import {
  searchTags,
  type PublicTagDefinition,
} from "@/features/catalog/tag-vocabulary";

afterEach(cleanup);

const coreTags: PublicTagDefinition[] = [
  {
    id: "maintain-long-term-memory",
    label: "Maintain long-term memory",
    facet: "goal",
    description: "Preserve persistent context across long conversations.",
    aliases: ["memory books"],
    applicable_kinds: ["extension"],
  },
  {
    id: "generate-images",
    label: "Generate images",
    facet: "goal",
    description: "Create visual assets from the roleplay interface.",
    aliases: ["image synthesis"],
    applicable_kinds: ["extension", "frontend"],
  },
  {
    id: "local-first",
    label: "Local-first",
    facet: "trait",
    description: "Runs primarily on the user's own machine.",
    aliases: ["offline friendly"],
    applicable_kinds: ["extension", "frontend"],
  },
  ...Array.from({ length: 5 }, (_, index) => ({
    id: `goal-${index + 1}`,
    label: `Goal ${index + 1}`,
    facet: "goal" as const,
    description: `Goal description ${index + 1}.`,
    aliases: [],
    applicable_kinds: ["extension"] as const,
  })),
];

const hundredTags: PublicTagDefinition[] = [
  ...coreTags,
  ...Array.from({ length: 92 }, (_, index) => ({
    id: `trait-${index + 1}`,
    label: `Trait ${index + 1}`,
    facet: "trait" as const,
    description: `Trait description ${index + 1}.`,
    aliases: [`characteristic ${index + 1}`],
    applicable_kinds: ["extension"] as const,
  })),
];

function Harness({
  tags = hundredTags,
  initialSelected = [],
  maxSelections = 6,
}: {
  tags?: PublicTagDefinition[];
  initialSelected?: string[];
  maxSelections?: number;
}) {
  const [selected, setSelected] = useState(initialSelected);
  return (
    <TagBrowser
      tags={tags}
      selected={selected}
      onToggle={(id) =>
        setSelected((current) =>
          current.includes(id)
            ? current.filter((value) => value !== id)
            : [...current, id],
        )
      }
      maxSelections={maxSelections}
      counts={Object.fromEntries(tags.map((tag, index) => [tag.id, index]))}
      searchLabel="Search goals and traits"
      limitLabel="6 tags maximum"
    />
  );
}

test("searches labels, aliases, and descriptions", () => {
  expect(searchTags(coreTags, "long-term")).toHaveLength(1);
  expect(searchTags(coreTags, "memory books")[0]?.id).toBe(
    "maintain-long-term-memory",
  );
  expect(searchTags(coreTags, "persistent context")[0]?.id).toBe(
    "maintain-long-term-memory",
  );
  expect(searchTags(coreTags, "  ")).toEqual(coreTags);
});

test("filters the visible tag browser by searchable metadata", async () => {
  const user = userEvent.setup();
  render(<Harness tags={coreTags} />);

  await user.type(
    screen.getByRole("searchbox", { name: "Search goals and traits" }),
    "persistent context",
  );

  expect(
    screen.getByLabelText("Maintain long-term memory"),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("Generate images")).not.toBeInTheDocument();
});

test("pins selected tags and prevents a seventh selection", async () => {
  const user = userEvent.setup();
  const sixIds = [
    "maintain-long-term-memory",
    "goal-1",
    "goal-2",
    "goal-3",
    "goal-4",
    "goal-5",
  ];
  render(<Harness tags={coreTags} initialSelected={sixIds} />);

  expect(screen.getByText("6 / 6 selected")).toBeVisible();
  expect(screen.getByLabelText("Generate images")).toBeDisabled();
  const goals = screen.getByRole("group", { name: "Goals" });
  expect(within(goals).getAllByRole("checkbox")[0]).toHaveAccessibleName(
    "Maintain long-term memory",
  );

  await user.click(screen.getByLabelText("Goal 5"));
  expect(screen.getByText("5 / 6 selected")).toBeVisible();
  expect(screen.getByLabelText("Generate images")).toBeEnabled();
});

test("renders separate Goals and Traits groups in one bounded region", () => {
  render(<Harness />);

  expect(screen.getByRole("group", { name: "Goals" })).toBeVisible();
  expect(screen.getByRole("group", { name: "Traits" })).toBeVisible();
  expect(screen.getByTestId("tag-results")).toHaveClass("tag-results-bounded");
  expect(screen.queryByRole("button", { name: /show more/iu })).toBeNull();
  expect(screen.getByText("6 tags maximum")).toBeVisible();
});

test("allows keyboard selection and announces per-tag counts", async () => {
  const user = userEvent.setup();
  render(<Harness tags={coreTags} />);

  const memory = screen.getByLabelText("Maintain long-term memory");
  memory.focus();
  await user.keyboard(" ");

  expect(memory).toBeChecked();
  expect(
    within(memory.closest("label") as HTMLLabelElement).getByText("0"),
  ).toHaveAccessibleName("0 projects");
});
