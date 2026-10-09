import { FEET_PER_SCENE_UNIT } from './settlementEditor';
import { TILE_FEET } from './settlementTiles';

export function planTerrainView({ position, target, alpha, beta, fov, aspect, groundFeet = 0 }) {
  const h = Math.max(1, position.y * FEET_PER_SCENE_UNIT - groundFeet);
  const depression = Math.PI / 2 - beta;
  const targetDistance = Math.hypot(position.x - target.x, position.z - target.z) * FEET_PER_SCENE_UNIT;
  // Horizon distance grows with altitude and can never end before the target.
  const horizon = Math.max(256, targetDistance + h * 3);
  const top = depression - fov / 2;
  const bottom = depression + fov / 2;
  const far = top <= 0.05 ? horizon : Math.min(horizon, h / Math.tan(top));
  const near = Math.max(-h * 3, h / Math.tan(bottom));
  const horizontalTangent = Math.tan(fov / 2) * aspect;
  const fx = -Math.cos(alpha), fz = -Math.sin(alpha);
  const rx = fz, rz = -fx;
  const px = position.x * FEET_PER_SCENE_UNIT, pz = position.z * FEET_PER_SCENE_UNIT;
  const points = [{ x: target.x * FEET_PER_SCENE_UNIT, z: target.z * FEET_PER_SCENE_UNIT }];
  for (const distance of [near, far]) {
    const depth = h * Math.cos(beta) + distance * Math.sin(beta);
    const width = Math.max(0, depth) * horizontalTangent;
    for (const side of [-1, 1]) points.push({ x: px + fx * distance + rx * width * side, z: pz + fz * distance + rz * width * side });
  }
  const rawSpan = Math.max(Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)), Math.max(...points.map(p => p.z)) - Math.min(...points.map(p => p.z)));
  // Near views stream sub-tile windows. Whole 4096-ft padding forced coarse
  // terrain even when the camera was only a few feet from the ground.
  const alignment = Math.min(TILE_FEET, Math.max(40, 2 ** Math.ceil(Math.log2(Math.max(40, rawSpan / 8)))));
  const bounds = {
    minX: (Math.floor(Math.min(...points.map(p => p.x)) / alignment) - 1) * alignment,
    maxX: (Math.ceil(Math.max(...points.map(p => p.x)) / alignment) + 1) * alignment,
    minY: (Math.floor(Math.min(...points.map(p => p.z)) / alignment) - 1) * alignment,
    maxY: (Math.ceil(Math.max(...points.map(p => p.z)) / alignment) + 1) * alignment,
  };
  const tx0 = Math.floor(bounds.minX / TILE_FEET), tx1 = Math.floor(bounds.maxX / TILE_FEET);
  const tz0 = Math.floor(bounds.minY / TILE_FEET), tz1 = Math.floor(bounds.maxY / TILE_FEET);
  bounds.width = bounds.maxX - bounds.minX;
  bounds.height = bounds.maxY - bounds.minY;
  const spanFeet = Math.max(bounds.width, bounds.height);
  // Keep geometry bounded even at continent scale; do not cap coarse LOD.
  const cellFeet = Math.max(5, 2 ** Math.ceil(Math.log2(spanFeet / 256)));
  return { key: `${bounds.minX},${bounds.maxX},${bounds.minY},${bounds.maxY},${cellFeet}`, bounds, cellSize: cellFeet / FEET_PER_SCENE_UNIT,
    debug: { tilesX: tx1 - tx0 + 1, tilesZ: tz1 - tz0 + 1, cellsX: Math.round(bounds.width / cellFeet) + 1,
      cellsZ: Math.round(bounds.height / cellFeet) + 1, cellFeet, spanFeet, dForward: far, h } };
}

export function referenceCameraFrame(layers, fallbackBounds, aspect = 1.6, fov = 0.8) {
  const layer = (layers || []).find(l => l.visible !== false && l.image_url && l.scope !== 'building');
  const width = Math.max(100, Number(layer?.width_feet) || fallbackBounds.width);
  const height = Math.max(100, Number(layer?.height_feet) || fallbackBounds.height);
  const angle = (Number(layer?.rotation_degrees) || 0) * Math.PI / 180;
  const extentX = Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height;
  const extentY = Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height;
  return { x: layer ? Number(layer.origin_x) || 0 : (fallbackBounds.minX + fallbackBounds.maxX) / 2,
    y: layer ? Number(layer.origin_y) || 0 : (fallbackBounds.minY + fallbackBounds.maxY) / 2,
    radius: Math.max(extentY, extentX / Math.max(0.5, aspect)) / (2 * Math.tan(fov / 2)) * 1.25 / FEET_PER_SCENE_UNIT };
}

export function terrainSampleOrder(mapData, focusX, focusY) {
  const groups = new Map();
  for (let index = 0; index < mapData.length; index += 3) {
    const tx = Math.floor(mapData[index] * FEET_PER_SCENE_UNIT / TILE_FEET);
    const tz = Math.floor(mapData[index + 2] * FEET_PER_SCENE_UNIT / TILE_FEET);
    const key = `${tx},${tz}`;
    if (!groups.has(key)) groups.set(key, { tx, tz, indices: [] });
    groups.get(key).indices.push(index);
  }
  const cx = Math.floor(focusX / TILE_FEET), cz = Math.floor(focusY / TILE_FEET);
  return [...groups.values()].sort((a, b) =>
    Math.max(Math.abs(a.tx - cx), Math.abs(a.tz - cz)) - Math.max(Math.abs(b.tx - cx), Math.abs(b.tz - cz))
    || Math.atan2(a.tz - cz, a.tx - cx) - Math.atan2(b.tz - cz, b.tx - cx));
}
