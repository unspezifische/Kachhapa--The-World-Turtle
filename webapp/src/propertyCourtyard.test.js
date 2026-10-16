import { addSkyCourtyard, automaticRoofFootprints, moveSkyCourtyardVertex, normalizeBlueprint, normalizeRoof, removeSkyCourtyard } from './buildingBlueprint';

const square = (x1, y1, x2, y2) => [
  { x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 },
];

test('open-to-sky courtyard cuts every affected floor and automatic roof', () => {
  const hole = square(8, 8, 12, 12);
  const source = { id: 'house', x: 0, y: 0, coordinate_space: 'local', levels: [
    { id: 'ground', elevation_feet: 0, floor_height: 10, corners: square(0, 0, 20, 20), floor_voids: [{ id: 'sky', kind: 'open_to_sky', points: hole }] },
    { id: 'upper', elevation_feet: 10, floor_height: 10, corners: square(0, 0, 20, 20), floor_voids: [{ id: 'sky', kind: 'open_to_sky', points: hole }] },
  ] };
  const building = normalizeBlueprint(source);
  expect(building.levels.every(level => level.floor_voids.some(item => item.kind === 'open_to_sky'))).toBe(true);
  const roofs = automaticRoofFootprints(building);
  expect(roofs.some(roof => roof.holes.some(ring => ring.length === 4 && ring[0].x === 8))).toBe(true);
  const authored = normalizeRoof({ id: 'roof', type: 'flat', support_level_id: 'upper', footprint: square(0, 0, 20, 20) }, building);
  expect(authored.holes).toHaveLength(1);
  expect(normalizeRoof(authored, building).holes).toHaveLength(1);
});

test('courtyard edits keep floor holes and facing walls aligned across levels', () => {
  const base = { id: 'house', levels: [
    { id: 'basement', elevation_feet: -10, floor_voids: [], walls: [] },
    { id: 'ground', elevation_feet: 0, floor_voids: [], walls: [] },
    { id: 'upper', elevation_feet: 10, floor_voids: [], walls: [] },
  ] };
  const added = addSkyCourtyard(base, 0, square(8, 8, 12, 12), 'sky');
  expect(added.levels[0].floor_voids).toEqual([]);
  expect(added.levels[1].walls).toHaveLength(4);
  expect(added.levels[2].floor_voids[0].id).toBe('sky');
  const moved = moveSkyCourtyardVertex(added, 'sky', 0, { x: 7, y: 7 });
  expect(moved.levels[1].floor_voids[0].points[0]).toEqual({ x: 7, y: 7 });
  expect(moved.levels[2].walls[0].start).toEqual({ x: 7, y: 7 });
  expect(removeSkyCourtyard(moved, 'sky').levels[2].walls).toEqual([]);
});
