import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Ray } from '@babylonjs/core/Culling/ray';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { createThinBoxBatch, sameThinBoxes } from './thinBoxBatch';

test('thin box batches preserve transforms, parent metadata, bounds and picking', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const parent = new TransformNode('building', scene);
  parent.position.x = 10;
  const item = { id: 'blueprint-1' };
  const metadata = { settlement: true, kind: 'building', item };
  const material = new StandardMaterial('stone', scene);
  const batch = createThinBoxBatch(scene, 'arc-panels', material, [
    { x: 2, y: 3, z: 4, width: 2, height: 4, depth: 1, angle: Math.PI / 2 },
    { x: 6, y: 3, z: 4, width: 1, height: 2, depth: 1, angle: 0 },
  ], metadata, parent);

  expect(batch.thinInstanceCount).toBe(2);
  expect(batch.thinInstanceEnablePicking).toBe(true);
  expect(batch.metadata.item).toBe(item);
  const matrices = batch.thinInstanceGetWorldMatrices();
  expect(Vector3.TransformCoordinates(Vector3.Zero(), matrices[0]).x).toBeCloseTo(2);
  expect(Vector3.TransformCoordinates(Vector3.Zero(), matrices[1]).x).toBeCloseTo(6);
  expect(batch.getBoundingInfo().boundingBox.extendSize.x).toBeGreaterThan(2);

  const hit = scene.pickWithRay(new Ray(new Vector3(12, 3, 9), new Vector3(0, 0, -1)),
    mesh => mesh === batch);
  expect(hit?.hit).toBe(true);
  expect(hit?.pickedMesh?.metadata.item).toBe(item);
  expect(hit?.thinInstanceIndex).toBe(0);

  parent.dispose();
  expect(batch.isDisposed()).toBe(true);
  scene.dispose();
  engine.dispose();
});

test('empty batches do not add a mesh', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  expect(createThinBoxBatch(scene, 'empty', null, [], {})).toBeNull();
  expect(scene.meshes).toHaveLength(0);
  scene.dispose();
  engine.dispose();
});

test('terrain elevation and rotation changes invalidate a retained batch', () => {
  const boxes = [{ x: 1, y: 2, z: 3, width: 1, height: 1, depth: 1, angle: 0 }];
  expect(sameThinBoxes(boxes, [{ ...boxes[0] }])).toBe(true);
  expect(sameThinBoxes(boxes, [{ ...boxes[0], y: 3 }])).toBe(false);
  expect(sameThinBoxes(boxes, [{ ...boxes[0], angle: 0.2 }])).toBe(false);
  expect(sameThinBoxes(boxes, [])).toBe(false);
});
