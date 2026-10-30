import { expect, test } from "vitest";
import { runWorkflowDispatchCli } from "../../scripts/automation/retry-workflow-dispatch.mjs";

test("a transient dispatch failure retries the same immutable request and finishes successfully", async () => {
  const calls: string[][] = [];
  const delays: number[] = [];
  const errors: string[] = [];
  const result = await runWorkflowDispatchCli(
    [
      "refresh-catalog.yml",
      "--repo",
      "MentallyQuill/Tavernary",
      "--ref",
      "main",
      "-f",
      `operation_key=${"a".repeat(64)}`,
      "-f",
      "source_id=github-42",
      "-f",
      "mode=project",
    ],
    {
      gh: async (args) => {
        calls.push(args);
        if (calls.length < 3)
          throw new Error("gh workflow run failed: HTTP 502: Server Error");
        return "";
      },
      sleep: async (delay) => {
        delays.push(delay);
      },
      reportRetry: () => {},
      reportError: (value) => errors.push(value),
      write: () => {},
    },
  );
  expect(result).toBe(0);
  expect(calls).toHaveLength(3);
  expect(
    calls.every((call) => JSON.stringify(call) === JSON.stringify(calls[0])),
  ).toBe(true);
  expect(calls[0]).toEqual([
    "workflow",
    "run",
    "refresh-catalog.yml",
    "--repo",
    "MentallyQuill/Tavernary",
    "--ref",
    "main",
    "-f",
    `operation_key=${"a".repeat(64)}`,
    "-f",
    "source_id=github-42",
    "-f",
    "mode=project",
  ]);
  expect(delays).toEqual([2000, 5000]);
  expect(errors).toEqual([]);
});

test.each([401, 403, 404, 422, 429])(
  "HTTP %i dispatch failures stop immediately without retrying",
  async (status) => {
    let calls = 0;
    const delays: number[] = [];
    const diagnostics: string[] = [];
    const result = await runWorkflowDispatchCli(
      [
        "import-tavernkeeper-reports.yml",
        "--repo",
        "MentallyQuill/Tavernary",
        "--ref",
        "main",
        "-f",
        `operation_key=${"b".repeat(64)}`,
      ],
      {
        gh: async () => {
          calls++;
          throw Object.assign(
            new Error("private credentials must stay hidden"),
            { status },
          );
        },
        sleep: async (delay) => {
          delays.push(delay);
        },
        reportError: (value) => diagnostics.push(value),
      },
    );
    expect(result).toBe(1);
    expect(calls).toBe(1);
    expect(delays).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics.join("\n")).not.toContain("private credentials");
  },
);

test("persistent GitHub server errors stop after the bounded dispatch attempts", async () => {
  let calls = 0;
  const delays: number[] = [];
  const diagnostics: string[] = [];
  const retries: unknown[] = [];
  const result = await runWorkflowDispatchCli(
    [
      "import-tavernkeeper-reports.yml",
      "--repo",
      "MentallyQuill/Tavernary",
      "--ref",
      "main",
      "-f",
      `operation_key=${"b".repeat(64)}`,
    ],
    {
      gh: async () => {
        calls++;
        throw new Error("HTTP 503: secret-provider-response");
      },
      sleep: async (delay) => {
        delays.push(delay);
      },
      reportRetry: (value) => retries.push(value),
      reportError: (value) => diagnostics.push(value),
    },
  );
  expect(result).toBe(1);
  expect(calls).toBe(3);
  expect(delays).toEqual([2000, 5000]);
  expect(retries).toHaveLength(2);
  expect(diagnostics.map((value) => JSON.parse(value))).toEqual([
    {
      status: "unavailable",
      failure: { kind: "transient", reasonCode: "provider-unavailable" },
    },
  ]);
  expect(JSON.stringify([retries, diagnostics])).not.toContain(
    "secret-provider-response",
  );
});

test.each([
  ["refresh-catalog.yml", "-f", "source_id=github-42", "-f", "mode=forensic"],
  ["import-tavernkeeper-reports.yml"],
])(
  "the %s preparation route retains its validated fields across a transient retry",
  async (workflow, ...fields) => {
    const calls: string[][] = [];
    const output: string[] = [];
    const args = [
      workflow,
      "--repo",
      "MentallyQuill/Tavernary",
      "--ref",
      "main",
      "-f",
      `operation_key=${"c".repeat(64)}`,
      ...fields,
    ];
    const result = await runWorkflowDispatchCli(args, {
      gh: async (command) => {
        calls.push([...command]);
        if (calls.length === 1)
          throw Object.assign(new Error("Server Error"), { status: 502 });
        return "accepted\n";
      },
      sleep: async () => {},
      reportRetry: () => {},
      write: (value) => output.push(value),
    });
    expect(result).toBe(0);
    expect(calls).toEqual([
      ["workflow", "run", ...args],
      ["workflow", "run", ...args],
    ]);
    expect(output).toEqual(["accepted"]);
  },
);

test.each([
  ["missing-operation", []],
  ["non-main-ref", ["-f", `operation_key=${"d".repeat(64)}`]],
  ["invalid-operation", ["-f", "operation_key=mutable"]],
  [
    "duplicate-operation",
    [
      "-f",
      `operation_key=${"d".repeat(64)}`,
      "-f",
      `operation_key=${"e".repeat(64)}`,
    ],
  ],
  [
    "unexpected-model-budget",
    ["-f", `operation_key=${"d".repeat(64)}`, "-f", "budget_ticket=unexpected"],
  ],
])("%s input cannot dispatch or enter a retry loop", async (_name, fields) => {
  let requests = 0;
  const delays: number[] = [];
  const result = await runWorkflowDispatchCli(
    [
      "import-tavernkeeper-reports.yml",
      "--repo",
      "MentallyQuill/Tavernary",
      "--ref",
      _name === "non-main-ref" ? "topic" : "main",
      ...fields,
    ],
    {
      gh: async () => {
        requests++;
        return "accepted";
      },
      sleep: async (delay) => {
        delays.push(delay);
      },
      reportError: () => {},
    },
  );
  expect(result).toBe(1);
  expect(requests).toBe(0);
  expect(delays).toEqual([]);
});

test("model-budget writer requests cannot enter the automatic dispatch retry path", async () => {
  let requests = 0;
  const delays: number[] = [];
  const result = await runWorkflowDispatchCli(
    [
      "automation-writer.yml",
      "--repo",
      "MentallyQuill/Tavernary",
      "--ref",
      "main",
      "-f",
      `operation_key=${"f".repeat(64)}`,
      "-f",
      "mode=prepare",
    ],
    {
      gh: async () => {
        requests++;
        return "accepted";
      },
      sleep: async (delay) => {
        delays.push(delay);
      },
      write: () => {},
      reportError: () => {},
    },
  );
  expect(result).toBe(1);
  expect(requests).toBe(0);
  expect(delays).toEqual([]);
});
