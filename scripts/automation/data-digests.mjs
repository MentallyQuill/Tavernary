import { fingerprintProjectPublicationInput } from "../publication/project-publication-transaction.mjs";
import { isConfirmedDeployment } from "./deployment-operations.mjs";

export function automationDataDigests({ catalog, targets }) {
  return {
    catalogDigest: fingerprintProjectPublicationInput({
      schemaVersion: catalog.schemaVersion,
      projects: catalog.projects,
      kits: catalog.kits,
      tagVocabulary: catalog.tagVocabulary,
    }),
    targetDigest: fingerprintProjectPublicationInput({
      schema_version: targets.schema_version,
      repositories: targets.repositories,
    }),
  };
}

export function verifiedAutomationDeployments({
  deployments,
  revision,
  catalogDigest,
  targetDigest,
  isAncestor,
}) {
  return [
    ...new Set(
      deployments
        .filter(
          (deployment) =>
            /^[a-f0-9]{40}$/u.test(deployment.sourceSha ?? "") &&
            isConfirmedDeployment(deployment, {
              sha: deployment.sourceSha,
              catalogDigest,
              targetDigest,
            }) &&
            isAncestor(deployment.sourceSha, revision),
        )
        .map((deployment) => deployment.sourceSha),
    ),
  ];
}
