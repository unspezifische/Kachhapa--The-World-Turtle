import { normalizeWallTopology, updateFortificationSegment, insertOpenSplineControlPoint, deleteSplineControlPoint, attachedWallTower, restoreFortificationSegmentDefaults } from './settlementEditor';
import { fortificationVertexData, wallSegmentMaterialColor, wallSegmentBattlements } from './settlementBabylon';

const wall = () => ({ id: 'wall', wall_type: 'city_wall', width_feet: 10, height_feet: 20,
  points: [0, 100, 200, 300].map((x, i) => ({ x, y: 0, tower: i !== 1 })) });

test('span dimensions preserve roles, inherit defaults and survive JSON reload', () => {
  const updated = updateFortificationSegment(wall(), 1, { width_feet: 30, height_feet: 50, base_elevation_feet: 5 });
  expect(updated.points.map(p => p.tower)).toEqual([true, false, true, true]);
  const loaded = JSON.parse(JSON.stringify(updated));
  for (const [index, height] of [[0, 20], [1, 55], [2, 20]]) {
    const data = fortificationVertexData(loaded, [], null, () => 0, index);
    expect(Math.max(...data.positions.filter((_, i) => i % 3 === 1)) * 50).toBeCloseTo(height);
    const z = data.positions.filter((_, i) => i % 3 === 2);
    expect((Math.max(...z) - Math.min(...z)) * 50).toBeCloseTo(index === 1 ? 30 : 10);
  }
  expect(restoreFortificationSegmentDefaults(loaded, 1).segments[1]).toEqual({ id: loaded.segments[1].id });
});

test('insert and delete preserve other span IDs and tower attachment targets', () => {
  let original = normalizeWallTopology(wall());
  original.towers = [{ id: 'tower', point_id: original.points[2].point_id }];
  const inserted = insertOpenSplineControlPoint(original, { x: 50, y: 0 }, { tower: false }).item;
  expect(inserted.segments[0].id).toBe(original.segments[0].id);
  expect(inserted.segments[2].id).toBe(original.segments[1].id);
  expect(attachedWallTower(inserted, inserted.points[3], 3).id).toBe('tower');
  expect(attachedWallTower(inserted, inserted.points[1], 1)).toBeUndefined();
  const deleted = deleteSplineControlPoint(inserted, 1);
  expect(deleted.segments.map(s => s.id)).toEqual(original.segments.map(s => s.id));
  expect(deleted.towers[0].point_id).toBe(original.points[2].point_id);
});

test('missing point IDs never match unrelated towers and deleted attachments are marked', () => {
  expect(attachedWallTower({ towers: [{ id: 'a', point_index: 2 }] }, {}, 1)).toBeUndefined();
  const original = normalizeWallTopology(wall());
  original.towers = [{ id: 'tower', point_id: original.points[1].point_id }];
  const deleted = deleteSplineControlPoint(original, 1);
  expect(deleted.towers[0].attachment_needs_repair).toBe(true);
  expect(attachedWallTower(deleted, deleted.points[1], 1)).toBeUndefined();
});

test('material and battlement overrides affect only the selected span after reload', () => {
  const updated = JSON.parse(JSON.stringify(updateFortificationSegment(wall(), 1, {
    material: 'brick', battlements: false
  })));
  expect(wallSegmentMaterialColor(updated, 0)).toBe('#82786a');
  expect(wallSegmentMaterialColor(updated, 1)).toBe('#956454');
  expect(wallSegmentBattlements(updated, 1, () => 0)).toEqual([]);
  expect(wallSegmentBattlements(updated, 2, () => 7)).toHaveLength(8);
  expect(wallSegmentBattlements(updated, 2, () => 7)[0].elevation).toBe(29);
  const restored = restoreFortificationSegmentDefaults(updated, 1);
  expect(wallSegmentMaterialColor(restored, 1)).toBe('#82786a');
  expect(wallSegmentBattlements(restored, 1, () => 0).length).toBeGreaterThan(0);
});

test('span buffers close their ends and follow terrain with a foundation and base offset', () => {
  const updated = updateFortificationSegment(wall(), 2, { foundation_depth_feet: 3, base_elevation_feet: 5 });
  const data = fortificationVertexData(updated, [], null, () => 10, 2);
  expect(data.positions[1] * 50).toBeCloseTo(12);
  expect(data.positions[7] * 50).toBeCloseTo(35);
  expect(data.indices.slice(0, 6)).toEqual([0, 2, 1, 1, 2, 3]);
  expect(data.normals.every(Number.isFinite)).toBe(true);
});
