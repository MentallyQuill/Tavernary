import type {
  ProjectKitControlState,
  ProjectSelectionBindings,
} from "@/features/kits/use-project-batch-selection";
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
  const glyph: Record<ProjectKitControlState, string> = {
    available: "+",
    selected: "−",
    "in-kit": "−",
  };

  return (
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
        {glyph[bindings.state]}
      </span>
      {bindings.disabledReason ? (
        <span className="visually-hidden" id={descriptionId}>
          {bindings.disabledReason}
        </span>
      ) : null}
    </button>
  );
}
