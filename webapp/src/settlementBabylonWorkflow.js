import { PointerEventTypes } from '@babylonjs/core';
import {
  FEET_PER_SCENE_UNIT,
  createBuilding,
  resizeBuildingFromCorner,
  snapBuildingPlacement,
  snapRegionBoundaryPoint,
  snapRoadNetworkPoint,
  snapRoadSplineTranslation,
  terrainHeightAt,
  addBlueprintCorner,
  createBlueprintBuilding,
  generateDefaultFloorplan
} from './settlementEditor';

import { babylonToWorld, pointInsideRegion } from './settlementBabylon';
import { transformReferenceFromGizmo } from './referencePlacement';


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
      interaction.type === 'road-point' ||
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
      // Refine/select modes operate on existing structures and must not create
      // another building when the ground is clicked.
      if (state.buildMode === 'refine' || state.buildMode === 'select-placed') {
        return;
      }


      // Blueprint drafting
      if (state.buildMode === 'draw-blueprint') {
        if (!state.blueprintDraft) {
          const newBuilding = createBlueprintBuilding(point);

          state.setBlueprintDraft(newBuilding);
          state.setSelected(newBuilding);
        } else {
          const updated = addBlueprintCorner(state.blueprintDraft, point);

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
      state.setRoadDraft(values => [
        ...values,
        snapRoadNetworkPoint(
          {
            ...point,
            width_feet: state.roadWidth
          },
          state.roads,
          {
            tolerance: state.roadSnapToleranceFeet
          }
        )
      ]);
    }


    // -------------------------------------------------------------------------
    // Fortification drafting
    // -------------------------------------------------------------------------

    else if (
      state.activeTool === 'fortification' &&
      state.fortificationMode === 'draw-new'
    ) {
      state.setFortificationDraft(values => [
        ...values,
        {
          x: Math.round(point.x),
          y: Math.round(point.y)
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

        return [
          ...values,
          snapRegionBoundaryPoint(
            point,
            targets,
            state.roads,
            {
              fortifications: state.fortifications
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

    // Record one snapshot at the beginning of a road/wall drag. This is lazy,
    // so simply selecting a control point does not create an undo entry.
    if (!interaction.undoRecorded) {
      if (
        interaction.type === 'road-point' ||
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


    // -------------------------------------------------------------------------
    // Individual wall point
    // -------------------------------------------------------------------------

    else if (interaction.type === 'wall-point') {
      updatePoint(
        state.setFortifications,
        interaction.id,
        interaction.index,
        point,
        true
      );
    }


    // -------------------------------------------------------------------------
    // Individual region point
    // -------------------------------------------------------------------------

    else if (interaction.type === 'region-point') {
      state.setRegions(values =>
        values.map(region =>
          region.id === interaction.id
            ? {
              ...region,
              points: region.points.map((value, index) =>
                index === interaction.index
                  ? snapRegionBoundaryPoint(
                    point,
                    values,
                    state.roads,
                    {
                      regionId: interaction.id,
                      pointIndex: index,
                      fortifications: state.fortifications
                    }
                  )
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
    const item = metadata?.item;


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

      interactionInstance.beginPointDrag(
        metadata.type,
        metadata.id,
        metadata.index
      );

      // Keep the selected scene handle synchronized with the side panel.
      if (metadata.type === 'road-point') {
        state.setSelectedRoadId?.(metadata.id);
        state.setSelectedRoadPointIndex?.(metadata.index);
      }

      else if (metadata.type === 'wall-point') {
        state.setSelectedFortificationId?.(metadata.id);
        state.setSelectedFortificationPointIndex?.(metadata.index);
      }

      return true;
    }


    if (!item) return false;


    // -------------------------------------------------------------------------
    // Building / POI
    // -------------------------------------------------------------------------

    if (metadata.kind === 'building' || metadata.kind === 'poi') {
      if (state.activeTool === 'build' && state.buildMode === 'move-selected') {
        if (event.button === 0 && item.id === state.selected?.id) {
          interaction = {
            type: 'building',
            id: item.id
          };
        }

        return true;
      }

      state.setSelected(item);

      if (['inspect', 'player'].includes(state.activeTool)) {
        state.setInspectSelection({
          kind:
            item.building_type ||
            item.business_type ||
            'Point of Interest',

          name:
            item.name ||
            'Unnamed Structure',

          description:
            item.description ||
            'Mapped POI structural footprint located at coordinate boundaries.'
        });
      }

      if (
        state.activeTool === 'build' &&
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
      state.setSelected?.(item);

      if (['inspect', 'player'].includes(state.activeTool)) {
        state.setInspectSelection({
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

      if (['inspect', 'player'].includes(state.activeTool)) {
        state.setInspectSelection({
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

        const normalPick =
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

        const pick = terrainDragPick || normalPick;
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
          );

        if (
          info.type === PointerEventTypes.POINTERDOWN &&
          event.button === 2 &&
          splineRefineContext
        ) {
          event.preventDefault();

          const splinePick = scene.pick(
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
                  )
                );
              }

              if (state.activeTool === 'road') {
                return metadata.kind === 'road';
              }

              return (
                metadata.kind === 'wall' ||
                metadata.kind === 'fortification'
              );
            }
          );

          const metadata = splinePick?.pickedMesh?.metadata;
          const splinePoint = splinePick?.pickedPoint || pickedPoint;

          if (metadata && splinePoint) {
            const menuPoint = babylonToWorld(splinePoint);

            if (metadata.kind === 'spline-handle') {
              if (metadata.type === 'road-point') {
                state.setSelectedRoadId?.(metadata.id);
                state.setSelectedRoadPointIndex?.(metadata.index);
              }

              else if (metadata.type === 'wall-point') {
                state.setSelectedFortificationId?.(metadata.id);
                state.setSelectedFortificationPointIndex?.(metadata.index);
              }

              const pointCount =
                metadata.item?.points?.length
                ||
                (
                  metadata.type === 'road-point'
                    ? state.roads?.find(
                      value => value.id === metadata.id
                    )?.points?.length
                    : state.fortifications?.find(
                      value => value.id === metadata.id
                    )?.points?.length
                )
                ||
                0;

              state.openSplineContextMenu?.({
                kind: metadata.type === 'road-point'
                  ? 'road'
                  : 'wall',

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
                state.buildMode === 'draw-blueprint'
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

        const brushMesh = getState().brushMeshRef?.current;

        if (brushMesh) {
          brushMesh.dispose();
        }
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