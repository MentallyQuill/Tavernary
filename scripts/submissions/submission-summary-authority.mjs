import { verifyTrustedEditor } from "../maintenance/trusted-editor-authority.mjs";

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function actorIdentity(actor) {
  const identity = {
    actorId: positiveInteger(actor?.id) ? actor.id : null,
    actorLogin:
      typeof actor?.login === "string" && actor.login.length > 0
        ? actor.login
        : null,
  };
  return actor?.type === "Bot" ? { ...identity, actorType: "Bot" } : identity;
}

export function classifySubmissionSummaryAuthority(input) {
  const actor = actorIdentity(input?.issueActor);
  const staff = verifyTrustedEditor({
    actor: input?.issueActor,
    association: input?.authorAssociation,
    registry: input?.trustedEditorRegistry,
  });
  if (staff.authorized) {
    return {
      authorityType: "tavernary-staff",
      ...actor,
    };
  }

  const owner = input?.repositoryOwner;
  if (
    input?.sourceIdentity?.kind === "repository" &&
    input.sourceIdentity.provider === "github" &&
    owner?.type === "User" &&
    positiveInteger(owner.id) &&
    actor.actorId === owner.id &&
    actor.actorLogin !== null
  ) {
    return {
      authorityType: "repository-owner",
      ...actor,
    };
  }

  return {
    authorityType: "community-submitter",
    ...actor,
  };
}
