import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test } from "vitest";

import RootLayout from "@/app/layout";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-color-mode");
});

test("emits the saved-color bootstrap in the head before page content", () => {
  localStorage.setItem("tavernary:color-mode", "accessible");
  const markup = renderToStaticMarkup(
    <RootLayout>
      <p>Catalog content</p>
    </RootLayout>,
  );
  const emitted = new DOMParser().parseFromString(markup, "text/html");
  const bootstrap = emitted.head.querySelector("script");
  expect(bootstrap).not.toBeNull();
  window.eval(bootstrap!.textContent!);
  expect(document.documentElement).toHaveAttribute(
    "data-color-mode",
    "accessible",
  );
  expect(emitted.body.textContent).toContain("Catalog content");
});
