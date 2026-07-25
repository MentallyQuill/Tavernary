import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { DualRange } from "@/components/ui/dual-range";

afterEach(cleanup);

test("renders one labelled range with minimum and maximum thumbs", () => {
  render(
    <DualRange
      label="Kit size"
      minimumLabel="Minimum projects"
      maximumLabel="Maximum projects"
      min={3}
      max={50}
      value={[8, 24]}
      onChange={vi.fn()}
    />,
  );

  expect(screen.getByRole("group", { name: "Kit size" })).toBeInTheDocument();
  expect(screen.getByRole("slider", { name: "Minimum projects" })).toHaveValue(
    "8",
  );
  expect(screen.getByRole("slider", { name: "Maximum projects" })).toHaveValue(
    "24",
  );
  expect(screen.getByText("Min 8")).toBeVisible();
  expect(screen.getByText("Max 24")).toBeVisible();
});

test("prevents either thumb from crossing the other", () => {
  const onChange = vi.fn();
  render(
    <DualRange
      label="Kit size"
      minimumLabel="Minimum projects"
      maximumLabel="Maximum projects"
      min={3}
      max={50}
      value={[8, 24]}
      onChange={onChange}
    />,
  );

  fireEvent.change(screen.getByRole("slider", { name: "Minimum projects" }), {
    target: { value: "30" },
  });
  expect(onChange).toHaveBeenLastCalledWith([24, 24]);

  fireEvent.change(screen.getByRole("slider", { name: "Maximum projects" }), {
    target: { value: "4" },
  });
  expect(onChange).toHaveBeenLastCalledWith([8, 8]);
});

test("moves a thumb five steps for Page Up and Page Down", () => {
  const onChange = vi.fn();
  render(
    <DualRange
      label="Kit size"
      minimumLabel="Minimum projects"
      maximumLabel="Maximum projects"
      min={3}
      max={50}
      value={[8, 24]}
      onChange={onChange}
    />,
  );

  const maximum = screen.getByRole("slider", { name: "Maximum projects" });
  fireEvent.keyDown(maximum, { key: "PageUp" });
  expect(onChange).toHaveBeenLastCalledWith([8, 29]);
  fireEvent.keyDown(maximum, { key: "PageDown" });
  expect(onChange).toHaveBeenLastCalledWith([8, 19]);
});

test("moves Home and End only within the other thumb", () => {
  const onChange = vi.fn();
  render(
    <DualRange
      label="Kit size"
      minimumLabel="Minimum projects"
      maximumLabel="Maximum projects"
      min={3}
      max={50}
      value={[8, 24]}
      onChange={onChange}
    />,
  );

  const minimum = screen.getByRole("slider", { name: "Minimum projects" });
  const maximum = screen.getByRole("slider", { name: "Maximum projects" });
  fireEvent.keyDown(minimum, { key: "End" });
  expect(onChange).toHaveBeenLastCalledWith([24, 24]);
  fireEvent.keyDown(maximum, { key: "Home" });
  expect(onChange).toHaveBeenLastCalledWith([8, 8]);
  fireEvent.keyDown(minimum, { key: "Home" });
  expect(onChange).toHaveBeenLastCalledWith([3, 24]);
  fireEvent.keyDown(maximum, { key: "End" });
  expect(onChange).toHaveBeenLastCalledWith([8, 50]);
});
