import { applyRoadClassDefaults } from './settlementEditor';

function containsPoint(points, x, y) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const a = points[index], b = points[previous];
    if ((a.y > y) !== (b.y > y) &&
      x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function polygonArea(points) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

export function regionalRoadSurfaceForSegment(points, index, roadClass, regions, classSurface, closed = false) {
  const start = points?.[index], end = points?.[index + 1] || (closed ? points?.[0] : null);
  if (!start || !end) return classSurface;
  const x = (Number(start.x) + Number(end.x)) / 2;
  const y = (Number(start.y) + Number(end.y)) / 2;
  const matching = (regions || []).filter(region => region.points?.length >= 3 &&
    region.road_material_defaults?.[roadClass] &&
    containsPoint(region.points, x, y));
  matching.sort((a, b) => polygonArea(a.points) - polygonArea(b.points));
  return matching[0]?.road_material_defaults[roadClass] || classSurface;
}

export function applyRegionalRoadClassDefaults(road, defaults, regions) {
  const updated = applyRoadClassDefaults(road, defaults);
  return { ...updated, segments: updated.segments.map((segment, index) => ({
    ...segment,
    surface_type: regionalRoadSurfaceForSegment(updated.points, index,
      updated.road_class || 'street', regions, defaults.surface, updated.closed)
  })) };
}
