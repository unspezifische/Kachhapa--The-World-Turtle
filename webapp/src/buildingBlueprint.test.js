import { NullEngine, Scene } from '@babylonjs/core';
import { createBlueprintBuilding, addBlueprintCorner, closeBlueprintFootprint } from './settlementEditor';
import { addBuildingLevel, arcFromThreePoints, exposedRoofFootprints, isRoofVisible, normalizeBlueprint, levelConnectionGuides, snapOpening, snapPointToLevelBelow, snapPointToRightAngle, stairGeometry, stairOpeningsForLevel, wallPanels } from './buildingBlueprint';
import { createBlueprintMesh } from './blueprintMesh';

const house = () => {
  let b = createBlueprintBuilding({ x: 1000, y: -500 });
  for (const p of [{ x: 1040, y: -500 }, { x: 1040, y: -470 }, { x: 1000, y: -470 }]) b = addBlueprintCorner(b, p);
  return closeBlueprintFootprint(b);
};

test('blueprints store local coordinates and close without duplicate corners or mutation', () => {
  const initial = createBlueprintBuilding({ x: 1000, y: -500 });
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

test('connection guides represent landings and follow source stair edits', () => {
  const b = house();
  b.levels[0].stairs.push({ start_x: 5, start_y: 5, length: 12, direction: 0 });
  b.levels[0].hatches.push({ x: 20, y: 20, has_ladder: true });
  const result = addBuildingLevel(addBuildingLevel(b), -1);
  expect(levelConnectionGuides(result, result.levels[2])[0]).toMatchObject({ x: 17, y: 5, kind: 'stairs' });
  expect(levelConnectionGuides(result, result.levels[0])[0]).toMatchObject({ x: 20, y: 20, kind: 'ladder' });
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

  expect(foundation).toHaveLength(4);
  expect(foundation[0].position.y).toBeCloseTo(0.03);
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
  expect(door).toMatchObject({ wall_index: 0, distance_from_start: 10, height_from_floor: 0 });
  level.doors = [door];
  expect(snapOpening(level, { x: 10, y: 0 }, 'window', 3, 4, 3)).toBeNull();
  expect(snapOpening(level, { x: 20, y: 15 }, 'door')).toBeNull();
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
