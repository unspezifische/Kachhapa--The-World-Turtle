import { FEET_PER_SCENE_UNIT } from './settlementEditor';
import { TILE_FEET } from './settlementTiles';
import { planTerrainTileBatches, streamTerrainTileBatches, terrainTileBatchLimit, terrainTileStreamKey } from './terrainTileStream';

const camera = (minX, maxX, minZ, maxZ, focusX = 0, focusZ = 0) => ({
  terrainBounds: { minX: minX * TILE_FEET, maxX: maxX * TILE_FEET,
    minY: minZ * TILE_FEET, maxY: maxZ * TILE_FEET },
  position: [focusX * TILE_FEET / FEET_PER_SCENE_UNIT, 10,
    focusZ * TILE_FEET / FEET_PER_SCENE_UNIT],
});

test('Waterdeep-sized windows stream camera-first and cover every visible tile in bounded batches', () => {
  const batches = planTerrainTileBatches(camera(-20, 22, -6, 7, 4, 1), new Map(), 1024);
  const keys = batches.flatMap(batch => batch.keys);
  expect(keys).toHaveLength(43 * 14);
  expect(new Set(keys).size).toBe(keys.length);
  expect(batches[0].keys).toContain('4,1');
  expect(batches.length).toBeGreaterThan(1);
  expect(batches.every(batch =>
    (batch.max_x - batch.min_x + 1) * (batch.max_z - batch.min_z + 1) <= terrainTileBatchLimit(1024)
  )).toBe(true);
});

test('native sculpt tiles use at most four tiles per request', () => {
  const batches = planTerrainTileBatches(camera(-3, 3, -3, 3), new Map(), 16);
  expect(terrainTileBatchLimit(16)).toBe(4);
  expect(batches.every(batch => batch.keys.length <= 4)).toBe(true);
  expect(batches[0].keys).toContain('0,0');
});

test('small camera motion within a tile does not cancel the current stream', () => {
  const first = camera(-3, 3, -3, 3, 0.1, 0.1);
  const moved = camera(-3, 3, -3, 3, 0.8, 0.8);
  expect(terrainTileStreamKey(first, 16, 3)).toBe(terrainTileStreamKey(moved, 16, 3));
  expect(terrainTileStreamKey(first, 16, 3)).not.toBe(terrainTileStreamKey(camera(-3, 3, -3, 3, 1.1, 0.1), 16, 3));
});

test('coverage advances only after successful chunks, including empty authored results', async () => {
  const coverage = new Map();
  const batches = planTerrainTileBatches(camera(0, 8, 0, 0), coverage, 1024);
  const seen = [];
  await streamTerrainTileBatches(batches, coverage, new AbortController().signal,
    async batch => { seen.push(batch); return []; }, () => {});
  expect(seen).toHaveLength(batches.length);
  expect([...coverage.keys()]).toHaveLength(9);
  expect(planTerrainTileBatches(camera(0, 8, 0, 0), coverage, 1024)).toEqual([]);

  const failedCoverage = new Map();
  await expect(streamTerrainTileBatches(batches, failedCoverage, new AbortController().signal,
    async () => { throw new Error('worker unavailable'); }, () => {})).rejects.toThrow('worker unavailable');
  expect(failedCoverage.size).toBe(0);
});

test('moving the camera stops later chunks without claiming their coverage', async () => {
  const coverage = new Map();
  const controller = new AbortController();
  const batches = planTerrainTileBatches(camera(-8, 8, -8, 8), coverage, 1024);
  let calls = 0;
  await streamTerrainTileBatches(batches, coverage, controller.signal,
    async () => { calls += 1; controller.abort(); return []; }, () => {});
  expect(calls).toBe(1);
  expect(coverage.size).toBe(0);
});
