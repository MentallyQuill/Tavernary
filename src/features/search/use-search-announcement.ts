import { useEffect, useState } from "react";

export function useSearchAnnouncement(message: string, delayMs = 250) {
  const [announcement, setAnnouncement] = useState(message);
  useEffect(() => {
    const timer = window.setTimeout(() => setAnnouncement(message), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, message]);
  return announcement;
}
