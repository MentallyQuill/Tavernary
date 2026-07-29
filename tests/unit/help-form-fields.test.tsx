import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import {
  HelpChoiceGroup,
  HelpSelectField,
} from "@/features/help/components/help-form-fields";

afterEach(cleanup);

test("associates a Help select with both its hint and inline error", () => {
  render(
    <HelpSelectField
      id="example-select"
      label="Example"
      hint="Choose the closest match."
      error="Choose one option."
      value=""
      onChange={() => undefined}
    >
      <option value="">Choose one</option>
    </HelpSelectField>,
  );

  const select = screen.getByLabelText("Example");
  const describedBy = select.getAttribute("aria-describedby")?.split(" ") ?? [];

  expect(select).toHaveAttribute("aria-invalid", "true");
  expect(describedBy).toHaveLength(2);
  expect(describedBy).toContain(
    screen.getByText("Choose the closest match.").id,
  );
  expect(describedBy).toContain(screen.getByText("Choose one option.").id);
});

test("associates a Help choice group with both its hint and inline error", () => {
  render(
    <HelpChoiceGroup
      legend="Choices"
      hint="Choose every match."
      error="Choose at least one option."
    >
      <label>
        <input type="checkbox" /> Alpha
      </label>
    </HelpChoiceGroup>,
  );

  const group = screen.getByRole("group", { name: "Choices" });
  const describedBy = group.getAttribute("aria-describedby")?.split(" ") ?? [];

  expect(group).toHaveAttribute("aria-invalid", "true");
  expect(describedBy).toHaveLength(2);
  expect(describedBy).toContain(screen.getByText("Choose every match.").id);
  expect(describedBy).toContain(
    screen.getByText("Choose at least one option.").id,
  );
});
