import {
  kitSetKey,
  validateKitDraft,
} from "../../src/features/kits/kit-domain.mjs";

function nearDuplicate(left, right) {
  const leftIds = new Set(left);
  const rightIds = new Set(right);
  const intersection = [...leftIds].filter((id) => rightIds.has(id)).length;
  return (
    intersection >= 3 &&
    intersection / Math.max(leftIds.size, rightIds.size) >= 0.75
  );
}

export function validateKitSubmission({
  manifest,
  actor,
  projects,
  kits,
  blockedUsers,
}) {
  const errors = [];
  const warnings = [];
  let parsed;
  try {
    parsed = JSON.parse(manifest);
  } catch {
    return {
      valid: false,
      manifest: null,
      labels: ["needs-information"],
      errors: ["Kit manifest must be valid JSON."],
      warnings,
    };
  }

  if (
    !parsed ||
    !["create", "edit"].includes(parsed.operation) ||
    typeof parsed.title !== "string" ||
    typeof parsed.description !== "string" ||
    !Array.isArray(parsed.project_ids) ||
    !parsed.project_ids.every((id) => typeof id === "string") ||
    (parsed.operation === "create" && parsed.kit_id !== null) ||
    (parsed.operation === "edit" && typeof parsed.kit_id !== "string")
  ) {
    errors.push("Kit manifest has invalid or missing fields.");
  }

  if (
    blockedUsers.blocked?.some((blocked) => blocked.github_user_id === actor.id)
  ) {
    errors.push("This GitHub identity is blocked from Kit submissions.");
  }

  const existingKit =
    parsed?.operation === "edit"
      ? kits.find((kit) => kit.id === parsed.kit_id)
      : null;
  if (parsed?.operation === "edit" && !existingKit) {
    errors.push("The Kit selected for editing does not exist.");
  } else if (existingKit && existingKit.author.github_user_id !== actor.id) {
    errors.push("Only the Kit author may submit an edit.");
  }

  if (
    parsed &&
    typeof parsed.title === "string" &&
    typeof parsed.description === "string" &&
    Array.isArray(parsed.project_ids)
  ) {
    const draftValidation = validateKitDraft(
      {
        title: parsed.title,
        description: parsed.description,
        projectIds: parsed.project_ids,
      },
      projects,
    );
    errors.push(...draftValidation.errors);

    const candidates = kits.filter(
      (kit) => kit.status === "published" && kit.id !== parsed.kit_id,
    );
    const setKey = kitSetKey(parsed.project_ids);
    if (candidates.some((kit) => kitSetKey(kit.project_ids) === setKey)) {
      errors.push("Another published Kit contains the same project set.");
    } else if (
      candidates.some((kit) =>
        nearDuplicate(kit.project_ids, parsed.project_ids),
      )
    ) {
      warnings.push(
        "This composition is a near-duplicate of an existing Kit and requires maintainer judgment.",
      );
    }
  }

  const duplicate = errors.includes(
    "Another published Kit contains the same project set.",
  );
  const labels = errors.length
    ? [duplicate ? "duplicate-candidate" : "needs-information"]
    : [
        "needs-maintainer-review",
        ...(warnings.length ? ["duplicate-candidate"] : []),
      ];
  return {
    valid: errors.length === 0,
    manifest: errors.length === 0 ? parsed : (parsed ?? null),
    labels,
    errors: [...new Set(errors)],
    warnings,
  };
}
