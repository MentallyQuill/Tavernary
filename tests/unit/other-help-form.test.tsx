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
  ).toHaveAttribute("href", "/menu/security");
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
  expect(screen.getByLabelText("Relevant URL (optional)")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByLabelText("Relevant URL (optional)")).toHaveAttribute(
    "aria-describedby",
    expect.stringContaining("other-relevant-url-error"),
  );
  expect(document.getElementById("other-relevant-url-error")).toHaveTextContent(
    "Enter a valid HTTPS relevant URL.",
  );
});

test("associates an Other Help category error with its select", async () => {
  const user = userEvent.setup();
  renderOtherHelpForm();

  await user.click(screen.getByRole("button", { name: "Review request" }));

  const category = screen.getByLabelText("What do you need help with?");
  expect(category).toHaveAttribute("aria-invalid", "true");
  expect(category).toHaveAttribute("aria-describedby", "other-category-error");
  expect(document.getElementById("other-category-error")).toHaveTextContent(
    "Choose what you need help with.",
  );
});

test("retains Other Help values and regenerates the current manifest", async () => {
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
      origin: { page_url: "/menu/other/", site_revision: "abc123" },
      payload: {
        category: "using-tavernary",
        subject: "Need help with Kits",
        description: "I need help understanding the Kit builder.",
        relevant_url: null,
      },
    }),
  );

  await user.click(
    await screen.findByRole("button", { name: "Back and edit" }),
  );
  expect(screen.getByLabelText("Description")).toHaveValue(
    "I need help understanding the Kit builder.",
  );
  await user.clear(screen.getByLabelText("Subject"));
  await user.type(screen.getByLabelText("Subject"), "Need help with tags");
  await user.click(screen.getByRole("button", { name: "Review request" }));
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  const reopened = new URL(open.mock.calls[1]?.[0] as string);
  expect(
    JSON.parse(reopened.searchParams.get("help-manifest") ?? ""),
  ).toMatchObject({
    payload: {
      category: "using-tavernary",
      subject: "Need help with tags",
      description: "I need help understanding the Kit builder.",
    },
  });
});

test("keeps Other Help review visible when the popup is blocked", async () => {
  const user = userEvent.setup();
  vi.spyOn(window, "open").mockReturnValue(null);
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

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "GitHub review could not be opened.",
  );
  expect(screen.getByText("Need help with Kits")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Open prepared GitHub review" }),
  ).toHaveAttribute("href", expect.stringContaining("help-manifest="));
});
