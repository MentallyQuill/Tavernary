import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import { persistGithubAutomationReceipt } from "../../scripts/automation/github-inventory.mjs";
import {
  receiptFixture,
  operationFixture,
} from "../helpers/automation-fixtures";

const damagedKey = "a".repeat(64);
async function inventory(mode = "healthy", content = "") {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ["tests/helpers/receipt-corruption-canary.mjs", mode, content],
    { encoding: "utf8", windowsHide: true, timeout: 15_000, maxBuffer: 32_768 },
  );
  return JSON.parse(stdout) as {
    status: string;
    intercepted: number;
    apiReads: number;
    receipts: number;
    invalidReceiptKeys: string[];
    findings: Array<{ status: string; count: number }>;
    findingsWithoutCompleteInspection: unknown[];
  };
}

test.each(["{}", '{"private":"must-not-appear-in-incident"'])(
  "a damaged receipt %s permits native reconstruction and produces a sanitized incident",
  async (content) => {
    const {
      status,
      intercepted,
      apiReads,
      receipts,
      invalidReceiptKeys,
      findings,
    } = await inventory("receipt", content);
    expect(intercepted).toBe(1);
    expect(status).toBe("accepted");
    expect(apiReads).toBeGreaterThan(0);
    expect(receipts).toBe(0);
    expect(invalidReceiptKeys).toEqual([damagedKey]);
    expect(findings).toContainEqual(
      expect.objectContaining({ status: "active", count: 1 }),
    );
    expect(JSON.stringify(findings)).not.toContain(
      "must-not-appear-in-incident",
    );
  },
  20_000,
);

test("unreadable canonical publication authority remains fail closed", async () => {
  const outcome = await inventory("authority", "{}");
  expect(outcome.intercepted).toBe(1);
  expect(outcome.status).toBe("rejected");
});

test("a complete healthy receipt inspection permits positive incident recovery", async () => {
  const outcome = await inventory();
  expect(outcome.findings).toContainEqual(
    expect.objectContaining({ status: "recovered", count: 0 }),
  );
  expect(outcome.findingsWithoutCompleteInspection).toEqual([]);
}, 20_000);

test.each(["{}", "{bad-json"])(
  "targeted malformed receipt %s is replaced with its fresh native blob CAS",
  async (content) => {
    const receipt = receiptFixture();
    const writes: Array<{
      path: string;
      payload: { sha: string; content: string };
    }> = [];
    await persistGithubAutomationReceipt({
      repository: "MentallyQuill/Tavernary",
      receipt,
      gh: async (args, body) => {
        const path = args.find((arg) => arg.startsWith("repos/"))!;
        if (!args.includes("PUT"))
          return JSON.stringify({
            encoding: "base64",
            sha: "e".repeat(40),
            content: Buffer.from(content).toString("base64"),
          });
        writes.push({ path, payload: JSON.parse(body!) });
        return "{}";
      },
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].path.endsWith(`${receipt.operation.key}.json`)).toBe(true);
    expect(writes[0].payload.sha).toBe("e".repeat(40));
    expect(
      JSON.parse(Buffer.from(writes[0].payload.content, "base64").toString()),
    ).toEqual(receipt);
  },
);

test("a valid other operation cannot be overwritten as a corrupt receipt", async () => {
  const receipt = receiptFixture();
  const other = receiptFixture({
    operation: operationFixture({
      identity: { ...receipt.operation.identity, subject: "issue:999" },
    }),
  });
  let writes = 0;
  await expect(
    persistGithubAutomationReceipt({
      repository: "MentallyQuill/Tavernary",
      receipt,
      gh: async (args) => {
        if (args.includes("PUT")) {
          writes++;
          return "{}";
        }
        return JSON.stringify({
          encoding: "base64",
          sha: "e".repeat(40),
          content: Buffer.from(JSON.stringify(other)).toString("base64"),
        });
      },
    }),
  ).rejects.toThrow(/identity disagree/);
  expect(writes).toBe(0);
});
