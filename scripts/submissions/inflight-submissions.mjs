import { parseProjectSubmissionIssue } from "./parse-project-submission.mjs";
import { submissionBranch } from "./project-submission-pr.mjs";
import {
  parseSourceIdentity,
  resolveSourceIdentity,
  sourceDuplicateKeys,
} from "./source-identity.mjs";

const terminalLabels = new Set(["duplicate-candidate", "submission-declined"]);

function issueLabels(issue) {
  return issue.labels.map((label) =>
    typeof label === "string" ? label : label.name,
  );
}

export async function listOpenAdmittedProjectSubmissions({
  repository,
  request,
}) {
  const issues = [];
  for (let page = 1; ; page += 1) {
    const batch = await request(
      `/repos/${repository}/issues?state=open&labels=project-submission%2Cissue-admitted&per_page=100&page=${page}`,
    );
    issues.push(...batch);
    if (batch.length < 100) return issues;
  }
}

async function candidateIdentity(issue, { request, probe }) {
  const parsed = parseProjectSubmissionIssue(issue.body ?? "");
  if (!parsed.valid) {
    throw new Error(`Issue #${issue.number} has no valid Project manifest.`);
  }
  const structural = parseSourceIdentity(parsed.manifest.source_url);
  try {
    if (structural.kind === "github") {
      const identity = await resolveSourceIdentity(structural, {
        resolveGithub: async (repository) => {
          const observed = await request(`/repos/${repository}`);
          return {
            id: observed.id,
            owner: observed.owner.login,
            name: observed.name,
          };
        },
      });
      return { identity };
    }
    const identity = await resolveSourceIdentity(structural, { probe });
    return { identity };
  } catch (error) {
    if (structural.kind !== "reddit-share") {
      return {
        identity: structural,
        warning: `candidate-scan-incomplete: Issue #${issue.number}: ${error.message}`,
      };
    }
    throw error;
  }
}

function identitiesOverlap(left, right) {
  const leftKeys = new Set(sourceDuplicateKeys(left));
  return sourceDuplicateKeys(right).some((key) => leftKeys.has(key));
}

export async function findEarlierInflightSubmission({
  repository,
  currentIssueNumber,
  currentIdentity,
  request,
  probe,
}) {
  let issues;
  try {
    issues = await listOpenAdmittedProjectSubmissions({
      repository,
      request,
    });
  } catch (error) {
    return {
      status: "retryable",
      code: "submission-inventory-unavailable",
      message: error.message,
    };
  }

  const warnings = [];
  const candidates = issues
    .filter((issue) => {
      const labels = issueLabels(issue);
      return (
        !issue.pull_request &&
        issue.state === "open" &&
        issue.number < currentIssueNumber &&
        labels.includes("project-submission") &&
        labels.includes("issue-admitted") &&
        !labels.some((label) => terminalLabels.has(label))
      );
    })
    .sort((left, right) => left.number - right.number);

  for (const issue of candidates) {
    try {
      const resolved = await candidateIdentity(issue, { request, probe });
      if (resolved.warning) warnings.push(resolved.warning);
      if (!identitiesOverlap(currentIdentity, resolved.identity)) continue;

      const owner = repository.split("/")[0];
      const head = `${owner}:${submissionBranch(issue.number)}`;
      let pull = null;
      try {
        const pulls = await request(
          `/repos/${repository}/pulls?state=open&head=${encodeURIComponent(head)}&per_page=1`,
        );
        pull = pulls[0] ?? null;
      } catch (error) {
        warnings.push(
          `candidate-scan-incomplete: PR lookup for issue #${issue.number}: ${error.message}`,
        );
      }
      return {
        status: "ok",
        match: {
          issueNumber: issue.number,
          issueUrl: issue.html_url,
          prNumber: pull?.number ?? null,
          prUrl: pull?.html_url ?? null,
          identity: resolved.identity,
        },
        warnings,
      };
    } catch (error) {
      warnings.push(
        `candidate-scan-incomplete: Issue #${issue.number}: ${error.message}`,
      );
    }
  }

  return { status: "ok", match: null, warnings };
}
