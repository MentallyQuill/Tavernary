import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { OtherHelpForm } from "@/features/help/components/other-help-form";

function renderOtherHelpForm() {
  return render(<OtherHelpForm siteRevision="abc123" />);
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.restoreAllMocks();
});

test("routes specific requests before showing the other-help form", () => {
  renderOtherHelpForm();

  expect(
    screen.getByRole("link", { name: /submit a new project/i }),
  ).toHaveAttribute("href", "/submit/project");
  expect(
    screen.getByRole("link", { name: /create or manage a kit/i }),
  ).toHaveAttribute("href", "/?mode=kits");
  expect(
    screen.getByRole("link", { name: /find the project in the catalog/i }),
  ).toHaveAttribute("href", "/");
  expect(
    screen.getByRole("link", { name: /report it privately/i }),
  ).toHaveAttribute("href", "/help/security");
});

test("keeps an existing request link optional while clarifying its purpose", async () => {
  const user = userEvent.setup();
  renderOtherHelpForm();

  await user.selectOptions(
    screen.getByLabelText("What do you need help with?"),
    "existing-request",
  );

  expect(
    screen.getByLabelText("GitHub issue or pull request (optional)"),
  ).toBeVisible();
});

test("rejects a non-HTTPS relevant URL before public handoff", async () => {
  const user = userEvent.setup();
  renderOtherHelpForm();

  await user.selectOptions(
    screen.getByLabelText("What do you need help with?"),
    "using-tavernary",
  );
  await user.type(screen.getByLabelText("Subject"), "Need help with Kits");
  await user.type(
    screen.getByLabelText("Description"),
    "I need help understanding the Kit builder.",
  );
  await user.type(
    screen.getByLabelText("Relevant URL (optional)"),
    "http://example.com/request",
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Enter a valid HTTPS relevant URL.",
  );
});

test("reviews public values and hands off Other Help through the manifest", async () => {
  const user = userEvent.setup();
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  renderOtherHelpForm();

  await user.selectOptions(
    screen.getByLabelText("What do you need help with?"),
    "using-tavernary",
  );
  await user.type(screen.getByLabelText("Subject"), "Need help with Kits");
  await user.type(
    screen.getByLabelText("Description"),
    "I need help understanding the Kit builder.",
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  const opened = new URL(open.mock.calls[0]?.[0] as string);
  expect(opened.searchParams.get("template")).toBe("04-other.yml");
  expect(opened.searchParams.get("category")).toBe("Using Tavernary");
  expect(JSON.parse(opened.searchParams.get("help-manifest") ?? "")).toEqual(
    expect.objectContaining({
      request_kind: "other-help",
      origin: { page_url: "/help/other/", site_revision: "abc123" },
      payload: {
        category: "using-tavernary",
        subject: "Need help with Kits",
        description: "I need help understanding the Kit builder.",
        relevant_url: null,
      },
    }),
  );
});
