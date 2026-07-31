import type { SearchEvidence as SearchEvidenceItem } from "../search-types";

const FIELD_LABEL = {
  aliases: "alias",
  source: "source",
  kind: "project type",
  primaryFunction: "function",
  tags: "goal or trait",
  frontends: "frontend",
  compatibility: "compatibility",
  maintainers: "maintainer",
  relationships: "related project",
} as const;

export function visibleSearchEvidence(
  evidence: SearchEvidenceItem[],
): SearchEvidenceItem | null {
  return (
    evidence.find(({ field }) => field !== "title" && field !== "summary") ??
    null
  );
}

export function searchEvidenceText(evidence: SearchEvidenceItem[]) {
  const visible = visibleSearchEvidence(evidence);
  if (!visible || visible.field === "title" || visible.field === "summary") {
    return null;
  }
  return `Matched ${FIELD_LABEL[visible.field]}: ${visible.value}`;
}

export function SearchEvidence({
  evidence,
}: {
  evidence: SearchEvidenceItem[];
}) {
  const visible = visibleSearchEvidence(evidence);
  if (!visible || visible.field === "title" || visible.field === "summary") {
    return null;
  }
  return (
    <p className="search-match-evidence">
      Matched {FIELD_LABEL[visible.field]}: <b>{visible.value}</b>
    </p>
  );
}
