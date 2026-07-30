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
  counts = Object.fromEntries(tags.map((tag, index) => [tag.id, index])),
}: {
  tags?: PublicTagDefinition[];
  initialSelected?: string[];
  maxSelections?: number;
  counts?: Readonly<Record<string, number>>;
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
      previewLimit={2}
      maxSelections={maxSelections}
      counts={counts}
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
  expect(searchTags(coreTags, "local first")[0]?.id).toBe("local-first");
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

test("prevents a seventh selection until a selected tag is removed", async () => {
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
  const goals = screen.getByRole("group", { name: "Goals" });
  await user.click(
    within(goals).getByRole("button", { name: /Show \d+ more/u }),
  );
  expect(screen.getByLabelText("Generate images")).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "Remove Goal 5" }));
  expect(screen.getByText("5 / 6 selected")).toBeVisible();
  expect(screen.getByLabelText("Generate images")).toBeEnabled();
});

test("ranks facet previews and derives disclosure counts", () => {
  render(
    <Harness
      tags={coreTags}
      counts={{
        "maintain-long-term-memory": 2,
        "generate-images": 9,
        "local-first": 4,
        "goal-1": 9,
      }}
    />,
  );

  const goals = screen.getByRole("group", { name: "Goals" });
  expect(
    within(goals)
      .getAllByRole("checkbox")
      .map((input) => input.getAttribute("aria-label")),
  ).toEqual(["Generate images", "Goal 1"]);
  expect(
    within(goals).getByRole("button", { name: "Show 5 more" }),
  ).toHaveAttribute("aria-expanded", "false");
});

test("expands Goals and Traits independently", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  const goals = screen.getByRole("group", { name: "Goals" });
  const traits = screen.getByRole("group", { name: "Traits" });
  const initialTraitCount = within(traits).getAllByRole("checkbox").length;

  await user.click(
    within(goals).getByRole("button", { name: /Show \d+ more/u }),
  );
  expect(
    within(goals).getByRole("button", { name: "Show fewer" }),
  ).toHaveAttribute("aria-expanded", "true");
  expect(within(traits).getAllByRole("checkbox")).toHaveLength(
    initialTraitCount,
  );
});

test("keeps selected tags removable outside the collapsed preview", async () => {
  const user = userEvent.setup();
  render(
    <Harness
      tags={coreTags}
      initialSelected={["maintain-long-term-memory"]}
      counts={{ "maintain-long-term-memory": 0, "generate-images": 10 }}
    />,
  );

  const remove = screen.getByRole("button", {
    name: "Remove Maintain long-term memory",
  });
  expect(remove).toBeVisible();
  await user.click(remove);
  expect(
    screen.queryByRole("button", {
      name: "Remove Maintain long-term memory",
    }),
  ).toBeNull();
});

test("searches all metadata without clearing selections or expansion", async () => {
  const user = userEvent.setup();
  render(<Harness tags={coreTags} initialSelected={["local-first"]} />);

  const goals = screen.getByRole("group", { name: "Goals" });
  await user.click(
    within(goals).getByRole("button", { name: /Show \d+ more/u }),
  );
  const search = screen.getByRole("searchbox", {
    name: "Search goals and traits",
  });
  await user.type(search, "persistent context");

  expect(screen.getByLabelText("Maintain long-term memory")).toBeVisible();
  expect(screen.queryByLabelText("Generate images")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Remove Local-first" }),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: /Show/u })).toBeNull();

  await user.clear(search);
  expect(
    within(screen.getByRole("group", { name: "Goals" })).getByRole("button", {
      name: "Show fewer",
    }),
  ).toBeVisible();
});

test("uses an unbounded facet layout and omits empty searched facets", async () => {
  const user = userEvent.setup();
  render(<Harness tags={coreTags} />);

  await user.type(
    screen.getByRole("searchbox", { name: "Search goals and traits" }),
    "persistent context",
  );

  expect(screen.queryByTestId("tag-results")).toBeNull();
  expect(screen.getByRole("group", { name: "Goals" })).toBeVisible();
  expect(screen.queryByRole("group", { name: "Traits" })).toBeNull();
});

test("allows keyboard selection and announces per-tag counts", async () => {
  const user = userEvent.setup();
  render(
    <Harness tags={coreTags} counts={{ "maintain-long-term-memory": 100 }} />,
  );

  const memory = screen.getByLabelText("Maintain long-term memory");
  expect(memory.closest("label")).toHaveClass(
    "filter-choice",
    "tag-browser-option",
  );
  memory.focus();
  await user.keyboard(" ");

  expect(memory).toBeChecked();
  expect(
    within(memory.closest("label") as HTMLLabelElement).getByText("100"),
  ).toHaveAccessibleName("100 projects");
});
