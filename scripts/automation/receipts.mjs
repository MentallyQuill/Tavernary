import {
  AUTOMATION_OPERATION_SCHEMA,
  automationSchemaValidator,
  validateAutomationOperation,
} from "./operation.mjs";

const validateSchema = automationSchemaValidator({
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "operation", "updatedAt", "completedAt"],
  properties: {
    schema_version: { const: 1 },
    operation: AUTOMATION_OPERATION_SCHEMA,
    updatedAt: { type: "string", format: "automation-time" },
    completedAt: {
      anyOf: [{ type: "string", format: "automation-time" }, { type: "null" }],
    },
  },
});

export function validateAutomationReceipt(value) {
  if (!validateSchema(value))
    throw new Error("Automation receipt schema is invalid.");
  try {
    validateAutomationOperation(value.operation);
  } catch {
    throw new Error("Automation receipt operation is invalid.");
  }
  if (
    Date.parse(value.updatedAt) < Date.parse(value.operation.createdAt) ||
    (value.operation.stage === "finalized") !== (value.completedAt !== null) ||
    (value.completedAt !== null &&
      (Date.parse(value.completedAt) !== Date.parse(value.updatedAt) ||
        value.operation.expectedSha === null ||
        value.operation.workerRunId !== null))
  ) {
    throw new Error("Automation receipt progress is invalid.");
  }
  return value;
}
