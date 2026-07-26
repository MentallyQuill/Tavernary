"use client";

import { useEffect, useRef } from "react";

import type { KitShareFeedback } from "@/features/kits/use-kit-share-feedback";

export function KitShareNotice({
  feedback,
}: {
  feedback: KitShareFeedback;
}): React.ReactNode {
  const fallbackRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (feedback.phase === "fallback") fallbackRef.current?.select();
  }, [feedback]);

  if (feedback.phase === "idle") return null;

  const message =
    feedback.phase === "copied"
      ? "Kit URL copied to clipboard"
      : "Couldn't copy automatically. Select the URL below.";

  return (
    <aside
      key={feedback.sequence}
      className="kit-share-notice"
      data-tone={feedback.phase}
      role="status"
      aria-label={message}
      aria-live="polite"
      aria-atomic="true"
    >
      <span>{message}</span>
      {feedback.phase === "fallback" ? (
        <input
          ref={fallbackRef}
          aria-label="Kit link"
          readOnly
          value={feedback.url}
          onFocus={(event) => event.currentTarget.select()}
        />
      ) : null}
    </aside>
  );
}
