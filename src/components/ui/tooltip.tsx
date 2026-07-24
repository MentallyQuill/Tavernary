import type { ReactNode } from "react";

export function Tooltip({
  id,
  label,
  children,
  className = "",
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`tooltip-anchor ${className}`} aria-describedby={id}>
      {children}
      <span className="tooltip-content" id={id} role="tooltip">
        {label}
      </span>
    </span>
  );
}
