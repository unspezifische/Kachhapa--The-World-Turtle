import { Color3, StandardMaterial, Vector3 } from '@babylonjs/core';
import { CreateGreasedLine } from '@babylonjs/core/Meshes/Builders/greasedLineBuilder';
import { GreasedLineMeshMaterialType } from '@babylonjs/core/Materials/GreasedLine/greasedLineMaterialInterfaces';
import { Constants } from '@babylonjs/core/Engines/constants';
import { normalizeBlueprint, openCorners } from './buildingBlueprint';
import { FEET_PER_SCENE_UNIT } from './settlementEditor';

export function applyBuildingMapColor(root, color, meshes = null) {
  if (!color) return;
  const surfaces = meshes || [root, ...root.getChildMeshes()];
  const replacements = new Map();
  surfaces.forEach(mesh => {
    if (!mesh.material || mesh.metadata?.mapColor === color) return;
    const original = mesh.material;
    if (!replacements.has(original)) {
      const replacement = new StandardMaterial(`${root.name}-map-${replacements.size}`, root.getScene());
      replacement.disableLighting = true;
      replacement.emissiveColor = Color3.FromHexString(color);
      replacement.diffuseColor = Color3.Black();
      replacement.alpha = original.alpha;
      replacement.backFaceCulling = false;
      replacements.set(original, replacement);
    }
    mesh.material = replacements.get(original);
    mesh.metadata = { ...mesh.metadata, mapColor: color };
  });
  root.onDisposeObservable.add(() => {
    replacements.forEach((replacement, original) => {
      replacement.dispose();
      original.dispose();
    });
  });
}

export function buildingFootprintWorld(building, asset = {}) {
  let points;
  if (building.is_blueprint) {
    const normalized = normalizeBlueprint(building);
    const ground = normalized.levels.find(level => Number(level.elevation_feet) === 0)
      || normalized.levels.find(level => Number(level.elevation_feet) >= 0)
      || normalized.levels[0];
    points = ground ? openCorners(ground) : [];
  } else {
    const halfWidth = Number(building.width_feet ?? asset.width_feet) / 2;
    const halfDepth = Number(building.depth_feet ?? asset.depth_feet) / 2;
    if (!(halfWidth > 0) || !(halfDepth > 0)) return [];
    points = [
      { x: -halfWidth, y: -halfDepth }, { x: halfWidth, y: -halfDepth },
      { x: halfWidth, y: halfDepth }, { x: -halfWidth, y: halfDepth },
    ];
  }
  if (points.length < 3) return [];
  const rotation = Number(building.rotation) || 0;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return points.map(point => ({
    x: (Number(building.x) || 0) + point.x * cosine - point.y * sine,
    y: (Number(building.y) || 0) + point.x * sine + point.y * cosine,
  }));
}

export function createBuildingInspectOutline(scene, building, asset, sampleHeight) {
  const footprint = buildingFootprintWorld(building, asset);
  if (!footprint.length) return [];
  const buildingMeshes = scene.meshes.filter(mesh =>
    ['building', 'building-roof'].includes(mesh.metadata?.kind)
    && String(mesh.metadata.item?.id) === String(building.id));
  let top = (sampleHeight(building.x, building.y) + (Number(building.elevation) || 0)) / FEET_PER_SCENE_UNIT;
  buildingMeshes.forEach(mesh => {
    mesh.computeWorldMatrix(true);
    top = Math.max(top, mesh.getBoundingInfo().boundingBox.maximumWorld.y);
  });
  const points = [...footprint, footprint[0]].map(point =>
    new Vector3(point.x / FEET_PER_SCENE_UNIT, top + 0.05, point.y / FEET_PER_SCENE_UNIT));
  return [{ color: '#15231c', width: 10 }, { color: '#ffe08a', width: 6 }].map((style, index) => {
    const outline = CreateGreasedLine(
      `inspect-outline-${building.id}-${index}`,
      { points },
      { color: Color3.FromHexString(style.color), width: style.width, sizeAttenuation: true,
        materialType: GreasedLineMeshMaterialType.MATERIAL_TYPE_SIMPLE },
      scene
    );
    outline.isPickable = false;
    outline.renderingGroupId = 2 + index;
    outline.material.disableDepthWrite = true;
    outline.material.depthFunction = Constants.ALWAYS;
    outline.metadata = { kind: 'building-inspect-outline', buildingId: building.id };
    return outline;
  });
}
