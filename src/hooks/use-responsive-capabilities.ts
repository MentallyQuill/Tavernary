"use client";

import { useEffect, useState } from "react";

const PHONE_QUERY = "(max-width: 760px)";
const TOUCH_LAYOUT_QUERY = "(max-width: 1050px), (pointer: coarse)";

export function useResponsiveCapabilities() {
  const [capabilities, setCapabilities] = useState({
    phone: false,
    touchLayout: false,
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const phoneQuery = window.matchMedia(PHONE_QUERY);
    const touchLayoutQuery = window.matchMedia(TOUCH_LAYOUT_QUERY);
    const update = () =>
      setCapabilities({
        phone: phoneQuery.matches,
        touchLayout: touchLayoutQuery.matches,
      });

    update();
    phoneQuery.addEventListener("change", update);
    touchLayoutQuery.addEventListener("change", update);
    return () => {
      phoneQuery.removeEventListener("change", update);
      touchLayoutQuery.removeEventListener("change", update);
    };
  }, []);

  return capabilities;
}
