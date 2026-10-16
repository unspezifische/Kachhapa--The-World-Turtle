import { createRoom, findCapableRooms, roomDestination, roomInteriorPoint } from './settlementRooms';

test('manual bedroom has a stable semantic destination and access rules', () => {
  const building = { id: 'house', x: 100, y: 200, elevation: 6, rotation: 0 };
  const level = { id: 'upper', elevation_feet: 10 };
  const room = { ...createRoom(building, level, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], 'Bedroom'), access_policy: 'residents' };
  const saved = JSON.parse(JSON.stringify({ ...building, levels: [{ ...level, rooms: [room] }] }));
  expect(findCapableRooms([saved], 'sleep', { resident: false })).toEqual([]);
  const [found] = findCapableRooms([saved], 'sleep', { resident: true });
  expect(found.room.id).toBe(room.id);
  expect(roomDestination(building, level, room, 100).elevation_feet).toBe(116);
  expect(found.destination.point).toEqual({ x: 105, y: 205 });
});

test('a concave room target lies within the region', () => {
  const region = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 6 }, { x: 0, y: 6 }];
  expect(roomInteriorPoint(region)).not.toBeNull();
});
