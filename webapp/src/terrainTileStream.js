import { FEET_PER_SCENE_UNIT } from './settlementEditor';
import { TILE_FEET, tileKey } from './settlementTiles';

// The database stores full grids even for coarse responses. Cap both decoded
// source tiles and returned samples so a sparse or dense map stays bounded.
export const MAX_TERRAIN_BATCH_SAMPLES = 4 * 257 * 257;
export const MAX_TERRAIN_BATCH_TILES = 4;

export function terrainTileBatchLimit(cellFeet) {
  const grid = Math.min(257, Math.max(2, Math.ceil(TILE_FEET / Math.max(1, cellFeet)) + 1));
  return Math.min(MAX_TERRAIN_BATCH_TILES, Math.max(1, Math.floor(MAX_TERRAIN_BATCH_SAMPLES / (grid * grid))));
}

export function terrainTileStreamKey(camera, cellFeet, settlementId) {
  const bounds = camera?.terrainBounds;
  if (!bounds) return null;
  const position = camera.position || camera.target || [0, 0, 0];
  const focusX = Math.floor((position[0] * FEET_PER_SCENE_UNIT) / TILE_FEET);
  const focusZ = Math.floor((position[2] * FEET_PER_SCENE_UNIT) / TILE_FEET);
  return [settlementId, cellFeet, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY,
    focusX, focusZ].join(':');
}

export function planTerrainTileBatches(camera, coverage, cellFeet) {
  const bounds = camera?.terrainBounds;
  if (!bounds) return [];
  const minX = Math.floor(bounds.minX / TILE_FEET);
  const maxX = Math.floor(bounds.maxX / TILE_FEET);
  const minZ = Math.floor(bounds.minY / TILE_FEET);
  const maxZ = Math.floor(bounds.maxY / TILE_FEET);
  const position = camera.position || camera.target || [0, 0, 0];
  const focusX = Math.floor((position[0] * FEET_PER_SCENE_UNIT) / TILE_FEET);
  const focusZ = Math.floor((position[2] * FEET_PER_SCENE_UNIT) / TILE_FEET);
  const grid = Math.min(257, Math.max(2, Math.ceil(TILE_FEET / Math.max(1, cellFeet)) + 1));
  const side = Math.max(1, Math.floor(Math.sqrt(terrainTileBatchLimit(cellFeet))));
  const originX = focusX - Math.floor((side - 1) / 2);
  const originZ = focusZ - Math.floor((side - 1) / 2);
  const firstX = Math.floor((minX - originX) / side);
  const lastX = Math.floor((maxX - originX) / side);
  const firstZ = Math.floor((minZ - originZ) / side);
  const lastZ = Math.floor((maxZ - originZ) / side);
  const batches = [];
  for (let chunkZ = firstZ; chunkZ <= lastZ; chunkZ += 1) {
    for (let chunkX = firstX; chunkX <= lastX; chunkX += 1) {
      const x0 = Math.max(minX, originX + chunkX * side);
      const x1 = Math.min(maxX, originX + (chunkX + 1) * side - 1);
      const z0 = Math.max(minZ, originZ + chunkZ * side);
      const z1 = Math.min(maxZ, originZ + (chunkZ + 1) * side - 1);
      const keys = [];
      for (let z = z0; z <= z1; z += 1) for (let x = x0; x <= x1; x += 1) {
        const key = tileKey(x, z);
        if ((coverage.get(key) || 0) < grid) keys.push(key);
      }
      if (keys.length) batches.push({ min_x: x0, max_x: x1, min_z: z0, max_z: z1,
        cell_feet: cellFeet, grid, keys, chunkX, chunkZ });
    }
  }
  const spiralAngle = batch => (Math.atan2(batch.chunkZ, batch.chunkX) + Math.PI * 2) % (Math.PI * 2);
  return batches.sort((a, b) =>
    Math.max(Math.abs(a.chunkX), Math.abs(a.chunkZ)) - Math.max(Math.abs(b.chunkX), Math.abs(b.chunkZ))
    || spiralAngle(a) - spiralAngle(b));
}

export async function streamTerrainTileBatches(batches, coverage, signal, fetchBatch, onBatch) {
  for (const batch of batches) {
    if (signal.aborted) return;
    // A previous pass may have filled this chunk while the camera was moving.
    if (batch.keys.every(key => (coverage.get(key) || 0) >= batch.grid)) continue;
    const tiles = await fetchBatch(batch, signal);
    if (signal.aborted) return;
    onBatch(tiles, batch);
    for (const key of batch.keys) coverage.set(key, batch.grid);
  }
}
