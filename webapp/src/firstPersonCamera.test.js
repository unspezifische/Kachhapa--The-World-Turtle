import { FIRST_PERSON_LOOK_FEET, firstPersonTarget, firstPersonWalkSceneUnits } from './firstPersonCamera';
import { FEET_PER_SCENE_UNIT } from './settlementEditor';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

test('one second of walking covers the configured feet exactly once', () => {
  expect(firstPersonWalkSceneUnits(8, 1) * FEET_PER_SCENE_UNIT).toBe(8);
  expect(firstPersonWalkSceneUnits(8, 0.25) * FEET_PER_SCENE_UNIT).toBe(2);
});

test('ArcRotateCamera keeps its eye anchored when look target changes', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const eye = new Vector3(4, 0.12, -3);
  const camera = new ArcRotateCamera('eye', 0.4, Math.PI / 2, 1 / FEET_PER_SCENE_UNIT, Vector3.Zero(), scene);
  for (const [alpha, beta] of [[0.4, Math.PI / 2], [1.5, 0.2], [-1.3, Math.PI - 0.1]]) {
    camera.alpha = alpha;
    camera.beta = beta;
    const look = firstPersonTarget(eye, alpha, beta);
    camera.setTarget(new Vector3(look.x, look.y, look.z), false, true, true);
    camera.position.copyFrom(eye);
    camera.getViewMatrix(true);
    expect(Vector3.Distance(camera.position, eye)).toBeLessThan(0.00001);
  }
  scene.dispose();
  engine.dispose();
});

test('yaw and pitch move the one-foot look target without moving the eye', () => {
  const eye = { x: 4, y: 0.12, z: -3 };
  for (const [alpha, beta] of [[0, Math.PI / 2], [1, 0.3], [-2, Math.PI - 0.1]]) {
    const target = firstPersonTarget(eye, alpha, beta);
    const distance = Math.hypot(target.x - eye.x, target.y - eye.y, target.z - eye.z);
    expect(distance * FEET_PER_SCENE_UNIT).toBeCloseTo(FIRST_PERSON_LOOK_FEET);
    expect(eye).toEqual({ x: 4, y: 0.12, z: -3 });
  }
  expect(firstPersonTarget(eye, 0, 0.3).y).toBeLessThan(eye.y);
  expect(firstPersonTarget(eye, 0, Math.PI - 0.1).y).toBeGreaterThan(eye.y);
});
