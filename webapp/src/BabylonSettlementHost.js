import React, { useEffect, useState, useRef } from 'react';
import { Engine, Scene, useScene } from 'react-babylonjs';

import { Scene as BabylonScene } from '@babylonjs/core/scene';

import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scalar } from '@babylonjs/core/Maths/math.scalar';
import { Constants } from '@babylonjs/core/Engines/constants';

import { Mesh, MeshBuilder, VertexData, TransformNode, PolygonMeshBuilder } from '@babylonjs/core/Meshes';

import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';

import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';

import { PBRMaterial, StandardMaterial, DynamicTexture, RawTexture, ImageProcessingConfiguration } from '@babylonjs/core/Materials';

import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { Sound } from '@babylonjs/core/Audio/sound';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';


// ==============================================================================
// GLOBAL SHADER STORE & LIGHTING REGISTRY INJECTIONS
// ==============================================================================
import "@babylonjs/core/Materials/standardMaterial"; // Standard shading pipelines
import "@babylonjs/core/Shaders/pbr.fragment";        // GLSL Fragment shaders
import "@babylonjs/core/Shaders/pbr.vertex";          // GLSL Vertex shaders
import "@babylonjs/core/Lights/Shadows/index";        // COMPLETE light and shadow registries


import earcut from 'earcut';

// Optimized Extension & Loader Sub-Paths
import { Atmosphere } from "@babylonjs/addons/atmosphere";
import { DynamicTerrain } from './extensions/babylon.dynamicTerrain.js';

// Optimized glTF Loader target (Omits legacy v1 parsing frameworks)
import '@babylonjs/loaders/glTF/2.0/glTFLoader';

// Workspace file relative bindings
import {
  fortificationVertexData,
  oceanVertexData,
  riverVertexData,
  roadVertexData,
  worldToBabylon,
  loadTerrainMaterialFromJson,
  updateTerrainMaterialInputs,
  mergeBox,
  refreshTerrainRegion,
  buildWorldMapData,
} from './settlementBabylon';

import {
  createTerrainHeightSampler,
  FEET_PER_SCENE_UNIT,
  terrainHeightAt
} from './settlementEditor'

import {
  TILE_FEET,
  setStoreDefaults,
  invalidateGeneratedTiles,
  createWorldSampler,
  heightmapPlacementBounds,
} from './settlementTiles';

import { createSettlementBabylonWorkflow } from './settlementBabylonWorkflow';
import { calculateTerrainFog } from './terrainFog';

// Babylon's PolygonMeshBuilder looks for earcut on the global window object
if (typeof window !== 'undefined') {
  window.earcut = earcut;
}

const ROAD_COLORS = { cobblestone: '#827d72', brick: '#995d49', paved: '#777876', dirt: '#9b7650', wood: '#866447', stone: '#898982' };
const REGION_COLORS = { city: '#c79b54', forest: '#326a3f', swamp: '#4f6b59', grassland: '#78a35d', farmland: '#b59a52', pasture: '#91ad6c' };

function material(scene, name, hex, alpha = 1, useVertexColors = false) {
  const value = new PBRMaterial(name, scene);
  value.albedoColor = Color3.FromHexString(hex);
  value.metallic = 0.0;
  value.roughness = 0.95;
  value.alpha = alpha;
  value.backFaceCulling = false;
  if (useVertexColors) {
    value.useVertexColor = true; // Tells the PBR shader to expect vertex colors
    value.vertexColor = Color3.White();
  }
  return value;
}

function meshFromData(scene, name, data, meshMaterial, metadata, hasVertexColors = false, updatable = false) {
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh, updatable);
  mesh.material = meshMaterial;
  mesh.metadata = metadata;
  if (hasVertexColors) {
    mesh.useVertexColors = true; // Only enable if the VertexData actually contains colors
  }
  return mesh;
}

export function getGerstnerWaveHeightAt(x, z, timeTime) {
  const getWaveOffset = (dir, steepness, wavelength, speed) => {
    const k = 2.0 * 3.14159265 / wavelength; // Changed float to const
    const c = Math.sqrt(9.81 / k) * speed;    // Changed float to const
    const f = k * ((dir.x * x + dir.y * z) - c * timeTime); // Changed float to const
    return (steepness / k) * Math.sin(f);
  };

  // Maps identical wave wavelength configurations to the Step 1 shader code
  const h1 = getWaveOffset({ x: 1.0, y: 0.2 }, 0.18, 12.0, 1.0);
  const h2 = getWaveOffset({ x: -0.4, y: 0.9 }, 0.12, 6.0, 1.3);
  const h3 = getWaveOffset({ x: 0.2, y: -0.8 }, 0.08, 3.5, 0.8);

  return h1 + h2 + h3;
}

function waterMaterial(scene, name, hex, animate, state) {
  const value = new PBRMaterial(name, scene);

  value.albedoColor = Color3.FromHexString(hex);
  value.metallic = 0.02;
  value.roughness = 0.05;
  value.alpha = 0.85; // lets terrain show through, reads as depth

  // --- BUILD ZERO-DEPENDENCY PROCEDURAL NORMAL MAP ---
  const size = 128;
  const buffer = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = Math.cos((x / size) * Math.PI * 8.0) * 127 + 128;
      const ny = Math.sin((y / size) * Math.PI * 8.0) * 127 + 128;
      buffer[idx] = nx;
      buffer[idx + 1] = ny;
      buffer[idx + 2] = 255;
      buffer[idx + 3] = 255;
    }
  }

  const proceduralBump = RawTexture.CreateRGBATexture(
    buffer, size, size, scene,
    false, false, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE
  );
  proceduralBump.uScale = 16.0;
  proceduralBump.vScale = 16.0;
  value.bumpTexture = proceduralBump;

  if (animate) {
    const scrollObserver = scene.onBeforeRenderObservable.add(() => {
      if (state?.activeTool === 'terrain') return;
      const delta = scene.getEngine().getDeltaTime() / 1000;
      proceduralBump.uOffset += 0.012 * delta;
      proceduralBump.vOffset += 0.006 * delta;
    });

    value.onDisposeObservable.add(() => {
      scene.onBeforeRenderObservable.remove(scrollObserver);
      proceduralBump.dispose();
    });
  }

  return value;
}

function createBabylonRegionMesh(scene, region, state) {
  const points = region.points || [];
  if (!points.length) return [];

  const pointCount = points.length;
  let totalX = 0, totalY = 0;
  for (let i = 0; i < pointCount; i++) {
    totalX += points[i].x;
    totalY += points[i].y;
  }

  const centerX = totalX / Math.max(1, pointCount);
  const centerY = totalY / Math.max(1, pointCount);
  const centerElevation = terrainHeightAt(state.strokes, centerX, centerY, state.heightMap);

  // Outline setup
  const outlinePoints = [...points, points[0]].map(point =>
    worldToBabylon(point.x, point.y, terrainHeightAt(state.strokes, point.x, point.y, state.heightMap) + 2.5)
  );
  const outline = MeshBuilder.CreateLines(`region-outline-${region.id}`, { points: outlinePoints }, scene);
  outline.color = Color3.FromHexString(REGION_COLORS[region.region_type] || REGION_COLORS.grassland);
  outline.metadata = { settlement: true, kind: 'region', item: region };

  // --- REPAIRED TEXT BILLBOARD HOOKS ---
  // Upgraded label size plane dimensions so font elements are highly legible from orbit heights
  const labelPlane = MeshBuilder.CreatePlane(`region-label-${region.id}`, { width: 350 / FEET_PER_SCENE_UNIT, height: 90 / FEET_PER_SCENE_UNIT }, scene);
  labelPlane.position = worldToBabylon(centerX, centerY, centerElevation + 45.0);
  labelPlane.metadata = { settlement: true, kind: 'region', item: region };
  labelPlane.billboardMode = Mesh.BILLBOARDMODE_ALL;

  // Set crisp native canvas map buffer dimensions (1024x256)
  const dynamicTexture = new DynamicTexture(`dynamic-tex-${region.id}`, { width: 1024, height: 256 }, scene);

  // Shift to StandardMaterial to support zero-unlit emissive properties accurately
  const textMaterial = new StandardMaterial(`text-mat-${region.id}`, scene);

  // GLUE TEXTURE EXTENSIONS SMOOTHLY
  textMaterial.emissiveTexture = dynamicTexture; // Ensures visibility even during night cycles
  textMaterial.opacityTexture = dynamicTexture;  // Links the canvas transparency channel
  textMaterial.disableLighting = true;          // Prevents lights from bleaching pixels white
  textMaterial.backFaceCulling = false;

  // Clear background with fully transparent canvas string context
  const ctx = dynamicTexture.getContext();
  ctx.clearRect(0, 0, 1024, 256);

  // Render high-contrast, scalable text elements onto texture target buffer maps
  const labelText = region.name || 'Unnamed District';
  dynamicTexture.drawText(labelText, null, 150, "bold 64px sans-serif", "#ffffff", "transparent", true, true);

  labelPlane.material = textMaterial;

  return [outline, labelPlane];
}

function createBabylonWaterMesh(scene, body, state, bounds, heightSampler) {
  if (body.water_type === 'river') return meshFromData(scene, `water-${body.id}`, riverVertexData(body, state.strokes, state.heightMap, heightSampler), waterMaterial(scene, `water-material-${body.id}`, '#338ca0', state.animateWater), { settlement: true, kind: 'water', item: body });
  if (body.water_type === 'ocean') return meshFromData(scene, `water-${body.id}`, oceanVertexData(bounds, state.strokes, state.heightMap, Number(body.surface_elevation_feet) || 0, heightSampler), waterMaterial(scene, `water-material-${body.id}`, '#176b91', state.animateWater), { settlement: true, kind: 'water', item: body });
  if (!body.points?.length || body.points.length < 3) return null;
  const points = body.points.map(point => worldToBabylon(point.x, point.y, Number(body.surface_elevation_feet) || (heightSampler ? heightSampler(point.x, point.y) : terrainHeightAt(state.strokes, point.x, point.y, state.heightMap)) + .7));
  const lake = MeshBuilder.CreatePolygon(`water-${body.id}`, { shape: points }, scene);
  lake.material = waterMaterial(scene, `water-material-${body.id}`, '#338ca0', state.animateWater);
  lake.metadata = { settlement: true, kind: 'water', item: body };
  return lake;
}

function createBabylonExternalAssetModel(scene, buildingMesh, asset, building) {
  if (!asset.model_url) return;
  SceneLoader.ImportMeshAsync('', '', asset.model_url, scene).then(result => result.meshes.forEach(mesh => {
    mesh.parent = buildingMesh;
    mesh.scaling.scaleInPlace(.01);
    mesh.metadata = { settlement: true, kind: 'building', item: building };
  })).catch(() => { });
}

function createBabylonBuiltInBuilding(scene, building, asset, state) {
  const heightFeet = Number(asset.height_feet || 30), elevation = terrainHeightAt(state.strokes, building.x, building.y, state.heightMap) + Number(building.elevation || 0);
  const buildingMesh = MeshBuilder.CreateBox(`building-${building.id}`, { width: Number(building.width_feet) / FEET_PER_SCENE_UNIT, depth: Number(building.depth_feet) / FEET_PER_SCENE_UNIT, height: heightFeet / FEET_PER_SCENE_UNIT }, scene);
  buildingMesh.position = worldToBabylon(building.x, building.y, elevation + heightFeet / 2);
  buildingMesh.rotation.y = -Number(building.rotation || 0);
  buildingMesh.material = material(scene, `building-material-${building.id}`, asset.color || '#a76d43');
  buildingMesh.metadata = { settlement: true, kind: 'building', item: building };
  createBabylonExternalAssetModel(scene, buildingMesh, asset, building);
  return buildingMesh;
}

function applyBabylonCameraCommand(camera, command, bounds, strokes, heightMap, settings = {}) {
  if (!command) return;
  const center = worldToBabylon((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
  if (command.mode === 'camera' && command.camera?.position?.length === 3 && command.camera?.target?.length === 3) {
    camera.setPosition(Vector3.FromArray(command.camera.position));
    camera.setTarget(Vector3.FromArray(command.camera.target));
  } else if (command.mode === 'point'
    && Number.isFinite(Number(command.point?.x))
    && Number.isFinite(Number(command.point?.y))) {

    const px = Number(command.point.x);
    const py = Number(command.point.y);

    // Compute ground elevation so the camera doesn't clip through terrain
    const elevation = Number(command.point.elevation)
      || terrainHeightAt(strokes, px, py, heightMap);

    const target = worldToBabylon(px, py, elevation);

    // 1. Aim the camera at the target
    camera.setTarget(target);

    // 2. Pull back to a comfortable ~250 ft orbit radius
    camera.radius = Math.max(250 / FEET_PER_SCENE_UNIT, camera.lowerRadiusLimit);

    // 3. Tilt to a pleasant 45° overhead angle (beta ≈ 0.8 rad)
    camera.beta = 0.8;

    // 4. Reset any lingering inertia so the camera stops drifting
    camera.inertialAlphaOffset = 0;
    camera.inertialBetaOffset = 0;
    camera.inertialRadiusOffset = 0;
  } else if (command.mode === 'topdown') {
    camera.alpha = -Math.PI / 2;
    camera.beta = .02;
  } else if (command.mode === 'firstPerson') {
    const target = camera.target || center, worldX = target.x * FEET_PER_SCENE_UNIT, worldY = -target.z * FEET_PER_SCENE_UNIT;
    camera.setPosition(new Vector3(target.x, terrainHeightAt(strokes, worldX, worldY, heightMap) / FEET_PER_SCENE_UNIT + (Number(settings.eyeHeight) || 6) / FEET_PER_SCENE_UNIT, target.z));
    camera.radius = .4;
  }
}


function installBabylonCameraControls(scene, camera, getState, onCameraChange) {
  const keys = new Set();
  const editable = target => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
  const key = event => event.code === 'ShiftLeft' ? 'shift' : event.code === 'ControlLeft' ? 'lower' : event.key.toLowerCase();

  const down = event => { if (!editable(event.target)) keys.add(key(event)); };
  const up = event => keys.delete(key(event));

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);

  // Clear default Babylon keyboard processing completely so it doesn't fight our manual keys
  if (camera.inputs?.attached?.keyboard) {
    camera.inputs.remove(camera.inputs.attached.keyboard);
  }

  // CAMERA PRESETS: Initialize baseline tracker inside camera metadata
  if (!camera.metadata) camera.metadata = {};
  camera.metadata.lastCommandNonce = null;

  let lastPos = [0, 0, 0];
  let lastTarget = [0, 0, 0];
  const EPSILON = 0.0005;
  const hasSignificantChange = (current, last) => {
    return Math.abs(current[0] - last[0]) > EPSILON ||
      Math.abs(current[1] - last[1]) > EPSILON ||
      Math.abs(current[2] - last[2]) > EPSILON;
  };

  const observer = scene.onBeforeRenderObservable.add(() => {
    const state = getState(), delta = Math.min(scene.getEngine().getDeltaTime() / 1000, .05);
    const active = value => keys.has(value) || state.virtualKeys?.has(value);

    const command = state.viewCommand;
    if (command && command.nonce !== camera.metadata?.lastCommandNonce) {
      applyBabylonCameraCommand(camera, command, state.bounds, state.strokes, state.heightMap, state.firstPersonSettings);
      camera.metadata.lastCommandNonce = command.nonce;
    }

    if (camera.inputs?.attached?.pointers) {
      const pointersInput = camera.inputs.attached.pointers;

      // Lock camera mouse manipulation out of ALL layout modes except 'inspect'
      if (state.activeTool !== 'inspect') {
        // Blocks button 0 (left-click) from driving camera rotation / orbits
        pointersInput.buttons = [1, 2];

        // Erase lingering pointer inertia frames to prevent camera drift while drawing
        camera.inertialAlphaOffset = 0;
        camera.inertialBetaOffset = 0;
        camera.inertialRadiusOffset = 0;
        camera.panningInertia = 0;
      } else {
        // Standard full look interaction controls available exclusively in inspect mode
        pointersInput.buttons = [0, 1, 2];
      }
    }


    // 2. Process Vertical Elevation Changes (Shift / Ctrl)
    let elevationMovement = 0;
    if (active('shift')) elevationMovement += 1;
    if (active('lower')) elevationMovement -= 1;
    if (elevationMovement !== 0 && !state.firstPerson) {
      const speed = Math.max(15, camera.radius * 1.5);
      camera.target.y += elevationMovement * speed * delta;
    }

    // 3. Process Rotations & Alternating Tilts (Q / E / R / F)
    const turn = (active('e') ? 1 : 0) - (active('q') ? 1 : 0);
    const pitch = (active('r') ? 1 : 0) - (active('f') ? 1 : 0);
    camera.alpha += turn * 1.5 * delta;
    camera.beta = Math.max(.02, Math.min(1.55, camera.beta - pitch * 1.2 * delta));

    // 4. Manual Panning Matrix Loop (Independent & Smooth WASD)
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
      const baseSpeed = state.firstPerson ? (Number(state.firstPersonSettings?.walkSpeed) || 8) : Math.max(15, camera.radius * 1.8);
      camera.target.addInPlace(movement.scale(baseSpeed * delta));
    }

    if (onCameraChange) {
      const currentPos = camera.position.asArray();
      const currentTarget = camera.target.asArray();
      if (hasSignificantChange(currentPos, lastPos) || hasSignificantChange(currentTarget, lastTarget)) {
        lastPos = currentPos;
        lastTarget = currentTarget;
        onCameraChange({
          position: currentPos,
          target: currentTarget,
          radius: camera.radius,
          alpha: camera.alpha,
          beta: camera.beta,
        });
      }
    }
  });

  return () => {
    scene.onBeforeRenderObservable.remove(observer);
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
  };
}


function installBabylonFirstPersonLook(scene, camera, getState, onPointerLockChange) {
  const canvas = scene.getEngine().getRenderingCanvas();
  const move = event => {
    const state = getState();
    if (!state.firstPerson || document.pointerLockElement !== canvas) return;
    const sensitivity = Math.max(.1, Number(state.firstPersonSettings?.sensitivity) || 50) * .000044;
    camera.alpha += event.movementX * sensitivity * (state.firstPersonSettings?.invertX ? -1 : 1);
    camera.beta = Math.max(.05, Math.min(Math.PI - .05, camera.beta + event.movementY * sensitivity * (state.firstPersonSettings?.invertY ? 1 : -1)));
  };
  const lock = () => onPointerLockChange?.(document.pointerLockElement === canvas);
  document.addEventListener('mousemove', move);
  document.addEventListener('pointerlockchange', lock);
  return () => { document.removeEventListener('mousemove', move); document.removeEventListener('pointerlockchange', lock); if (document.pointerLockElement === canvas) document.exitPointerLock?.(); };
}

function installBabylonScaleObserver(scene, camera, getState, onScaleChange) {
  let previousKey = '';
  let lastRadius = -1;
  const RADIUS_EPSILON = 0.05;

  const observer = scene.onBeforeRenderObservable.add(() => {
    if (!onScaleChange) return;

    if (Math.abs(camera.radius - lastRadius) < RADIUS_EPSILON && previousKey !== '') {
      return;
    }
    lastRadius = camera.radius;

    const state = getState(), canvas = scene.getEngine().getRenderingCanvas();
    if (!canvas?.clientHeight) return;
    const visibleHeightFeet = 2 * Math.tan(camera.fov / 2) * Math.max(.02, camera.radius) * FEET_PER_SCENE_UNIT;
    const feetPerPixel = visibleHeightFeet / canvas.clientHeight;
    const desired = Math.max(.1, feetPerPixel * 110), power = 10 ** Math.floor(Math.log10(desired)), ratio = desired / power;
    const feet = (ratio < 1.5 ? 1 : ratio < 3.5 ? 2 : ratio < 7.5 ? 5 : 10) * power, pixels = feet / feetPerPixel;
    const key = `${feet}:${Math.round(pixels)}`;
    if (key !== previousKey) {
      previousKey = key;
      onScaleChange({ feet, pixels, bounds: state.bounds });
    }
  });
  return () => scene.onBeforeRenderObservable.remove(observer);
}

function createBabylonBlueprintBuilding(scene, building, state) {
  const buildingGroup = new TransformNode(`building-group-${building.id}`, scene);
  buildingGroup.position = worldToBabylon(building.x, building.y, 0);
  buildingGroup.rotation.y = -Number(building.rotation || 0);
  buildingGroup.metadata = { settlement: true, kind: 'building', item: building };

  let currentBaseElevation = terrainHeightAt(state.strokes, building.x, building.y, state.heightMap) + Number(building.elevation || 0);

  building.levels.forEach((level, levelIndex) => {
    const corners = level.corners || [];
    if (corners.length < 3) return;

    const floorHeight = level.floor_height || 10;
    const wallThickness = 1.5; // feet

    // 1. Create Floor using CreatePolygon
    const shape2D = corners.map(c => new Vector2(c.x / FEET_PER_SCENE_UNIT, c.y / FEET_PER_SCENE_UNIT));
    const floorMesh = MeshBuilder.CreatePolygon(`floor-${building.id}-${levelIndex}`, { shape: shape2D }, scene);
    floorMesh.position.y = currentBaseElevation / FEET_PER_SCENE_UNIT;
    floorMesh.material = material(scene, `floor-mat-${building.id}`, '#8b7355');
    floorMesh.parent = buildingGroup;

    // 2. Create Walls with Door/Window Holes using PolygonMeshBuilder (Earcut)
    for (let i = 0; i < corners.length - 1; i++) {
      const start = corners[i];
      const end = corners[i + 1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      if (length < 1) continue;
      const angle = Math.atan2(dy, dx);

      const wallDoors = (level.doors || []).filter(d => d.wall_index === i).map(d => ({
        type: 'door', distance: d.distance_from_start, width: d.width, height: d.height, height_from_floor: 0
      }));
      const wallWindows = (level.windows || []).filter(w => w.wall_index === i).map(w => ({
        type: 'window', distance: w.distance_from_start, width: w.width, height: w.height, height_from_floor: w.height_from_floor || 3
      }));

      const openings = [...wallDoors, ...wallWindows].sort((a, b) => a.distance - b.distance);

      // Outer shape of the wall (distance along wall, height)
      const outerShape = [
        new Vector2(0, 0),
        new Vector2(length / FEET_PER_SCENE_UNIT, 0),
        new Vector2(length / FEET_PER_SCENE_UNIT, floorHeight / FEET_PER_SCENE_UNIT),
        new Vector2(0, floorHeight / FEET_PER_SCENE_UNIT)
      ];

      // Holes for doors and windows
      const holes = openings.map(opening => [
        new Vector2((opening.distance - opening.width / 2) / FEET_PER_SCENE_UNIT, opening.height_from_floor / FEET_PER_SCENE_UNIT),
        new Vector2((opening.distance + opening.width / 2) / FEET_PER_SCENE_UNIT, opening.height_from_floor / FEET_PER_SCENE_UNIT),
        new Vector2((opening.distance + opening.width / 2) / FEET_PER_SCENE_UNIT, (opening.height_from_floor + opening.height) / FEET_PER_SCENE_UNIT),
        new Vector2((opening.distance - opening.width / 2) / FEET_PER_SCENE_UNIT, (opening.height_from_floor + opening.height) / FEET_PER_SCENE_UNIT)
      ]);

      const wallShape = [outerShape, ...holes];
      const wallBuilder = new PolygonMeshBuilder(`wall-poly-${building.id}-${levelIndex}-${i}`, wallShape, scene);
      const wallMesh = wallBuilder.build(false, wallThickness / FEET_PER_SCENE_UNIT);

      // Position and rotate the wall to match the corner segment
      const wallRoot = new TransformNode(`wall-root-${building.id}-${levelIndex}-${i}`, scene);
      wallRoot.position.x = start.x / FEET_PER_SCENE_UNIT;
      wallRoot.position.y = currentBaseElevation / FEET_PER_SCENE_UNIT;
      wallRoot.position.z = start.y / FEET_PER_SCENE_UNIT;
      wallRoot.rotation.y = -angle;
      wallRoot.parent = buildingGroup;

      wallMesh.parent = wallRoot;
      wallMesh.position.z = (wallThickness / FEET_PER_SCENE_UNIT) / 2; // Center extrusion on the line
      wallMesh.material = material(scene, `wall-mat-${building.id}`, '#a76d43');
    }

    // 3. Create Stairs (Supports 90-degree turns, going up or down)
    (level.stairs || []).forEach((stair, sIdx) => {
      const stepHeight = 0.8; // feet
      const stepDepth = 1.0; // feet
      const steps = Math.ceil(floorHeight / stepHeight);
      let currentAngle = stair.direction || 0;
      const directionMultiplier = stair.going_down ? -1 : 1;

      for (let i = 0; i < steps; i++) {
        if (stair.turns > 0 && i === Math.floor(steps / 2)) {
          currentAngle += Math.PI / 2; // 90 degree turn halfway
          stair.turns--;
        }

        const pathDistance = i * stepDepth;
        const xOffset = Math.cos(currentAngle) * pathDistance;
        const zOffset = Math.sin(currentAngle) * pathDistance;
        const yOffset = (i * stepHeight) * directionMultiplier;
        const stepCenterY = currentBaseElevation + yOffset + (stepHeight / 2) * directionMultiplier;

        const step = MeshBuilder.CreateBox(`step-${building.id}-${levelIndex}-${sIdx}-${i}`, {
          width: (stair.width || 3) / FEET_PER_SCENE_UNIT,
          height: stepHeight / FEET_PER_SCENE_UNIT,
          depth: stepDepth / FEET_PER_SCENE_UNIT
        }, scene);

        step.position.x = (stair.start_x / FEET_PER_SCENE_UNIT) + xOffset / FEET_PER_SCENE_UNIT;
        step.position.y = stepCenterY / FEET_PER_SCENE_UNIT;
        step.position.z = (stair.start_y / FEET_PER_SCENE_UNIT) + zOffset / FEET_PER_SCENE_UNIT;
        step.rotation.y = -currentAngle;
        step.parent = buildingGroup;
      }
    });

    // 4. Create Floor Hatches (with optional ladder)
    (level.hatches || []).forEach((hatch, hIdx) => {
      const hatchWidth = (hatch.width || 3) / FEET_PER_SCENE_UNIT;
      const hatchDepth = (hatch.depth || 3) / FEET_PER_SCENE_UNIT;

      const hole = MeshBuilder.CreateBox(`hatch-${building.id}-${levelIndex}-${hIdx}`, {
        width: hatchWidth, height: 0.2 / FEET_PER_SCENE_UNIT, depth: hatchDepth
      }, scene);
      hole.position.x = hatch.x / FEET_PER_SCENE_UNIT;
      hole.position.y = (currentBaseElevation - 0.1) / FEET_PER_SCENE_UNIT;
      hole.position.z = hatch.y / FEET_PER_SCENE_UNIT;
      const holeMat = new StandardMaterial(`hatch-mat-${building.id}`, scene);
      holeMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
      hole.material = holeMat;
      hole.parent = buildingGroup;

      if (hatch.has_ladder) {
        const ladder = MeshBuilder.CreateBox(`ladder-${building.id}-${levelIndex}-${hIdx}`, {
          width: hatchWidth * 0.6, height: floorHeight / FEET_PER_SCENE_UNIT, depth: 0.2 / FEET_PER_SCENE_UNIT
        }, scene);
        ladder.position.x = hatch.x / FEET_PER_SCENE_UNIT;
        ladder.position.y = (currentBaseElevation - floorHeight / 2) / FEET_PER_SCENE_UNIT;
        ladder.position.z = hatch.y / FEET_PER_SCENE_UNIT;
        ladder.material = material(scene, `ladder-mat-${building.id}`, '#5c4033');
        ladder.parent = buildingGroup;
      }
    });

    currentBaseElevation += floorHeight;
  });

  // 5. Create Simple Roof on Top Level
  const topLevel = building.levels[building.levels.length - 1];
  if (topLevel && topLevel.corners.length > 2) {
    const xs = topLevel.corners.map(c => c.x);
    const ys = topLevel.corners.map(c => c.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    const roof = MeshBuilder.CreateBox(`roof-${building.id}`, {
      width: ((maxX - minX) + 4) / FEET_PER_SCENE_UNIT,
      height: 1.5 / FEET_PER_SCENE_UNIT,
      depth: ((maxY - minY) + 4) / FEET_PER_SCENE_UNIT
    }, scene);
    roof.position.x = ((minX + maxX) / 2) / FEET_PER_SCENE_UNIT;
    roof.position.y = (currentBaseElevation + 0.75) / FEET_PER_SCENE_UNIT;
    roof.position.z = ((minY + maxY) / 2) / FEET_PER_SCENE_UNIT;
    roof.rotation.y = -Number(building.rotation || 0);
    roof.material = material(scene, `roof-mat-${building.id}`, '#513a30');
    roof.parent = buildingGroup;
  }

  return buildingGroup;
}

function SceneContent({ tileStore, tileStoreVersion, state, meshState, bounds, onCameraChange, onPointerLockChange, onScaleChange }) {
  const scene = useScene();

  scene.fogMode = BabylonScene.FOGMODE_LINEAR;

  const workflowRef = useRef(null);
  const cameraRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state; // Keep ref synced with latest prop
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const tileStoreRef = useRef(tileStore);
  tileStoreRef.current = tileStore;

  const onCameraChangeRef = useRef(onCameraChange);
  const onPointerLockChangeRef = useRef(onPointerLockChange);
  const onScaleChangeRef = useRef(onScaleChange);

  const worldSamplerRef = useRef(null);
  const dirtyRegionRef = useRef(null);
  const queuedTerrainRegionRef = useRef(null);
  const terrainRefreshFrameRef = useRef(null);
  const lastTerrainRefreshRef = useRef(0);
  const previousHeightmapBoundsRef = useRef(null);

  const dynamicTerrainRef = useRef(null);
  const terrainWindowBoundsRef = useRef(null);
  const [terrainWindowKey, setTerrainWindowKey] = useState(null);
  const terrainMaterialRef = useRef(null);
  const [isMaterialReady, setIsMaterialReady] = useState(false);

  // const samplerCacheRef = useRef({ strokes: null, heightMap: null, sampler: null });
  // const currentSystemKeyRef = useRef('none');

  useEffect(() => {
    onCameraChangeRef.current = onCameraChange;
    onPointerLockChangeRef.current = onPointerLockChange;
    onScaleChangeRef.current = onScaleChange;
  }, [onCameraChange, onPointerLockChange, onScaleChange]);

  const lightningFlashRef = useRef({ next: 0, duration: 0 });
  const fogDebugRef = useRef(null);

  // Persistent Ambient Weather Audio Hook Nodes
  const rainAudioRef = useRef(null);
  const windAudioRef = useRef(null);

  // ==============================================================================
  // EFFECT 1. MAIN SCENE SETUP (Runs ONLY when `scene` is created)
  // ==============================================================================
  useEffect(() => {
    if (!scene) return undefined;

    // Safely grab the latest bounds from the ref to avoid dependency triggers
    const currentBounds = stateRef.current.bounds || boundsRef.current;
    const center = worldToBabylon((currentBounds.minX + currentBounds.maxX) / 2, (currentBounds.minY + currentBounds.maxY) / 2);
    const span = Math.max(currentBounds.width, currentBounds.height) / FEET_PER_SCENE_UNIT;

    const camera = new ArcRotateCamera('settlement-camera', -.75, 1.05, Math.max(12, span * 1.1), center, scene);
    camera.lowerRadiusLimit = .02;
    camera.upperRadiusLimit = Math.max(600, Math.min(span * 1.5, 1600));
    camera.wheelDeltaPercentage = .015;
    camera.attachControl(scene.getEngine().getRenderingCanvas(), true);
    cameraRef.current = camera;

    const sunLight = new DirectionalLight('settlement-sun', new Vector3(0, -1, 0), scene);
    const ambientSky = new HemisphericLight('settlement-ambient', new Vector3(0, 1, 0), scene);
    const topDownKey = new DirectionalLight('tabletop-topdown-key', new Vector3(0, -1, 0), scene);

    const atmosphereSupported = Atmosphere.IsSupported(scene.getEngine());
    if (!atmosphereSupported) {
      console.warn('[Settlement] Atmosphere.IsSupported() returned false — falling back to plain lighting.');
    }
    const atmosphere = atmosphereSupported ? new Atmosphere("Atmosphere", scene, [sunLight]) : null;

    const pipeline = new DefaultRenderingPipeline("DefaultPipeline", true, scene);
    if (pipeline.isSupported) {
      pipeline.imageProcessingEnabled = true;
      pipeline.imageProcessing.ditheringEnabled = true;
      pipeline.imageProcessing.toneMappingEnabled = true;
      pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    }

    if (atmosphere) {
      atmosphere.minimumMultiScatteringIntensity = 0.1;
      atmosphere.isLinearSpaceLight = true;
    }

    ambientSky.intensity = 0.95;
    ambientSky.groundColor = new Color3(0.25, 0.25, 0.28);
    topDownKey.intensity = 0.65;
    topDownKey.diffuse = new Color3(0.95, 0.95, 1.0);

    // const sunGizmo = new LightGizmo();
    // sunGizmo.light = sunLight;
    scene.ambientColor = new Color3(0.3, 0.3, 0.35);

    rainAudioRef.current = new Sound("rain-ambient", "/media/sounds/defaults/rain_ambient.mp3", scene, null, { loop: true, autoplay: false, volume: 0 });
    windAudioRef.current = new Sound("wind-ambient", "/media/sounds/defaults/wind_ambient.mp3", scene, null, { loop: true, autoplay: false, volume: 0 });

    const unifiedSceneObserver = scene.onBeforeRenderObservable.add(() => {
      const curState = stateRef.current;
      const timeInfo = curState?.time || { hour: 12, minute: 0 };
      const safeHour = Number.isFinite(timeInfo.hour) ? timeInfo.hour : 12;
      const safeMinute = Number.isFinite(timeInfo.minute) ? timeInfo.minute : 0;
      const config = curState?.weatherSettings || { activeWeather: 'clear', cloudCover: 0, fogDensity: 0.002, fogColor: '#a9c9dc', masterVolume: 0.5 };
      const atmos = curState?.atmosphereSettings || { sunIntensity: 2.2, moonIntensity: 0.15, scatteringScale: 1.0 };
      const delta = scene.getEngine().getDeltaTime() / 1000;
      const volumeScale = config.masterVolume ?? 0.5;

      const absoluteHour = safeHour + (safeMinute / 60);
      const celestialAngle = ((absoluteHour - 6) / 24) * Math.PI * 2;
      const cosAngle = Math.cos(celestialAngle);
      const sinAngle = Math.sin(celestialAngle);

      const sunLightNode = scene.getLightByName('settlement-sun');
      if (sunLightNode) {
        sunLightNode.direction = new Vector3(cosAngle, -sinAngle, 0.2).normalize();
        if (sinAngle > 0) {
          const zenithMultiplier = sinAngle;
          const targetSunIntensity = atmos.sunIntensity ?? 2.2;
          sunLightNode.intensity = zenithMultiplier * targetSunIntensity * (1.0 - config.cloudCover * 0.45);
          sunLightNode.diffuse = Color3.Lerp(new Color3(1.0, 0.78, 0.58), new Color3(1.0, 0.98, 0.95), zenithMultiplier);
        } else {
          sunLightNode.intensity = 0.0;
        }
      }

      const terrainWindow = dynamicTerrainRef.current?._windowDebug;
      const terrainSpanFeet = terrainWindow?.spanFeet
        || Math.max(curState?.bounds?.width || 1800, curState?.bounds?.height || 1800);
      const fog = calculateTerrainFog({
        cameraRadius: camera.radius,
        spanFeet: terrainSpanFeet,
        fogDensity: config.fogDensity,
      });
      if (scene.fogMode !== BabylonScene.FOGMODE_LINEAR) scene.fogMode = BabylonScene.FOGMODE_LINEAR;
      scene.fogStart = fog.startFeet / FEET_PER_SCENE_UNIT;
      scene.fogEnd = fog.endFeet / FEET_PER_SCENE_UNIT;
      // Retain the configured value for diagnostics/compatibility even though
      // linear fog is controlled by start/end rather than exponential density.
      scene.fogDensity = config.fogDensity ?? 0.01;
      scene.fogColor = Color3.FromHexString(config.fogColor || '#a9c9dc');
      fogDebugRef.current = fog;

      if (atmosphere) {
        if (sinAngle <= 0) {
          atmosphere.rayleighScatteringScale = 0.05;
          scene.ambientColor = new Color3(0.02, 0.04, 0.08);
        } else {
          const daylightFactor = sinAngle;
          const targetScatteringScale = atmos.scatteringScale ?? 1.0;
          atmosphere.rayleighScatteringScale = (1.0 - (config.cloudCover * 0.65)) * targetScatteringScale * daylightFactor;
          scene.ambientColor = Color3.Lerp(new Color3(0.08, 0.08, 0.1), new Color3(0.35, 0.35, 0.4), daylightFactor);
        }
      }

      let targetRainVol = 0, targetWindVol = 0;
      if (config.activeWeather === 'light-drizzle') { targetRainVol = 0.25; targetWindVol = 0.1; }
      else if (config.activeWeather === 'pouring-rain') { targetRainVol = 0.75; targetWindVol = 0.3; }
      else if (config.activeWeather === 'thunderstorm') { targetRainVol = 0.95; targetWindVol = 0.5; }
      else if (config.activeWeather === 'foggy') { targetWindVol = 0.25; }
      else if (config.activeWeather === 'snowing') { targetWindVol = 0.15; }

      const applyAudioChannel = (soundNode, targetVol) => {
        if (!soundNode || !soundNode.isReady) return;
        if (targetVol > 0 && !soundNode.isPlaying) soundNode.play();
        const nextVol = Scalar.Lerp(soundNode.getVolume(), targetVol * volumeScale, 1.5 * delta);
        soundNode.setVolume(Number.isFinite(nextVol) ? nextVol : 0.0);
        if (nextVol <= 0.001 && soundNode.isPlaying) soundNode.stop();
      };

      applyAudioChannel(rainAudioRef.current, targetRainVol);
      applyAudioChannel(windAudioRef.current, targetWindVol);

      if (config.activeWeather === 'thunderstorm') {
        const now = Date.now();
        if (now > lightningFlashRef.current.next) {
          lightningFlashRef.current.duration = now + (120 + Math.random() * 200);
          lightningFlashRef.current.next = now + (6000 + Math.random() * 14000);
        }
        if (now < lightningFlashRef.current.duration) {
          if (sunLightNode) sunLightNode.intensity = 7.0;
          scene.ambientColor = new Color3(0.95, 0.95, 1.0);
        }
      }
    });

    const brushRing = MeshBuilder.CreateTorus("sculpt-brush-ring", { diameter: 2, thickness: 0.05, tessellation: 64 }, scene);
    const brushMat = new StandardMaterial("brush-ring-material", scene);
    brushMat.disableLighting = true;
    brushMat.emissiveColor = new Color3(1, 0, 0); // high contrast red for the cursor
    brushMat.backFaceCulling = false;
    brushRing.material = brushMat;
    brushRing.setEnabled(false);
    brushRing.isPickable = false;
    brushRing.renderingGroupId = 1;

    if (stateRef.current.brushMeshRef) stateRef.current.brushMeshRef.current = brushRing;

    workflowRef.current = createSettlementBabylonWorkflow(
      () => stateRef.current,
      () => stateRef.current.brushRadius
    );

    const workflowInstance = workflowRef.current;
    const unbind = workflowInstance && typeof workflowInstance.attach === 'function'
      ? workflowInstance.attach(scene)
      : () => { };

    const removeCameraControls = installBabylonCameraControls(scene, camera, () => stateRef.current, (...args) => {
      const payload = args[0] || {};
      onCameraChangeRef.current?.({
        ...payload,
        bounds: boundsRef.current,
        lodValue: dynamicTerrainRef.current?._lastDebugLOD ?? null,
        window: dynamicTerrainRef.current?._windowDebug ?? null,   // ← NEW
        fog: fogDebugRef.current,
      });
    });
    const removeFirstPersonLook = installBabylonFirstPersonLook(scene, camera, () => stateRef.current, (...args) => onPointerLockChangeRef.current?.(...args));
    const removeScaleObserver = installBabylonScaleObserver(scene, camera, () => stateRef.current, (...args) => onScaleChangeRef.current?.(...args));

    return () => {
      unbind();
      removeCameraControls();
      removeFirstPersonLook();
      removeScaleObserver();
      scene.onBeforeRenderObservable.remove(unifiedSceneObserver);
      pipeline.dispose();
      if (dynamicTerrainRef.current) {
        dynamicTerrainRef.current.dispose();
        dynamicTerrainRef.current = null;
      }
      if (atmosphere) atmosphere.dispose();
      camera.dispose();
      sunLight.dispose();
      brushRing.dispose();
      brushMat.dispose();
      if (stateRef.current.brushMeshRef) stateRef.current.brushMeshRef.current = null;
      if (rainAudioRef.current) rainAudioRef.current.dispose();
      if (windAudioRef.current) windAudioRef.current.dispose();
      scene.meshes.filter(mesh => mesh.metadata?.settlement).forEach(mesh => mesh.dispose());
    };
  }, [scene]);

  // =====================================================================================
  // EFFECT 2. LIGHTWEIGHT BOUNDS UPDATE (Safely updates camera limits without rebuilding)
  // =====================================================================================
  useEffect(() => {
    if (cameraRef.current && bounds) {
      const span = Math.max(bounds.width, bounds.height) / FEET_PER_SCENE_UNIT;
      cameraRef.current.upperRadiusLimit = Math.min(Math.max(600, span * 1.2), 1400);
    }
  }, [bounds]);

  // ========================================================================
  // EFFECT 3a: Load the JSON Material ONCE (Runs only when scene is created)
  // ========================================================================
  useEffect(() => {
    if (!scene) return;

    const loadMat = async () => {
      try {
        console.log('[Terrain] Loading NodeMaterial from JSON...');

        // 1. Grab the current state first so we can find the active reference layer
        const currentState = stateRef.current;
        const activeReferenceLayer = (currentState.referenceLayers || []).find(l => l.visible && l.image_url);

        // 2. Load the material, passing the reference layer so the texture is attached immediately
        const terrainMat = await loadTerrainMaterialFromJson(
          scene,
          '/materials/terrainMaterial.json',
          activeReferenceLayer
        );

        terrainMaterialRef.current = terrainMat;

        // 3. Apply initial inputs immediately (sea level, snow line, etc.)
        updateTerrainMaterialInputs(terrainMat, currentState.terrainMaterial, activeReferenceLayer, scene);

        setIsMaterialReady(true);
        console.log('[Terrain] NodeMaterial compiled and ready.');
      } catch (err) {
        console.error("[Terrain] Failed to load terrain material JSON:", err);
      }
    };

    loadMat();
  }, [scene]);

  // ==============================================================================
  // EFFECT 3a-2: Live Terrain Material Input Sync
  // Re-pushes sea level / snow / reference-layer uniforms whenever they change.
  // ==============================================================================
  useEffect(() => {
    const mat = terrainMaterialRef.current;
    if (!scene || !mat || !isMaterialReady) return;

    const activeReferenceLayer = (meshState.referenceLayers || []).find(
      l => l.visible && l.image_url && l.project_to_terrain !== false
    );

    // console.log('[Terrain] Syncing material inputs. Active ref layer:', activeReferenceLayer?.name || 'none');

    // This pushes the new opacity, origin, rotation, etc. to the GPU uniforms safely
    updateTerrainMaterialInputs(mat, meshState.terrainMaterial, activeReferenceLayer, scene);

  }, [scene, isMaterialReady, meshState.terrainMaterial, meshState.referenceLayers]);


  // ==============================================================================
  // EFFECT 3b: Frustum-derived, tile-aligned terrain window
  // Window extent comes from real frustum/plane trig (height above terrain,
  // beta, fov, alpha); LOD is the window's sample spacing. Both snap to
  // discrete steps so the rebuild key only changes when the view truly does.
  // ==============================================================================
  useEffect(() => {
    if (!scene || !isMaterialReady || !cameraRef.current) return undefined;
    const camera = cameraRef.current;

    const TWO_PI = Math.PI * 2;
    // ArcRotateCamera alpha never rolls over on its own - wrap it ourselves.
    const normalizeAlpha = a => ((a % TWO_PI) + TWO_PI) % TWO_PI;
    const MAX_VIEW_FEET = 24000;  // horizon cap for sub-horizon top rays
    const MAX_TILES_PER_SIDE = 4; // never stream more than 9x9 tiles
    const TARGET_CELLS = 256;     // buffer cells across the window (= terrainSub)
    const MIN_CELL_FEET = 2;      // finest LOD (street-level)
    const MAX_CELL_FEET = 128;    // coarsest LOD (continent views)

    const computeViewBox = () => {
      const alpha = normalizeAlpha(camera.alpha);
      const beta = Math.max(.02, Math.min(1.55, camera.beta));
      const groundFeet = worldSamplerRef.current
        ? worldSamplerRef.current(camera.target.x * FEET_PER_SCENE_UNIT, camera.target.z * FEET_PER_SCENE_UNIT)
        : 0;
      // Height above the TERRAIN PLANE - includes Shift/Ctrl elevation, so
      // those keys read as zoom for LOD purposes (because they are).
      const h = Math.max(1, camera.position.y * FEET_PER_SCENE_UNIT - groundFeet);

      const phi = Math.PI / 2 - beta;                  // depression of centre ray
      const epsV = camera.fov / 2;                     // vertical half-angle
      const aspect = scene.getEngine().getRenderWidth() / Math.max(1, scene.getEngine().getRenderHeight());
      const epsH = Math.atan(Math.tan(epsV) * aspect); // horizontal half-angle

      const psiNear = phi + epsV;  // bottom-of-screen ray (steepest)
      const psiFar = phi - epsV;   // top-of-screen ray (shallowest)

      let dForward = psiFar <= 0.02
        ? MAX_VIEW_FEET
        : Math.min(MAX_VIEW_FEET, h / Math.tan(Math.max(psiFar, 0.02)));
      // Steep top-down: bottom ray lands BEHIND nadir - include that square.
      let dBack = psiNear >= Math.PI / 2 ? Math.min(h * 4, h / Math.tan(Math.PI - psiNear)) : 0;
      const halfLateral = Math.tan(epsH) * Math.max(dForward, dBack, h * 0.1);

      // View-space trapezoid -> world-feet AABB, pushed along alpha.
      const fx = -Math.cos(alpha), fz = -Math.sin(alpha);  // alpha 0 = looking west
      const rx = fz, rz = -fx;                             // screen-right
      const nadirX = camera.position.x * FEET_PER_SCENE_UNIT;
      const nadirZ = camera.position.z * FEET_PER_SCENE_UNIT;
      const mid = (dForward - dBack) / 2, half = (dForward + dBack) / 2;
      const cx = nadirX + fx * mid, cz = nadirZ + fz * mid;
      const hx = Math.abs(fx) * half + Math.abs(rx) * halfLateral;
      const hz = Math.abs(fz) * half + Math.abs(rz) * halfLateral;
      return { minX: cx - hx, maxX: cx + hx, minY: cz - hz, maxY: cz + hz, dForward, h };
    };

    const planWindow = () => {
      const v = computeViewBox();
      const nadirTX = Math.floor((camera.target.x * FEET_PER_SCENE_UNIT) / TILE_FEET);
      const nadirTZ = Math.floor((camera.target.z * FEET_PER_SCENE_UNIT) / TILE_FEET);
      // Snap outward to tile grid, then clamp span around the target's tile.
      let tx0 = Math.max(nadirTX - MAX_TILES_PER_SIDE, Math.floor(v.minX / TILE_FEET));
      let tx1 = Math.min(nadirTX + MAX_TILES_PER_SIDE, Math.floor(v.maxX / TILE_FEET));
      let tz0 = Math.max(nadirTZ - MAX_TILES_PER_SIDE, Math.floor(v.minY / TILE_FEET));
      let tz1 = Math.min(nadirTZ + MAX_TILES_PER_SIDE, Math.floor(v.maxY / TILE_FEET));
      const spanXFeet = (tx1 + 1 - tx0) * TILE_FEET;
      const spanZFeet = (tz1 + 1 - tz0) * TILE_FEET;
      const spanFeet = Math.max(spanXFeet, spanZFeet);
      const cellFeet = Math.max(MIN_CELL_FEET, Math.min(MAX_CELL_FEET,
        2 ** Math.round(Math.log2(spanFeet / TARGET_CELLS))));
      return {
        key: `${tx0},${tx1},${tz0},${tz1},${cellFeet}`,
        bounds: { minX: tx0 * TILE_FEET, maxX: (tx1 + 1) * TILE_FEET, minY: tz0 * TILE_FEET, maxY: (tz1 + 1) * TILE_FEET },
        cellSize: cellFeet / FEET_PER_SCENE_UNIT,
        debug: {
          tilesX: tx1 - tx0 + 1, tilesZ: tz1 - tz0 + 1,
          cellsX: Math.round(spanXFeet / cellFeet) + 1,
          cellsZ: Math.round(spanZFeet / cellFeet) + 1,
          cellFeet, spanFeet,
          dForward: v.dForward, h: v.h,
        },
      };
    };

    const disposeCurrentTerrain = () => {
      if (dynamicTerrainRef.current) {
        dynamicTerrainRef.current.dispose();
      }
      dynamicTerrainRef.current = null;
    };

    const buildTerrainWindow = (plan) => {
      const b = plan.bounds;
      const worldSampler = createWorldSampler(
        tileStore,
        () => stateRef.current.strokes,
        () => stateRef.current.heightmapPlacement
      );
      worldSamplerRef.current = worldSampler;
      const { mapData, mapSubX, mapSubZ } = buildWorldMapData(worldSampler, b, plan.cellSize);
      disposeCurrentTerrain();
      console.log('[Terrain] Window rebuild:', plan.debug.tilesX, 'x', plan.debug.tilesZ,
        'tiles @', plan.debug.cellFeet, 'ft/cell |', mapSubX, 'x', mapSubZ, 'cells');
      const centerSU = {
        x: (b.minX + b.maxX) / 2 / FEET_PER_SCENE_UNIT,
        z: (b.minY + b.maxY) / 2 / FEET_PER_SCENE_UNIT,
      };
      const proxyPos = Vector3.Zero();
      const proxy = {
        get globalPosition() { proxyPos.copyFromFloats(centerSU.x, 0, centerSU.z); return proxyPos; }
      };
      const dt = new DynamicTerrain('terrain', { terrainSub: 256, mapData, mapSubX, mapSubZ, camera: proxy }, scene);
      dt.LODLimits = [80, 32];
      dt._worldBufferMeta = { cellSize: plan.cellSize, mapSubX, mapSubZ, bounds: b };
      dt._windowDebug = plan.debug;
      terrainWindowBoundsRef.current = b;
      setTerrainWindowKey(plan.key);
      // Buffer cellSize IS the LOD now; ribbon stride stays 0 so the 256-sub
      // ribbon maps 1:1 across the buffer. Distance-based stride falloff
      // (extension LOD) is reserved for the first-person pass.
      dt.updateCameraLOD = function () { dt._lastDebugLOD = 0; return 0; };
      dt.mesh.material = terrainMaterialRef.current;
      dt.mesh.metadata = { settlement: true, kind: 'terrain' };
      dynamicTerrainRef.current = dt;
    };

    let currentKey = null;
    const maybeRebuild = () => {
      const plan = planWindow();
      // Keep the CAMERA DEBUG overlay's live numbers (height AGL, view
      // distance) current between rebuilds, not just on rebuild frames.
      if (dynamicTerrainRef.current) dynamicTerrainRef.current._windowDebug = plan.debug;
      if (plan.key !== currentKey) { currentKey = plan.key; buildTerrainWindow(plan); }
    };
    maybeRebuild();

    // Cheap trig check a few times a second; only the rebuild is expensive.
    let acc = 0;
    const rebuildWatcher = scene.onBeforeRenderObservable.add(() => {
      acc += scene.getEngine().getDeltaTime();
      if (acc < 200) return;
      acc = 0;
      maybeRebuild();
    });

    return () => {
      scene.onBeforeRenderObservable.remove(rebuildWatcher);
      disposeCurrentTerrain();
    };
  }, [scene, isMaterialReady, tileStore]);

  // ==============================================================================
  // EFFECT 3b-2: Update Terrain Buffer when Sculpting/Heightmap changes
  // ==============================================================================
  useEffect(() => {
    const dt = dynamicTerrainRef.current;
    const meta = dt?._worldBufferMeta;
    if (!dt || !meta || !scene) return;

    const strokes = state.strokes;
    const sampler = worldSamplerRef.current;

    if (strokes?.length) {
      const last = strokes[strokes.length - 1];
      const pad = (Number(last.radius) || 100) / FEET_PER_SCENE_UNIT + meta.cellSize * 2;
      const box = {
        minX: last.x / FEET_PER_SCENE_UNIT - pad,
        maxX: last.x / FEET_PER_SCENE_UNIT + pad,
        minY: last.y / FEET_PER_SCENE_UNIT - pad,
        maxY: last.y / FEET_PER_SCENE_UNIT + pad
      };
      dirtyRegionRef.current = mergeBox(dirtyRegionRef.current, box);
      queuedTerrainRegionRef.current = mergeBox(queuedTerrainRegionRef.current, box);
      if (terrainRefreshFrameRef.current === null) {
        const refreshOnFrame = timestamp => {
          // DynamicTerrain rewrites its complete 256×256 ribbon on update.
          // Cap geometry previews near 20fps and merge all pointer events that
          // arrive between frames into one sampled region/update.
          if (timestamp - lastTerrainRefreshRef.current < 45) {
            terrainRefreshFrameRef.current = requestAnimationFrame(refreshOnFrame);
            return;
          }
          terrainRefreshFrameRef.current = null;
          lastTerrainRefreshRef.current = timestamp;
          const queued = queuedTerrainRegionRef.current;
          queuedTerrainRegionRef.current = null;
          const currentTerrain = dynamicTerrainRef.current;
          const currentMeta = currentTerrain?._worldBufferMeta;
          if (queued && currentTerrain && currentMeta && worldSamplerRef.current) {
            refreshTerrainRegion(currentTerrain, worldSamplerRef.current, currentMeta, queued);
          }
        };
        terrainRefreshFrameRef.current = requestAnimationFrame(refreshOnFrame);
      }
    } else if (dirtyRegionRef.current) {
      if (terrainRefreshFrameRef.current !== null) {
        cancelAnimationFrame(terrainRefreshFrameRef.current);
        terrainRefreshFrameRef.current = null;
      }
      queuedTerrainRegionRef.current = null;
      // Post-bake commit: strokes cleared, tiles hold new heights → refresh the accumulated area once
      refreshTerrainRegion(dt, sampler, meta, dirtyRegionRef.current);
      dirtyRegionRef.current = null;
    }
  }, [state.strokes, scene]);

  useEffect(() => () => {
    if (terrainRefreshFrameRef.current !== null) cancelAnimationFrame(terrainRefreshFrameRef.current);
  }, []);

  // A tile store is mutated in place, so its identity does not change after a
  // bake, undo, redo, or import. The explicit revision guarantees Babylon's
  // current CPU/GPU terrain window is resampled after each committed change.
  useEffect(() => {
    const dt = dynamicTerrainRef.current;
    const meta = dt?._worldBufferMeta;
    if (!dt || !meta || !worldSamplerRef.current) return;
    refreshTerrainRegion(dt, worldSamplerRef.current, meta, {
      minX: meta.bounds.minX / FEET_PER_SCENE_UNIT,
      maxX: meta.bounds.maxX / FEET_PER_SCENE_UNIT,
      minY: meta.bounds.minY / FEET_PER_SCENE_UNIT,
      maxY: meta.bounds.maxY / FEET_PER_SCENE_UNIT,
    });
  }, [tileStoreVersion, scene]);

  // Heightmap placement is a sampler overlay, not a tile mutation. Refresh
  // both the old and new footprints so dragging gives a reversible live preview.
  useEffect(() => {
    const dt = dynamicTerrainRef.current;
    const meta = dt?._worldBufferMeta;
    const nextBounds = heightmapPlacementBounds(state.heightmapPlacement);
    const refreshBounds = mergeBox(previousHeightmapBoundsRef.current, nextBounds);
    previousHeightmapBoundsRef.current = nextBounds;
    if (!dt || !meta || !refreshBounds || !worldSamplerRef.current) return;
    refreshTerrainRegion(dt, worldSamplerRef.current, meta, {
      minX: refreshBounds.minX / FEET_PER_SCENE_UNIT,
      maxX: refreshBounds.maxX / FEET_PER_SCENE_UNIT,
      minY: refreshBounds.minY / FEET_PER_SCENE_UNIT,
      maxY: refreshBounds.maxY / FEET_PER_SCENE_UNIT,
    });
  }, [state.heightmapPlacement, scene]);

  useEffect(() => {
    const placement = state.heightmapPlacement;
    if (!scene || !placement || !worldSamplerRef.current) return undefined;
    const angle = (Number(placement.rotation) || 0) * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const halfW = Math.abs(Number(placement.width_feet) || 0) / 2;
    const halfH = Math.abs(Number(placement.height_feet) || 0) / 2;
    const corners = [[-halfW, -halfH], [halfW, -halfH], [halfW, halfH], [-halfW, halfH]]
      .map(([localX, imageDown]) => {
        const x = placement.origin_x + localX * cos + imageDown * sin;
        const y = placement.origin_y + localX * sin - imageDown * cos;
        return worldToBabylon(x, y, worldSamplerRef.current(x, y) + 8);
      });
    corners.push(corners[0].clone());
    const outline = MeshBuilder.CreateLines('heightmap-placement-outline', { points: corners }, scene);
    outline.color = new Color3(1, 0.35, 0.18);
    outline.isPickable = false;
    outline.renderingGroupId = 2;
    return () => outline.dispose();
  }, [scene, state.heightmapPlacement]);

  // ==============================================================================
  // EFFECT 3c: Build Settlement Meshes (Stabilized Synchronous Commit Phase)
  // ==============================================================================
  useEffect(() => {
    if (!scene) return undefined;
    const currentState = stateRef.current;

    // Track mesh instances and event observers separately to avoid prototype TypeErrors
    const transientMeshes = [];
    const activeObservers = [];
    const heightSampler = worldSamplerRef.current
      || createTerrainHeightSampler(currentState.strokes, currentState.heightMap);

    console.log('[DEBUG] Settlement Mesh Rebuild Triggered. Total strokes:', currentState.strokes?.length || 0);

    // Cleanly flush previous meshes matching this component instance sequence
    scene.meshes
      .filter(mesh => mesh.metadata?.settlement && mesh.metadata?.kind !== 'terrain')
      .forEach(mesh => mesh.dispose());

    // 1. Render Roads Sub-Layers
    (currentState.roads || []).filter(road => road.visible !== false).forEach(road => {
      const data = roadVertexData(road, currentState.strokes, currentState.heightMap, worldSamplerRef.current);
      const mat = material(scene, `road-material-${road.id}`, ROAD_COLORS[road.surface_type] || ROAD_COLORS.cobblestone, Number(road.opacity ?? .78));
      transientMeshes.push(meshFromData(scene, `road-${road.id}`, data, mat, { settlement: true, kind: 'road', item: road }));
    });

    // 2. Render Fortifications
    (currentState.fortifications || []).filter(wall => wall.visible !== false).forEach(wall => {
      const data = fortificationVertexData(wall, currentState.strokes, currentState.heightMap, worldSamplerRef.current);
      const mat = material(scene, `wall-material-${wall.id}`, '#82786a');
      const wallMesh = meshFromData(scene, `wall-${wall.id}`, data, mat, { settlement: true, kind: 'wall', item: wall });
      transientMeshes.push(wallMesh);

      (wall.points || []).filter((_, idx) => idx === 0 || idx === (wall.points.length - 1) || idx % 2 === 0).forEach((pt, index) => {
        const base = heightSampler(pt.x, pt.y);
        const wallH = Number(wall.height_feet) || 35;
        const radiusFeet = ((Number(wall.width_feet) || 24) * 1.65) / 2;
        const tower = MeshBuilder.CreateCylinder(`tower-${wall.id}-${index}`, { diameter: (radiusFeet * 2) / FEET_PER_SCENE_UNIT, height: wallH / FEET_PER_SCENE_UNIT, tessellation: 12 }, scene);
        tower.position = worldToBabylon(pt.x, pt.y, base + wallH / 2);
        tower.material = material(scene, `tower-mat-${wall.id}-${index}`, '#756c60');
        tower.metadata = { settlement: true, kind: 'wall', item: wall };
        transientMeshes.push(tower);
      });
    });

    // 3. Districts Overlay Bounds
    (currentState.regions || []).filter(region => region.visible !== false && region.points?.length >= 3).forEach(region => {
      transientMeshes.push(...createBabylonRegionMesh(scene, region, currentState));
    });

    // 4. Water Systems & Gerstner Wave Observables
    const activeTimeTracker = { current: 0 };
    const waterBounds = terrainWindowBoundsRef.current || bounds;
    (currentState.waterBodies || []).forEach(body => {
      const waterMesh = createBabylonWaterMesh(scene, body, currentState, waterBounds, worldSamplerRef.current);
      if (!waterMesh) return;
      transientMeshes.push(waterMesh);

      if (body.water_type === 'ocean' && currentState.animateWater) {
        const vertexDataRaw = waterMesh.getVerticesData(VertexData.PositionKind);
        if (vertexDataRaw) {
          const originalPositions = Float32Array.from(vertexDataRaw);
          const waveDeformerObserver = scene.onBeforeRenderObservable.add(() => {
            if (stateRef.current?.activeTool === 'terrain') return;
            const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
            activeTimeTracker.current += deltaSeconds;
            const t = activeTimeTracker.current;
            const positions = waterMesh.getVerticesData(VertexData.PositionKind);
            if (!positions) return;
            const totalVertices = positions.length / 3;
            for (let i = 0; i < totalVertices; i++) {
              const index = i * 3;
              const baseWorldX = originalPositions[index] * FEET_PER_SCENE_UNIT;
              const baseWorldZ = originalPositions[index + 2] * FEET_PER_SCENE_UNIT;
              const waveHeightFeet = getGerstnerWaveHeightAt(baseWorldX, baseWorldZ, t);
              positions[index + 1] = (Number(body.surface_elevation_feet || 0) + waveHeightFeet) / FEET_PER_SCENE_UNIT;
            }
            waterMesh.updateVerticesData(VertexData.PositionKind, positions);
          });
          activeObservers.push(waveDeformerObserver);
        }
      }
    });

    // 5. Render Interactive Spline Control Points
    let activeSpline = null;
    let splineType = '';

    if (currentState.activeTool === 'road' && currentState.selectedRoadId) {
      activeSpline = (currentState.roads || []).find(r => r.id === currentState.selectedRoadId);
      splineType = 'road-point';
    } else if (currentState.activeTool === 'fortification' && currentState.selectedWallId) {
      activeSpline = (currentState.fortifications || []).find(w => w.id === currentState.selectedWallId);
      splineType = 'wall-point';
    } else if (currentState.activeTool === 'region' && currentState.selectedRegionId) {
      activeSpline = (currentState.regions || []).find(r => r.id === currentState.selectedRegionId);
      splineType = 'region-point';
    }

    if (activeSpline && activeSpline.points) {
      activeSpline.points.forEach((pt, index) => {
        const groundElevation = heightSampler(pt.x, pt.y);
        const finalElevation = groundElevation + 2.0;
        const handle = MeshBuilder.CreateSphere(`spline-handle-${activeSpline.id}-${index}`, { diameter: 12 / FEET_PER_SCENE_UNIT }, scene);
        handle.position = worldToBabylon(pt.x, pt.y, finalElevation);

        const handleMat = new StandardMaterial(`spline-handle-mat-${activeSpline.id}-${index}`, scene);
        handleMat.disableLighting = true;
        handleMat.emissiveColor = new Color3(1.0, 0.65, 0.0);
        handle.material = handleMat;

        handle.metadata = {
          settlement: true,
          kind: 'spline-handle',
          type: splineType,
          id: activeSpline.id,
          index: index
        };
        transientMeshes.push(handle);
      });
    }

    // 6. Buildings and Sailing Ships Tickers
    const assets = Object.fromEntries((currentState.assets || []).map(asset => [asset.key, asset]));
    const physicsObserver = scene.onBeforeRenderObservable.add(() => {
      if (currentState.activeTool === 'terrain') return;
      activeTimeTracker.current += scene.getEngine().getDeltaTime() / 1000;
    });
    activeObservers.push(physicsObserver);

    (currentState.buildings || []).filter(building => building.visible !== false).forEach(building => {
      if (building.is_blueprint && building.levels) {
        const mesh = createBabylonBlueprintBuilding(scene, building, currentState);
        transientMeshes.push(mesh);
      } else {
        const asset = assets[building.asset_key] || {};
        const mesh = createBabylonBuiltInBuilding(scene, building, asset, currentState);
        transientMeshes.push(mesh);

        if (['ship', 'boat', 'longship', 'barge', 'galleon'].includes(asset.category || asset.key)) {
          const meshTimeObserver = scene.onBeforeRenderObservable.add(() => {
            if (currentState.activeTool === 'terrain') return;
            const t = activeTimeTracker.current;
            const wH = getGerstnerWaveHeightAt(mesh.position.x, mesh.position.z, t);
            const fO = getGerstnerWaveHeightAt(mesh.position.x, mesh.position.z + 0.5, t);
            const lO = getGerstnerWaveHeightAt(mesh.position.x + 0.5, mesh.position.z, t);
            mesh.position.y = (wH / FEET_PER_SCENE_UNIT) + 0.15;
            mesh.rotation.x = (fO - wH) * 0.8;
            mesh.rotation.z = (lO - wH) * 0.8;
          });
          activeObservers.push(meshTimeObserver);
        }
      }
    });

    // 7. Render Points of Interest Markers
    (currentState.pointsOfInterest || []).forEach(point => {
      if (!Number.isFinite(Number(point?.x)) || !Number.isFinite(Number(point?.y))) return;
      const surfaceElevation = heightSampler(Number(point.x), Number(point.y));
      const finalElevation = surfaceElevation + (Number(point.elevation) || 0) + 7.0;
      const poiMesh = MeshBuilder.CreateSphere(`poi-${point.id}`, { diameter: 0.5 }, scene);
      poiMesh.position = worldToBabylon(Number(point.x), Number(point.y), finalElevation);
      const poiMaterial = new StandardMaterial(`poi-mat-${point.id}`, scene);
      poiMaterial.albedoColor = new Color3(0.9, 0.77, 0.43);
      poiMaterial.emissiveColor = new Color3(0.5, 0.35, 0.12);
      poiMaterial.specularPower = 64;
      poiMesh.material = poiMaterial;
      poiMesh.metadata = { settlement: true, kind: 'poi', item: point };
      transientMeshes.push(poiMesh);
    });

    // Explicit Cleanups during unmount or state updates
    return () => {
      transientMeshes.forEach(mesh => {
        if (mesh && typeof mesh.dispose === 'function') mesh.dispose(false, true); // also free material + textures
      });
      activeObservers.forEach(obs => {
        if (obs) scene.onBeforeRenderObservable.remove(obs);
      });
    };
  }, [
    scene,
    meshState.buildings,
    meshState.roads,
    meshState.fortifications,
    meshState.regions,
    meshState.waterBodies,
    meshState.pointsOfInterest,
    meshState.assets,
    bounds,
    terrainWindowKey,
    state.activeTool,
    state.selectedRoadId,
    state.selectedFortificationId,
    state.selectedRegionId
  ]);


  // Update ocean continuity for all tiles in the current view
  useEffect(() => {
    const dt = dynamicTerrainRef.current, meta = dt?._worldBufferMeta;
    const store = tileStoreRef.current;
    if (!dt || !meta || !store) return;
    setStoreDefaults(store, { seaLevelFeet: state.terrainMaterial?.sea_level_feet || 0 });
    invalidateGeneratedTiles(store);
    refreshTerrainRegion(dt, worldSamplerRef.current, meta, {
      minX: meta.bounds.minX / FEET_PER_SCENE_UNIT, maxX: meta.bounds.maxX / FEET_PER_SCENE_UNIT,
      minY: meta.bounds.minY / FEET_PER_SCENE_UNIT, maxY: meta.bounds.maxY / FEET_PER_SCENE_UNIT,
    });
  }, [state.terrainMaterial?.sea_level_feet]);

  return null;
}

export default function BabylonSettlementHost({ tileStore, tileStoreVersion, state, meshState, bounds, onCameraChange, onPointerLockChange, onScaleChange }) {
  const tileStoreRef = useRef(tileStore);

  return (
    <Engine
      antialias
      adaptToDeviceRatio
      canvasId="settlement-babylon-canvas">
      <Scene>
        <SceneContent
          tileStore={tileStoreRef.current}
          tileStoreVersion={tileStoreVersion}
          state={state}
          bounds={bounds}
          meshState={meshState}
          onCameraChange={onCameraChange}
          onPointerLockChange={onPointerLockChange}
          onScaleChange={onScaleChange}
        />
      </Scene>
    </Engine>
  );
}
