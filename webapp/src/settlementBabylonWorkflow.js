import { PointerEventTypes } from '@babylonjs/core';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import {
  FEET_PER_SCENE_UNIT,
  createBuilding,
  resizeBuildingFromCorner,
  snapBuildingPlacement,
  snapRegionBoundaryPoint,
  snapRoadNetworkPoint,
  snapRoadSplineTranslation,
  snapFortificationNetworkPoint,
  roadSegmentIndexAt,
  referenceLayerUv,
  terrainHeightAt,
  createBlueprintBuilding,
  generateDefaultFloorplan
} from './settlementEditor';

import { drawSceneFootprint } from './sceneFootprint';
import { babylonToWorld, pointInsideRegion } from './settlementBabylon';
import { transformReferenceFromGizmo } from './referencePlacement';
import { appendTracedBoundaryPoint, nearestSplinePoint } from './settlementRegionLinks';
import { snapRegionToNetworkNodes } from './regionPresentation';


function findDistrictKey(point, regions) {
  const region = (regions || []).find(
    value =>
      value.visible !== false &&
      pointInsideRegion(point.x, point.y, value)
  );

  return region?.district_key || region?.id || null;
}


function updatePoint(setter, id, index, point, round = false) {
  setter(values =>
    values.map(value =>
      value.id === id
        ? {
          ...value,
          points: value.points.map((current, pointIndex) =>
            pointIndex === index
              ? {
                ...current,
                x: round ? Math.round(point.x) : point.x,
                y: round ? Math.round(point.y) : point.y,
              }
              : current
          ),
        }
        : value
    )
  );
}


export function createSettlementBabylonWorkflow(getState, getLatestBrushRadius) {
  let interaction = null;

  let previousSculptPoint = null;
  let flattenTarget = null;
  let sculptGestureId = null;

  let heightmapDragOffset = null;
  let referenceDrag = null;


  // ---------------------------------------------------------------------------
  // INTERACTION TRACKING
  // ---------------------------------------------------------------------------

  const interactionInstance = {
    beginPointDrag(type, id, index, corner) {
      interaction = {
        type,
        id,
        index,
        corner,
        undoRecorded: false
      };
    }
  };


  const beginSplineMove = (type, item, point) => {
    if (!item?.points?.length) return;

    interaction = {
      type,
      id: item.id,
      start: point,
      points: item.points.map(value => ({ ...value })),
      undoRecorded: false
    };
  };


  /**
  * Feature edits must follow the terrain beneath the mouse rather than the
  * currently rendered feature mesh.
   *
   * Without this, Babylon can keep returning the mesh being dragged as the
   * nearest pick target, making Refine and Move appear to do nothing.
   */
  const interactionUsesTerrainDrag = () => {
    if (!interaction) return false;

    return (
      interaction.type === 'building' ||
      interaction.type === 'property-boundary-point' ||
      interaction.type === 'road-point' ||
      interaction.type === 'road-points' ||
      interaction.type === 'road-segments' ||
      interaction.type === 'wall-point' ||
      interaction.type === 'region-point' ||
      interaction.type === 'road-spline' ||
      interaction.type === 'wall-spline' ||
      interaction.type === 'region-spline'
    );
  };


  const pickTerrain = scene => {
    if (!scene) return null;

    const terrainPick = scene.pick(
      scene.pointerX,
      scene.pointerY,
      mesh =>
        mesh?.isEnabled?.() !== false &&
        (
          mesh?.metadata?.kind === 'terrain' ||
          mesh?.name === 'terrain'
        )
    );

    return terrainPick?.hit ? terrainPick : null;
  };


  // ---------------------------------------------------------------------------
  // ADD / DRAW FEATURES
  // ---------------------------------------------------------------------------

  const addTerrainPoint = point => {
    const state = getState();


    // -------------------------------------------------------------------------
    // Building editing / placement
    // -------------------------------------------------------------------------

    if (state.activeTool === 'build') {
      if (state.buildMode === 'edit-property-boundary') return;
      if (['draw-property-boundary', 'draw-outdoor-area'].includes(state.buildMode)) {
        state.onPropertyPolygonPoint?.(point);
        return;
      }
      // Refine/select modes operate on existing structures and must not create
      // another building when the ground is clicked.
      if (state.buildMode === 'refine' || state.buildMode === 'select-placed') {
        return;
      }

      if (state.buildMode === 'move-selected') {
        if (!state.selected) return;
        const moved = { ...state.selected, x: point.x, y: point.y };
        state.setBuildings(values => values.map(building =>
          building.id === moved.id ? { ...building, x: moved.x, y: moved.y } : building));
        state.setSelected(moved);
        state.setBuildMode?.('select-placed');
        return;
      }


      // Blueprint drafting
      if (state.buildMode === 'draw-blueprint') {
        if (state.blueprintDraft?.levels?.[0]?.closed) return;
        if (!state.blueprintDraft) {
          const newBuilding = createBlueprintBuilding(point);

          state.setFootprintError?.('');
          state.setFootprintPoints?.(state.footprintTool === 'circle' ? [{ x: 0, y: 0 }] : []);
          state.setBlueprintDraft(newBuilding);
          state.setSelected(newBuilding);
        } else {
          const result = drawSceneFootprint(state.blueprintDraft, state.footprintTool || 'line', state.footprintPoints || [], point);
          const updated = result.building;
          state.setFootprintPoints?.(result.points);
          state.setFootprintError?.(result.error || '');

          state.setBlueprintDraft(updated);
          state.setSelected(updated);
        }

        return;
      }


      // Default asset placement
      const asset = state.assets.find(value => value.key === state.selectedAssetKey);
      if (!asset) return;

      const baseBuilding = createBuilding(
        asset,
        point,
        state.buildings,
        state.roads
      );

      const districtKey = findDistrictKey(point, state.regions);

      // Generate a default floorplan so the structure is routed through the
      // blueprint renderer and receives hollow walls / doors / windows.
      const floorplan = generateDefaultFloorplan(
        asset,
        {
          x: baseBuilding.x,
          y: baseBuilding.y
        }
      );

      const nextBuilding = {
        ...baseBuilding,
        district_key: districtKey || baseBuilding.district_key,
        is_blueprint: true,
        levels: [floorplan]
      };

      state.setBuildings(values => [...values, nextBuilding]);
      state.setSelected(nextBuilding);
    }


    // -------------------------------------------------------------------------
    // Road drafting
    // -------------------------------------------------------------------------

    else if (state.activeTool === 'road' && state.roadMode === 'draw-new') {
      const snapped = state.roadSnapEnabled
        ? nearestSplinePoint(point, state.roads, [], state.roadSnapToleranceFeet, point._source?.kind === 'road' ? point._source : null)
        : null;
      state.setRoadDraft(values => [
        ...values,
        { x: snapped?.x ?? Math.round(point.x), y: snapped?.y ?? Math.round(point.y),
          width_feet: state.roadWidth }
      ]);
    }


    // -------------------------------------------------------------------------
    // Fortification drafting
    // -------------------------------------------------------------------------

    else if (
      state.activeTool === 'fortification' &&
      state.fortificationMode === 'draw-new'
    ) {
      const snapped = state.wallSnapEnabled
        ? snapFortificationNetworkPoint(point, state.fortifications, {
          tolerance: state.roadSnapToleranceFeet
        })
        : point;
      state.setFortificationDraft(values => [
        ...values,
        {
          x: Math.round(snapped.x),
          y: Math.round(snapped.y),
          tower: state.fortificationPointRole === 'tower'
        }
      ]);
    }


    // -------------------------------------------------------------------------
    // Water editing
    // -------------------------------------------------------------------------

    else if (state.activeTool === 'water' && state.seaLevelPicking) {
      state.onSeaLevelPick(point.elevation);
    }

    else if (state.activeTool === 'water') {
      state.setWaterDraft(values => [
        ...values,
        {
          x: Math.round(point.x),
          y: Math.round(point.y)
        }
      ]);
    }


    // -------------------------------------------------------------------------
    // Region drafting
    // -------------------------------------------------------------------------

    else if (state.activeTool === 'region' && state.regionMode === 'trace') {
      state.setRegionDraft(values => appendTracedBoundaryPoint(values, point,
        state.roads, state.fortifications, state.roadSnapToleranceFeet));
    }

    else if (state.activeTool === 'region' && state.regionMode === 'draw-new') {
      state.setRegionDraft(values => {
        const targets = values.length > 2
          ? [
            ...state.regions,
            {
              id: 'region-draft-start',
              points: [values[0]]
            }
          ]
          : state.regions;

        const spline = nearestSplinePoint(point, state.roads, state.fortifications,
          state.roadSnapToleranceFeet, point._source);
        return [
          ...values,
          spline ? { x: spline.x, y: spline.y } : snapRegionBoundaryPoint(
            point,
            targets,
            [],
            {
              fortifications: []
            }
          )
        ];
      });
    }


    else if (state.activeTool === 'travel') {
      state.onWaypoint(point);
    }

    else if (state.activeTool === 'reference') {
      state.onReferencePoint(point);
    }

    else if (state.activeTool === 'inspect') {
      state.setSelected(null);
    }
  };


  // ---------------------------------------------------------------------------
  // TERRAIN SCULPTING
  // ---------------------------------------------------------------------------

  const sculpt = point => {
    const state = getState();

    // Do not emit more sculpt samples than the current terrain LOD can show.
    // This keeps zoomed-out gestures from accumulating hundreds of visually
    // indistinguishable strokes while retaining fine control up close.
    const minDistance = Math.max(
      3,
      state.brushRadius * 0.08,
      (Number(state.terrainCellFeet) || 0) * 0.5
    );

    if (
      previousSculptPoint &&
      Math.hypot(
        point.x - previousSculptPoint.x,
        point.y - previousSculptPoint.y
      ) < minDistance
    ) {
      return;
    }

    previousSculptPoint = point;

    const stroke = {
      id: `stroke-${Date.now()}`,
      gesture_id: sculptGestureId,
      x: point.x,
      y: point.y,
      radius: state.brushRadius,
      mode: state.terrainMode,

      ...(
        state.terrainMode === 'raise' ||
          state.terrainMode === 'lower'
          ? {
            strength:
              state.terrainMode === 'raise'
                ? state.brushStrength
                : -state.brushStrength
          }
          : {
            target_elevation_feet: flattenTarget ?? point.elevation,
            strength: Math.max(
              0.01,
              Math.min(1, state.brushStrength / 100)
            )
          }
      )
    };

    state.onSculptStroke(stroke);
  };


  // ---------------------------------------------------------------------------
  // DRAG EXISTING FEATURES
  // ---------------------------------------------------------------------------

  const applyDrag = point => {
    if (!interaction) return;

    const state = getState();
    if (interaction.type === 'property-boundary-point') {
      state.onPropertyBoundaryVertexMove?.(interaction.index, point);
      return;
    }

    // Record one snapshot at the beginning of a road/wall drag. This is lazy,
    // so simply selecting a control point does not create an undo entry.
    if (!interaction.undoRecorded) {
      if (
        interaction.type === 'road-point' ||
        interaction.type === 'road-points' ||
        interaction.type === 'road-segments' ||
        interaction.type === 'road-spline'
      ) {
        state.recordSplineUndo?.(
          'road',
          (state.roads || []).find(value => value.id === interaction.id)
        );

        interaction.undoRecorded = true;
      }

      else if (
        interaction.type === 'wall-point' ||
        interaction.type === 'wall-spline'
      ) {
        state.recordSplineUndo?.(
          'wall',
          (state.fortifications || []).find(value => value.id === interaction.id)
        );

        interaction.undoRecorded = true;
      }
    }


    // -------------------------------------------------------------------------
    // Buildings
    // -------------------------------------------------------------------------

    if (interaction.type === 'building') {
      const buildingId = interaction.id;
      state.setBuildings(values =>
        values.map(building =>
          building.id === buildingId
            ? snapBuildingPlacement(
              {
                ...building,
                x: point.x,
                y: point.y
              },
              state.buildings,
              state.roads
            )
            : building
        )
      );
    }

    else if (interaction.type === 'building-resize') {
      state.setBuildings(values =>
        values.map(building =>
          building.id === interaction.id
            ? resizeBuildingFromCorner(
              building,
              point,
              interaction.corner,
              state.roads
            )
            : building
        )
      );
    }


    // -------------------------------------------------------------------------
    // Individual road point
    // -------------------------------------------------------------------------

    else if (interaction.type === 'road-point') {
      const nextPoint = state.roadSnapEnabled
        ? snapRoadNetworkPoint(
          point,
          state.roads,
          {
            roadId: interaction.id,
            tolerance: state.roadSnapToleranceFeet
          }
        )
        : {
          x: Math.round(point.x),
          y: Math.round(point.y)
        };

      updatePoint(
        state.setRoads,
        interaction.id,
        interaction.index,
        nextPoint
      );
    }

    else if (interaction.type === 'road-points') {
      let dx = Math.round(point.x - interaction.start.x);
      let dy = Math.round(point.y - interaction.start.y);
      if (state.roadSnapEnabled) {
        const anchor = interaction.points[interaction.index];
        const snapped = snapRoadNetworkPoint({ x: anchor.x + dx, y: anchor.y + dy },
          state.roads, { roadId: interaction.id, tolerance: state.roadSnapToleranceFeet });
        dx += snapped.x - (anchor.x + dx);
        dy += snapped.y - (anchor.y + dy);
      }
      const selected = new Set(interaction.pointIndexes);
      state.setRoads(values => values.map(road => road.id !== interaction.id ? road : {
        ...road,
        points: interaction.points.map((original, index) => selected.has(index)
          ? { ...original, x: original.x + dx, y: original.y + dy }
          : original)
      }));
    }

    else if (interaction.type === 'road-segments') {
      const dx = Math.round(point.x - interaction.start.x);
      const dy = Math.round(point.y - interaction.start.y);
      const pointIndexes = new Set(interaction.segmentIndexes.flatMap(index => [index, index + 1]));
      state.setRoads(values => values.map(road => road.id !== interaction.id ? road : {
        ...road,
        points: interaction.points.map((original, index) => pointIndexes.has(index)
          ? { ...original, x: original.x + dx, y: original.y + dy }
          : original)
      }));
    }


    // -------------------------------------------------------------------------
    // Individual wall point
    // -------------------------------------------------------------------------

    else if (interaction.type === 'wall-point') {
      const wallPoint = state.fortifications?.find(wall => wall.id === interaction.id)?.points?.[interaction.index];
      const nextPoint = state.wallSnapEnabled && !wallPoint?.junction_id
        ? snapFortificationNetworkPoint(point, state.fortifications, {
          wallId: interaction.id,
          tolerance: state.roadSnapToleranceFeet
        })
        : point;
      state.moveWallPoint?.(interaction.id, interaction.index, nextPoint);
    }


    // -------------------------------------------------------------------------
    // Individual region point
    // -------------------------------------------------------------------------

    else if (interaction.type === 'region-point') {
      const { id, index: pointIndex } = interaction;
      const nextPoint = state.regionSnapEnabled
        ? snapRegionToNetworkNodes(point, state.roads, state.fortifications, state.roadSnapToleranceFeet)
        : { x: Math.round(point.x), y: Math.round(point.y) };
      state.setRegions(values =>
        values.map(region =>
          region?.id === id
            ? {
              ...region,
              points: region.points.map((value, index) =>
                index === pointIndex
                  ? { ...value, ...nextPoint }
                  : value
              )
            }
            : region
        )
      );
    }
    // -------------------------------------------------------------------------
    // Translate an entire spline
    // -------------------------------------------------------------------------

    else if (interaction.type.endsWith('-spline')) {
      const interactionId = interaction.id;
      const dx = Math.round(point.x - interaction.start.x);
      const dy = Math.round(point.y - interaction.start.y);

      const translated = interaction.points.map(value => ({
        ...value,
        x: value.x + dx,
        y: value.y + dy
      }));

      if (interaction.type === 'road-spline') {
        state.setRoads(values =>
          values.map(road =>
            road.id === interactionId
              ? {
                ...road,
                points: state.roadSnapEnabled
                  ? snapRoadSplineTranslation(
                    translated,
                    values,
                    {
                      roadId: interactionId,
                      tolerance: state.roadSnapToleranceFeet
                    }
                  )
                  : translated
              }
              : road
          )
        );
      }

      else if (interaction.type === 'wall-spline') {
        state.setFortifications(values =>
          values.map(wall =>
            wall.id === interactionId
              ? {
                ...wall,
                points: translated
              }
              : wall
          )
        );
      }

      else if (interaction.type === 'region-spline') {
        state.setRegions(values =>
          values.map(region =>
            region.id === interactionId
              ? {
                ...region,
                points: translated
              }
              : region
          )
        );
      }
    }
  };


  // ---------------------------------------------------------------------------
  // SELECT SCENE MESH
  // ---------------------------------------------------------------------------

  const selectMesh = (metadata, point, event) => {
    const state = getState();
    if (metadata?.kind === 'property-boundary-handle' && event.button === 0 &&
        state.buildMode === 'edit-property-boundary' && metadata.propertyId === state.editingPropertyBoundaryId) {
      interactionInstance.beginPointDrag('property-boundary-point', metadata.propertyId, metadata.index);
      return true;
    }
    const isBuilding = metadata?.kind === 'building' || metadata?.kind === 'building-roof';
    const item = isBuilding
      ? state.buildings?.find(building => String(building.id) === String(metadata.item?.id)) || metadata?.item
      : metadata?.item;


    // -------------------------------------------------------------------------
    // Spline control point
    // -------------------------------------------------------------------------

    if (metadata?.kind === 'spline-handle' && event.button === 0) {
      const allowed =
        (
          metadata.type === 'road-point' &&
          state.activeTool === 'road' &&
          state.roadMode === 'refine'
        ) ||
        (
          metadata.type === 'wall-point' &&
          state.activeTool === 'fortification' &&
          state.fortificationMode === 'refine'
        ) ||
        (
          metadata.type === 'region-point' &&
          state.activeTool === 'region' &&
          state.regionMode === 'refine'
        );

      if (!allowed) return false;

      // Keep the selected scene handle synchronized with the side panel.
      if (metadata.type === 'road-point') {
        const current = state.selectedRoadId === metadata.id
          ? state.selectedRoadPointIndexes || [] : [];
        const next = event.shiftKey
          ? (current.includes(metadata.index)
            ? current.filter(index => index !== metadata.index)
            : [...current, metadata.index])
          : current.length > 1 && current.includes(metadata.index)
            ? current : [metadata.index];
        state.setSelectedRoadId?.(metadata.id);
        state.setSelectedRoadPointIndexes?.(next);
        state.setSelectedRoadPointIndex?.(next.length === 1 ? next[0] : null);
        if (!event.shiftKey && next.length > 1) {
          interaction = {
            type: 'road-points', id: metadata.id, index: metadata.index,
            pointIndexes: next, start: point,
            points: metadata.item.points.map(value => ({ ...value })),
            undoRecorded: false
          };
        } else if (!event.shiftKey) {
          interactionInstance.beginPointDrag(metadata.type, metadata.id, metadata.index);
        }
      }

      else if (metadata.type === 'wall-point') {
        interactionInstance.beginPointDrag(metadata.type, metadata.id, metadata.index);
        state.setSelectedFortificationId?.(metadata.id);
        state.setSelectedFortificationPointIndex?.(metadata.index);
      }

      else if (metadata.type === 'region-point') {
        interactionInstance.beginPointDrag(metadata.type, metadata.id, metadata.index);
        state.setSelectedRegionId?.(metadata.id);
        state.setSelectedRegionPointIndex?.(metadata.index);
      }

      return true;
    }


    if (!item) return false;


    // -------------------------------------------------------------------------
    // Building / POI
    // -------------------------------------------------------------------------

    if (isBuilding || metadata.kind === 'poi') {
      if (isBuilding && state.activeTool === 'build' && state.buildMode === 'move-selected') {
        if (event.button === 0 && item.id === state.selected?.id) {
          interaction = {
            type: 'building',
            id: item.id
          };
        }

        return true;
      }

      state.setSelected?.(isBuilding ? item : null);

      if (['inspect', 'player'].includes(state.activeTool)) {
        state.setInspectSelection?.({
          entityKind: isBuilding ? 'building' : 'poi',
          id: item.id,
          item,
          kind: isBuilding ? 'Building' : item.point_type || 'Point of Interest',
          name: item.name || (isBuilding ? 'Unnamed Structure' : 'Unnamed Landmark'),
          description: item.public_description || item.description || '',
        });
      }

      if (
        isBuilding && state.activeTool === 'build' &&
        ['refine', 'select-placed'].includes(state.buildMode) &&
        event.button === 0
      ) {
        interaction = {
          type: 'building',
          id: item.id
        };
      }

      return true;
    }


    // -------------------------------------------------------------------------
    // Building resize handle
    // -------------------------------------------------------------------------

    if (metadata.kind === 'building-handle' && event.button === 0) {
      if (state.activeTool !== 'build' || state.buildMode !== 'refine') {
        return false;
      }

      const building = state.buildings.find(value => value.id === metadata.id);
      if (!building) return false;

      state.setSelected(building);

      interactionInstance.beginPointDrag(
        'building-resize',
        metadata.id,
        null,
        metadata.corner
      );

      return true;
    }


    // -------------------------------------------------------------------------
    // Road
    // -------------------------------------------------------------------------

    if (metadata.kind === 'road') {
      state.setSelectedRoadId?.(item.id);
      state.setSelectedRoadPointIndex?.(null);
      state.setSelectedRoadPointIndexes?.([]);
      state.setSelected?.(item);

      if (state.activeTool === 'road' && state.roadMode === 'refine' && event.button === 0) {
        const segmentIndex = roadSegmentIndexAt(item, point);
        if (segmentIndex != null) {
          const selected = state.selectedRoadSegmentIndexes || [];
          const next = event.shiftKey
            ? (selected.includes(segmentIndex) ? selected.filter(index => index !== segmentIndex) : [...selected, segmentIndex])
            : [segmentIndex];
          state.setSelectedRoadSegmentIndexes?.(next);
          interaction = {
            type: 'road-segments', id: item.id, start: point,
            points: item.points.map(value => ({ ...value })), segmentIndexes: next,
            undoRecorded: false
          };
        }
      }

      if (['inspect', 'player'].includes(state.activeTool)) {
        state.setInspectSelection({
          entityKind: 'road', id: item.id, item,
          kind: 'Street / Highway',
          name: item.name || 'Unnamed Roadway',
          description:
            `A ${item.road_class || 'standard'} spline track segment running through the district map grids.`
        });
      }

      if (
        state.activeTool === 'road' &&
        state.roadMode === 'move-spline' &&
        event.button === 0
      ) {
        beginSplineMove(
          'road-spline',
          item,
          point
        );
      }

      return true;
    }


    // -------------------------------------------------------------------------
    // Wall / fortification
    // -------------------------------------------------------------------------

    if (metadata.kind === 'wall' || metadata.kind === 'fortification') {
      state.setSelectedFortificationId?.(item.id);
      state.setSelectedFortificationPointIndex?.(null);
      state.setSelected?.(item);

      if (state.activeTool === 'fortification' && state.fortificationMode === 'refine' && event.button === 0) {
        state.setSelectedFortificationSegmentIndex?.(roadSegmentIndexAt(item, point));
      }

      if (['inspect', 'player'].includes(state.activeTool)) {
        state.setInspectSelection({
          entityKind: 'wall', id: item.id, item,
          kind: 'Wall / Fortification',
          name: item.name || 'Unnamed Perimeter Wall',
          description:
            item.description ||
            `Defensive masonry barrier standing ${item.height_feet || 35} feet high with structural tower bastions.`
        });
      }

      if (
        state.activeTool === 'fortification' &&
        state.fortificationMode === 'move-spline' &&
        event.button === 0
      ) {
        beginSplineMove(
          'wall-spline',
          item,
          point
        );
      }

      return true;
    }


    // -------------------------------------------------------------------------
    // Region
    // -------------------------------------------------------------------------

    if (metadata.kind === 'region') {
      if (state.activeTool !== 'region') return false;

      state.setSelectedRegionId?.(item.id);
      state.setSelectedRegionPointIndex?.(null);
      state.setSelected?.(item);

      if (state.regionMode === 'move-spline' && event.button === 0) {
        beginSplineMove(
          'region-spline',
          item,
          point
        );
      }

      return true;
    }


    // -------------------------------------------------------------------------
    // Water
    // -------------------------------------------------------------------------

    if (metadata.kind === 'water') {
      if (
        item.water_type === 'river' &&
        ['inspect', 'player'].includes(state.activeTool)
      ) {
        state.setSelected?.(item);

        state.setInspectSelection({
          entityKind: 'water', id: item.id, item,
          kind: 'Waterway / River',
          name: item.name || 'Local Stream',
          description:
            `A discrete flowing landmark river current measured at an average depth of ${item.depth_feet || 5} feet.`
        });

        return true;
      }

      return false;
    }

    return false;
  };


  // ---------------------------------------------------------------------------
  // PUBLIC WORKFLOW
  // ---------------------------------------------------------------------------

  return {
    attach(scene) {
      const canvas = scene.getEngine().getRenderingCanvas();
      const brushRef = getState().brushMeshRef;
      let brushMaterial = null;

      if (brushRef) {
        brushMaterial = new StandardMaterial('terrain-brush-material', scene);
        brushMaterial.disableLighting = true;
        brushMaterial.emissiveColor = Color3.FromHexString('#ff2d2d');
        brushMaterial.fogEnabled = false;
        brushMaterial.disableDepthWrite = true;

        const brushMesh = MeshBuilder.CreateTorus('terrain-brush-cursor', {
          diameter: 2,
          thickness: 0.02,
          tessellation: 96
        }, scene);
        brushMesh.rotation.x = Math.PI / 2;
        brushMesh.material = brushMaterial;
        brushMesh.isPickable = false;
        brushMesh.renderingGroupId = 3;
        brushMesh.setEnabled(false);
        brushRef.current = brushMesh;
      }

      const preventContextMenu = event => {
        const state = getState();

        const splineRefine =
          (
            state.activeTool === 'road' &&
            state.roadMode === 'refine'
          ) ||
          (
            state.activeTool === 'fortification' &&
            state.fortificationMode === 'refine'
          ) ||
          (
            state.activeTool === 'region' &&
            state.regionMode === 'refine'
          );

        if (splineRefine) {
          event.preventDefault();
        }
      };

      canvas?.addEventListener('contextmenu', preventContextMenu);


      const observer = scene.onPointerObservable.add(info => {
        const state = getState();


        // ---------------------------------------------------------------------
        // Reference image placement
        // ---------------------------------------------------------------------

        if (state.activeTool === 'reference' && state.referencePlacement) {
          const placement = state.referencePlacement;

          if (state.referenceCalibrationMode) {
            if (canvas) canvas.style.cursor = 'crosshair';
            if (info.type === PointerEventTypes.POINTERDOWN && info.event.button === 0) {
              const ground = pickTerrain(scene);
              if (ground?.pickedPoint) {
                const point = babylonToWorld(ground.pickedPoint);
                const { u, v } = referenceLayerUv(placement, point.x, point.y);
                if (u >= 0 && u <= 1 && v >= 0 && v <= 1) state.onReferencePoint(point);
              }
            }
            return;
          }

          if (
            info.type === PointerEventTypes.POINTERUP ||
            (
              info.type === PointerEventTypes.POINTERMOVE &&
              info.event.buttons === 0
            )
          ) {
            referenceDrag = null;

            if (canvas) {
              canvas.style.cursor = 'grab';
            }

            return;
          }

          if (placement._busy) return;

          const gizmoPick = scene.pick(
            scene.pointerX,
            scene.pointerY,
            mesh => !!mesh.metadata?.referenceGizmoMode
          );

          const gizmoMode = gizmoPick?.hit
            ? gizmoPick.pickedMesh.metadata.referenceGizmoMode
            : null;

          if (
            info.type === PointerEventTypes.POINTERMOVE &&
            !referenceDrag &&
            canvas
          ) {
            canvas.style.cursor =
              gizmoMode === 'move'
                ? 'move'
                : gizmoMode === 'scale'
                  ? 'nwse-resize'
                  : gizmoMode === 'rotate'
                    ? 'crosshair'
                    : 'default';
          }

          // Pick the actual terrain separately from the raised image and
          // reference-image gizmos.
          const ground = pickTerrain(scene);
          if (!ground?.pickedPoint) return;

          const point = babylonToWorld(ground.pickedPoint);

          if (
            info.type === PointerEventTypes.POINTERDOWN &&
            info.event.button === 0
          ) {
            if (!gizmoMode) return;

            const target = scene.activeCamera?.target;

            const anchor = {
              x: (target?.x || 0) * FEET_PER_SCENE_UNIT,
              y: (target?.z || 0) * FEET_PER_SCENE_UNIT
            };

            referenceDrag = {
              layer: { ...placement },
              point,
              anchor,
              mode: gizmoMode
            };

            canvas?.setPointerCapture?.(info.event.pointerId);

            if (canvas) {
              canvas.style.cursor = 'grabbing';
            }
          }

          else if (
            info.type === PointerEventTypes.POINTERMOVE &&
            referenceDrag
          ) {
            const {
              layer,
              point: start,
              anchor,
              mode
            } = referenceDrag;

            state.setReferencePlacement(
              transformReferenceFromGizmo(
                layer,
                mode,
                start,
                point,
                anchor
              )
            );
          }

          return;
        }


        if (referenceDrag) {
          referenceDrag = null;
        }

        if (
          canvas?.style.cursor === 'grab' ||
          canvas?.style.cursor === 'grabbing'
        ) {
          canvas.style.cursor = '';
        }


        // ---------------------------------------------------------------------
        // GENERAL SCENE PICK
        // ---------------------------------------------------------------------

        const terrainTool = state.activeTool === 'terrain';

        // Region vertices can sit beneath tall wall meshes. Pick their handles
        // separately so the wall cannot intercept a refinement click.
        const regionHandlePick = state.activeTool === 'region' &&
          state.regionMode === 'refine' &&
          info.type === PointerEventTypes.POINTERDOWN
          ? scene.pick(scene.pointerX, scene.pointerY, mesh =>
            mesh?.metadata?.kind === 'spline-handle' &&
            mesh.metadata.type === 'region-point' &&
            mesh.metadata.id === state.selectedRegionId)
          : null;
        const propertyHandlePick = state.buildMode === 'edit-property-boundary' && info.type === PointerEventTypes.POINTERDOWN
            ? scene.pick(scene.pointerX, scene.pointerY, mesh => mesh?.metadata?.kind === 'property-boundary-handle' && mesh.metadata.propertyId === state.editingPropertyBoundaryId)
            : null;
        const normalPick =
          propertyHandlePick?.hit ? propertyHandlePick :
          regionHandlePick?.hit ? regionHandlePick :
          info.pickInfo &&
            (
              !terrainTool ||
              info.pickInfo.pickedMesh?.name === 'terrain' ||
              info.pickInfo.pickedMesh?.metadata?.kind === 'terrain'
            )
            ? info.pickInfo
            : scene.pick(
              scene.pointerX,
              scene.pointerY,
              mesh =>
                terrainTool
                  ? (
                    mesh.name === 'terrain' ||
                    mesh.metadata?.kind === 'terrain'
                  )
                  : (
                    mesh.isPickable &&
                    mesh.isEnabled()
                  )
            );

        // When dragging a spline control point or whole spline, force the pick
        // onto terrain so the dragged geometry cannot pick itself.
        const terrainDragPick =
          (
            info.type === PointerEventTypes.POINTERMOVE &&
            interactionUsesTerrainDrag()
          )
            ? pickTerrain(scene)
            : null;

        const blueprintDrafting = state.activeTool === 'build' &&
          ['draw-blueprint', 'draw-property-boundary', 'draw-outdoor-area'].includes(state.buildMode);
        const pick = blueprintDrafting ? pickTerrain(scene) : terrainDragPick || normalPick;
        const pickedPoint = pick?.pickedPoint;

        const brushMesh = state.brushMeshRef?.current;
        // ---------------------------------------------------------------------
        // Terrain brush visualization
        // ---------------------------------------------------------------------

        if (
          state.activeTool === 'terrain' &&
          brushMesh &&
          !state.heightmapPlacement
        ) {
          if (pickedPoint) {
            brushMesh.setEnabled(true);
            brushMesh.position.copyFrom(pickedPoint);
            brushMesh.position.y += 0.2;
          }

          else {
            const ray = scene.createPickingRay(
              scene.pointerX,
              scene.pointerY,
              null,
              scene.activeCamera
            );

            const distance = -ray.origin.y / ray.direction.y;

            if (distance > 0) {
              brushMesh.setEnabled(true);

              brushMesh.position.copyFrom(
                ray.origin.add(
                  ray.direction.scale(distance)
                )
              );

              const worldPos = babylonToWorld(brushMesh.position);

              const dynamicHeight =
                state.sampleTerrainHeight?.(worldPos.x, worldPos.y)
                ??
                terrainHeightAt(
                  state.strokes,
                  worldPos.x,
                  worldPos.y,
                  state.heightMap
                );

              brushMesh.position.y =
                (dynamicHeight / FEET_PER_SCENE_UNIT) + 0.2;
            }
          }

          const currentRadius = getLatestBrushRadius
            ? getLatestBrushRadius()
            : state.brushRadius;

          const targetScale = currentRadius / FEET_PER_SCENE_UNIT;

          brushMesh.scaling.set(
            targetScale,
            1.0,
            targetScale
          );
        }

        else if (
          brushMesh &&
          (
            state.activeTool !== 'terrain' ||
            state.heightmapPlacement
          )
        ) {
          brushMesh.setEnabled(false);
        }


        // ---------------------------------------------------------------------
        // POINTER UP
        //
        // This must run even when the cursor is no longer over terrain.
        // ---------------------------------------------------------------------

        if (info.type === PointerEventTypes.POINTERUP) {
          if (interaction?.type === 'wall-point' && interaction.undoRecorded) {
            state.commitWallPointSnap?.(interaction.id, interaction.index);
          }
          if (state.activeTool === 'terrain') {
            if (canvas) {
              canvas.removeAttribute('data-sculpting');
              canvas.removeAttribute('data-heightmap-dragging');
            }

            const wasPlacingHeightmap = !!state.heightmapPlacement;

            heightmapDragOffset = null;
            sculptGestureId = null;
            flattenTarget = null;
            previousSculptPoint = null;

            if (!wasPlacingHeightmap && state.onSculptEnd) {
              state.onSculptEnd();
            }

            if (scene.activeCamera) {
              scene.activeCamera.inertia = 0;
              scene.activeCamera.panningInertia = 0;
              scene.activeCamera.inertialAlphaOffset = 0;
              scene.activeCamera.inertialBetaOffset = 0;
            }
          }

          this.endPointer();
          return;
        }


        const event = info.event;


        // ---------------------------------------------------------------------
        // RIGHT-CLICK SPLINE CONTEXT MENU
        //
        // Use a dedicated spline pick instead of the ordinary scene pick.
        // This keeps submerged road segments accessible even if water is the
        // nearest visible mesh under the pointer.
        // ---------------------------------------------------------------------

        const splineRefineContext =
          (
            state.activeTool === 'road' &&
            state.roadMode === 'refine'
          ) ||
          (
            state.activeTool === 'fortification' &&
            state.fortificationMode === 'refine'
          ) ||
          (
            state.activeTool === 'region' &&
            state.regionMode === 'refine'
          );

        if (
          info.type === PointerEventTypes.POINTERDOWN &&
          event.button === 2 &&
          splineRefineContext
        ) {
          event.preventDefault();

          const regionPointPick = state.activeTool === 'region' ? scene.pick(
            scene.pointerX, scene.pointerY,
            mesh => mesh?.metadata?.kind === 'spline-handle' &&
              mesh.metadata.type === 'region-point' &&
              mesh.metadata.id === state.selectedRegionId
          ) : null;
          const splinePick = regionPointPick?.hit ? regionPointPick : scene.pick(
            scene.pointerX,
            scene.pointerY,
            mesh => {
              const metadata = mesh?.metadata;
              if (!metadata) return false;

              if (metadata.kind === 'spline-handle') {
                return (
                  (
                    state.activeTool === 'road' &&
                    metadata.type === 'road-point'
                  ) ||
                  (
                    state.activeTool === 'fortification' &&
                    metadata.type === 'wall-point'
                  ) ||
                  (
                    state.activeTool === 'region' &&
                    metadata.type === 'region-point'
                  )
                );
              }

              if (state.activeTool === 'road') {
                return metadata.kind === 'road';
              }

              if (state.activeTool === 'region') return metadata.kind === 'region';

              return (
                metadata.kind === 'wall' ||
                metadata.kind === 'fortification'
              );
            }
          );

          const metadata = splinePick?.pickedMesh?.metadata;
          const splinePoint = splinePick?.pickedPoint || pickedPoint;

          // A road's visible ribbon can be thinner than a pixel at map scale.
          // When Babylon misses that mesh, resolve the nearest authored spline
          // from the terrain hit instead of making users hunt for its exact edge.
          const terrainFallback = pickTerrain(scene)?.pickedPoint;
          const fallbackWorldPoint = terrainFallback
            ? babylonToWorld(terrainFallback)
            : splinePoint ? babylonToWorld(splinePoint) : null;
          const fallbackSpline = fallbackWorldPoint
            ? nearestSplinePoint(
              fallbackWorldPoint,
              state.activeTool === 'road' ? state.roads : [],
              state.activeTool === 'fortification' ? state.fortifications : [],
              Math.max(24, Number(state.roadSnapToleranceFeet) || 0)
            )
            : null;

          if (!metadata && fallbackSpline) {
            const item = (fallbackSpline.source.kind === 'road' ? state.roads : state.fortifications)
              ?.find(value => value.id === fallbackSpline.source.id);
            if (item) {
              if (fallbackSpline.source.kind === 'road') {
                state.setSelectedRoadId?.(item.id);
                state.setSelectedRoadPointIndex?.(null);
                state.setSelectedRoadPointIndexes?.([]);
              } else {
                state.setSelectedFortificationId?.(item.id);
                state.setSelectedFortificationPointIndex?.(null);
              }
              state.setSelected?.(item);
              state.openSplineContextMenu?.({
                kind: fallbackSpline.source.kind,
                id: item.id,
                index: null,
                pointCount: item.points?.length || 0,
                point: { x: fallbackSpline.x, y: fallbackSpline.y },
                clientX: event.clientX,
                clientY: event.clientY
              });
              return;
            }
          }

          if (metadata && splinePoint) {
            const menuPoint = babylonToWorld(splinePoint);

            if (metadata.kind === 'spline-handle') {
              if (metadata.type === 'road-point') {
                state.setSelectedRoadId?.(metadata.id);
                state.setSelectedRoadPointIndex?.(metadata.index);
                state.setSelectedRoadPointIndexes?.([metadata.index]);
              }

              else if (metadata.type === 'wall-point') {
                state.setSelectedFortificationId?.(metadata.id);
                state.setSelectedFortificationPointIndex?.(metadata.index);
              }

              else if (metadata.type === 'region-point') {
                state.setSelectedRegionId?.(metadata.id);
                state.setSelectedRegionPointIndex?.(metadata.index);
              }

              const pointCount =
                metadata.item?.points?.length
                ||
                (
                  metadata.type === 'road-point'
                    ? state.roads?.find(
                      value => value.id === metadata.id
                    )?.points?.length
                    : metadata.type === 'region-point'
                      ? state.regions?.find(value => value.id === metadata.id)?.points?.length
                      : state.fortifications?.find(
                      value => value.id === metadata.id
                    )?.points?.length
                )
                ||
                0;

              state.openSplineContextMenu?.({
                kind: metadata.type === 'road-point'
                  ? 'road'
                  : metadata.type === 'region-point' ? 'region' : 'wall',

                id: metadata.id,
                index: metadata.index,
                pointCount,
                point: menuPoint,
                clientX: event.clientX,
                clientY: event.clientY
              });

              return;
            }


            const item = metadata.item;

            if (item && metadata.kind === 'road') {
              state.setSelectedRoadId?.(item.id);
              state.setSelectedRoadPointIndex?.(null);
              state.setSelectedRoadPointIndexes?.([]);
              state.setSelected?.(item);

              state.openSplineContextMenu?.({
                kind: 'road',
                id: item.id,
                index: null,
                pointCount: item.points?.length || 0,
                point: menuPoint,
                clientX: event.clientX,
                clientY: event.clientY
              });

              return;
            }

            if (item && metadata.kind === 'region') {
              state.setSelectedRegionId?.(item.id);
              state.setSelectedRegionPointIndex?.(null);
              state.openSplineContextMenu?.({
                kind: 'region', id: item.id, index: null,
                pointCount: item.points?.length || 0,
                point: menuPoint, clientX: event.clientX, clientY: event.clientY
              });
              return;
            }


            if (
              item &&
              (
                metadata.kind === 'wall' ||
                metadata.kind === 'fortification'
              )
            ) {
              state.setSelectedFortificationId?.(item.id);
              state.setSelectedFortificationPointIndex?.(null);
              state.setSelected?.(item);

              state.openSplineContextMenu?.({
                kind: 'wall',
                id: item.id,
                index: null,
                pointCount: item.points?.length || 0,
                point: menuPoint,
                clientX: event.clientX,
                clientY: event.clientY
              });

              return;
            }
          }
        }


        const drafting = (state.activeTool === 'road' && state.roadMode === 'draw-new') ||
          (state.activeTool === 'region' && ['draw-new', 'trace'].includes(state.regionMode)) ||
          (state.activeTool === 'fortification' && state.fortificationMode === 'draw-new');
        const sourceMetadata = normalPick?.pickedMesh?.metadata;
        const sourceKind = sourceMetadata?.kind === 'road' ? 'road'
          : ['wall', 'fortification'].includes(sourceMetadata?.kind) ? 'wall' : null;
        const pickedSource = sourceKind && sourceMetadata.item &&
          (state.activeTool === 'region' || (state.activeTool === 'road' && sourceKind === 'road'))
          ? { kind: sourceKind, id: sourceMetadata.item.id } : null;
        const draftPoint = () => {
          if (pickedSource && normalPick?.pickedPoint) return { ...babylonToWorld(normalPick.pickedPoint), _source: pickedSource };
          const terrain = pickTerrain(scene);
          return terrain?.pickedPoint ? babylonToWorld(terrain.pickedPoint) : null;
        };
        if (drafting && info.type === PointerEventTypes.POINTERMOVE && info.event.buttons === 0) {
          state.setSplineHoverPoint?.(draftPoint());
        }
        if (state.activeTool === 'build' && ['draw-blueprint', 'draw-property-boundary', 'draw-outdoor-area'].includes(state.buildMode) &&
          !state.blueprintDraft?.levels?.[0]?.closed && info.type === PointerEventTypes.POINTERMOVE &&
          info.event.buttons === 0) {
          state.setBlueprintHoverPoint?.(draftPoint());
        }

        if (drafting && info.type === PointerEventTypes.POINTERDOWN && event.button === 0) {
          const point = draftPoint();
          if (point) addTerrainPoint(point);
          return;
        }

        if (!pickedPoint) return;

        const point = babylonToWorld(pickedPoint);


        // ---------------------------------------------------------------------
        // POINTER DOWN
        // ---------------------------------------------------------------------

        if (
          info.type === PointerEventTypes.POINTERDOWN &&
          event.button === 0
        ) {
          if (state.activeTool === 'terrain') {
            if (state.terrainMode === 'slope') {
              const terrain = pickTerrain(scene);
              if (terrain?.pickedPoint) state.onSlopePoint?.(babylonToWorld(terrain.pickedPoint));
              return;
            }
            if (state.terrainMode === 'set-elevation' && state.pickTerrainElevation) {
              const terrain = pickTerrain(scene);
              if (terrain?.pickedPoint) state.onPickTerrainElevation?.(babylonToWorld(terrain.pickedPoint));
              return;
            }
            // -----------------------------------------------------------------
            // Heightmap placement drag
            // -----------------------------------------------------------------

            if (state.heightmapPlacement) {
              if (canvas) {
                canvas.setAttribute(
                  'data-heightmap-dragging',
                  'true'
                );
              }

              heightmapDragOffset = {
                x:
                  state.heightmapPlacement.origin_x -
                  point.x,

                y:
                  state.heightmapPlacement.origin_y -
                  point.y
              };

              return;
            }


            // -----------------------------------------------------------------
            // Terrain sculpting
            // -----------------------------------------------------------------

            if (canvas) {
              canvas.setAttribute(
                'data-sculpting',
                'true'
              );
            }

            sculptGestureId =
              `sculpt-${Date.now()}-${Math.random()
                .toString(36)
                .substr(2, 5)}`;

            flattenTarget =
              state.terrainMode === 'flatten'
                ? (
                  state.sampleTerrainHeight?.(
                    point.x,
                    point.y
                  )
                  ??
                  terrainHeightAt(
                    state.strokes,
                    point.x,
                    point.y,
                    state.heightMap
                  )
                )
                : null;

            if (state.onSculptStart) {
              state.onSculptStart();
            }

            sculpt(point);
          }

          else {
            // Clicking an existing mesh selects it or begins a drag.
            //
            // Blueprint drawing is the exception: clicks must pass through
            // existing scene geometry so footprint points can still be placed.
            const consumedByMesh =
              (
                state.activeTool === 'build' &&
                ['draw-blueprint', 'draw-property-boundary', 'draw-outdoor-area'].includes(state.buildMode)
              )
                ? false
                : selectMesh(
                  normalPick?.pickedMesh?.metadata,
                  babylonToWorld(
                    normalPick?.pickedPoint ||
                    pickedPoint
                  ),
                  event
                );

            if (!consumedByMesh) {
              addTerrainPoint(point);
            }
          }
        }


        // ---------------------------------------------------------------------
        // POINTER MOVE
        // ---------------------------------------------------------------------

        else if (info.type === PointerEventTypes.POINTERMOVE) {
          // Heightmap translation
          if (
            state.activeTool === 'terrain' &&
            state.heightmapPlacement &&
            heightmapDragOffset
          ) {
            state.setHeightmapPlacement(current =>
              current
                ? {
                  ...current,
                  origin_x:
                    point.x +
                    heightmapDragOffset.x,

                  origin_y:
                    point.y +
                    heightmapDragOffset.y
                }
                : current
            );

            return;
          }


          // Terrain sculpting
          if (state.activeTool === 'terrain' && sculptGestureId) {
            sculpt(point);
          }


          // Existing structure / spline drag
          applyDrag(point);
        }
      });

      // -----------------------------------------------------------------------
      // CLEANUP
      // -----------------------------------------------------------------------

      return () => {
        scene.onPointerObservable.remove(observer);

        if (canvas) {
          canvas.removeEventListener(
            'contextmenu',
            preventContextMenu
          );

          canvas.removeAttribute(
            'data-heightmap-dragging'
          );

          canvas.removeAttribute(
            'data-sculpting'
          );

          canvas.style.cursor = '';
        }

        const brushMesh = brushRef?.current;

        if (brushMesh) {
          brushMesh.dispose();
          brushRef.current = null;
        }
        brushMaterial?.dispose();
      };
    },

    // Keep these outer access methods intact for backwards compatibility.
    beginPointDrag(type, id, index, corner) {
      interactionInstance.beginPointDrag(
        type,
        id,
        index,
        corner
      );
    },

    endPointer() {
      interaction = null;
      previousSculptPoint = null;
      flattenTarget = null;
      sculptGestureId = null;
      heightmapDragOffset = null;
    }
  };
}
