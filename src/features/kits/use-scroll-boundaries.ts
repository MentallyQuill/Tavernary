import { type RefObject, useLayoutEffect, useState } from "react";

export type ScrollBoundaries = {
  canScrollDown: boolean;
  canScrollUp: boolean;
};

const settled: ScrollBoundaries = {
  canScrollDown: false,
  canScrollUp: false,
};

export function readScrollBoundaries(
  element: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">,
): ScrollBoundaries {
  const epsilon = 1;
  return {
    canScrollDown:
      element.scrollTop + element.clientHeight <
      element.scrollHeight - epsilon,
    canScrollUp: element.scrollTop > epsilon,
  };
}

export function useScrollBoundaries(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  contentKey: string,
): ScrollBoundaries {
  const [boundaries, setBoundaries] = useState(settled);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!active || !element) {
      setBoundaries(settled);
      return;
    }

    const update = () => {
      const next = readScrollBoundaries(element);
      setBoundaries((current) =>
        current.canScrollDown === next.canScrollDown &&
        current.canScrollUp === next.canScrollUp
          ? current
          : next,
      );
    };

    update();
    element.addEventListener("scroll", update, { passive: true });

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    if (element.firstElementChild instanceof HTMLElement) {
      observer?.observe(element.firstElementChild);
    }

    return () => {
      element.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [active, contentKey, ref]);

  return boundaries;
}
