import { planTerrainView, referenceCameraFrame, terrainSampleOrder } from './terrainView';
import { FEET_PER_SCENE_UNIT } from './settlementEditor';
import { createTileStore, createWorldSampler } from './settlementTiles';

const view = (radius, beta = 1.05, alpha = -0.75) => {
  const target = { x: 163.8, y: 0, z: -245.8 };
  return { target, alpha, beta, fov: 0.8, aspect: 2,
    position: { x: target.x + radius * Math.sin(beta) * Math.cos(alpha),
      y: radius * Math.cos(beta), z: target.z + radius * Math.sin(beta) * Math.sin(alpha) } };
};

test.each([0.02, 0.35, 1.05, 1.5])('overview covers the look target at pitch %f', beta => {
  const camera = view(1400, beta);
  const plan = planTerrainView(camera);
  const x = camera.target.x * FEET_PER_SCENE_UNIT, z = camera.target.z * FEET_PER_SCENE_UNIT;
  expect(plan.bounds.minX).toBeLessThan(x);
  expect(plan.bounds.maxX).toBeGreaterThan(x);
  expect(plan.bounds.minY).toBeLessThan(z);
  expect(plan.bounds.maxY).toBeGreaterThan(z);
  expect(plan.debug.cellsX).toBeLessThanOrEqual(257);
  expect(plan.debug.cellsZ).toBeLessThanOrEqual(257);
});

test('high-altitude views expand coverage and coarsen geometry', () => {
  const low = planTerrainView(view(100));
  const high = planTerrainView(view(1400));
  expect(high.debug.tilesX * high.debug.tilesZ).toBeGreaterThan(81);
  expect(high.debug.spanFeet).toBeGreaterThan(low.debug.spanFeet);
  expect(high.debug.cellFeet).toBeGreaterThan(low.debug.cellFeet);
});

test('ground-level views reach 5-ft mesh spacing without whole-tile padding', () => {
  const plan = planTerrainView(view(1, 1.21));
  expect(plan.debug.cellFeet).toBe(5);
  expect(plan.debug.spanFeet).toBeLessThan(1280);
});

test('initial framing follows the reference image rather than frontier bounds', () => {
  const frame = referenceCameraFrame([{ image_url: '/waterdeep.png', visible: true, origin_x: 100, origin_y: -200,
    width_feet: 16718, height_feet: 23403 }], { minX: -100000, maxX: 100000, minY: -100000, maxY: 100000, width: 200000, height: 200000 });
  expect(frame.x).toBe(100);
  expect(frame.y).toBe(-200);
  expect(frame.radius).toBeLessThan(1000);
});

test('frontier overview sampling does not allocate full tiles', () => {
  const store = createTileStore();
  const strokes = [];
  const sample = createWorldSampler(store, () => strokes, () => null, { materializeMissing: false });
  for (let x = -100000; x <= 100000; x += 1000) expect(Number.isFinite(sample(x, x))).toBe(true);
  expect(store.size).toBe(0);
});

test('streaming samples the focus tile before outer rings', () => {
  const data = new Float32Array([200, 0, 0, 0, 0, 0, 100, 0, 0]);
  const groups = terrainSampleOrder(data, 0, 0);
  expect(groups[0].indices).toEqual([3]);
  expect(groups[groups.length - 1].indices).toEqual([0]);
});
