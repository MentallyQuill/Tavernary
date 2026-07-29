import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";

import {
  DescribedSelect,
  type DescribedSelectOption,
} from "@/components/forms/described-select";

const options: DescribedSelectOption[] = [
  {
    id: "memory-retrieval",
    label: "Memory and retrieval",
    description: "Stores and retrieves conversational knowledge.",
  },
  {
    id: "generation-reasoning",
    label: "Generation and reasoning",
    description: "Changes how model output is reasoned.",
  },
  {
    id: "interface-workflow",
    label: "Interface and workflow",
    description: "Improves user-facing interaction.",
  },
];

function Harness({ error }: { error?: string }) {
  const [value, setValue] = useState("");
  return (
    <DescribedSelect
      id="primary-function"
      label="Primary function"
      value={value}
      placeholder="Select a primary function"
      options={options}
      onChange={setValue}
      required
      invalid={Boolean(error)}
      error={error}
    />
  );
}

afterEach(cleanup);

test("keeps descriptions inside the open menu and selects the option ID", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  const trigger = screen.getByLabelText("Primary function");
  expect(trigger).toHaveTextContent("Select a primary function");
  expect(
    screen.queryByText("Stores and retrieves conversational knowledge."),
  ).not.toBeInTheDocument();

  await user.click(trigger);

  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getAllByRole("option")).toHaveLength(3);
  expect(
    screen.getByText("Stores and retrieves conversational knowledge."),
  ).toBeVisible();

  await user.click(
    screen.getByRole("option", { name: /Generation and reasoning/u }),
  );

  expect(trigger).toHaveTextContent("Generation and reasoning");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("supports listbox keyboard navigation and restores trigger focus", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  const trigger = screen.getByLabelText("Primary function");
  trigger.focus();
  await user.keyboard("{Enter}");

  const listbox = screen.getByRole("listbox");
  expect(listbox).toHaveFocus();
  expect(listbox.getAttribute("aria-activedescendant")).toContain(
    "memory-retrieval",
  );

  await user.keyboard("{ArrowDown}{End}{Home}{ArrowDown}{Enter}");
  expect(trigger).toHaveTextContent("Generation and reasoning");
  expect(trigger).toHaveFocus();

  await user.keyboard(" ");
  expect(screen.getByRole("listbox")).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test("dismisses outside interaction and exposes required error semantics", async () => {
  const user = userEvent.setup();
  render(<Harness error="Choose a primary function." />);

  const trigger = screen.getByLabelText("Primary function");
  expect(trigger).toHaveAttribute("aria-required", "true");
  expect(trigger).toHaveAttribute("aria-invalid", "true");
  expect(trigger).toHaveAccessibleDescription("Choose a primary function.");

  await user.click(trigger);
  await user.click(document.body);
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});
