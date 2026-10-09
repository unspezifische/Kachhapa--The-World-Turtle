import {
  createTerrainHeightSampler,
  FEET_PER_SCENE_UNIT,
  roadWidthAt,
  waterDepthAtSeaLevel,
} from './settlementEditor';

import {
  Vector3,
  VertexData,
  NodeMaterial,
  Texture,
  DynamicTexture
} from '@babylonjs/core';

import earcut from 'earcut';


/** Keeps animated water relative to the authored surface instead of snapping it
 * back to sea level on the first animation frame. */
export function animatedWaterSurfaceY(baseSurfaceY, waveHeightFeet) {
  return Number(baseSurfaceY) + Number(waveHeightFeet || 0) / FEET_PER_SCENE_UNIT;
}


/** A tighter depth range prevents coplanar terrain/water flicker at atlas-scale
 * camera heights while retaining a close near plane for first-person mode. */
export function settlementCameraClipPlanes(radius, spanFeet, firstPerson = false) {
  const safeRadius = Math.max(0.01, Number(radius) || 1);
  const spanSceneUnits = Math.max(1, Number(spanFeet) || 1) / FEET_PER_SCENE_UNIT;

  return {
    minZ: firstPerson
      ? 0.005
      : Math.max(0.02, Math.min(0.75, safeRadius / 1000)),
    maxZ: Math.max(2000, safeRadius * 8, spanSceneUnits * 2.5),
  };
}

export function settlementCameraPanSpeed(radius) {
  return Math.max(0, Number(radius) || 0) * 1.8;
}


/**
 * Merges two bounding boxes to track the total dirty area during a sculpting
 * gesture.
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


const samePoint = (a, b) =>
  Math.abs(a.x - b.x) < 0.001 &&
  Math.abs(a.y - b.y) < 0.001;


/** Clips one world-space line segment to an axis-aligned streamed terrain window. */
export function clipSegmentToBounds(start, end, bounds, padding = 0) {
  const minX = bounds.minX - padding;
  const maxX = bounds.maxX + padding;
  const minY = bounds.minY - padding;
  const maxY = bounds.maxY + padding;

  const dx = end.x - start.x;
  const dy = end.y - start.y;

  let t0 = 0;
  let t1 = 1;

  for (const [p, q] of [
    [-dx, start.x - minX],
    [dx, maxX - start.x],
    [-dy, start.y - minY],
    [dy, maxY - start.y]
  ]) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return null;
      continue;
    }

    const r = q / p;

    if (p < 0) {
      if (r > t1) return null;
      t0 = Math.max(t0, r);
    }

    else {
      if (r < t0) return null;
      t1 = Math.min(t1, r);
    }
  }

  return [
    {
      ...start,
      x: start.x + dx * t0,
      y: start.y + dy * t0
    },
    {
      ...end,
      x: start.x + dx * t1,
      y: start.y + dy * t1
    },
  ];
}


/** Returns contiguous pieces of a road/wall that live on streamed terrain. */
export function polylinePartsInBounds(points = [], bounds, padding = 0) {
  if (!bounds || points.length < 2) return [];

  const parts = [];
  let current = null;

  for (let index = 0; index < points.length - 1; index += 1) {
    const clipped = clipSegmentToBounds(
      points[index],
      points[index + 1],
      bounds,
      padding
    );

    if (!clipped) {
      current = null;
      continue;
    }

    if (!current || !samePoint(current[current.length - 1], clipped[0])) {
      current = [clipped[0], clipped[1]];
      parts.push(current);
    }

    else if (!samePoint(current[current.length - 1], clipped[1])) {
      current.push(clipped[1]);
    }
  }

  return parts;
}


/** Footprint test used to bind point/polygon features to the streamed tile window. */
export function featureIntersectsBounds(feature, bounds, padding = 0) {
  if (!bounds || !feature) return false;

  const points = feature.footprint?.length
    ? feature.footprint
    : feature.points;

  let minX;
  let maxX;
  let minY;
  let maxY;

  if (points?.length) {
    minX = Math.min(...points.map(point => Number(point.x)));
    maxX = Math.max(...points.map(point => Number(point.x)));
    minY = Math.min(...points.map(point => Number(point.y)));
    maxY = Math.max(...points.map(point => Number(point.y)));
  }

  else {
    const x = Number(feature.x);
    const y = Number(feature.y);

    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

    const halfW = Math.max(0, Number(feature.width_feet) || 0) / 2;
    const halfH =
      Math.max(
        0,
        Number(feature.depth_feet) ||
        Number(feature.height_feet) ||
        0
      ) / 2;

    minX = x - halfW;
    maxX = x + halfW;
    minY = y - halfH;
    maxY = y + halfH;
  }

  return (
    maxX >= bounds.minX - padding &&
    minX <= bounds.maxX + padding &&
    maxY >= bounds.minY - padding &&
    minY <= bounds.maxY + padding
  );
}


/**
 * Rewrites only the Y channel of mapData inside a scene-unit box, then triggers
 * a geometry update on the ribbon.
 */
export function refreshTerrainRegion(dt, sampler, meta, box) {
  const {
    cellSize,
    mapSubX,
    mapSubZ,
    bounds
  } = meta;

  const minX =
    Math.floor(
      bounds.minX /
      FEET_PER_SCENE_UNIT /
      cellSize
    ) *
    cellSize;

  const minZ =
    Math.floor(
      bounds.minY /
      FEET_PER_SCENE_UNIT /
      cellSize
    ) *
    cellSize;

  const c0 = Math.max(
    0,
    Math.floor((box.minX - minX) / cellSize)
  );

  const c1 = Math.min(
    mapSubX - 1,
    Math.ceil((box.maxX - minX) / cellSize)
  );

  const r0 = Math.max(
    0,
    Math.floor((box.minY - minZ) / cellSize)
  );

  const r1 = Math.min(
    mapSubZ - 1,
    Math.ceil((box.maxY - minZ) / cellSize)
  );

  if (c0 > c1 || r0 > r1) return;

  const mapData = dt.mapData;

  for (let r = r0; r <= r1; r++) {
    const fz = (minZ + r * cellSize) * FEET_PER_SCENE_UNIT;

    for (let c = c0; c <= c1; c++) {
      const fx = (minX + c * cellSize) * FEET_PER_SCENE_UNIT;

      mapData[(r * mapSubX + c) * 3 + 1] =
        sampler(fx, fz) /
        FEET_PER_SCENE_UNIT;
    }
  }

  dt.update(true);
}


export const worldToBabylon = (xFeet, yFeet, elevationFeet = 0) =>
  new Vector3(
    xFeet / FEET_PER_SCENE_UNIT,
    elevationFeet / FEET_PER_SCENE_UNIT,
    yFeet / FEET_PER_SCENE_UNIT
  );


export const babylonToWorld = point => ({
  x: point.x * FEET_PER_SCENE_UNIT,
  y: point.z * FEET_PER_SCENE_UNIT,
  elevation: point.y * FEET_PER_SCENE_UNIT
});


export function pointInsideRegion(x, y, region) {
  let inside = false;

  const points = region?.points || [];

  for (
    let index = 0, previous = points.length - 1;
    index < points.length;
    previous = index++
  ) {
    const current = points[index];
    const prior = points[previous];

    if (
      ((current.y > y) !== (prior.y > y)) &&
      x <
      (
        (prior.x - current.x) *
        (y - current.y) /
        ((prior.y - current.y) || 0.000001) +
        current.x
      )
    ) {
      inside = !inside;
    }
  }

  return inside;
}


/**
 * Classifies every TextureBlock and enforces the correct address mode:
 * reference overlays clamp, while terrain materials wrap.
 */
const isReferenceTextureBlock = (name = '') =>
  name === 'refTexture' ||
  /ref(erence)?[_\s-]?(layer|texture|overlay|image)/i.test(name);


function resolveBlockTexture(block) {
  if (block.texture instanceof Texture) return block.texture;

  const sourceInput = (block.inputs || []).find(input => input.name === 'source');
  const provider = sourceInput?.connectedPoint?.ownerBlock;

  return provider?.texture instanceof Texture
    ? provider.texture
    : null;
}


export function applyTerrainTextureWrapModes(nodeMaterial) {
  if (!nodeMaterial?.attachedBlocks) return;

  nodeMaterial.attachedBlocks.forEach(block => {
    if (block.className !== 'TextureBlock') return;

    const texture = resolveBlockTexture(block);
    if (!texture) return;

    const mode = isReferenceTextureBlock(block.name)
      ? Texture.CLAMP_ADDRESSMODE
      : Texture.WRAP_ADDRESSMODE;

    texture.wrapU = mode;
    texture.wrapV = mode;
    texture.wrapR = mode;
  });
}


// -----------------------------------------------------------------------------
// TERRAIN MATERIAL LOADING
// -----------------------------------------------------------------------------

export async function loadTerrainMaterialFromJson(
  scene,
  jsonUrl,
  referenceLayer = null
) {
  const response = await fetch(jsonUrl);
  const serialized = await response.json();
  const nodeMaterial = NodeMaterial.Parse(serialized, scene);

  const initialReference = Array.isArray(referenceLayer)
    ? referenceLayer[0]
    : referenceLayer;

  if (initialReference?.image_url) {
    const refTextureBlock = nodeMaterial.getBlockByName('refTexture');

    if (refTextureBlock) {
      const texture = new Texture(
        initialReference.image_url,
        scene,
        false,
        false,
        Texture.TRILINEAR_SAMPLINGMODE
      );

      texture.hasAlpha = true;
      refTextureBlock.texture = texture;
      nodeMaterial._referenceTexture = texture;
    }

    else {
      console.warn(
        "[Terrain] Could not find a TextureBlock named 'refTexture' in the loaded JSON."
      );
    }
  }

  applyTerrainTextureWrapModes(nodeMaterial);

  return nodeMaterial;
}


// -----------------------------------------------------------------------------
// REFERENCE / TERRAIN INFLUENCE COMPOSITING
// -----------------------------------------------------------------------------

const referenceImageCache = new Map();


function loadReferenceImage(url) {
  if (referenceImageCache.has(url)) {
    return referenceImageCache.get(url);
  }

  const promise = new Promise((resolve, reject) => {
    const image = new Image();

    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
      image.crossOrigin = 'anonymous';
    }

    image.onload = () => resolve(image);

    image.onerror = () => {
      reject(
        new Error(
          `Unable to load reference image: ${url}`
        )
      );
    };

    image.src = url;
  });

  referenceImageCache.set(url, promise);

  promise.catch(() => {
    referenceImageCache.delete(url);
  });

  return promise;
}


function rotatedReferenceBounds(layer) {
  const angle =
    (Number(layer.rotation_degrees) || 0) *
    Math.PI /
    180;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const halfWidth =
    Math.max(
      1,
      Number(layer.width_feet) || 1
    ) /
    2;

  const halfHeight =
    Math.max(
      1,
      Number(layer.height_feet) || 1
    ) /
    2;

  const points = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight]
  ].map(([x, y]) => ({
    x:
      (Number(layer.origin_x) || 0) +
      x * cos -
      y * sin,

    y:
      (Number(layer.origin_y) || 0) +
      x * sin +
      y * cos
  }));

  return {
    minX: Math.min(...points.map(point => point.x)),
    maxX: Math.max(...points.map(point => point.x)),
    minY: Math.min(...points.map(point => point.y)),
    maxY: Math.max(...points.map(point => point.y))
  };
}


function terrainInfluenceBounds({
  roads = [],
  buildings = [],
  assets = []
} = {}) {
  let bounds = null;

  const extend = box => {
    if (!box) return;

    bounds = bounds
      ? {
        minX: Math.min(bounds.minX, box.minX),
        maxX: Math.max(bounds.maxX, box.maxX),
        minY: Math.min(bounds.minY, box.minY),
        maxY: Math.max(bounds.maxY, box.maxY)
      }
      : box;
  };

  (roads || [])
    .filter(
      road =>
        road.visible !== false &&
        road.points?.length
    )
    .forEach(road => {
      const widths = road.points
        .map(point => Number(point.width_feet))
        .filter(Number.isFinite);

      const halfWidth =
        Math.max(
          Number(road.width_feet) || 20,
          ...widths,
          1
        ) /
        2 +
        22;

      extend({
        minX:
          Math.min(
            ...road.points.map(point => Number(point.x))
          ) -
          halfWidth,

        maxX:
          Math.max(
            ...road.points.map(point => Number(point.x))
          ) +
          halfWidth,

        minY:
          Math.min(
            ...road.points.map(point => Number(point.y))
          ) -
          halfWidth,

        maxY:
          Math.max(
            ...road.points.map(point => Number(point.y))
          ) +
          halfWidth
      });
    });

  const assetMap = Object.fromEntries(
    (assets || []).map(asset => [asset.key, asset])
  );

  (buildings || [])
    .filter(building => building.visible !== false)
    .forEach(building => {
      const asset = assetMap[building.asset_key] || {};

      const halfW =
        Math.max(
          1,
          Number(
            building.width_feet ??
            asset.width_feet
          ) ||
          1
        ) /
        2;

      const halfD =
        Math.max(
          1,
          Number(
            building.depth_feet ??
            asset.depth_feet
          ) ||
          1
        ) /
        2;

      const radius = Math.hypot(halfW, halfD) + 14;

      extend({
        minX: Number(building.x) - radius,
        maxX: Number(building.x) + radius,
        minY: Number(building.y) - radius,
        maxY: Number(building.y) + radius
      });
    });

  return bounds;
}


function roadPattern(context, surfaceType, scale) {
  if (typeof document === 'undefined') return null;

  const tile = document.createElement('canvas');
  const size = Math.max(
    12,
    Math.min(
      80,
      Math.round(18 * scale)
    )
  );

  tile.width = size;
  tile.height = size;

  const ctx = tile.getContext('2d');
  if (!ctx) return null;

  const line = Math.max(1, size * 0.055);
  const mid = size / 2;

  if (surfaceType === 'cobblestone') {
    ctx.fillStyle = '#77736a';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(49, 46, 42, 0.52)';
    ctx.lineWidth = line;
    ctx.beginPath();

    ctx.moveTo(0, mid);
    ctx.lineTo(size, mid);

    ctx.moveTo(mid, 0);
    ctx.lineTo(mid, mid);

    ctx.moveTo(size * 0.25, mid);
    ctx.lineTo(size * 0.25, size);

    ctx.moveTo(size * 0.75, mid);
    ctx.lineTo(size * 0.75, size);

    ctx.stroke();
  }

  else if (surfaceType === 'brick') {
    ctx.fillStyle = '#955c49';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(74, 44, 35, 0.48)';
    ctx.lineWidth = line;
    ctx.beginPath();

    ctx.moveTo(0, mid);
    ctx.lineTo(size, mid);

    ctx.moveTo(mid, 0);
    ctx.lineTo(mid, mid);

    ctx.moveTo(0, size * 0.75);
    ctx.lineTo(size, size * 0.75);

    ctx.stroke();
  }

  else if (surfaceType === 'paved') {
    ctx.fillStyle = '#73736f';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(
      0,
      0,
      size,
      Math.max(1, line)
    );
  }

  else if (surfaceType === 'stone') {
    ctx.fillStyle = '#85827a';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(48, 48, 45, 0.4)';
    ctx.lineWidth = line;

    ctx.strokeRect(
      line,
      line,
      size - line * 2,
      size - line * 2
    );
  }

  else if (surfaceType === 'wood') {
    ctx.fillStyle = '#826046';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(67, 44, 31, 0.5)';
    ctx.lineWidth = line;
    ctx.beginPath();

    ctx.moveTo(0, size * 0.33);
    ctx.lineTo(size, size * 0.33);

    ctx.moveTo(0, size * 0.66);
    ctx.lineTo(size, size * 0.66);

    ctx.stroke();
  }

  else {
    ctx.fillStyle = '#8f704e';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = 'rgba(74, 54, 38, 0.22)';

    ctx.fillRect(
      size * 0.15,
      size * 0.2,
      line,
      line
    );

    ctx.fillRect(
      size * 0.72,
      size * 0.58,
      line,
      line
    );
  }

  return context.createPattern(tile, 'repeat');
}
function drawTerrainInfluences(
  context,
  bounds,
  scale,
  {
    roads = [],
    buildings = [],
    assets = []
  } = {}
) {
  const assetMap = Object.fromEntries(
    (assets || []).map(asset => [asset.key, asset])
  );

  const worldToCanvas = point => ({
    x: (point.x - bounds.minX) * scale,
    y: (bounds.maxY - point.y) * scale
  });


  // ---------------------------------------------------------------------------
  // Building disturbance
  // ---------------------------------------------------------------------------

  (buildings || [])
    .filter(
      building =>
        building.visible !== false &&
        Number.isFinite(Number(building.x)) &&
        Number.isFinite(Number(building.y))
    )
    .forEach(building => {
      const asset = assetMap[building.asset_key] || {};

      const widthFeet = Math.max(
        1,
        Number(
          building.width_feet ??
          asset.width_feet
        ) ||
        1
      );

      const depthFeet = Math.max(
        1,
        Number(
          building.depth_feet ??
          asset.depth_feet
        ) ||
        1
      );

      const center = worldToCanvas(building);
      const rotation = -(Number(building.rotation) || 0);

      context.save();
      context.translate(center.x, center.y);
      context.rotate(rotation);

      // Broad disturbed soil around the structure.
      context.globalAlpha = 0.22;
      context.fillStyle = '#755a3c';

      context.fillRect(
        -(widthFeet + 20) * scale / 2,
        -(depthFeet + 20) * scale / 2,
        (widthFeet + 20) * scale,
        (depthFeet + 20) * scale
      );

      // Stronger soil immediately around the footprint.
      context.globalAlpha = 0.27;
      context.fillStyle = '#6d5034';

      context.fillRect(
        -(widthFeet + 8) * scale / 2,
        -(depthFeet + 8) * scale / 2,
        (widthFeet + 8) * scale,
        (depthFeet + 8) * scale
      );

      context.restore();
    });


  // ---------------------------------------------------------------------------
  // Road shoulders / disturbed ground
  // ---------------------------------------------------------------------------

  (roads || [])
    .filter(
      road =>
        road.visible !== false &&
        road.points?.length >= 2
    )
    .forEach(road => {
      const points = road.points.map(worldToCanvas);

      const drawStroke = (widthOffset, style, alpha) => {
        context.save();

        context.globalAlpha = alpha;
        context.strokeStyle = style;
        context.lineCap = 'round';
        context.lineJoin = 'round';

        for (let index = 0; index < points.length - 1; index += 1) {
          const start = points[index];
          const end = points[index + 1];

          const startAmount =
            index /
            Math.max(
              1,
              points.length - 1
            );

          const endAmount =
            (index + 1) /
            Math.max(
              1,
              points.length - 1
            );

          const widthFeet =
            (
              roadWidthAt(road, startAmount) +
              roadWidthAt(road, endAmount)
            ) /
            2 +
            widthOffset;

          context.lineWidth = Math.max(
            1,
            widthFeet * scale
          );

          context.beginPath();
          context.moveTo(start.x, start.y);
          context.lineTo(end.x, end.y);
          context.stroke();
        }

        context.restore();
      };


      // Broad influence band between nearby roads and surrounding terrain.
      drawStroke(
        30,
        '#765a3c',
        0.38
      );


      // Visible road core.
      const pattern = roadPattern(
        context,
        road.surface_type || 'dirt',
        scale
      );

      context.save();

      context.globalAlpha = Math.max(
        0,
        Math.min(
          1,
          Number(road.opacity ?? 1)
        )
      );

      context.strokeStyle =
        pattern ||
        '#817261';

      context.lineCap = 'round';
      context.lineJoin = 'round';

      for (let index = 0; index < points.length - 1; index += 1) {
        const start = points[index];
        const end = points[index + 1];

        const startAmount =
          index /
          Math.max(
            1,
            points.length - 1
          );

        const endAmount =
          (index + 1) /
          Math.max(
            1,
            points.length - 1
          );

        const widthFeet =
          (
            roadWidthAt(road, startAmount) +
            roadWidthAt(road, endAmount)
          ) /
          2;

        context.lineWidth = Math.max(
          1,
          widthFeet * scale
        );

        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
      }

      context.restore();
    });
}


async function composeReferenceLayers(
  nodeMaterial,
  layers,
  scene,
  updateInput,
  revision,
  projectionBounds,
  terrainInfluences = {}
) {
  if (typeof document === 'undefined') return;

  const boundedLayers = projectionBounds
    ? layers.filter(layer => {
      const item = rotatedReferenceBounds(layer);

      return (
        item.maxX >= projectionBounds.minX &&
        item.minX <= projectionBounds.maxX &&
        item.maxY >= projectionBounds.minY &&
        item.minY <= projectionBounds.maxY
      );
    })
    : layers;

  const influenceBounds = terrainInfluenceBounds(
    terrainInfluences
  );


  // Determine the world-space region that actually needs compositing.
  let contentBounds = null;

  const extend = item => {
    if (!item) return;

    contentBounds = contentBounds
      ? {
        minX: Math.min(contentBounds.minX, item.minX),
        maxX: Math.max(contentBounds.maxX, item.maxX),
        minY: Math.min(contentBounds.minY, item.minY),
        maxY: Math.max(contentBounds.maxY, item.maxY)
      }
      : { ...item };
  };

  boundedLayers.forEach(layer => {
    extend(rotatedReferenceBounds(layer));
  });

  extend(influenceBounds);


  if (!contentBounds) {
    updateInput('refOpacity', 0);
    return;
  }


  let bounds = projectionBounds
    ? {
      minX: Math.max(contentBounds.minX, projectionBounds.minX),
      maxX: Math.min(contentBounds.maxX, projectionBounds.maxX),
      minY: Math.max(contentBounds.minY, projectionBounds.minY),
      maxY: Math.min(contentBounds.maxY, projectionBounds.maxY)
    }
    : contentBounds;


  // If the influence/content bounds do not intersect the current terrain
  // window, nothing should be projected.
  if (
    bounds.maxX <= bounds.minX ||
    bounds.maxY <= bounds.minY
  ) {
    updateInput('refOpacity', 0);
    return;
  }


  const images = await Promise.all(
    boundedLayers.map(layer =>
      loadReferenceImage(layer.image_url)
    )
  );

  if (nodeMaterial._referenceRevision !== revision) return;


  const widthFeet = Math.max(
    1,
    bounds.maxX - bounds.minX
  );

  const heightFeet = Math.max(
    1,
    bounds.maxY - bounds.minY
  );

  const maxTexture = Math.min(
    4096,
    scene.getEngine().getCaps().maxTextureSize ||
    4096
  );


  // Preserve enough resolution for road edges even when there is no reference
  // image. Reference images can request a higher density when available.
  const referenceDensity = boundedLayers.length
    ? Math.max(
      ...boundedLayers.map((layer, index) =>
        Math.max(
          images[index].naturalWidth /
          Math.max(
            1,
            Number(layer.width_feet) || 1
          ),

          images[index].naturalHeight /
          Math.max(
            1,
            Number(layer.height_feet) || 1
          )
        )
      )
    )
    : 0;

  const desiredDensity = Math.max(
    1.25,
    referenceDensity
  );

  const scale = Math.min(
    desiredDensity,
    maxTexture /
    Math.max(
      widthFeet,
      heightFeet
    )
  );

  const width = Math.max(
    1,
    Math.ceil(widthFeet * scale)
  );

  const height = Math.max(
    1,
    Math.ceil(heightFeet * scale)
  );


  const texture = new DynamicTexture(
    `reference-composite-${revision}`,
    {
      width,
      height
    },
    scene,
    true,
    Texture.TRILINEAR_SAMPLINGMODE
  );

  texture.hasAlpha = true;
  texture.anisotropicFilteringLevel = 16;
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;

  const context = texture.getContext();

  context.clearRect(
    0,
    0,
    width,
    height
  );


  // ---------------------------------------------------------------------------
  // Reference images
  // ---------------------------------------------------------------------------

  boundedLayers.forEach((layer, index) => {
    context.save();

    context.globalAlpha = Math.max(
      0,
      Math.min(
        1,
        Number(layer.opacity ?? 0.7)
      )
    );

    context.translate(
      (
        (Number(layer.origin_x) || 0) -
        bounds.minX
      ) *
      scale,

      (
        bounds.maxY -
        (Number(layer.origin_y) || 0)
      ) *
      scale
    );

    context.rotate(
      -(Number(layer.rotation_degrees) || 0) *
      Math.PI /
      180
    );

    context.drawImage(
      images[index],

      -(Number(layer.width_feet) || 1) *
      scale /
      2,

      -(Number(layer.height_feet) || 1) *
      scale /
      2,

      (Number(layer.width_feet) || 1) *
      scale,

      (Number(layer.height_feet) || 1) *
      scale
    );

    context.restore();
  });


  // Roads and developed ground are drawn into the same projected texture so
  // they conform exactly to the terrain mesh rather than floating above it.
  drawTerrainInfluences(
    context,
    bounds,
    scale,
    terrainInfluences
  );


  texture.update(false);

  if (nodeMaterial._referenceRevision !== revision) {
    texture.dispose();
    return;
  }


  const texBlock = nodeMaterial.getBlockByName(
    'refTexture'
  );

  if (!texBlock) {
    texture.dispose();
    return;
  }


  const previous =
    nodeMaterial._referenceTexture;

  texBlock.texture =
    texture;

  nodeMaterial._referenceTexture =
    texture;

  if (previous && previous !== texture) {
    previous.dispose();
  }


  updateInput(
    'refOriginX',
    (
      (bounds.minX + bounds.maxX) /
      2
    ) /
    FEET_PER_SCENE_UNIT
  );

  updateInput(
    'refOriginY',
    (
      (bounds.minY + bounds.maxY) /
      2
    ) /
    FEET_PER_SCENE_UNIT
  );

  updateInput(
    'refWidth',
    widthFeet /
    FEET_PER_SCENE_UNIT
  );

  updateInput(
    'refHeight',
    heightFeet /
    FEET_PER_SCENE_UNIT
  );

  updateInput('refRotation', 0);
  updateInput('refOpacity', 1);
}


export function updateTerrainMaterialInputs(
  nodeMaterial,
  terrainSettings,
  referenceLayers,
  scene,
  projectionBounds = null,
  terrainInfluences = {}
) {
  if (!nodeMaterial) return;

  const updateInput = (name, value) => {
    const block = nodeMaterial.getBlockByName(name);

    if (block && block.value !== value) {
      block.value = value;
    }
  };


  // ---------------------------------------------------------------------------
  // Terrain thresholds
  // ---------------------------------------------------------------------------

  updateInput(
    'seaLevel',
    (terrainSettings.sea_level_feet || 0) /
    FEET_PER_SCENE_UNIT
  );

  updateInput(
    'snowLine',
    (terrainSettings.snow_line_feet || 900) /
    FEET_PER_SCENE_UNIT
  );

  updateInput(
    'snowBlend',
    (terrainSettings.snow_blend_feet || 500) /
    FEET_PER_SCENE_UNIT
  );

  updateInput(
    'cliffThreshold',
    terrainSettings.cliff_normal_threshold ||
    0.86
  );


  // ---------------------------------------------------------------------------
  // Projected references + terrain influences
  // ---------------------------------------------------------------------------

  const layers = (
    Array.isArray(referenceLayers)
      ? referenceLayers
      : [referenceLayers]
  ).filter(
    layer =>
      layer?.visible !== false &&
      layer?.image_url &&
      layer?.project_to_terrain !== false &&
      !layer?.floor_level_id
  );


  const hasTerrainInfluences =
    (terrainInfluences.roads || []).some(
      road =>
        road.visible !== false &&
        road.points?.length >= 2
    ) ||
    (terrainInfluences.buildings || []).some(
      building => building.visible !== false
    );


  const revision =
    (nodeMaterial._referenceRevision || 0) +
    1;

  nodeMaterial._referenceRevision =
    revision;


  // A single reference with no road/building influence can continue to use a
  // direct GPU texture. Everything else uses the composite texture.
  if (layers.length === 1 && !hasTerrainInfluences) {
    if (nodeMaterial._referenceCompositeTimer) {
      clearTimeout(
        nodeMaterial._referenceCompositeTimer
      );
    }

    nodeMaterial._referenceCompositeTimer =
      null;

    const referenceLayer =
      layers[0];

    updateInput(
      'refOriginX',
      (referenceLayer.origin_x || 0) /
      FEET_PER_SCENE_UNIT
    );

    updateInput(
      'refOriginY',
      (referenceLayer.origin_y || 0) /
      FEET_PER_SCENE_UNIT
    );

    updateInput(
      'refWidth',
      (referenceLayer.width_feet || 100) /
      FEET_PER_SCENE_UNIT
    );

    updateInput(
      'refHeight',
      (referenceLayer.height_feet || 100) /
      FEET_PER_SCENE_UNIT
    );

    updateInput(
      'refRotation',
      -(referenceLayer.rotation_degrees || 0) *
      Math.PI /
      180
    );

    updateInput(
      'refOpacity',
      referenceLayer.opacity ??
      0.7
    );


    const texBlock =
      nodeMaterial.getBlockByName(
        'refTexture'
      );

    if (texBlock) {
      if (
        !texBlock.texture ||
        texBlock.texture.url !==
        referenceLayer.image_url
      ) {
        const texture = new Texture(
          referenceLayer.image_url,
          scene,
          false,
          false,
          Texture.TRILINEAR_SAMPLINGMODE
        );

        texture.hasAlpha = true;
        texture.anisotropicFilteringLevel = 16;
        texture.wrapU = Texture.CLAMP_ADDRESSMODE;
        texture.wrapV = Texture.CLAMP_ADDRESSMODE;

        const previous =
          nodeMaterial._referenceTexture;

        texBlock.texture =
          texture;

        nodeMaterial._referenceTexture =
          texture;

        if (previous && previous !== texture) {
          previous.dispose();
        }
      }
    }
  }


  else if (layers.length || hasTerrainInfluences) {
    nodeMaterial._pendingReferenceComposite = {
      layers,
      scene,
      updateInput,
      revision,
      projectionBounds,
      terrainInfluences
    };

    if (nodeMaterial._referenceCompositeTimer) {
      clearTimeout(
        nodeMaterial._referenceCompositeTimer
      );
    }

    nodeMaterial._referenceCompositeTimer =
      setTimeout(() => {
        nodeMaterial._referenceCompositeTimer =
          null;

        const pending =
          nodeMaterial._pendingReferenceComposite;

        if (!pending) return;

        composeReferenceLayers(
          nodeMaterial,
          pending.layers,
          pending.scene,
          pending.updateInput,
          pending.revision,
          pending.projectionBounds,
          pending.terrainInfluences
        )
          .catch(error => {
            if (
              nodeMaterial._referenceRevision ===
              pending.revision
            ) {
              console.error(
                '[Terrain] Reference/road composite failed:',
                error
              );
            }
          });
      }, 70);
  }


  else {
    if (nodeMaterial._referenceCompositeTimer) {
      clearTimeout(
        nodeMaterial._referenceCompositeTimer
      );
    }

    nodeMaterial._referenceCompositeTimer =
      null;

    updateInput('refOpacity', 0);
  }


  applyTerrainTextureWrapModes(
    nodeMaterial
  );
}


// -----------------------------------------------------------------------------
// CATMULL-ROM SPLINE HELPERS
// -----------------------------------------------------------------------------

function catmullRomSpline(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;

  return new Vector3(
    0.5 *
    (
      2 * p1.x +
      (-p0.x + p2.x) * t +
      (
        2 * p0.x -
        5 * p1.x +
        4 * p2.x -
        p3.x
      ) *
      t2 +
      (
        -p0.x +
        3 * p1.x -
        3 * p2.x +
        p3.x
      ) *
      t3
    ),

    0,

    0.5 *
    (
      2 * p1.z +
      (-p0.z + p2.z) * t +
      (
        2 * p0.z -
        5 * p1.z +
        4 * p2.z -
        p3.z
      ) *
      t2 +
      (
        -p0.z +
        3 * p1.z -
        3 * p2.z +
        p3.z
      ) *
      t3
    )
  );
}


function getSplinePoint(points, amount) {
  const len = points.length;

  const scaled =
    amount *
    (len - 1);

  const index = Math.min(
    len - 2,
    Math.floor(scaled)
  );

  const localT =
    scaled -
    index;

  const p0 =
    points[
    Math.max(
      0,
      index - 1
    )
    ];

  const p1 =
    points[index];

  const p2 =
    points[index + 1];

  const p3 =
    points[
    Math.min(
      len - 1,
      index + 2
    )
    ];

  return catmullRomSpline(
    p0,
    p1,
    p2,
    p3,
    localT
  );
}
// -----------------------------------------------------------------------------
// ROAD GEOMETRY
// -----------------------------------------------------------------------------

export function roadVertexData(road, strokes, heightMap, heightSampler) {
  heightSampler =
    heightSampler ||
    createTerrainHeightSampler(strokes, heightMap);

  const source = (road.points || []).map(
    point =>
      new Vector3(
        point.x / FEET_PER_SCENE_UNIT,
        0,
        point.y / FEET_PER_SCENE_UNIT
      )
  );

  if (source.length < 2) return new VertexData();

  const samples = Math.max(
    32,
    source.length * 32
  );

  const positions = [];
  const indices = [];
  const uvs = [];

  for (let index = 0; index <= samples; index += 1) {
    const amount = index / samples;

    const point = getSplinePoint(
      source,
      amount
    );

    const nearby = getSplinePoint(
      source,
      Math.min(
        1,
        amount + 1 / samples
      )
    );

    const tangent = nearby
      .subtract(point)
      .normalize();

    const halfWidth =
      roadWidthAt(road, amount) /
      (2 * FEET_PER_SCENE_UNIT);

    const normal = new Vector3(
      -tangent.z,
      0,
      tangent.x
    ).scale(halfWidth);

    const left = point.add(normal);
    const right = point.subtract(normal);

    const centerWorldX =
      point.x *
      FEET_PER_SCENE_UNIT;

    const centerWorldY =
      point.z *
      FEET_PER_SCENE_UNIT;

    const groundElevation =
      (
        heightSampler(
          centerWorldX,
          centerWorldY
        ) +
        0.15
      ) /
      FEET_PER_SCENE_UNIT;

    positions.push(
      left.x,
      groundElevation,
      left.z,

      right.x,
      groundElevation,
      right.z
    );

    uvs.push(
      0,
      amount * 8,
      1,
      amount * 8
    );

    if (index < samples) {
      const offset = index * 2;

      indices.push(
        offset,
        offset + 2,
        offset + 1,

        offset + 1,
        offset + 2,
        offset + 3
      );
    }
  }

  const normals = [];

  VertexData.ComputeNormals(
    positions,
    indices,
    normals
  );

  const data = new VertexData();

  data.positions = positions;
  data.indices = indices;
  data.uvs = uvs;
  data.normals = normals;

  return data;
}


// -----------------------------------------------------------------------------
// FORTIFICATION GEOMETRY
// -----------------------------------------------------------------------------

export function fortificationVertexData(
  wall,
  strokes,
  heightMap,
  heightSampler
) {
  heightSampler =
    heightSampler ||
    createTerrainHeightSampler(
      strokes,
      heightMap
    );

  const source = (wall.points || []).map(
    point =>
      new Vector3(
        point.x / FEET_PER_SCENE_UNIT,
        0,
        point.y / FEET_PER_SCENE_UNIT
      )
  );

  if (source.length < 2) return new VertexData();

  const samples = Math.max(
    24,
    source.length * 18
  );

  const positions = [];
  const indices = [];

  const halfWidth =
    (Number(wall.width_feet) || 24) /
    (2 * FEET_PER_SCENE_UNIT);

  const height =
    (Number(wall.height_feet) || 35) /
    FEET_PER_SCENE_UNIT;

  for (let index = 0; index <= samples; index += 1) {
    const amount = index / samples;

    const point = getSplinePoint(
      source,
      amount
    );

    const nearby = getSplinePoint(
      source,
      Math.min(
        1,
        amount + 1 / samples
      )
    );

    const tangent = nearby
      .subtract(point)
      .normalize();

    const normal = new Vector3(
      -tangent.z,
      0,
      tangent.x
    ).scale(halfWidth);

    const left = point.add(normal);
    const right = point.subtract(normal);

    const centerWorldX =
      point.x *
      FEET_PER_SCENE_UNIT;

    const centerWorldY =
      point.z *
      FEET_PER_SCENE_UNIT;

    const wallBaseElevation =
      heightSampler(
        centerWorldX,
        centerWorldY
      ) /
      FEET_PER_SCENE_UNIT;

    positions.push(
      left.x,
      wallBaseElevation,
      left.z,

      right.x,
      wallBaseElevation,
      right.z,

      left.x,
      wallBaseElevation + height,
      left.z,

      right.x,
      wallBaseElevation + height,
      right.z
    );

    if (index < samples) {
      const offset = index * 4;
      const next = offset + 4;

      indices.push(
        // Outer face
        offset,
        next,
        offset + 2,

        offset + 2,
        next,
        next + 2,

        // Inner face
        offset + 1,
        offset + 3,
        next + 1,

        offset + 3,
        next + 3,
        next + 1,

        // Top walkway
        offset + 2,
        next + 2,
        offset + 3,

        offset + 3,
        next + 2,
        next + 3
      );
    }
  }

  const normals = [];

  VertexData.ComputeNormals(
    positions,
    indices,
    normals
  );

  const data = new VertexData();

  data.positions = positions;
  data.indices = indices;
  data.normals = normals;

  return data;
}


// -----------------------------------------------------------------------------
// RIVER GENERATOR
// -----------------------------------------------------------------------------

export function riverVertexData(
  body,
  strokes,
  heightMap,
  heightSampler
) {
  heightSampler =
    heightSampler ||
    createTerrainHeightSampler(
      strokes,
      heightMap
    );

  const sourcePoints = [
    ...(body.points || [])
  ];

  if (sourcePoints.length < 2) {
    return new VertexData();
  }

  if (
    heightSampler(
      sourcePoints[0].x,
      sourcePoints[0].y
    ) <
    heightSampler(
      sourcePoints.at(-1).x,
      sourcePoints.at(-1).y
    )
  ) {
    sourcePoints.reverse();
  }

  const source = sourcePoints.map(
    point =>
      new Vector3(
        point.x / FEET_PER_SCENE_UNIT,
        0,
        point.y / FEET_PER_SCENE_UNIT
      )
  );

  const samples = Math.max(
    36,
    source.length * 28
  );

  const positions = [];
  const indices = [];
  const uvs = [];

  let previousHeight = Infinity;

  for (let index = 0; index <= samples; index += 1) {
    const amount = index / samples;

    const point = getSplinePoint(
      source,
      amount
    );

    const nearby = getSplinePoint(
      source,
      Math.min(
        1,
        amount + 1 / samples
      )
    );

    const tangent = nearby
      .subtract(point)
      .normalize();

    const normal = new Vector3(
      -tangent.z,
      0,
      tangent.x
    ).scale(
      (Number(body.width_feet) || 30) /
      (2 * FEET_PER_SCENE_UNIT)
    );

    const left = point.add(normal);
    const right = point.subtract(normal);

    const streamWorldX =
      point.x *
      FEET_PER_SCENE_UNIT;

    const streamWorldY =
      point.z *
      FEET_PER_SCENE_UNIT;

    previousHeight = Math.min(
      previousHeight,
      heightSampler(
        streamWorldX,
        streamWorldY
      ) - 0.2
    );

    positions.push(
      left.x,
      previousHeight /
      FEET_PER_SCENE_UNIT,
      left.z,

      right.x,
      previousHeight /
      FEET_PER_SCENE_UNIT,
      right.z
    );

    uvs.push(
      0,
      amount * 10,
      1,
      amount * 10
    );

    if (index < samples) {
      const offset = index * 2;

      indices.push(
        offset,
        offset + 2,
        offset + 1,

        offset + 1,
        offset + 2,
        offset + 3
      );
    }
  }

  const normals = [];

  VertexData.ComputeNormals(
    positions,
    indices,
    normals
  );

  const data = new VertexData();

  data.positions = positions;
  data.indices = indices;
  data.uvs = uvs;
  data.normals = normals;

  return data;
}


// -----------------------------------------------------------------------------
// OCEAN PLANE GENERATOR
// -----------------------------------------------------------------------------

export function oceanVertexData(
  bounds,
  strokes,
  heightMap,
  seaLevel,
  heightSampler
) {
  heightSampler =
    heightSampler ||
    createTerrainHeightSampler(
      strokes,
      heightMap
    );

  const segments = 96;

  const positions = [];
  const indices = [];
  const uvs = [];
  const depths = [];
  const exposures = [];

  const edgeSamples = {
    west: [],
    east: [],
    north: [],
    south: []
  };


  // Sample perimeter elevations to calculate wave orientation.
  for (let index = 0; index <= segments; index += 1) {
    const amount = index / segments;

    const x =
      bounds.minX +
      amount *
      bounds.width;

    const y =
      bounds.minY +
      amount *
      bounds.height;

    edgeSamples.west.push(
      heightSampler(
        bounds.minX,
        y
      )
    );

    edgeSamples.east.push(
      heightSampler(
        bounds.maxX,
        y
      )
    );

    edgeSamples.north.push(
      heightSampler(
        x,
        bounds.maxY
      )
    );

    edgeSamples.south.push(
      heightSampler(
        x,
        bounds.minY
      )
    );
  }

  const average = values =>
    values.reduce(
      (sum, value) => sum + value,
      0
    ) /
    Math.max(
      1,
      values.length
    );

  const lowestEdge = Object.entries(
    edgeSamples
  ).sort(
    (a, b) =>
      average(a[1]) -
      average(b[1])
  )[0][0];

  const waveDirection = {
    west: { x: -1, y: 0 },
    east: { x: 1, y: 0 },
    north: { x: 0, y: 1 },
    south: { x: 0, y: -1 }
  }[lowestEdge];


  // Build the water grid.
  for (let row = 0; row <= segments; row += 1) {
    for (let column = 0; column <= segments; column += 1) {
      const x =
        bounds.minX +
        (column / segments) *
        bounds.width;

      const y =
        bounds.minY +
        (row / segments) *
        bounds.height;

      const depth = waterDepthAtSeaLevel(
        heightSampler(x, y),
        seaLevel
      );

      let exposure = 1;

      // Cast backward toward open ocean to detect island shielding.
      if (depth > 0) {
        const stepDistance =
          Math.max(
            bounds.width,
            bounds.height
          ) /
          24;

        for (
          let distance = stepDistance;
          distance < Math.max(bounds.width, bounds.height);
          distance += stepDistance
        ) {
          const sampleX =
            x +
            waveDirection.x *
            distance;

          const sampleY =
            y +
            waveDirection.y *
            distance;

          if (
            sampleX < bounds.minX ||
            sampleX > bounds.maxX ||
            sampleY < bounds.minY ||
            sampleY > bounds.maxY
          ) {
            break;
          }

          if (
            heightSampler(
              sampleX,
              sampleY
            ) >= seaLevel
          ) {
            exposure = 0.18;
            break;
          }
        }
      }

      positions.push(
        x / FEET_PER_SCENE_UNIT,
        seaLevel / FEET_PER_SCENE_UNIT,
        y / FEET_PER_SCENE_UNIT
      );

      uvs.push(
        column / segments,
        row / segments
      );

      depths.push(
        depth /
        FEET_PER_SCENE_UNIT
      );

      exposures.push(exposure);
    }
  }


  // Construct index winding buffers.
  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const a =
        row *
        (segments + 1) +
        column;

      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;

      // Do not emit an ocean surface over a completely dry cell.
      if (
        depths[a] <= 0 &&
        depths[b] <= 0 &&
        depths[c] <= 0 &&
        depths[d] <= 0
      ) {
        continue;
      }

      indices.push(
        a,
        b,
        c,

        b,
        d,
        c
      );
    }
  }

  const normals = [];

  VertexData.ComputeNormals(
    positions,
    indices,
    normals
  );

  const data = new VertexData();

  data.positions = positions;
  data.indices = indices;
  data.uvs = uvs;
  data.normals = normals;

  data.waveDirection = waveDirection;
  data.hasWater = indices.length > 0;

  return data;
}


// -----------------------------------------------------------------------------
// AUTHORED WATER AREA
// -----------------------------------------------------------------------------

export function waterAreaVertexData(points, elevationFeet) {
  const outline = (points || []).filter(
    point =>
      Number.isFinite(Number(point?.x)) &&
      Number.isFinite(Number(point?.y))
  );

  if (outline.length < 3) return null;

  const flat = outline.flatMap(
    point => [
      Number(point.x),
      Number(point.y)
    ]
  );

  const indices = earcut(flat);

  if (!indices.length) return null;

  const positions = [];
  const uvs = [];

  const minX = Math.min(
    ...outline.map(point => Number(point.x))
  );

  const maxX = Math.max(
    ...outline.map(point => Number(point.x))
  );

  const minY = Math.min(
    ...outline.map(point => Number(point.y))
  );

  const maxY = Math.max(
    ...outline.map(point => Number(point.y))
  );

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  outline.forEach(point => {
    positions.push(
      Number(point.x) / FEET_PER_SCENE_UNIT,
      elevationFeet / FEET_PER_SCENE_UNIT,
      Number(point.y) / FEET_PER_SCENE_UNIT
    );

    uvs.push(
      (Number(point.x) - minX) / width,
      (Number(point.y) - minY) / height
    );
  });

  const normals = [];

  VertexData.ComputeNormals(
    positions,
    indices,
    normals
  );

  const data = new VertexData();

  data.positions = positions;
  data.indices = indices;
  data.uvs = uvs;
  data.normals = normals;

  return data;
}


/**
 * Builds an authored ocean as a terrain-tested grid instead of a handful of
 * large polygon triangles. Only submerged triangles inside both the polygon
 * and streamed terrain window are emitted.
 */
export function terrainClippedWaterAreaVertexData(
  points,
  bounds,
  seaLevel,
  heightSampler
) {
  const outline = (points || []).filter(
    point =>
      Number.isFinite(Number(point?.x)) &&
      Number.isFinite(Number(point?.y))
  );

  if (
    outline.length < 3 ||
    !bounds ||
    typeof heightSampler !== 'function'
  ) {
    return null;
  }

  const polygonBounds = {
    minX: Math.min(
      ...outline.map(point => Number(point.x))
    ),

    maxX: Math.max(
      ...outline.map(point => Number(point.x))
    ),

    minY: Math.min(
      ...outline.map(point => Number(point.y))
    ),

    maxY: Math.max(
      ...outline.map(point => Number(point.y))
    )
  };

  const minX = Math.max(
    bounds.minX,
    polygonBounds.minX
  );

  const maxX = Math.min(
    bounds.maxX,
    polygonBounds.maxX
  );

  const minY = Math.max(
    bounds.minY,
    polygonBounds.minY
  );

  const maxY = Math.min(
    bounds.maxY,
    polygonBounds.maxY
  );

  if (!(maxX > minX) || !(maxY > minY)) return null;

  const width = maxX - minX;
  const height = maxY - minY;
  const longest = Math.max(width, height);
  const cellSize = Math.max(5, longest / 96);

  const columns = Math.max(
    1,
    Math.ceil(width / cellSize)
  );

  const rows = Math.max(
    1,
    Math.ceil(height / cellSize)
  );

  const positions = [];
  const indices = [];
  const uvs = [];
  const wet = [];

  const region = {
    points: outline
  };

  const surface =
    Number(seaLevel) +
    0.75;

  for (let row = 0; row <= rows; row += 1) {
    const y =
      minY +
      (row / rows) *
      height;

    for (let column = 0; column <= columns; column += 1) {
      const x =
        minX +
        (column / columns) *
        width;

      positions.push(
        x / FEET_PER_SCENE_UNIT,
        surface / FEET_PER_SCENE_UNIT,
        y / FEET_PER_SCENE_UNIT
      );

      uvs.push(
        (x - polygonBounds.minX) /
        Math.max(
          1,
          polygonBounds.maxX -
          polygonBounds.minX
        ),

        (y - polygonBounds.minY) /
        Math.max(
          1,
          polygonBounds.maxY -
          polygonBounds.minY
        )
      );

      wet.push(
        pointInsideRegion(
          x,
          y,
          region
        ) &&
        waterDepthAtSeaLevel(
          heightSampler(x, y),
          seaLevel
        ) > 0
      );
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a =
        row *
        (columns + 1) +
        column;

      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;

      if (wet[a] && wet[b] && wet[c]) {
        indices.push(a, b, c);
      }

      if (wet[b] && wet[d] && wet[c]) {
        indices.push(b, d, c);
      }
    }
  }

  if (!indices.length) return null;

  const normals = [];

  VertexData.ComputeNormals(
    positions,
    indices,
    normals
  );

  const data = new VertexData();

  data.positions = positions;
  data.indices = indices;
  data.uvs = uvs;
  data.normals = normals;
  data.hasWater = true;

  return data;
}
/**
 * Builds a single static map buffer covering the entire settlement bounds.
 * Cell size is in scene units.
 */
export function buildWorldMapData(
  heightSamplerFeet,
  boundsFeet,
  cellSize = 2
) {
  const minX =
    Math.floor(
      boundsFeet.minX /
      FEET_PER_SCENE_UNIT /
      cellSize
    ) *
    cellSize;

  const minZ =
    Math.floor(
      boundsFeet.minY /
      FEET_PER_SCENE_UNIT /
      cellSize
    ) *
    cellSize;

  const maxX =
    Math.ceil(
      boundsFeet.maxX /
      FEET_PER_SCENE_UNIT /
      cellSize
    ) *
    cellSize;

  const maxZ =
    Math.ceil(
      boundsFeet.maxY /
      FEET_PER_SCENE_UNIT /
      cellSize
    ) *
    cellSize;

  const mapSubX =
    Math.round(
      (maxX - minX) /
      cellSize
    ) +
    1;

  const mapSubZ =
    Math.round(
      (maxZ - minZ) /
      cellSize
    ) +
    1;

  const mapData =
    new Float32Array(
      mapSubX *
      mapSubZ *
      3
    );

  let i = 0;

  for (let row = 0; row < mapSubZ; row += 1) {
    const z =
      minZ +
      row *
      cellSize;

    const feetZ =
      z *
      FEET_PER_SCENE_UNIT;

    for (let column = 0; column < mapSubX; column += 1) {
      const x =
        minX +
        column *
        cellSize;

      mapData[i] = x;

      mapData[i + 1] =
        heightSamplerFeet(
          x * FEET_PER_SCENE_UNIT,
          feetZ
        ) /
        FEET_PER_SCENE_UNIT;

      mapData[i + 2] = z;

      i += 3;
    }
  }

  return {
    mapData,
    mapSubX,
    mapSubZ
  };
}