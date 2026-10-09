import { createTerrainHeightSampler, createTerrainStrokeSampler, heightmapHeightAt } from './settlementEditor';

export const TILE_GRID = 257;              // 256 intervals = 16 ft; supports 30-ft brushes reliably
export const TILE_FEET = 4096;             // world footprint of one tile
// TILE_GRID is the number of stored points, so there are TILE_GRID - 1
// intervals between the two shared tile edges.
export const CELL_FEET = TILE_FEET / (TILE_GRID - 1);
const EDGE_FADE_CELLS = TILE_GRID * 0.35;  // how far edge influence reaches inward

// ── Tiny deterministic noise (no dependency) ──
const hash2 = (x, y) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };
function valueNoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) {
    return 0.5 * valueNoise(x, y) + 0.25 * valueNoise(x * 2.1, y * 2.1)
        + 0.125 * valueNoise(x * 4.3, y * 4.3) + 0.0625 * valueNoise(x * 8.7, y * 8.7);
}

// Procedural terrain fills unknown frontier; it must not invent lakes in a
// default flat settlement. Explicit/imported below-sea samples still propagate
// across a genuine coast through the edge-correction pass below.
const naturalTerrainHeight = (store, x, y, base = store.defaults?.baseFeet ?? 30) => {
    const value = base + (fbm(x / 900, y / 900) - 0.5) * 48;
    if (store.defaults?.allowProceduralOcean) return value;
    return Math.max((store.defaults?.seaLevelFeet ?? 0) + 2, value);
};

function validTileValue(value) {
    return Number.isFinite(Number(value));
}

export const tileKey = (tx, tz) => `${tx},${tz}`;
export const tileIndexAt = (xFeet, yFeet) => ({
    tx: Math.floor(xFeet / TILE_FEET),
    tz: Math.floor(yFeet / TILE_FEET),
});

export function createTileStore(defaults = {}) {
    const store = new Map();
    store.defaults = { seaLevelFeet: 0, baseFeet: 30, ...defaults };
    return store;
}

export function setStoreDefaults(store, defaults) {
    store.defaults = { ...store.defaults, ...defaults };
}

/** Drops procedurally generated (unsculpted) tiles so they regenerate with new defaults. */
export function invalidateGeneratedTiles(store) {
    [...store.entries()].forEach(([key, tile]) => {
        if (tile.generated && !tile.dirty) store.delete(key);
    });
}

function blankTile(tx, tz) {
    return {
        layer_type: 'heightmap_tile',
        tile_x: tx, tile_z: tz,
        grid_width: TILE_GRID, grid_height: TILE_GRID,
        width_feet: TILE_FEET, height_feet: TILE_FEET,
        origin_x: tx * TILE_FEET, origin_y: tz * TILE_FEET,
        min_elevation_feet: 0, max_elevation_feet: 0,
        values: new Float32Array(TILE_GRID * TILE_GRID),
        generated: true, dirty: false,
    };
}

/** A tile object IS a valid heightMap object for terrainHeightAt()/samplers. */
export const tileAsHeightMap = tile => tile;

/** Seed the store with the original settlement heightmap (resampled if misaligned). */
export function seedStoreFromHeightMap(store, hm) {
    if (!hm?.values) return;
    // Imported/legacy heightmaps are centre-origin images. Decode them into
    // raw elevation feet while resampling every tile their footprint overlaps.
    const width = Math.max(1, Number(hm.width_feet) || 1);
    const height = Math.max(1, Number(hm.height_feet) || 1);
    const originX = Number.isFinite(hm.origin_x) ? hm.origin_x : 0;
    const originY = Number.isFinite(hm.origin_y) ? hm.origin_y : 0;
    const x0 = Math.floor((originX - width / 2) / TILE_FEET);
    const x1 = Math.ceil((originX + width / 2) / TILE_FEET) - 1;
    const z0 = Math.floor((originY - height / 2) / TILE_FEET);
    const z1 = Math.ceil((originY + height / 2) / TILE_FEET) - 1;
    for (let tz = z0; tz <= z1; tz++) for (let tx = x0; tx <= x1; tx++) {
        const tile = blankTile(tx, tz);
        tile.generated = false; // authored content, always persists
        for (let j = 0; j < TILE_GRID; j++) for (let i = 0; i < TILE_GRID; i++) {
            const fx = tile.origin_x + i * CELL_FEET, fy = tile.origin_y + j * CELL_FEET;
            tile.values[j * TILE_GRID + i] = heightmapHeightAt(hm, fx, fy);
        }
        store.set(tileKey(tx, tz), tile);
    }
}

/**
 * THE EDGE-PROPAGATION GENERATOR.
 * New tiles copy the exact border rows/columns of any existing neighbor (seamless),
 * then blend inward: edge values decay toward a base elevation while fractal
 * noise fades in with distance — so ranges continue naturally out from your
 * authored tile, and the shared border matches to the centimeter.
 */
export function ensureTile(store, tx, tz, options = {}) {
    const key = tileKey(tx, tz);
    if (store.has(key)) return store.get(key);
    const tile = blankTile(tx, tz);
    const G = TILE_GRID;
    const N = store.get(tileKey(tx, tz + 1)), S = store.get(tileKey(tx, tz - 1));
    const E = store.get(tileKey(tx + 1, tz)), W = store.get(tileKey(tx - 1, tz));
    const baseFall = options.fallbackBaseFeet ?? store.defaults?.baseFeet ?? 30;
    const baseline = (x, y) => naturalTerrainHeight(store, x, y, baseFall);
    // Initialize EVERY sample, including edges with no existing neighbor.
    // World coordinates make adjacent independently generated edges identical.
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        tile.values[j * G + i] = baseline(tile.origin_x + i * CELL_FEET, tile.origin_y + j * CELL_FEET);
    }

    // 1. Hard-copy shared borders from existing neighbors (exact seam match)
    const edges = { n: null, s: null, e: null, w: null };
    if (N) { edges.n = N.values.slice(0, G); for (let i = 0; i < G; i++) tile.values[(G - 1) * G + i] = edges.n[i]; }
    if (S) { edges.s = S.values.slice((G - 1) * G); for (let i = 0; i < G; i++) tile.values[i] = edges.s[i]; }
    if (W) { edges.w = []; for (let j = 0; j < G; j++) { edges.w[j] = W.values[j * G + (G - 1)]; tile.values[j * G] = edges.w[j]; } }
    if (E) { edges.e = []; for (let j = 0; j < G; j++) { edges.e[j] = E.values[j * G]; tile.values[j * G + (G - 1)] = edges.e[j]; } }
    // Corners: average where two neighbors meet
    if (N && W) tile.values[(G - 1) * G] = (edges.n[0] + edges.w[G - 1]) / 2;
    if (N && E) tile.values[(G - 1) * G + (G - 1)] = (edges.n[G - 1] + edges.e[G - 1]) / 2;
    if (S && W) tile.values[0] = (edges.s[0] + edges.w[0]) / 2;
    if (S && E) tile.values[G - 1] = (edges.s[G - 1] + edges.e[0]) / 2;

    const smooth = t => t * t * (3 - 2 * t);

    // Include natural edges in the blend too: approaching an unshared edge
    // must converge to its initialized heights, not to an unrelated neighbor.
    edges.n = tile.values.slice((G - 1) * G);
    edges.s = tile.values.slice(0, G);
    edges.w = Array.from({ length: G }, (_, j) => tile.values[j * G]);
    edges.e = Array.from({ length: G }, (_, j) => tile.values[j * G + G - 1]);
    for (let k = 0; k < G; k++) {
        const x = tile.origin_x + k * CELL_FEET, y = tile.origin_y + k * CELL_FEET;
        edges.n[k] -= baseline(x, tile.origin_y + TILE_FEET);
        edges.s[k] -= baseline(x, tile.origin_y);
        edges.w[k] -= baseline(tile.origin_x, y);
        edges.e[k] -= baseline(tile.origin_x + TILE_FEET, y);
    }

    // 2. Fill interior: distance-faded edge blend + noise that ramps in away from seams
    for (let j = 1; j < G - 1; j++) for (let i = 1; i < G - 1; i++) {
        const dN = G - 1 - j, dS = j, dW = i, dE = G - 1 - i;
        const wN = 1 / (dN * dN), wS = 1 / (dS * dS);
        const wW = 1 / (dW * dW), wE = 1 / (dE * dE);
        // Propagate only the departure from natural terrain. With no authored
        // neighbors, this leaves the same smooth global noise across all tiles.
        const correction = (
            wN * edges.n[i] + wS * edges.s[i] + wW * edges.w[j] + wE * edges.e[j]
        ) / (wN + wS + wW + wE);
        const f = 1 - smooth(Math.min(1, Math.min(dN, dS, dW, dE) / EDGE_FADE_CELLS));
        tile.values[j * G + i] += correction * f;
    }
    applyOceanContinuity(tile, store, { reshape: true, selfSeedBorder: false });
    store.set(key, tile);
    return tile;
}

/** Live sampler: strokes composed on top of whichever tile the point falls in. */
export function createWorldSampler(store, getStrokes, getHeightmapPlacement = () => null, { materializeMissing = true } = {}) {
    let indexedStrokes = null;
    let strokeSampler = null;
    return (xFeet, yFeet) => {
        const importedHeight = sampleHeightmapPlacement(getHeightmapPlacement?.(), xFeet, yFeet);
        if (importedHeight !== null) return importedHeight;
        const strokes = getStrokes?.() || [];
        if (strokes !== indexedStrokes) {
            indexedStrokes = strokes;
            strokeSampler = createTerrainStrokeSampler(strokes, (x, y) => {
                const { tx, tz } = tileIndexAt(x, y);
                const tile = store.get(tileKey(tx, tz));
                if (tile) return heightmapHeightAt(tile, x, y);
                if (materializeMissing) return heightmapHeightAt(ensureTile(store, tx, tz), x, y);
                return sampleFrontier(store, x, y);
            });
        }
        return strokeSampler(xFeet, yFeet);
    };
}

// Overview rendering samples the frontier directly. Merely looking at hundreds
// of distant tiles should not allocate 128x128 arrays for each one.
export function sampleFrontier(store, x, y) {
    const base = (px, py) => naturalTerrainHeight(store, px, py);
    const { tx, tz } = tileIndexAt(x, y);
    const x0 = tx * TILE_FEET, y0 = tz * TILE_FEET;
    const sides = [
        [tx - 1, tz, x0, y, x - x0], [tx + 1, tz, x0 + TILE_FEET, y, x0 + TILE_FEET - x],
        [tx, tz - 1, x, y0, y - y0], [tx, tz + 1, x, y0 + TILE_FEET, y0 + TILE_FEET - y],
    ];
    let correction = 0, weights = 0, nearest = Infinity;
    for (const [nx, nz, px, py, distance] of sides) {
        const neighbor = store.get(tileKey(nx, nz));
        if (distance < 0.0001 && neighbor) return heightmapHeightAt(neighbor, px, py);
        const weight = 1 / Math.max(0.0001, distance * distance);
        weights += weight;
        nearest = Math.min(nearest, distance);
        if (neighbor) correction += weight * (heightmapHeightAt(neighbor, px, py) - base(px, py));
    }
    const t = Math.min(1, nearest / (EDGE_FADE_CELLS * CELL_FEET));
    return base(x, y) + correction / weights * (1 - t * t * (3 - 2 * t));
}

/** Axis-aligned world bounds for a (possibly rotated) heightmap placement. */
export function heightmapPlacementBounds(placement) {
    if (!placement) return null;
    const width = Math.max(0, Number(placement.width_feet) || 0);
    const height = Math.max(0, Number(placement.height_feet) || 0);
    if (!width || !height) return null;
    const angle = (Number(placement.rotation) || 0) * Math.PI / 180;
    const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
    const halfX = (width * cos + height * sin) / 2;
    const halfY = (width * sin + height * cos) / 2;
    const cx = Number(placement.origin_x) || 0;
    const cy = Number(placement.origin_y) || 0;
    return { minX: cx - halfX, maxX: cx + halfX, minY: cy - halfY, maxY: cy + halfY };
}

/**
 * Bilinearly samples an uncommitted heightmap placement. The image's top edge
 * maps to +world Y, matching projected reference images. Returns null outside
 * the rotated footprint so callers can fall through to the normal terrain.
 */
export function sampleHeightmapPlacement(placement, xFeet, yFeet) {
    const gridWidth = Number(placement?.grid_width) || 0;
    const gridHeight = Number(placement?.grid_height) || 0;
    const values = placement?.values;
    const width = Math.max(0, Number(placement?.width_feet) || 0);
    const height = Math.max(0, Number(placement?.height_feet) || 0);
    if (!values || gridWidth < 1 || gridHeight < 1 || !width || !height) return null;

    const angle = (Number(placement.rotation) || 0) * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const dx = xFeet - (Number(placement.origin_x) || 0);
    const dy = yFeet - (Number(placement.origin_y) || 0);
    const localX = dx * cos + dy * sin;
    const localY = dx * sin - dy * cos;
    const u = localX / width + 0.5;
    const v = localY / height + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;

    const px = u * Math.max(0, gridWidth - 1);
    // This is the same orientation as referenceLayerUv: row 0 (the image's
    // top edge) points toward +world Y when rotation is zero.
    const py = v * Math.max(0, gridHeight - 1);
    const x0 = Math.floor(px), x1 = Math.min(gridWidth - 1, x0 + 1);
    const y0 = Math.floor(py), y1 = Math.min(gridHeight - 1, y0 + 1);
    const tx = px - x0, ty = py - y0;
    const at = (x, y) => Number(values[y * gridWidth + x]) || 0;
    const normalized = (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty)
        + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
    const min = Number(placement.min_elevation_feet) || 0;
    const max = Number.isFinite(Number(placement.max_elevation_feet))
        ? Number(placement.max_elevation_feet) : min + 250;
    return min + normalized * (max - min);
}

/**
 * Permanently overwrites the stored elevations beneath a placed heightmap.
 * Existing sculpting is intentionally replaced inside the footprint; values
 * outside it remain unchanged. Missing frontier tiles are materialized first.
 */
export function overwriteHeightmapIntoTiles(store, placement) {
    const bounds = heightmapPlacementBounds(placement);
    const touched = new Set();
    if (!store || !bounds) return { touched, bounds };
    const first = tileIndexAt(bounds.minX, bounds.minY);
    const last = tileIndexAt(bounds.maxX, bounds.maxY);
    const candidates = [];
    for (let tz = first.tz; tz <= last.tz; tz++) for (let tx = first.tx; tx <= last.tx; tx++) {
        candidates.push([tileKey(tx, tz), ensureTile(store, tx, tz)]);
    }

    candidates.forEach(([key, tile]) => {
        let changed = false;
        for (let j = 0; j < TILE_GRID; j++) for (let i = 0; i < TILE_GRID; i++) {
            const x = tile.origin_x + i * CELL_FEET;
            const y = tile.origin_y + j * CELL_FEET;
            const heightFeet = sampleHeightmapPlacement(placement, x, y);
            if (heightFeet === null) continue;
            tile.values[j * TILE_GRID + i] = heightFeet;
            changed = true;
        }
        if (changed) {
            tile.generated = false;
            tile.dirty = true;
            touched.add(key);
        }
    });
    touched.forEach(key => applyOceanContinuity(store.get(key), store, { reshape: false, selfSeedBorder: true }));
    return { touched, bounds };
}

/** Bake a stroke list into every tile it touches (gesture-end commit). */
export function bakeStrokesIntoTiles(store, strokeList) {
    const touched = new Set();
    const affectedRanges = new Map();
    strokeList.forEach(stroke => {
        const r = Number(stroke.radius) || 100;
        const t0 = tileIndexAt(stroke.x - r, stroke.y - r), t1 = tileIndexAt(stroke.x + r, stroke.y + r);
        for (let tz = t0.tz; tz <= t1.tz; tz++) for (let tx = t0.tx; tx <= t1.tx; tx++) {
            const key = tileKey(tx, tz);
            touched.add(key);
            const originX = tx * TILE_FEET, originY = tz * TILE_FEET;
            const range = {
                minI: Math.max(0, Math.floor((stroke.x - r - originX) / CELL_FEET)),
                maxI: Math.min(TILE_GRID - 1, Math.ceil((stroke.x + r - originX) / CELL_FEET)),
                minJ: Math.max(0, Math.floor((stroke.y - r - originY) / CELL_FEET)),
                maxJ: Math.min(TILE_GRID - 1, Math.ceil((stroke.y + r - originY) / CELL_FEET)),
            };
            if (range.minI <= range.maxI && range.minJ <= range.maxJ) {
                const ranges = affectedRanges.get(key) || [];
                ranges.push(range);
                affectedRanges.set(key, ranges);
            }
        }
    });

    // Materialize every neighbor before changing any values. Otherwise a
    // missing neighbor created later can copy an already-baked shared edge
    // and then apply the same stroke to that edge a second time.
    const tiles = new Map();
    touched.forEach(key => {
        const [tx, tz] = key.split(',').map(Number);
        tiles.set(key, ensureTile(store, tx, tz));
    });

    // Freeze every tile's common pre-gesture state before writing any output.
    const baseTiles = new Map();
    tiles.forEach((tile, key) => {
        baseTiles.set(key, { ...tile, values: tile.values.slice() });
    });

    // One spatially-bucketed sampler per tile for the whole gesture —
    // O(strokes) to build, then ~O(1) per cell instead of O(strokes) per cell.
    touched.forEach(key => {
        const tile = tiles.get(key);
        const sampleHeight = createTerrainHeightSampler(strokeList, baseTiles.get(key));
        const ranges = affectedRanges.get(key) || [];
        const estimatedMarks = ranges.reduce((total, range) => total
            + (range.maxI - range.minI + 1) * (range.maxJ - range.minJ + 1), 0);
        let affected = null;
        if (estimatedMarks < TILE_GRID * TILE_GRID * 0.8) {
            affected = new Uint8Array(TILE_GRID * TILE_GRID);
            ranges.forEach(range => {
                for (let j = range.minJ; j <= range.maxJ; j++) for (let i = range.minI; i <= range.maxI; i++) {
                    affected[j * TILE_GRID + i] = 1;
                }
            });
        }
        for (let j = 0; j < TILE_GRID; j++) for (let i = 0; i < TILE_GRID; i++) {
            if (affected && !affected[j * TILE_GRID + i]) continue;
            const fx = tile.origin_x + i * CELL_FEET, fy = tile.origin_y + j * CELL_FEET;
            tile.values[j * TILE_GRID + i] = sampleHeight(fx, fy);
        }
        tile.generated = false; tile.dirty = true;
    });
    return touched;
}

/** Persistence: only authored/dirty tiles need saving (generated ones regenerate identically). */
export const serializeTiles = store => [...store.values()]
    .filter(t => !t.generated || t.dirty)
    .map(({ oceanMask, ...rest }) => ({ ...rest, values: Array.from(rest.values) }));


/**
* Flood-fills the ocean from any border cell that touches an existing ocean tile,
* through every connected cell whose propagated height is below sea level.
* Masked cells get a proper seabed profile that deepens away from the coast,
* while dist=0 cells keep the neighbor's exact edge height (seamless shoreline).
* Isolated below-sea depressions are NOT flooded — they stay lakes.
*/
export function applyOceanContinuity(tile, store, { reshape = true, selfSeedBorder = false } = {}) {
    const sea = store.defaults?.seaLevelFeet ?? 0;
    const G = tile.grid_width;
    const mask = new Uint8Array(G * G);
    const dist = new Int32Array(G * G).fill(-1);
    const queue = [];

    const seed = (i, j) => {
        const idx = j * G + i;
        if (!mask[idx] && tile.values[idx] < sea) { mask[idx] = 1; dist[idx] = 0; queue.push(idx); }
    };
    const oceanEdge = (t, i, j) =>
        t && (t.oceanMask ? t.oceanMask[j * t.grid_width + i] === 1 : t.values[j * t.grid_width + i] < sea);

    const N = store.get(tileKey(tile.tile_x, tile.tile_z + 1));
    const S = store.get(tileKey(tile.tile_x, tile.tile_z - 1));
    const W = store.get(tileKey(tile.tile_x - 1, tile.tile_z));
    const E = store.get(tileKey(tile.tile_x + 1, tile.tile_z));

    // Seeds: border cells contiguous with an existing ocean tile
    if (N) for (let i = 0; i < G; i++) if (oceanEdge(N, i, 0)) seed(i, G - 1);
    if (S) for (let i = 0; i < G; i++) if (oceanEdge(S, i, G - 1)) seed(i, 0);
    if (W) for (let j = 0; j < G; j++) if (oceanEdge(W, G - 1, j)) seed(0, j);
    if (E) for (let j = 0; j < G; j++) if (oceanEdge(E, 0, j)) seed(G - 1, j);
    // Authored tiles also self-seed from any below-sea border cell (your harbor)
    if (selfSeedBorder) {
        for (let i = 0; i < G; i++) { seed(i, 0); seed(i, G - 1); }
        for (let j = 0; j < G; j++) { seed(0, j); seed(G - 1, j); }
    }

    // BFS flood through connected below-sea cells
    for (let head = 0; head < queue.length; head++) {
        const idx = queue[head], d = dist[idx];
        const i = idx % G, j = (idx / G) | 0;
        const nbrs = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]];
        for (const [ni, nj] of nbrs) {
            if (ni < 0 || nj < 0 || ni >= G || nj >= G) continue;
            const nidx = nj * G + ni;
            if (mask[nidx] || tile.values[nidx] >= sea) continue; // land blocks the flood
            mask[nidx] = 1; dist[nidx] = d + 1; queue.push(nidx);
        }
    }

    // Reshape flooded interior into a seabed that deepens away from the coast
    if (reshape) {
        const smooth = t => t * t * (3 - 2 * t);
        for (let idx = 0; idx < mask.length; idx++) {
            if (!mask[idx] || dist[idx] === 0) continue; // d=0 keeps the exact neighbor edge height
            const d = dist[idx];
            const depth = 15 + Math.min(160, d * CELL_FEET * 0.15);
            const jitter = (valueNoise((idx % G) * 0.35, ((idx / G) | 0) * 0.35) - 0.5) * 6;
            const profile = sea - depth + jitter;
            const t = smooth(Math.min(1, d / 6));
            tile.values[idx] = tile.values[idx] * (1 - t) + profile * t;
        }
    }

    tile.oceanMask = mask;
    return mask;
}

/** Handy for future foliage/biome/water-shading lookups. */
export function isOceanAtFeet(store, xFeet, yFeet) {
    const { tx, tz } = tileIndexAt(xFeet, yFeet);
    const tile = store.get(tileKey(tx, tz));
    if (!tile?.oceanMask) return false;
    const i = Math.floor((xFeet - tile.origin_x) / CELL_FEET);
    const j = Math.floor((yFeet - tile.origin_y) / CELL_FEET);
    return tile.oceanMask[j * tile.grid_width + i] === 1;
}

export function hydrateTiles(store, layers = []) {
    (layers || []).filter(l => l.layer_type === 'heightmap_tile' && Array.isArray(l.values)).forEach(l => {
        const tile = blankTile(Number(l.tile_x), Number(l.tile_z));
        const sourceWidth = Math.max(1, Math.floor(Number(l.grid_width) || 0));
        const sourceHeight = Math.max(1, Math.floor(Number(l.grid_height) || 0));
        const sourceLength = sourceWidth * sourceHeight;
        const complete = l.values.length >= sourceLength;
        const sourceValid = complete && l.values.slice(0, sourceLength).every(validTileValue);
        if (sourceWidth === TILE_GRID && sourceHeight === TILE_GRID) {
            // Do not let one invalid JSON value turn into a zero-foot pit. A
            // finite stored 0 is preserved; absent/invalid samples regenerate
            // from the same deterministic terrain used by the frontier.
            for (let index = 0; index < tile.values.length; index++) {
                const x = tile.origin_x + (index % TILE_GRID) * CELL_FEET;
                const y = tile.origin_y + Math.floor(index / TILE_GRID) * CELL_FEET;
                tile.values[index] = validTileValue(l.values[index]) ? Number(l.values[index]) : naturalTerrainHeight(store, x, y);
            }
        } else {
            // Older saves used 128 points per side. Resample elevations, not
            // image intensities. A truncated layer is treated as partial data,
            // not a blanket of zero elevation that can punch false lakes.
            for (let j = 0; j < TILE_GRID; j++) for (let i = 0; i < TILE_GRID; i++) {
                const x = tile.origin_x + i * CELL_FEET, y = tile.origin_y + j * CELL_FEET;
                const value = sourceValid ? heightmapHeightAt(l, x, y) : NaN;
                tile.values[j * TILE_GRID + i] = Number.isFinite(value) ? value : naturalTerrainHeight(store, x, y);
            }
        }
        tile.generated = !!l.generated;
        tile.dirty = false;
        store.set(tileKey(tile.tile_x, tile.tile_z), tile);
        applyOceanContinuity(tile, store, { reshape: false, selfSeedBorder: true });
    });
}
