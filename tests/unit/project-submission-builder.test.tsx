import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import { ProjectSubmissionBuilder } from "@/features/submissions/components/project-submission-builder";

const { openProjectSubmission } = vi.hoisted(() => ({
  openProjectSubmission: vi.fn().mockResolvedValue("prefilled"),
}));

vi.mock("@/features/submissions/submission-transport", () => ({
  openProjectSubmission,
}));

const frontends = [
  {
    id: "sillytavern",
    label: "SillyTavern",
    canonicalUrl: "https://github.com/SillyTavern/SillyTavern",
  },
  {
    id: "lumiverse",
    label: "Lumiverse",
    canonicalUrl: "https://github.com/prolix-oc/Lumiverse",
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("requires supported frontends only for Extensions", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "extension");

  expect(
    screen.getByRole("combobox", { name: "Search supported frontends" }),
  ).toBeVisible();
  expect(
    screen.queryByLabelText("Frontend-independent"),
  ).not.toBeInTheDocument();
  expect(screen.getByText("0 selected")).toBeVisible();
  expect(screen.getByLabelText("SillyTavern")).not.toBeChecked();

  await user.click(screen.getByLabelText("Other or not listed"));
  expect(
    screen.getByText(
      "This project will stay blocked until the missing frontend is submitted, reviewed, and merged.",
    ),
  ).toBeVisible();
});

test("allows a System Preset to be frontend-independent", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "preset");
  await user.click(screen.getByLabelText("Frontend-independent"));

  expect(screen.getByText("No frontend selection required.")).toBeVisible();
});

test("submits multiple current frontend identities in the manifest", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "extension");
  await user.type(
    screen.getByLabelText("Project URL"),
    "https://github.com/example/extension",
  );
  await user.click(screen.getByLabelText("SillyTavern"));
  await user.click(screen.getByLabelText("Lumiverse"));
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  expect(openProjectSubmission).toHaveBeenCalledWith(
    "https://github.com/MentallyQuill/Tavernary/issues/new",
    expect.objectContaining({
      schema_version: 1,
      project_type: "extension",
      source_url: "https://github.com/example/extension",
      frontends: {
        known_ids: ["sillytavern", "lumiverse"],
        other: [],
      },
      frontend_independent: false,
    }),
  );
});

test("exposes a successful GitHub handoff as a success status", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.type(
    screen.getByLabelText("Project URL"),
    "https://github.com/example/frontend",
  );
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  const status = await screen.findByRole("status");
  expect(status).toHaveTextContent("GitHub opened with your submission.");
  expect(status).toHaveAttribute("data-status", "success");
});

test("exposes a failed GitHub handoff as an error alert", async () => {
  openProjectSubmission.mockRejectedValueOnce(new Error("popup failed"));
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.type(
    screen.getByLabelText("Project URL"),
    "https://github.com/example/frontend",
  );
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  const status = await screen.findByRole("alert");
  expect(status).toHaveTextContent(
    "Tavernary could not open GitHub. Please try again.",
  );
  expect(status).toHaveAttribute("data-status", "error");
});

test("blocks a non-HTTPS Frontend source before GitHub handoff", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.type(
    screen.getByLabelText("Project URL"),
    "http://github.com/example/frontend",
  );
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  expect(openProjectSubmission).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Project URL")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(
    screen.getByText("Project URL must be a public HTTPS URL."),
  ).toBeVisible();
});

test("associates an invalid not-listed frontend URL with its field", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "extension");
  await user.type(
    screen.getByLabelText("Project URL"),
    "https://github.com/example/extension",
  );
  await user.click(screen.getByLabelText("Other or not listed"));
  await user.type(screen.getByLabelText("Other frontend name"), "New UI");
  await user.type(
    screen.getByLabelText("Other frontend URL"),
    "https://example.com/frontend",
  );
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  const otherUrl = screen.getByLabelText("Other frontend URL");
  expect(openProjectSubmission).not.toHaveBeenCalled();
  expect(otherUrl).toHaveAttribute("aria-invalid", "true");
  expect(otherUrl).toHaveAttribute(
    "aria-describedby",
    "other-frontend-url-error",
  );
  expect(
    screen.getByText(
      "Other frontend URL must be an exact public GitHub owner/repository URL.",
    ),
  ).toBeVisible();
});
