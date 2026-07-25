import { describe, expect, test } from "vitest";

import {
  dragHandleAnchor,
  exceedsDragThreshold,
  isOutsideEditor,
  stackTargetIndex,
} from "@/features/kits/project-stack-drag-geometry";

describe("project stack drag geometry", () => {
  test("anchors the drag ghost under the center of the handle", () => {
    const source = {
      top: 100,
      right: 420,
      bottom: 164,
      left: 120,
      width: 300,
      height: 64,
    };
    const handle = {
      top: 110,
      right: 174,
      bottom: 154,
      left: 130,
      width: 44,
      height: 44,
    };

    expect(dragHandleAnchor(source, handle)).toEqual({ x: 32, y: 32 });
  });

  test("activates at four CSS pixels of movement", () => {
    expect(exceedsDragThreshold({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false);
    expect(exceedsDragThreshold({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
  });

  test("arms removal only after crossing the inclusive editor boundary", () => {
    const editor = {
      top: 0,
      right: 100,
      bottom: 100,
      left: 0,
      width: 100,
      height: 100,
    };
    expect(isOutsideEditor({ x: 100, y: 50 }, editor)).toBe(false);
    expect(isOutsideEditor({ x: 101, y: 50 }, editor)).toBe(true);
  });

  test("maps midpoint crossings to a physical-gap target index", () => {
    const rows = [
      {
        index: 0,
        rect: {
          top: 0,
          right: 100,
          bottom: 40,
          left: 0,
          width: 100,
          height: 40,
        },
      },
      {
        index: 1,
        rect: {
          top: 50,
          right: 100,
          bottom: 90,
          left: 0,
          width: 100,
          height: 40,
        },
      },
      {
        index: 2,
        rect: {
          top: 100,
          right: 100,
          bottom: 140,
          left: 0,
          width: 100,
          height: 40,
        },
      },
    ];
    expect(stackTargetIndex(10, rows, 1)).toBe(0);
    expect(stackTargetIndex(60, rows, 1)).toBe(1);
    expect(stackTargetIndex(130, rows, 1)).toBe(2);
  });
});
