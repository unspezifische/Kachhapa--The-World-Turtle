import { arcFromThreePoints, wallPolyline } from './buildingBlueprint';

const local = (building, point) => ({ x: point.x - building.x, y: point.y - building.y });
const straight = (start, end, id) => ({ id, type: 'line', start, end, thickness: 0.5 });
const same = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.001;

// Only the ground-floor footprint changes; the building ID and other data survive.
export function drawSceneFootprint(building, tool, points, worldPoint) {
  const point = local(building, worldPoint);
  const level = building.levels[0];
  if (level.closed) return { building, points: [] };
  const corners = level.corners || [];
  const outline = level.outline?.length ? [...level.outline] : corners.slice(1).map((end, index) =>
    straight(corners[index], end, `${building.id}-edge-${index}`));
  const commit = (nextCorners, nextOutline, closed = false) => {
    const bounds = nextOutline.flatMap(edge => wallPolyline(edge, 1));
    return ({
    building: { ...building,
      width_feet: Math.max(1, Math.max(...bounds.map(p => p.x)) - Math.min(...bounds.map(p => p.x))),
      depth_feet: Math.max(1, Math.max(...bounds.map(p => p.y)) - Math.min(...bounds.map(p => p.y))),
      levels: building.levels.map((value, index) => index ? value : { ...value, corners: nextCorners, outline: nextOutline, closed }) },
    points: [],
  });
  };
  if (tool === 'circle') {
    if (!points.length) return { building, points: [point] };
    const center = points[0];
    const radius = Math.hypot(point.x - center.x, point.y - center.y);
    if (radius < 1) return { building, points, error: 'Choose a radius of at least 1 ft.' };
    const at = angle => ({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
    const arcs = Array.from({ length: 4 }, (_, index) => arcFromThreePoints(at(index * Math.PI / 2), at((index + 1) * Math.PI / 2), at((index + 0.5) * Math.PI / 2), { id: `${building.id}-circle-${index}`, thickness: 0.5 }));
    return commit(arcs.map(arc => arc.start), arcs, true);
  }
  if (tool === 'arc') {
    const pending = points.length ? points : [corners[corners.length - 1]];
    if (pending.length === 1) {
      if (same(pending[0], point)) return { building, points: pending, error: 'Choose a different arc endpoint.' };
      return { building, points: [...pending, point] };
    }
    const arc = arcFromThreePoints(pending[0], pending[1], point, { id: `${building.id}-edge-${outline.length}`, thickness: 0.5 });
    if (!arc) return { building, points: pending, error: 'Choose a bend point away from the straight line.' };
    return commit([...corners, pending[1]], [...outline, arc]);
  }
  if (same(corners[corners.length - 1], point)) return { building, points: [] };
  return commit([...corners, point], [...outline, straight(corners[corners.length - 1], point, `${building.id}-edge-${outline.length}`)]);
}

export function sceneFootprintPreview(building, tool, points, hover) {
  if (!building) return [];
  const level = building.levels[0];
  const path = (level.outline || []).flatMap(edge => wallPolyline(edge, 2));
  if (!path.length) path.push(...(level.corners || []));
  if (hover && !level.closed) {
    const point = local(building, hover);
    if (tool === 'circle' && points.length) {
      const center = points[0], radius = Math.hypot(point.x - center.x, point.y - center.y);
      path.length = 0;
      for (let index = 0; index <= 64; index++) path.push({ x: center.x + radius * Math.cos(index * Math.PI / 32), y: center.y + radius * Math.sin(index * Math.PI / 32) });
    } else if (tool === 'arc' && points.length === 2) {
      const arc = arcFromThreePoints(points[0], points[1], point);
      path.push(...(arc ? wallPolyline(arc, 2) : points));
    } else path.push(...points, point);
  }
  return path.map(point => ({ x: point.x + building.x, y: point.y + building.y }));
}
