import { afterEach, expect, test, vi } from "vitest";
import {
  confirmDeployment,
  pollDeploymentConfirmation,
  deploymentSiteOrigin,
  confirmPublicDeployment,
  createPublicAssetReader,
} from "../../scripts/automation/confirm-deployment.mjs";
import { confirmationFixture } from "../helpers/confirmation-fixtures";
afterEach(() => vi.useRealTimers());

test("public manifest discovery cannot read assets before an expected manifest is verified", async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}"));
  const read = createPublicAssetReader({ fetchImpl });
  await expect(read("index.html")).rejects.toThrow("path");
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(Array.from(await read("revision.json"))).toEqual([123, 125]);
  expect(new URL(String(fetchImpl.mock.calls[0][0])).origin).toBe(
    "https://tavernary.org",
  );
});

test("the native public checker verifies bounded actual response bytes at the fixed origin", async () => {
  const fixture = confirmationFixture(),
    urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    urls.push(url.href);
    return new Response(
      url.pathname === "/revision.json"
        ? JSON.stringify(fixture.publicManifest)
        : new TextDecoder().decode(fixture.content[url.pathname.slice(1)]),
    );
  };
  expect(
    await confirmPublicDeployment({
      expected: fixture.input.expected,
      fetchImpl,
      browserSmoke: fixture.input.browserSmoke,
      maxAttempts: 1,
    }),
  ).toHaveProperty("status", "confirmed");
  expect(urls).toHaveLength(7);
  expect(
    urls.every((url) => new URL(url).origin === "https://tavernary.org"),
  ).toBe(true);
});
test("native transport TypeError remains pending rather than being classified as artifact corruption", async () => {
  const fixture = confirmationFixture();
  expect(
    await confirmDeployment({
      ...fixture.input,
      fetchCatalog: async () => {
        throw new TypeError("fetch failed");
      },
    }),
  ).toMatchObject({ status: "waiting", reason: "public-unavailable" });
});
test("a stuck browser cannot outlive the global public-confirmation deadline", async () => {
  vi.useFakeTimers();
  const fixture = confirmationFixture();
  let smokeStarted = false,
    settled = false;
  const promise = confirmPublicDeployment({
    expected: fixture.input.expected,
    maxAttempts: 1,
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      return new Response(
        url.pathname === "/revision.json"
          ? JSON.stringify(fixture.publicManifest)
          : new TextDecoder().decode(fixture.content[url.pathname.slice(1)]),
      );
    },
    browserSmoke: async () => {
      smokeStarted = true;
      return new Promise<boolean>(() => {});
    },
  });
  void promise.then(() => {
    settled = true;
  });
  await vi.waitFor(() => expect(smokeStarted).toBe(true));
  await vi.advanceTimersByTimeAsync(240001);
  expect(settled).toBe(true);
  expect(await promise).toMatchObject({
    status: "waiting",
    reason: "public-unavailable",
  });
});

test("Pages success with the wrong revision remains unconfirmed", async () => {
  const fixture = confirmationFixture({ wrongRevision: true });
  expect(await confirmDeployment(fixture.input)).toMatchObject({
    status: "waiting",
    reason: "different-revision",
  });
  expect(fixture.smokeCalls()).toBe(0);
});
test("matching live bytes and essential browser behavior produce durable exact-source proof", async () => {
  const fixture = confirmationFixture();
  const result = await confirmDeployment(fixture.input);
  expect(result).toMatchObject({
    status: "confirmed",
    deployment: {
      sourceSha: fixture.input.expected.sourceSha,
      bundleDigest: fixture.input.expected.buildDigest,
      confirmation: {
        catalogDigest: fixture.input.expected.catalogDigest,
        targetDigest: fixture.input.expected.targetDigest,
        essentialSmokePassed: true,
      },
    },
  });
  expect(fixture.smokeCalls()).toBe(1);
});
test.each([
  { corruptAsset: true },
  { brokenSearch: true },
  { unsupportedSchema: true },
])(
  "corrupt assets, broken search or unsupported schema cannot finalize (%j)",
  async (options) => {
    expect(
      await confirmDeployment(confirmationFixture(options).input),
    ).toMatchObject({ status: "incident" });
  },
);
test("transient propagation is polled with a bounded number of attempts", async () => {
  const fixture = confirmationFixture();
  let attempts = 0;
  const waits: number[] = [];
  const result = await pollDeploymentConfirmation({
    attempt: async () => {
      attempts++;
      return confirmDeployment({
        ...fixture.input,
        fetchManifest: async () =>
          attempts < 3
            ? { ...fixture.publicManifest, sourceSha: "a".repeat(40) }
            : fixture.publicManifest,
      });
    },
    sleep: async (ms) => {
      waits.push(ms);
    },
    maxAttempts: 4,
  });
  expect(result.status).toBe("confirmed");
  expect(attempts).toBe(3);
  expect(waits).toHaveLength(2);
});
test("lost local confirmation state can be reconstructed from the unchanged real public proof", async () => {
  const fixture = confirmationFixture();
  const first = await confirmDeployment(fixture.input);
  const recovered = await confirmDeployment(fixture.input);
  expect(recovered).toEqual(first);
});
test("an unavailable public site stays pending and polling cannot run indefinitely", async () => {
  const fixture = confirmationFixture();
  let calls = 0;
  const result = await pollDeploymentConfirmation({
    attempt: async () => {
      calls++;
      return confirmDeployment({
        ...fixture.input,
        fetchManifest: async () => {
          throw new Error("fetch unavailable");
        },
      });
    },
    sleep: async () => {},
    maxAttempts: 3,
  });
  expect(result).toMatchObject({
    status: "waiting",
    reason: "public-unavailable",
  });
  expect(calls).toBe(3);
});
test("production uses the fixed HTTPS origin and local verification is explicit", () => {
  expect(deploymentSiteOrigin()).toBe("https://tavernary.org");
  expect(
    deploymentSiteOrigin({
      mode: "fixture",
      fixtureOrigin: "http://127.0.0.1:4317",
    }),
  ).toBe("http://127.0.0.1:4317");
  expect(() =>
    deploymentSiteOrigin({
      mode: "fixture",
      fixtureOrigin: "https://attacker.example",
    }),
  ).toThrow();
});
