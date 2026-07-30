import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";

import {
  SubmissionReview,
  type SubmissionReviewProps,
} from "@/features/submissions/components/submission-review";
import { GitHubHandoffError } from "@/features/submissions/github-handoff";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function props(
  overrides: Partial<SubmissionReviewProps> = {},
): SubmissionReviewProps {
  return {
    rows: [{ label: "Project Type", value: "Extension" }],
    returnFocusId: "project-type",
    onBack: vi.fn(),
    onCancel: vi.fn(),
    openReview: vi.fn().mockResolvedValue({
      mode: "prefilled",
      url: "https://github.com/example/review",
    }),
    ...overrides,
  };
}

test("announces opening before showing persistent opened actions", async () => {
  const user = userEvent.setup();
  let finish: ((value: { mode: "prefilled"; url: string }) => void) | undefined;
  const openReview = () =>
    new Promise<{ mode: "prefilled"; url: string }>((resolve) => {
      finish = resolve;
    });

  render(<SubmissionReview {...props({ openReview })} />);
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  expect(screen.getByRole("status")).toHaveTextContent(
    "Taking you to GitHub...",
  );
  expect(
    screen.getByRole("button", { name: "Taking you to GitHub..." }),
  ).toBeDisabled();

  finish?.({
    mode: "prefilled",
    url: "https://github.com/example/review",
  });
  expect(
    await screen.findByText(
      "GitHub review opened in a new tab. Create the issue there, or return here to make changes.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Open GitHub review again" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Cancel" }),
  ).not.toBeInTheDocument();
});

test("regenerates on reopen and announces clipboard recovery from the new result", async () => {
  const user = userEvent.setup();
  const results = [
    {
      mode: "prefilled" as const,
      url: "https://github.com/example/first",
    },
    {
      mode: "clipboard" as const,
      url: "https://github.com/example/second",
    },
  ];
  const openReview = vi.fn(async () => {
    const result = results.shift();
    if (!result) throw new Error("Unexpected extra open");
    return result;
  });

  render(<SubmissionReview {...props({ openReview })} />);
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));
  await user.click(
    await screen.findByRole("button", {
      name: "Open GitHub review again",
    }),
  );

  expect(
    await screen.findByText(
      "GitHub review opened in a new tab. Tavernary copied or displayed the complete manifest for you to paste unchanged.",
    ),
  ).toBeInTheDocument();
  expect(openReview).toHaveBeenCalledTimes(2);
});

test("keeps review rows visible and exposes the prepared URL after a blocked popup", async () => {
  const user = userEvent.setup();
  const preparedUrl = "https://github.com/example/prepared";

  render(
    <SubmissionReview
      {...props({
        openReview: async () => {
          throw new GitHubHandoffError(
            "GitHub review could not be opened.",
            preparedUrl,
          );
        },
      })}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "GitHub review could not be opened.",
  );
  expect(screen.getByText("Extension")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Open prepared GitHub review" }),
  ).toHaveAttribute("href", preparedUrl);
});

test("keeps recovery non-destructive when no safe URL exists", async () => {
  const user = userEvent.setup();

  render(
    <SubmissionReview
      {...props({
        openReview: async () => {
          throw new GitHubHandoffError(
            "GitHub review URL exceeds the safe handoff limit.",
            null,
          );
        },
      })}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "GitHub review URL exceeds the safe handoff limit.",
  );
  expect(
    screen.queryByRole("link", { name: "Open prepared GitHub review" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Back and edit" }),
  ).toBeInTheDocument();
});

test("returns focus to the authoritative field after Back and edit", async () => {
  const user = userEvent.setup();

  function Harness() {
    const [reviewing, setReviewing] = useState(true);
    return reviewing ? (
      <SubmissionReview
        {...props({
          onBack: () => setReviewing(false),
          onCancel: () => setReviewing(false),
        })}
      />
    ) : (
      <label>
        Project Type
        <select id="project-type">
          <option>Extension</option>
        </select>
      </label>
    );
  }

  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Back and edit" }));

  await waitFor(() =>
    expect(screen.getByLabelText("Project Type")).toHaveFocus(),
  );
});

test("returns focus to the authoritative field after Cancel", async () => {
  const user = userEvent.setup();

  function Harness() {
    const [reviewing, setReviewing] = useState(true);
    return reviewing ? (
      <SubmissionReview
        {...props({
          onBack: () => setReviewing(false),
          onCancel: () => setReviewing(false),
        })}
      />
    ) : (
      <label>
        Project Type
        <select id="project-type">
          <option>Extension</option>
        </select>
      </label>
    );
  }

  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Cancel" }));

  await waitFor(() =>
    expect(screen.getByLabelText("Project Type")).toHaveFocus(),
  );
});
