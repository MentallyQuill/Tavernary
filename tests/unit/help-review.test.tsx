import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { HelpReview } from "@/features/help/components/help-review";

afterEach(cleanup);

test("returns focus to the declared form field after Back and edit", async () => {
  const user = userEvent.setup();

  function Harness() {
    const [reviewing, setReviewing] = useState(true);

    return reviewing ? (
      <HelpReview
        rows={[]}
        returnFocusId="subject"
        onBack={() => setReviewing(false)}
        onCancel={() => setReviewing(false)}
        openReview={vi.fn().mockResolvedValue({
          mode: "prefilled",
          url: "https://github.com/example/review",
        })}
      />
    ) : (
      <label>
        Subject
        <input id="subject" />
      </label>
    );
  }

  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Back and edit" }));

  await waitFor(() => expect(screen.getByLabelText("Subject")).toHaveFocus());
});

test("returns focus to the declared form field after Cancel", async () => {
  const user = userEvent.setup();

  function Harness() {
    const [reviewing, setReviewing] = useState(true);

    return reviewing ? (
      <HelpReview
        rows={[]}
        returnFocusId="subject"
        onBack={() => setReviewing(false)}
        onCancel={() => setReviewing(false)}
        openReview={vi.fn().mockResolvedValue({
          mode: "prefilled",
          url: "https://github.com/example/review",
        })}
      />
    ) : (
      <label>
        Subject
        <input id="subject" />
      </label>
    );
  }

  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Cancel" }));

  await waitFor(() => expect(screen.getByLabelText("Subject")).toHaveFocus());
});

test("keeps the public-data warning around shared handoff feedback", async () => {
  const user = userEvent.setup();

  render(
    <HelpReview
      rows={[{ label: "Subject", value: "Public request" }]}
      returnFocusId="subject"
      onBack={vi.fn()}
      onCancel={vi.fn()}
      openReview={vi.fn().mockResolvedValue({
        mode: "prefilled",
        url: "https://github.com/example/review",
      })}
    />,
  );

  expect(
    screen.getByText(/These details will be public on GitHub/),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));
  expect(
    await screen.findByText(/GitHub review opened in a new tab/),
  ).toBeInTheDocument();
});
