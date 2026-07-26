export async function generateProjectSubmission({ issueNumber, draft }) {
  const files = [
    {
      path: `data/registry/projects/${draft.record.id}.json`,
      value: draft.record,
    },
    ...(draft.snapshot
      ? [
          {
            path: `data/snapshots/github/${draft.record.id}.json`,
            value: draft.snapshot,
          },
        ]
      : []),
    ...(draft.frontendVocabulary
      ? [
          {
            path: "data/vocabularies/frontends.json",
            value: {
              frontends: [...draft.frontendVocabulary.frontends].sort(
                (left, right) => left.id.localeCompare(right.id),
              ),
            },
          },
        ]
      : []),
  ].sort((left, right) => left.path.localeCompare(right.path));

  return {
    files,
    report: {
      schema_version: 1,
      issue_number: issueNumber,
      project_id: draft.record.id,
      submitted: draft.submitted,
      observed: draft.observed,
      inferred: draft.inferred,
      warnings: draft.warnings,
    },
  };
}
