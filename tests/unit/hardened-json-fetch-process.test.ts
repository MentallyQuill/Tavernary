import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";

const publicationModule = pathToFileURL(
  resolve("scripts/security/tavernkeeper-publication.mjs"),
).href;

test.each(["dns", "request", "body"])(
  "delivers a stalled %s deadline before a standalone process exits",
  (stage) => {
    const child = spawnSync(process.execPath, ["--input-type=module"], {
      input: `
          import { readPublicManifest } from ${JSON.stringify(publicationModule)};
          const stage = ${JSON.stringify(stage)};
          try {
            await readPublicManifest("https://tavernary.org/security/tavernkeeper-targets.json", {
              timeoutMs: 30,
              dnsLookup: async () => stage === "dns"
                ? new Promise(() => {})
                : [{ address: "8.8.8.8", family: 4 }],
              requestImpl: async () => stage === "request"
                ? new Promise(() => {})
                : new Response(new ReadableStream({
                    pull() { return new Promise(() => {}); },
                  }), { headers: { "content-type": "application/json" } }),
            });
            process.exitCode = 2;
          } catch (error) {
            console.log(error.message);
          }
        `,
      encoding: "utf8",
      timeout: 3000,
    });

    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout).toMatch(/request timed out/u);
  },
);

test.each([200, 503])(
  "releases the standalone process deadline after HTTP %s settles",
  (status) => {
    const child = spawnSync(process.execPath, ["--input-type=module"], {
      input: `
        import { readPublicManifest } from ${JSON.stringify(publicationModule)};
        try {
          await readPublicManifest("https://tavernary.org/security/tavernkeeper-targets.json", {
            timeoutMs: 10000,
            dnsLookup: async () => [{ address: "8.8.8.8", family: 4 }],
            requestImpl: async () => new Response(JSON.stringify({
              schema_version: 1,
              generated_at: "2026-08-01T00:00:00.000Z",
              repositories: [],
            }), {
              status: ${status},
              headers: { "content-type": "application/json" },
            }),
          });
          console.log("resolved");
        } catch (error) {
          console.log(error.message);
        }
      `,
      encoding: "utf8",
      timeout: 3000,
    });

    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout).toMatch(status === 200 ? /resolved/u : /HTTP 503/u);
  },
);
