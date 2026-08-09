import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const USAGE_URL = "https://api.openai.com/v1/organization/usage/completions";
const COSTS_URL = "https://api.openai.com/v1/organization/costs";

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function assertFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`);
  }
  return value;
}

function validatePage(page, kind) {
  const document = assertObject(page, `${kind} page`);
  if (document.object !== "page" || !Array.isArray(document.data)) {
    throw new Error(`Invalid ${kind} page response.`);
  }
  if (typeof document.has_more !== "boolean") {
    throw new Error(`Invalid ${kind} pagination state.`);
  }
  if (document.has_more && typeof document.next_page !== "string") {
    throw new Error(`Missing ${kind} pagination cursor.`);
  }
  return document;
}

function resultRows(pages, kind) {
  return pages.flatMap((page) =>
    validatePage(page, kind).data.flatMap((bucket, bucketIndex) => {
      const value = assertObject(bucket, `${kind} bucket ${bucketIndex}`);
      if (!Array.isArray(value.results)) {
        throw new Error(`Invalid ${kind} bucket results.`);
      }
      return value.results.map((result, resultIndex) =>
        assertObject(result, `${kind} result ${resultIndex}`),
      );
    }),
  );
}

function validateSingleProject(rows) {
  const projectIds = new Set(
    rows
      .map((row) => row.project_id)
      .filter((value) => typeof value === "string"),
  );
  if (
    projectIds.size !== 1 ||
    rows.some((row) => typeof row.project_id !== "string")
  ) {
    throw new Error("OpenAI usage must be grouped to one explicit project.");
  }
  return [...projectIds][0];
}

export function aggregateOpenAiUsage({
  usagePages,
  costPages,
  period,
  generatedAt,
}) {
  if (!Array.isArray(usagePages) || !Array.isArray(costPages)) {
    throw new Error("OpenAI usage and cost pages are required.");
  }
  const usageRows = resultRows(usagePages, "usage");
  const costRows = resultRows(costPages, "cost");
  if (usageRows.length === 0 || costRows.length === 0) {
    throw new Error("OpenAI returned no scoped usage or cost records.");
  }
  const usageProject = validateSingleProject(usageRows);
  const costProject = validateSingleProject(costRows);
  if (usageProject !== costProject) {
    throw new Error("OpenAI usage and cost project scopes do not match.");
  }

  const totals = usageRows.reduce(
    (sum, row, index) => ({
      inputTokens:
        sum.inputTokens +
        assertFiniteNumber(
          row.input_tokens,
          `usage result ${index} input_tokens`,
        ),
      cachedInputTokens:
        sum.cachedInputTokens +
        assertFiniteNumber(
          row.input_cached_tokens,
          `usage result ${index} input_cached_tokens`,
        ),
      outputTokens:
        sum.outputTokens +
        assertFiniteNumber(
          row.output_tokens,
          `usage result ${index} output_tokens`,
        ),
      requests:
        sum.requests +
        assertFiniteNumber(
          row.num_model_requests,
          `usage result ${index} num_model_requests`,
        ),
    }),
    { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, requests: 0 },
  );
  const costUsd = costRows.reduce((sum, row, index) => {
    const amount = assertObject(row.amount, `cost result ${index} amount`);
    if (amount.currency !== "usd") {
      throw new Error("OpenAI cost currency must be usd.");
    }
    return sum + assertFiniteNumber(amount.value, `cost result ${index} value`);
  }, 0);

  return {
    kind: "measured",
    periodStart: period.start,
    periodEnd: period.end,
    generatedAt,
    ...totals,
    costUsd: Number(costUsd.toFixed(6)),
    currency: "usd",
  };
}

export function completedUtcMonth(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.valueOf())) {
    throw new Error("A valid date is required.");
  }
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1),
  );
  return { start: start.toISOString(), end: end.toISOString() };
}

async function fetchPages({ fetch, url, token, projectId, period, kind }) {
  const pages = [];
  let page;
  do {
    const query = new URLSearchParams({
      start_time: String(Date.parse(period.start) / 1000),
      end_time: String(Date.parse(period.end) / 1000),
      bucket_width: "1d",
      limit: "31",
      group_by: "project_id",
    });
    query.append("project_ids", projectId);
    if (page) query.set("page", page);
    const response = await fetch(`${url}?${query}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(
        `OpenAI ${kind} request failed with status ${response.status}.`,
      );
    }
    const document = validatePage(await response.json(), kind);
    pages.push(document);
    page = document.has_more ? document.next_page : undefined;
  } while (page);
  return pages;
}

async function readSnapshot(outputPath) {
  try {
    const parsed = JSON.parse(await readFile(outputPath, "utf8"));
    if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.records)) {
      throw new Error("Invalid existing support usage snapshot.");
    }
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return { schemaVersion: 1, records: [] };
    throw error;
  }
}

export async function refreshOpenAiUsage({
  fetch,
  env,
  now = new Date(),
  outputPath,
}) {
  const token = env.OPENAI_ADMIN_KEY?.trim();
  const projectId = env.OPENAI_PROJECT_ID?.trim();
  if (!token) throw new Error("OPENAI_ADMIN_KEY is required.");
  if (!projectId) throw new Error("OPENAI_PROJECT_ID is required.");
  const period = completedUtcMonth(now);
  const [usagePages, costPages] = await Promise.all([
    fetchPages({
      fetch,
      url: USAGE_URL,
      token,
      projectId,
      period,
      kind: "usage",
    }),
    fetchPages({
      fetch,
      url: COSTS_URL,
      token,
      projectId,
      period,
      kind: "cost",
    }),
  ]);
  const allRows = [
    ...resultRows(usagePages, "usage"),
    ...resultRows(costPages, "cost"),
  ];
  if (allRows.some((row) => row.project_id !== projectId)) {
    throw new Error("OpenAI returned data outside OPENAI_PROJECT_ID scope.");
  }
  const record = aggregateOpenAiUsage({
    usagePages,
    costPages,
    period,
    generatedAt: now.toISOString(),
  });
  const existing = await readSnapshot(outputPath);
  const records = [
    record,
    ...existing.records.filter(
      (candidate) => candidate.periodStart !== record.periodStart,
    ),
  ].sort((left, right) => right.periodStart.localeCompare(left.periodStart));
  const snapshot = { schemaVersion: 1, records };
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8",
  );
  await rename(temporaryPath, outputPath);
  return snapshot;
}
