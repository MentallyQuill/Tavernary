import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  automaticMetadataPolicy,
  manualMetadataPolicy,
} from "./metadata-policy.mjs";
import {
  validateTagGenerationOutput,
  validateTagSelection,
} from "./tag-classification.mjs";
import { tagVocabularyHash, validateTagVocabulary } from "./tag-vocabulary.mjs";

function resultMap(classifierResults) {
  if (classifierResults instanceof Map) {
    for (const [projectId, result] of classifierResults) {
      if (result?.project_id !== projectId) {
        throw new Error(
          `${projectId}: classifier result map key does not match project_id`,
        );
      }
    }
    return new Map(classifierResults);
  }
  if (!Array.isArray(classifierResults)) {
    throw new Error("classifierResults must be an array or Map");
  }
  const results = new Map();
  for (const result of classifierResults) {
    if (typeof result?.project_id !== "string" || !result.project_id) {
      throw new Error("tag result requires project_id");
    }
    if (results.has(result.project_id)) {
      throw new Error(`duplicate tag result for ${result.project_id}`);
    }
    results.set(result.project_id, result);
  }
  return results;
}

function summaryPolicy(project) {
  if (project.enrichment_policy === "automatic") {
    return automaticMetadataPolicy();
  }
  if (project.enrichment_policy !== "manual") {
    throw new Error(`${project.id}: legacy enrichment policy is invalid`);
  }
  if (
    typeof project.enrichment_note !== "string" ||
    project.enrichment_note.length === 0 ||
    project.enrichment_note.length > 240
  ) {
    throw new Error(`${project.id}: trusted legacy enrichment note is invalid`);
  }
  return {
    mode: "manual",
    note: project.enrichment_note,
  };
}

function vocabularyOrder(vocabulary) {
  return new Map(vocabulary.tags.map(({ id }, index) => [id, index]));
}

function orderedTags(tags, order) {
  return [...tags].sort(
    (left, right) =>
      order.get(left) - order.get(right) || left.localeCompare(right),
  );
}

function validateDiagnostic(projectId, diagnostic) {
  if (
    diagnostic !== null &&
    (typeof diagnostic !== "string" ||
      diagnostic.trim().length === 0 ||
      diagnostic.length > 240 ||
      /[\r\n\u2028\u2029]/u.test(diagnostic))
  ) {
    throw new Error(`${projectId}: tag result diagnostic is invalid`);
  }
}

function automaticTagMetadata({
  project,
  result,
  vocabulary,
  vocabularyHash,
  order,
}) {
  if (!result) {
    throw new Error(`${project.id}: missing tag result`);
  }
  if (result.vocabulary_hash !== vocabularyHash) {
    throw new Error(`${project.id}: tag result vocabulary hash does not match`);
  }
  validateDiagnostic(project.id, result.diagnostic);
  if (
    !result.evidence ||
    typeof result.evidence !== "object" ||
    Array.isArray(result.evidence)
  ) {
    throw new Error(
      `${project.id}: invalid tag result: evidence must be an object`,
    );
  }
  if (Array.isArray(result.tags)) {
    const selectedIds = [...new Set(result.tags)].sort();
    const evidenceIds = Object.keys(result.evidence).sort();
    if (
      selectedIds.length !== evidenceIds.length ||
      selectedIds.some((id, index) => id !== evidenceIds[index])
    ) {
      throw new Error(
        `${project.id}: invalid tag result: evidence keys do not match selected tags`,
      );
    }
  }
  const generated = {
    tags: Array.isArray(result.tags)
      ? result.tags.map((id) => ({
          id,
          evidence: result.evidence?.[id],
        }))
      : result.tags,
  };
  const validation = validateTagGenerationOutput(generated, {
    fields: ["tags"],
    vocabulary,
    kind: project.kind,
  });
  if (!validation.valid) {
    throw new Error(
      `${project.id}: invalid tag result: ${validation.errors.join("; ")}`,
    );
  }
  const tags = orderedTags(validation.tags, order);
  return {
    tags,
    evidence: Object.fromEntries(
      tags.map((id) => [id, [...validation.evidence[id]]]),
    ),
    diagnostic: result.diagnostic,
    policy: automaticMetadataPolicy(),
  };
}

function manualTagMetadata({ project, input, vocabulary, order }) {
  const validation = validateTagSelection({
    tags: input.tags,
    vocabulary,
    kind: project.kind,
  });
  if (!validation.valid) {
    throw new Error(
      `${project.id}: invalid manual tags: ${validation.errors.join("; ")}`,
    );
  }
  return {
    tags: orderedTags(input.tags, order),
    evidence: {},
    diagnostic: null,
    policy: manualMetadataPolicy(input.authorityType),
  };
}

function incrementPolicyCount(policyCounts, field, mode) {
  policyCounts[field][mode] += 1;
}

export function planTagBackfill({
  projects,
  vocabulary,
  classifierResults,
  manualTagsByProjectId = new Map(),
}) {
  const vocabularyValidation = validateTagVocabulary(vocabulary);
  if (!vocabularyValidation.valid) {
    throw new Error(
      `tag vocabulary is invalid: ${vocabularyValidation.errors.join("; ")}`,
    );
  }
  if (!Array.isArray(projects)) {
    throw new Error("projects must be an array");
  }
  const vocabularyHash = tagVocabularyHash(vocabulary);
  const results = resultMap(classifierResults);
  const order = vocabularyOrder(vocabulary);
  const projectIds = new Set();
  const metadataByProjectId = new Map();
  const projectReports = [];
  const tagCounts = Object.fromEntries(
    [...vocabulary.tags]
      .map(({ id }) => id)
      .sort()
      .map((id) => [id, 0]),
  );
  const policyCounts = {
    summary: { automatic: 0, manual: 0 },
    tags: { automatic: 0, manual: 0 },
  };

  const sortedProjects = [...projects].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  for (const project of sortedProjects) {
    if (
      project?.schema_version !== 5 ||
      typeof project.id !== "string" ||
      !project.id ||
      !["frontend", "extension", "preset"].includes(project.kind)
    ) {
      throw new Error("tag backfill requires valid schema-v5 project inputs");
    }
    if (projectIds.has(project.id)) {
      throw new Error(`duplicate project ID: ${project.id}`);
    }
    projectIds.add(project.id);

    const summary = summaryPolicy(project);
    const manualInput = manualTagsByProjectId.get(project.id);
    const tagMetadata = manualInput
      ? manualTagMetadata({
          project,
          input: manualInput,
          vocabulary,
          order,
        })
      : automaticTagMetadata({
          project,
          result: results.get(project.id),
          vocabulary,
          vocabularyHash,
          order,
        });
    if (!manualInput) results.delete(project.id);
    for (const id of tagMetadata.tags) tagCounts[id] += 1;

    const metadataPolicy = {
      summary,
      tags: tagMetadata.policy,
    };
    incrementPolicyCount(policyCounts, "summary", summary.mode);
    incrementPolicyCount(policyCounts, "tags", tagMetadata.policy.mode);
    metadataByProjectId.set(project.id, {
      tags: tagMetadata.tags,
      metadata_policy: metadataPolicy,
    });
    projectReports.push({
      project_id: project.id,
      tags: tagMetadata.tags,
      evidence: tagMetadata.evidence,
      diagnostic: tagMetadata.diagnostic,
      metadata_policy: metadataPolicy,
    });
  }

  for (const projectId of results.keys()) {
    throw new Error(`unexpected tag result for ${projectId}`);
  }
  for (const projectId of manualTagsByProjectId.keys()) {
    if (!projectIds.has(projectId)) {
      throw new Error(`unexpected manual tag input for ${projectId}`);
    }
  }

  return {
    metadataByProjectId,
    report: {
      schema_version: 1,
      vocabulary_hash: vocabularyHash,
      project_count: projectReports.length,
      zero_tag_count: projectReports.filter(({ tags }) => tags.length === 0)
        .length,
      six_tag_count: projectReports.filter(({ tags }) => tags.length === 6)
        .length,
      policy_counts: policyCounts,
      tag_counts: tagCounts,
      projects: projectReports,
    },
  };
}

export async function writeTagMigrationReport(report, outputPath) {
  const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
  await mkdir(dirname(outputPath), { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`);
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return { written: true, path: outputPath };
}
