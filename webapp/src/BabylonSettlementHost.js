import React, { useEffect, useState, useRef } from 'react';
import { Engine, Scene, useScene } from 'react-babylonjs';

import { Scene as BabylonScene } from '@babylonjs/core/scene';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
// import { Scalar } from '@babylonjs/core/Maths/math.scalar';
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
  ImageProcessingConfiguration
} from '@babylonjs/core/Materials';

import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { Sound } from '@babylonjs/core/Audio/sound';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';


// ==============================================================================
// GLOBAL SHADER STORE & LIGHTING REGISTRY INJECTIONS
// ==============================================================================

import '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Shaders/pbr.fragment';
import '@babylonjs/core/Shaders/pbr.vertex';
import '@babylonjs/core/Lights/Shadows/index';

import earcut from 'earcut';

import { createTerrainWindow } from './terrainWindow';

import '@babylonjs/loaders/glTF/2.0/glTFLoader';

import {
  fortificationVertexData,
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
  featureIntersectsBounds,
  polylinePartsInBounds,
} from './settlementBabylon';

import {
  createTerrainHeightSampler,
  FEET_PER_SCENE_UNIT,
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
import { createBlueprintMesh } from './blueprintMesh';
import { createReferenceOverlay, createReferenceGizmo } from './referenceOverlay';
import { planTerrainView, referenceCameraFrame, terrainSampleOrder } from './terrainView';
import { EDITOR_ACCENT_HEX } from './editorAppearance';


// Babylon's PolygonMeshBuilder looks for earcut on the global window object.
if (typeof window !== 'undefined') window.earcut = earcut;


const ROAD_COLORS = {
  cobblestone: '#827d72',
  brick: '#995d49',
  paved: '#777876',
  dirt: '#9b7650',
  wood: '#866447',
  stone: '#898982'
};

const REGION_COLORS = {
  city: '#c79b54',
  forest: '#326a3f',
  swamp: '#4f6b59',
  grassland: '#78a35d',
  farmland: '#b59a52',
  pasture: '#91ad6c'
};

const DEFAULT_FIRST_PERSON_SETTINGS = {
  sensitivity: 50,
  invertX: false,
  invertY: false,
  fov: 75,
  walkSpeed: 8,
  eyeHeight: 6
};


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


export function getGerstnerWaveHeightAt(x, z, timeTime) {
  const getWaveOffset = (dir, steepness, wavelength, speed) => {
    const k = 2 * Math.PI / wavelength;
    const c = Math.sqrt(9.81 / k) * speed;
    const f = k * ((dir.x * x + dir.y * z) - c * timeTime);

    return (steepness / k) * Math.sin(f);
  };

  const h1 = getWaveOffset({ x: 1, y: 0.2 }, 0.18, 12, 1);
  const h2 = getWaveOffset({ x: -0.4, y: 0.9 }, 0.12, 6, 1.3);
  const h3 = getWaveOffset({ x: 0.2, y: -0.8 }, 0.08, 3.5, 0.8);

  return h1 + h2 + h3;
}


function waterMaterial(scene, name, hex, animate, state) {
  const value = new PBRMaterial(name, scene);

  value.albedoColor = Color3.FromHexString(hex);
  value.metallic = 0.02;
  value.roughness = 0.05;
  value.alpha = 0.85;
  value.disableDepthWrite = true;
  value.backFaceCulling = false;
  value.zOffset = 0;
  value.zOffsetUnits = 0;


  // ---------------------------------------------------------------------------
  // Procedural normal map
  // ---------------------------------------------------------------------------

  const size = 128;
  const buffer = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = Math.cos((x / size) * Math.PI * 8) * 127 + 128;
      const ny = Math.sin((y / size) * Math.PI * 8) * 127 + 128;

      buffer[idx] = nx;
      buffer[idx + 1] = ny;
      buffer[idx + 2] = 255;
      buffer[idx + 3] = 255;
    }
  }

  const proceduralBump = RawTexture.CreateRGBATexture(
    buffer,
    size,
    size,
    scene,
    false,
    false,
    Constants.TEXTURE_TRILINEAR_SAMPLINGMODE
  );

  proceduralBump.uScale = 16;
  proceduralBump.vScale = 16;
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

  let totalX = 0;
  let totalY = 0;

  for (let i = 0; i < pointCount; i++) {
    totalX += points[i].x;
    totalY += points[i].y;
  }

  const centerX = totalX / Math.max(1, pointCount);
  const centerY = totalY / Math.max(1, pointCount);
  const centerElevation = terrainHeightAt(
    state.strokes,
    centerX,
    centerY,
    state.heightMap
  );


  // ---------------------------------------------------------------------------
  // Region outline
  // ---------------------------------------------------------------------------

  const outlinePoints = [...points, points[0]].map(point =>
    worldToBabylon(
      point.x,
      point.y,
      terrainHeightAt(
        state.strokes,
        point.x,
        point.y,
        state.heightMap
      ) + 2.5
    )
  );

  const outline = MeshBuilder.CreateLines(
    `region-outline-${region.id}`,
    { points: outlinePoints },
    scene
  );

  outline.color = Color3.FromHexString(
    REGION_COLORS[region.region_type] || REGION_COLORS.grassland
  );

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

  return [outline, labelPlane];
}


function createBabylonWaterMesh(scene, body, state, bounds, heightSampler) {
  if (body.water_type === 'river') {
    return meshFromData(
      scene,
      `water-${body.id}`,
      riverVertexData(body, state.strokes, state.heightMap, heightSampler),
      waterMaterial(scene, `water-material-${body.id}`, '#338ca0', state.animateWater),
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
          waterMaterial(scene, `water-material-${body.id}`, '#176b91', state.animateWater),
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
        waterMaterial(scene, `water-material-${body.id}`, '#176b91', state.animateWater),
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
    state.animateWater
  );

  lake.metadata = {
    settlement: true,
    kind: 'water',
    item: body
  };

  return lake;
}


function createBabylonExternalAssetModel(scene, buildingMesh, asset, building) {
  if (!asset.model_url) return;

  SceneLoader.ImportMeshAsync('', '', asset.model_url, scene)
    .then(result => {
      // A streamed terrain-window change may cull the parent while the model
      // is still downloading. Do not let a late response resurrect it.
      if (buildingMesh.isDisposed()) {
        result.meshes.forEach(mesh => mesh.dispose());
        return;
      }

      result.meshes.forEach(mesh => {
        mesh.parent = buildingMesh;
        mesh.scaling.scaleInPlace(0.01);
        mesh.metadata = {
          settlement: true,
          kind: 'building',
          item: building
        };
      });
    })
    .catch(() => { });
}


function createBabylonBuiltInBuilding(scene, building, asset, state, heightSampler) {
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
  const elevation = groundElevation + Number(building.elevation || 0);

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

  createBabylonExternalAssetModel(scene, buildingMesh, asset, building);

  return buildingMesh;
}
function applyBabylonCameraCommand(
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

    camera.setPosition(
      new Vector3(
        target.x,
        (groundHeight + (Number(settings.eyeHeight) || 6)) / FEET_PER_SCENE_UNIT,
        target.z
      )
    );

    camera.radius = 0.4;
  }
}


function installBabylonCameraControls(scene, camera, getState, onCameraChange) {
  const keys = new Set();

  const editable = target =>
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable;

  const key = event =>
    event.code === 'ShiftLeft'
      ? 'shift'
      : event.code === 'ControlLeft'
        ? 'lower'
        : event.key.toLowerCase();

  const down = event => {
    if (!editable(event.target)) keys.add(key(event));
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
        pointersInput.buttons = [0, 1, 2];
      }
    }


    // -------------------------------------------------------------------------
    // Vertical elevation
    // -------------------------------------------------------------------------

    let elevationMovement = 0;

    if (active('shift')) elevationMovement += 1;
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
      0.02,
      Math.min(1.55, camera.beta - pitch * 1.2 * delta)
    );


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

      const baseSpeed = state.firstPerson
        ? Number(state.firstPersonSettings?.walkSpeed) || 8
        : settlementCameraPanSpeed(camera.radius);

      camera.target.addInPlace(movement.scale(baseSpeed * delta));
    }


    // Keep the target and camera above streamed terrain.
    const sampleHeight = state.sampleTerrainHeight;

    if (typeof sampleHeight === 'function') {
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
  tileStore,
  tileStoreVersion,
  state,
  meshState,
  bounds,
  onCameraChange,
  onPointerLockChange,
  onScaleChange,
  onSceneReady
}) {
  const scene = useScene();

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

  useEffect(() => {
    onCameraChangeRef.current = onCameraChange;
    onPointerLockChangeRef.current = onPointerLockChange;
    onScaleChangeRef.current = onScaleChange;
    onSceneReadyRef.current = onSceneReady;
  }, [
    onCameraChange,
    onPointerLockChange,
    onScaleChange,
    onSceneReady
  ]);

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
    }

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

      const atmos = curState?.atmosphereSettings || {
        sunIntensity: 2.2,
        moonIntensity: 0.15,
        scatteringScale: 1
      };

      const delta = scene.getEngine().getDeltaTime() / 1000;
      const volumeScale = config.masterVolume ?? 0.5;

      const absoluteHour = safeHour + safeMinute / 60;
      const celestialAngle = ((absoluteHour - 6) / 24) * Math.PI * 2;

      const cosAngle = Math.cos(celestialAngle);
      const sinAngle = Math.sin(celestialAngle);

      const sunLightNode = scene.getLightByName('settlement-sun');

      if (sunLightNode) {
        sunLightNode.direction = new Vector3(
          cosAngle,
          -sinAngle,
          0.2
        ).normalize();

        if (sinAngle > 0) {
          const zenithMultiplier = sinAngle;
          const targetSunIntensity = atmos.sunIntensity ?? 2.2;

          sunLightNode.intensity =
            zenithMultiplier *
            targetSunIntensity *
            (1 - config.cloudCover * 0.45);

          sunLightNode.diffuse = Color3.Lerp(
            new Color3(1, 0.78, 0.58),
            new Color3(1, 0.98, 0.95),
            zenithMultiplier
          );
        }

        else {
          sunLightNode.intensity = 0;
        }
      }


      const terrainWindow = dynamicTerrainRef.current?._windowDebug;

      const terrainSpanFeet =
        terrainWindow?.spanFeet ||
        Math.max(
          curState?.bounds?.width || 1800,
          curState?.bounds?.height || 1800
        );

      const fog = calculateTerrainFog({
        cameraRadius: camera.radius,
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

      const adjustedFogStart = Math.max(
        fog.centerDistanceFeet,
        visibleFarFeet * fogStartRatio
      );

      const adjustedFogEnd = Math.max(
        adjustedFogStart + 50,
        visibleFarFeet * fogEndRatio
      );

      if (scene.fogMode !== BabylonScene.FOGMODE_LINEAR) {
        scene.fogMode = BabylonScene.FOGMODE_LINEAR;
      }

      scene.fogStart = adjustedFogStart / FEET_PER_SCENE_UNIT;
      scene.fogEnd = adjustedFogEnd / FEET_PER_SCENE_UNIT;
      scene.fogDensity = config.fogDensity ?? 0.01;

      const fogColor = Color3.FromHexString(
        config.fogColor || '#a9c9dc'
      );

      scene.fogColor = fogColor;

      scene.clearColor = new Color4(
        fogColor.r,
        fogColor.g,
        fogColor.b,
        1
      );

      horizonFloorMaterial.diffuseColor.copyFrom(fogColor);
      horizonFloorMaterial.emissiveColor.copyFrom(fogColor);

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


      // Babylon's physical atmosphere assumes different world scale units.
      // Linear fog is more stable for the editor's feet-based terrain scale.
      if (sinAngle <= 0) {
        const moonStrength =
          Math.abs(sinAngle) *
          (Number(atmos.moonIntensity) || 0.15);

        ambientSky.intensity = 0.35 + moonStrength;
        ambientSky.diffuse = new Color3(0.45, 0.52, 0.68);
        ambientSky.groundColor = new Color3(0.12, 0.14, 0.2);
        topDownKey.intensity = 0.18 + moonStrength * 0.7;
      }

      else {
        ambientSky.intensity =
          0.85 +
          Math.max(0, sinAngle) * 0.4;

        ambientSky.diffuse = Color3.Lerp(
          new Color3(0.72, 0.67, 0.62),
          new Color3(0.92, 0.96, 1),
          Math.max(0, sinAngle)
        );

        ambientSky.groundColor = new Color3(0.25, 0.25, 0.28);
        topDownKey.intensity =
          0.45 +
          Math.max(0, sinAngle) * 0.3;
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

      topDownKey.dispose();
      ambientSky.dispose();
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

      const dt = createTerrainWindow(
        scene,
        mapData,
        mapSubX,
        mapSubZ
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

      const replacesVisibleTerrain = Boolean(
        oldTerrain &&
        !oldTerrain.mesh.isDisposed()
      );

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
        reportSceneReady();
      };

      const populate = () => {
        if (
          revision !== terrainBuildRevisionRef.current ||
          dt.mesh.isDisposed()
        ) {
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
          performance.now() - start < 10
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

      onCameraChangeRef.current?.({
        position: camera.position.asArray(),
        target: camera.target.asArray(),
        radius: camera.radius,
        alpha: camera.alpha,
        beta: camera.beta,
        bounds: boundsRef.current,
        terrainBounds: dynamicTerrainRef.current?._worldBufferMeta?.bounds ?? null,
        lodValue: dynamicTerrainRef.current?._lastDebugLOD ?? null,
        window: { ...dynamicTerrainRef.current?._windowDebug },
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
      scene.onBeforeRenderObservable.remove(rebuildWatcher);
      disposeCurrentTerrain();
    };
  }, [
    scene,
    isMaterialReady,
    tileStore
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
    if (!scene) return undefined;

    const currentState = stateRef.current;
    const transientMeshes = [];
    const activeObservers = [];

    const heightSampler =
      worldSamplerRef.current ||
      createTerrainHeightSampler(
        currentState.strokes,
        currentState.heightMap
      );

    const visibleTerrainBounds =
      terrainWindowBoundsRef.current ||
      bounds;


    // Remove previous streamed settlement features, but leave terrain intact.
    scene.meshes
      .filter(
        mesh =>
          mesh.metadata?.settlement &&
          mesh.metadata?.kind !== 'terrain'
      )
      .forEach(mesh => mesh.dispose());


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

          const mat = material(
            scene,
            `road-pick-material-${road.id}-${partIndex}`,
            ROAD_COLORS[road.surface_type] || ROAD_COLORS.cobblestone,
            0
          );

          mat.disableDepthWrite = true;

          const roadMesh = meshFromData(
            scene,
            `road-${road.id}-${partIndex}`,
            data,
            mat,
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

        polylinePartsInBounds(
          wall.points,
          visibleTerrainBounds,
          halfWidth
        ).forEach((points, partIndex) => {
          const data = fortificationVertexData(
            { ...wall, points },
            currentState.strokes,
            currentState.heightMap,
            heightSampler
          );

          const mat = material(
            scene,
            `wall-material-${wall.id}-${partIndex}`,
            '#82786a'
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
        });

        (wall.points || [])
          .filter((point, index) => (
            index === 0 ||
            index === wall.points.length - 1 ||
            index % 2 === 0
          ) && featureIntersectsBounds(point, visibleTerrainBounds))
          .forEach((point, index) => {
            const base = heightSampler(point.x, point.y);
            const wallHeight = Number(wall.height_feet) || 35;
            const radiusFeet = ((Number(wall.width_feet) || 24) * 1.65) / 2;

            const tower = MeshBuilder.CreateCylinder(
              `tower-${wall.id}-${index}`,
              {
                diameter: (radiusFeet * 2) / FEET_PER_SCENE_UNIT,
                height: wallHeight / FEET_PER_SCENE_UNIT,
                tessellation: 12
              },
              scene
            );

            tower.position = worldToBabylon(
              point.x,
              point.y,
              base + wallHeight / 2
            );

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


    // -------------------------------------------------------------------------
    // 3. District / region overlays
    // -------------------------------------------------------------------------

    (currentState.regions || [])
      .filter(
        region =>
          region.visible !== false &&
          region.points?.length >= 3
      )
      .forEach(region => {
        transientMeshes.push(
          ...createBabylonRegionMesh(
            scene,
            region,
            currentState
          )
        );
      });    // -------------------------------------------------------------------------
    // 4. Water systems
    // -------------------------------------------------------------------------

    const activeTimeTracker = { current: 0 };
    const waterBounds = terrainWindowBoundsRef.current || bounds;

    (currentState.waterBodies || []).forEach(body => {
      const waterMesh = createBabylonWaterMesh(
        scene,
        body,
        currentState,
        waterBounds,
        worldSamplerRef.current
      );

      if (!waterMesh) return;

      // Keep translucent water in the terrain group so opaque terrain renders
      // first and correctly occludes water along shorelines and mountains.
      waterMesh.renderingGroupId = 0;
      waterMesh.alphaIndex = -100;

      transientMeshes.push(waterMesh);

      if (
        currentState.animateWater &&
        body.water_type !== 'river' &&
        waterMesh.isVerticesDataPresent(VertexData.PositionKind)
      ) {
        const originalPositions = waterMesh
          .getVerticesData(VertexData.PositionKind)
          ?.slice();

        if (originalPositions) {
          const waveDeformerObserver = scene.onBeforeRenderObservable.add(() => {
            if (stateRef.current?.activeTool === 'terrain') return;

            activeTimeTracker.current += scene.getEngine().getDeltaTime() / 1000;

            const time = activeTimeTracker.current;
            const positions = waterMesh.getVerticesData(VertexData.PositionKind);

            if (!positions) return;

            const totalVertices = positions.length / 3;

            for (let i = 0; i < totalVertices; i += 1) {
              const index = i * 3;
              const baseWorldX = originalPositions[index] * FEET_PER_SCENE_UNIT;
              const baseWorldZ = originalPositions[index + 2] * FEET_PER_SCENE_UNIT;

              const waveHeightFeet = getGerstnerWaveHeightAt(
                baseWorldX,
                baseWorldZ,
                time
              );

              positions[index + 1] = animatedWaterSurfaceY(
                originalPositions[index + 1],
                waveHeightFeet
              );
            }

            waterMesh.updateVerticesData(
              VertexData.PositionKind,
              positions
            );
          });

          activeObservers.push(waveDeformerObserver);
        }
      }
    });


    // -------------------------------------------------------------------------
    // 5. Interactive spline control points
    // -------------------------------------------------------------------------

    let activeSpline = null;
    let splineType = '';

    if (
      currentState.activeTool === 'road' &&
      currentState.selectedRoadId
    ) {
      activeSpline = (currentState.roads || []).find(
        road => road.id === currentState.selectedRoadId
      );

      splineType = 'road-point';
    }

    else if (
      currentState.activeTool === 'fortification' &&
      currentState.fortificationMode === 'refine' &&
      currentState.selectedFortificationId
    ) {
      activeSpline = (currentState.fortifications || []).find(
        wall => wall.id === currentState.selectedFortificationId
      );

      splineType = 'wall-point';
    }

    else if (
      currentState.activeTool === 'region' &&
      currentState.selectedRegionId
    ) {
      activeSpline = (currentState.regions || []).find(
        region => region.id === currentState.selectedRegionId
      );

      splineType = 'region-point';
    }


    if (activeSpline?.points) {
      activeSpline.points.forEach((point, index) => {
        if (!featureIntersectsBounds(point, visibleTerrainBounds)) return;

        const groundElevation = heightSampler(point.x, point.y);
        const isWallHandle = splineType === 'wall-point';
        const seaLevel = Number(
          currentState.terrainMaterial?.sea_level_feet
        ) || 0;

        // Road and region handles remain above the water surface even when the
        // spline itself lies underwater.
        const finalElevation = isWallHandle
          ? groundElevation + (Number(activeSpline.height_feet) || 35) + 5
          : Math.max(groundElevation + 2, seaLevel + 4);

        const handleDiameterFeet = isWallHandle ? 16 : 12;

        const handle = MeshBuilder.CreateSphere(
          `spline-handle-${activeSpline.id}-${index}`,
          { diameter: handleDiameterFeet / FEET_PER_SCENE_UNIT },
          scene
        );

        handle.position = worldToBabylon(
          point.x,
          point.y,
          finalElevation
        );

        const handleMat = new StandardMaterial(
          `spline-handle-mat-${activeSpline.id}-${index}`,
          scene
        );

        handleMat.disableLighting = true;
        handleMat.emissiveColor = Color3.FromHexString(EDITOR_ACCENT_HEX);

        handle.material = handleMat;
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

        transientMeshes.push(handle);


        const selectedPointIndex =
          splineType === 'road-point'
            ? currentState.selectedRoadPointIndex
            : splineType === 'wall-point'
              ? currentState.selectedFortificationPointIndex
              : null;

        if (selectedPointIndex === index) {
          const ring = MeshBuilder.CreateTorus(
            `spline-selected-ring-${activeSpline.id}-${index}`,
            {
              diameter: (handleDiameterFeet + 10) / FEET_PER_SCENE_UNIT,
              thickness: 2.5 / FEET_PER_SCENE_UNIT,
              tessellation: 48
            },
            scene
          );

          ring.position = worldToBabylon(
            point.x,
            point.y,
            finalElevation
          );

          ring.rotation.x = Math.PI / 2;

          const ringMat = new StandardMaterial(
            `spline-selected-ring-material-${activeSpline.id}-${index}`,
            scene
          );

          ringMat.disableLighting = true;
          ringMat.emissiveColor = new Color3(1, 0.85, 0.25);

          ring.material = ringMat;
          ring.isPickable = false;
          ring.renderingGroupId = 3;

          transientMeshes.push(ring);
        }
      });
    }


    // -------------------------------------------------------------------------
    // 6. Buildings and sailing ships
    // -------------------------------------------------------------------------

    const assets = Object.fromEntries(
      (currentState.assets || []).map(asset => [asset.key, asset])
    );

    const physicsObserver = scene.onBeforeRenderObservable.add(() => {
      if (stateRef.current?.activeTool === 'terrain') return;
      activeTimeTracker.current += scene.getEngine().getDeltaTime() / 1000;
    });

    activeObservers.push(physicsObserver);

    [
      ...(currentState.buildings || []),
      ...(currentState.blueprintDraft ? [currentState.blueprintDraft] : [])
    ]
      .filter(building => {
        const asset = assets[building.asset_key] || {};

        return (
          building.visible !== false &&
          featureIntersectsBounds(
            {
              ...building,
              width_feet: building.width_feet ?? asset.width_feet,
              depth_feet: building.depth_feet ?? asset.depth_feet
            },
            visibleTerrainBounds
          )
        );
      })
      .forEach(building => {
        if (building.is_blueprint && building.levels) {
          const mesh = createBlueprintMesh(
            scene,
            building,
            heightSampler(building.x, building.y)
          );

          transientMeshes.push(mesh);
          return;
        }

        const asset = assets[building.asset_key] || {};

        const mesh = createBabylonBuiltInBuilding(
          scene,
          building,
          asset,
          currentState,
          heightSampler
        );

        transientMeshes.push(mesh);

        if (
          ['ship', 'boat', 'longship', 'barge', 'galleon'].includes(
            asset.category || asset.key
          )
        ) {
          const meshTimeObserver = scene.onBeforeRenderObservable.add(() => {
            if (stateRef.current?.activeTool === 'terrain') return;

            const time = activeTimeTracker.current;

            const waveHeight = getGerstnerWaveHeightAt(
              mesh.position.x,
              mesh.position.z,
              time
            );

            const forwardOffset = getGerstnerWaveHeightAt(
              mesh.position.x,
              mesh.position.z + 0.5,
              time
            );

            const lateralOffset = getGerstnerWaveHeightAt(
              mesh.position.x + 0.5,
              mesh.position.z,
              time
            );

            mesh.position.y = waveHeight / FEET_PER_SCENE_UNIT + 0.15;
            mesh.rotation.x = (forwardOffset - waveHeight) * 0.8;
            mesh.rotation.z = (lateralOffset - waveHeight) * 0.8;
          });

          activeObservers.push(meshTimeObserver);
        }
      });


    // -------------------------------------------------------------------------
    // 7. Points of interest
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
          mesh.dispose(false, true);
        }
      });

      activeObservers.forEach(observer => {
        if (observer) scene.onBeforeRenderObservable.remove(observer);
      });
    };
  }, [
    scene,
    meshState.buildings,
    state.blueprintDraft,
    meshState.roads,
    meshState.fortifications,
    meshState.regions,
    meshState.waterBodies,
    meshState.pointsOfInterest,
    meshState.assets,
    bounds,
    terrainWindowKey,
    state.activeTool,
    state.fortificationMode,
    state.selectedRoadId,
    state.selectedRoadPointIndex,
    state.selectedFortificationId,
    state.selectedFortificationPointIndex,
    state.selectedRegionId
  ]);


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
  tileStore,
  tileStoreVersion,
  state,
  meshState,
  bounds,
  onCameraChange,
  onPointerLockChange,
  onScaleChange,
  onSceneReady
}) {
  const tileStoreRef = useRef(tileStore);

  return (
    <Engine
      antialias
      adaptToDeviceRatio
      canvasId="settlement-babylon-canvas"
    >
      <Scene>
        <SceneContent
          tileStore={tileStoreRef.current}
          tileStoreVersion={tileStoreVersion}
          state={state}
          meshState={meshState}
          bounds={bounds}
          onCameraChange={onCameraChange}
          onPointerLockChange={onPointerLockChange}
          onScaleChange={onScaleChange}
          onSceneReady={onSceneReady}
        />
      </Scene>
    </Engine>
  );
}