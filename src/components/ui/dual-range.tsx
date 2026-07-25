"use client";

import type { CSSProperties, KeyboardEvent } from "react";

export type DualRangeValue = readonly [minimum: number, maximum: number];

export function DualRange({
  label,
  minimumLabel,
  maximumLabel,
  min,
  max,
  step = 1,
  value,
  onChange,
}: {
  label: string;
  minimumLabel: string;
  maximumLabel: string;
  min: number;
  max: number;
  step?: number;
  value: DualRangeValue;
  onChange: (value: DualRangeValue) => void;
}) {
  const [minimum, maximum] = value;
  const span = Math.max(1, max - min);
  const minimumPercent = ((minimum - min) / span) * 100;
  const maximumPercent = ((maximum - min) / span) * 100;
  const styles = {
    "--range-start": `${minimumPercent}%`,
    "--range-end": `${maximumPercent}%`,
  } as CSSProperties;
  const handleKeyDown = (
    thumb: "minimum" | "maximum",
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (!["PageUp", "PageDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = thumb === "minimum" ? minimum : maximum;
    const target =
      event.key === "Home"
        ? thumb === "minimum"
          ? min
          : minimum
        : event.key === "End"
          ? thumb === "minimum"
            ? maximum
            : max
          : current + (event.key === "PageUp" ? 5 * step : -5 * step);
    if (thumb === "minimum") {
      onChange([Math.max(min, Math.min(target, maximum)), maximum]);
    } else {
      onChange([minimum, Math.min(max, Math.max(target, minimum))]);
    }
  };

  return (
    <fieldset className="dual-range">
      <legend>{label}</legend>
      <div className="dual-range-readouts" aria-hidden="true">
        <span>Min {minimum}</span>
        <span>Max {maximum}</span>
      </div>
      <div className="dual-range-track" style={styles}>
        <input
          type="range"
          aria-label={minimumLabel}
          min={min}
          max={maximum}
          step={step}
          value={minimum}
          onChange={(event) =>
            onChange([
              Math.min(Number(event.currentTarget.value), maximum),
              maximum,
            ])
          }
          onKeyDown={(event) => handleKeyDown("minimum", event)}
        />
        <input
          type="range"
          aria-label={maximumLabel}
          min={minimum}
          max={max}
          step={step}
          value={maximum}
          onChange={(event) =>
            onChange([
              minimum,
              Math.max(Number(event.currentTarget.value), minimum),
            ])
          }
          onKeyDown={(event) => handleKeyDown("maximum", event)}
        />
      </div>
      <span className="visually-hidden" aria-live="polite">
        {minimum} to {maximum} projects
      </span>
    </fieldset>
  );
}
