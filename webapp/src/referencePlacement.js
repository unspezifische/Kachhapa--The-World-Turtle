import { FEET_PER_SCENE_UNIT } from './settlementEditor';

export function mergeReferenceSave(currentLayers, queuedLayers) {
  return [...currentLayers.filter(layer => layer.layer_type !== 'heightmap_tile' && layer.layer_type !== 'heightmap'),
    ...queuedLayers.filter(layer => layer.layer_type === 'heightmap_tile')];
}

export function guessReferencePlacement(width, height, camera) {
  // Pixels determine proportions, not physical scale. Fit a conservative portion
  // of the current view, leaving room to reach the placement handles.
  const span = Math.max(20, (camera?.radius || 60) * FEET_PER_SCENE_UNIT * 0.55);
  const ratio = width / height;
  return { origin_x: (camera?.target?.[0] || 0) * FEET_PER_SCENE_UNIT,
    origin_y: (camera?.target?.[2] || 0) * FEET_PER_SCENE_UNIT,
    width_feet: ratio >= 1 ? span : span * ratio,
    height_feet: ratio >= 1 ? span / ratio : span };
}

export function referenceCorner(layer, sx, sy) {
  const angle = (layer.rotation_degrees || 0) * Math.PI / 180;
  const x = sx * layer.width_feet / 2, y = sy * layer.height_feet / 2;
  return { x: layer.origin_x + x * Math.cos(angle) - y * Math.sin(angle),
    y: layer.origin_y + x * Math.sin(angle) + y * Math.cos(angle) };
}

export function resizeReference(layer, point, sx, sy, lockAspect = true) {
  const anchor = referenceCorner(layer, -sx, -sy);
  const angle = (layer.rotation_degrees || 0) * Math.PI / 180;
  const dx = point.x - anchor.x, dy = point.y - anchor.y;
  let width = Math.max(1, sx * (dx * Math.cos(angle) + dy * Math.sin(angle)));
  let height = Math.max(1, sy * (-dx * Math.sin(angle) + dy * Math.cos(angle)));
  if (lockAspect) {
    const scale = Math.max(1 / Math.min(layer.width_feet, layer.height_feet),
      (width * layer.width_feet + height * layer.height_feet) / (layer.width_feet ** 2 + layer.height_feet ** 2));
    width = layer.width_feet * scale; height = layer.height_feet * scale;
  }
  return { ...layer, width_feet: width, height_feet: height,
    origin_x: anchor.x + (sx * width * Math.cos(angle) - sy * height * Math.sin(angle)) / 2,
    origin_y: anchor.y + (sx * width * Math.sin(angle) + sy * height * Math.cos(angle)) / 2 };
}

export function transformReferenceFromGizmo(layer, mode, start, point, anchor) {
  if (!layer || !start || !point || !anchor) return layer;
  if (mode === 'move') {
    return { ...layer,
      origin_x: (Number(layer.origin_x) || 0) + point.x - start.x,
      origin_y: (Number(layer.origin_y) || 0) + point.y - start.y };
  }
  if (mode === 'scale') {
    const startDistance = Math.hypot(start.x - anchor.x, start.y - anchor.y);
    if (startDistance < 0.001) return layer;
    const scale = Math.max(0.01, Math.hypot(point.x - anchor.x, point.y - anchor.y) / startDistance);
    return { ...layer,
      width_feet: Math.max(1, (Number(layer.width_feet) || 1) * scale),
      height_feet: Math.max(1, (Number(layer.height_feet) || 1) * scale) };
  }
  if (mode === 'rotate') {
    const startAngle = Math.atan2(start.y - anchor.y, start.x - anchor.x);
    const currentAngle = Math.atan2(point.y - anchor.y, point.x - anchor.x);
    let delta = currentAngle - startAngle;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    const degrees = (Number(layer.rotation_degrees) || 0) + delta * 180 / Math.PI;
    return { ...layer, rotation_degrees: ((degrees % 360) + 360) % 360 };
  }
  return layer;
}

export function referenceForSave(layer) {
  const { _placing, _lockAspect, _busy, ...saved } = layer;
  return { ...saved, feet_per_pixel: saved.width_feet / Math.max(1, saved.pixel_width || 1),
    feet_per_pixel_x: saved.width_feet / Math.max(1, saved.pixel_width || 1),
    feet_per_pixel_y: saved.height_feet / Math.max(1, saved.pixel_height || 1) };
}

export async function prepareReferencePreview(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('This image could not be read. Try a PNG, JPEG, or WebP image.')); img.src = url;
    });
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Unable to prepare an image preview.');
    return { url: URL.createObjectURL(blob), width: image.naturalWidth, height: image.naturalHeight };
  } finally { URL.revokeObjectURL(url); }
}
