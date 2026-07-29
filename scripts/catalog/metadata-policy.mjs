const trustedManualNotes = {
  "repository-owner": "Verified repository owner selection.",
  "tavernary-staff": "Trusted Tavernary editor selection.",
};

export function automaticMetadataPolicy() {
  return { mode: "automatic" };
}

export function manualMetadataPolicy(authorityType) {
  const note = trustedManualNotes[authorityType];
  if (!note) {
    throw new Error(
      "Manual metadata requires repository-owner or tavernary-staff authority",
    );
  }
  return { mode: "manual", note };
}

export function metadataFieldsToGenerate(record) {
  const fields = [];
  if (record?.metadata_policy?.summary?.mode === "automatic") {
    fields.push("summary");
  }
  if (record?.metadata_policy?.tags?.mode === "automatic") {
    fields.push("tags");
  }
  return fields;
}

function resolveFieldRequest(field, request, authorityType) {
  if (request?.mode === "automatic") {
    return automaticMetadataPolicy();
  }
  if (request?.mode !== "manual") {
    throw new Error(`${field} metadata request mode is invalid`);
  }
  if (!Object.hasOwn(trustedManualNotes, authorityType)) {
    return automaticMetadataPolicy();
  }

  const policy = manualMetadataPolicy(authorityType);
  if (field === "summary") {
    return { ...policy, value: request.value };
  }
  return {
    ...policy,
    values: Array.isArray(request.values)
      ? [...request.values]
      : request.values,
  };
}

export function resolveRequestedMetadata({ request, authority }) {
  const authorityType = authority?.authorityType;
  return {
    summary: resolveFieldRequest("summary", request?.summary, authorityType),
    tags: resolveFieldRequest("tags", request?.tags, authorityType),
  };
}
