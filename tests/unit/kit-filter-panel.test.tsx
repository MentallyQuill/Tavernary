import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { KitFilterPanel } from "@/features/kits/components/kit-filter-panel";
import { DEFAULT_KIT_QUERY } from "@/features/kits/kit-query";

afterEach(cleanup);

describe("KitFilterPanel", () => {
  test("uses the shared quiet treatment for clearing filters", () => {
    render(
      <KitFilterPanel
        query={DEFAULT_KIT_QUERY}
        kits={[]}
        projects={[]}
        onChange={() => undefined}
        onClear={() => undefined}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Clear Kit filters" }),
    ).toHaveClass("control-quiet");
  });

  test("renders Kit size as one dual-thumb range without number fields", () => {
    const { container } = render(
      <KitFilterPanel
        query={{ ...DEFAULT_KIT_QUERY, minProjects: 8, maxProjects: 24 }}
        kits={[]}
        projects={[]}
        onChange={() => undefined}
        onClear={() => undefined}
      />,
    );

    expect(screen.getByRole("group", { name: "Kit size" })).toHaveClass(
      "dual-range",
    );
    expect(screen.getAllByRole("slider")).toHaveLength(2);
    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(0);
    expect(screen.getByText("Min 8")).toBeVisible();
    expect(screen.getByText("Max 24")).toBeVisible();
  });

  test("renders mobile Kit filters as a visible modal sheet", () => {
    render(
      <KitFilterPanel
        query={DEFAULT_KIT_QUERY}
        kits={[]}
        projects={[]}
        onChange={() => undefined}
        onClear={() => undefined}
        mobile
        onClose={() => undefined}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Kit filters" });
    expect(dialog).toBeVisible();
    expect(dialog).toHaveClass("filter-sheet");
    expect(dialog).not.toHaveClass("filter-panel");
    expect(
      screen.getByRole("button", { name: "Close Kit filters" }),
    ).toBeVisible();
    expect(screen.getByRole("group", { name: "Frontends" })).toBeVisible();
  });
});
