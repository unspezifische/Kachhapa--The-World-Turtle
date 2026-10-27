import { NullEngine, Scene } from '@babylonjs/core';
import { createBlueprintBuilding, addBlueprintCorner, closeBlueprintFootprint } from './settlementEditor';
import { addBuildingLevel, arcFromThreePoints, automaticRoofFootprints, defaultLevelName, deleteBuildingLevel, exposedRoofFootprints, foundationPerimeter, inferLevelNumbers, insertMissingBuildingLevel, isRoofVisible, levelDeletionImpact, missingLevelNumbers, normalizeBlueprint, levelConnectionGuides, normalizeFlightShares, redistributeFlightShares, resizeBlueprintFootprint, resizeFlightShares, roofBaseElevation, roofFootprintOverlapRatio, snapOpening, snapPointToLevelBelow, snapPointToRightAngle, stairGeometry, stairOpeningsForLevel, wallPanels } from './buildingBlueprint';
import { createBlueprintMesh } from './blueprintMesh';
import { createBlueprintRoofMesh } from './roofMesh';

test('roof footprint overlap only compares roofs on the same support level', () => {
  const roof = (id, support, x = 0) => ({ id, support_level_id: support,
    footprint: [{ x, y: 0 }, { x: x + 10, y: 0 }, { x: x + 10, y: 10 }, { x, y: 10 }] });
  expect(roofFootprintOverlapRatio(roof('one', 'ground'), roof('two', 'ground'))).toBeCloseTo(1);
  expect(roofFootprintOverlapRatio(roof('one', 'ground'), roof('partial', 'ground', 5))).toBeCloseTo(0.5);
  expect(roofFootprintOverlapRatio(roof('one', 'ground'), roof('upper', 'upper'))).toBe(0);
});

const house = () => {
  let b = createBlueprintBuilding({ x: 1000, y: -500 });
  for (const p of [{ x: 1040, y: -500 }, { x: 1040, y: -470 }, { x: 1000, y: -470 }]) b = addBlueprintCorner(b, p);
  return normalizeBlueprint(closeBlueprintFootprint(b));
};

test('default level names use one-based floor labels without changing structural slots', () => {
  expect([-1, 0, 1].map(defaultLevelName)).toEqual(['Basement 1', 'Level 1', 'Level 2']);
  const building = normalizeBlueprint({
    id: 'legacy-names', coordinate_space: 'local', x: 0, y: 0,
    levels: [
      { id: 'ground', name: 'Ground floor', level_number: 0, elevation_feet: 0 },
      { id: 'upper', name: 'Level 1', level_number: 1, elevation_feet: 10 },
      { id: 'tower', name: 'Observatory', level_number: 2, elevation_feet: 20 },
    ],
  });
  expect(building.levels.map(level => [level.level_number, level.name])).toEqual([
    [0, 'Level 1'], [1, 'Level 2'], [2, 'Observatory'],
  ]);
});

test('legacy world-space plans are aligned to the building grid before Babylon reapplies orientation', () => {
  const source = {
    id: 'rotated-legacy', x: 100, y: 200, rotation: Math.PI / 2,
    levels: [{
      id: 'ground', elevation_feet: 0, floor_height: 10,
      corners: [{ x: 100, y: 200 }, { x: 100, y: 220 }, { x: 90, y: 220 }, { x: 90, y: 200 }],
      rooms: [{ id: 'room', region: [{ x: 100, y: 200 }, { x: 100, y: 220 }, { x: 90, y: 220 }, { x: 90, y: 200 }] }],
    }],
  };
  const before = JSON.stringify(source);
  const normalized = normalizeBlueprint(source);
  const rounded = points => points.map(point => ({ x: Math.round(point.x), y: Math.round(point.y) }));

  expect(normalized.coordinate_space).toBe('local');
  expect(rounded(normalized.levels[0].corners)).toEqual([
    { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 },
  ]);
  expect(rounded(normalized.levels[0].rooms[0].region)).toEqual(rounded(normalized.levels[0].corners));

  const engine = new NullEngine(); const scene = new Scene(engine);
  const root = createBlueprintMesh(scene, source);
  expect(root.rotation.y).toBeCloseTo(-Math.PI / 2);
  expect(JSON.stringify(source)).toBe(before);
  root.dispose(false, true); scene.dispose(); engine.dispose();
});

test('legacy levels infer stable numbered slots while preserving intentional name gaps', () => {
  const levels = inferLevelNumbers([
    { id: 'ground', name: 'Ground floor', elevation_feet: 0 },
    { id: 'one', name: 'Level 1', elevation_feet: 10 },
    { id: 'three', name: 'Level 3', elevation_feet: 30 },
  ]);
  expect(levels.map(level => level.level_number)).toEqual([0, 1, 3]);
});

test('ground and basement gaps are discoverable without changing custom names', () => {
  const building = normalizeBlueprint({
    id: 'split-level', coordinate_space: 'local', x: 0, y: 0,
    levels: [
      { id: 'basement-two', name: 'Wine Cellar', level_number: -2, elevation_feet: -20, floor_height: 10 },
      { id: 'one', name: 'Great Hall', level_number: 1, elevation_feet: 10, floor_height: 10 },
      { id: 'three', name: 'Observatory', level_number: 3, elevation_feet: 30, floor_height: 10 },
    ],
  });
  expect(missingLevelNumbers(building)).toEqual([-1, 0, 2]);
  const withGround = insertMissingBuildingLevel(building, 0);
  const groundId = withGround.levels.find(level => level.level_number === 0).id;
  const withoutGround = deleteBuildingLevel(withGround, groundId);
  expect(withoutGround.levels.map(level => level.name)).toEqual(['Wine Cellar', 'Great Hall', 'Observatory']);
  expect(withoutGround.levels.map(level => level.level_number)).toEqual([-2, 1, 3]);
});

test('middle level deletion preserves survivors, cleans dependencies, and can restore the missing slot', () => {
  const building = normalizeBlueprint({
    id: 'tower', visible_level_id: 'two', coordinate_space: 'local', x: 0, y: 0,
    levels: [
      { id: 'one', name: 'Level 1', level_number: 1, elevation_feet: 10, floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }],
        stairs: [{ id: 'to-two', total_rise_feet: 10 }], fireplaces: [{ id: 'fire', chimney_id: 'chimney' }] },
      { id: 'two', name: 'Level 2', level_number: 2, elevation_feet: 20, floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }],
        walls: [{ id: 'divider', start: { x: 0, y: 10 }, end: { x: 20, y: 10 } }],
        rooms: [{ id: 'room', region: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 5 }] }],
        floor_map: { image_url: '/two.png' } },
      { id: 'three', name: 'Level 3', level_number: 3, elevation_feet: 30, floor_height: 10,
        corners: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] },
    ],
    roofs: [
      { id: 'remove-roof', support_level_id: 'two', visibility_level_id: 'two', footprint: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }] },
      { id: 'keep-roof', support_level_id: 'one', visibility_level_id: 'two', footprint: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }] },
    ],
    chimneys: [{ id: 'chimney', base_level_id: 'two', top_level_id: 'three' }],
  });
  expect(levelDeletionImpact(building, 'two')).toMatchObject({ rooms: 1, floor_images: 1, roofs: 2, chimneys: 1 });
  const deleted = deleteBuildingLevel(building, 'two');
  expect(deleted.levels.map(level => [level.id, level.level_number, level.elevation_feet])).toEqual([
    ['one', 1, 10], ['three', 3, 30],
  ]);
  expect(deleted.visible_level_id).toBe('one');
  expect(deleted.levels[0].stairs).toEqual([]);
  expect(deleted.roofs.map(roof => roof.id)).toEqual(['keep-roof']);
  expect(deleted.roofs[0].visibility_level_id).toBe('three');
  expect(deleted.chimneys[0]).toMatchObject({ base_level_id: 'three', top_level_id: 'three' });
  expect(missingLevelNumbers(deleted)).toEqual([2]);

  const restored = insertMissingBuildingLevel(deleted, 2);
  const replacement = restored.levels.find(level => level.level_number === 2);
  expect(replacement).toMatchObject({ name: 'Level 3', elevation_feet: 20, floor_height: 10 });
  expect(replacement.id).not.toBe('two');
  expect(replacement.corners).toEqual(deleted.levels[0].corners);
  expect(replacement.walls).toEqual([]);
  expect(replacement.rooms).toEqual([]);
  expect(replacement.floor_map).toBeUndefined();
});

test('middle level deletion can collapse upper floors without replacing survivor IDs', () => {
  const building = normalizeBlueprint({
    id: 'collapsed-tower', visible_level_id: 'two', coordinate_space: 'local', x: 0, y: 0,
    levels: [
      { id: 'one', name: 'Level 2', level_number: 1, elevation_feet: 10, floor_height: 10 },
      { id: 'two', name: 'Level 3', level_number: 2, elevation_feet: 20, floor_height: 10 },
      { id: 'three', name: 'Level 4', level_number: 3, elevation_feet: 30, floor_height: 10 },
      { id: 'four', name: 'Observatory', level_number: 4, elevation_feet: 40, floor_height: 10 },
    ],
  });

  expect(levelDeletionImpact(building, 'two')).toMatchObject({
    upper_levels: 2, collapse_level_slots: 1, collapse_elevation_feet: 10,
  });
  const collapsed = deleteBuildingLevel(building, 'two', { collapseUpperLevels: true });

  expect(collapsed.levels.map(level => [level.id, level.level_number, level.elevation_feet, level.name])).toEqual([
    ['one', 1, 10, 'Level 2'],
    ['three', 2, 20, 'Level 3'],
    ['four', 3, 30, 'Observatory'],
  ]);
  expect(missingLevelNumbers(collapsed)).toEqual([]);
});

test('collapse recognizes an accidental upper level at the same elevation', () => {
  const building = normalizeBlueprint({
    id: 'duplicate-floor', coordinate_space: 'local', x: 0, y: 0,
    levels: [
      { id: 'one', name: 'Level 1', level_number: 0, elevation_feet: 0 },
      { id: 'duplicate', name: 'Level 2', level_number: 1, elevation_feet: 0 },
      { id: 'upper', name: 'Level 3', level_number: 2, elevation_feet: 10 },
    ],
  });

  expect(levelDeletionImpact(building, 'one')).toMatchObject({
    upper_levels: 2, collapse_level_slots: 1, collapse_elevation_feet: 0,
  });
  const collapsed = deleteBuildingLevel(building, 'one', { collapseUpperLevels: true });
  expect(collapsed.levels.map(level => [level.id, level.level_number, level.elevation_feet])).toEqual([
    ['duplicate', 0, 0], ['upper', 1, 10],
  ]);
});

test('blueprints store local coordinates and close without duplicate corners or mutation', () => {
  const initial = createBlueprintBuilding({ x: 1000, y: -500 });
  expect(initial.levels[0].level_number).toBe(0);
  expect(initial.roofs).toEqual([]);
  expect(initial.show_roofs).toBe(true);
  const next = addBlueprintCorner(initial, { x: 1040, y: -500 });
  expect(initial.levels[0].corners).toEqual([{ x: 0, y: 0 }]);
  expect(next.levels[0].corners[1]).toEqual({ x: 40, y: 0 });
  const b = house();
  expect(closeBlueprintFootprint(b).levels[0].corners).toHaveLength(4);
  expect(b.width_feet).toBe(40);
});

test('upper floors and basements retain ground elevation and independent geometry after JSON persistence', () => {
  const b = house();
  const result = addBuildingLevel(addBuildingLevel(b), -1);
  expect(result.levels.map(l => l.elevation_feet)).toEqual([-10, 0, 10]);
  result.levels[0].corners[0].x = 5;
  expect(result.levels[1].corners[0].x).toBe(0);
  const loaded = normalizeBlueprint(JSON.parse(JSON.stringify(result)));
  expect(loaded.levels.map(l => l.elevation_feet)).toEqual([-10, 0, 10]);
  expect(b.levels).toHaveLength(1);
});

test('blueprint footprint resizing scales every attached local plan element', () => {
  const building = {
    id: 'resizable', coordinate_space: 'local', x: 100, y: 200,
    width_feet: 40, depth_feet: 20,
    levels: [{
      id: 'ground', elevation_feet: 0,
      corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }],
      outline: [{ id: 'south', start: { x: 0, y: 0 }, end: { x: 40, y: 0 } }],
      openings: [{ wall_id: 'south', distance_from_start: 10, width: 4 }],
      stairs: [{ start_x: 10, start_y: 5, direction: 0, width: 4, length: 10, landing_depth: 3 }],
      hatches: [{ x: 20, y: 10, width: 4, depth: 3 }],
      platforms: [{ points: [{ x: 2, y: 2 }, { x: 8, y: 2 }] }],
    }, {
      id: 'upper', elevation_feet: 10,
      corners: [{ x: 5, y: 5 }, { x: 35, y: 5 }, { x: 35, y: 15 }],
    }],
    chimneys: [{ id: 'chimney', x: 20, y: 10, width: 4, depth: 3 }],
    roofs: [{ id: 'roof', footprint: [{ x: 0, y: 0 }, { x: 40, y: 0 }], holes: [[{ x: 10, y: 5 }]], overhang: 2 }],
  };

  const resized = resizeBlueprintFootprint(building, 80, 60);
  expect(resized).not.toBe(building);
  expect(resized).toMatchObject({ width_feet: 80, depth_feet: 60 });
  expect(resized.levels[0].corners[2]).toEqual({ x: 80, y: 60 });
  expect(resized.levels[1].corners[0]).toEqual({ x: 10, y: 15 });
  expect(resized.levels[0].openings[0]).toMatchObject({ distance_from_start: 20, width: 8 });
  expect(resized.levels[0].stairs[0]).toMatchObject({ start_x: 20, start_y: 15, width: 12, length: 20, landing_depth: 6 });
  expect(resized.levels[0].hatches[0]).toMatchObject({ x: 40, y: 30, width: 8, depth: 9 });
  expect(resized.chimneys[0]).toMatchObject({ x: 40, y: 30, width: 8, depth: 9 });
  expect(resized.roofs[0]).toMatchObject({ footprint: [{ x: 0, y: 0 }, { x: 80, y: 0 }], holes: [[{ x: 20, y: 15 }]], overhang: 5 });
  expect(building.levels[0].corners[2]).toEqual({ x: 40, y: 20 });
});

test('connection guides represent landings and follow source stair edits', () => {
  const b = house();
  b.levels[0].stairs.push({ start_x: 5, start_y: 5, length: 12, direction: 0 });
  b.levels[0].hatches.push({ x: 20, y: 20, has_ladder: true });
  const result = addBuildingLevel(addBuildingLevel(b), -1);
  expect(levelConnectionGuides(result, result.levels[2])[0]).toMatchObject({ x: 17, y: 5, kind: 'stairs' });
  expect(levelConnectionGuides(result, result.levels[2])).toEqual(expect.arrayContaining([
    expect.objectContaining({ x: 20, y: 20, kind: 'ladder' })
  ]));
  result.levels[1].stairs[0].start_x = 8;
  expect(levelConnectionGuides(result, result.levels[2])[0].x).toBe(20);
  expect(result.levels[2].stairs).toEqual([]);
});

test('wall endpoints snap to the nearest axis and upper footprints snap to lower corners', () => {
  expect(snapPointToRightAngle({ x: 4, y: 6 }, { x: 14, y: 10 })).toEqual({ x: 14, y: 6 });
  expect(snapPointToRightAngle({ x: 4, y: 6 }, { x: 8, y: 16 })).toEqual({ x: 4, y: 16 });

  const lower = {
    id: 'ground',
    elevation_feet: 0,
    floor_height: 10,
    corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }],
    outline: [],
  };
  const upper = { id: 'upper', elevation_feet: 10, floor_height: 10 };
  const snapped = snapPointToLevelBelow(
    { levels: [lower, upper] },
    upper,
    { x: 1, y: 1 },
    2
  );

  expect(snapped).toMatchObject({
    point: { x: 0, y: 0 },
    snapped: true,
    vertex: true,
  });
});

test('exposed roof footprints retain courtyard holes between levels', () => {
  const lower = {
    corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
  };
  const upper = {
    corners: [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 8 }, { x: 2, y: 8 }],
  };

  const exposed = exposedRoofFootprints(lower, upper);

  expect(exposed).toHaveLength(1);
  expect(exposed[0].footprint).toHaveLength(4);
  expect(exposed[0].holes).toHaveLength(1);
  expect(exposed[0].holes[0]).toHaveLength(4);
});

test('an exposed lower extension gets a lean-to roof beside the upper roof', () => {
  const lower = { id: 'ground', name: 'Ground', elevation_feet: 0,
    corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }] };
  const upper = { id: 'upper', name: 'Upper', elevation_feet: 10,
    corners: [{ x: 10, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 10, y: 30 }] };
  const roofs = automaticRoofFootprints({ levels: [lower, upper], roofs: [] });
  expect(roofs).toHaveLength(2);
  expect(roofs.find(roof => roof.support_level_id === 'ground')).toMatchObject({
    type: 'shed', visibility_level_id: 'upper', pitch: 18,
  });
  expect(roofs.find(roof => roof.support_level_id === 'upper').type).toBe('gable');
  expect(roofs.find(roof => roof.support_level_id === 'ground').slope_direction).toBeCloseTo(0);
});

test('a roof attached below an upper level uses that upper level as its base elevation', () => {
  const building = {
    foundation_height_feet: 2,
    levels: [
      { id: 'ground', elevation_feet: 0, floor_height: 8 },
      { id: 'upper', elevation_feet: 12, floor_height: 10 },
    ],
  };
  expect(roofBaseElevation(building, {
    support_level_id: 'ground', visibility_level_id: 'upper', elevation_offset: 1,
  })).toBe(15);
  expect(roofBaseElevation(building, {
    support_level_id: 'upper', visibility_level_id: 'upper', elevation_offset: 1,
  })).toBe(25);
});

test('an attached roof mesh starts at the upper level elevation', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const footprint = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];
  const building = {
    id: 'attached-roof', coordinate_space: 'local', show_roofs: true,
    levels: [
      { id: 'ground', name: 'Ground', elevation_feet: 0, floor_height: 8, corners: footprint },
      { id: 'upper', name: 'Upper', elevation_feet: 12, floor_height: 10, corners: footprint },
    ],
    roofs: [{
      id: 'lower-roof', type: 'flat', support_level_id: 'ground', visibility_level_id: 'upper',
      footprint, pitch: 0, overhang: 0, thickness: 0.5, elevation_offset: 0, material: 'shingles',
    }],
  };
  const root = createBlueprintMesh(scene, building, 0);
  const roof = root.getChildMeshes().find(mesh => mesh.metadata?.roofId === 'lower-roof');
  expect(roof.getBoundingInfo().boundingBox.minimum.y).toBeCloseTo(12 / 50);
});

test('automatic roof suppression is additive and survives normalization', () => {
  const building = house();
  const automatic = automaticRoofFootprints(building);
  expect(automatic).toHaveLength(1);
  const suppressed = normalizeBlueprint({
    ...building,
    suppressed_automatic_roof_ids: [automatic[0].id, automatic[0].id],
  });
  expect(suppressed.suppressed_automatic_roof_ids).toEqual([automatic[0].id]);
  expect(automaticRoofFootprints(suppressed)).toEqual([]);
});

test('roofs normalize as building elements and follow their visibility level', () => {
  const b = house();
  b.levels.push({
    id: 'upper',
    name: 'Upper floor',
    elevation_feet: 10,
    floor_height: 10,
    corners: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }],
  });
  b.roofs = [{
    id: 'main-roof',
    type: 'gable',
    support_level_id: 'ground',
    footprint: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }],
  }];

  const normalized = normalizeBlueprint(b);
  const roof = normalized.roofs[0];

  expect(roof).toMatchObject({
    id: 'main-roof',
    type: 'gable',
    support_level_id: 'ground',
    visibility_level_id: 'upper',
    pitch: 30,
    material: 'shingles',
  });
  expect(normalized.levels[0].roofs).toBeUndefined();
  expect(isRoofVisible(normalized, roof)).toBe(true);
  expect(isRoofVisible({ ...normalized, level_view: 'level', visible_level_id: 'ground' }, roof)).toBe(false);
  expect(isRoofVisible({ ...normalized, level_view: 'through', visible_level_id: 'upper' }, roof)).toBe(true);
  expect(isRoofVisible({ ...normalized, show_roofs: false }, roof)).toBe(false);
});

test('roof mesh generation supports every initial type and visibility only hides meshes', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const b = house();
  const types = ['flat', 'shed', 'gable', 'hip', 'dome', 'cone', 'mansard', 'custom'];
  b.roofs = types.map((type, index) => ({
    id: `roof-${index}`,
    type,
    support_level_id: 'ground',
    visibility_level_id: 'ground',
    footprint: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }],
  }));

  const root = createBlueprintMesh(scene, b, 0);
  const roofMeshes = root.getChildMeshes().filter(mesh => mesh.name.startsWith('roof-'));
  expect(roofMeshes).toHaveLength(types.length);
  expect(roofMeshes.every(mesh => mesh.getTotalVertices() > 0)).toBe(true);

  const hiddenByLevel = createBlueprintMesh(scene, {
    ...b,
    level_view: 'level',
    visible_level_id: 'upper',
    levels: [...b.levels, { id: 'upper', elevation_feet: 10, floor_height: 10, corners: [] }],
    roofs: b.roofs.map(roof => ({ ...roof, visibility_level_id: 'ground' })),
  }, 0);
  expect(hiddenByLevel.getChildMeshes().some(mesh => mesh.name.startsWith('roof-'))).toBe(false);
  expect(b.roofs).toHaveLength(types.length);

  const hiddenByToggle = createBlueprintMesh(scene, { ...b, show_roofs: false }, 0);
  expect(hiddenByToggle.getChildMeshes().some(mesh => mesh.name.startsWith('roof-'))).toBe(false);
  expect(b.roofs).toHaveLength(types.length);

  root.dispose(false, true);
  hiddenByLevel.dispose(false, true);
  hiddenByToggle.dispose(false, true);
  scene.dispose();
  engine.dispose();
});

test('roof orientation never rotates its footprint and changes the gable peak direction', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const footprint = [{ x: 3, y: 7 }, { x: 43, y: 7 }, { x: 43, y: 27 }, { x: 3, y: 27 }];
  const planarBounds = mesh => {
    const positions = Array.from(mesh.getVerticesData('position'));
    const xs = positions.filter((_, index) => index % 3 === 0);
    const zs = positions.filter((_, index) => index % 3 === 2);
    return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  };

  for (const type of ['flat', 'shed', 'gable', 'hip', 'dome', 'cone', 'mansard']) {
    const roof = {
      id: `${type}-orientation`, type, footprint, holes: [], pitch: 30, overhang: 0,
      thickness: 0.5, ridge_direction: 0, slope_direction: 0, mansard_break: 3,
    };
    const original = createBlueprintRoofMesh(scene, { ...roof, rotation: 0 }, 10, 'building');
    const oriented = createBlueprintRoofMesh(scene, { ...roof, rotation: 90 }, 10, 'building');
    expect(planarBounds(oriented)).toEqual(planarBounds(original));

    if (type === 'gable') {
      const originalHeights = Array.from(original.getVerticesData('position')).filter((_, index) => index % 3 === 1);
      const orientedHeights = Array.from(oriented.getVerticesData('position')).filter((_, index) => index % 3 === 1);
      expect(orientedHeights).not.toEqual(originalHeights);
    }
    original.dispose(false, true);
    oriented.dispose(false, true);
  }
  scene.dispose();
  engine.dispose();
});

test('thick exterior wall intersections receive closing geometry', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const building = house();
  building.levels[0].outline = building.levels[0].outline.map(wall => ({ ...wall, thickness: 3 }));
  const root = createBlueprintMesh(scene, building, 0);
  const joints = root.getChildMeshes().filter(mesh => mesh.name.startsWith('wall-joint-'));
  expect(joints).toHaveLength(4);
  expect(joints.every(mesh => mesh.getTotalVertices() > 0)).toBe(true);
  engine.dispose();
});

test('stair total rise controls every shape and only opens the level it reaches', () => {
  const floorHeight = 10;
  expect(stairGeometry({ shape: 'straight', length: 12, total_rise_feet: 3 }, floorHeight).segments[0].rise_end).toBe(3);
  expect(stairGeometry({ shape: 'landing', length: 12, landing_count: 1, total_rise_feet: 3 }, floorHeight).segments.at(-1).rise_end).toBe(3);
  expect(stairGeometry({ shape: 'curve', curve_degrees: 90, curve_radius: 8, total_rise_feet: 3 }, floorHeight).segments.at(-1).rise_end).toBe(3);
  expect(stairGeometry({ shape: 'straight', length: 12 }, floorHeight).segments[0].rise_end).toBe(floorHeight);

  const building = {
    levels: [
      { id: 'ground', name: 'Ground', elevation_feet: 0, floor_height: floorHeight, stairs: [{ id: 'porch-stair', total_rise_feet: 3 }] },
      { id: 'porch', name: 'Porch', elevation_feet: 3, floor_height: 0, stairs: [] },
      { id: 'upper', name: 'Upper', elevation_feet: floorHeight, floor_height: floorHeight, stairs: [] }
    ]
  };

  expect(stairOpeningsForLevel(building, building.levels[1])).toHaveLength(1);
  expect(stairOpeningsForLevel(building, building.levels[2])).toHaveLength(0);
});

test('landing flight shares normalize, redistribute equally, and drive run and rise', () => {
  expect(normalizeFlightShares(null, 3)).toEqual([33.4, 33.3, 33.3]);
  expect(redistributeFlightShares([25, 25, 50], 2, 51)).toEqual([24.5, 24.5, 51]);
  expect(resizeFlightShares([50, 50], 3, 1)).toEqual([50, 25, 25]);

  const geometry = stairGeometry({
    shape: 'landing', length: 20, landing_count: 1, landing_depth: 4,
    total_rise_feet: 10, direction: 0, turn_degrees: 90, flight_shares: [25, 75],
  }, 10);
  const flights = geometry.segments.filter(segment => segment.kind === 'flight');
  expect(flights.map(segment => segment.run)).toEqual([5, 15]);
  expect(flights[0].rise_end).toBe(2.5);
  expect(flights[1].rise_end).toBe(10);
});

test('landing geometry fills the turn and joins both stair flights continuously', () => {
  const geometry = stairGeometry({
    shape: 'landing', length: 20, landing_count: 1, landing_depth: 4, width: 3,
    total_rise_feet: 10, direction: 0, turn_degrees: 90, flight_shares: [25, 75],
  }, 10);
  const [firstFlight, landing, secondFlight] = geometry.segments;

  expect(firstFlight.end).toEqual({ x: 5, y: 0 });
  expect(landing).toMatchObject({
    start: firstFlight.end,
    center: { x: 7, y: 0 },
    end: { x: 7, y: 1.5 },
    depth: 4,
    width: 3,
    rise_start: 2.5,
    rise_end: 2.5,
  });
  expect(landing.footprint).toEqual([
    { x: 5, y: -1.5 }, { x: 9, y: -1.5 },
    { x: 9, y: 1.5 }, { x: 5, y: 1.5 },
  ]);
  expect(secondFlight.start).toEqual(landing.end);
  expect(secondFlight.rise_start).toBe(landing.rise_end);
});

test('exterior stair finishes use distinct rendered materials', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const b = house();
  b.levels[0].stairs = [
    { id: 'wood', start_x: 5, start_y: 5, length: 12, direction: 0, total_rise_feet: 3, material: 'wooden-exterior' },
    { id: 'stone', start_x: 5, start_y: 10, length: 12, direction: 0, total_rise_feet: 3, material: 'stone-exterior' },
    { id: 'interior', start_x: 5, start_y: 15, length: 12, direction: 0, total_rise_feet: 3, material: 'interior' }
  ];
  const root = createBlueprintMesh(scene, b, 0);
  const stairs = root.getChildMeshes().filter(mesh => mesh.name.startsWith('stair-'));
  const materialFor = index => stairs.find(mesh => mesh.name.startsWith(`stair-${index}-`)).material.name;

  expect(materialFor(0)).toContain('stair-wood');
  expect(materialFor(1)).toContain('stair-stone');
  expect(materialFor(2)).toContain('floor');

  root.dispose(false, true);
  scene.dispose();
  engine.dispose();
});

test('foundation raises the ground floor and renders its stone perimeter', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const b = house();
  b.foundation_height_feet = 3;
  b.levels[0].stairs.push({
    id: 'entry-stairs',
    start_x: 5,
    start_y: 5,
    length: 12,
    direction: 0,
    material: 'stone-exterior',
  });

  const normalized = normalizeBlueprint(b);
  expect(normalized.levels[0].stairs[0].total_rise_feet).toBe(3);

  const root = createBlueprintMesh(scene, b, 0);
  const foundation = root.getChildMeshes().filter(mesh => mesh.name.startsWith('foundation-'));
  const floor = root.getChildMeshes().find(mesh => mesh.name === 'floor-ground');
  const firstStair = root.getChildMeshes().find(mesh => mesh.name.startsWith('stair-0-0-'));

  expect(foundation).toHaveLength(2);
  const heights = foundation[0].getVerticesData('position').filter((_, index) => index % 3 === 1);
  expect(Math.min(...heights)).toBeCloseTo(0);
  expect(Math.max(...heights)).toBeCloseTo(0.06);
  expect(foundation[0].material.name).toContain('foundation-stone');
  expect(floor.position.y).toBeCloseTo(0.06);
  expect(firstStair.position.y).toBeLessThan(floor.position.y);

  root.dispose(false, true);
  scene.dispose();
  engine.dispose();
});

test('doors snap onto walls without overlapping existing openings', () => {
  const level = house().levels[0];
  const door = snapOpening(level, { x: 10, y: 1 }, 'door', 3, 7);
  expect(door).toMatchObject({ wall_id: level.outline[0].id, distance_from_start: 10, height_from_floor: 0 });
  level.openings = [door];
  expect(snapOpening(level, { x: 10, y: 0 }, 'window', 3, 4, 3)).toBeNull();
  expect(snapOpening(level, { x: 20, y: 15 }, 'door')).toBeNull();
});

test('a raised building base follows terrain and uses the whole ground footprint with a smaller basement', () => {
  let building = house();
  building.elevation = 7;
  building.foundation_height_feet = 3;
  building = addBuildingLevel(building, -1);
  building.level_view = 'all';
  building.levels[0].outline = [];
  building.levels[0].corners = [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }];
  const ground = building.levels.find(level => level.elevation_feet === 0);
  const sample = (x, y) => 100 + (x - building.x) * 0.1 + (y - building.y) * 0.05;
  const base = foundationPerimeter(building, ground, 100, sample);
  expect(Math.max(...base.map(point => point.x)) - Math.min(...base.map(point => point.x))).toBeCloseTo(42);
  expect(base.every(point => point.top === 3)).toBe(true);
  expect(new Set(base.map(point => point.bottom)).size).toBeGreaterThan(1);
  const engine = new NullEngine(), scene = new Scene(engine);
  const root = createBlueprintMesh(scene, building, 100, sample);
  const meshes = root.getChildMeshes();
  expect(meshes.filter(mesh => mesh.name.startsWith('foundation-'))).toHaveLength(2);
  expect(meshes.some(mesh => mesh.name.startsWith('basement-earth-'))).toBe(true);
  expect(root.position.y).toBeCloseTo(107 / 50);
  root.dispose(false, true);
  const basementOnly = createBlueprintMesh(scene, { ...building, level_view: 'level', visible_level_id: building.levels[0].id }, 100, sample);
  expect(basementOnly.getChildMeshes().some(mesh => mesh.name.startsWith('foundation-'))).toBe(false);
  basementOnly.dispose(false, true); scene.dispose(); engine.dispose();
});

test('level finishes and individual wall overrides survive persistence and render independently', () => {
  const building = house();
  building.levels[0].exterior_material = 'stone';
  building.levels[0].floor_material = 'wood';
  building.levels[0].outline[0].material = 'brick';
  const loaded = normalizeBlueprint(JSON.parse(JSON.stringify(building)));
  const engine = new NullEngine(), scene = new Scene(engine);
  const root = createBlueprintMesh(scene, loaded);
  const meshes = root.getChildMeshes();
  expect(meshes.find(mesh => mesh.name === 'floor-ground').material.name).toContain('finish-wood');
  expect(meshes.find(mesh => mesh.name === 'wall-ground-0-0').material.name).toContain('finish-brick');
  expect(meshes.find(mesh => mesh.name === 'wall-ground-1-0').material.name).toContain('finish-stone');
  root.dispose(false, true); scene.dispose(); engine.dispose();
});

test('interior wall and room floor finishes render independently', () => {
  const building = house();
  building.levels[0].interior_material = 'plaster';
  building.levels[0].walls = [{ id: 'divider', type: 'line', start: { x: 20, y: 0 }, end: { x: 20, y: 30 }, thickness: 0.5, material: 'brick' }];
  building.levels[0].rooms = [{
    id: 'kitchen', name: 'Kitchen', floor_material: 'stone',
    region: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }, { x: 0, y: 30 }],
  }];
  const engine = new NullEngine(), scene = new Scene(engine);
  const root = createBlueprintMesh(scene, building);
  expect(root.getChildMeshes().find(mesh => mesh.name === 'wall-ground-4-0').material.name).toContain('finish-brick');
  expect(root.getChildMeshes().find(mesh => mesh.name === 'room-floor-ground-kitchen').material.name).toContain('finish-stone');
  root.dispose(false, true); scene.dispose(); engine.dispose();
});

test('wall panels leave real openings for doors and windows', () => {
  const panels = wallPanels(20, 10, [{ distance_from_start: 5, width: 4, height: 7 }, { distance_from_start: 14, width: 4, height: 4, height_from_floor: 3 }]);
  expect(panels.reduce((area, p) => area + p.width * p.height, 0)).toBe(200 - 28 - 16);
});

test('arc control points remain available after blueprint normalization', () => {
  const arc = arcFromThreePoints(
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 5, y: 4 },
    { id: 'arc-wall' }
  );
  const normalized = normalizeBlueprint({
    id: 'arc-building',
    coordinate_space: 'local',
    levels: [{
      id: 'ground',
      elevation_feet: 0,
      floor_height: 10,
      corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      outline: [arc],
    }],
  });

  expect(normalized.levels[0].outline[0].through).toEqual({ x: 5, y: 4 });
});

test('Babylon batches arc wall panels while retaining building selection metadata', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  const arc = arcFromThreePoints({ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 15, y: 10 }, { id: 'arc-wall' });
  const building = normalizeBlueprint({
    id: 'arc-building', x: 100, y: 200, coordinate_space: 'local', show_roofs: false,
    levels: [{ id: 'ground', elevation_feet: 0, floor_height: 10,
      corners: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }], outline: [arc] }],
  });
  const root = createBlueprintMesh(scene, building);
  const batches = root.getChildMeshes().filter(mesh => mesh.name.startsWith('arc-walls-'));
  expect(batches).toHaveLength(1);
  expect(batches[0].thinInstanceCount).toBeGreaterThan(10);
  expect(batches[0].thinInstanceEnablePicking).toBe(true);
  expect(batches[0].metadata.item.id).toBe(building.id);
  root.dispose(false, true); scene.dispose(); engine.dispose();
});

test('Babylon renders local floors, wall openings and hatches without mutating saved plans', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  const b = house();
  b.levels[0].doors.push(snapOpening(b.levels[0], { x: 10, y: 0 }, 'door'));
  b.levels[0].stairs.push({ start_x: 5, start_y: 5, width: 3, direction: 0, length: 12, turns: 1 });
  b.levels[0].hatches.push({ x: 25, y: 20, width: 3, depth: 3, has_ladder: true });
  const before = JSON.stringify(b);
  const root = createBlueprintMesh(scene, b, 100);
  expect(root.position.x).toBe(20);
  expect(root.position.y).toBe(2);
  expect(root.getChildMeshes().some(m => m.name.startsWith('floor-'))).toBe(true);
  expect(root.getChildMeshes().every(m => m.metadata?.item.id === b.id)).toBe(true);
  expect(JSON.stringify(b)).toBe(before);
  root.dispose(false, true); scene.dispose(); engine.dispose();
});
