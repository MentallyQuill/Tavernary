"use client";

import Link from "next/link";
import { useId } from "react";

import { Tooltip } from "@/components/ui/tooltip";

function CoffeeIcon() {
  return (
    <svg
      className="kofi-support-icon"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 8h13v6.5A4.5 4.5 0 0 1 12.5 19h-4A4.5 4.5 0 0 1 4 14.5V8Z" />
      <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 5.5c0-1 1-1 1-2M12 5.5c0-1 1-1 1-2" />
    </svg>
  );
}

export function KoFiSupport() {
  const tooltipId = useId();

  return (
    <Tooltip
      id={tooltipId}
      label="Buy Me a Ko-Fi"
      className="kofi-support-tooltip"
    >
      <Link
        href="/support/"
        className="kofi-support-trigger"
        aria-label="Buy Me a Ko-Fi"
      >
        <CoffeeIcon />
        <span className="kofi-support-label">Buy Me a Ko-Fi</span>
      </Link>
    </Tooltip>
  );
}
