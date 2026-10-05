import { calculateTerrainFog } from './terrainFog';

test('terrain fog keeps the look target clear and hides the streamed edge', () => {
  const fog = calculateTerrainFog({ cameraRadius: 434, spanFeet: 36864, fogDensity: 0.01 });

  expect(fog.centerOcclusion).toBe(0);
  expect(fog.edgeOcclusion).toBe(1);
  expect(fog.startFeet).toBeGreaterThan(fog.centerDistanceFeet);
  expect(fog.endFeet).toBeLessThan(fog.edgeDistanceFeet);
});

test('stronger weather haze moves the fade closer without obscuring the target', () => {
  const clear = calculateTerrainFog({ cameraRadius: 100, spanFeet: 12000, fogDensity: 0.001 });
  const foggy = calculateTerrainFog({ cameraRadius: 100, spanFeet: 12000, fogDensity: 0.06 });

  expect(foggy.startFeet).toBeLessThan(clear.startFeet);
  expect(foggy.endFeet).toBeLessThan(clear.endFeet);
  expect(foggy.midpointOcclusion).toBeGreaterThan(clear.midpointOcclusion);
  expect(foggy.centerOcclusion).toBe(0);
});

test('fog distances expand with the streamed terrain window', () => {
  const close = calculateTerrainFog({ cameraRadius: 50, spanFeet: 8000, fogDensity: 0.01 });
  const wide = calculateTerrainFog({ cameraRadius: 50, spanFeet: 32000, fogDensity: 0.01 });

  expect(wide.startFeet).toBeGreaterThan(close.startFeet);
  expect(wide.endFeet).toBeGreaterThan(close.endFeet);
});
