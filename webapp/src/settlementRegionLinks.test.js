import { appendTracedBoundaryPoint, nearestSplinePoint, resolveLinkedRegion, sourceCenterline } from './settlementRegionLinks';

const roads = [
  { id: 'south', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
  { id: 'east', points: [{ x: 100, y: 0 }, { x: 100, y: 100 }] },
  { id: 'north', points: [{ x: 100, y: 100 }, { x: 0, y: 100 }] },
  { id: 'west', points: [{ x: 0, y: 100 }, { x: 0, y: 0 }] },
];

function tracedSquare() {
  let draft = [];
  for (const point of [{ x: 20, y: 0 }, { x: 100, y: 10 }, { x: 90, y: 100 },
    { x: 0, y: 90 }, { x: 10, y: 0 }]) {
    draft = appendTracedBoundaryPoint(draft, point, roads, [], 5);
  }
  return resolveLinkedRegion({ id: 'ward', boundary_anchors: draft, points: draft }, roads);
}

test('snapping follows the rendered curve between its control points', () => {
  const curved = { id: 'curve', points: [{ x: 0, y: 0 }, { x: 50, y: 80 }, { x: 100, y: 0 }] };
  const path = sourceCenterline({ kind: 'road', id: 'curve' }, [curved]);
  const point = path[Math.floor((path.length - 1) / 4)];
  expect(point.y - point.x * 1.6).toBeGreaterThan(5);
  expect(nearestSplinePoint(point, [curved], [], 0.1)).toMatchObject({ x: point.x, y: point.y });
});

test('tracing switches at intersections and closes along the starting road', () => {
  const region = tracedSquare();
  expect(region.boundary_needs_repair).toBe(false);
  expect(region.boundary_anchors[1]).toMatchObject({ x: 100, y: 0, incoming: { id: 'south' }, outgoing: { id: 'east' } });
  expect(region.boundary_edges.map(edge => edge.source_id)).toEqual(['south', 'east', 'north', 'west', 'south']);
  expect(region.points).toEqual(expect.arrayContaining([
    expect.objectContaining({ x: 100, y: 0 }), expect.objectContaining({ x: 0, y: 100 })
  ]));
  expect(region.points.length).toBeLessThan(10);
  expect(resolveLinkedRegion(JSON.parse(JSON.stringify(region)), roads)).toEqual(region);
});

test('linked ward borders move with roads and retain their last valid shape if a source disappears', () => {
  const region = tracedSquare();
  const shifted = roads.map(road => ({ ...road, points: road.points.map(point => ({ x: point.x + 10, y: point.y })) }));
  const moved = resolveLinkedRegion(region, shifted);
  expect(moved.points[0].x).toBeCloseTo(region.points[0].x + 10);
  expect(moved.boundary_anchors[1].x).toBeCloseTo(110);
  expect(moved.boundary_anchors[1].y).toBeCloseTo(0);
  expect(resolveLinkedRegion(moved, shifted.map(road => ({ ...road, visible: false }))).boundary_needs_repair).toBe(false);
  const broken = resolveLinkedRegion(moved, shifted.filter(road => road.id !== 'east'));
  expect(broken.points).toEqual(moved.points);
  expect(broken.boundary_needs_repair).toBe(true);
  expect(broken.boundary_edges.some(edge => edge.needs_repair)).toBe(true);
  const disconnected = resolveLinkedRegion(moved, shifted.map(road => road.id === 'east'
    ? { ...road, points: road.points.map(point => ({ ...point, x: point.x + 100 })) } : road));
  expect(disconnected.boundary_needs_repair).toBe(true);
  expect(disconnected.points).toEqual(moved.points);
});

test('city walls use the same tracing flow and tower corners remain exact', () => {
  const walls = [{ id: 'wall', points: [{ x: 0, y: 0 }, { x: 100, y: 0, tower: true }, { x: 100, y: 100 }] }];
  const path = sourceCenterline({ kind: 'wall', id: 'wall' }, [], walls);
  expect(path.some(point => point.x === 100 && point.y === 0)).toBe(true);
  const draft = appendTracedBoundaryPoint([], { x: 50, y: 1 }, [], walls, 5);
  expect(draft[0].outgoing).toEqual({ kind: 'wall', id: 'wall' });
});
