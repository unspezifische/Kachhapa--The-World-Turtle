import {
  createTerrainHeightSampler,
  FEET_PER_SCENE_UNIT,
  roadWidthAt,
  waterDepthAtSeaLevel,
} from './settlementEditor';

import { Vector3, VertexData, NodeMaterial, Texture } from '@babylonjs/core';

/**
 * Merges two bounding boxes (in Scene Units) to track the total dirty area 
 * during a sculpting gesture.
 */
export function mergeBox(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Rewrites ONLY the Y channel of mapData inside a scene-unit box, 
 * then triggers a geometry update on the ribbon.
 */
export function refreshTerrainRegion(dt, sampler, meta, box) {
  const { cellSize, mapSubX, mapSubZ, bounds } = meta;
  const minX = Math.floor(bounds.minX / FEET_PER_SCENE_UNIT / cellSize) * cellSize;
  const minZ = Math.floor(bounds.minY / FEET_PER_SCENE_UNIT / cellSize) * cellSize;
  const c0 = Math.max(0, Math.floor((box.minX - minX) / cellSize)), c1 = Math.min(mapSubX - 1, Math.ceil((box.maxX - minX) / cellSize));
  const r0 = Math.max(0, Math.floor((box.minY - minZ) / cellSize)), r1 = Math.min(mapSubZ - 1, Math.ceil((box.maxY - minZ) / cellSize));
  const mapData = dt.mapData;
  for (let r = r0; r <= r1; r++) {
    const fz = (minZ + r * cellSize) * FEET_PER_SCENE_UNIT;
    for (let c = c0; c <= c1; c++) {
      const fx = (minX + c * cellSize) * FEET_PER_SCENE_UNIT;
      mapData[(r * mapSubX + c) * 3 + 1] = sampler(fx, fz) / FEET_PER_SCENE_UNIT;
    }
  }
  dt.update(true);
}


export const worldToBabylon = (xFeet, yFeet, elevationFeet = 0) => {
  return new Vector3(xFeet / FEET_PER_SCENE_UNIT, elevationFeet / FEET_PER_SCENE_UNIT, yFeet / FEET_PER_SCENE_UNIT);
};

export const babylonToWorld = (point) => {
  return { x: point.x * FEET_PER_SCENE_UNIT, y: point.z * FEET_PER_SCENE_UNIT, elevation: point.y * FEET_PER_SCENE_UNIT };
};

export function pointInsideRegion(x, y, region) {
  let inside = false;
  const points = region?.points || [];
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const current = points[index], prior = points[previous];
    if (((current.y > y) !== (prior.y > y)) && x < (prior.x - current.x) * (y - current.y) / ((prior.y - current.y) || .000001) + current.x) inside = !inside;
  }
  return inside;
}

/**
 * Classifies every TextureBlock in the graph and enforces the correct
 * texture address mode:
 *  - Reference overlays  → CLAMP (glued to one world location, hard stop at edges)
 *  - Ground materials    → WRAP  (grass/sand/snow/rock tile infinitely)
 * Safe to call repeatedly (after parse, and after any texture swap).
 */
const isReferenceTextureBlock = (name = '') =>
  name === 'refTexture' || /ref(erence)?[_\s-]?(layer|texture|overlay|image)/i.test(name);

function resolveBlockTexture(block) {
  // Case A: texture embedded directly on the TextureBlock
  if (block.texture instanceof Texture) return block.texture;
  // Case B: texture fed through the 'source' input from an ImageSourceBlock
  const sourceInput = (block.inputs || []).find(i => i.name === 'source');
  const provider = sourceInput?.connectedPoint?.ownerBlock;
  return provider?.texture instanceof Texture ? provider.texture : null;
}

export function applyTerrainTextureWrapModes(nodeMaterial) {
  if (!nodeMaterial?.attachedBlocks) return;

  nodeMaterial.attachedBlocks.forEach(block => {
    if (block.className !== 'TextureBlock') return; // 'TextureBlock' string avoids extra imports
    const tex = resolveBlockTexture(block);
    if (!tex) return;

    const mode = isReferenceTextureBlock(block.name)
      ? Texture.CLAMP_ADDRESSMODE   // glued overlay
      : Texture.WRAP_ADDRESSMODE;   // tiling ground material

    tex.wrapU = mode;
    tex.wrapV = mode;
    tex.wrapR = mode; // keeps 3D/triplanar samplers consistent if you ever enable them
  });
}


// 1. Fetch and parse the JSON material
export async function loadTerrainMaterialFromJson(scene, jsonUrl, referenceLayer = null) {
  const response = await fetch(jsonUrl);
  const serialized = await response.json();
  const nodeMaterial = NodeMaterial.Parse(serialized, scene);

  if (referenceLayer && referenceLayer.image_url) {
    const refTextureBlock = nodeMaterial.getBlockByName("refTexture");
    if (refTextureBlock) {
      const tex = new Texture(referenceLayer.image_url, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
      tex.hasAlpha = true;
      refTextureBlock.texture = tex;
    } else {
      console.warn("[Terrain] Could not find a TextureBlock named 'refTexture' in the loaded JSON.");
    }
  }

  // Single source of truth for CLAMP vs WRAP across the whole graph
  applyTerrainTextureWrapModes(nodeMaterial);

  return nodeMaterial;
}

// 2. Dynamically update the NME Input Blocks based on React state
export function updateTerrainMaterialInputs(nodeMaterial, terrainSettings, referenceLayer, scene) {
  if (!nodeMaterial) return;

  // Helper to find and update InputBlocks by name
  const updateInput = (name, value) => {
    // FIX: Use getBlockByName instead of getInputBlockByName
    const block = nodeMaterial.getBlockByName(name);
    if (block && block.value !== value) {
      block.value = value;
    }
  };

  // --- Update Terrain Thresholds ---
  updateInput("seaLevel", (terrainSettings.sea_level_feet || 0) / FEET_PER_SCENE_UNIT);
  updateInput("snowLine", (terrainSettings.snow_line_feet || 900) / FEET_PER_SCENE_UNIT);
  updateInput("snowBlend", (terrainSettings.snow_blend_feet || 500) / FEET_PER_SCENE_UNIT);
  updateInput("cliffThreshold", terrainSettings.cliff_normal_threshold || 0.86);

  // --- Update Reference Layer Projection ---
  if (referenceLayer && referenceLayer.image_url) {
    updateInput("refOriginX", (referenceLayer.origin_x || 0) / FEET_PER_SCENE_UNIT);
    updateInput("refOriginY", (referenceLayer.origin_y || 0) / FEET_PER_SCENE_UNIT);
    updateInput("refWidth", (referenceLayer.width_feet || 100) / FEET_PER_SCENE_UNIT);
    updateInput("refHeight", (referenceLayer.height_feet || 100) / FEET_PER_SCENE_UNIT);
    updateInput("refRotation", -(referenceLayer.rotation_degrees || 0) * Math.PI / 180);
    updateInput("refOpacity", referenceLayer.opacity ?? 0.7);

    // Update the TextureBlock (Only recreate the texture if the URL changed to save GPU memory)
    const texBlock = nodeMaterial.getBlockByName("refTexture");
    if (texBlock) {
      if (!texBlock.texture || texBlock.texture.url !== referenceLayer.image_url) {
        texBlock.texture = new Texture(referenceLayer.image_url, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
        texBlock.texture.hasAlpha = true;
        texBlock.texture.wrapU = Texture.CLAMP_ADDRESSMODE;
        texBlock.texture.wrapV = Texture.CLAMP_ADDRESSMODE;
      }
    }
  } else {
    // If no reference layer is active, force opacity to 0 so it doesn't render garbage
    updateInput("refOpacity", 0);
  }
  applyTerrainTextureWrapModes(nodeMaterial);
}


// Catmull-Rom math translation layer matching Three.js logic
function catmullRomSpline(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return new Vector3(
    0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0,
    // 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
  );
}

function getSplinePoint(points, amount) {
  const len = points.length;
  const scaled = amount * (len - 1);
  const index = Math.min(len - 2, Math.floor(scaled));
  const localT = scaled - index;

  const p0 = points[Math.max(0, index - 1)];
  const p1 = points[index];
  const p2 = points[index + 1];
  const p3 = points[Math.min(len - 1, index + 2)];

  return catmullRomSpline(p0, p1, p2, p3, localT);
}

// 2. ROADS & STREETS COMPILER (Glued smoothly onto terrain)
export function roadVertexData(road, strokes, heightMap, heightSampler) {
  heightSampler = heightSampler || createTerrainHeightSampler(strokes, heightMap);
  const source = (road.points || []).map(point => new Vector3(point.x / FEET_PER_SCENE_UNIT, 0, point.y / FEET_PER_SCENE_UNIT));
  if (source.length < 2) return new VertexData();

  const samples = Math.max(32, source.length * 32);
  const positions = [], indices = [], uvs = [];

  for (let index = 0; index <= samples; index += 1) {
    const amount = index / samples;
    const point = getSplinePoint(source, amount);
    const nearby = getSplinePoint(source, Math.min(1, amount + 1 / samples));

    const tangent = nearby.subtract(point).normalize();
    const halfWidth = roadWidthAt(road, amount) / (2 * FEET_PER_SCENE_UNIT);
    const normal = new Vector3(-tangent.z, 0, tangent.x).scale(halfWidth);

    const left = point.add(normal);
    const right = point.subtract(normal);

    // Map central sample points onto the dynamic height data
    const centerWorldX = point.x * FEET_PER_SCENE_UNIT;
    const centerWorldY = point.z * FEET_PER_SCENE_UNIT;
    const groundElevation = (heightSampler(centerWorldX, centerWorldY) + 0.15) / FEET_PER_SCENE_UNIT;

    positions.push(left.x, groundElevation, left.z, right.x, groundElevation, right.z);
    uvs.push(0, amount * 8, 1, amount * 8);

    if (index < samples) {
      const offset = index * 2;
      indices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
    }
  }

  const normals = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.uvs = uvs;
  data.normals = normals;
  return data;
}

export function fortificationVertexData(wall, strokes, heightMap, heightSampler) {
  heightSampler = heightSampler || createTerrainHeightSampler(strokes, heightMap);
  const source = (wall.points || []).map(point => new Vector3(point.x / FEET_PER_SCENE_UNIT, 0, point.y / FEET_PER_SCENE_UNIT));
  if (source.length < 2) return new VertexData();

  const samples = Math.max(24, source.length * 18);
  const positions = [], indices = [];
  const halfWidth = (Number(wall.width_feet) || 24) / (2 * FEET_PER_SCENE_UNIT);
  const height = (Number(wall.height_feet) || 35) / FEET_PER_SCENE_UNIT;

  for (let index = 0; index <= samples; index += 1) {
    const amount = index / samples;
    const point = getSplinePoint(source, amount);
    const nearby = getSplinePoint(source, Math.min(1, amount + 1 / samples));

    const tangent = nearby.subtract(point).normalize();
    const normal = new Vector3(-tangent.z, 0, tangent.x).scale(halfWidth);

    const left = point.add(normal);
    const right = point.subtract(normal);

    const centerWorldX = point.x * FEET_PER_SCENE_UNIT;
    const centerWorldY = point.z * FEET_PER_SCENE_UNIT;
    const wallBaseElevation = heightSampler(centerWorldX, centerWorldY) / FEET_PER_SCENE_UNIT;

    // Push 4 vertices per step layer smoothly
    positions.push(
      left.x, wallBaseElevation, left.z,           // [offset + 0] Left Base
      right.x, wallBaseElevation, right.z,         // [offset + 1] Right Base
      left.x, wallBaseElevation + height, left.z,  // [offset + 2] Left Top
      right.x, wallBaseElevation + height, right.z // [offset + 3] Right Top
    );

    if (index < samples) {
      const offset = index * 4;
      const next = offset + 4;

      //  CORRECTED 4-POINT QUAD INDEXING (Constructs clean inner, outer, and top wall faces)
      indices.push(
        // Outer Face Panel
        offset, next, offset + 2,
        offset + 2, next, next + 2,

        // Inner Face Panel
        offset + 1, offset + 3, next + 1,
        offset + 3, next + 3, next + 1,

        // Walkway Top Roof Deck Panel
        offset + 2, next + 2, offset + 3,
        offset + 3, next + 2, next + 3
      );
    }
  }

  const normals = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  return data;
}

// 5. RIVER GENERATOR
export function riverVertexData(body, strokes, heightMap, heightSampler) {
  heightSampler = heightSampler || createTerrainHeightSampler(strokes, heightMap);
  const sourcePoints = [...(body.points || [])];
  if (sourcePoints.length < 2) return new VertexData();
  if (heightSampler(sourcePoints[0].x, sourcePoints[0].y) < heightSampler(sourcePoints.at(-1).x, sourcePoints.at(-1).y)) {
    sourcePoints.reverse();
  }
  const source = sourcePoints.map(p => new Vector3(p.x / FEET_PER_SCENE_UNIT, 0, p.y / FEET_PER_SCENE_UNIT));
  const samples = Math.max(36, source.length * 28); const positions = [], indices = [], uvs = []; let previousHeight = Infinity;
  for (let index = 0; index <= samples; index += 1) {
    const amount = index / samples;
    const point = getSplinePoint(source, amount);
    const nearby = getSplinePoint(source, Math.min(1, amount + 1 / samples));
    const tangent = nearby.subtract(point).normalize();
    const normal = new Vector3(-tangent.z, 0, tangent.x).scale((Number(body.width_feet) || 30) / (2 * FEET_PER_SCENE_UNIT)); const left = point.add(normal);
    const right = point.subtract(normal); const streamWorldX = point.x * FEET_PER_SCENE_UNIT;
    const streamWorldY = point.z * FEET_PER_SCENE_UNIT;
    previousHeight = Math.min(previousHeight, heightSampler(streamWorldX, streamWorldY) - 0.2);
    positions.push(left.x, previousHeight / FEET_PER_SCENE_UNIT, left.z, right.x, previousHeight / FEET_PER_SCENE_UNIT, right.z);
    uvs.push(0, amount * 10, 1, amount * 10);
    if (index < samples) {
      const offset = index * 2;
      indices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
    }
  }

  const normals = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData(); data.positions = positions;
  data.indices = indices; data.uvs = uvs; data.normals = normals;
  return data;
}

// 6. OCEAN PLANE GENERATOR
export function oceanVertexData(bounds, strokes, heightMap, seaLevel, heightSampler) {
  heightSampler = heightSampler || createTerrainHeightSampler(strokes, heightMap);
  const segments = 96;
  const positions = [], indices = [], uvs = [];
  const depths = [], exposures = [];

  const edgeSamples = { west: [], east: [], north: [], south: [] };

  // Sample perimeter elevations to calculate wind/wave orientation matching Three.js logic
  for (let index = 0; index <= segments; index += 1) {
    const amount = index / segments;
    const x = bounds.minX + amount * bounds.width;
    const y = bounds.minY + amount * bounds.height;

    edgeSamples.west.push(heightSampler(bounds.minX, y));
    edgeSamples.east.push(heightSampler(bounds.maxX, y));
    edgeSamples.north.push(heightSampler(x, bounds.maxY));
    edgeSamples.south.push(heightSampler(x, bounds.minY));
  }

  const average = values => values.reduce((sum, val) => sum + val, 0) / Math.max(1, values.length);
  const lowestEdge = Object.entries(edgeSamples).sort((a, b) => average(a[1]) - average(b[1]))[0][0];

  // Set wave trajectory pointing inward from the deepest open boundary
  const waveDirection = {
    west: { x: -1, y: 0 },
    east: { x: 1, y: 0 },
    north: { x: 0, y: 1 },
    south: { x: 0, y: -1 }
  }[lowestEdge];

  // Build the geometric grid structure
  for (let row = 0; row <= segments; row += 1) {
    for (let column = 0; column <= segments; column += 1) {
      const x = bounds.minX + (column / segments) * bounds.width;
      const y = bounds.minY + (row / segments) * bounds.height;

      const depth = waterDepthAtSeaLevel(heightSampler(x, y), seaLevel);
      let exposure = 1.0;

      // Cast obstruction vectors backward toward the ocean body to verify island shielding
      if (depth > 0) {
        const stepDistance = Math.max(bounds.width, bounds.height) / 24;
        for (let distance = stepDistance; distance < Math.max(bounds.width, bounds.height); distance += stepDistance) {
          const sampleX = x + waveDirection.x * distance;
          const sampleY = y + waveDirection.y * distance;

          if (sampleX < bounds.minX || sampleX > bounds.maxX || sampleY < bounds.minY || sampleY > bounds.maxY) {
            break;
          }
          // If waves hit high ground, dampen the wave crest profile behind it
          if (heightSampler(sampleX, sampleY) >= seaLevel) {
            exposure = 0.18;
            break;
          }
        }
      }

      // Push arrays out matching Babylon's X/Y/Z coordinate arrangement (Y is up)
      positions.push(x / FEET_PER_SCENE_UNIT, seaLevel / FEET_PER_SCENE_UNIT, y / FEET_PER_SCENE_UNIT);
      uvs.push(column / segments, row / segments);

      depths.push(depth / FEET_PER_SCENE_UNIT);
      exposures.push(exposure);
    }
  }

  // Construct index winding buffers
  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const a = row * (segments + 1) + column;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const normals = [];
  VertexData.ComputeNormals(positions, indices, normals);

  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.uvs = uvs;
  data.normals = normals;

  // Cache structural directional parameters so our shader animation loop knows where waves travel
  data.waveDirection = waveDirection;

  return data;
}

/**
 * Builds a single static map buffer covering the entire settlement bounds.
 * Cell size is in SCENE UNITS (2 units ≈ 20 ft), which keeps a 16k×23k ft
 * world at ~840×1170 cells (~11 MB Float32Array) — built once behind the
 * MapLoading spinner, never rewritten per frame.
 */
export function buildWorldMapData(heightSamplerFeet, boundsFeet, cellSize = 2) {
  const minX = Math.floor(boundsFeet.minX / FEET_PER_SCENE_UNIT / cellSize) * cellSize;
  const minZ = Math.floor(boundsFeet.minY / FEET_PER_SCENE_UNIT / cellSize) * cellSize;
  const maxX = Math.ceil(boundsFeet.maxX / FEET_PER_SCENE_UNIT / cellSize) * cellSize;
  const maxZ = Math.ceil(boundsFeet.maxY / FEET_PER_SCENE_UNIT / cellSize) * cellSize;
  const mapSubX = Math.round((maxX - minX) / cellSize) + 1;
  const mapSubZ = Math.round((maxZ - minZ) / cellSize) + 1;
  const mapData = new Float32Array(mapSubX * mapSubZ * 3);
  let i = 0;
  for (let r = 0; r < mapSubZ; r++) {
    const z = minZ + r * cellSize;
    const fz = z * FEET_PER_SCENE_UNIT;
    for (let c = 0; c < mapSubX; c++) {
      const x = minX + c * cellSize;
      mapData[i] = x;
      mapData[i + 1] = heightSamplerFeet(x * FEET_PER_SCENE_UNIT, fz) / FEET_PER_SCENE_UNIT;
      mapData[i + 2] = z;
      i += 3;
    }
  }
  return { mapData, mapSubX, mapSubZ };
}
