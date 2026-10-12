import { Color3, MeshBuilder, NullEngine, Scene, StandardMaterial, TransformNode } from '@babylonjs/core';
import { applyBuildingMapColor, buildingFootprintWorld, createBuildingInspectOutline } from './settlementBuildingPresentation';

test('footprint outlines transform rectangles and irregular local blueprints without editing geometry', () => {
  const rectangle = { x: 100, y: 200, width_feet: 40, depth_feet: 20, rotation: Math.PI / 2 };
  expect(buildingFootprintWorld(rectangle)[0].x).toBeCloseTo(110);
  expect(buildingFootprintWorld(rectangle)[0].y).toBeCloseTo(180);
  const building = { id: 'house', is_blueprint: true, coordinate_space: 'local', x: 10, y: 20,
    levels: [{ id: 'ground', elevation_feet: 0, corners: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 10, y: 20 }] }] };
  const original = JSON.stringify(building);
  expect(buildingFootprintWorld(building)).toEqual([{ x: 10, y: 20 }, { x: 40, y: 20 }, { x: 20, y: 40 }]);
  expect(JSON.stringify(building)).toBe(original);
});

test('map colors reach child surfaces, preserve natural materials, and outlines cannot intercept picks', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const root = new TransformNode('house', scene);
  const mesh = MeshBuilder.CreateBox('roof', {}, scene);
  mesh.parent = root;
  const original = new StandardMaterial('shingles', scene);
  original.diffuseColor = Color3.FromHexString('#65584d');
  mesh.material = original;
  mesh.metadata = { kind: 'building-roof', item: { id: 'house' } };
  applyBuildingMapColor(root, null);
  expect(mesh.material).toBe(original);
  applyBuildingMapColor(root, '#62bd6f');
  expect(mesh.material.emissiveColor.toHexString().toLowerCase()).toBe('#62bd6f');
  expect(original.diffuseColor.toHexString().toLowerCase()).toBe('#65584d');
  const outlines = createBuildingInspectOutline(scene,
    { id: 'house', x: 0, y: 0, width_feet: 20, depth_feet: 30 }, {}, () => 0);
  expect(outlines).toHaveLength(2);
  expect(outlines.every(outline => !outline.isPickable)).toBe(true);
  outlines.forEach(outline => outline.dispose(false, true));
  root.dispose(false, true);
  scene.dispose();
  engine.dispose();
});
