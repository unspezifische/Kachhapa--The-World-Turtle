import {
  animatedWaterSurfaceY,
  settlementCameraClipPlanes,
  terrainClippedWaterAreaVertexData,
  waterAreaVertexData,
} from './settlementBabylon';

test('an authored ocean coastline remains one continuous polygon at any terrain LOD', () => {
  const data = waterAreaVertexData([
    { x: -100, y: -100 }, { x: 20, y: -100 }, { x: 20, y: 100 }, { x: -100, y: 100 },
  ], 12);
  expect(data.positions).toEqual([-2, 0.24, -2, .4, .24, -2, .4, .24, 2, -2, .24, 2]);
  expect(data.indices).toHaveLength(6);
  expect(data.normals.every(Number.isFinite)).toBe(true);
});

test('animated ocean waves preserve the authored surface clearance', () => {
  expect(animatedWaterSurfaceY(.015, .5)).toBeCloseTo(.025);
  expect(animatedWaterSurfaceY(.015, -.5)).toBeCloseTo(.005);
});

test('authored ocean geometry is removed over elevated terrain', () => {
  const data = terrainClippedWaterAreaVertexData([
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
  ], { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 }, 0, x => x < 45 ? -5 : 20);

  expect(data).not.toBeNull();
  const referenced = new Set(data.indices);
  for (const index of referenced) {
    expect(data.positions[index * 3] * 50).toBeLessThan(45);
  }
});

test('distant settlement cameras use a depth range suitable for terrain and water', () => {
  const clip = settlementCameraClipPlanes(692, 126976);
  expect(clip.minZ).toBeCloseTo(.692);
  expect(clip.maxZ).toBeGreaterThan(5000);
  expect(clip.maxZ / clip.minZ).toBeLessThan(10000);
  expect(settlementCameraClipPlanes(.4, 2000, true).minZ).toBe(.005);
});
