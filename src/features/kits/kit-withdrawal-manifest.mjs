const MANIFEST_KEYS = [
  "schema_version",
  "request_kind",
  "kit_id",
  "confirmation",
];
const KIT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value) {
  return (
    isObject(value) &&
    Object.keys(value).length === MANIFEST_KEYS.length &&
    Object.keys(value).every((key) => MANIFEST_KEYS.includes(key))
  );
}

export function normalizeKitWithdrawalManifest(value) {
  const errors = [];
  if (!isObject(value)) {
    return {
      valid: false,
      errors: ["Kit withdrawal manifest must be an object."],
    };
  }
  if (!hasExactKeys(value)) {
    errors.push(
      "Kit withdrawal manifest contains unknown or missing properties.",
    );
  }
  if (value.schema_version !== 1) {
    errors.push("Kit withdrawal manifest schema version is unsupported.");
  }
  if (value.request_kind !== "kit-withdrawal") {
    errors.push("Kit withdrawal manifest request kind is invalid.");
  }
  const kitId = typeof value.kit_id === "string" ? value.kit_id.trim() : "";
  if (!KIT_ID_PATTERN.test(kitId) || kitId.length > 120) {
    errors.push("Kit withdrawal manifest Kit ID is invalid.");
  }
  if (value.confirmation !== true) {
    errors.push("Kit withdrawal manifest confirmation must be true.");
  }
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return {
    valid: true,
    manifest: {
      schema_version: 1,
      request_kind: "kit-withdrawal",
      kit_id: kitId,
      confirmation: true,
    },
  };
}

export function serializeKitWithdrawalManifest(value) {
  const normalized = normalizeKitWithdrawalManifest(value);
  if (!normalized.valid) {
    throw new Error(normalized.errors.join(" "));
  }
  return JSON.stringify(normalized.manifest, null, 2);
}
