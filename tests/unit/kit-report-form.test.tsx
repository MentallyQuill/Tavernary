import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  KitReportForm,
  type HelpKitOption,
} from "@/features/help/components/kit-report-form";
import { mapHelpKitOptions } from "@/app/help/report-kit/page";

let search = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

const kits: HelpKitOption[] = [
  {
    id: "alpha-kit",
    title: "Alpha Kit",
    author: "alpha-author",
    shareUrl: "https://tavernary.org/?mode=kits&kit=alpha-kit",
    publishedAt: "2026-07-01T00:00:00.000Z",
    projects: [
      { id: "extension-alpha", name: "Extension Alpha" },
      { id: "extension-beta", name: "Extension Beta" },
    ],
  },
  {
    id: "bravo-kit",
    title: "Bravo Kit",
    author: "bravo-author",
    shareUrl: "https://tavernary.org/?mode=kits&kit=bravo-kit",
    publishedAt: "2026-07-02T00:00:00.000Z",
    projects: [{ id: "unrelated-project", name: "Unrelated Project" }],
  },
];

function renderKitReport() {
  return render(<KitReportForm kits={kits} siteRevision="abc123" />);
}

afterEach(cleanup);

beforeEach(() => {
  search = "";
  vi.restoreAllMocks();
});

test("maps only complete published Kit data into report options", () => {
  expect(
    mapHelpKitOptions([
      {
        id: "alpha-kit",
        title: " Alpha Kit ",
        author: { login: " alpha-author " },
        publishedAt: " 2026-07-01T00:00:00.000Z ",
        components: [
          { projectId: "extension-alpha", name: " Extension Alpha " },
          { projectId: "extension-alpha", name: "Duplicate" },
        ],
      },
      {
        id: "broken-kit",
        title: "Broken Kit",
        author: null,
        publishedAt: "2026-07-01T00:00:00.000Z",
        components: [],
      },
    ]),
  ).toEqual([
    {
      id: "alpha-kit",
      title: "Alpha Kit",
      author: "alpha-author",
      shareUrl: "https://tavernary.org/?mode=kits&kit=alpha-kit",
      publishedAt: "2026-07-01T00:00:00.000Z",
      projects: [{ id: "extension-alpha", name: "Extension Alpha" }],
    },
  ]);
});

test("preselects a published Kit from a valid query", () => {
  search = "kit=alpha-kit";
  renderKitReport();

  expect(screen.getByLabelText("Kit")).toHaveValue("alpha-kit");
});

test("does not trust an unknown Kit query", () => {
  search = "kit=unpublished-kit";
  renderKitReport();

  expect(screen.getByLabelText("Kit")).toHaveValue("");
});

test("renders published Kit choices with a real em dash", () => {
  renderKitReport();

  expect(
    screen.getByRole("option", { name: "Alpha Kit — @alpha-author" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Kit")).not.toHaveTextContent("â");
});

test("limits affected projects to the selected Kit", async () => {
  const user = userEvent.setup();
  search = "kit=alpha-kit";
  renderKitReport();

  await user.selectOptions(
    screen.getByLabelText("What is wrong?"),
    "compatibility-problem",
  );

  expect(screen.getByLabelText("Extension Alpha")).toBeVisible();
  expect(screen.queryByLabelText("Unrelated Project")).not.toBeInTheDocument();
  const affectedProjects = screen.getByRole("group", {
    name: "Affected Kit projects",
  });
  expect(affectedProjects).toHaveClass("help-choice-group");
  expect(affectedProjects).toHaveAttribute("aria-describedby");
});

test("asks for another published Kit when reporting a duplicate", async () => {
  const user = userEvent.setup();
  search = "kit=alpha-kit";
  renderKitReport();

  await user.selectOptions(
    screen.getByLabelText("What is wrong?"),
    "duplicate-kit",
  );

  const otherKit = screen.getByLabelText("Other Kit");
  expect(otherKit).toBeVisible();
  expect(
    within(otherKit).getByRole("option", { name: /Bravo Kit/ }),
  ).toBeVisible();
  expect(
    within(otherKit).queryByRole("option", { name: /Alpha Kit/ }),
  ).not.toBeInTheDocument();
});

test("routes unsafe underlying-project concerns to project reporting", async () => {
  const user = userEvent.setup();
  search = "kit=alpha-kit";
  renderKitReport();

  await user.selectOptions(
    screen.getByLabelText("What is wrong?"),
    "unsafe-or-malicious-included-project",
  );

  expect(
    screen.getByRole("link", { name: "Report the project listing instead" }),
  ).toHaveAttribute("href", "/help/report-project");
});

test("keeps author editing and withdrawal guidance in existing Kit surfaces", () => {
  renderKitReport();

  expect(
    screen.getByRole("link", { name: "Edit the Kit in the Kit Builder" }),
  ).toHaveAttribute("href", "/?mode=kits");
  expect(
    screen.getByRole("link", {
      name: "use the existing author withdrawal action",
    }),
  ).toHaveAttribute("href", "/?mode=kits");
});

test("connects required Kit choices to their inline errors", async () => {
  const user = userEvent.setup();
  renderKitReport();

  await user.click(screen.getByRole("button", { name: "Review request" }));

  expect(screen.getByLabelText("Kit")).toHaveAttribute("aria-describedby");
  expect(screen.getByLabelText("What is wrong?")).toHaveAttribute(
    "aria-describedby",
  );
  expect(document.getElementById("kit-error")).toHaveTextContent(
    "Select a published Kit.",
  );
  expect(document.getElementById("kit-category-error")).toHaveTextContent(
    "Choose what is wrong.",
  );
});

test("reviews a constrained Kit report without moderation side effects", async () => {
  const user = userEvent.setup();
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  search = "kit=alpha-kit";
  renderKitReport();

  await user.selectOptions(
    screen.getByLabelText("What is wrong?"),
    "compatibility-problem",
  );
  await user.click(screen.getByLabelText("Extension Alpha"));
  await user.type(
    screen.getByLabelText("What should Tavernary review?"),
    "This Kit fails after the extension loads.",
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));

  const review = screen.getByRole("region", {
    name: "Review your public request",
  });
  expect(review).toHaveTextContent("Extension Alpha");
  expect(review).not.toHaveTextContent(/reactions|trending|penalt/i);

  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));
  const opened = new URL(open.mock.calls[0]?.[0] as string);
  expect(opened.searchParams.get("template")).toBe("06-kit-report.yml");
  expect(
    JSON.parse(opened.searchParams.get("help-manifest") ?? ""),
  ).toMatchObject({
    request_kind: "kit-report",
    origin: { page_url: "/help/report-kit/", site_revision: "abc123" },
    payload: {
      kit_id: "alpha-kit",
      affected_project_ids: ["extension-alpha"],
      category: "compatibility-problem",
    },
  });
});
