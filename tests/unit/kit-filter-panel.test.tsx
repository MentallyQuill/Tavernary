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
