import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { mapKitWithdrawalOptions } from "@/app/menu/withdraw-kit/page";
import {
  KitWithdrawalForm,
  type KitWithdrawalOption,
} from "@/features/help/components/kit-withdrawal-form";
import {
  normalizeKitWithdrawalManifest,
  serializeKitWithdrawalManifest,
} from "@/features/kits/kit-withdrawal-manifest.mjs";

let search = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

const kits: KitWithdrawalOption[] = [
  {
    id: "alpha-kit",
    title: "Alpha Kit",
    author: "alpha-author",
    shareUrl: "https://tavernary.org/?mode=kits&kit=alpha-kit",
  },
  {
    id: "bravo-kit",
    title: "Bravo Kit",
    author: "bravo-author",
    shareUrl: "https://tavernary.org/?mode=kits&kit=bravo-kit",
  },
];

afterEach(cleanup);

beforeEach(() => {
  search = "";
  vi.restoreAllMocks();
});

test("normalizes and serializes the exact version-one withdrawal manifest", () => {
  const value = {
    schema_version: 1,
    request_kind: "kit-withdrawal",
    kit_id: "alpha-kit",
    confirmation: true,
  } as const;

  expect(normalizeKitWithdrawalManifest(value)).toEqual({
    valid: true,
    manifest: value,
  });
  expect(JSON.parse(serializeKitWithdrawalManifest(value))).toEqual(value);
});

test.each([
  ["arrays", []],
  [
    "extra keys",
    {
      schema_version: 1,
      request_kind: "kit-withdrawal",
      kit_id: "alpha-kit",
      confirmation: true,
      readable_kit_id: "alpha-kit",
    },
  ],
  [
    "unsupported versions",
    {
      schema_version: 2,
      request_kind: "kit-withdrawal",
      kit_id: "alpha-kit",
      confirmation: true,
    },
  ],
  [
    "wrong request kinds",
    {
      schema_version: 1,
      request_kind: "kit-report",
      kit_id: "alpha-kit",
      confirmation: true,
    },
  ],
  [
    "non-slug Kit IDs",
    {
      schema_version: 1,
      request_kind: "kit-withdrawal",
      kit_id: "Alpha Kit",
      confirmation: true,
    },
  ],
  [
    "false confirmation",
    {
      schema_version: 1,
      request_kind: "kit-withdrawal",
      kit_id: "alpha-kit",
      confirmation: false,
    },
  ],
])("rejects %s", (_name, value) => {
  expect(normalizeKitWithdrawalManifest(value)).toMatchObject({ valid: false });
});

test("maps only complete current Kit data into withdrawal choices", () => {
  expect(
    mapKitWithdrawalOptions([
      {
        id: " alpha-kit ",
        title: " Alpha Kit ",
        author: { login: " alpha-author " },
      },
      {
        id: "broken-kit",
        title: "Broken Kit",
        author: null,
      },
      {
        id: "alpha-kit",
        title: "Duplicate Kit",
        author: { login: "duplicate-author" },
      },
    ]),
  ).toEqual([kits[0]]);
});

test("preselects only a current published Kit from query context", () => {
  search = "kit=alpha-kit";
  const { unmount } = render(<KitWithdrawalForm kits={kits} />);
  expect(screen.getByLabelText("Kit")).toHaveValue("alpha-kit");
  unmount();

  search = "kit=unknown-kit";
  render(<KitWithdrawalForm kits={kits} />);
  expect(screen.getByLabelText("Kit")).toHaveValue("");
});

test("requires an explicit author withdrawal confirmation", async () => {
  const user = userEvent.setup();
  search = "kit=alpha-kit";
  render(<KitWithdrawalForm kits={kits} />);

  await user.click(screen.getByRole("button", { name: "Review request" }));

  expect(
    screen.getAllByText("Confirm that you request withdrawal of this Kit."),
  ).toHaveLength(2);
  expect(
    screen.getByRole("checkbox", {
      name: "I request withdrawal of this Kit",
    }),
  ).toHaveAttribute("aria-invalid", "true");
});

test("reviews, corrects, opens, and reopens the generated withdrawal manifest", async () => {
  const user = userEvent.setup();
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  search = "kit=alpha-kit";
  render(<KitWithdrawalForm kits={kits} />);

  await user.click(
    screen.getByRole("checkbox", {
      name: "I request withdrawal of this Kit",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));

  const review = screen.getByRole("region", {
    name: "Review your public request",
  });
  expect(review).toHaveTextContent("Alpha Kit");
  expect(review).toHaveTextContent("alpha-kit");
  expect(review).toHaveTextContent("@alpha-author");
  expect(review).toHaveTextContent("retained withdrawal tombstone");

  await user.click(screen.getByRole("button", { name: "Back and edit" }));
  expect(screen.getByLabelText("Kit")).toHaveValue("alpha-kit");
  expect(
    screen.getByRole("checkbox", {
      name: "I request withdrawal of this Kit",
    }),
  ).toBeChecked();

  await user.click(screen.getByRole("button", { name: "Review request" }));
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));
  const opened = new URL(open.mock.calls[0]?.[0] as string);
  expect(opened.searchParams.get("template")).toBe("07-kit-withdrawal.yml");
  expect(opened.searchParams.get("kit-id")).toBe("alpha-kit");
  expect(
    JSON.parse(opened.searchParams.get("withdrawal-manifest") ?? ""),
  ).toEqual({
    schema_version: 1,
    request_kind: "kit-withdrawal",
    kit_id: "alpha-kit",
    confirmation: true,
  });

  await user.click(
    screen.getByRole("button", { name: "Open GitHub review again" }),
  );
  expect(open).toHaveBeenCalledTimes(2);
});

test("recovers a blocked popup without discarding withdrawal state", async () => {
  const user = userEvent.setup();
  vi.spyOn(window, "open").mockReturnValue(null);
  search = "kit=alpha-kit";
  render(<KitWithdrawalForm kits={kits} />);

  await user.click(
    screen.getByRole("checkbox", {
      name: "I request withdrawal of this Kit",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  expect(
    await screen.findByRole("link", { name: "Open prepared GitHub review" }),
  ).toHaveAttribute("href", expect.stringContaining("withdrawal-manifest="));
  await user.click(screen.getByRole("button", { name: "Back and edit" }));
  expect(
    screen.getByRole("checkbox", {
      name: "I request withdrawal of this Kit",
    }),
  ).toBeChecked();
});
