import { ArcRotateCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { applyBabylonCameraCommand } from './BabylonSettlementHost';

test('property focus centers on the parcel with terrain elevation and a useful drawing scale', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new ArcRotateCamera('camera', 0, 1, 800, Vector3.Zero(), scene);
  applyBabylonCameraCommand(camera, { mode: 'point', point: { x: 2850, y: -5300 }, radiusFeet: 400, topdown: true },
    { minX: -10000, maxX: 10000, minY: -10000, maxY: 10000 }, [], null, {}, () => 12);
  expect(camera.target.asArray()).toEqual([57, 0.24, -106]);
  expect(camera.radius).toBe(8);
  expect(camera.beta).toBe(0.02);
  scene.dispose();
  engine.dispose();
});
