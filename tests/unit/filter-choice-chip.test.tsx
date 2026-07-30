import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import { FilterChoiceChip } from "@/features/catalog/components/filter-choice-chip";

afterEach(cleanup);

test("renders controlled checkbox semantics and announces the count", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <FilterChoiceChip
      label="Claude"
      count={6}
      checked={false}
      onChange={onChange}
    />,
  );

  const input = screen.getByRole("checkbox", { name: "Claude" });
  expect(input).not.toBeChecked();
  expect(screen.getByText("6")).toHaveAccessibleName("6 projects");
  await user.click(input);
  expect(onChange).toHaveBeenCalledTimes(1);
});

test("exposes selected, disabled, radio, and title state", () => {
  const { container } = render(
    <FilterChoiceChip
      type="radio"
      name="Model family"
      label="GLM"
      checked
      disabled
      title="GLM-compatible projects"
      onChange={() => undefined}
    />,
  );

  expect(screen.getByRole("radio", { name: "GLM" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "GLM" })).toBeDisabled();
  expect(container.querySelector(".filter-choice")).toHaveClass(
    "selected",
    "disabled",
  );
  expect(container.querySelector(".filter-choice")).toHaveAttribute(
    "title",
    "GLM-compatible projects",
  );
});
