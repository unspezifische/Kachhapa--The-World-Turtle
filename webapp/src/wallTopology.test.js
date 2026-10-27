import { arcFromThreePoints, snapPointToOutline, wallPointAtDistance, wallLength } from './buildingBlueprint';
import { buildWallTopology, isSimpleRoomPolygon, repairWallConnections, wallConnectionDiagnostics } from './wallTopology';
import { detectRooms, reconcileDetectedRooms } from './roomDetection';
import { roomBoundaryFromWalls } from './settlementRooms';

const p = (x, y) => ({ x, y });
const line = (id, start, end) => ({ id, type: 'line', start, end });
const outline = [line('south', p(0, 0), p(20, 0)), line('east', p(20, 0), p(20, 10)), line('north', p(20, 10), p(0, 10)), line('west', p(0, 10), p(0, 0))];
const floor = walls => ({ id: 'ground', outline, walls, corners: outline.map(w => w.start), rooms: [] });
const circle = (radius, offset = 0) => {
  const at = a => p(offset + radius * Math.cos(a), radius * Math.sin(a));
  return Array.from({ length: 4 }, (_, i) => arcFromThreePoints(at(i * Math.PI / 2), at((i + 1) * Math.PI / 2), at((i + 0.5) * Math.PI / 2), { id: `arc-${offset}-${i}` }));
};

test.each([0, 0.099, 0.1, 0.1001, 0.5])('a divider gap of %s produces valid polygons without changing walls', gap => {
  const level = floor([line('divider', p(10, 0), p(10, 10 - gap))]);
  const before = JSON.stringify(level);
  const result = detectRooms({ id: 'house' }, level);
  expect(result.candidates).toHaveLength(gap <= 0.1 ? 2 : 1);
  result.candidates.forEach(region => expect(isSimpleRoomPolygon(region)).toBe(true));
  expect(JSON.stringify(level)).toBe(before);
});

test('dangling walls and bridges never become doubled-back room boundaries', () => {
  const level = floor([line('spur', p(10, 0), p(10, 5))]);
  const result = buildWallTopology([...outline, ...level.walls]);
  expect(result.faces).toHaveLength(1);
  expect(result.faces[0].wallIds).not.toContain('spur');
  expect(isSimpleRoomPolygon(result.faces[0].region)).toBe(true);
});

test('nearby endpoints weld by distance even across rounding buckets', () => {
  const walls = [line('south', p(0, 0), p(10.049, 0)), line('east', p(10.051, 0), p(10, 10)),
    line('north', p(10, 10), p(0, 10)), line('west', p(0, 10), p(0, 0))];
  expect(buildWallTopology(walls).faces).toHaveLength(1);
  walls[0].end = p(10, 0);
  walls[1].start = p(10.05, 0.05);
  expect(buildWallTopology(walls).faces).toHaveLength(1);
});

test('T-junctions, crossings and overlapping edges retain all wall identities', () => {
  const walls = [...outline, line('vertical', p(10, 0), p(10, 10)), line('horizontal', p(0, 5), p(20, 5)), line('overlap', p(10, 2), p(10, 8))];
  const { faces } = buildWallTopology(walls);
  expect(faces).toHaveLength(4);
  expect(faces.every(face => isSimpleRoomPolygon(face.region))).toBe(true);
  expect(faces.every(face => face.wallIds.includes('overlap'))).toBe(true);
});

test.each([2, 5, 10, 20])('analytic arc snapping and detection agree for a %s ft circular exterior', radius => {
  const arcs = circle(radius);
  const x = radius * 0.57, y = Math.sqrt(radius ** 2 - x ** 2);
  const a = snapPointToOutline(p(x, -y), arcs, 0.2).point;
  const b = snapPointToOutline(p(x, y), arcs, 0.2).point;
  expect(Math.hypot(a.x, a.y)).toBeCloseTo(radius, 8);
  const level = { id: 'ground', outline: arcs, corners: arcs.map(w => w.start), walls: [line('divider', a, b)] };
  const { faces } = buildWallTopology([...arcs, ...level.walls]);
  expect(detectRooms({ id: 'house' }, level).candidates).toHaveLength(2);
  faces.forEach(face => {
    expect(isSimpleRoomPolygon(face.region)).toBe(true);
    expect(roomBoundaryFromWalls([...arcs, ...level.walls], face.wallIds).region).toEqual(face.region);
  });
});

test('a single arc and a line can enclose a valid room', () => {
  const arc = arcFromThreePoints(p(20, 0), p(0, 0), p(10, 10), { id: 'arc' });
  const level = { id: 'ground', outline: [line('base', p(0, 0), p(20, 0)), arc], walls: [] };
  expect(detectRooms({ id: 'house' }, level).candidates).toHaveLength(1);
  expect(roomBoundaryFromWalls(level.outline, ['base', 'arc']).error).toBeNull();
});

test('arc-arc intersections are inserted into both sampled paths', () => {
  const { faces } = buildWallTopology([...circle(10), ...circle(10, 8)]);
  expect(faces).toHaveLength(3);
  expect(faces.every(face => isSimpleRoomPolygon(face.region))).toBe(true);
});

test('selected long exterior walls resolve only their contributing room segments', () => {
  const walls = [...outline, line('divider', p(10, 0), p(10, 10))];
  const region = roomBoundaryFromWalls(walls, ['south', 'north', 'west', 'divider']).region;
  expect(Math.max(...region.map(point => point.x))).toBe(10);
  const overlapping = [...walls, line('duplicate-divider', p(10, 2), p(10, 8))];
  const resolved = roomBoundaryFromWalls(overlapping, ['south', 'north', 'west', 'divider']);
  expect(resolved.error).toBeNull();
  expect(Math.max(...resolved.region.map(point => point.x))).toBe(10);
  expect(isSimpleRoomPolygon(resolved.region)).toBe(true);
});

test('repair is explicit, preserves IDs and door centers, and leaves its input unchanged', () => {
  const level = { ...floor([line('divider', p(10, 0.5), p(10, 9.5))]), openings: [{ id: 'door', wall_id: 'divider', distance_from_start: 4, width: 3 }] };
  const before = JSON.stringify(level);
  const center = wallPointAtDistance(level.walls[0], 4);
  const result = repairWallConnections(level);
  expect(result.errors).toEqual([]);
  expect(result.level.walls[0]).toMatchObject({ id: 'divider', start: p(10, 0), end: p(10, 10) });
  expect(result.level.openings[0]).toMatchObject({ id: 'door', wall_id: 'divider' });
  expect(wallPointAtDistance(result.level.walls[0], result.level.openings[0].distance_from_start)).toEqual(center);
  expect(JSON.stringify(level)).toBe(before);
});

test('ambiguous repairs require a target and gaps over 2 ft are not repaired', () => {
  const level = floor([line('divider', p(0.5, 0.5), p(10, 5))]);
  expect(wallConnectionDiagnostics([...outline, ...level.walls]).find(gap => gap.wallId === 'divider' && gap.endpoint === 'start').targets).toHaveLength(2);
  expect(repairWallConnections(level).errors.join(' ')).toMatch(/Choose a target/);
  const repaired = repairWallConnections(level, { 'divider:start': 'south' });
  expect(repaired.errors).toEqual([]);
  expect(repaired.level.walls[0].end).toEqual(p(10, 5));
});

test('repair refuses to invalidate an opening or collapse a wall', () => {
  const level = { ...floor([line('divider', p(10, -0.5), p(10, 10))]), openings: [{ id: 'door', wall_id: 'divider', distance_from_start: 1, width: 2 }] };
  expect(repairWallConnections(level).errors.join(' ')).toMatch(/invalidate an opening/);
  expect(repairWallConnections(level).level).toBe(level);
  const collapse = { outline: [], walls: [line('small', p(0, 0), p(1, 0)), line('target', p(0.5, -10), p(0.5, 10))] };
  expect(repairWallConnections(collapse).errors.join(' ')).toMatch(/collapse/);
});

test('repair joins two separated endpoints instead of exchanging their positions', () => {
  const walls = [line('south', p(0, 0), p(10, 0)), line('east', p(10.5, 0.5), p(10, 10)),
    line('north', p(10, 10), p(0, 10)), line('west', p(0, 10), p(0, 0))];
  const result = repairWallConnections({ outline: walls, walls: [] });
  expect(result.errors).toEqual([]);
  expect(buildWallTopology(result.level.outline).faces).toHaveLength(1);
});

test('doors do not merge rooms and repeated refresh preserves room semantics', () => {
  const building = { id: 'house' };
  const level = { ...floor([line('divider', p(10, 0), p(10, 10))]), openings: [{ id: 'door', wall_id: 'divider', distance_from_start: 5, width: 3 }] };
  const detected = detectRooms(building, level);
  expect(detected.candidates).toHaveLength(2);
  const rooms = reconcileDetectedRooms(building, level, detected.candidates).rooms.map(room => ({ ...room, name: 'Bedroom', access_policy: 'residents' }));
  const refreshed = reconcileDetectedRooms(building, { ...level, rooms }, detected.candidates);
  expect(refreshed.rooms).toEqual(rooms);
  expect(refreshed.warnings).toEqual([]);
});

test('self-touching polygons are rejected before reconciliation', () => {
  const ring = [p(0, 0), p(10, 0), p(10, 5), p(10, 0), p(20, 0), p(20, 10), p(0, 10)];
  expect(isSimpleRoomPolygon(ring)).toBe(false);
  expect(reconcileDetectedRooms({ id: 'house' }, floor([]), [ring]).rooms).toEqual([]);
  const level = { ...floor([]), rooms: [{ id: 'old-room', name: 'Library', access_policy: 'residents',
    boundary_source: 'auto', boundary_locked: true, region: ring }] };
  const corrected = reconcileDetectedRooms({ id: 'house' }, level, detectRooms({ id: 'house' }, level).candidates);
  expect(corrected.rooms).toHaveLength(1);
  expect(corrected.rooms[0]).toMatchObject({ id: 'old-room', name: 'Library', access_policy: 'residents' });
  expect(isSimpleRoomPolygon(corrected.rooms[0].region)).toBe(true);
});

test('curved interior walls divide rooms at analytic line-arc junctions', () => {
  const arc = arcFromThreePoints(p(0, 0), p(20, 0), p(10, 5), { id: 'curved-divider' });
  expect(wallLength(arc)).toBeGreaterThan(20);
  expect(detectRooms({ id: 'house' }, floor([arc])).candidates).toHaveLength(2);
});
