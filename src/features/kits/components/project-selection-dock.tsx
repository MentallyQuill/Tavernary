export function ProjectSelectionDock({
  selectedCount,
  replacementFrontendName,
  limitReached,
  nothingCanBeAdded = false,
  onCancel,
  onAdd,
}: {
  selectedCount: number;
  replacementFrontendName: string | null;
  limitReached: boolean;
  nothingCanBeAdded?: boolean;
  onCancel: () => void;
  onAdd: () => void;
}) {
  const projectLabel = `${selectedCount} ${
    selectedCount === 1 ? "project" : "projects"
  }`;

  return (
    <section
      className="project-selection-dock"
      aria-label={`${projectLabel} selected`}
    >
      <div className="project-selection-actions">
        <button className="control-quiet" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="control-primary"
          type="button"
          aria-label={`Add ${projectLabel} to Kit`}
          disabled={selectedCount === 0}
          onClick={onAdd}
        >
          Add to Kit
          <span className="selection-count" aria-hidden="true">
            {selectedCount}
          </span>
        </button>
      </div>
      {replacementFrontendName || limitReached || nothingCanBeAdded ? (
        <small className="project-selection-guidance">
          {replacementFrontendName ? (
            <span>Frontend will replace {replacementFrontendName}</span>
          ) : null}
          {limitReached ? <span>Kit limit reached · 50 projects</span> : null}
          {nothingCanBeAdded ? <span>Nothing can be added</span> : null}
        </small>
      ) : null}
    </section>
  );
}
