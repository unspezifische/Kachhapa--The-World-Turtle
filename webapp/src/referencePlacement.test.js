import { guessReferencePlacement, referenceCorner, resizeReference, referenceForSave, mergeReferenceSave, transformReferenceFromGizmo } from './referencePlacement';

test('queued saves retain newly uploaded references and the exact dirty terrain chunk', () => {
  const tile = { layer_type: 'heightmap_tile', tile_x: 1, values: [3, 4] };
  const current = [{ id: 'original', width_feet: 900 }, { id: 'new-upload' }, { id: 'floor', floor_level_id: 'ground' }];
  expect(mergeReferenceSave(current, [{ id: 'original', width_feet: 100 }, tile])).toEqual([...current, tile]);
});

test('initial placement follows camera target and preserves pixel proportions', () => {
  const wide = guessReferencePlacement(2000, 1000, { radius: 100, target: [10, 20, -30] });
  expect(wide.origin_x).toBe(500); expect(wide.origin_y).toBe(-1500);
  expect(wide.width_feet / wide.height_feet).toBe(2);
  const tall = guessReferencePlacement(1000, 2000, { radius: 100, target: [10, 20, -30] });
  expect(tall.height_feet).toBe(wide.width_feet);
  expect(guessReferencePlacement(2000, 1000, { radius: 10 }).width_feet).toBeLessThan(wide.width_feet);
});

const layer = { origin_x: 20, origin_y: -40, width_feet: 200, height_feet: 100, rotation_degrees: 37 };
test.each([[-1,-1], [1,-1], [1,1], [-1,1]])('rotated resize pins the opposite corner (%i,%i)', (sx, sy) => {
  const point = referenceCorner({ ...layer, width_feet: 500, height_feet: 400 }, sx, sy);
  const resized = resizeReference(layer, point, sx, sy, false);
  const anchor = referenceCorner(layer, -sx, -sy), after = referenceCorner(resized, -sx, -sy);
  expect(after.x).toBeCloseTo(anchor.x); expect(after.y).toBeCloseTo(anchor.y);
  const moved = referenceCorner(resized, sx, sy);
  expect(moved.x).toBeCloseTo(point.x); expect(moved.y).toBeCloseTo(point.y);
});
test('locked resize keeps ratio; unlocked resize can stretch; crossing never flips', () => {
  const point = { x: 400, y: 600 };
  const locked = resizeReference(layer, point, 1, 1, true);
  expect(locked.width_feet / locked.height_feet).toBeCloseTo(2);
  expect(resizeReference(layer, point, 1, 1, false).width_feet / resizeReference(layer, point, 1, 1, false).height_feet).not.toBeCloseTo(2);
  const crossed = resizeReference(layer, { x: -10000, y: -10000 }, 1, 1, false);
  expect(crossed.width_feet).toBeGreaterThanOrEqual(1); expect(crossed.height_feet).toBeGreaterThanOrEqual(1);
});
test('camera-centered gizmo moves, uniformly scales, and rotates a reference image', () => {
  const source = { origin_x: 100, origin_y: 200, width_feet: 400, height_feet: 200, rotation_degrees: 350 };
  expect(transformReferenceFromGizmo(source, 'move', { x: 10, y: 20 }, { x: 35, y: 5 }, { x: 0, y: 0 }))
    .toEqual(expect.objectContaining({ origin_x: 125, origin_y: 185 }));
  const scaled = transformReferenceFromGizmo(source, 'scale', { x: 10, y: 0 }, { x: 15, y: 0 }, { x: 0, y: 0 });
  expect(scaled.width_feet).toBe(600); expect(scaled.height_feet).toBe(300);
  expect(scaled.origin_x).toBe(100); expect(scaled.origin_y).toBe(200);
  const rotated = transformReferenceFromGizmo(source, 'rotate', { x: 10, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 0 });
  expect(rotated.rotation_degrees).toBeCloseTo(80);
});
test('saved placement strips preview flags and updates both scales', () => {
  const saved = referenceForSave({ ...layer, pixel_width: 100, pixel_height: 100, _placing: true, _busy: true, _lockAspect: true });
  expect(saved._placing).toBeUndefined(); expect(saved._busy).toBeUndefined(); expect(saved._lockAspect).toBeUndefined();
  expect(saved.feet_per_pixel_x).toBe(2); expect(saved.feet_per_pixel_y).toBe(1);
});
