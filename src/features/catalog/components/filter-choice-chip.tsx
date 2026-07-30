"use client";

export interface FilterChoiceChipProps {
  label: string;
  checked: boolean;
  onChange: () => void;
  type?: "checkbox" | "radio";
  name?: string;
  count?: number;
  disabled?: boolean;
  title?: string;
  className?: string;
}

export function FilterChoiceChip({
  label,
  checked,
  onChange,
  type = "checkbox",
  name,
  count,
  disabled = false,
  title,
  className,
}: FilterChoiceChipProps) {
  const classes = [
    "filter-choice",
    className,
    checked ? "selected" : "",
    disabled ? "disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={classes} title={title}>
      <span className="filter-choice-chip">
        <input
          type={type}
          name={name}
          aria-label={label}
          checked={checked}
          disabled={disabled}
          onChange={onChange}
        />
        <span className="filter-choice-check" aria-hidden="true">
          {"\u2713"}
        </span>
        <span>{label}</span>
        {count !== undefined ? (
          <b
            className="filter-choice-count"
            aria-label={`${count} ${count === 1 ? "project" : "projects"}`}
          >
            {count}
          </b>
        ) : null}
      </span>
    </label>
  );
}
