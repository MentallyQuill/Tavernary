export type Point = { x: number; y: number };
export type DragRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

export function exceedsDragThreshold(
  origin: Point,
  current: Point,
  threshold = 4,
) {
  const deltaX = current.x - origin.x;
  const deltaY = current.y - origin.y;
  return deltaX * deltaX + deltaY * deltaY >= threshold * threshold;
}

export function isOutsideEditor(point: Point, editor: DragRect) {
  return (
    point.x < editor.left ||
    point.x > editor.right ||
    point.y < editor.top ||
    point.y > editor.bottom
  );
}

export function stackTargetIndex(
  pointerY: number,
  rows: readonly { index: number; rect: DragRect }[],
  sourceIndex: number,
) {
  const remainingRows = rows.filter(({ index }) => index !== sourceIndex);
  return remainingRows.reduce(
    (target, { rect }) =>
      pointerY >= rect.top + rect.height / 2 ? target + 1 : target,
    0,
  );
}
