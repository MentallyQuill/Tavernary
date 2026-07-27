import { useId } from "react";

import { Tooltip } from "@/components/ui/tooltip";

const UPVOTE_PATH =
  "M4 14h4v7a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-7h4a1.001 1.001 0 0 0 .781-1.625l-8-10c-.381-.475-1.181-.475-1.562 0l-8 10A1.001 1.001 0 0 0 4 14z";

export function KitUpvoteControl({
  sourceIssueUrl,
  supporterCount,
}: {
  sourceIssueUrl: string;
  supporterCount: number | null;
}) {
  const tooltipId = useId();

  return (
    <>
      {supporterCount === null ? null : (
        <span className="kit-upvote-count">{supporterCount}</span>
      )}
      <Tooltip
        id={`${tooltipId}-kit-upvote-tooltip`}
        label="Upvote on GitHub"
        className="control-tooltip"
      >
        <a
          className="project-kit-control kit-upvote-control"
          href={sourceIssueUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Upvote on GitHub"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="project-kit-control-face" aria-hidden="true">
            <svg
              data-kit-glyph="upvote"
              viewBox="0 0 24 24"
              fill="currentColor"
              focusable="false"
            >
              <path d={UPVOTE_PATH} />
            </svg>
          </span>
        </a>
      </Tooltip>
    </>
  );
}
