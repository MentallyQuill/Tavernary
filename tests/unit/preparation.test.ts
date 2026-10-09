import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import {
  capturePreparedOperation,
  emitPreparedOperation,
} from "../../scripts/automation/preparation.mjs";
import { preparedResultContextFixture } from "../helpers/automation-fixtures";

function fixture() {
  const context = preparedResultContextFixture();
  return {
    operation: context.operation,
    currentState: context.currentState,
    producer: {
      workflow: context.run.path,
      runId: context.run.id,
      sourceSha: context.run.head_sha,
    },
    publisherActorId: context.publisherActorId,
  };
}
test("preparation preserves the pinned base and original file hashes across acquisition", async () => {
  const input = fixture();
  input.currentState.fileDigests[input.currentState.allowedPaths[0]] =
    "c".repeat(64);
  const captured = capturePreparedOperation(input);
  input.currentState.fileDigests[input.currentState.allowedPaths[0]] =
    "f".repeat(64);
  const content = '{"source_id":"github-42","repository_id":42}\n';
  const result = await emitPreparedOperation({
    captured,
    currentState: { ...input.currentState, fileDigests: captured.fileDigests },
    read: async () => ({ type: "file", content }),
  });
  expect(result?.baseSha).toBe(input.producer.sourceSha);
  expect(result?.files[0]).toMatchObject({
    baseDigest: captured.fileDigests[input.currentState.allowedPaths[0]],
    sha256: createHash("sha256").update(content).digest("hex"),
  });
});
test("unchanged results produce no publication artifact", async () => {
  const input = fixture();
  const content = '{"source_id":"github-42"}\n';
  input.currentState.fileDigests[input.currentState.allowedPaths[0]] =
    createHash("sha256").update(content).digest("hex");
  expect(
    await emitPreparedOperation({
      captured: capturePreparedOperation(input),
      currentState: input.currentState,
      read: async () => ({ type: "file", content }),
    }),
  ).toBeNull();
});
test.each(["symlink", "schema", "oversize", "missing", "foreign-base"])(
  "preparation rejects unsafe %s output",
  async (variant) => {
    const input = fixture();
    input.currentState.fileDigests[input.currentState.allowedPaths[0]] =
      "c".repeat(64);
    const captured = capturePreparedOperation(input);
    if (variant === "schema") input.currentState.validateContent = () => false;
    if (variant === "foreign-base") input.currentState.mainSha = "e".repeat(40);
    await expect(
      emitPreparedOperation({
        captured,
        currentState: input.currentState,
        read: async () =>
          variant === "missing"
            ? null
            : {
                type: variant === "symlink" ? "symlink" : "file",
                content:
                  variant === "oversize"
                    ? "a".repeat(8_388_609)
                    : '{"source_id":"github-42","repository_id":42}',
              },
      }),
    ).rejects.toThrow();
  },
);
test("capture rejects a checkout different from the authenticated producer revision", () => {
  const input = fixture();
  input.currentState.mainSha = "e".repeat(40);
  expect(() => capturePreparedOperation(input)).toThrow();
});
