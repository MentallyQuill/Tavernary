import { expect, test } from "vitest";
import { createHash } from "node:crypto";
import { validatePreparedResult } from "../../scripts/automation/prepared-result.mjs";
import {
  operationFixture,
  preparedResultFixture,
  preparedResultContextFixture,
} from "../helpers/automation-fixtures";

test("trusted data results retain their immutable operation and file identity", () => {
  const result = preparedResultFixture();
  expect(
    validatePreparedResult(result, preparedResultContextFixture()),
  ).toEqual(result);
});

test("a prepared data result cannot claim publication for unchanged base bytes", () => {
  const result = preparedResultFixture();
  const context = preparedResultContextFixture();
  result.files[0].baseDigest = result.files[0].sha256;
  context.currentState.fileDigests[result.files[0].path] =
    result.files[0].sha256;
  expect(() => validatePreparedResult(result, context)).toThrow();
});
test("an invalid configured Publisher identity cannot authenticate a prepared producer", () => {
  const result = preparedResultFixture();
  const context = preparedResultContextFixture();
  context.publisherActorId = 0;
  context.run.actor.id = 0;
  expect(() => validatePreparedResult(result, context)).toThrow();
});
test("prepared traversal is rejected", () => {
  expect(() =>
    validatePreparedResult(
      preparedResultFixture({ paths: ["../outside.json"] }),
      preparedResultContextFixture(),
    ),
  ).toThrow();
});

test.each([
  "/data/snapshots/github/github-42.json",
  "data/snapshots/github/../github-42.json",
  "data\\snapshots\\github\\github-42.json",
  "data/snapshots/github/github-42.json:stream",
  "data/snapshots/github/GITHUB-42.json",
  ".github/workflows/refresh-catalog.yml",
])("rejects unsafe or executable paths: %s", (path) => {
  const result = preparedResultFixture({ paths: [path] });
  const context = preparedResultContextFixture();
  context.currentState.allowedPaths = [path];
  expect(() => validatePreparedResult(result, context)).toThrow();
});
test.each([
  "schema_version",
  "type",
  "hash",
  "bytes",
  "unknown",
  "duplicate",
  "json",
  "schema",
  "source",
  "actor",
  "input",
  "policy",
  "workflow",
  "run",
  "origin",
  "status",
  "fork",
  "branch",
  "base",
])("rejects invalid prepared %s before mutation", (variant) => {
  const result = preparedResultFixture();
  const context = preparedResultContextFixture();
  if (variant === "schema_version")
    Object.assign(result, { schema_version: 2 });
  if (variant === "type") Object.assign(result.files[0], { type: "symlink" });
  if (variant === "hash") result.files[0].sha256 = "f".repeat(64);
  if (variant === "bytes") result.files[0].bytes++;
  if (variant === "unknown") Object.assign(result, { command: "run me" });
  if (variant === "duplicate") result.files.push(result.files[0]);
  if (variant === "json") {
    result.files[0].content = "not JSON";
    result.files[0].sha256 = createHash("sha256")
      .update(result.files[0].content)
      .digest("hex");
    result.files[0].bytes = Buffer.byteLength(result.files[0].content);
  }
  if (variant === "schema") context.currentState.validateContent = () => false;
  if (variant === "source") context.currentState.source.identity = "github:999";
  if (variant === "actor") context.currentState.authorId++;
  if (variant === "input") context.currentState.inputDigest = "f".repeat(64);
  if (variant === "policy") context.currentState.policyVersion = "2";
  if (variant === "workflow") {
    result.producer.workflow = ".github/workflows/ci.yml";
    context.run.path = result.producer.workflow;
  }
  if (variant === "run") context.run.id++;
  if (variant === "origin") context.run.actor.id++;
  if (variant === "status") context.run.conclusion = "failure";
  if (variant === "fork")
    context.run.head_repository.full_name = "stranger/Tavernary";
  if (variant === "branch") context.run.head_branch = "untrusted";
  if (variant === "base") result.baseSha = "f".repeat(40);
  expect(() => validatePreparedResult(result, context)).toThrow();
});
test("unrelated main advances preserve content while a changed target file requires regeneration", () => {
  const result = preparedResultFixture();
  const context = preparedResultContextFixture();
  context.currentState.mainSha = "d".repeat(40);
  expect(validatePreparedResult(result, context)).toEqual(result);
  context.currentState.fileDigests[result.files[0].path] = "e".repeat(64);
  expect(() => validatePreparedResult(result, context)).toThrow();
});

test("a source cannot expand its path allowance to another immutable source", () => {
  const result = preparedResultFixture({
    paths: ["data/snapshots/github/github-43.json"],
  });
  const context = preparedResultContextFixture();
  context.currentState.allowedPaths = [result.files[0].path];
  expect(() => validatePreparedResult(result, context)).toThrow();
});

test("the immutable operation subject must match the prepared source", () => {
  const result = preparedResultFixture();
  const context = preparedResultContextFixture();
  const { identity } = context.operation;
  context.operation = operationFixture({
    identity: { ...identity, subject: "source:github-43" },
  });
  result.operationKey = context.operation.key;
  expect(() => validatePreparedResult(result, context)).toThrow();
});

test("metadata binds both source and card rather than rejecting the inventory's card subject", () => {
  const result = preparedResultFixture({
    kind: "metadata",
    paths: ["data/registry/projects/example-project.json"],
    producer: {
      workflow: ".github/workflows/enrich-catalog.yml",
      runId: 700,
      sourceSha: "b".repeat(40),
    },
  });
  const context = preparedResultContextFixture();
  context.operation = operationFixture({
    identity: {
      kind: "metadata",
      subject: "source:github-42:example-project",
      inputDigest: result.inputDigest,
      policyVersion: result.policyVersion,
    },
  });
  result.operationKey = context.operation.key;
  context.run.path = result.producer.workflow;
  context.currentState.projectId = "example-project";
  context.currentState.allowedPaths = result.files.map((file) => file.path);
  expect(validatePreparedResult(result, context)).toEqual(result);
  context.currentState.projectId = "other-project";
  expect(() => validatePreparedResult(result, context)).toThrow();
});
test("oversized UTF-8 content is rejected before domain validation", () => {
  const result = preparedResultFixture();
  const context = preparedResultContextFixture();
  let validated = false;
  result.files[0].content = JSON.stringify({ text: "é".repeat(4_194_304) });
  result.files[0].bytes = Buffer.byteLength(result.files[0].content);
  result.files[0].sha256 = createHash("sha256")
    .update(result.files[0].content)
    .digest("hex");
  context.currentState.validateContent = () => {
    validated = true;
    return true;
  };
  expect(() => validatePreparedResult(result, context)).toThrow();
  expect(validated).toBe(false);
});
