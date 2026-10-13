"use client";

import { useId } from "react";

import { Tooltip } from "@/components/ui/tooltip";
import { useColorMode } from "@/features/accessibility/use-color-mode";

export function ColorModeSwitch() {
  const tooltipId = useId();
  const { mode, setMode } = useColorMode();
  const enabled = mode === "accessible";

  return (
    <Tooltip
      id={`${tooltipId}-color-mode-tooltip`}
      label="Higher contrast colors for color vision differences. Saved in this browser."
      className="color-mode-tooltip"
    >
      <button
        aria-checked={enabled}
        aria-label="Enhanced contrast"
        className="color-mode-switch"
        onClick={() => setMode(enabled ? "standard" : "accessible")}
        role="switch"
        type="button"
      >
        <span aria-hidden="true" className="color-mode-switch-track">
          <span className="color-mode-switch-thumb" />
        </span>
        <span aria-hidden="true" className="color-mode-switch-label">
          Enhanced contrast
        </span>
      </button>
    </Tooltip>
  );
}
