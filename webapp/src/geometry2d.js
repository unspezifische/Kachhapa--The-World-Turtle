export function closestPointOnSegment2d(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  const t = lengthSquared > 0.000001
    ? Math.max(0, Math.min(1, (
      (point.x - start.x) * dx + (point.y - start.y) * dy
    ) / lengthSquared))
    : 0;

  const closest = {
    x: start.x + dx * t,
    y: start.y + dy * t,
  };

  return {
    point: closest,
    t,
    distance: Math.hypot(point.x - closest.x, point.y - closest.y),
  };
}
