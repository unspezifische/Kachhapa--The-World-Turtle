import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { createStreetLampRenderer } from './streetLampRenderer';

test('city view disables unused lamp lights and restores nearby lamps at street view', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = { radius: 100, position: Vector3.Zero() };
  const renderer = createStreetLampRenderer(scene, camera);
  const state = { lamps: [{ id: 'lamp-1', x: 0, y: 0, elevation: 0, lit: true }] };

  renderer.update(state, null, 0.2);
  expect(scene.lights).toHaveLength(8);
  expect(scene.lights.every(light => !light.isEnabled())).toBe(true);
  expect(scene.materials.every(material => material.maxSimultaneousLights === 4)).toBe(true);

  camera.radius = 3;
  renderer.update(state, null, 0.2);
  expect(scene.lights.some(light => light.isEnabled())).toBe(true);
  expect(scene.materials.every(material => material.maxSimultaneousLights === 12)).toBe(true);

  renderer.dispose();
  scene.dispose();
  engine.dispose();
});
