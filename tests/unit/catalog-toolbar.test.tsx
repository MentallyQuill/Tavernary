import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import { DEFAULT_QUERY } from "@/features/catalog/catalog-query";
import { CatalogToolbar } from "@/features/catalog/components/catalog-toolbar";

afterEach(cleanup);

test("offers Kit creation from the Kits toolbar only", async () => {
  const user = userEvent.setup();
  const onCreateKit = vi.fn();
  const props = {
    count: 8,
    refreshedLabel: "just now",
    filterCount: 0,
    onSort: () => undefined,
    onKitSort: () => undefined,
    onDensity: () => undefined,
    onOpenFilters: () => undefined,
    onCreateKit,
  };
  const { rerender } = render(
    <CatalogToolbar {...props} query={{ ...DEFAULT_QUERY, mode: "kits" }} />,
  );

  expect(screen.getByRole("combobox", { name: "Sort Kits" })).toHaveClass(
    "control-select",
  );
  const createKit = screen.getByRole("button", { name: "Create Kit" });
  expect(createKit).toHaveClass("control-primary");
  await user.click(createKit);
  expect(onCreateKit).toHaveBeenCalledOnce();

  rerender(<CatalogToolbar {...props} query={DEFAULT_QUERY} />);
  expect(
    screen.queryByRole("button", { name: "Create Kit" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Sort projects" })).toHaveClass(
    "control-select",
  );
  expect(screen.getByRole("button", { name: "Use compact cards" })).toHaveClass(
    "control-icon",
  );
  expect(screen.getByRole("button", { name: "Open filters" })).toHaveClass(
    "control-icon",
  );
});
