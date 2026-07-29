const copyMarker = (issueNumber) =>
  `<!-- tavernary-project-copy-notice:${issueNumber} -->`;
const ownerDelistMarker = (sourceId, issueNumber) =>
  `<!-- tavernary-owner-delist-notice:${sourceId}:${issueNumber} -->`;

function safePlainText(value, limit = 600) {
  const normalized = String(value ?? "")
    .replace(/<!--/gu, "")
    .replace(/-->/gu, "")
    .replace(/<[^>]*>/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/@/gu, "&#64;")
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const bounded =
    normalized.length <= limit
      ? normalized
      : `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
  return bounded.replace(/\\/gu, "\\\\").replace(/([[\]_*`#<>|])/gu, "\\$1");
}

function safeTitle(value, limit = 180) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
}

function botOwned(comment) {
  return comment?.user?.type === "Bot";
}

export function planCopyAdjustmentNotice(transaction, existingComments = []) {
  if (
    !transaction ||
    !["repository-owner", "tavernary-staff"].includes(
      transaction.authority_type,
    ) ||
    transaction.copy_result === null ||
    transaction.copy_result.result === "accepted-unchanged"
  ) {
    return { action: "none" };
  }
  const marker = copyMarker(transaction.issue_number);
  const body = [
    marker,
    "The project change was published. Tavernary made a limited automated catalog-copy adjustment while preserving the submitted meaning and structure wherever possible.",
    "",
    "This notice is informational. The adjustment did not delay publication or require staff approval.",
    "",
    "See the [Catalog Policy](/catalog-policy/).",
  ].join("\n");
  const existing = existingComments.find(
    (comment) => botOwned(comment) && comment.body?.includes(marker),
  );
  if (!existing) return { action: "create", body };
  return existing.body === body
    ? { action: "noop" }
    : { action: "update", commentId: existing.id, body };
}

function canonicalSource(source) {
  if (source?.type === "github" && typeof source.repository === "string") {
    return `https://github.com/${source.repository}`;
  }
  if (source?.type === "codeberg" && typeof source.repository === "string") {
    return `https://codeberg.org/${source.repository}`;
  }
  return source?.url ?? "Unavailable";
}

function renderedKits(kits, projectIds) {
  const affectedIds = new Set(projectIds);
  const affected = (kits ?? [])
    .filter(
      (kit) =>
        kit?.status === "published" &&
        Array.isArray(kit.project_ids) &&
        kit.project_ids.some((projectId) => affectedIds.has(projectId)),
    )
    .sort((left, right) =>
      String(left.title).localeCompare(String(right.title)),
    );
  return affected.length === 0
    ? "- None."
    : affected
        .map(
          (kit) =>
            `- ${safePlainText(kit.title, 160)} (\`${safePlainText(kit.id, 100)}\`)`,
        )
        .join("\n");
}

function renderedProjects(projects) {
  return projects.length === 0
    ? "- None."
    : projects
        .map(
          (project) =>
            `- ${safePlainText(project.name, 180)} (\`${safePlainText(project.id, 100)}\`)`,
        )
        .join("\n");
}

export function planOwnerDelistNotice(input) {
  const transaction = input?.transaction;
  if (
    transaction?.operation !== "delist-source" ||
    transaction.authority_type !== "repository-owner"
  ) {
    return { action: "none" };
  }
  const source = input.source ?? {};
  const projects = (input.projects ?? [])
    .filter(
      (project) =>
        project?.source_id === transaction.source_id &&
        transaction.project_ids.includes(project.id),
    )
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
  const marker = ownerDelistMarker(
    transaction.source_id,
    transaction.issue_number,
  );
  const title = `[Owner source delisting notice] ${safeTitle(
    source.repository ?? transaction.source_id,
    180,
  )}`;
  const ownerNote = input.issue?.ownerNote;
  const body = [
    marker,
    "A verified repository owner permanently delisted this repository source. The authority and immutable repository identity checks passed, and the delisting transaction has already merged. No staff approval is required.",
    "",
    "Review is optional unless the affected-Kit information requires follow-up.",
    "",
    "## Source",
    "",
    `- **Repository:** ${safePlainText(source.repository ?? transaction.source_id, 180)}`,
    `- **Source ID:** \`${transaction.source_id}\``,
    `- **Canonical source:** ${safePlainText(canonicalSource(source), 320)}`,
    `- **Blocked identity:** \`${safePlainText(transaction.source_identity?.canonical ?? "Unavailable", 120)}\` is permanently blocked from ordinary resubmission.`,
    `- **Owner:** ${safePlainText(transaction.actor.login, 80)} (GitHub ID \`${transaction.actor.id}\`)`,
    `- **Source request:** #${transaction.issue_number}`,
    `- **Merged transaction PR:** #${input.pull?.number ?? "Unavailable"}`,
    `- **Published at:** ${safePlainText(input.publishedAt ?? "Unavailable", 80)}`,
    "",
    "## Resulting canonical state",
    "",
    `- status: ${safePlainText(source.status ?? "delisted", 80)}`,
    `- status_reason: ${safePlainText(source.status_reason ?? "removed", 120)}`,
    `- refresh_policy: ${safePlainText(source.refresh_policy ?? "paused", 120)}`,
    "",
    "## Affected cards",
    "",
    renderedProjects(projects),
    "",
    "## Currently published Kits referencing affected cards",
    "",
    renderedKits(input.kits, transaction.project_ids),
    ...(ownerNote
      ? ["", "## Owner note", "", `> ${safePlainText(ownerNote, 600)}`]
      : []),
  ].join("\n");
  const existing = (input.existingIssues ?? []).find((issue) =>
    issue?.body?.includes(marker),
  );
  if (!existing) {
    return {
      action: "create",
      title,
      body,
      labels: ["owner-delist-notice"],
    };
  }
  if (existing.title === title && existing.body === body) {
    return { action: "noop", issueNumber: existing.number };
  }
  return {
    action: "update",
    issueNumber: existing.number,
    title,
    body,
    labels: ["owner-delist-notice"],
  };
}
