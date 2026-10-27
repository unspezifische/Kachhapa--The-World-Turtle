import { detectRooms, reconcileDetectedRooms } from './roomDetection';

const point = (x, y) => ({ x, y });
const line = (id, x1, y1, x2, y2) => ({ id, type: 'line', start: point(x1, y1), end: point(x2, y2) });
const floor = {
  id: 'ground',
  corners: [point(0, 0), point(20, 0), point(20, 10), point(0, 10)],
  outline: [line('south', 0, 0, 20, 0), line('east', 20, 0, 20, 10), line('north', 20, 10, 0, 10), line('west', 0, 10, 0, 0)],
  walls: [line('divider', 10, 0, 10, 10)],
  rooms: [],
};

test('detects two closed rooms divided by a wall and preserves semantic ID after a nudge', () => {
  const building = { id: 'house' };
  const first = detectRooms(building, floor);
  expect(first.candidates).toHaveLength(2);
  const saved = reconcileDetectedRooms(building, floor, first.candidates).rooms;
  const named = { ...floor, rooms: saved.map((room, index) => index === 0 ? { ...room, name: 'Bedroom', purpose: 'Bedroom', activity_capabilities: ['sleep'] } : room) };
  const nudged = { ...named, walls: [line('divider', 10.2, 0, 10.2, 10)] };
  const detected = detectRooms(building, nudged);
  const reconciled = reconcileDetectedRooms(building, nudged, detected.candidates);
  expect(reconciled.rooms.find(room => room.id === saved[0].id).name).toBe('Bedroom');
  expect(reconciled.rooms.find(room => room.id === saved[0].id).activity_capabilities).toEqual(['sleep']);
});

test('open wall does not silently erase a named room', () => {
  const building = { id: 'house' };
  const named = { ...floor, rooms: [{ id: 'room-1', name: 'Study', region: [point(0, 0), point(10, 0), point(10, 10), point(0, 10)] }] };
  const broken = { ...named, walls: [line('short', 10, 2, 10, 8)] };
  const result = reconcileDetectedRooms(building, broken, detectRooms(building, broken).candidates);
  expect(result.rooms.some(room => room.id === 'room-1')).toBe(true);
  expect(result.warnings.length).toBeGreaterThan(0);
});

test('locked room corrections keep their geometry and report topology disagreement', () => {
  const lockedRegion = [point(0, 0), point(9, 0), point(9, 10), point(0, 10)];
  const existing = { ...floor, rooms: [{
    id: 'room-locked', name: 'Library', purpose: 'Library', floor_material: 'wood',
    region: lockedRegion, boundary_source: 'manual', boundary_locked: true,
  }] };
  const reconciled = reconcileDetectedRooms({ id: 'house' }, existing, detectRooms({ id: 'house' }, existing).candidates);
  const room = reconciled.rooms.find(item => item.id === 'room-locked');
  expect(room.region).toEqual(lockedRegion);
  expect(room.floor_material).toBe('wood');
  expect(room.detection_warning).toMatch(/differs/);
});

test('a wall-linked room follows its selected walls when the floor plan changes', () => {
  const linked = { ...floor, rooms: [{
    id: 'room-linked', name: 'West Room', purpose: 'Bedroom',
    region: [point(0, 0), point(10, 0), point(10, 10), point(0, 10)],
    boundary_wall_ids: ['south', 'north', 'west', 'divider'],
    boundary_source: 'walls', boundary_locked: true,
  }] };
  const moved = { ...linked, walls: [line('divider', 12, 0, 12, 10)] };
  const result = reconcileDetectedRooms({ id: 'house' }, moved, detectRooms({ id: 'house' }, moved).candidates);
  const room = result.rooms.find(item => item.id === 'room-linked');
  expect(Math.max(...room.region.map(vertex => vertex.x))).toBe(12);
  expect(room.boundary_wall_ids).toEqual(['south', 'north', 'west', 'divider']);
});

test('switching a wall-linked room to automatic detection uses its live wall geometry', () => {
  const linked = { ...floor, rooms: [{
    id: 'room-linked', name: 'West Room', purpose: 'Bedroom',
    // This cached polygon is deliberately stale. The wall links are the source
    // of truth during the transition to automatic detection.
    region: [point(0, 0), point(4, 0), point(4, 4), point(0, 4)],
    boundary_wall_ids: ['south', 'north', 'west', 'divider'],
    boundary_source: 'auto', boundary_locked: false,
  }] };
  const result = reconcileDetectedRooms({ id: 'house' }, linked, detectRooms({ id: 'house' }, linked).candidates);
  const room = result.rooms.find(item => item.id === 'room-linked');

  expect(result.warnings).not.toEqual(expect.arrayContaining([expect.stringMatching(/no longer matches/)]));
  expect(room.boundary_source).toBe('auto');
  expect(room.boundary_locked).toBe(false);
  expect(room.boundary_wall_ids).toBeUndefined();
  expect(Math.max(...room.region.map(vertex => vertex.x))).toBe(10);
});

test('L-shaped footprint and corridor faces are found under straight-wall topology', () => {
  const concave = {
    id: 'ground', corners: [point(0, 0), point(20, 0), point(20, 8), point(8, 8), point(8, 20), point(0, 20)],
    outline: [line('a', 0, 0, 20, 0), line('b', 20, 0, 20, 8), line('c', 20, 8, 8, 8), line('d', 8, 8, 8, 20), line('e', 8, 20, 0, 20), line('f', 0, 20, 0, 0)],
  };
  expect(detectRooms({ id: 'house' }, concave).candidates).toHaveLength(1);
  const corridor = { ...floor, walls: [line('left', 8, 0, 8, 10), line('right', 12, 0, 12, 10)] };
  expect(detectRooms({ id: 'house' }, corridor).candidates).toHaveLength(3);
});

test('interior courtyard detection stops safely and preserves manual editing path', () => {
  const courtyard = { ...floor, floor_voids: [{ id: 'sky', kind: 'open_to_sky', points: [point(8, 3), point(12, 3), point(12, 7), point(8, 7)] }] };
  const result = detectRooms({ id: 'house' }, courtyard);
  expect(result.candidates).toEqual([]);
  expect(result.warnings[0]).toMatch(/Draw rooms manually/);
});
