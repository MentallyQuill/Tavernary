import type {
  ProjectKitControlState,
  ProjectSelectionBindings,
} from "@/features/kits/use-project-batch-selection";

export function ProjectKitControl({
  projectName,
  bindings,
}: {
  projectName: string;
  bindings: ProjectSelectionBindings;
}) {
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
      aria-description={bindings.disabledReason ?? undefined}
      disabled={bindings.disabled}
      onClick={bindings.onActivate}
    >
      <span aria-hidden="true">{glyph[bindings.state]}</span>
    </button>
  );
}
