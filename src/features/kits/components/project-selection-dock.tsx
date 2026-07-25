export function ProjectSelectionDock({
  selectedCount,
  replacementFrontendName,
  limitReached,
  onCancel,
  onAdd,
}: {
  selectedCount: number;
  replacementFrontendName: string | null;
  limitReached: boolean;
  onCancel: () => void;
  onAdd: () => void;
}) {
  return (
    <section
      className="project-selection-dock"
      aria-label={`${selectedCount} projects selected`}
    >
      <div className="project-selection-actions">
        <button className="control-quiet" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="control-primary"
          type="button"
          disabled={selectedCount === 0}
          onClick={onAdd}
        >
          Add to Kit
          <span className="selection-count" aria-hidden="true">
            {selectedCount}
          </span>
        </button>
      </div>
      {replacementFrontendName || limitReached ? (
        <small className="project-selection-guidance">
          {replacementFrontendName ? (
            <span>Frontend will replace {replacementFrontendName}</span>
          ) : null}
          {limitReached ? <span>Kit limit reached · 50 projects</span> : null}
        </small>
      ) : null}
    </section>
  );
}
