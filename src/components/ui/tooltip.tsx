import type { ReactNode } from "react";

export function Tooltip({
  id,
  label,
  children,
  className = "",
  align = "right",
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <span
      className={`tooltip-anchor tooltip-align-${align} ${className}`}
      aria-describedby={id}
    >
      {children}
      <span className="tooltip-content" id={id} role="tooltip">
        {label}
      </span>
    </span>
  );
}
