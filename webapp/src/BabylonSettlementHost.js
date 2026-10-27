import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import React, { useEffect, useState, useRef } from 'react';

import { Scene as BabylonScene } from '@babylonjs/core/scene';
import { Engine as BabylonEngine } from '@babylonjs/core/Engines/engine';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Constants } from '@babylonjs/core/Engines/constants';

import { Mesh, MeshBuilder, VertexData } from '@babylonjs/core/Meshes';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';

import {
  PBRMaterial,
  StandardMaterial,
  DynamicTexture,
  RawTexture,
  ImageProcessingConfiguration,
  ColorCurves,
  ShaderMaterial
} from '@babylonjs/core/Materials';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';

import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Sound } from '@babylonjs/core/Audio/sound';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { createStreetLampRenderer } from './streetLampRenderer';
import { createThinBoxBatch, sameThinBoxes } from './thinBoxBatch';
import { observeScenePerformance } from './scenePerformance';
import { Atmosphere } from '@babylonjs/addons/atmosphere';
import { moonIllumination, moonLitPath, moonPhaseFraction, selectedMoon } from './settlementMoon';
import { sceneFootprintPreview } from './sceneFootprint';
import { structureWorldElevation } from './settlementProperties';
import { createPropertyMeshes } from './propertyMeshes';
import { FIRST_PERSON_LOOK_FEET, firstPersonTarget, firstPersonWalkSceneUnits } from './firstPersonCamera';


// ==============================================================================
// GLOBAL SHADER STORE & LIGHTING REGISTRY INJECTIONS
// ==============================================================================

import '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Shaders/pbr.fragment';
import '@babylonjs/core/Shaders/pbr.vertex';
import '@babylonjs/core/Lights/Shadows/index';

import earcut from 'earcut';
import { regionPresentation, regionFillOpacity } from './regionPresentation';

import { createTerrainWindow } from './terrainWindow';

import '@babylonjs/loaders/glTF/2.0/glTFLoader';

import {
  fortificationVertexData,
  wallSegmentMaterialColor,
  wallSegmentBattlements,
  oceanVertexData,
  terrainClippedWaterAreaVertexData,
  riverVertexData,
  roadVertexData,
  worldToBabylon,
  loadTerrainMaterialFromJson,
  updateTerrainMaterialInputs,
  mergeBox,
  refreshTerrainRegion,
  buildWorldMapData,
  animatedWaterSurfaceY,
  settlementCameraClipPlanes,
  settlementCameraPanSpeed,
  settlementCameraTapDistanceFeet,
  settlementScaleFeet,
  featureIntersectsBounds,
  polylinePartsInBounds,
  sampleRoadCenterline,
  sampleFortificationCenterline,
} from './settlementBabylon';
import { appendTracedBoundaryPoint, nearestSplinePoint, tracedDraftPolyline } from './settlementRegionLinks';

import {
  createTerrainHeightSampler,
  FEET_PER_SCENE_UNIT,
  isFortificationTowerPoint,
  wallSegmentProperties,
  attachedWallTower,
  terrainHeightAt
} from './settlementEditor';

import {
  setStoreDefaults,
  invalidateGeneratedTiles,
  createWorldSampler,
  heightmapPlacementBounds,
} from './settlementTiles';

import { createSettlementBabylonWorkflow } from './settlementBabylonWorkflow';
import { calculateTerrainFog } from './terrainFog';
import { calculateSettlementLighting } from './settlementLighting';
import {
  daylightColorGrade,
  moonOrbit,
  normalizeWeatherVisuals,
} from './settlementEnvironment';
import { createBlueprintMesh } from './blueprintMesh';
import { createReferenceOverlay, createReferenceGizmo } from './referenceOverlay';
import { planTerrainView, referenceCameraFrame, terrainSampleOrder } from './terrainView';
import { EDITOR_ACCENT_HEX } from './editorAppearance';
import { buildingViewColor } from './settlementInspection';
import { applyBuildingMapColor, createBuildingInspectOutline } from './settlementBuildingPresentation';


ShaderStore.ShadersStore.settlementCloudVertexShader = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vPositionW;
void main(void) {
  vec4 worldPosition = world * vec4(position, 1.0);
  vPositionW = worldPosition.xyz;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

ShaderStore.ShadersStore.settlementCloudFragmentShader = `
precision highp float;
varying vec3 vPositionW;
uniform vec3 cameraPosition;
uniform vec2 cloudHeights;
uniform vec2 windOffset;
uniform float cloudCoverage;
uniform float cloudDensity;
uniform float daylight;
uniform vec3 celestialDirection;
uniform float sampleCount;
uniform float previousSampleCount;
uniform float qualityBlend;
uniform float evolution;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.55;
  for (int octave = 0; octave < 4; octave++) {
    value += valueNoise(p) * amplitude;
    p = p * 2.03 + vec3(13.1, 7.7, 5.3);
    amplitude *= 0.48;
  }
  return value;
}

float integrateCloud(vec3 rayDirection, float startDistance, float endDistance, float steps) {
  float stepLength = (endDistance - startDistance) / steps;
  float opticalDepth = 0.0;
  vec3 samplePosition = cameraPosition + rayDirection * (startDistance + stepLength * 0.5);
  float threshold = mix(0.79, 0.38, cloudCoverage);

  for (int index = 0; index < 24; index++) {
    if (float(index) >= steps) break;
    float heightFraction = clamp(
      (samplePosition.y - cloudHeights.x) / max(0.01, cloudHeights.y - cloudHeights.x),
      0.0,
      1.0
    );
    float edgeFade = smoothstep(0.0, 0.16, heightFraction) *
      smoothstep(0.0, 0.18, 1.0 - heightFraction);
    vec3 noisePosition = vec3(
      samplePosition.x * 0.055 + windOffset.x,
      samplePosition.y * 0.075 + evolution,
      samplePosition.z * 0.055 + windOffset.y
    );
    float shape = fbm(noisePosition);
    float density = smoothstep(threshold, threshold + 0.16, shape) * edgeFade;
    opticalDepth += density * stepLength * cloudDensity * 0.18;
    samplePosition += rayDirection * stepLength;
  }

  return 1.0 - exp(-opticalDepth);
}

void main(void) {
  vec3 rayDirection = normalize(vPositionW - cameraPosition);
  float surfaceDistance = length(vPositionW - cameraPosition);
  bool insideLayer = cameraPosition.y >= cloudHeights.x && cameraPosition.y <= cloudHeights.y;
  float startDistance = insideLayer ? 0.0 : surfaceDistance;
  float oppositeHeight = cameraPosition.y > cloudHeights.y ? cloudHeights.x : cloudHeights.y;
  float endDistance = insideLayer
    ? surfaceDistance
    : abs(rayDirection.y) > 0.001
      ? abs((oppositeHeight - cameraPosition.y) / rayDirection.y)
      : startDistance + 240.0;
  endDistance = min(max(endDistance, startDistance + 0.1), startDistance + 320.0);
  float alpha = integrateCloud(rayDirection, startDistance, endDistance, sampleCount);
  if (qualityBlend < 1.0) {
    float oldAlpha = integrateCloud(rayDirection, startDistance, endDistance, previousSampleCount);
    alpha = mix(oldAlpha, alpha, smoothstep(0.0, 1.0, qualityBlend));
  }
  if (alpha < 0.006) discard;
  vec3 nightColor = vec3(0.12, 0.15, 0.22);
  vec3 dayColor = vec3(0.88, 0.91, 0.94);
  vec3 cloudColor = mix(nightColor, dayColor, daylight);
  float towardLight = 0.5 + 0.5 * dot(rayDirection, normalize(celestialDirection));
  cloudColor *= 0.67 + 0.33 * towardLight;
  gl_FragColor = vec4(cloudColor, clamp(alpha, 0.0, 0.94));
}`;


// Babylon's PolygonMeshBuilder looks for earcut on the global window object.
if (typeof window !== 'undefined') window.earcut = earcut;


const DEFAULT_FIRST_PERSON_SETTINGS = {
  sensitivity: 50,
  invertX: false,
  invertY: false,
  fov: 75,
  walkSpeed: 8,
  eyeHeight: 6
};


function createAtmosphereTexture(scene, name, draw) {
  const texture = new DynamicTexture(name, { width: 512, height: 256 }, scene, false);
  const context = texture.getContext();
  context.clearRect(0, 0, 512, 256);
  draw(context, 512, 256);
  texture.hasAlpha = true;
  texture.update(false);
  return texture;
}


function drawMoonPhase(texture, phaseFraction) {
  const context = texture.getContext();
  const width = texture.getSize().width;
  const height = texture.getSize().height;
  const radius = Math.min(width, height) * 0.43;
  const centerX = width / 2;
  const centerY = height / 2;
  context.clearRect(0, 0, width, height);
  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = '#182033';
  context.fillRect(0, 0, width, height);

  const gradient = context.createRadialGradient(
    centerX - radius * 0.28,
    centerY - radius * 0.22,
    radius * 0.08,
    centerX,
    centerY,
    radius
  );
  gradient.addColorStop(0, '#fffbe0');
  gradient.addColorStop(0.68, '#dedbbf');
  gradient.addColorStop(1, '#858694');
  context.fillStyle = gradient;
  const path = new Path2D(moonLitPath(phaseFraction, centerX, centerY, radius));
  context.fill(path);
  context.restore();
  texture.update(false);
}


function material(scene, name, hex, alpha = 1, useVertexColors = false) {
  const value = new PBRMaterial(name, scene);

  value.albedoColor = Color3.FromHexString(hex);
  value.metallic = 0;
  value.roughness = 0.95;
  value.alpha = alpha;
  value.backFaceCulling = false;

  if (useVertexColors) {
    value.useVertexColor = true;
    value.vertexColor = Color3.White();
  }

  return value;
}


function meshFromData(
  scene,
  name,
  data,
  meshMaterial,
  metadata,
  hasVertexColors = false,
  updatable = false
) {
  const mesh = new Mesh(name, scene);

  data.applyToMesh(mesh, updatable);

  mesh.material = meshMaterial;
  mesh.metadata = metadata;

  if (hasVertexColors) mesh.useVertexColors = true;

  return mesh;
}


const GERSTNER_WAVES = [
  [1, 0.2, 0.18, 12, 1],
  [-0.4, 0.9, 0.12, 6, 1.3],
  [0.2, -0.8, 0.08, 3.5, 0.8],
];
const SUNSET_LIGHT_COLOR = new Color3(1, 0.78, 0.58);
const DAY_LIGHT_COLOR = new Color3(1, 0.98, 0.95);
const NIGHT_SKY_COLOR = new Color3(0.012, 0.018, 0.055);
const DAY_SKY_COLOR = new Color3(0.26, 0.58, 0.88);
const OVERCAST_SKY_COLOR = new Color3(0.28, 0.32, 0.36);
const NIGHT_AMBIENT_COLOR = new Color3(0.45, 0.52, 0.68);
const DAY_AMBIENT_COLOR = new Color3(0.92, 0.96, 1);
const NIGHT_GROUND_COLOR = new Color3(0.12, 0.14, 0.2);
const DAY_GROUND_COLOR = new Color3(0.25, 0.25, 0.28);

export function getGerstnerWaveHeightAt(x, z, timeTime) {
  return GERSTNER_WAVES.reduce((height, [directionX, directionZ, steepness, wavelength, speed]) => {
    const k = 2 * Math.PI / wavelength;
    const c = Math.sqrt(9.81 / k) * speed;
    const phase = k * ((directionX * x + directionZ * z) - c * timeTime);
    return height + (steepness / k) * Math.sin(phase);
  }, 0);
}


function createWaterNormalTexture(scene) {
  const size = 128;
  const buffer = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      buffer[idx] = Math.cos((x / size) * Math.PI * 8) * 127 + 128;
      buffer[idx + 1] = Math.sin((y / size) * Math.PI * 8) * 127 + 128;
      buffer[idx + 2] = 255;
      buffer[idx + 3] = 255;
    }
  }

  const texture = RawTexture.CreateRGBATexture(
    buffer,
    size,
    size,
    scene,
    false,
    false,
    Constants.TEXTURE_TRILINEAR_SAMPLINGMODE
  );
  texture.uScale = 16;
  texture.vScale = 16;
  return texture;
}


function waterMaterial(scene, name, hex, bumpTexture) {
  const value = new PBRMaterial(name, scene);

  value.albedoColor = Color3.FromHexString(hex);
  value.metallic = 0.02;
  value.roughness = 0.05;
  value.alpha = 0.85;
  value.disableDepthWrite = true;
  value.backFaceCulling = false;
  value.zOffset = 0;
  value.zOffsetUnits = 0;


  value.bumpTexture = bumpTexture;

  return value;
}


function createBabylonRegionMesh(scene, region, state, heightSampler) {
  const presentation = regionPresentation(region);
  if (!presentation) return [];
  const { points } = presentation;
  const selected = state.selectedRegionId === region.id;


  const centerX = presentation.center.x;
  const centerY = presentation.center.y;
  const sample = heightSampler || ((x, y) => terrainHeightAt(state.strokes, x, y, state.heightMap));
  const centerElevation = sample(centerX, centerY);


  // ---------------------------------------------------------------------------
  // Region outline
  // ---------------------------------------------------------------------------

  const outlinePoints = [...points, points[0]].map(point =>
    worldToBabylon(
      point.x,
      point.y,
      sample(point.x, point.y) + 2.5
    )
  );

  const outline = MeshBuilder.CreateTube(
    `region-outline-${region.id}`,
    { path: outlinePoints, radius: (selected ? 3 : 1.5) / FEET_PER_SCENE_UNIT, tessellation: 6 },
    scene
  );

  outline.material = material(scene, `region-outline-material-${region.id}`, selected ? '#fff1ad' : presentation.color);
  outline.material.emissiveColor = Color3.FromHexString(selected ? '#fff1ad' : presentation.color);
  outline.renderingGroupId = 2;
  outline.isVisible = state.buildingViewMode === 'districts' || state.activeTool === 'region';
  outline.metadata = { settlement: true, kind: 'region', item: region };
  const fill = new VertexData();
  fill.positions = points.flatMap(point => [point.x / FEET_PER_SCENE_UNIT,
    (sample(point.x, point.y) + 2) / FEET_PER_SCENE_UNIT, point.y / FEET_PER_SCENE_UNIT]);
  fill.indices = presentation.indices;
  fill.normals = [];
  VertexData.ComputeNormals(fill.positions, fill.indices, fill.normals);
  const fillMaterial = material(scene, `region-fill-material-${region.id}`, presentation.color, regionFillOpacity(state.buildingViewMode));
  fillMaterial.backFaceCulling = false;
  fillMaterial.disableLighting = true;
  fillMaterial.emissiveColor = Color3.FromHexString(presentation.color);
  const polygon = meshFromData(scene, `region-fill-${region.id}`, fill, fillMaterial, { settlement: true, kind: 'region', item: region });
  polygon.renderingGroupId = 2;
  polygon.isVisible = state.buildingViewMode === 'districts';
  polygon.isPickable = state.activeTool === 'region';

  outline.metadata = {
    settlement: true,
    kind: 'region',
    item: region
  };


  // ---------------------------------------------------------------------------
  // Region label
  // ---------------------------------------------------------------------------

  const labelPlane = MeshBuilder.CreatePlane(
    `region-label-${region.id}`,
    {
      width: 350 / FEET_PER_SCENE_UNIT,
      height: 90 / FEET_PER_SCENE_UNIT
    },
    scene
  );

  labelPlane.position = worldToBabylon(
    centerX,
    centerY,
    centerElevation + 45
  );

  labelPlane.metadata = {
    settlement: true,
    kind: 'region',
    item: region
  };

  labelPlane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  labelPlane.renderingGroupId = 3;
  labelPlane.isVisible = state.buildingViewMode === 'districts' || state.activeTool === 'region';

  const dynamicTexture = new DynamicTexture(
    `dynamic-tex-${region.id}`,
    { width: 1024, height: 256 },
    scene
  );

  const textMaterial = new StandardMaterial(
    `text-mat-${region.id}`,
    scene
  );

  textMaterial.emissiveTexture = dynamicTexture;
  textMaterial.opacityTexture = dynamicTexture;
  textMaterial.disableLighting = true;
  textMaterial.backFaceCulling = false;

  const ctx = dynamicTexture.getContext();
  ctx.clearRect(0, 0, 1024, 256);

  const labelText = region.name || 'Unnamed District';

  dynamicTexture.drawText(
    labelText,
    null,
    150,
    'bold 64px sans-serif',
    '#ffffff',
    'transparent',
    true,
    true
  );

  labelPlane.material = textMaterial;

  return [polygon, outline, labelPlane];
}


function createBabylonWaterMesh(scene, body, state, bounds, heightSampler, bumpTexture) {
  if (body.water_type === 'river') {
    return meshFromData(
      scene,
      `water-${body.id}`,
      riverVertexData(body, state.strokes, state.heightMap, heightSampler),
      waterMaterial(scene, `water-material-${body.id}`, '#338ca0', bumpTexture),
      {
        settlement: true,
        kind: 'water',
        item: body
      }
    );
  }

  if (body.water_type === 'ocean') {
    // Keep the authored coastline, but subdivide it against the current
    // terrain window so a single polygon cannot bridge raised terrain.
    if (body.points?.length >= 3) {
      const sea = Number(body.surface_elevation_feet) || 0;
      const data = terrainClippedWaterAreaVertexData(
        body.points,
        bounds,
        sea,
        heightSampler
      );

      return data
        ? meshFromData(
          scene,
          `water-${body.id}`,
          data,
          waterMaterial(scene, `water-material-${body.id}`, '#176b91', bumpTexture),
          {
            settlement: true,
            kind: 'water',
            item: body
          },
          false,
          true
        )
        : null;
    }

    const data = oceanVertexData(
      bounds,
      state.strokes,
      state.heightMap,
      Number(body.surface_elevation_feet) || 0,
      heightSampler
    );

    return data.hasWater
      ? meshFromData(
        scene,
        `water-${body.id}`,
        data,
        waterMaterial(scene, `water-material-${body.id}`, '#176b91', bumpTexture),
        {
          settlement: true,
          kind: 'water',
          item: body
        }
      )
      : null;
  }

  if (!body.points?.length || body.points.length < 3) return null;

  const points = body.points.map(point =>
    worldToBabylon(
      point.x,
      point.y,
      Number(body.surface_elevation_feet) ||
      (
        heightSampler
          ? heightSampler(point.x, point.y)
          : terrainHeightAt(
            state.strokes,
            point.x,
            point.y,
            state.heightMap
          )
      ) + 0.7
    )
  );

  const lake = MeshBuilder.CreatePolygon(
    `water-${body.id}`,
    { shape: points },
    scene
  );

  lake.material = waterMaterial(
    scene,
    `water-material-${body.id}`,
    '#338ca0',
    bumpTexture
  );

  lake.metadata = {
    settlement: true,
    kind: 'water',
    item: body
  };

  return lake;
}


function loadExternalAssetContainer(scene, url, cache) {
  if (cache.has(url)) return cache.get(url);

  const pending = LoadAssetContainerAsync(url, scene).catch(error => {
    if (cache.get(url) === pending) cache.delete(url);
    throw error;
  });
  cache.set(url, pending);
  return pending;
}


function createBabylonExternalAssetModel(scene, buildingMesh, asset, building, mapColor, cache) {
  if (!asset.model_url) return;

  loadExternalAssetContainer(scene, asset.model_url, cache)
    .then(container => {
      // A streamed terrain-window change may cull the parent while the model
      // is still downloading. Do not let a late response resurrect it.
      if (buildingMesh.isDisposed() || scene.isDisposed) return;

      const instance = container.instantiateModelsToScene(
        name => `${buildingMesh.name}-${name}`,
        true
      );
      const surfaces = [];
      instance.rootNodes.forEach(root => {
        root.parent = buildingMesh;
        root.scaling.scaleInPlace(0.01);
        root.metadata = {
          settlement: true,
          kind: 'building',
          item: building
        };
        if (root.material) surfaces.push(root);
        root.getChildMeshes?.().forEach(mesh => {
          mesh.metadata = {
            settlement: true,
            kind: 'building',
            item: building
          };
          surfaces.push(mesh);
        });
      });
      buildingMesh.onDisposeObservable.addOnce(() => {
        instance.animationGroups.forEach(group => group.dispose());
        instance.skeletons.forEach(skeleton => skeleton.dispose());
      });
      applyBuildingMapColor(buildingMesh, mapColor, surfaces);
    })
    .catch(() => { });
}


function createBabylonBuiltInBuilding(scene, building, asset, state, heightSampler, assetCache) {
  const sampledElevation = heightSampler?.(building.x, building.y);

  const groundElevation = Number.isFinite(sampledElevation)
    ? sampledElevation
    : terrainHeightAt(
      state.strokes,
      building.x,
      building.y,
      state.heightMap
    );

  const heightFeet = Number(asset.height_feet || 30);
  const elevation = structureWorldElevation(building, groundElevation);

  const buildingMesh = MeshBuilder.CreateBox(
    `building-${building.id}`,
    {
      width: Number(building.width_feet) / FEET_PER_SCENE_UNIT,
      depth: Number(building.depth_feet) / FEET_PER_SCENE_UNIT,
      height: heightFeet / FEET_PER_SCENE_UNIT
    },
    scene
  );

  buildingMesh.position = worldToBabylon(
    building.x,
    building.y,
    elevation + heightFeet / 2
  );

  buildingMesh.rotation.y = -Number(building.rotation || 0);
  buildingMesh.material = material(
    scene,
    `building-material-${building.id}`,
    asset.color || '#a76d43'
  );

  buildingMesh.metadata = {
    settlement: true,
    kind: 'building',
    item: building
  };

  const mapColor = state.buildingViewMode !== 'satellite'
    ? buildingViewColor(building, asset, state.buildingViewMode, state.businesses, state.buildings)
    : null;
  applyBuildingMapColor(buildingMesh, mapColor);
  createBabylonExternalAssetModel(scene, buildingMesh, asset, building, mapColor, assetCache);

  return buildingMesh;
}
export function applyBabylonCameraCommand(
  camera,
  command,
  bounds,
  strokes,
  heightMap,
  settings = DEFAULT_FIRST_PERSON_SETTINGS,
  sampleHeight = null
) {
  if (!camera || !command) return;

  const center = worldToBabylon(
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    0
  );

  if (command.mode === 'camera' && command.camera) {
    camera.setPosition(Vector3.FromArray(command.camera.position));
    camera.setTarget(Vector3.FromArray(command.camera.target));
  }

  else if (command.mode === 'point' && command.point) {
    const { x, y } = command.point;
    camera.setTarget(worldToBabylon(x, y, sampleHeight?.(x, y) ?? terrainHeightAt(strokes, x, y, heightMap)));
    camera.radius = Number(command.radiusFeet) > 0 ? command.radiusFeet / FEET_PER_SCENE_UNIT : Math.min(camera.radius, 5);
    if (command.topdown) { camera.alpha = -Math.PI / 2; camera.beta = 0.02; }
    camera.inertialAlphaOffset = 0;
    camera.inertialBetaOffset = 0;
    camera.inertialRadiusOffset = 0;
    camera.inertialPanningX = 0;
    camera.inertialPanningY = 0;
  }

  else if (command.mode === 'fit') {
    camera.setTarget(center);

    const targetSpan = Math.max(bounds.width, bounds.height);
    camera.radius = Math.max(
      250 / FEET_PER_SCENE_UNIT,
      targetSpan / FEET_PER_SCENE_UNIT
    );

    camera.alpha = -Math.PI / 2;
    camera.beta = 0.8;
    camera.inertialAlphaOffset = 0;
    camera.inertialBetaOffset = 0;
    camera.inertialRadiusOffset = 0;
  }

  else if (command.mode === 'reference' && command.reference) {
    const frame = referenceCameraFrame(
      [{ ...command.reference, scope: 'city', visible: true }],
      bounds
    );

    camera.setTarget(
      worldToBabylon(
        frame.x,
        frame.y,
        sampleHeight?.(frame.x, frame.y)
        ?? terrainHeightAt(strokes, frame.x, frame.y, heightMap)
      )
    );

    camera.radius = frame.radius;
    camera.alpha = -Math.PI / 2;
    camera.beta = 0.1;
  }

  else if (command.mode === 'topdown') {
    camera.alpha = -Math.PI / 2;
    camera.beta = 0.02;
  }

  else if (command.mode === 'firstPerson') {
    const target = camera.target || center;
    const worldX = target.x * FEET_PER_SCENE_UNIT;
    const worldY = target.z * FEET_PER_SCENE_UNIT;
    const sampledHeight = sampleHeight?.(worldX, worldY);

    const groundHeight = Number.isFinite(sampledHeight)
      ? sampledHeight
      : terrainHeightAt(strokes, worldX, worldY, heightMap);

    const eye = new Vector3(
      target.x,
      (groundHeight + (Number(settings.eyeHeight) || 6)) / FEET_PER_SCENE_UNIT,
      target.z
    );
    camera.metadata.firstPersonEye = eye;
    camera.lowerRadiusLimit = FIRST_PERSON_LOOK_FEET / FEET_PER_SCENE_UNIT;
    camera.radius = FIRST_PERSON_LOOK_FEET / FEET_PER_SCENE_UNIT;
    camera.beta = Math.PI / 2;
    const look = firstPersonTarget(eye, camera.alpha, camera.beta);
    camera.setTarget(new Vector3(look.x, look.y, look.z), false, true, true);
    camera.position.copyFrom(eye);
  }
}


function installBabylonCameraControls(scene, camera, getState, onCameraChange) {
  const keys = new Set();
  const tappedKeys = new Set();

  const editable = target =>
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.closest?.('[role="combobox"], [role="listbox"]') ||
    target?.isContentEditable;

  const key = event =>
    event.code === 'ShiftLeft' || event.code === 'ShiftRight'
      ? 'shift'
      : event.code === 'ControlLeft' || event.code === 'ControlRight'
        ? 'lower'
        : event.key.toLowerCase();

  const down = event => {
    if (!editable(event.target)) {
      const pressed = key(event);
      keys.add(pressed);
      if (!event.repeat) tappedKeys.add(pressed);
    }
  };

  const up = event => keys.delete(key(event));

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);

  const canvas = scene.getEngine().getRenderingCanvas();

  const anchorZoom = () => {
    const state = getState();
    if (state.firstPerson) return;

    const ground = state.sampleTerrainHeight?.(
      camera.target.x * FEET_PER_SCENE_UNIT,
      camera.target.z * FEET_PER_SCENE_UNIT
    );

    if (Number.isFinite(ground)) {
      camera.target.y = ground / FEET_PER_SCENE_UNIT;
    }
  };

  canvas?.addEventListener('wheel', anchorZoom, {
    passive: true,
    capture: true
  });

  // Clear Babylon's default keyboard input so it does not fight our manual
  // camera movement controls.
  if (camera.inputs?.attached?.keyboard) {
    camera.inputs.remove(camera.inputs.attached.keyboard);
  }

  if (!camera.metadata) camera.metadata = {};
  camera.metadata.lastCommandNonce = null;

  let lastPos = [0, 0, 0];
  let lastTarget = [0, 0, 0];

  const EPSILON = 0.0005;

  const hasSignificantChange = (current, last) =>
    Math.abs(current[0] - last[0]) > EPSILON ||
    Math.abs(current[1] - last[1]) > EPSILON ||
    Math.abs(current[2] - last[2]) > EPSILON;

  const observer = scene.onBeforeRenderObservable.add(() => {
    const state = getState();
    const delta = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.05);

    if (Math.abs(camera.inertialRadiusOffset) > 0.000001) anchorZoom();

    const active = value => keys.has(value) || state.virtualKeys?.has(value);
    const command = state.viewCommand;

    if (!state.firstPerson && camera.metadata.firstPersonActive) {
      const eye = camera.metadata.firstPersonEye || camera.position;
      camera.lowerRadiusLimit = camera.metadata.orbitLowerRadiusLimit;
      camera.setTarget(new Vector3(eye.x, eye.y - 6 / FEET_PER_SCENE_UNIT, eye.z));
      camera.radius = Math.max(20, camera.lowerRadiusLimit);
      camera.beta = 0.8;
      camera.metadata.firstPersonEye = null;
    }
    camera.metadata.firstPersonActive = Boolean(state.firstPerson);

    if (command && command.nonce !== camera.metadata?.lastCommandNonce) {
      applyBabylonCameraCommand(
        camera,
        command,
        state.bounds,
        state.strokes,
        state.heightMap,
        state.firstPersonSettings,
        state.sampleTerrainHeight
      );

      camera.metadata.lastCommandNonce = command.nonce;
    }

    if (camera.inputs?.attached?.pointers) {
      const pointersInput = camera.inputs.attached.pointers;

      // Mouse camera controls are disabled outside Inspect. During spline
      // refinement right-click belongs to the context menu, leaving only
      // middle-click available for orbiting.
      if (state.activeTool !== 'inspect') {
        const splineRefine =
          (state.activeTool === 'road' && state.roadMode === 'refine') ||
          (
            state.activeTool === 'fortification' &&
            state.fortificationMode === 'refine'
          );

        pointersInput.buttons = splineRefine ? [1] : [1, 2];

        camera.inertialAlphaOffset = 0;
        camera.inertialBetaOffset = 0;
        camera.panningInertia = 0;
      }

      else {
        pointersInput.buttons = state.firstPerson ? [] : [0, 1, 2];
      }
    }


    // -------------------------------------------------------------------------
    // Vertical elevation
    // -------------------------------------------------------------------------

    let elevationMovement = 0;

    // Shift is reserved for additive road selection while refining. Keeping
    // the camera still also prevents a held modifier from moving the map
    // before the pointer reaches the next handle.
    if (active('shift') && !(state.activeTool === 'road' && state.roadMode === 'refine')) elevationMovement += 1;
    if (active('lower')) elevationMovement -= 1;

    if (elevationMovement !== 0 && !state.firstPerson) {
      const speed = Math.max(15, camera.radius * 1.5);
      camera.target.y += elevationMovement * speed * delta;
    }


    // -------------------------------------------------------------------------
    // Rotation / tilt
    // -------------------------------------------------------------------------

    const turn = (active('e') ? 1 : 0) - (active('q') ? 1 : 0);
    const pitch = (active('r') ? 1 : 0) - (active('f') ? 1 : 0);

    camera.alpha += turn * 1.5 * delta;
    camera.beta = Math.max(
      state.firstPerson ? 0.05 : 0.02,
      Math.min(state.firstPerson ? Math.PI - 0.05 : 1.55,
        camera.beta + (state.firstPerson ? pitch : -pitch) * 1.2 * delta)
    );
    if (state.firstPerson && camera.metadata.firstPersonEye) {
      const look = firstPersonTarget(camera.metadata.firstPersonEye, camera.alpha, camera.beta);
      camera.target.copyFromFloats(look.x, look.y, look.z);
      camera.position.copyFrom(camera.metadata.firstPersonEye);
      camera.radius = FIRST_PERSON_LOOK_FEET / FEET_PER_SCENE_UNIT;
      camera.inertialRadiusOffset = 0;
      camera.inertialAlphaOffset = 0;
      camera.inertialBetaOffset = 0;
    }


    // -------------------------------------------------------------------------
    // WASD panning
    // -------------------------------------------------------------------------

    const forward = camera.getForwardRay().direction.clone();
    forward.y = 0;
    forward.normalize();

    const right = new Vector3(forward.z, 0, -forward.x);
    const movement = Vector3.Zero();

    if (active('w') || active('arrowup')) movement.addInPlace(forward);
    if (active('s') || active('arrowdown')) movement.subtractInPlace(forward);
    if (active('d') || active('arrowright')) movement.addInPlace(right);
    if (active('a') || active('arrowleft')) movement.subtractInPlace(right);

    if (movement.lengthSquared() > 0) {
      movement.normalize();
      const canvasHeight = canvas?.clientHeight || 900;
      const scaleFeet = settlementScaleFeet(camera.radius, camera.fov, canvasHeight);
      const tapDistanceFeet = state.firstPerson
        ? null
        : settlementCameraTapDistanceFeet(scaleFeet);
      const movementKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
      const hasFreshTap = movementKeys.some(value => active(value) && tappedKeys.has(value));

      if (tapDistanceFeet != null) {
        if (hasFreshTap) {
          camera.target.addInPlace(
            movement.scale(tapDistanceFeet / FEET_PER_SCENE_UNIT)
          );
        }
      }

      else {
        const baseSpeed = state.firstPerson
          ? firstPersonWalkSceneUnits(state.firstPersonSettings?.walkSpeed, 1)
          : settlementCameraPanSpeed(camera.radius);
        if (state.firstPerson && camera.metadata.firstPersonEye) {
          camera.metadata.firstPersonEye.addInPlace(movement.scale(baseSpeed * delta));
        } else {
          camera.target.addInPlace(movement.scale(baseSpeed * delta));
        }
      }

      movementKeys.forEach(value => tappedKeys.delete(value));
    }


    // Keep the target and camera above streamed terrain.
    const sampleHeight = state.sampleTerrainHeight;

    if (state.firstPerson && camera.metadata.firstPersonEye) {
      const eye = camera.metadata.firstPersonEye;
      const ground = sampleHeight?.(eye.x * FEET_PER_SCENE_UNIT, eye.z * FEET_PER_SCENE_UNIT);
      if (Number.isFinite(ground)) {
        eye.y = (ground + (Number(state.firstPersonSettings?.eyeHeight) || 6)) / FEET_PER_SCENE_UNIT;
      }
      const look = firstPersonTarget(eye, camera.alpha, camera.beta);
      camera.target.copyFromFloats(look.x, look.y, look.z);
      camera.position.copyFrom(eye);
      camera.radius = FIRST_PERSON_LOOK_FEET / FEET_PER_SCENE_UNIT;
    } else if (typeof sampleHeight === 'function') {
      let targetLift = 0;

      const targetGround = sampleHeight(
        camera.target.x * FEET_PER_SCENE_UNIT,
        camera.target.z * FEET_PER_SCENE_UNIT
      );

      if (Number.isFinite(targetGround)) {
        const targetClearance = state.firstPerson
          ? Number(state.firstPersonSettings?.eyeHeight) || 6
          : 0.5;

        targetLift = Math.max(
          0,
          (targetGround + targetClearance) / FEET_PER_SCENE_UNIT -
          camera.target.y
        );

        camera.target.y += targetLift;
      }

      const cameraGround = sampleHeight(
        camera.position.x * FEET_PER_SCENE_UNIT,
        camera.position.z * FEET_PER_SCENE_UNIT
      );

      if (Number.isFinite(cameraGround)) {
        const cameraClearance = state.firstPerson
          ? Number(state.firstPersonSettings?.eyeHeight) || 6
          : 2;

        const minimumCameraY =
          (cameraGround + cameraClearance) /
          FEET_PER_SCENE_UNIT;

        const predictedCameraY = camera.position.y + targetLift;

        if (predictedCameraY < minimumCameraY) {
          camera.target.y += minimumCameraY - predictedCameraY;
          camera.inertialBetaOffset = 0;
        }
      }
    }


    if (onCameraChange) {
      const currentPos = camera.position.asArray();
      const currentTarget = camera.target.asArray();

      if (
        hasSignificantChange(currentPos, lastPos) ||
        hasSignificantChange(currentTarget, lastTarget)
      ) {
        lastPos = currentPos;
        lastTarget = currentTarget;

        onCameraChange({
          position: currentPos,
          target: currentTarget,
          radius: camera.radius,
          alpha: camera.alpha,
          beta: camera.beta
        });
      }
    }
  });

  return () => {
    scene.onBeforeRenderObservable.remove(observer);
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    canvas?.removeEventListener('wheel', anchorZoom, true);
  };
}


function installBabylonFirstPersonLook(
  scene,
  camera,
  getState,
  onPointerLockChange
) {
  const canvas = scene.getEngine().getRenderingCanvas();

  const move = event => {
    const state = getState();

    if (!state.firstPerson || document.pointerLockElement !== canvas) return;

    const sensitivity =
      Math.max(0.1, Number(state.firstPersonSettings?.sensitivity) || 50) *
      0.000044;

    camera.alpha +=
      event.movementX *
      sensitivity *
      (state.firstPersonSettings?.invertX ? -1 : 1);

    camera.beta = Math.max(
      0.05,
      Math.min(
        Math.PI - 0.05,
        camera.beta +
        event.movementY *
        sensitivity *
        (state.firstPersonSettings?.invertY ? 1 : -1)
      )
    );
    if (camera.metadata?.firstPersonEye) {
      const eye = camera.metadata.firstPersonEye;
      const look = firstPersonTarget(eye, camera.alpha, camera.beta);
      camera.target.copyFromFloats(look.x, look.y, look.z);
      camera.position.copyFrom(eye);
    }
  };

  const lock = () => {
    onPointerLockChange?.(document.pointerLockElement === canvas);
  };

  document.addEventListener('mousemove', move);
  document.addEventListener('pointerlockchange', lock);

  return () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('pointerlockchange', lock);

    if (document.pointerLockElement === canvas) {
      document.exitPointerLock?.();
    }
  };
}


function installBabylonScaleObserver(
  scene,
  camera,
  getState,
  onScaleChange
) {
  let previousKey = '';
  let lastRadius = -1;

  const RADIUS_EPSILON = 0.05;

  const observer = scene.onBeforeRenderObservable.add(() => {
    if (!onScaleChange) return;

    if (
      Math.abs(camera.radius - lastRadius) < RADIUS_EPSILON &&
      previousKey !== ''
    ) {
      return;
    }

    lastRadius = camera.radius;

    const state = getState();
    const canvas = scene.getEngine().getRenderingCanvas();

    if (!canvas?.clientHeight) return;

    const visibleHeightFeet =
      2 *
      Math.tan(camera.fov / 2) *
      Math.max(0.02, camera.radius) *
      FEET_PER_SCENE_UNIT;

    const feetPerPixel = visibleHeightFeet / canvas.clientHeight;
    const desired = Math.max(0.1, feetPerPixel * 110);
    const power = 10 ** Math.floor(Math.log10(desired));
    const ratio = desired / power;

    const feet =
      (
        ratio < 1.5
          ? 1
          : ratio < 3.5
            ? 2
            : ratio < 7.5
              ? 5
              : 10
      ) * power;

    const pixels = feet / feetPerPixel;
    const key = `${feet}:${Math.round(pixels)}`;

    if (key !== previousKey) {
      previousKey = key;

      onScaleChange({
        feet,
        pixels,
        bounds: state.bounds
      });
    }
  });

  return () => scene.onBeforeRenderObservable.remove(observer);
}


function SceneContent({
  scene,
  pauseControlRef,
  tileStore,
  tileStoreVersion,
  state,
  meshState,
  bounds,
  onCameraChange,
  onPointerLockChange,
  onScaleChange,
  onSceneReady,
  onPerformanceSample,
  onFirstFrame,
  onTerrainReady
}) {
  scene.fogMode = BabylonScene.FOGMODE_LINEAR;

  const workflowRef = useRef(null);
  const cameraRef = useRef(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  const tileStoreRef = useRef(tileStore);
  tileStoreRef.current = tileStore;

  const onCameraChangeRef = useRef(onCameraChange);
  const onPointerLockChangeRef = useRef(onPointerLockChange);
  const onScaleChangeRef = useRef(onScaleChange);
  const onSceneReadyRef = useRef(onSceneReady);
  const onPerformanceSampleRef = useRef(onPerformanceSample);
  const onFirstFrameRef = useRef(onFirstFrame);
  const onTerrainReadyRef = useRef(onTerrainReady);
  const sceneReadySentRef = useRef(false);

  const worldSamplerRef = useRef(null);
  const dirtyRegionRef = useRef(null);
  const queuedTerrainRegionRef = useRef(null);
  const terrainRefreshFrameRef = useRef(null);
  const lastTerrainRefreshRef = useRef(0);
  const previewStrokesRef = useRef([]);
  const previousHeightmapBoundsRef = useRef(null);

  const dynamicTerrainRef = useRef(null);
  const terrainBuildRevisionRef = useRef(0);
  const terrainWindowBoundsRef = useRef(null);

  const [terrainWindowKey, setTerrainWindowKey] = useState(null);

  const terrainMaterialRef = useRef(null);
  const [isMaterialReady, setIsMaterialReady] = useState(false);
  const waterNormalTextureRef = useRef(null);
  const assetContainerCacheRef = useRef(new Map());
  const animatedWaterMeshesRef = useRef([]);
  const animatedShipsRef = useRef([]);
  const buildingMeshesRef = useRef(new Map());
  const merlonBatchesRef = useRef(new Map());
  const animationTimeRef = useRef(0);

  useEffect(() => {
    if (!scene) return undefined;

    waterNormalTextureRef.current = createWaterNormalTexture(scene);
    const cache = assetContainerCacheRef.current;

    return () => {
      waterNormalTextureRef.current?.dispose();
      waterNormalTextureRef.current = null;
      const pending = [...cache.values()];
      cache.clear();
      pending.forEach(value => value.then(container => container.dispose()).catch(() => {}));
    };
  }, [scene]);

  useEffect(() => {
    if (!scene) return undefined;

    const observer = scene.onBeforeRenderObservable.add(() => {
      if (stateRef.current?.activeTool === 'terrain') return;

      const delta = scene.getEngine().getDeltaTime() / 1000;
      animationTimeRef.current += delta;
      const time = animationTimeRef.current;
      const bumpTexture = waterNormalTextureRef.current;

      if (stateRef.current?.animateWater && bumpTexture) {
        bumpTexture.uOffset += 0.012 * delta;
        bumpTexture.vOffset += 0.006 * delta;
      }

      animatedWaterMeshesRef.current.forEach(({ mesh, originalPositions }) => {
        const positions = mesh.getVerticesData(VertexData.PositionKind);
        if (!positions) return;

        for (let index = 0; index < positions.length; index += 3) {
          const waveHeightFeet = getGerstnerWaveHeightAt(
            originalPositions[index] * FEET_PER_SCENE_UNIT,
            originalPositions[index + 2] * FEET_PER_SCENE_UNIT,
            time
          );
          positions[index + 1] = animatedWaterSurfaceY(
            originalPositions[index + 1],
            waveHeightFeet
          );
        }
        mesh.updateVerticesData(VertexData.PositionKind, positions);
      });

      animatedShipsRef.current.forEach(mesh => {
        const xFeet = mesh.position.x * FEET_PER_SCENE_UNIT;
        const zFeet = mesh.position.z * FEET_PER_SCENE_UNIT;
        const waveHeight = getGerstnerWaveHeightAt(xFeet, zFeet, time);
        const forwardOffset = getGerstnerWaveHeightAt(xFeet, zFeet + 25, time);
        const lateralOffset = getGerstnerWaveHeightAt(xFeet + 25, zFeet, time);
        mesh.position.y = waveHeight / FEET_PER_SCENE_UNIT + 0.15;
        mesh.rotation.x = (forwardOffset - waveHeight) * 0.8;
        mesh.rotation.z = (lateralOffset - waveHeight) * 0.8;
      });
    });

    return () => scene.onBeforeRenderObservable.remove(observer);
  }, [scene]);

  useEffect(() => {
    onCameraChangeRef.current = onCameraChange;
    onPointerLockChangeRef.current = onPointerLockChange;
    onScaleChangeRef.current = onScaleChange;
    onSceneReadyRef.current = onSceneReady;
    onPerformanceSampleRef.current = onPerformanceSample;
    onFirstFrameRef.current = onFirstFrame;
    onTerrainReadyRef.current = onTerrainReady;
  }, [
    onCameraChange,
    onPointerLockChange,
    onScaleChange,
    onSceneReady,
    onPerformanceSample,
    onFirstFrame,
    onTerrainReady
  ]);

  useEffect(() => {
    const observer = scene.onAfterRenderObservable.addOnce(() => onFirstFrameRef.current?.());
    return () => scene.onAfterRenderObservable.remove(observer);
  }, [scene]);

  const hasPerformanceListener = Boolean(onPerformanceSample);
  useEffect(() => {
    if (!hasPerformanceListener) return undefined;
    return observeScenePerformance(scene, sample => {
      onPerformanceSampleRef.current?.(sample);
    });
  }, [scene, hasPerformanceListener]);

  const lightningFlashRef = useRef({ next: 0, duration: 0 });
  const fogDebugRef = useRef(null);

  // Persistent ambient weather audio nodes.
  const rainAudioRef = useRef(null);
  const windAudioRef = useRef(null);
  // ===========================================================================
  // EFFECT 1. MAIN SCENE SETUP
  // ===========================================================================

  useEffect(() => {
    if (!scene) return undefined;

    const currentBounds = stateRef.current.bounds || boundsRef.current;

    const frame = referenceCameraFrame(
      stateRef.current.referenceLayers,
      currentBounds,
      scene.getEngine().getRenderWidth() /
      Math.max(1, scene.getEngine().getRenderHeight())
    );

    const center = worldToBabylon(
      frame.x,
      frame.y,
      stateRef.current.sampleTerrainHeight?.(frame.x, frame.y) || 0
    );

    const span =
      Math.max(currentBounds.width, currentBounds.height) /
      FEET_PER_SCENE_UNIT;

    const camera = new ArcRotateCamera(
      'settlement-camera',
      -Math.PI / 2,
      0.35,
      Math.max(12, frame.radius),
      center,
      scene
    );

    const initialClip = settlementCameraClipPlanes(
      camera.radius,
      Math.max(currentBounds.width, currentBounds.height)
    );

    camera.maxZ = initialClip.maxZ;
    camera.minZ = initialClip.minZ;

    camera.lowerRadiusLimit = Math.max(
      0.4,
      5 *
      (
        scene.getEngine().getRenderingCanvas()?.clientHeight ||
        800
      ) /
      110 /
      (
        2 *
        Math.tan(camera.fov / 2)
      ) /
      FEET_PER_SCENE_UNIT
    );
    camera.metadata = { ...camera.metadata, orbitLowerRadiusLimit: camera.lowerRadiusLimit };

    camera.upperRadiusLimit = Math.max(
      600,
      Math.min(span * 1.5, 1600)
    );

    camera.wheelDeltaPercentage = 0.04;

    camera.attachControl(
      scene.getEngine().getRenderingCanvas(),
      true
    );

    cameraRef.current = camera;


    const sunLight = new DirectionalLight(
      'settlement-sun',
      new Vector3(0, -1, 0),
      scene
    );
    const moonLight = new DirectionalLight('settlement-moon', new Vector3(0, -1, 0), scene);
    moonLight.diffuse = new Color3(0.62, 0.72, 1);
    moonLight.specular = Color3.Black();
    moonLight.intensity = 0;
    // Atmosphere accepts one source. This light feeds its scattering LUT only.
    const skyLight = new DirectionalLight('settlement-atmosphere-source', new Vector3(0, -1, 0), scene);
    skyLight.includeOnlyWithLayerMask = 0x10000000;
    skyLight.intensity = 0;

    const ambientSky = new HemisphericLight(
      'settlement-ambient',
      new Vector3(0, 1, 0),
      scene
    );

    const topDownKey = new DirectionalLight(
      'tabletop-topdown-key',
      new Vector3(0, -1, 0),
      scene
    );


    // Fog only shades geometry. This camera-following floor below sea level
    // gives empty horizon rays geometry that can receive the fog color.
    const horizonFloor = MeshBuilder.CreateGround(
      'atmospheric-horizon-floor',
      {
        width: 2,
        height: 2,
        subdivisions: 1
      },
      scene
    );

    const horizonFloorMaterial = new StandardMaterial(
      'atmospheric-horizon-material',
      scene
    );

    horizonFloorMaterial.disableLighting = true;
    horizonFloorMaterial.backFaceCulling = false;
    horizonFloorMaterial.fogEnabled = true;

    horizonFloor.isPickable = false;
    horizonFloor.material = horizonFloorMaterial;
    horizonFloor.metadata = {
      settlement: true,
      kind: 'atmospheric-horizon'
    };


    const pipeline = new DefaultRenderingPipeline(
      'DefaultPipeline',
      true,
      scene
    );

    if (pipeline.isSupported) {
      pipeline.imageProcessingEnabled = true;
      pipeline.imageProcessing.ditheringEnabled = true;
      pipeline.imageProcessing.toneMappingEnabled = true;
      pipeline.imageProcessing.toneMappingType =
        ImageProcessingConfiguration.TONEMAPPING_ACES;
      pipeline.imageProcessing.colorCurves = new ColorCurves();
      pipeline.imageProcessing.colorCurvesEnabled = true;
    }

    // Use Babylon's scattering sky, while the existing feet-based linear fog
    // remains responsible for authored terrain occlusion. Applying both aerial
    // perspective systems would haze surfaces twice and bypass the fog sliders.
    const atmosphere = Atmosphere.IsSupported(scene.getEngine())
      ? new Atmosphere('settlement-atmosphere', scene, [skyLight], {
        isLinearSpaceLight: true,
        isLinearSpaceComposition: pipeline.isSupported,
        skyRenderingGroup: 0,
        aerialPerspectiveRenderingGroup: -1,
        globeAtmosphereRenderingGroup: -1,
        aerialPerspectiveIntensity: 0,
        isAerialPerspectiveLutEnabled: false,
        isDiffuseSkyIrradianceLutEnabled: false,
        minimumMultiScatteringColor: new Color3(0.008, 0.012, 0.025),
        minimumMultiScatteringIntensity: 0.025,
      })
      : null;

    // Sky is composited after terrain (group 0). Keep terrain depth for the
    // celestial layer and clouds, so weather cannot paint over nearer ground.
    scene.setRenderingAutoClearDepthStencil(1, false);
    scene.setRenderingAutoClearDepthStencil(2, false);

    const skyDome = MeshBuilder.CreateSphere(
      'settlement-sky-dome',
      { diameter: 200, segments: 24, sideOrientation: Mesh.BACKSIDE },
      scene
    );
    const skyMaterial = new StandardMaterial('settlement-sky-material', scene);
    skyMaterial.disableLighting = true;
    skyMaterial.backFaceCulling = false;
    skyMaterial.fogEnabled = false;
    // Background geometry must never hide terrain outside the dome radius.
    skyMaterial.disableDepthWrite = true;
    skyDome.material = skyMaterial;
    skyDome.isPickable = false;
    skyDome.infiniteDistance = true;
    skyDome.renderingGroupId = 0;
    skyDome.setEnabled(!atmosphere);

    const starTexture = createAtmosphereTexture(scene, 'settlement-stars', (context, width, height) => {
      let seed = 0x5e1e7e;
      const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      for (let index = 0; index < 560; index += 1) {
        const x = random() * width;
        const y = random() * height;
        const radius = random() > 0.94 ? 1.35 : 0.45 + random() * 0.65;
        context.fillStyle = random() > 0.8 ? '#cbdcff' : '#fffce8';
        context.globalAlpha = 0.45 + random() * 0.55;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    });
    const starDome = MeshBuilder.CreateSphere(
      'settlement-star-dome',
      { diameter: 196, segments: 24, sideOrientation: Mesh.BACKSIDE },
      scene
    );
    const starMaterial = new StandardMaterial('settlement-star-material', scene);
    starMaterial.disableLighting = true;
    starMaterial.backFaceCulling = false;
    starMaterial.fogEnabled = false;
    starMaterial.disableDepthWrite = true;
    starMaterial.emissiveTexture = starTexture;
    starMaterial.opacityTexture = starTexture;
    starMaterial.useAlphaFromDiffuseTexture = true;
    starDome.material = starMaterial;
    starDome.isPickable = false;
    starDome.infiniteDistance = true;
    starDome.renderingGroupId = 0;

    const cloudVolume = MeshBuilder.CreateBox(
      'settlement-cloud-volume',
      { size: 1 },
      scene
    );
    const cloudMaterial = new ShaderMaterial(
      'settlement-cloud-material',
      scene,
      { vertex: 'settlementCloud', fragment: 'settlementCloud' },
      {
        attributes: ['position'],
        uniforms: [
          'world',
          'worldViewProjection',
          'cameraPosition',
          'cloudHeights',
          'windOffset',
          'cloudCoverage',
          'cloudDensity',
          'daylight',
          'celestialDirection',
          'sampleCount',
          'previousSampleCount',
          'qualityBlend',
          'evolution',
        ],
        needAlphaBlending: true,
      }
    );
    cloudMaterial.backFaceCulling = true;
    cloudMaterial.disableDepthWrite = true;
    cloudVolume.material = cloudMaterial;
    cloudVolume.isPickable = false;
    cloudVolume.alwaysSelectAsActiveMesh = true;
    cloudVolume.renderingGroupId = 2;
    let cloudElapsed = 0;
    let cloudQualityElapsed = 0;
    let cloudSampleCount = 18;
    let previousCloudSampleCount = 18;
    let cloudQualityBlend = 1;
    const cloudWindOffset = new Vector2(0, 0);

    const sunDisc = MeshBuilder.CreateDisc(
      'settlement-sun-disc',
      { radius: 2.6, tessellation: 48, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    const sunMaterial = new StandardMaterial('settlement-sun-disc-material', scene);
    sunMaterial.disableLighting = true;
    sunMaterial.fogEnabled = false;
    sunMaterial.emissiveColor = new Color3(1, 0.86, 0.58);
    sunDisc.material = sunMaterial;
    sunDisc.billboardMode = Mesh.BILLBOARDMODE_ALL;
    sunDisc.isPickable = false;
    sunDisc.renderingGroupId = 1;

    const moonTexture = new DynamicTexture(
      'settlement-moon-phase',
      { width: 256, height: 256 },
      scene,
      false
    );
    moonTexture.hasAlpha = true;
    drawMoonPhase(moonTexture, 0.5);
    const moonDisc = MeshBuilder.CreateDisc(
      'settlement-moon-disc',
      { radius: 2.1, tessellation: 48, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    const moonMaterial = new StandardMaterial('settlement-moon-disc-material', scene);
    moonMaterial.disableLighting = true;
    moonMaterial.fogEnabled = false;
    moonMaterial.emissiveTexture = moonTexture;
    moonMaterial.opacityTexture = moonTexture;
    moonMaterial.useAlphaFromDiffuseTexture = true;
    moonDisc.material = moonMaterial;
    moonDisc.billboardMode = Mesh.BILLBOARDMODE_ALL;
    moonDisc.isPickable = false;
    moonDisc.renderingGroupId = 1;
    let renderedMoonPhase = null;

    const rainTexture = createAtmosphereTexture(scene, 'settlement-rain-particle', (context, width, height) => {
      const gradient = context.createLinearGradient(width / 2, 0, width / 2, height);
      gradient.addColorStop(0, 'rgba(190,220,255,0)');
      gradient.addColorStop(0.35, 'rgba(190,220,255,0.75)');
      gradient.addColorStop(1, 'rgba(220,238,255,0)');
      context.fillStyle = gradient;
      context.fillRect(width * 0.30, 0, width * 0.40, height);
    });
    const snowTexture = createAtmosphereTexture(scene, 'settlement-snow-particle', (context, width, height) => {
      const gradient = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.7, 'rgba(238,246,255,0.85)');
      gradient.addColorStop(1, 'rgba(238,246,255,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    });
    const precipitation = new ParticleSystem('settlement-precipitation', 2400, scene);
    precipitation.particleTexture = rainTexture;
    precipitation.emitter = new Vector3(0, 0, 0);
    precipitation.minEmitBox = new Vector3(-8, -6, -8);
    precipitation.maxEmitBox = new Vector3(8, 8, 8);
    precipitation.minLifeTime = 0.55;
    precipitation.maxLifeTime = 1.1;
    precipitation.minEmitPower = 1;
    precipitation.maxEmitPower = 1;
    precipitation.updateSpeed = 1 / 60;
    precipitation.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    precipitation.renderingGroupId = 1;
    precipitation.emitRate = 0;
    precipitation.start();
    const streetLampRenderer = createStreetLampRenderer(scene, camera);

    ambientSky.intensity = 0.95;
    ambientSky.groundColor = new Color3(0.25, 0.25, 0.28);

    topDownKey.intensity = 0.65;
    topDownKey.diffuse = new Color3(0.95, 0.95, 1);

    scene.ambientColor = new Color3(0.3, 0.3, 0.35);


    rainAudioRef.current = new Sound(
      'rain-ambient',
      '/media/sounds/defaults/rain_ambient.mp3',
      scene,
      null,
      {
        loop: true,
        autoplay: false,
        volume: 0
      }
    );

    windAudioRef.current = new Sound(
      'wind-ambient',
      '/media/sounds/defaults/wind_ambient.mp3',
      scene,
      null,
      {
        loop: true,
        autoplay: false,
        volume: 0
      }
    );

    const moonDirection = new Vector3();
    const precipitationDirection1 = new Vector3();
    const precipitationDirection2 = new Vector3();
    let previousWeatherSettings = null;
    let cachedWeatherVisuals = null;
    let previousLightingSignature = null;
    let cachedLighting = null;
    let cachedOrbit = null;
    let previousFogColor = null;

    const unifiedSceneObserver = scene.onBeforeRenderObservable.add(() => {
      const curState = stateRef.current;

      const cameraClip = settlementCameraClipPlanes(
        camera.radius,
        Math.max(
          curState?.bounds?.width || currentBounds.width,
          curState?.bounds?.height || currentBounds.height
        ),
        curState?.firstPerson
      );

      camera.minZ = cameraClip.minZ;
      camera.maxZ = cameraClip.maxZ;


      const timeInfo = curState?.time || { hour: 12, minute: 0 };
      const safeHour = Number.isFinite(timeInfo.hour) ? timeInfo.hour : 12;
      const safeMinute = Number.isFinite(timeInfo.minute) ? timeInfo.minute : 0;

      const config = curState?.weatherSettings || {
        activeWeather: 'clear',
        cloudCover: 0,
        fogDensity: 0.002,
        fogColor: '#a9c9dc',
        masterVolume: 0.5
      };
      if (config !== previousWeatherSettings) {
        previousWeatherSettings = config;
        cachedWeatherVisuals = normalizeWeatherVisuals(config);
      }
      const weatherVisuals = cachedWeatherVisuals;

      const atmos = curState?.atmosphereSettings || {
        sunIntensity: 2.2,
        moonIntensity: 0.15,
        scatteringScale: 1
      };

      const delta = scene.getEngine().getDeltaTime() / 1000;
      streetLampRenderer.update(curState, terrainWindowBoundsRef.current, delta);
      const volumeScale = config.masterVolume ?? 0.5;

      const moon = selectedMoon(curState?.celestial);
      const phaseFraction = moonPhaseFraction(moon);
      const moonLightFraction = moonIllumination(moon);
      const lightingSignature = [safeHour, safeMinute, phaseFraction, Boolean(moon),
        moonLightFraction, atmos.sunIntensity, atmos.moonIntensity,
        atmos.daylightSaturation, atmos.scatteringScale, config.cloudCover].join('|');
      const lightingChanged = lightingSignature !== previousLightingSignature;
      if (lightingChanged) {
        previousLightingSignature = lightingSignature;
        cachedOrbit = moonOrbit({ hour: safeHour, minute: safeMinute, phaseFraction });
        moonDirection.copyFromFloats(cachedOrbit.azimuthX, cachedOrbit.altitude, cachedOrbit.azimuthZ).normalize();
        cachedLighting = calculateSettlementLighting({
          hour: safeHour,
          minute: safeMinute,
          sunIntensity: atmos.sunIntensity,
          moonIntensity: atmos.moonIntensity,
          cloudCover: config.cloudCover,
          moonIllumination: moonLightFraction,
          moonAltitude: moon ? cachedOrbit.altitude : 0,
        });
      }
      const orbit = cachedOrbit;
      const lighting = cachedLighting;

      const {
        cosAngle,
        sinAngle,
        daylightStrength,
      } = lighting;

      if (lightingChanged) {
        const colorGrade = daylightColorGrade(
          daylightStrength,
          atmos.daylightSaturation ?? 1.12
        );
        if (pipeline.isSupported) {
          pipeline.imageProcessing.contrast = colorGrade.contrast;
          pipeline.imageProcessing.colorCurves.globalSaturation =
            (colorGrade.saturation - 1) * 100;
        }

        sunLight.direction.copyFromFloats(cosAngle, -sinAngle, 0.2).normalize();
        sunLight.intensity = lighting.sunIntensity;
        if (daylightStrength > 0) {
          sunLight.diffuse = Color3.Lerp(
            SUNSET_LIGHT_COLOR,
            DAY_LIGHT_COLOR,
            daylightStrength
          );
        }
        moonLight.direction.copyFrom(moonDirection.scale(-1));
        moonLight.intensity = lighting.moonStrength;
      }
      const sunDirection = sunLight.direction.scale(-1).normalize();
      if (lightingChanged) {
        const skyBlend = lighting.moonStrength /
          Math.max(0.000001, lighting.sunIntensity + lighting.moonStrength);
        const blendedDirection = Vector3.Lerp(sunDirection, moonDirection, skyBlend);
        skyLight.direction.copyFrom((blendedDirection.lengthSquared() > 0.00001
          ? blendedDirection : sunDirection).normalize().scale(-1));
        skyLight.intensity = lighting.sunIntensity + lighting.moonStrength;
        skyLight.diffuse = Color3.Lerp(sunLight.diffuse, moonLight.diffuse, skyBlend);
      }
      // Keep the background inside the far clip plane at every editor zoom.
      skyDome.scaling.setAll(camera.maxZ * 0.9 / 100);
      starDome.scaling.setAll(camera.maxZ * 0.89 / 98);
      const overcastAmount = Math.max(0, Math.min(1, weatherVisuals.cloudCover));
      if (lightingChanged) {
        const skyDayColor = Color3.Lerp(NIGHT_SKY_COLOR, DAY_SKY_COLOR, daylightStrength);
        skyMaterial.emissiveColor = Color3.Lerp(
          skyDayColor,
          OVERCAST_SKY_COLOR,
          overcastAmount * (0.25 + daylightStrength * 0.35)
        );
        starMaterial.alpha = Math.max(0, lighting.nightStrength - overcastAmount * 0.72);
      }
      if (atmosphere) {
        if (lightingChanged) {
          atmosphere.physicalProperties.rayleighScatteringScale =
            Math.max(0.05, Number(atmos.scatteringScale) || 1);
        }
        // The add-on converts scene units from meters to kilometers. Correct
        // only its origin height so camera geometry and terrain scale stay intact.
        const metersPerSceneUnit = FEET_PER_SCENE_UNIT * 0.3048;
        const seaLevelMeters =
          (Number(curState?.terrainMaterial?.sea_level_feet) || 0) * 0.3048;
        atmosphere.originHeight =
          (camera.position.y * (metersPerSceneUnit - 1) - seaLevelMeters) / 1000;
      }

      const celestialDistance = Math.min(86, Math.max(45, camera.maxZ * 0.72));
      sunDisc.position.copyFrom(camera.position.add(sunDirection.scale(celestialDistance)));
      sunDisc.scaling.setAll(celestialDistance * 0.0047 / 2.6);
      sunMaterial.alpha = Math.max(0, daylightStrength * (1 - overcastAmount * 0.65));

      if (renderedMoonPhase === null || Math.abs(renderedMoonPhase - phaseFraction) > 0.00001) {
        renderedMoonPhase = phaseFraction;
        drawMoonPhase(moonTexture, phaseFraction);
      }
      moonDisc.position.copyFrom(camera.position.add(moonDirection.scale(celestialDistance * 0.96)));
      moonDisc.scaling.setAll(celestialDistance * 0.0044 / 2.1);
      moonMaterial.alpha = moon ? Math.max(
        0,
        orbit.altitude * Math.sqrt(moonIllumination(moon)) *
        (1 - daylightStrength * 0.86) * (1 - overcastAmount * 0.68)
      ) : 0;

      const windRadians = weatherVisuals.windDirectionDegrees * Math.PI / 180;
      const windSceneSpeed = weatherVisuals.windSpeedMph / 35;
      cloudElapsed += delta;
      cloudQualityElapsed += delta;
      cloudQualityBlend = Math.min(1, cloudQualityBlend + delta / 1.5);
      if (cloudQualityElapsed >= 8 && cloudQualityBlend === 1) {
        const fps = scene.getEngine().getFps();
        const nextSampleCount = fps < 30 ? 10 : fps < 45 ? 16 : fps > 55 ? 24 : cloudSampleCount;
        if (nextSampleCount !== cloudSampleCount) {
          previousCloudSampleCount = cloudSampleCount;
          cloudSampleCount = nextSampleCount;
          cloudQualityBlend = 0;
        }
        cloudQualityElapsed = 0;
      }
      cloudWindOffset.x += Math.cos(windRadians) * delta * weatherVisuals.windSpeedMph * 0.0015;
      cloudWindOffset.y += Math.sin(windRadians) * delta * weatherVisuals.windSpeedMph * 0.0015;
      const baseFeet = weatherVisuals.cloudBaseFeet +
        (Number(curState?.terrainMaterial?.sea_level_feet) || 0);
      const topFeet = Math.max(baseFeet + 50, weatherVisuals.cloudTopFeet +
        (Number(curState?.terrainMaterial?.sea_level_feet) || 0));
      const baseScene = baseFeet / FEET_PER_SCENE_UNIT;
      const topScene = topFeet / FEET_PER_SCENE_UNIT;
      const cloudDepth = Math.max(1, topScene - baseScene);
      const cloudSpan = Math.max(420, Math.min(1200, camera.maxZ * 1.6));
      cloudMaterial.backFaceCulling = !(
        camera.position.y >= baseScene && camera.position.y <= topScene
      );
      cloudVolume.position.set(camera.position.x, (baseScene + topScene) / 2, camera.position.z);
      cloudVolume.scaling.set(cloudSpan, cloudDepth, cloudSpan);
      cloudVolume.setEnabled(overcastAmount > 0.015);
      cloudMaterial.setVector3('cameraPosition', camera.position);
      cloudMaterial.setVector2('cloudHeights', new Vector2(baseScene, topScene));
      cloudMaterial.setVector2('windOffset', cloudWindOffset);
      cloudMaterial.setFloat('evolution', cloudElapsed * 0.003);
      cloudMaterial.setFloat('cloudCoverage', overcastAmount);
      cloudMaterial.setFloat(
        'cloudDensity',
        weatherVisuals.cloudType === 'cumulonimbus' ? 1.35 :
          weatherVisuals.cloudType === 'ground-fog' ? 0.78 : 1
      );
      cloudMaterial.setFloat('daylight', Math.min(1, daylightStrength + lighting.moonStrength * 0.7));
      cloudMaterial.setVector3('celestialDirection', skyLight.direction.scale(-1));
      cloudMaterial.setFloat('sampleCount', cloudSampleCount);
      cloudMaterial.setFloat('previousSampleCount', previousCloudSampleCount);
      cloudMaterial.setFloat('qualityBlend', cloudQualityBlend);

      // Populate the space in front of the camera, including downward views.
      // Spawning only above an overhead camera keeps short-lived drops offscreen.
      precipitation.emitter.copyFrom(
        camera.position.add(camera.getForwardRay().direction.scale(12))
      );
      const isSnow = config.activeWeather === 'snowing';
      const precipitationStrength = weatherVisuals.precipitationIntensity;
      precipitation.particleTexture = isSnow ? snowTexture : rainTexture;
      precipitation.emitRate = precipitationStrength * (isSnow ? 650 : 1800);
      precipitation.minSize = isSnow ? 0.035 : 0.045;
      precipitation.maxSize = isSnow ? 0.08 : 0.09;
      precipitation.minScaleX = isSnow ? 1 : 0.35;
      precipitation.maxScaleX = isSnow ? 1 : 0.5;
      precipitation.minScaleY = isSnow ? 1 : 3;
      precipitation.maxScaleY = isSnow ? 1 : 5;
      precipitation.billboardMode = isSnow
        ? ParticleSystem.BILLBOARDMODE_ALL
        : ParticleSystem.BILLBOARDMODE_STRETCHED;
      precipitation.minLifeTime = isSnow ? 5 : 1.5;
      precipitation.maxLifeTime = isSnow ? 8 : 2.4;
      precipitationDirection1.copyFromFloats(
        Math.cos(windRadians) * windSceneSpeed - 0.12,
        isSnow ? -0.5 : -10,
        Math.sin(windRadians) * windSceneSpeed - 0.12
      );
      precipitationDirection2.copyFromFloats(
        Math.cos(windRadians) * windSceneSpeed + 0.12,
        isSnow ? -1.1 : -14,
        Math.sin(windRadians) * windSceneSpeed + 0.12
      );
      precipitation.direction1 = precipitationDirection1;
      precipitation.direction2 = precipitationDirection2;


      const terrainWindow = dynamicTerrainRef.current?._windowDebug;

      const terrainSpanFeet =
        terrainWindow?.spanFeet ||
        Math.max(
          curState?.bounds?.width || 1800,
          curState?.bounds?.height || 1800
        );

      const fog = calculateTerrainFog({
        cameraRadius: camera.radius,
        cameraBeta: camera.beta,
        spanFeet: terrainSpanFeet,
        fogDensity:
          (config.fogDensity ?? 0.01) *
          Math.max(0.25, Number(atmos.scatteringScale) || 1),
        visibleFarFeet: terrainWindow
          ? Math.hypot(terrainWindow.h, terrainWindow.dForward)
          : null
      });

      const visibleFarFeet = terrainWindow
        ? Math.hypot(terrainWindow.h, terrainWindow.dForward)
        : fog.edgeDistanceFeet;

      const fogStartRatio = Number(atmos.fogStartRatio ?? 0.92);

      const fogEndRatio = Math.max(
        fogStartRatio + 0.02,
        Number(atmos.fogEndRatio ?? 1.03)
      );

      const ratioFogStart = Math.max(
        fog.centerDistanceFeet,
        visibleFarFeet * fogStartRatio
      );

      const ratioFogEnd = Math.max(
        ratioFogStart + 50,
        visibleFarFeet * fogEndRatio
      );

      const adjustedFogStart = Math.max(
        fog.startFeet,
        ratioFogStart
      );

      const adjustedFogEnd = Math.max(
        adjustedFogStart + 50,
        fog.endFeet,
        ratioFogEnd
      );

      if (scene.fogMode !== BabylonScene.FOGMODE_LINEAR) {
        scene.fogMode = BabylonScene.FOGMODE_LINEAR;
      }

      scene.fogStart = adjustedFogStart / FEET_PER_SCENE_UNIT;
      scene.fogEnd = adjustedFogEnd / FEET_PER_SCENE_UNIT;
      scene.fogDensity = config.fogDensity ?? 0.01;

      const fogColorHex = config.fogColor || '#a9c9dc';
      if (lightingChanged || fogColorHex !== previousFogColor) {
        previousFogColor = fogColorHex;
        const fogColor = Color3.FromHexString(fogColorHex);
        const nightVisibility = Math.min(1,
          0.13 + daylightStrength * 0.87 + lighting.twilight * 0.17 +
          lighting.moonStrength * 1.1);
        const litFogColor = fogColor.scale(nightVisibility);
        scene.fogColor = litFogColor;
        scene.clearColor = new Color4(litFogColor.r, litFogColor.g, litFogColor.b, 1);
        horizonFloorMaterial.diffuseColor.copyFrom(litFogColor);
        horizonFloorMaterial.emissiveColor.copyFrom(litFogColor);
      }

      horizonFloor.position.x = camera.position.x;
      horizonFloor.position.z = camera.position.z;

      horizonFloor.position.y =
        (
          (Number(curState?.terrainMaterial?.sea_level_feet) || 0) -
          32
        ) /
        FEET_PER_SCENE_UNIT;

      const horizonDiameter = Math.max(
        4000,
        camera.maxZ * 2.25
      );

      horizonFloor.scaling.x = horizonDiameter;
      horizonFloor.scaling.z = horizonDiameter;


      const appliedOcclusionAt = distanceFeet =>
        Math.max(
          0,
          Math.min(
            1,
            (distanceFeet - adjustedFogStart) /
            (adjustedFogEnd - adjustedFogStart)
          )
        );

      fogDebugRef.current = {
        ...fog,
        startFeet: adjustedFogStart,
        endFeet: adjustedFogEnd,
        centerOcclusion: appliedOcclusionAt(fog.centerDistanceFeet),
        midpointOcclusion: appliedOcclusionAt(
          fog.centerDistanceFeet +
          (fog.edgeDistanceFeet - fog.centerDistanceFeet) / 2
        ),
        edgeOcclusion: appliedOcclusionAt(fog.edgeDistanceFeet)
      };


      // Keep the existing authored occlusion and continuous scene lighting;
      // the Atmosphere add-on composites only into background sky pixels.
      if (lightingChanged) {
        ambientSky.intensity = lighting.ambientIntensity;
        ambientSky.diffuse = Color3.Lerp(
          NIGHT_AMBIENT_COLOR,
          DAY_AMBIENT_COLOR,
          daylightStrength
        );
        ambientSky.groundColor = Color3.Lerp(
          NIGHT_GROUND_COLOR,
          DAY_GROUND_COLOR,
          daylightStrength
        );
        topDownKey.intensity = lighting.topDownIntensity;
      }


      // -----------------------------------------------------------------------
      // Weather audio
      // -----------------------------------------------------------------------

      const weatherName = config.activeWeather || 'clear';

      const rainTarget =
        weatherName === 'light-drizzle'
          ? 0.25
          : weatherName === 'pouring-rain'
            ? 0.65
            : weatherName === 'thunderstorm'
              ? 0.8
              : 0;

      const windTarget =
        weatherName === 'thunderstorm'
          ? 0.5
          : weatherName === 'snowing'
            ? 0.22
            : weatherName === 'foggy'
              ? 0.12
              : 0;

      const rain = rainAudioRef.current;
      const wind = windAudioRef.current;

      if (rain) {
        rain.setVolume(rainTarget * volumeScale, 0.2);

        if (rainTarget > 0 && !rain.isPlaying) rain.play();
        else if (rainTarget === 0 && rain.isPlaying) rain.pause();
      }

      if (wind) {
        wind.setVolume(windTarget * volumeScale, 0.2);

        if (windTarget > 0 && !wind.isPlaying) wind.play();
        else if (windTarget === 0 && wind.isPlaying) wind.pause();
      }


      // -----------------------------------------------------------------------
      // Thunderstorm flashes
      // -----------------------------------------------------------------------

      if (weatherName === 'thunderstorm') {
        const now = performance.now();

        if (lightningFlashRef.current.next === 0) {
          lightningFlashRef.current.next =
            now +
            2500 +
            Math.random() * 6500;
        }

        if (now >= lightningFlashRef.current.next) {
          lightningFlashRef.current.duration =
            0.08 +
            Math.random() * 0.14;

          lightningFlashRef.current.next =
            now +
            2500 +
            Math.random() * 9000;
        }

        if (lightningFlashRef.current.duration > 0) {
          lightningFlashRef.current.duration -= delta;
          topDownKey.intensity = 5;
          ambientSky.intensity = 2.5;
        }
      }

      else {
        lightningFlashRef.current.next = 0;
        lightningFlashRef.current.duration = 0;
      }
    });


    const cleanupControls = installBabylonCameraControls(
      scene,
      camera,
      () => stateRef.current,
      payload => {
        onCameraChangeRef.current?.({
          ...payload,
          bounds: stateRef.current.bounds,
          window: dynamicTerrainRef.current?._windowDebug || null,
          fog: fogDebugRef.current
        });
      }
    );

    const cleanupFirstPerson = installBabylonFirstPersonLook(
      scene,
      camera,
      () => stateRef.current,
      value => onPointerLockChangeRef.current?.(value)
    );

    const cleanupScale = installBabylonScaleObserver(
      scene,
      camera,
      () => stateRef.current,
      value => onScaleChangeRef.current?.(value)
    );

    workflowRef.current = createSettlementBabylonWorkflow(
      () => stateRef.current,
      () => stateRef.current.brushRadius
    );

    const detachWorkflow = workflowRef.current.attach(scene);

    if (!sceneReadySentRef.current) {
      sceneReadySentRef.current = true;
      onSceneReadyRef.current?.(scene);
    }


    return () => {
      detachWorkflow?.();
      cleanupControls?.();
      cleanupFirstPerson?.();
      cleanupScale?.();

      scene.onBeforeRenderObservable.remove(unifiedSceneObserver);

      rainAudioRef.current?.dispose();
      windAudioRef.current?.dispose();

      rainAudioRef.current = null;
      windAudioRef.current = null;

      horizonFloor.dispose();
      horizonFloorMaterial.dispose();

      precipitation.dispose();
      streetLampRenderer.dispose();
      rainTexture.dispose();
      snowTexture.dispose();
      moonDisc.dispose();
      moonMaterial.dispose();
      moonTexture.dispose();
      sunDisc.dispose();
      sunMaterial.dispose();
      starDome.dispose();
      starMaterial.dispose();
      starTexture.dispose();
      cloudVolume.dispose();
      cloudMaterial.dispose();
      skyDome.dispose();
      skyMaterial.dispose();
      atmosphere?.dispose();

      topDownKey.dispose();
      ambientSky.dispose();
      skyLight.dispose();
      moonLight.dispose();
      sunLight.dispose();

      pipeline.dispose();
      camera.dispose();

      cameraRef.current = null;
      workflowRef.current = null;
      sceneReadySentRef.current = false;
    };
  }, [scene]);


  // ===========================================================================
  // EFFECT 2. TERRAIN MATERIAL
  // ===========================================================================

  useEffect(() => {
    if (!scene) return undefined;

    let cancelled = false;

    loadTerrainMaterialFromJson(
      scene,
      '/materials/terrainMaterial.json'
    )
      .then(nodeMaterial => {
        if (cancelled || !nodeMaterial) {
          nodeMaterial?.dispose();
          return;
        }

        terrainMaterialRef.current = nodeMaterial;
        nodeMaterial.textureRepetitionMode =
          Constants.TEXTURE_REPETITION_HEX_TILING;
        nodeMaterial.textureRepetitionHexTilingParams = [1, 0.6, 7, 0.5];
        const tileSizeBlock = nodeMaterial.getBlockByName('computedTileSize');
        if (tileSizeBlock) tileSizeBlock.value = 1;
        nodeMaterial.needDepthPrePass = true;
        nodeMaterial.disableDepthWrite = false;
        nodeMaterial.forceDepthWrite = true;

        updateTerrainMaterialInputs(
          nodeMaterial,
          stateRef.current.terrainMaterial,
          stateRef.current.referenceLayers,
          scene,
          terrainWindowBoundsRef.current,
          {
            roads: stateRef.current.roads,
            buildings: stateRef.current.buildings,
            assets: stateRef.current.assets
          }
        );

        setIsMaterialReady(true);
      })
      .catch(error => {
        console.error(
          'Unable to load terrain material.',
          error
        );
      });

    return () => {
      cancelled = true;

      terrainMaterialRef.current?.dispose();
      terrainMaterialRef.current = null;

      setIsMaterialReady(false);
    };
  }, [scene]);


  // ===========================================================================
  // EFFECT 3. WORLD SAMPLER
  // ===========================================================================

  useEffect(() => {
    if (!tileStore) {
      worldSamplerRef.current = null;
      return;
    }

    setStoreDefaults(tileStore, bounds);

    worldSamplerRef.current = createWorldSampler(
      tileStore,
      () => stateRef.current.strokes,
      () => stateRef.current.heightmapPlacement,
      {
        materializeMissing: true
      }
    );
  }, [
    tileStore,
    tileStoreVersion,
    bounds
  ]);


  // ===========================================================================
  // EFFECT 4. INVALIDATE GENERATED TILES AFTER HEIGHTMAP CHANGES
  // ===========================================================================

  useEffect(() => {
    if (!tileStore) return;

    const previous = previousHeightmapBoundsRef.current;

    const current = state.heightmapPlacement
      ? heightmapPlacementBounds(state.heightmapPlacement)
      : null;

    if (previous || current) {
      invalidateGeneratedTiles(
        tileStore,
        previous,
        current
      );
    }

    previousHeightmapBoundsRef.current = current;
  }, [
    tileStore,
    state.heightmapPlacement
  ]);
  // ===========================================================================
  // EFFECT 5. DYNAMIC TERRAIN WINDOW
  // ===========================================================================

  useEffect(() => {
    if (!scene || !isMaterialReady || !cameraRef.current || !tileStore) return undefined;

    const camera = cameraRef.current;
    const pauseControl = pauseControlRef.current;

    const planWindow = () => {
      const position = camera.position;
      const target = camera.target;

      if (!position || !target) return null;

      return planTerrainView({
        position,
        target,
        alpha: camera.alpha,
        beta: camera.beta,
        fov: camera.fov,
        aspect: scene.getEngine().getRenderWidth() / Math.max(1, scene.getEngine().getRenderHeight()),
        groundFeet: worldSamplerRef.current?.(
          target.x * FEET_PER_SCENE_UNIT,
          target.z * FEET_PER_SCENE_UNIT
        ) || 0
      });
    };

    let populateFrame = null;
    let pendingTerrain = null;

    const cancelPendingTerrain = () => {
      terrainBuildRevisionRef.current += 1;
      pauseControl.resumeTerrain = null;

      if (populateFrame !== null) cancelAnimationFrame(populateFrame);
      populateFrame = null;

      if (pendingTerrain && pendingTerrain !== dynamicTerrainRef.current) pendingTerrain.dispose();
      pendingTerrain = null;
    };

    const disposeCurrentTerrain = () => {
      cancelPendingTerrain();

      if (dynamicTerrainRef.current) dynamicTerrainRef.current.dispose();

      dynamicTerrainRef.current = null;
      terrainWindowBoundsRef.current = null;
    };

    const buildTerrainWindow = plan => {
      const b = plan.bounds;

      const worldSampler = createWorldSampler(
        tileStore,
        () => stateRef.current.strokes,
        () => stateRef.current.heightmapPlacement,
        { materializeMissing: false }
      );

      worldSamplerRef.current = worldSampler;

      const targetHeightRaw = worldSampler(
        camera.target.x * FEET_PER_SCENE_UNIT,
        camera.target.z * FEET_PER_SCENE_UNIT
      );

      const targetHeight = Number.isFinite(targetHeightRaw)
        ? targetHeightRaw
        : (tileStore.defaults?.baseFeet ?? 30);

      const oldTerrain = dynamicTerrainRef.current;
      const oldMeta = oldTerrain?._worldBufferMeta;

      const canReuse =
        oldMeta?.cellSize === plan.cellSize &&
        oldTerrain?._windowDebug?.loadedTiles === oldTerrain?._windowDebug?.totalTiles;

      const cachedHeight = (x, y) => {
        if (!canReuse) return undefined;

        const data = oldTerrain.mapData;

        const column = Math.round(
          (x / FEET_PER_SCENE_UNIT - data[0]) /
          plan.cellSize
        );

        const row = Math.round(
          (y / FEET_PER_SCENE_UNIT - data[2]) /
          plan.cellSize
        );

        if (
          column < 0 ||
          row < 0 ||
          column >= oldMeta.mapSubX ||
          row >= oldMeta.mapSubZ
        ) {
          return undefined;
        }

        return data[
          (row * oldMeta.mapSubX + column) * 3 + 1
        ] * FEET_PER_SCENE_UNIT;
      };

      const {
        mapData,
        mapSubX,
        mapSubZ
      } = buildWorldMapData(
        (x, y) => cachedHeight(x, y) ?? targetHeight,
        b,
        plan.cellSize
      );

      cancelPendingTerrain();

      const revision = ++terrainBuildRevisionRef.current;

      console.log(
        '[Terrain] Window rebuild:',
        plan.debug.tilesX,
        'x',
        plan.debug.tilesZ,
        'tiles @',
        plan.debug.cellFeet,
        'ft/cell |',
        mapSubX,
        'x',
        mapSubZ,
        'cells'
      );

      const replacesVisibleTerrain = Boolean(
        oldTerrain && !oldTerrain.mesh.isDisposed()
      );

      const dt = createTerrainWindow(
        scene,
        mapData,
        mapSubX,
        mapSubZ,
        { deferNormals: replacesVisibleTerrain }
      );

      pendingTerrain = dt;

      dt._worldBufferMeta = {
        cellSize: plan.cellSize,
        mapSubX,
        mapSubZ,
        bounds: b
      };

      dt._windowDebug = {
        ...plan.debug
      };

      dt.mesh.material = terrainMaterialRef.current;

      dt.mesh.metadata = {
        settlement: true,
        kind: 'terrain'
      };

      if (replacesVisibleTerrain) {
        dt.mesh.setEnabled(false);
      } else {
        dynamicTerrainRef.current = dt;
        terrainWindowBoundsRef.current = b;
        setTerrainWindowKey(plan.key);
      }

      const pending = terrainSampleOrder(
        mapData,
        camera.target.x * FEET_PER_SCENE_UNIT,
        camera.target.z * FEET_PER_SCENE_UNIT
      )
        .map(group => ({
          ...group,
          indices: group.indices.filter(index =>
            cachedHeight(
              mapData[index] * FEET_PER_SCENE_UNIT,
              mapData[index + 2] * FEET_PER_SCENE_UNIT
            ) === undefined
          )
        }))
        .filter(group => group.indices.length);

      let next = 0;

      const reportSceneReady = () => {
        if (sceneReadySentRef.current) return;

        sceneReadySentRef.current = true;
        requestAnimationFrame(() => onSceneReadyRef.current?.());
      };

      const commitTerrain = () => {
        if (
          revision !== terrainBuildRevisionRef.current ||
          dt.mesh.isDisposed()
        ) {
          return;
        }

        dt.update();

        dt._windowDebug.loadedTiles = pending.length;
        dt._windowDebug.totalTiles = pending.length;

        if (replacesVisibleTerrain) {
          dt.mesh.setEnabled(true);

          dynamicTerrainRef.current = dt;
          terrainWindowBoundsRef.current = b;
          setTerrainWindowKey(plan.key);

          if (
            oldTerrain !== dt &&
            !oldTerrain.mesh.isDisposed()
          ) {
            oldTerrain.dispose();
          }
        }

        if (terrainMaterialRef.current) {
          updateTerrainMaterialInputs(
            terrainMaterialRef.current,
            stateRef.current.terrainMaterial,
            stateRef.current.referenceLayers,
            scene,
            b,
            {
              roads: stateRef.current.roads,
              buildings: stateRef.current.buildings,
              assets: stateRef.current.assets
            }
          );
        }

        pendingTerrain = null;
        onTerrainReadyRef.current?.();
        reportSceneReady();
      };

      const populate = () => {
        if (
          revision !== terrainBuildRevisionRef.current ||
          dt.mesh.isDisposed()
        ) {
          return;
        }

        if (pauseControl.paused) {
          populateFrame = null;
          pauseControl.resumeTerrain = () => {
            populateFrame = requestAnimationFrame(populate);
          };
          return;
        }

        const start = performance.now();

        do {
          for (const index of pending[next].indices) {
            const height = worldSampler(
              mapData[index] * FEET_PER_SCENE_UNIT,
              mapData[index + 2] * FEET_PER_SCENE_UNIT
            );

            mapData[index + 1] =
              (
                Number.isFinite(height)
                  ? height
                  : targetHeight
              ) /
              FEET_PER_SCENE_UNIT;
          }

          next += 1;
        } while (
          next < pending.length &&
          performance.now() - start < (replacesVisibleTerrain ? 4 : 8)
        );

        dt._windowDebug.loadedTiles = next;
        dt._windowDebug.totalTiles = pending.length;

        if (!replacesVisibleTerrain) dt.update();

        if (next < pending.length) {
          populateFrame = requestAnimationFrame(populate);
        } else {
          populateFrame = null;
          commitTerrain();
        }
      };

      dt._windowDebug.loadedTiles = 0;
      dt._windowDebug.totalTiles = pending.length;

      populateFrame = pending.length
        ? requestAnimationFrame(populate)
        : null;

      if (!pending.length) commitTerrain();
    };

    let currentKey = null;
    let lastDebugSignature = '';

    const maybeRebuild = () => {
      const plan = planWindow();
      if (!plan) return;

      if (dynamicTerrainRef.current?._windowDebug) {
        Object.assign(
          dynamicTerrainRef.current._windowDebug,
          plan.debug
        );
      }

      if (plan.key !== currentKey) {
        currentKey = plan.key;
        buildTerrainWindow(plan);
      }

      const windowDebug = dynamicTerrainRef.current?._windowDebug;
      const debugSignature = [
        plan.key,
        windowDebug?.loadedTiles,
        windowDebug?.totalTiles,
      ].join(':');
      if (debugSignature === lastDebugSignature) return;
      lastDebugSignature = debugSignature;

      onCameraChangeRef.current?.({
        position: camera.position.asArray(),
        target: camera.target.asArray(),
        radius: camera.radius,
        alpha: camera.alpha,
        beta: camera.beta,
        bounds: boundsRef.current,
        terrainBounds: dynamicTerrainRef.current?._worldBufferMeta?.bounds ?? null,
        lodValue: dynamicTerrainRef.current?._lastDebugLOD ?? null,
        window: { ...windowDebug },
        fog: fogDebugRef.current
      });
    };

    maybeRebuild();

    let accumulator = 0;

    const rebuildWatcher = scene.onBeforeRenderObservable.add(() => {
      accumulator += scene.getEngine().getDeltaTime();

      if (accumulator < 200) return;

      accumulator = 0;
      maybeRebuild();
    });

    return () => {
      pauseControl.resumeTerrain = null;
      scene.onBeforeRenderObservable.remove(rebuildWatcher);
      disposeCurrentTerrain();
    };
  }, [
    scene,
    isMaterialReady,
    tileStore,
    pauseControlRef
  ]);


  // ===========================================================================
  // EFFECT 6. TERRAIN MATERIAL INPUT REFRESH
  // ===========================================================================

  useEffect(() => {
    const nodeMaterial = terrainMaterialRef.current;

    if (!scene || !nodeMaterial) return;

    updateTerrainMaterialInputs(
      nodeMaterial,
      state.terrainMaterial,
      state.referenceLayers,
      scene,
      terrainWindowBoundsRef.current,
      {
        roads: meshState.roads,
        buildings: meshState.buildings,
        assets: meshState.assets
      }
    );
  }, [
    scene,
    state.terrainMaterial,
    state.referenceLayers,
    meshState.roads,
    meshState.buildings,
    meshState.assets,
    terrainWindowKey
  ]);


  // ===========================================================================
  // EFFECT 7. TERRAIN REGION REFRESH FOR SCULPTING
  // ===========================================================================

  useEffect(() => {
    if (!scene || !dynamicTerrainRef.current) return;

    const preview = state.strokes || [];
    const previous = previewStrokesRef.current;

    previewStrokesRef.current = preview;

    if (preview.length === 0 && previous.length === 0) return;

    let dirty = null;

    const addStrokeBounds = stroke => {
      const radius = Number(stroke.radius) || 0;

      const box = {
        minX: stroke.x - radius,
        maxX: stroke.x + radius,
        minY: stroke.y - radius,
        maxY: stroke.y + radius
      };

      dirty = dirty ? mergeBox(dirty, box) : box;
    };

    previous.forEach(addStrokeBounds);
    preview.forEach(addStrokeBounds);

    if (!dirty) return;

    dirtyRegionRef.current = dirtyRegionRef.current
      ? mergeBox(dirtyRegionRef.current, dirty)
      : dirty;

    queuedTerrainRegionRef.current = dirtyRegionRef.current;

    if (terrainRefreshFrameRef.current !== null) return;

    const refresh = timestamp => {
      terrainRefreshFrameRef.current = null;

      if (timestamp - lastTerrainRefreshRef.current < 30) {
        terrainRefreshFrameRef.current = requestAnimationFrame(refresh);
        return;
      }

      lastTerrainRefreshRef.current = timestamp;

      const region = queuedTerrainRegionRef.current;

      queuedTerrainRegionRef.current = null;
      dirtyRegionRef.current = null;

      if (region && dynamicTerrainRef.current && worldSamplerRef.current) {
        const dt = dynamicTerrainRef.current;
        const meta = dt._worldBufferMeta;

        if (meta) {
          refreshTerrainRegion(
            dt,
            worldSamplerRef.current,
            meta,
            {
              minX: region.minX / FEET_PER_SCENE_UNIT,
              maxX: region.maxX / FEET_PER_SCENE_UNIT,
              minY: region.minY / FEET_PER_SCENE_UNIT,
              maxY: region.maxY / FEET_PER_SCENE_UNIT
            }
          );
        }
      }
    };

    terrainRefreshFrameRef.current = requestAnimationFrame(refresh);
  }, [
    scene,
    state.strokes
  ]);


  useEffect(() => () => {
    if (terrainRefreshFrameRef.current !== null) {
      cancelAnimationFrame(terrainRefreshFrameRef.current);
    }
  }, []);


  // A tile store is mutated in place, so its identity does not change after a
  // bake, undo, redo, or import. The explicit revision guarantees Babylon's
  // current terrain window is resampled after each committed change.
  useEffect(() => {
    const dt = dynamicTerrainRef.current;
    const meta = dt?._worldBufferMeta;

    if (!dt || !meta || !worldSamplerRef.current) return;

    refreshTerrainRegion(
      dt,
      worldSamplerRef.current,
      meta,
      {
        minX: meta.bounds.minX / FEET_PER_SCENE_UNIT,
        maxX: meta.bounds.maxX / FEET_PER_SCENE_UNIT,
        minY: meta.bounds.minY / FEET_PER_SCENE_UNIT,
        maxY: meta.bounds.maxY / FEET_PER_SCENE_UNIT
      }
    );
  }, [
    tileStoreVersion,
    scene
  ]);


  // Heightmap placement is a sampler overlay rather than a tile mutation.
  // Refresh both its previous and current footprint while it is dragged.
  useEffect(() => {
    const dt = dynamicTerrainRef.current;
    const meta = dt?._worldBufferMeta;
    const nextBounds = heightmapPlacementBounds(state.heightmapPlacement);

    const refreshBounds = mergeBox(
      previousHeightmapBoundsRef.current,
      nextBounds
    );

    previousHeightmapBoundsRef.current = nextBounds;

    if (!dt || !meta || !refreshBounds || !worldSamplerRef.current) return;

    refreshTerrainRegion(
      dt,
      worldSamplerRef.current,
      meta,
      {
        minX: refreshBounds.minX / FEET_PER_SCENE_UNIT,
        maxX: refreshBounds.maxX / FEET_PER_SCENE_UNIT,
        minY: refreshBounds.minY / FEET_PER_SCENE_UNIT,
        maxY: refreshBounds.maxY / FEET_PER_SCENE_UNIT
      }
    );
  }, [
    state.heightmapPlacement,
    scene
  ]);


  useEffect(() => {
    const placement = state.heightmapPlacement;

    if (!scene || !placement || !worldSamplerRef.current) {
      return undefined;
    }

    const angle = (Number(placement.rotation) || 0) * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const halfW = Math.abs(Number(placement.width_feet) || 0) / 2;
    const halfH = Math.abs(Number(placement.height_feet) || 0) / 2;

    const corners = [
      [-halfW, -halfH],
      [halfW, -halfH],
      [halfW, halfH],
      [-halfW, halfH]
    ].map(([localX, imageDown]) => {
      const x = placement.origin_x + localX * cos + imageDown * sin;
      const y = placement.origin_y + localX * sin - imageDown * cos;

      return worldToBabylon(
        x,
        y,
        worldSamplerRef.current(x, y) + 8
      );
    });

    corners.push(corners[0].clone());

    const outline = MeshBuilder.CreateLines(
      'heightmap-placement-outline',
      { points: corners },
      scene
    );

    outline.color = Color3.FromHexString(EDITOR_ACCENT_HEX);
    outline.isPickable = false;
    outline.renderingGroupId = 2;

    return () => outline.dispose();
  }, [
    scene,
    state.heightmapPlacement
  ]);

  useEffect(() => {
    if (!scene || !state.referenceCalibrationMode || !state.calibrationPoints?.length || !worldSamplerRef.current) return undefined;
    const material = new StandardMaterial('reference-calibration-marker-material', scene);
    material.disableLighting = true;
    material.disableDepthWrite = true;
    material.emissiveColor = Color3.FromHexString('#ffe08a');
    const points = state.calibrationPoints.map(point =>
      worldToBabylon(point.x, point.y, worldSamplerRef.current(point.x, point.y) + 4));
    const meshes = points.map((point, index) => {
      const marker = MeshBuilder.CreateSphere(`reference-calibration-point-${index + 1}`,
        { diameter: 8 / FEET_PER_SCENE_UNIT, segments: 12 }, scene);
      marker.position.copyFrom(point);
      marker.material = material;
      marker.isPickable = false;
      marker.renderingGroupId = 3;
      return marker;
    });
    if (points.length === 2) {
      const line = MeshBuilder.CreateTube('reference-calibration-distance', {
        path: points, radius: 0.8 / FEET_PER_SCENE_UNIT, tessellation: 6
      }, scene);
      line.material = material;
      line.isPickable = false;
      line.renderingGroupId = 3;
      meshes.push(line);
    }
    return () => { meshes.forEach(mesh => mesh.dispose()); material.dispose(); };
  }, [scene, state.referenceCalibrationMode, state.calibrationPoints]);

  // Draft geometry lives outside the committed mesh rebuild so every new point
  // and cursor move is visible immediately, even above projected map images.
  useEffect(() => {
    if (!scene || !worldSamplerRef.current) return undefined;
    const current = stateRef.current;
    const kind = current.activeTool;
    const drawing = (kind === 'road' && current.roadMode === 'draw-new')
      || (kind === 'region' && ['draw-new', 'trace'].includes(current.regionMode))
      || (kind === 'fortification' && current.fortificationMode === 'draw-new');
    if (!drawing) return undefined;
    const draft = kind === 'road' ? current.roadDraft
      : kind === 'region' ? current.regionDraft : current.fortificationDraft;
    if (!draft?.length && !current.splineHoverPoint) return undefined;
    const hover = current.splineHoverPoint;
    const snap = hover && kind !== 'fortification'
      ? nearestSplinePoint(hover, current.roads, kind === 'region' ? current.fortifications : [], current.roadSnapToleranceFeet, hover._source)
      : null;
    const nextPoint = snap && (kind === 'region' || current.roadSnapEnabled) ? { x: snap.x, y: snap.y } : hover;
    const last = draft[draft.length - 1];
    const previewDraft = nextPoint && last && Math.hypot(nextPoint.x - last.x, nextPoint.y - last.y) > 0.01
      ? [...draft, nextPoint] : draft;
    const path = kind === 'road' && previewDraft.length > 1
      ? sampleRoadCenterline({ points: previewDraft })
      : kind === 'fortification' && draft.length > 1
        ? sampleFortificationCenterline({ points: previewDraft })
        : kind === 'region' && current.regionMode === 'trace'
          ? tracedDraftPolyline(hover ? appendTracedBoundaryPoint(draft, hover, current.roads,
            current.fortifications, current.roadSnapToleranceFeet) : draft, current.roads, current.fortifications)
          : previewDraft;
    const displayPath = path.filter((point, index) => index === 0 ||
      Math.hypot(point.x - path[index - 1].x, point.y - path[index - 1].y) > 0.001);
    const groundAt = point => Math.max(worldSamplerRef.current(point.x, point.y) + 1.5,
      (Number(current.terrainMaterial?.sea_level_feet) || 0) + 1.5);
    const meshes = [];
    const material = new StandardMaterial(`draft-${kind}-points`, scene);
    material.disableLighting = true;
    material.emissiveColor = Color3.FromHexString(EDITOR_ACCENT_HEX);
    if (displayPath.length > 1) {
      const line = MeshBuilder.CreateTube(`draft-${kind}-line`, {
        path: displayPath.map(point => worldToBabylon(point.x, point.y, groundAt(point))),
        radius: Math.max(0.3, Math.min(4, current.roadSnapToleranceFeet / 10 || 0.8)) / FEET_PER_SCENE_UNIT,
        tessellation: 6 }, scene);
      line.material = material;
      line.isPickable = false;
      line.renderingGroupId = 3;
      meshes.push(line);
    }
    draft.forEach((point, index) => {
      const marker = MeshBuilder.CreateSphere(`draft-${kind}-${index}`,
        { diameter: Math.max(1.5, Math.min(30, current.roadSnapToleranceFeet / 3 || 9)) / FEET_PER_SCENE_UNIT, segments: 12 }, scene);
      marker.position = worldToBabylon(point.x, point.y, groundAt(point));
      marker.material = material;
      marker.isPickable = false;
      marker.renderingGroupId = 3;
      meshes.push(marker);
    });
    return () => { meshes.forEach(mesh => mesh.dispose()); material.dispose(); };
  }, [scene, state.activeTool, state.roadMode, state.regionMode, state.fortificationMode,
    state.roadDraft, state.regionDraft, state.fortificationDraft, state.splineHoverPoint,
    state.roadSnapEnabled, state.roadSnapToleranceFeet,
    state.roads, state.fortifications, terrainWindowKey, tileStoreVersion]);


  // ===========================================================================
  // EFFECT 8. REFERENCE OVERLAYS
  // ===========================================================================

  const referenceMeshesRef = useRef(new Map());

  useEffect(() => {
    const meshes = referenceMeshesRef.current;

    return () => {
      meshes.forEach(mesh => mesh.dispose(false, true));
      meshes.clear();
    };
  }, [scene]);


  useEffect(() => {
    if (!scene || !worldSamplerRef.current) return;

    const visible = (meshState.referenceLayers || []).filter(
      layer =>
        layer.visible !== false &&
        layer.image_url &&
        !layer.floor_level_id
    );

    // Projected references are blended into the terrain NodeMaterial.
    const layers = visible.filter(
      layer => layer.project_to_terrain === false
    );

    const meshes = referenceMeshesRef.current;

    meshes.forEach((mesh, id) => {
      if (!layers.some(layer => layer.id === id)) {
        mesh.dispose(false, true);
        meshes.delete(id);
      }
    });

    layers.forEach((layer, index) => {
      meshes.set(
        layer.id,
        createReferenceOverlay(
          scene,
          layer,
          worldSamplerRef.current,
          index,
          meshes.get(layer.id)
        )
      );
    });
  }, [
    scene,
    meshState.referenceLayers,
    terrainWindowKey,
    tileStoreVersion
  ]);


  const referencePlacementActive = Boolean(state.referencePlacement);

  useEffect(() => {
    if (!scene || !referencePlacementActive || !worldSamplerRef.current) {
      return undefined;
    }

    return createReferenceGizmo(
      scene,
      worldSamplerRef.current
    );
  }, [
    scene,
    referencePlacementActive,
    terrainWindowKey,
    tileStoreVersion
  ]);


  // ===========================================================================
  // EFFECT 9. SETTLEMENT FEATURE MESHES
  // ===========================================================================

  useEffect(() => {
    const draft = state.blueprintDraft;
    const corners = draft?.levels?.[0]?.corners || [];
    if (!scene || state.activeTool !== 'build' || state.buildMode !== 'draw-blueprint' ||
      !corners.length || !worldSamplerRef.current) return undefined;

    const material = new StandardMaterial('blueprint-footprint-guide-material', scene);
    material.disableLighting = true;
    material.disableDepthWrite = true;
    material.emissiveColor = Color3.FromHexString(EDITOR_ACCENT_HEX);
    const previewMaterial = new StandardMaterial('blueprint-footprint-preview-material', scene);
    previewMaterial.disableLighting = true;
    previewMaterial.disableDepthWrite = true;
    previewMaterial.emissiveColor = Color3.FromHexString(EDITOR_ACCENT_HEX);
    const meshes = [];
    const worldCorners = sceneFootprintPreview(draft, state.footprintTool, state.footprintPoints || [], state.blueprintHoverPoint);
    const drawSegment = (start, end, preview = false) => {
      if (Math.hypot(end.x - start.x, end.y - start.y) < 0.01) return;
      const count = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 10));
      const path = Array.from({ length: count + 1 }, (_, index) => {
        const fraction = index / count;
        const x = start.x + (end.x - start.x) * fraction;
        const y = start.y + (end.y - start.y) * fraction;
        return worldToBabylon(x, y, worldSamplerRef.current(x, y) + 2);
      });
      const line = MeshBuilder.CreateTube(preview ? 'blueprint-footprint-next-edge' : 'blueprint-footprint-edge', {
        path, radius: (preview ? 0.15 : 0.22) / FEET_PER_SCENE_UNIT, tessellation: 6
      }, scene);
      line.material = preview ? previewMaterial : material;
      line.isPickable = false;
      line.renderingGroupId = 3;
      meshes.push(line);
    };
    worldCorners.forEach((point, index) => {
      if (index) drawSegment(worldCorners[index - 1], point);
    });
    corners.map(corner => ({ x: draft.x + corner.x, y: draft.y + corner.y })).forEach((point, index) => {
      const marker = MeshBuilder.CreateSphere(`blueprint-footprint-point-${index + 1}`, {
        diameter: 1.2 / FEET_PER_SCENE_UNIT, segments: 12
      }, scene);
      marker.position = worldToBabylon(point.x, point.y, worldSamplerRef.current(point.x, point.y) + 2);
      marker.material = material;
      marker.isPickable = false;
      marker.renderingGroupId = 3;
      meshes.push(marker);
    });

    return () => { meshes.forEach(mesh => mesh.dispose()); material.dispose(); previewMaterial.dispose(); };
  }, [scene, state.activeTool, state.buildMode, state.blueprintDraft, state.blueprintHoverPoint, state.footprintTool, state.footprintPoints, terrainWindowKey, tileStoreVersion]);

  useEffect(() => {
    if (!scene) return undefined;

    const currentState = stateRef.current;
    const transientMeshes = [];
    const nextMerlonBatches = new Map();
    const roadPickMaterial = new StandardMaterial('road-pick-material', scene);
    roadPickMaterial.alpha = 0;
    roadPickMaterial.disableLighting = true;
    roadPickMaterial.disableDepthWrite = true;
    roadPickMaterial.backFaceCulling = false;

    const heightSampler =
      worldSamplerRef.current ||
      createTerrainHeightSampler(
        currentState.strokes,
        currentState.heightMap
      );

    const visibleTerrainBounds =
      terrainWindowBoundsRef.current ||
      bounds;


    // -------------------------------------------------------------------------
    // 1. Roads
    //
    // Road appearance is composited into the terrain material. These meshes
    // remain transparent pick proxies for selection and refinement.
    // -------------------------------------------------------------------------

    (currentState.roads || [])
      .filter(road => road.visible !== false)
      .forEach(road => {
        const pointWidths = (road.points || [])
          .map(point => Number(point.width_feet))
          .filter(Number.isFinite);

        const widestWidth = Math.max(
          Number(road.width_feet) || 20,
          ...pointWidths,
          1
        );

        const halfWidth = widestWidth / 2;

        polylinePartsInBounds(
          road.points,
          visibleTerrainBounds,
          halfWidth
        ).forEach((points, partIndex) => {
          const data = roadVertexData(
            { ...road, points },
            currentState.strokes,
            currentState.heightMap,
            heightSampler
          );

          const roadMesh = meshFromData(
            scene,
            `road-${road.id}-${partIndex}`,
            data,
            roadPickMaterial,
            {
              settlement: true,
              kind: 'road',
              item: road,
              streamedPart: partIndex
            }
          );

          roadMesh.isPickable = true;
          transientMeshes.push(roadMesh);
        });
      });


    // -------------------------------------------------------------------------
    // 2. Fortifications
    // -------------------------------------------------------------------------

    (currentState.fortifications || [])
      .filter(wall => wall.visible !== false)
      .forEach(wall => {
        const halfWidth = Math.max(
          1,
          Number(wall.width_feet) || 24
        ) / 2;

        const pointsWithRoles = (wall.points || []).map((point, index) => ({
          ...point,
          tower: isFortificationTowerPoint(wall, index)
        }));

        pointsWithRoles.slice(1).forEach((_, partIndex) => {
          const properties = wallSegmentProperties(wall, partIndex);
          if (!featureIntersectsBounds({ points: pointsWithRoles.slice(partIndex, partIndex + 2) }, visibleTerrainBounds, halfWidth)) return;
          const data = fortificationVertexData(
            { ...wall, points: pointsWithRoles },
            currentState.strokes,
            currentState.heightMap,
            heightSampler,
            partIndex
          );

          const mat = material(
            scene,
            `wall-material-${wall.id}-${partIndex}`,
            wallSegmentMaterialColor(wall, partIndex)
          );

          const wallMesh = meshFromData(
            scene,
            `wall-${wall.id}-${partIndex}`,
            data,
            mat,
            {
              settlement: true,
              kind: 'wall',
              item: wall,
              streamedPart: partIndex
            }
          );

          transientMeshes.push(wallMesh);
          if (properties.battlements) {
            const merlons = wallSegmentBattlements(wall, partIndex, heightSampler)
              .map(placement => {
                const position = worldToBabylon(placement.x, placement.y, placement.elevation);
                return {
                  x: position.x, y: position.y, z: position.z,
                  angle: placement.rotation,
                  width: 5 / FEET_PER_SCENE_UNIT,
                  depth: properties.width_feet / FEET_PER_SCENE_UNIT,
                  height: 4 / FEET_PER_SCENE_UNIT
                };
              });
            const key = `${wall.id}:${partIndex}`;
            const previous = merlonBatchesRef.current.get(key);
            const sameBoxes = sameThinBoxes(previous?.boxes, merlons);
            const batch = sameBoxes ? previous.mesh : createThinBoxBatch(scene,
              `wall-merlons-${key}`, mat, merlons,
              { ...wallMesh.metadata, performanceCategory: 'battlements' });
            if (batch) {
              if (sameBoxes) {
                batch.material = mat;
                batch.metadata = { ...wallMesh.metadata, performanceCategory: 'battlements' };
              }
              nextMerlonBatches.set(key, { mesh: batch, boxes: merlons });
            }
          }
        });

        (wall.points || [])
          .map((point, index) => ({ point, index }))
          .filter(({ point, index }) => (
            !point.junction_id &&
            isFortificationTowerPoint(wall, index) &&
            featureIntersectsBounds(point, visibleTerrainBounds)
          ))
          .forEach(({ point, index }) => {
            const base = heightSampler(point.x, point.y);
            const specification = attachedWallTower(wall, point, index);
            const wallHeight = Number(specification?.height_feet ?? wall.height_feet) || 35;
            const widthFeet = Number(specification?.width_feet) || (Number(wall.width_feet) || 24) * 1.65;
            const depthFeet = Number(specification?.depth_feet) || widthFeet;
            const shape = specification?.shape || 'circular';
            const sides = shape === 'triangular' ? 3 : shape === 'square' ? 4 : shape === 'polygonal' ? Math.max(5, Number(specification?.sides) || 6) : 12;
            const tower = shape === 'rectangular'
              ? MeshBuilder.CreateBox(
                `tower-${wall.id}-${specification?.id || index}`,
                { width: widthFeet / FEET_PER_SCENE_UNIT, depth: depthFeet / FEET_PER_SCENE_UNIT, height: wallHeight / FEET_PER_SCENE_UNIT },
                scene
              )
              : MeshBuilder.CreateCylinder(
              `tower-${wall.id}-${index}`,
              {
                diameter: widthFeet / FEET_PER_SCENE_UNIT,
                height: wallHeight / FEET_PER_SCENE_UNIT,
                tessellation: sides
              },
              scene
            );

            tower.position = worldToBabylon(
              point.x,
              point.y,
              base + wallHeight / 2
            );
            tower.rotation.y = Number(specification?.rotation) || 0;

            tower.material = material(
              scene,
              `tower-mat-${wall.id}-${index}`,
              '#756c60'
            );

            tower.metadata = {
              settlement: true,
              kind: 'wall',
              item: wall
            };

            transientMeshes.push(tower);
          });
      });

    merlonBatchesRef.current.forEach((entry, key) => {
      if (nextMerlonBatches.get(key)?.mesh !== entry.mesh) entry.mesh.dispose(false, false);
    });
    merlonBatchesRef.current = nextMerlonBatches;

    (currentState.wallJunctions || []).forEach(junction => {
      if (!featureIntersectsBounds(junction, visibleTerrainBounds)) return;
      const wall = (currentState.fortifications || []).find(candidate =>
        candidate.visible !== false &&
        (candidate.points || []).some(point => point.junction_id === junction.id));
      if (!wall) return;
      const height = Math.max(1, Number(junction.height_feet) || 35);
      const width = Math.max(1, Number(junction.width_feet) || 36);
      const depth = Math.max(1, Number(junction.depth_feet) || width);
      const guardhouse = junction.kind === 'guardhouse';
      const shape = junction.shape || 'circular';
      const sides = shape === 'triangular' ? 3 : shape === 'square' ? 4
        : shape === 'polygonal' ? 6 : 12;
      const tower = guardhouse || shape === 'rectangular'
        ? MeshBuilder.CreateBox(`wall-junction-${junction.id}`, {
          width: width / FEET_PER_SCENE_UNIT, depth: depth / FEET_PER_SCENE_UNIT,
          height: height / FEET_PER_SCENE_UNIT
        }, scene)
        : MeshBuilder.CreateCylinder(`wall-junction-${junction.id}`, {
          diameter: width / FEET_PER_SCENE_UNIT, height: height / FEET_PER_SCENE_UNIT,
          tessellation: sides
        }, scene);
      tower.position = worldToBabylon(junction.x, junction.y,
        heightSampler(junction.x, junction.y) + height / 2);
      tower.rotation.y = Number(junction.rotation) || 0;
      tower.material = material(scene, `wall-junction-mat-${junction.id}`,
        wallSegmentMaterialColor({ material: junction.material }, 0));
      tower.metadata = { settlement: true, kind: 'wall', item: wall, junction_id: junction.id };
      transientMeshes.push(tower);
    });


    // -------------------------------------------------------------------------

    // Canonical NPC tokens at confirmed positions; existing minis/movement remain independent.
    (currentState.npcTokens || []).forEach(token => {
      if (!featureIntersectsBounds(token, visibleTerrainBounds)) return;
      const marker = token.url
        ? MeshBuilder.CreatePlane(`npc-token-${token.npcId}`, {size: 10 / FEET_PER_SCENE_UNIT}, scene)
        : MeshBuilder.CreateSphere(`npc-token-${token.npcId}`, {diameter: 3 / FEET_PER_SCENE_UNIT, segments: 8}, scene);
      marker.position = worldToBabylon(token.x, token.y, heightSampler(token.x, token.y) + (Number(token.elevation) || 0) + 8);
      marker.billboardMode = Mesh.BILLBOARDMODE_ALL;
      const tokenMaterial = new StandardMaterial(`npc-token-material-${token.npcId}`, scene);
      tokenMaterial.disableLighting = true; tokenMaterial.emissiveColor = new Color3(1,1,1);
      if (token.url) { const texture = new Texture(token.url, scene); texture.hasAlpha = true; tokenMaterial.diffuseTexture = texture; tokenMaterial.useAlphaFromDiffuseTexture = true; }
      marker.material = tokenMaterial; marker.isPickable = currentState.activeTool === 'npcs';
      marker.metadata = {kind:'npc', npc_id:token.npcId};
      transientMeshes.push(marker);
      if (Number(currentState.selectedNpcTokenId) === Number(token.npcId)) {
        const ring = MeshBuilder.CreateTorus(`npc-token-ring-${token.npcId}`, { diameter: 14 / FEET_PER_SCENE_UNIT, thickness: 1.5 / FEET_PER_SCENE_UNIT, tessellation: 36 }, scene);
        ring.position = worldToBabylon(token.x, token.y, heightSampler(token.x, token.y) + (Number(token.elevation) || 0) + 1);
        ring.rotation.x = Math.PI / 2;
        const ringMaterial = new StandardMaterial(`npc-token-ring-material-${token.npcId}`, scene);
        ringMaterial.disableLighting = true; ringMaterial.emissiveColor = Color3.FromHexString(EDITOR_ACCENT_HEX);
        ring.material = ringMaterial; ring.isPickable = false; transientMeshes.push(ring);
      }
    });

    // 3. District / region overlays
    // -------------------------------------------------------------------------

    (currentState.regions || [])
      .filter(
        region =>
          region.visible !== false &&
          region.points?.length >= 3 &&
          featureIntersectsBounds(region, visibleTerrainBounds)
      )
      .forEach(region => {
        transientMeshes.push(
          ...createBabylonRegionMesh(
            scene,
            region,
            currentState,
            heightSampler
          )
        );
      });


    // -------------------------------------------------------------------------
    // 4. Planned routes and clock-derived journey positions
    // -------------------------------------------------------------------------

    const drawRoute = (route, name, color) => {
      const points = (route?.path || []).filter(point => Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)));
      if (points.length < 2) return;
      const path = points.map(point => worldToBabylon(Number(point.x), Number(point.y), heightSampler(Number(point.x), Number(point.y)) + 2));
      const routeMesh = MeshBuilder.CreateTube(name, { path, radius: .45 / FEET_PER_SCENE_UNIT, tessellation: 8 }, scene);
      const routeMaterial = new StandardMaterial(`${name}-material`, scene);
      routeMaterial.emissiveColor = color;
      routeMaterial.albedoColor = color;
      routeMaterial.disableLighting = true;
      routeMesh.material = routeMaterial;
      routeMesh.isPickable = false;
      routeMesh.renderingGroupId = 3;
      transientMeshes.push(routeMesh);
    };
    const drawAccessLeg = (leg, name) => {
      if (!leg?.from || !leg?.to) return;
      drawRoute({path:[leg.from,leg.to]}, name, new Color3(.94, .94, .78));
    };
    const drawDestination = (point, name, color) => {
      if (!Number.isFinite(Number(point?.x)) || !Number.isFinite(Number(point?.y))) return;
      const marker = MeshBuilder.CreateCylinder(name, { diameter: 6 / FEET_PER_SCENE_UNIT,
        height: 8 / FEET_PER_SCENE_UNIT, tessellation: 16 }, scene);
      marker.position = worldToBabylon(Number(point.x), Number(point.y), heightSampler(Number(point.x), Number(point.y)) + 4);
      const material = new StandardMaterial(`${name}-material`, scene);
      material.emissiveColor = color;
      material.albedoColor = color;
      marker.material = material;
      marker.isPickable = !!currentState.accessPointBuildingId;
      marker.metadata = currentState.accessPointBuildingId
        ? {kind:'travel-access-handle', buildingId:currentState.accessPointBuildingId} : null;
      marker.renderingGroupId = 3;
      transientMeshes.push(marker);
    };
    drawRoute(currentState.plannedRoute, 'planned-travel-route', new Color3(.16, .78, 1));
    drawAccessLeg(currentState.plannedRoute?.origin_access_leg, 'planned-origin-access-leg');
    drawAccessLeg(currentState.plannedRoute?.destination_access_leg, 'planned-destination-access-leg');
    drawDestination(currentState.destination || currentState.plannedRoute?.destination,
      'planned-travel-destination', new Color3(.25, .92, .58));
    (currentState.journeyPositions || []).forEach(journey => {
      drawRoute(journey.route_snapshot, `active-travel-route-${journey.id}`, new Color3(.95, .63, .18));
      drawAccessLeg(journey.route_snapshot?.origin_access_leg, `active-origin-access-leg-${journey.id}`);
      drawAccessLeg(journey.route_snapshot?.destination_access_leg, `active-destination-access-leg-${journey.id}`);
      const point = journey.current_position;
      if (!Number.isFinite(Number(point?.x)) || !Number.isFinite(Number(point?.y))) return;
      const marker = MeshBuilder.CreateSphere(`travelling-group-${journey.id}`, { diameter: 5 / FEET_PER_SCENE_UNIT, segments: 12 }, scene);
      marker.position = worldToBabylon(Number(point.x), Number(point.y), heightSampler(Number(point.x), Number(point.y)) + 5);
      const markerMaterial = new StandardMaterial(`travelling-group-${journey.id}-material`, scene);
      markerMaterial.emissiveColor = new Color3(1, .72, .2);
      markerMaterial.albedoColor = new Color3(1, .72, .2);
      marker.material = markerMaterial;
      marker.isPickable = false;
      marker.renderingGroupId = 3;
      transientMeshes.push(marker);
    });

    // -------------------------------------------------------------------------
    // 5. Points of interest
    // -------------------------------------------------------------------------

    (currentState.pointsOfInterest || []).forEach(point => {
      if (
        !Number.isFinite(Number(point?.x)) ||
        !Number.isFinite(Number(point?.y))
      ) {
        return;
      }

      if (!featureIntersectsBounds(point, visibleTerrainBounds)) return;

      const x = Number(point.x);
      const y = Number(point.y);
      const surfaceElevation = heightSampler(x, y);

      const finalElevation =
        surfaceElevation +
        (Number(point.elevation) || 0) +
        7;

      const poiMesh = MeshBuilder.CreateSphere(
        `poi-${point.id}`,
        { diameter: 0.5 },
        scene
      );

      poiMesh.position = worldToBabylon(
        x,
        y,
        finalElevation
      );

      const poiMaterial = new StandardMaterial(
        `poi-mat-${point.id}`,
        scene
      );

      poiMaterial.albedoColor = new Color3(0.9, 0.77, 0.43);
      poiMaterial.emissiveColor = new Color3(0.5, 0.35, 0.12);
      poiMaterial.specularPower = 64;

      poiMesh.material = poiMaterial;

      poiMesh.metadata = {
        settlement: true,
        kind: 'poi',
        item: point
      };

      transientMeshes.push(poiMesh);
    });


    // -------------------------------------------------------------------------
    // Cleanup
    // -------------------------------------------------------------------------

    return () => {
      transientMeshes.forEach(mesh => {
        if (mesh && typeof mesh.dispose === 'function') {
          mesh.dispose(false, mesh.material !== roadPickMaterial);
        }
      });

      roadPickMaterial.dispose();

    };
  }, [
    scene,
    meshState.roads,
    meshState.fortifications,
    meshState.wallJunctions,
    meshState.regions,
    meshState.pointsOfInterest,
    meshState.partyPosition,
    meshState.destination,
    meshState.accessPointBuildingId,
    meshState.plannedRoute,
    meshState.journeyPositions,
    meshState.npcTokens,
    bounds,
    terrainWindowKey,
    state.selectedRegionId,
    state.activeTool,
    state.selectedNpcTokenId,
  ]);

  useEffect(() => () => {
    merlonBatchesRef.current.forEach(entry => entry.mesh.dispose(false, false));
    merlonBatchesRef.current.clear();
  }, [scene]);

  useEffect(() => {
    if (!scene || !worldSamplerRef.current) return undefined;

    const currentState = stateRef.current;
    const meshes = [];
    const animated = [];
    const waterBounds = terrainWindowBoundsRef.current || bounds;

    (currentState.waterBodies || []).forEach(body => {
      const mesh = createBabylonWaterMesh(
        scene,
        body,
        currentState,
        waterBounds,
        worldSamplerRef.current,
        waterNormalTextureRef.current
      );
      if (!mesh) return;

      mesh.renderingGroupId = 0;
      mesh.alphaIndex = -100;
      meshes.push(mesh);

      if (currentState.animateWater && body.water_type !== 'river' &&
        mesh.isVerticesDataPresent(VertexData.PositionKind)) {
        const originalPositions = mesh.getVerticesData(VertexData.PositionKind)?.slice();
        if (originalPositions) animated.push({ mesh, originalPositions });
      }
    });

    animatedWaterMeshesRef.current = animated;

    return () => {
      if (animatedWaterMeshesRef.current === animated) animatedWaterMeshesRef.current = [];
      meshes.forEach(mesh => {
        if (mesh.material?.bumpTexture === waterNormalTextureRef.current) {
          mesh.material.bumpTexture = null;
        }
        mesh.dispose(false, true);
      });
    };
  }, [scene, meshState.waterBodies, bounds, terrainWindowKey, meshState.animateWater]);

  useEffect(() => () => {
    buildingMeshesRef.current.forEach(entry => entry.mesh?.dispose(false, true));
    buildingMeshesRef.current.clear();
    animatedShipsRef.current = [];
  }, [scene]);

  useEffect(() => {
    if (!scene) return;

    const currentState = stateRef.current;
    const heightSampler = worldSamplerRef.current || createTerrainHeightSampler(
      currentState.strokes,
      currentState.heightMap
    );
    const visibleBounds = terrainWindowBoundsRef.current || bounds;
    const assets = Object.fromEntries(
      (currentState.assets || []).map(asset => [asset.key, asset])
    );
    const missingAsset = null;
    const previous = buildingMeshesRef.current;
    const next = new Map();
    const ships = [];

    [
      ...(currentState.buildings || []).map(building => ({ building, key: `building:${building.id}` })),
      ...(currentState.blueprintDraft?.levels?.[0]?.closed
        ? [{ building: currentState.blueprintDraft, key: 'draft' }] : [])
    ]
      .filter(({ building }) => {
        const asset = assets[building.asset_key] || missingAsset;
        return building.visible !== false && featureIntersectsBounds({
          ...building,
          width_feet: building.width_feet ?? asset?.width_feet,
          depth_feet: building.depth_feet ?? asset?.depth_feet
        }, visibleBounds);
      })
      .forEach(({ building, key }) => {
        const asset = assets[building.asset_key] || missingAsset;
        const selected = String(currentState.selected?.id) === String(building.id);
        const elevation = heightSampler(building.x, building.y);
        const old = previous.get(key);
        if (old && !old.mesh?.isDisposed?.() && old.building === building &&
          old.asset === asset && old.selected === selected &&
          old.viewMode === currentState.buildingViewMode &&
          old.businesses === currentState.businesses && old.elevation === elevation &&
          (currentState.buildingViewMode === 'satellite' || old.allBuildings === currentState.buildings)) {
          next.set(key, old);
          if (old.isShip) ships.push(old.mesh);
          return;
        }
        old?.mesh?.dispose(false, true);
        let mesh;

        if (building.is_blueprint && building.levels) {
          const displayBuilding = selected
            ? building
            : { ...building, level_view: 'all', show_roofs: true };
          mesh = createBlueprintMesh(
            scene,
            displayBuilding,
            elevation,
            heightSampler
          );
          if (currentState.buildingViewMode !== 'satellite') {
            applyBuildingMapColor(
              mesh,
              buildingViewColor(
                building,
                asset || {},
                currentState.buildingViewMode,
                currentState.businesses,
                currentState.buildings
              )
            );
          }
        } else {
          mesh = createBabylonBuiltInBuilding(
            scene,
            building,
            asset || {},
            currentState,
            heightSampler,
            assetContainerCacheRef.current
          );
        }

        const isShip = ['ship', 'boat', 'longship', 'barge', 'galleon'].includes(
          asset?.category || asset?.key
        );
        next.set(key, { mesh, building, asset, selected, elevation,
          viewMode: currentState.buildingViewMode, businesses: currentState.businesses,
          allBuildings: currentState.buildings, isShip });
        if (isShip) ships.push(mesh);
      });

    previous.forEach((entry, key) => {
      if (!next.has(key)) entry.mesh?.dispose(false, true);
    });
    buildingMeshesRef.current = next;
    animatedShipsRef.current = ships;
  }, [scene, meshState.buildings, meshState.assets, state.blueprintDraft,
    state.selected?.id, state.buildingViewMode, state.businesses, bounds, terrainWindowKey]);

  useEffect(() => {
    if (!scene) return undefined;
    const sample = worldSamplerRef.current || (() => 0);
    const rendered = createPropertyMeshes(scene, meshState.properties, sample, state.activeTool === 'build', {
      segmentId: state.selectedBoundarySegmentId,
      openingId: state.selectedBoundaryOpeningId,
    });
    const draft = state.propertyDraft || [];
    const previewMeshes = [];
    const material = new StandardMaterial('property-polygon-guide-material', scene);
    material.disableLighting = true;
    material.disableDepthWrite = true;
    material.emissiveColor = Color3.FromHexString(EDITOR_ACCENT_HEX);
    const toWorld = point => worldToBabylon(point.x, point.y, sample(point.x, point.y) + 1);
    const drawEdge = (start, end) => {
      if (Math.hypot(end.x - start.x, end.y - start.y) < 0.01) return;
      const count = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 10));
      const path = Array.from({ length: count + 1 }, (_, index) => toWorld({
        x: start.x + (end.x - start.x) * index / count,
        y: start.y + (end.y - start.y) * index / count,
      }));
      const line = MeshBuilder.CreateTube('property-polygon-preview', { path, radius: 0.6 / FEET_PER_SCENE_UNIT, tessellation: 8 }, scene);
      line.material = material;
      line.isPickable = false;
      line.renderingGroupId = 3;
      previewMeshes.push(line);
    };
    draft.forEach((point, index) => {
      if (index) drawEdge(draft[index - 1], point);
      const marker = MeshBuilder.CreateSphere(`property-corner-${index}`, { diameter: 2 / FEET_PER_SCENE_UNIT, segments: 12 }, scene);
      marker.position = toWorld(point);
      marker.material = material;
      marker.renderingGroupId = 3;
      marker.isPickable = Boolean(state.editingPropertyBoundaryId);
      marker.metadata = { kind: 'property-boundary-handle', propertyId: state.editingPropertyBoundaryId, index };
      previewMeshes.push(marker);
    });
    if (draft.length >= 3) drawEdge(draft[draft.length - 1], draft[0]);
    if (draft.length && !state.editingPropertyBoundaryId && state.blueprintHoverPoint) drawEdge(draft[draft.length - 1], state.blueprintHoverPoint);
    return () => { rendered.dispose(); previewMeshes.forEach(mesh => mesh.dispose()); material.dispose(); };
  }, [scene, meshState.properties, state.propertyDraft, state.editingPropertyBoundaryId, state.blueprintHoverPoint,
    state.activeTool, state.selectedBoundarySegmentId, state.selectedBoundaryOpeningId, terrainWindowKey]);

  useEffect(() => {
    if (!scene || !worldSamplerRef.current) return undefined;

    const currentState = stateRef.current;
    const visibleBounds = terrainWindowBoundsRef.current || bounds;
    let activeSpline = null;
    let splineType = '';

    if (currentState.activeTool === 'road' && currentState.roadMode === 'refine' &&
      currentState.selectedRoadId) {
      activeSpline = (currentState.roads || []).find(road => road.id === currentState.selectedRoadId);
      splineType = 'road-point';
    } else if (currentState.activeTool === 'fortification' &&
      currentState.fortificationMode === 'refine' && currentState.selectedFortificationId) {
      activeSpline = (currentState.fortifications || []).find(
        wall => wall.id === currentState.selectedFortificationId
      );
      splineType = 'wall-point';
    } else if (currentState.activeTool === 'region' && currentState.regionMode === 'refine' &&
      currentState.selectedRegionId) {
      activeSpline = (currentState.regions || []).find(
        region => region.id === currentState.selectedRegionId
      );
      splineType = 'region-point';
    }

    if (!activeSpline?.points) return undefined;

    const meshes = [];
    const material = new StandardMaterial(`spline-handle-material-${activeSpline.id}`, scene);
    material.disableLighting = true;
    material.emissiveColor = Color3.FromHexString(EDITOR_ACCENT_HEX);
    const ringMaterial = new StandardMaterial(`spline-ring-material-${activeSpline.id}`, scene);
    ringMaterial.disableLighting = true;
    ringMaterial.emissiveColor = new Color3(1, 0.85, 0.25);

    activeSpline.points.forEach((point, index) => {
      if (!featureIntersectsBounds(point, visibleBounds)) return;
      const groundElevation = worldSamplerRef.current(point.x, point.y);
      const isWallHandle = splineType === 'wall-point';
      const seaLevel = Number(currentState.terrainMaterial?.sea_level_feet) || 0;
      const finalElevation = isWallHandle
        ? groundElevation + (Number(activeSpline.height_feet) || 35) + 5
        : Math.max(groundElevation + 2, seaLevel + 4);
      const isTowerHandle = isWallHandle && isFortificationTowerPoint(activeSpline, index);
      const handleDiameterFeet = isTowerHandle ? 20 : 12;
      const handle = isTowerHandle
        ? MeshBuilder.CreateCylinder(`spline-handle-${activeSpline.id}-${index}`, {
          diameter: handleDiameterFeet / FEET_PER_SCENE_UNIT,
          height: 10 / FEET_PER_SCENE_UNIT,
          tessellation: 12
        }, scene)
        : MeshBuilder.CreateSphere(`spline-handle-${activeSpline.id}-${index}`, {
          diameter: handleDiameterFeet / FEET_PER_SCENE_UNIT
        }, scene);
      handle.position = worldToBabylon(point.x, point.y, finalElevation);
      handle.material = material;
      handle.isPickable = true;
      handle.renderingGroupId = 3;
      handle.metadata = {
        settlement: true,
        kind: 'spline-handle',
        type: splineType,
        id: activeSpline.id,
        index,
        item: activeSpline
      };
      meshes.push(handle);

      const selectedPointIndex = splineType === 'road-point'
        ? currentState.selectedRoadPointIndex
        : splineType === 'wall-point'
          ? currentState.selectedFortificationPointIndex
          : currentState.selectedRegionPointIndex;
      if (selectedPointIndex !== index && !(splineType === 'road-point' &&
        currentState.selectedRoadPointIndexes?.includes(index))) return;

      const ring = MeshBuilder.CreateTorus(`spline-selected-ring-${activeSpline.id}-${index}`, {
        diameter: (handleDiameterFeet + 10) / FEET_PER_SCENE_UNIT,
        thickness: 2.5 / FEET_PER_SCENE_UNIT,
        tessellation: 48
      }, scene);
      ring.position.copyFrom(handle.position);
      ring.rotation.x = Math.PI / 2;
      ring.material = ringMaterial;
      ring.isPickable = false;
      ring.renderingGroupId = 3;
      meshes.push(ring);
    });

    return () => {
      meshes.forEach(mesh => mesh.dispose());
      material.dispose();
      ringMaterial.dispose();
    };
  }, [scene, bounds, terrainWindowKey, tileStoreVersion, meshState.roads,
    meshState.fortifications, meshState.regions, state.activeTool, state.roadMode, state.fortificationMode,
    state.regionMode, state.selectedRoadId, state.selectedRoadPointIndex,
    state.selectedRoadPointIndexes,
    state.selectedFortificationId, state.selectedFortificationPointIndex,
    state.selectedRegionId, state.selectedRegionPointIndex]);

  useEffect(() => {
    if (!scene || !['inspect', 'player'].includes(state.activeTool)
      || state.inspectSelection?.entityKind !== 'building') return undefined;
    const building = meshState.buildings.find(item => String(item.id) === String(state.inspectSelection.id));
    if (!building || building.visible === false || !featureIntersectsBounds(building, terrainWindowBoundsRef.current || bounds)) {
      return undefined;
    }
    const asset = meshState.assets.find(item => item.key === building.asset_key) || {};
    const sampler = worldSamplerRef.current || createTerrainHeightSampler(state.strokes, state.heightMap);
    const outlines = createBuildingInspectOutline(scene, building, asset, sampler);
    return () => outlines.forEach(outline => outline.dispose(false, true));
  }, [scene, state.activeTool, state.inspectSelection?.entityKind, state.inspectSelection?.id,
    meshState.buildings, meshState.assets, terrainWindowKey, bounds, state.buildingViewMode,
    meshState.roads, meshState.fortifications, meshState.regions, meshState.waterBodies,
    meshState.pointsOfInterest, state.blueprintDraft, state.fortificationMode, state.businesses,
    state.selectedRoadId, state.selectedRoadPointIndex, state.selectedFortificationId,
    state.selectedFortificationPointIndex, state.selectedRegionId, state.strokes, state.heightMap]);


  // ===========================================================================
  // EFFECT 10. SEA LEVEL / GENERATED TERRAIN REFRESH
  // ===========================================================================

  useEffect(() => {
    const dt = dynamicTerrainRef.current;
    const meta = dt?._worldBufferMeta;
    const store = tileStoreRef.current;

    if (!dt || !meta || !store) return;

    setStoreDefaults(store, {
      seaLevelFeet: state.terrainMaterial?.sea_level_feet || 0
    });

    invalidateGeneratedTiles(store);

    refreshTerrainRegion(
      dt,
      worldSamplerRef.current,
      meta,
      {
        minX: meta.bounds.minX / FEET_PER_SCENE_UNIT,
        maxX: meta.bounds.maxX / FEET_PER_SCENE_UNIT,
        minY: meta.bounds.minY / FEET_PER_SCENE_UNIT,
        maxY: meta.bounds.maxY / FEET_PER_SCENE_UNIT
      }
    );
  }, [
    state.terrainMaterial?.sea_level_feet
  ]);


  return null;
}


export default function BabylonSettlementHost({
  paused = false,
  tileStore,
  tileStoreVersion,
  state,
  meshState,
  bounds,
  onCameraChange,
  onPointerLockChange,
  onScaleChange,
  onSceneReady,
  onPerformanceSample,
  onFirstFrame,
  onTerrainReady
}) {
  const tileStoreRef = useRef(tileStore);
  const canvasRef = useRef(null);
  const renderLoopRef = useRef(null);
  const pauseControlRef = useRef({ paused, resumeTerrain: null });
  pauseControlRef.current.paused = paused;
  const [scene, setScene] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const engine = new BabylonEngine(canvas, true, undefined, true);
    const nextScene = new BabylonScene(engine);

    renderLoopRef.current = () => {
      if (!nextScene.isDisposed) nextScene.render();
    };

    const resize = () => engine.resize();
    window.addEventListener('resize', resize);

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(resize);
    resizeObserver?.observe(canvas);

    setScene(nextScene);
    resize();

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      engine.stopRenderLoop();
      renderLoopRef.current = null;
      nextScene.dispose();
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    if (!scene || !renderLoopRef.current) return undefined;
    const engine = scene.getEngine();
    const renderLoop = renderLoopRef.current;
    if (paused) {
      engine.stopRenderLoop(renderLoop);
      if (document.pointerLockElement === canvasRef.current) document.exitPointerLock?.();
    } else {
      const resumeTerrain = pauseControlRef.current.resumeTerrain;
      pauseControlRef.current.resumeTerrain = null;
      resumeTerrain?.();
      engine.runRenderLoop(renderLoop);
    }
  }, [scene, paused]);

  return (
    <>
      <canvas
        ref={canvasRef}
        id="settlement-babylon-canvas"
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      {scene && (
        <SceneContent
          scene={scene}
          pauseControlRef={pauseControlRef}
          tileStore={tileStoreRef.current}
          tileStoreVersion={tileStoreVersion}
          state={state}
          meshState={meshState}
          bounds={bounds}
          onCameraChange={onCameraChange}
          onPointerLockChange={onPointerLockChange}
          onScaleChange={onScaleChange}
          onSceneReady={onSceneReady}
          onPerformanceSample={onPerformanceSample}
          onFirstFrame={onFirstFrame}
          onTerrainReady={onTerrainReady}
        />
      )}
    </>
  );
}
