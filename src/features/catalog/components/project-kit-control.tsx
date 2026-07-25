import type {
  ProjectKitControlState,
  ProjectSelectionBindings,
} from "@/features/kits/use-project-batch-selection";
import { Tooltip } from "@/components/ui/tooltip";
import { useId } from "react";

export function ProjectKitControl({
  projectName,
  bindings,
}: {
  projectName: string;
  bindings: ProjectSelectionBindings;
}) {
  const descriptionId = useId();
  const action =
    bindings.state === "available"
      ? `Add ${projectName} to Kit`
      : bindings.state === "selected"
        ? `Remove ${projectName} from selection`
        : `Remove ${projectName} from Kit`;
  const glyph: Record<ProjectKitControlState, "add" | "remove"> = {
    available: "add",
    selected: "remove",
    "in-kit": "remove",
  };
  const tooltipLabel: Record<ProjectKitControlState, string> = {
    available: "Add to Kit",
    selected: "Remove from selection",
    "in-kit": "Remove from Kit",
  };
  const glyphName = glyph[bindings.state];

  return (
    <Tooltip
      id={`${descriptionId}-kit-action-tooltip`}
      label={tooltipLabel[bindings.state]}
      className="control-tooltip"
    >
      <button
        type="button"
        className="project-kit-control"
        aria-label={action}
        aria-pressed={bindings.state !== "available"}
        aria-describedby={bindings.disabledReason ? descriptionId : undefined}
        disabled={bindings.disabled}
        onClick={bindings.onActivate}
      >
        <span className="project-kit-control-face" aria-hidden="true">
          <svg
            data-kit-glyph={glyphName}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            focusable="false"
          >
            <path d={glyphName === "add" ? "M6 1.5v9M1.5 6h9" : "M1.5 6h9"} />
          </svg>
        </span>
        {bindings.disabledReason ? (
          <span className="visually-hidden" id={descriptionId}>
            {bindings.disabledReason}
          </span>
        ) : null}
      </button>
    </Tooltip>
  );
}
