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
    "http://example.com/frontend",
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
    screen.getByText("Other frontend URL must be a public HTTPS URL."),
  ).toBeVisible();
});
