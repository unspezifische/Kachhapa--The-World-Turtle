import {
  bakeStrokesIntoTiles,
  CELL_FEET,
  createTileStore,
  createWorldSampler,
  hydrateTiles,
  overwriteHeightmapIntoTiles,
  sampleHeightmapPlacement,
  seedStoreFromHeightMap,
  serializeTiles,
  TILE_FEET,
  TILE_GRID,
  tileIndexAt,
  tileKey,
} from './settlementTiles';
import { heightmapHeightAt } from './settlementEditor';

const flatTileLayer = (tileX = 0, tileZ = 0, elevation = 10) => ({
  layer_type: 'heightmap_tile',
  tile_x: tileX,
  tile_z: tileZ,
  grid_width: TILE_GRID,
  grid_height: TILE_GRID,
  width_feet: TILE_FEET,
  height_feet: TILE_FEET,
  origin_x: tileX * TILE_FEET,
  origin_y: tileZ * TILE_FEET,
  values: Array(TILE_GRID * TILE_GRID).fill(elevation),
  generated: false,
});

const imagePlacement = (overrides = {}) => ({
  grid_width: 2,
  grid_height: 2,
  // top-left, top-right, bottom-left, bottom-right
  values: new Float32Array([0, 1, 0.25, 0.75]),
  origin_x: TILE_FEET / 2,
  origin_y: TILE_FEET / 2,
  width_feet: TILE_FEET,
  height_feet: TILE_FEET,
  rotation: 0,
  min_elevation_feet: 100,
  max_elevation_feet: 200,
  ...overrides,
});

test('heightmap placement samples image orientation and bilinear elevations', () => {
  const placement = imagePlacement({ origin_x: 0, origin_y: 0, width_feet: 100, height_feet: 100 });

  expect(sampleHeightmapPlacement(placement, -50, 50)).toBeCloseTo(100, 5);
  expect(sampleHeightmapPlacement(placement, 50, 50)).toBeCloseTo(200, 5);
  expect(sampleHeightmapPlacement(placement, -50, -50)).toBeCloseTo(125, 5);
  expect(sampleHeightmapPlacement(placement, 0, 0)).toBeCloseTo(150, 5);
  expect(sampleHeightmapPlacement(placement, 51, 0)).toBeNull();
});

test('heightmap preview overrides the sampler without mutating stored tiles', () => {
  const store = createTileStore();
  hydrateTiles(store, [flatTileLayer(0, 0, 10)]);
  const tile = store.get(tileKey(0, 0));
  const before = tile.values.slice();
  const placement = imagePlacement();
  const sampler = createWorldSampler(store, () => [], () => placement);

  expect(sampler(TILE_FEET / 2, TILE_FEET / 2)).toBeCloseTo(150, 5);
  expect(tile.dirty).toBe(false);
  expect(Array.from(tile.values)).toEqual(Array.from(before));
});

test('applying a heightmap replaces existing elevations and persists the result', () => {
  const store = createTileStore();
  hydrateTiles(store, [flatTileLayer(0, 0, 10), flatTileLayer(1, 0, 33)]);
  const placement = imagePlacement();
  const { touched } = overwriteHeightmapIntoTiles(store, placement);

  expect(touched.has(tileKey(0, 0))).toBe(true);
  expect(createWorldSampler(store, () => [])(TILE_FEET / 2, TILE_FEET / 2)).toBeCloseTo(150, 4);
  expect(createWorldSampler(store, () => [])(TILE_FEET + CELL_FEET, CELL_FEET)).toBeCloseTo(33, 4);
  expect(store.get(tileKey(0, 0)).dirty).toBe(true);
  expect(store.get(tileKey(0, 0)).generated).toBe(false);

  const restored = createTileStore();
  hydrateTiles(restored, serializeTiles(store));
  expect(createWorldSampler(restored, () => [])(TILE_FEET / 2, TILE_FEET / 2)).toBeCloseTo(150, 4);
});

test('heightmap apply materializes authored tiles on the negative frontier', () => {
  const store = createTileStore();
  const placement = imagePlacement({ origin_x: -TILE_FEET * 2.5, origin_y: -TILE_FEET * 1.5 });
  const { touched } = overwriteHeightmapIntoTiles(store, placement);
  const center = tileIndexAt(placement.origin_x, placement.origin_y);
  const tile = store.get(tileKey(center.tx, center.tz));

  expect(touched.size).toBeGreaterThan(0);
  expect(tile).toBeTruthy();
  expect(tile.generated).toBe(false);
  expect(tile.dirty).toBe(true);
  expect(createWorldSampler(store, () => [])(placement.origin_x, placement.origin_y)).toBeCloseTo(150, 4);
});

test('baked terrain matches the live stroke after preview strokes are cleared', () => {
  const store = createTileStore();
  hydrateTiles(store, [flatTileLayer()]);

  // Use the north-east half of the tile. The legacy image-heightmap
  // convention treated this valid tile coordinate as out-of-bounds.
  const x = CELL_FEET * 96 + 7.25;
  const y = CELL_FEET * 80 + 11.5;
  let previewStrokes = [{
    id: 'stroke-1',
    x,
    y,
    radius: 300,
    mode: 'raise',
    delta: 8,
  }];
  const sample = createWorldSampler(store, () => previewStrokes);
  const liveHeight = sample(x, y);

  bakeStrokesIntoTiles(store, previewStrokes);
  previewStrokes = [];
  const committedHeight = sample(x, y);

  expect(liveHeight).toBeCloseTo(18, 5);
  expect(Math.abs(committedHeight - liveHeight)).toBeLessThan(0.1);

  // Match the production payload's hundredth-of-a-foot rounding, then load
  // the same representation the server returns on the next map fetch.
  const savedTiles = serializeTiles(store).map(tile => ({
    ...tile,
    values: tile.values.map(value => Math.round(value * 100) / 100),
  }));
  const restored = createTileStore();
  hydrateTiles(restored, savedTiles);
  expect(createWorldSampler(restored, () => [])(x, y)).toBeCloseTo(committedHeight, 2);
});

test('committed tile elevations survive serialization and hydration', () => {
  const store = createTileStore();
  hydrateTiles(store, [flatTileLayer(-1, -1, 24)]);
  const x = -TILE_FEET + CELL_FEET * 100;
  const y = -TILE_FEET + CELL_FEET * 72;
  const strokes = [{ x, y, radius: 250, mode: 'lower', delta: -6 }];

  bakeStrokesIntoTiles(store, strokes);
  const committedHeight = createWorldSampler(store, () => [])(x, y);

  const restored = createTileStore();
  hydrateTiles(restored, serializeTiles(store));
  const restoredHeight = createWorldSampler(restored, () => [])(x, y);

  expect(committedHeight).toBeCloseTo(18, 5);
  expect(restoredHeight).toBeCloseTo(committedHeight, 5);
});

test('a stroke crossing into a new tile is applied only once at the shared edge', () => {
  const store = createTileStore();
  hydrateTiles(store, [flatTileLayer(0, 0, 10)]);
  const yIndex = 64;
  const y = CELL_FEET * yIndex;
  const stroke = {
    x: TILE_FEET - 100,
    y,
    radius: 300,
    mode: 'raise',
    delta: 8,
  };
  const distance = TILE_FEET - stroke.x;
  const expectedAtSeam = 10 + stroke.delta * (1 - (distance / stroke.radius) ** 2) ** 2;

  bakeStrokesIntoTiles(store, [stroke]);
  const west = store.get(tileKey(0, 0));
  const east = store.get(tileKey(1, 0));
  const westEdge = west.values[yIndex * TILE_GRID + TILE_GRID - 1];
  const eastEdge = east.values[yIndex * TILE_GRID];

  expect(westEdge).toBeCloseTo(expectedAtSeam, 4);
  expect(eastEdge).toBeCloseTo(expectedAtSeam, 4);
  expect(eastEdge).toBeCloseTo(westEdge, 5);
});

test('legacy center-origin heightmaps keep their elevations when seeded into tiles', () => {
  const heightmap = {
    layer_type: 'heightmap',
    grid_width: 2,
    grid_height: 2,
    width_feet: 100,
    height_feet: 100,
    origin_x: 0,
    origin_y: 0,
    min_elevation_feet: -20,
    max_elevation_feet: 180,
    values: [0, 255, 64, 128],
  };
  const store = createTileStore();
  seedStoreFromHeightMap(store, heightmap);
  const sample = createWorldSampler(store, () => []);

  [[0, 0], [CELL_FEET, CELL_FEET], [-CELL_FEET, -CELL_FEET]].forEach(([x, y]) => {
    expect(sample(x, y)).toBeCloseTo(heightmapHeightAt(heightmap, x, y), 5);
  });
});
