import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  ProjectReportForm,
  type HelpProjectOption,
} from "@/features/help/components/project-report-form";

let search = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

const projects: HelpProjectOption[] = [
  {
    id: "wandlight",
    name: "Wandlight",
    creator: "Keptin",
    canonicalUrl: "https://github.com/example/wandlight",
    searchText: "wandlight continuity narration",
  },
  {
    id: "saga",
    name: "Saga",
    creator: "example.org",
    canonicalUrl: "https://example.org/saga",
    searchText: "saga lorebook creator",
  },
];

function renderProjectReport() {
  return render(<ProjectReportForm projects={projects} siteRevision="abc" />);
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  search = "";
  vi.restoreAllMocks();
});

test("preselects only an existing project from the query", () => {
  search = "project=wandlight";
  renderProjectReport();

  expect(screen.getByLabelText("Project")).toHaveValue("wandlight");
});

test("ignores an unknown project query", () => {
  search = "project=https%3A%2F%2Fevil.example%2Fnot-listed";
  renderProjectReport();

  expect(screen.getByLabelText("Project")).toHaveValue("");
});

test("shows category-specific correction guidance", async () => {
  const user = userEvent.setup();
  renderProjectReport();

  await user.selectOptions(
    screen.getByLabelText("What is wrong?"),
    "duplicate-or-wrong-listing",
  );

  expect(screen.getByText(/which listing should remain/iu)).toBeVisible();
});

test("keeps unlisted URLs out of the report payload", async () => {
  const user = userEvent.setup();
  renderProjectReport();

  fireEvent.change(screen.getByLabelText("Project"), {
    target: { value: "https://evil.example/unlisted" },
  });
  await user.selectOptions(
    screen.getByLabelText("What is wrong?"),
    "incorrect-information",
  );
  await user.type(
    screen.getByLabelText("What should Tavernary review?"),
    "The card needs correction.",
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Select a listed project.",
  );
  expect(screen.getByLabelText("Project")).toHaveAttribute("aria-describedby");
  expect(document.getElementById("project-error")).toHaveTextContent(
    "Select a listed project.",
  );
  expect(
    screen.queryByText("Review your public request"),
  ).not.toBeInTheDocument();
});

test("connects every oversized project-report value to its field", async () => {
  const user = userEvent.setup();
  search = "project=wandlight";
  renderProjectReport();

  await user.selectOptions(
    screen.getByLabelText("What is wrong?"),
    "incorrect-information",
  );
  fireEvent.change(screen.getByLabelText("What should Tavernary review?"), {
    target: { value: "r".repeat(3_001) },
  });
  fireEvent.change(screen.getByLabelText("What outcome are you requesting?"), {
    target: { value: "o".repeat(1_001) },
  });
  fireEvent.change(screen.getByLabelText("Public supporting evidence"), {
    target: { value: "e".repeat(2_001) },
  });
  await user.click(screen.getByRole("button", { name: "Review request" }));

  for (const field of [
    screen.getByLabelText("What should Tavernary review?"),
    screen.getByLabelText("What outcome are you requesting?"),
    screen.getByLabelText("Public supporting evidence"),
  ]) {
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby");
  }
});

test("links owners and Tavernary security reporters to the correct private paths", () => {
  renderProjectReport();

  expect(
    screen.getByRole("link", { name: /manage your project listing/iu }),
  ).toHaveAttribute("href", "/help/manage-project");
  expect(
    screen.getByRole("link", { name: /report it privately/iu }),
  ).toHaveAttribute("href", "/help/security");
});

test("retains project report state and regenerates the manifest after editing", async () => {
  const user = userEvent.setup();
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  search = "project=wandlight";
  renderProjectReport();

  await user.selectOptions(
    screen.getByLabelText("What is wrong?"),
    "incorrect-information",
  );
  await user.type(
    screen.getByLabelText("What should Tavernary review?"),
    "The listed frontend is outdated.",
  );
  await user.type(
    screen.getByLabelText("What outcome are you requesting?"),
    "Update the listing.",
  );
  await user.type(
    screen.getByLabelText("Public supporting evidence"),
    "https://github.com/example/wandlight/releases",
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));

  expect(
    screen.getByRole("heading", { name: "Review your public request" }),
  ).toBeVisible();
  expect(
    screen.getByText("Wandlight — https://github.com/example/wandlight"),
  ).toBeVisible();
  expect(
    screen.getByText("Incorrect or outdated card information"),
  ).toBeVisible();
  expect(screen.getByText("The listed frontend is outdated.")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  const opened = new URL(open.mock.calls[0]?.[0] as string);
  expect(opened.searchParams.get("template")).toBe(
    "02-project-information.yml",
  );
  expect(opened.searchParams.get("project")).toBe(
    "Wandlight — https://github.com/example/wandlight",
  );
  expect(opened.searchParams.get("category")).toBe(
    "Incorrect or outdated card information",
  );
  expect(JSON.parse(opened.searchParams.get("help-manifest") ?? "")).toEqual(
    expect.objectContaining({
      request_kind: "project-report",
      origin: { page_url: "/help/report-project/", site_revision: "abc" },
      payload: {
        project_id: "wandlight",
        canonical_source: "https://github.com/example/wandlight",
        category: "incorrect-information",
        report: "The listed frontend is outdated.",
        requested_outcome: "Update the listing.",
        evidence: "https://github.com/example/wandlight/releases",
      },
    }),
  );

  await user.click(
    await screen.findByRole("button", { name: "Back and edit" }),
  );
  const report = screen.getByLabelText("What should Tavernary review?");
  expect(report).toHaveValue("The listed frontend is outdated.");
  await user.clear(report);
  await user.type(report, "The project name is outdated.");
  await user.click(screen.getByRole("button", { name: "Review request" }));
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  const reopened = new URL(open.mock.calls[1]?.[0] as string);
  expect(
    JSON.parse(reopened.searchParams.get("help-manifest") ?? ""),
  ).toMatchObject({
    payload: {
      project_id: "wandlight",
      report: "The project name is outdated.",
      requested_outcome: "Update the listing.",
    },
  });
});
