import { createRoom, defaultsForRoomPurpose, findCapableRooms, roomBoundaryFromWalls, roomDestination, roomInteriorPoint } from './settlementRooms';

test('manual bedroom has a stable semantic destination and access rules', () => {
  const building = { id: 'house', x: 100, y: 200, elevation: 6, rotation: 0 };
  const level = { id: 'upper', elevation_feet: 10 };
  const room = createRoom(building, level, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], 'Bedroom');
  expect(room.access_policy).toBe('residents');
  const saved = JSON.parse(JSON.stringify({ ...building, levels: [{ ...level, rooms: [room] }] }));
  expect(findCapableRooms([saved], 'sleep', { resident: false })).toEqual([]);
  const [found] = findCapableRooms([saved], 'sleep', { resident: true });
  expect(found.room.id).toBe(room.id);
  expect(roomDestination(building, level, room, 100).elevation_feet).toBe(116);
  expect(found.destination.point).toEqual({ x: 105, y: 205 });
});

test('room purposes supply contextual access defaults without replacing a custom policy', () => {
  const business = { id: 'inn', business_type: 'tavern' };
  expect(defaultsForRoomPurpose({ purpose: 'Other', access_policy: 'public' }, 'Kitchen', business).access_policy).toBe('staff');
  expect(defaultsForRoomPurpose({ purpose: 'Kitchen', access_policy: 'staff' }, 'Bedroom', business).access_policy).toBe('residents');
  expect(defaultsForRoomPurpose({ purpose: 'Bedroom', access_policy: 'restricted' }, 'Kitchen', business).access_policy).toBe('restricted');
});

test('selected walls resolve into a closed room boundary regardless of selection order', () => {
  const wall = (id, start, end) => ({ id, type: 'line', start, end });
  const walls = [
    wall('south', { x: 0, y: 0 }, { x: 10, y: 0 }),
    wall('east', { x: 10, y: 0 }, { x: 10, y: 10 }),
    wall('north', { x: 10, y: 10 }, { x: 0, y: 10 }),
    wall('west', { x: 0, y: 10 }, { x: 0, y: 0 }),
  ];
  const resolved = roomBoundaryFromWalls(walls, ['north', 'south', 'west', 'east']);
  expect(resolved.error).toBeNull();
  expect(resolved.region).toHaveLength(4);
  expect(roomBoundaryFromWalls(walls, ['south', 'east', 'north']).error).toMatch(/closed room/);

  const splitAtDivider = roomBoundaryFromWalls([
    wall('south', { x: 0, y: 0 }, { x: 20, y: 0 }),
    wall('north', { x: 20, y: 10 }, { x: 0, y: 10 }),
    wall('west', { x: 0, y: 10 }, { x: 0, y: 0 }),
    wall('divider', { x: 10, y: 0 }, { x: 10, y: 10 }),
  ], ['south', 'north', 'west', 'divider']);
  expect(splitAtDivider.error).toBeNull();
  expect(Math.max(...splitAtDivider.region.map(point => point.x))).toBe(10);
});

test('a concave room target lies within the region', () => {
  const region = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 6 }, { x: 0, y: 6 }];
  expect(roomInteriorPoint(region)).not.toBeNull();
});
