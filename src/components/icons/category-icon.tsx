import type { SVGProps } from "react";

type IconName =
  | "all"
  | "frontend"
  | "memory-retrieval"
  | "generation-reasoning"
  | "character-worldbuilding"
  | "rpg-systems"
  | "interface-workflow"
  | "developer-infrastructure"
  | "filter"
  | "community"
  | "search"
  | "feather"
  | "close";

export function CategoryIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  const common = {
    "aria-hidden": true,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "frontend") {
    return (
      <svg {...common} {...props}>
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M8 21h8M12 18v3M7 9h10" />
      </svg>
    );
  }
  if (name === "memory-retrieval") {
    return (
      <svg {...common} {...props}>
        <path d="M12 5a3 3 0 0 0-5.8-1A4 4 0 0 0 4 11a4 4 0 0 0 2 7.5A2.5 2.5 0 0 0 12 20Z" />
        <path d="M12 5a3 3 0 0 1 5.8-1A4 4 0 0 1 20 11a4 4 0 0 1-2 7.5A2.5 2.5 0 0 1 12 20ZM8 9h4m-3 5h3m4-5h-4m3 5h-3" />
      </svg>
    );
  }
  if (name === "generation-reasoning") {
    return (
      <svg {...common} {...props}>
        <path d="M4 5h16v11H9l-5 4Z" />
        <path d="M8 9h8M8 12h5" />
      </svg>
    );
  }
  if (name === "character-worldbuilding") {
    return (
      <svg {...common} {...props}>
        <circle cx="12" cy="8" r="3" />
        <path d="M5 20c.7-4 3-6 7-6s6.3 2 7 6M4 4l2 2m14-2-2 2" />
      </svg>
    );
  }
  if (name === "rpg-systems") {
    return (
      <svg {...common} {...props}>
        <path d="m12 2 8 6-3 11H7L4 8Z" />
        <path d="m12 2-2 8 7 9m3-11-10 2-3 9m3-9 2 8" />
      </svg>
    );
  }
  if (name === "interface-workflow") {
    return (
      <svg {...common} {...props}>
        <path d="M5 4h14v5H5zM5 13h6v7H5zM15 13h4v7h-4z" />
      </svg>
    );
  }
  if (name === "developer-infrastructure") {
    return (
      <svg {...common} {...props}>
        <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-2-12-4 14" />
      </svg>
    );
  }
  if (name === "filter") {
    return (
      <svg {...common} {...props}>
        <path d="M4 5h16l-6 7v6l-4 2v-8Z" />
      </svg>
    );
  }
  if (name === "community") {
    return (
      <svg {...common} {...props}>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="10" r="2" />
        <path d="M3 20c0-4 2-6 6-6s6 2 6 6m0-5c3 0 5 1.7 5 5" />
      </svg>
    );
  }
  if (name === "search") {
    return (
      <svg {...common} {...props}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </svg>
    );
  }
  if (name === "feather") {
    return (
      <svg {...common} {...props}>
        <path d="M20 3C12 3 5 7 5 15v4m0-4 8-7m-6 5h6m-3-3h6M3 21l2-2" />
      </svg>
    );
  }
  if (name === "close") {
    return (
      <svg {...common} {...props}>
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    );
  }
  return (
    <svg {...common} {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}
