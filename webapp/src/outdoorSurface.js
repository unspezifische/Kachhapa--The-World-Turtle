import polygonClipping from 'polygon-clipping';

const close = points => {
  const ring = points.map(point => [Number(point.x), Number(point.y)]);
  if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push([...ring[0]]);
  return ring;
};

// Later areas win ties. A higher priority area masks every lower one.
export function visibleOutdoorAreas(areas = []) {
  const ordered = areas.map((area, index) => ({ area, index }))
    .filter(({ area }) => Array.isArray(area.polygon) && area.polygon.length >= 3)
    .sort((a, b) => (Number(b.area.layering_priority) || 0) - (Number(a.area.layering_priority) || 0) || b.index - a.index);
  let mask = null;
  return ordered.map(({ area, index }) => {
    const shape = [[close(area.polygon)]];
    let polygons;
    try {
      polygons = mask ? polygonClipping.difference(shape, mask) : shape;
      mask = mask ? polygonClipping.union(mask, shape) : shape;
    } catch {
      // Preserve the source area if a malformed legacy polygon cannot be clipped.
      polygons = shape;
    }
    return { area, index, polygons };
  });
}

export function drapedOutdoorTriangles(points, triangleIndices, sampleHeight, area, layerOffset = 0) {
  const lengths = [];
  for (let index = 0; index < triangleIndices.length; index += 3) {
    const triangle = triangleIndices.slice(index, index + 3).map(vertex => points[vertex]);
    for (let edge = 0; edge < 3; edge += 1) {
      const first = triangle[edge], second = triangle[(edge + 1) % 3];
      lengths.push(Math.hypot(second[0] - first[0], second[1] - first[1]));
    }
  }
  const detail = area.elevation_mode === 'constant' ? 1 : Math.max(1, Math.min(
    12, Math.ceil(Math.max(0, ...lengths) / 15), Math.floor(Math.sqrt(20000 / Math.max(1, triangleIndices.length / 3))),
  ));
  const positions = [];
  const indices = [];
  const height = (x, y) => (area.elevation_mode === 'constant' ? Number(area.elevation) || 0 : sampleHeight(x, y)) + layerOffset;
  const add = point => {
    const [x, y] = point;
    indices.push(positions.length / 3);
    positions.push(x, height(x, y), y);
  };
  for (let index = 0; index < triangleIndices.length; index += 3) {
    const [a, b, c] = triangleIndices.slice(index, index + 3).map(vertex => points[vertex]);
    const grid = (u, v) => [
      a[0] + (b[0] - a[0]) * u / detail + (c[0] - a[0]) * v / detail,
      a[1] + (b[1] - a[1]) * u / detail + (c[1] - a[1]) * v / detail,
    ];
    for (let u = 0; u < detail; u += 1) {
      for (let v = 0; v < detail - u; v += 1) {
        add(grid(u, v)); add(grid(u + 1, v)); add(grid(u, v + 1));
        if (u + v < detail - 1) {
          add(grid(u + 1, v)); add(grid(u + 1, v + 1)); add(grid(u, v + 1));
        }
      }
    }
  }
  return { positions, indices };
}
