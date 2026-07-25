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

  await user.click(screen.getByRole("button", { name: "Create Kit" }));
  expect(onCreateKit).toHaveBeenCalledOnce();

  rerender(<CatalogToolbar {...props} query={DEFAULT_QUERY} />);
  expect(
    screen.queryByRole("button", { name: "Create Kit" }),
  ).not.toBeInTheDocument();
});
