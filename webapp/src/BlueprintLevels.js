import React, { useEffect, useRef, useState } from 'react';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';

import {
  addBuildingLevel,
  exposedRoofFootprints,
  normalizeBlueprint,
  openCorners,
  blueprintWalls,
  snapOpening,
  blueprintId,
  levelConnectionGuides,
  nearestWall,
  arcFromThreePoints,
  wallLength,
  wallPolyline,
  wallPointAtDistance,
  distanceToSegment,
  pointInPolygon,
  stairGeometry,
  stairCenterline,
  stairOpeningPolygon,
  stairOpeningsForLevel,
  levelBelow,
  cloneOutline,
  snapPointToLevelBelow,
  snapPointToOutline,
  snapWallToOutline,
  snapPointToRightAngle,
  chimneysForLevel,
  chimneyPolygon,
  chimneyPassThroughsForLevel,
  nearestChimney,
  fireplacePosition,
  platformEdgeMode,
  levelAbove,
  BLUEPRINT_ROOF_TYPES,
  automaticRoofFootprints,
  roofFootprintOverlapRatio,
  addSkyCourtyard,
  moveSkyCourtyardVertex,
  removeSkyCourtyard,
  WALL_FINISHES,
  FLOOR_FINISHES,
  normalizeFlightShares,
  redistributeFlightShares,
  resizeFlightShares,
  defaultLevelName,
  missingLevelNumbers,
  insertMissingBuildingLevel,
  levelDeletionImpact,
  deleteBuildingLevel,
} from './buildingBlueprint';

import BlueprintRoofs from './BlueprintRoofs';
import { createRoom, defaultsForRoomPurpose, roomBoundaryFromWalls, ROOM_PURPOSES } from './settlementRooms';
import { detectRooms, reconcileDetectedRooms } from './roomDetection';
import { wallConnectionDiagnostics, repairWallConnections } from './wallTopology';

import './BlueprintLevels.css';

const finishLabel = finish => ({ existing: 'Existing appearance', stone: 'Stone', wood: 'Wood',
  brick: 'Brick', plaster: 'Plaster', 'packed-earth': 'Packed earth' })[finish] || finish;

const OPENING_TOOLS = {
  door: 'door',
  'double-door': 'double_door',
  archway: 'archway',
  curtain: 'curtain',
  window: 'window',
};

const OPENING_LABELS = {
  door: 'Door',
  double_door: 'Double door',
  archway: 'Archway',
  curtain: 'Curtain',
  window: 'Window',
};

const MOVEMENT_KEYS = new Set([
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'w',
  'a',
  's',
  'd',
]);

export default function BlueprintLevels({
  building: source,
  onChange,
  uploadImage,
  onDeleteLevelReferences,
  drafting = false,
  initialOpen = false,
  initialSelection = null,
  onEditorClose,
  onEditorOpenChange,
}) {
  const normalizedBuilding = normalizeBlueprint(source);
  const building = initialSelection?.level_id
    ? { ...normalizedBuilding, visible_level_id: initialSelection.level_id }
    : normalizedBuilding;
  const level = building.levels.find(
    item => item.id === building.visible_level_id
  ) || building.levels[0];

  const [open, setOpen] = useState(Boolean(initialOpen));
  useEffect(() => {
    onEditorOpenChange?.(open);
    return () => {
      if (open) onEditorOpenChange?.(false);
    };
  }, [open, onEditorOpenChange]);
  const [tool, setTool] = useState(drafting ? 'footprint' : 'select');
  const [draft, setDraft] = useState([]);
  const [imagePlacementOpen, setImagePlacementOpen] = useState(false);
  const [imagePlacementPinned, setImagePlacementPinned] = useState(false);
  const [roofDraftTemplate, setRoofDraftTemplate] = useState(null);
  const [roofDraftHoles, setRoofDraftHoles] = useState([]);
  const [roofRingTarget, setRoofRingTarget] = useState('outer');
  const [dragRoofVertex, setDragRoofVertex] = useState(null);
  const [roofStyle, setRoofStyle] = useState('gable');
  const [roofPitch, setRoofPitch] = useState(30);
  const [roofSlopeDirection, setRoofSlopeDirection] = useState(90);
  const [roofOverhang, setRoofOverhang] = useState(2);
  const [roofConflict, setRoofConflict] = useState(null);
  const [calibrationPoints, setCalibrationPoints] = useState([]);
  const [calibrationDistance, setCalibrationDistance] = useState(5);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteLevelImpact, setDeleteLevelImpact] = useState(null);
  const [missingLevelNumber, setMissingLevelNumber] = useState('');

  const [angle, setAngle] = useState(0);
  const [width, setWidth] = useState(3);
  const [circleDestination, setCircleDestination] = useState('footprint');
  const [segmentMode, setSegmentMode] = useState('line');
  const [arcDraft, setArcDraft] = useState([]);
  const [arcPointerPoint, setArcPointerPoint] = useState(null);
  const [connectionMarker, setConnectionMarker] = useState(null);
  const [connectionRepairChoices, setConnectionRepairChoices] = useState({});
  const [draftArcs, setDraftArcs] = useState([]);

  const [stairShape, setStairShape] = useState('straight');
  const [stairRun, setStairRun] = useState(12);
  const [stairTotalRise, setStairTotalRise] = useState(null);
  const [stairMaterial, setStairMaterial] = useState('interior');
  const [stairLandingCount, setStairLandingCount] = useState(1);
  const [stairFlightShares, setStairFlightShares] = useState([50, 50]);
  const [activeStairFlight, setActiveStairFlight] = useState(null);
  const [stairLandingDepth, setStairLandingDepth] = useState(3);
  const [stairTurnDegrees, setStairTurnDegrees] = useState(90);
  const [stairCurveRadius, setStairCurveRadius] = useState(8);
  const [stairCurveDegrees, setStairCurveDegrees] = useState(90);

  const [wallThickness, setWallThickness] = useState(0.5);

  const [snapToBelow, setSnapToBelow] = useState(true);
  const [snapTolerance, setSnapTolerance] = useState(2);
  const [snapWallAngles, setSnapWallAngles] = useState(true);

  const [platformStyle, setPlatformStyle] = useState('porch');
  const [platformThickness, setPlatformThickness] = useState(0.5);
  const [platformRailing, setPlatformRailing] = useState(true);

  const [chimneyWidth, setChimneyWidth] = useState(4);
  const [chimneyDepth, setChimneyDepth] = useState(3);
  const [fireplaceWidth, setFireplaceWidth] = useState(5);
  const [fireplaceOpeningHeight, setFireplaceOpeningHeight] = useState(4);
  const [fireplaceSide, setFireplaceSide] = useState('south');

  const defaultStairRise =
    stairMaterial !== 'interior' &&
    level.elevation_feet === 0 &&
    building.foundation_height_feet > 0
      ? building.foundation_height_feet
      : level.floor_height;

  const [doorOperation, setDoorOperation] = useState('hinged');
  const [hingeSide, setHingeSide] = useState('left');
  const [swingSide, setSwingSide] = useState('inward');

  const [selection, setSelection] = useState(initialSelection?.element_id
    ? { kind: initialSelection.element_kind === 'opening' ? 'opening' : initialSelection.element_kind, id: initialSelection.element_id }
    : null);
  const [roomDetectionWarnings, setRoomDetectionWarnings] = useState([]);
  const [roomRedrawId, setRoomRedrawId] = useState(null);
  const [roomBoundaryWallIds, setRoomBoundaryWallIds] = useState([]);
  const [openingsDrawerOpen, setOpeningsDrawerOpen] = useState(false);
  const openingsMenuRef = useRef(null);
  const [curveWallId, setCurveWallId] = useState(null);

  const [view, setView] = useState([-20, -20, 100, 100]);

  const [drag, setDrag] = useState(null);
  const [dragElement, setDragElement] = useState(null);
  const dragElementRef = useRef(null);
  const [dragStairRotation, setDragStairRotation] = useState(null);
  const suppressElementClickRef = useRef(null);
  const [dragVoidVertex, setDragVoidVertex] = useState(null);
  const [dragPlatformVertex, setDragPlatformVertex] = useState(null);
  const [dragOutlineVertex, setDragOutlineVertex] = useState(null);
  const [dragRoomVertex, setDragRoomVertex] = useState(null);
  const levelNumberGaps = missingLevelNumbers(building);
  const insertableLevelGaps = levelNumberGaps.filter(levelNumber => {
    const lower = building.levels.filter(item => item.level_number < levelNumber)
      .sort((a, b) => b.level_number - a.level_number)[0];
    const upper = building.levels.filter(item => item.level_number > levelNumber)
      .sort((a, b) => a.level_number - b.level_number)[0];
    return lower && upper && upper.elevation_feet > lower.elevation_feet;
  });
  const selectedMissingLevelNumber = insertableLevelGaps.includes(Number(missingLevelNumber))
    ? Number(missingLevelNumber)
    : insertableLevelGaps[0];

  useEffect(() => {
    if (!openingsDrawerOpen) return undefined;
    const close = event => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type !== 'keydown' && openingsMenuRef.current?.contains(event.target)) return;
      setOpeningsDrawerOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [openingsDrawerOpen]);

  if (!level) return null;

  const allWalls = blueprintWalls(level);
  const connectionGaps = wallConnectionDiagnostics(allWalls);
  const roomBoundary = roomBoundaryFromWalls(allWalls, roomBoundaryWallIds);
  const belowLevel = levelBelow(building, level);
  const exposedAreas = belowLevel
    ? exposedRoofFootprints(belowLevel, level)
    : [];
  const activeChimneys = chimneysForLevel(building, level);
  const chimneyPassThroughs = chimneyPassThroughsForLevel(building, level);
  const arcPlacementStep = Math.min(arcDraft.length + 1, 3);
  const previewArc =
    ['footprint', 'wall'].includes(tool) &&
    segmentMode === 'arc' &&
    arcDraft.length >= 2 &&
    arcPointerPoint
      ? arcFromThreePoints(
        arcDraft[0],
        arcDraft[1],
        snapPointToOutline(arcPointerPoint, allWalls, 2).point
      )
      : null;

  const stairStart =
    tool === 'stairs' && draft.length
      ? draft[0]
      : null;

  const stairDirection =
    angle * Math.PI / 180;

  const previewStair = stairStart
    ? {
      id: 'preview',
      shape: stairShape,
      start_x: stairStart.x,
      start_y: stairStart.y,
      width,
      direction: stairDirection,
      length: stairRun,
      landing_count: stairLandingCount,
      flight_shares: normalizeFlightShares(stairFlightShares, stairLandingCount + 1),
      landing_depth: stairLandingDepth,
      turn_degrees: stairTurnDegrees,
      curve_radius: stairCurveRadius,
      curve_degrees: stairCurveDegrees,
      total_rise_feet:
        stairTotalRise ?? defaultStairRise,
    }
    : null;

  const previewStairGeometry = previewStair
    ? stairGeometry(
      previewStair,
      level.floor_height
    )
    : null;

  const previewStairOpening = previewStair
    ? stairOpeningPolygon(
      previewStair,
      level.floor_height
    )
    : [];

  const automaticStairOpenings =
    stairOpeningsForLevel(
      building,
      level
    );

  const getSelectedElement = () => {
    if (!selection) return null;

    switch (selection.kind) {
      case 'wall':
        return allWalls.find(
          item => item.id === selection.id
        );

      case 'opening':
        return level.openings.find(
          item => item.id === selection.id
        );

      case 'stair':
        return level.stairs.find(
          item => item.id === selection.id
        );

      case 'hatch':
        return level.hatches.find(
          item => item.id === selection.id
        );

      case 'ladder':
        return level.ladders.find(
          item => item.id === selection.id
        );

      case 'floor_void':
        return level.floor_voids.find(
          item => item.id === selection.id
        );

      case 'room':
        return (level.rooms || []).find(item => item.id === selection.id);

      case 'platform':
        return level.platforms.find(
          item => item.id === selection.id
        );

      case 'fireplace':
        return level.fireplaces.find(
          item => item.id === selection.id
        );

      case 'chimney':
        return building.chimneys.find(
          item => item.id === selection.id
        );

      default:
        return null;
    }
  };

  const selected = getSelectedElement();

  const topologySignature = candidate => JSON.stringify([
    candidate.corners || [],
    [...(candidate.outline || []), ...(candidate.walls || [])].map(wall => ({
      id: wall.id,
      type: wall.type,
      start: wall.start,
      end: wall.end,
      through: wall.through,
      center: wall.center,
      clockwise: wall.clockwise,
    })),
  ]);

  const reconcileRoomsForLevel = candidate => {
    const detection = detectRooms(building, candidate);
    const reconciled = reconcileDetectedRooms(building, candidate, detection.candidates);
    setRoomDetectionWarnings([...detection.warnings, ...reconciled.warnings]);
    return reconciled.rooms;
  };

  const updateLevel = (
    change,
    record = true
  ) => {
    if (record) {
      setHistory(current => [
        ...current.slice(-29),
        {
          kind: 'level',
          value: level,
        },
      ]);
    }

    const nextLevel = {
      ...level,
      ...change,
    };

    if (record && topologySignature(nextLevel) !== topologySignature(level)) {
      nextLevel.rooms = reconcileRoomsForLevel(nextLevel);
    }

    /*
     * Keep old doors/windows collections synchronized
     * until the rest of the project fully uses openings.
     */
    if (change.openings) {
      nextLevel.doors =
        change.openings.filter(
          opening =>
            opening.kind !== 'window'
        );

      nextLevel.windows =
        change.openings.filter(
          opening =>
            opening.kind === 'window'
        );
    }

    const points = openCorners(nextLevel);

    const dimensions = points.length
      ? {
        width_feet:
          Math.max(...points.map(point => point.x)) -
          Math.min(...points.map(point => point.x)),

        depth_feet:
          Math.max(...points.map(point => point.y)) -
          Math.min(...points.map(point => point.y)),
      }
      : {};

    onChange({
      ...building,
      ...dimensions,

      levels: building.levels.map(item =>
        item.id === level.id
          ? nextLevel
          : item
      ),
    });
  };

  const updateBuilding = (
    change,
    record = true
  ) => {
    if (record) {
      setHistory(current => [
        ...current.slice(-29),
        {
          kind: 'building',
          value: building,
        },
      ]);
    }

    onChange({
      ...building,
      ...change,
    });
  };

  const replaceWall = (
    wallId,
    replacement,
    record = true
  ) => {
    const isOutline =
      level.outline.some(
        wall => wall.id === wallId
      );

    if (isOutline) {
      updateLevel(
        {
          outline:
            level.outline.map(wall =>
              wall.id === wallId
                ? replacement
                : wall
            ),
        },
        record
      );

      return;
    }

    updateLevel(
      {
        walls:
          level.walls.map(wall =>
            wall.id === wallId
              ? replacement
              : wall
          ),
      },
      record
    );
  };

  const updateSelection = patch => {
    if (!selection || !selected) return;

    switch (selection.kind) {
      case 'wall':
        replaceWall(
          selected.id,
          {
            ...selected,
            ...patch,
          }
        );
        break;

      case 'opening':
        updateLevel({
          openings:
            level.openings.map(item =>
              item.id === selected.id
                ? {
                  ...item,
                  ...patch,
                }
                : item
            ),
        });
        break;

      case 'stair':
        updateLevel({
          stairs:
            level.stairs.map(item =>
              item.id === selected.id
                ? {
                  ...item,
                  ...patch,
                }
                : item
            ),
        });
        break;

      case 'hatch':
        updateLevel({
          hatches:
            level.hatches.map(item =>
              item.id === selected.id
                ? {
                  ...item,
                  ...patch,
                }
                : item
            ),
        });
        break;

      case 'ladder':
        updateLevel({
          ladders:
            level.ladders.map(item =>
              item.id === selected.id
                ? {
                  ...item,
                  ...patch,
                }
                : item
            ),
        });
        break;

      case 'floor_void':
        updateLevel({
          floor_voids:
            level.floor_voids.map(item =>
              item.id === selected.id
                ? {
                  ...item,
                  ...patch,
                }
                : item
            ),
        });
        break;

      case 'platform':
        updateLevel({
          platforms:
            level.platforms.map(item =>
              item.id === selected.id
                ? {
                  ...item,
                  ...patch,
                }
                : item
            ),
        });
        break;

      case 'fireplace':
        updateLevel({
          fireplaces:
            level.fireplaces.map(item =>
              item.id === selected.id
                ? {
                  ...item,
                  ...patch,
                }
                : item
            ),
        });
        break;

      case 'chimney':
        updateBuilding({
          chimneys:
            building.chimneys.map(item =>
              item.id === selected.id
                ? {
                  ...item,
                  ...patch,
                }
                : item
            ),
        });
        break;

      default:
        break;
    }
  };

  const deleteSelection = () => {
    if (!selection || !selected) return;

    switch (selection.kind) {
      case 'wall': {
        const isOutline =
          level.outline.some(
            wall => wall.id === selected.id
          );

        if (isOutline) {
          setError(
            'Exterior footprint segments cannot be deleted individually. Redraw the footprint instead.'
          );

          return;
        }

        updateLevel({
          walls:
            level.walls.filter(
              wall =>
                wall.id !== selected.id
            ),

          openings:
            level.openings.filter(
              opening =>
                opening.wall_id !== selected.id
            ),
        });

        break;
      }

      case 'opening':
        updateLevel({
          openings:
            level.openings.filter(
              item =>
                item.id !== selected.id
            ),
        });
        break;

      case 'stair':
        updateLevel({
          stairs:
            level.stairs.filter(
              item =>
                item.id !== selected.id
            ),
        });
        break;

      case 'hatch':
        updateLevel({
          hatches:
            level.hatches.filter(
              item =>
                item.id !== selected.id
            ),
        });
        break;

      case 'ladder':
        updateLevel({
          ladders:
            level.ladders.filter(
              item =>
                item.id !== selected.id
            ),
        });
        break;

      case 'floor_void':
        if (selected.kind === 'open_to_sky') {
          updateBuilding(removeSkyCourtyard(building, selected.id));
        } else {
          updateLevel({ floor_voids: level.floor_voids.filter(item => item.id !== selected.id) });
        }
        break;

      case 'room':
        updateLevel({ rooms: (level.rooms || []).filter(item => item.id !== selected.id) });
        break;

      case 'platform':
        updateLevel({
          platforms:
            level.platforms.filter(
              item =>
                item.id !== selected.id
            ),
        });
        break;

      case 'fireplace':
        updateLevel({
          fireplaces:
            level.fireplaces.filter(
              item =>
                item.id !== selected.id
            ),
        });
        break;

      case 'chimney':
        updateBuilding({
          chimneys:
            building.chimneys.filter(
              item =>
                item.id !== selected.id
            ),

          levels:
            building.levels.map(
              item => ({
                ...item,

                fireplaces:
                  (item.fireplaces || [])
                    .filter(
                      fireplace =>
                        fireplace.chimney_id !==
                        selected.id
                    ),
              })
            ),
        });
        break;

      default:
        return;
    }

    setSelection(null);
  };

  const undoFloorEdit = () => {
    const previous = history[history.length - 1];
    if (!previous) return;

    const restoredBuilding = previous.kind === 'building'
      ? previous.value
      : building;
    const restoredLevel = previous.kind === 'level'
      ? previous.value
      : restoredBuilding.levels.find(item => item.id === level.id);

    if (previous.kind === 'building') {
      onChange(previous.value);
    } else if (previous.kind === 'level') {
      updateLevel(previous.value, false);
    }

    setHistory(current => current.slice(0, -1));

    if (selection) {
      const collectionByKind = {
        opening: restoredLevel?.openings,
        stair: restoredLevel?.stairs,
        hatch: restoredLevel?.hatches,
        ladder: restoredLevel?.ladders,
        floor_void: restoredLevel?.floor_voids,
        platform: restoredLevel?.platforms,
        fireplace: restoredLevel?.fireplaces,
        chimney: restoredBuilding.chimneys,
        wall: [...(restoredLevel?.outline || []), ...(restoredLevel?.walls || [])]
      };
      const remains = (collectionByKind[selection.kind] || [])
        .some(item => item.id === selection.id);
      if (!remains) setSelection(null);
    }
  };

  const handleEditorKeyDown = event => {
    const key =
      event.key.toLowerCase();

    const target =
      event.target;

    const isEditing =
      target instanceof HTMLElement &&
      (
        target.matches(
          'input, textarea, select'
        ) ||
        target.isContentEditable
      );

    if (
      (
        key === 'delete' ||
        key === 'backspace'
      ) &&
      !isEditing &&
      selection
    ) {
      event.preventDefault();
      event.stopPropagation();

      deleteSelection();

      return;
    }

    if (
      key === 'z' &&
      (event.ctrlKey || event.metaKey) &&
      !isEditing &&
      history.length
    ) {
      event.preventDefault();
      event.stopPropagation();
      undoFloorEdit();
      return;
    }

    if (
      key === 'escape' &&
      !isEditing
    ) {
      event.preventDefault();
      event.stopPropagation();

      setSelection(null);
      setDraft([]);
      setCurveWallId(null);

      return;
    }

    if (!MOVEMENT_KEYS.has(key)) {
      return;
    }

    event.stopPropagation();

    if (isEditing) return;

    event.preventDefault();

    setView(
      ([
        x,
        y,
        viewWidth,
        viewHeight,
      ]) => {
        const step =
          Math.min(
            viewWidth,
            viewHeight
          ) * 0.05;

        switch (key) {
          case 'arrowleft':
          case 'a':
            return [
              x - step,
              y,
              viewWidth,
              viewHeight,
            ];

          case 'arrowright':
          case 'd':
            return [
              x + step,
              y,
              viewWidth,
              viewHeight,
            ];

          case 'arrowup':
          case 'w':
            return [
              x,
              y - step,
              viewWidth,
              viewHeight,
            ];

          case 'arrowdown':
          case 's':
            return [
              x,
              y + step,
              viewWidth,
              viewHeight,
            ];

          default:
            return [
              x,
              y,
              viewWidth,
              viewHeight,
            ];
        }
      }
    );
  };

  const handleEditorKeyUp = event => {
    if (
      MOVEMENT_KEYS.has(
        event.key.toLowerCase()
      )
    ) {
      event.stopPropagation();
    }
  };

  const fit = (
    image = level.floor_map
  ) => {
    const pts = [
      ...openCorners(level),
      ...(belowLevel ? openCorners(belowLevel) : []),

      ...(image
        ? [
          {
            x:
              (image.x || 0) -
              image.width_feet / 2,

            y:
              (image.y || 0) -
              image.height_feet / 2,
          },
          {
            x:
              (image.x || 0) +
              image.width_feet / 2,

            y:
              (image.y || 0) +
              image.height_feet / 2,
          },
        ]
        : []),
    ];

    const minX =
      Math.min(
        0,
        ...pts.map(point => point.x)
      );

    const maxX =
      Math.max(
        10,
        ...pts.map(point => point.x)
      );

    const minY =
      Math.min(
        0,
        ...pts.map(point => point.y)
      );

    const maxY =
      Math.max(
        10,
        ...pts.map(point => point.y)
      );

    const size =
      Math.max(
        maxX - minX,
        maxY - minY
      ) * 1.3;

    setView([
      (minX + maxX - size) / 2,
      -(minY + maxY + size) / 2,
      size,
      size,
    ]);
  };

  const createWallIdFactory = () => {
    const ids = new Set([...allWalls, ...draftArcs].map(wall => wall.id));
    return () => {
      const base = blueprintId();
      let id = base;
      let suffix = 1;
      while (ids.has(id)) {
        id = `${base}-${suffix++}`;
      }
      ids.add(id);
      return id;
    };
  };

  const point = (event, snap = true) => {
    const svg =
      event.currentTarget.ownerSVGElement ||
      event.currentTarget;

    const svgPoint =
      svg.createSVGPoint();

    svgPoint.x =
      event.clientX;

    svgPoint.y =
      event.clientY;

    const matrix =
      svg.getScreenCTM();

    if (!matrix) {
      return {
        x: 0,
        y: 0,
      };
    }

    const local =
      svgPoint.matrixTransform(
        matrix.inverse()
      );

    return {
      x:
        snap ? Math.round(local.x * 2) / 2 : local.x,

      y:
        snap ? -Math.round(local.y * 2) / 2 : -local.y,
    };
  };

  const selectAt = (p, commit = true) => {
    const choose = nextSelection => {
      if (commit) setSelection(nextSelection);
      return nextSelection;
    };
    /*
     * Openings first, because they sit directly
     * on top of walls.
     */
    let bestOpening = null;

    level.openings.forEach(opening => {
      const wall =
        allWalls.find(
          item =>
            item.id === opening.wall_id
        );

      if (!wall) return;

      const center =
        wallPointAtDistance(
          wall,
          opening.distance_from_start
        );

      const distance =
        Math.hypot(
          p.x - center.x,
          p.y - center.y
        );

      const tolerance =
        Math.max(
          2,
          opening.width / 2 + 0.75
        );

      if (
        distance <= tolerance &&
        (
          !bestOpening ||
          distance <
          bestOpening.distance
        )
      ) {
        bestOpening = {
          opening,
          distance,
        };
      }
    });

    if (bestOpening) {
      return choose({
        kind: 'opening',
        id:
          bestOpening.opening.id,
      });
    }

    /*
     * Stairs use their complete generated centerline,
     * which supports straight, landing, and curved stairs.
     */
    for (const stair of level.stairs) {
      const points =
        stairCenterline(
          stair,
          level.floor_height
        );

      let distance = Infinity;

      for (
        let i = 0;
        i < points.length - 1;
        i++
      ) {
        distance =
          Math.min(
            distance,

            distanceToSegment(
              p,
              points[i],
              points[i + 1]
            )
          );
      }

      if (
        distance <=
        (stair.width || 3) / 2 + 1
      ) {
        return choose({
          kind: 'stair',
          id: stair.id,
        });
      }
    }

    const rectangleHit = (
      item,
      padding = 0.75
    ) =>
      Math.abs(
        p.x - item.x
      ) <=
      item.width / 2 +
      padding &&
      Math.abs(
        p.y - item.y
      ) <=
      item.depth / 2 +
      padding;

    const hatch =
      level.hatches.find(
        item =>
          rectangleHit(item)
      );

    if (hatch) {
      return choose({
        kind: 'hatch',
        id: hatch.id,
      });
    }

    const ladder =
      level.ladders.find(
        item =>
          rectangleHit(item)
      );

    if (ladder) {
      return choose({
        kind: 'ladder',
        id: ladder.id,
      });
    }

    let bestFireplace = null;

    level.fireplaces.forEach(
      fireplace => {
        const chimney =
          building.chimneys.find(
            item =>
              item.id ===
              fireplace.chimney_id
          );

        if (!chimney) return;

        const marker =
          fireplacePosition(
            chimney,
            fireplace,
            0
          );

        const distance =
          Math.hypot(
            p.x - marker.x,
            p.y - marker.y
          );

        if (
          distance <=
          Math.max(
            1.5,
            fireplace.width /
            2
          ) &&
          (
            !bestFireplace ||
            distance <
            bestFireplace.distance
          )
        ) {
          bestFireplace = {
            fireplace,
            distance,
          };
        }
      }
    );

    if (bestFireplace) {
      return choose({
        kind: 'fireplace',
        id:
          bestFireplace.fireplace.id,
      });
    }

    const chimney =
      activeChimneys.find(
        item =>
          pointInPolygon(
            p,
            chimneyPolygon(
              item,
              0.5
            )
          )
      );

    if (chimney) {
      return choose({
        kind: 'chimney',
        id: chimney.id,
      });
    }

    const platform =
      level.platforms.find(
        item =>
          item.points?.length >= 3 &&
          pointInPolygon(
            p,
            item.points
          )
      );

    if (platform) {
      return choose({
        kind: 'platform',
        id: platform.id,
      });
    }

    const floorVoid =
      level.floor_voids.find(
        item =>
          item.points?.length >= 3 &&
          pointInPolygon(
            p,
            item.points
          )
      );

    if (floorVoid) {
      return choose({
        kind: 'floor_void',
        id: floorVoid.id,
      });
    }

    const wall =
      nearestWall(
        level,
        p
      );

    if (
      wall &&
      wall.error <=
      Math.max(
        2,
        (wall.wall.thickness || 0.5) /
        2 +
        1
      )
    ) {
      return choose({
        kind: 'wall',
        id: wall.wall.id,
      });
    }

    return choose(null);
  };

  const moveSelectedElement = (movement, p) => {
    const dx = p.x - movement.point.x;
    const dy = p.y - movement.point.y;
    const element = movement.element;

    if (movement.selection.kind === 'wall') {
      const outline = movement.level.outline || [];
      const sourceWall = [...outline, ...(movement.level.walls || [])]
        .find(wall => wall.id === element.id);
      if (!sourceWall) return;

      const isOutline = outline.some(wall => wall.id === element.id);
      const matchesEndpoint = (candidate, endpoint) =>
        Math.abs(candidate.x - endpoint.x) < 0.001 &&
        Math.abs(candidate.y - endpoint.y) < 0.001;
      const moveWalls = (walls, originalWalls) => walls.map(wall => {
        const originalWall = originalWalls.find(item => item.id === wall.id) || wall;
        if (!isOutline) {
          if (wall.id !== element.id) return wall;
          return {
            ...wall,
            start: { ...originalWall.start, x: originalWall.start.x + dx, y: originalWall.start.y + dy },
            end: { ...originalWall.end, x: originalWall.end.x + dx, y: originalWall.end.y + dy },
            ...(originalWall.center ? { center: { ...originalWall.center, x: originalWall.center.x + dx, y: originalWall.center.y + dy } } : {})
          };
        }

        const moveStart = matchesEndpoint(originalWall.start, sourceWall.start)
          || matchesEndpoint(originalWall.start, sourceWall.end);
        const moveEnd = matchesEndpoint(originalWall.end, sourceWall.start)
          || matchesEndpoint(originalWall.end, sourceWall.end);
        if (!moveStart && !moveEnd && wall.id !== element.id) return wall;

        return {
          ...wall,
          start: moveStart ? { ...originalWall.start, x: originalWall.start.x + dx, y: originalWall.start.y + dy } : wall.start,
          end: moveEnd ? { ...originalWall.end, x: originalWall.end.x + dx, y: originalWall.end.y + dy } : wall.end,
          ...(wall.id === element.id && originalWall.center
            ? { center: { ...originalWall.center, x: originalWall.center.x + dx, y: originalWall.center.y + dy } }
            : {})
        };
      });

      updateLevel({
        outline: isOutline ? moveWalls(level.outline || [], movement.level.outline || []) : level.outline,
        walls: isOutline ? level.walls : moveWalls(level.walls || [], movement.level.walls || [])
      }, false);
      return;
    }

    if (movement.selection.kind === 'opening') {
      const hostWall = [...(movement.level.outline || []), ...(movement.level.walls || [])]
        .find(wall => wall.id === element.wall_id);
      const nearest = hostWall
        ? nearestWall({ outline: [], walls: [hostWall] }, p)
        : null;
      if (!nearest) return;

      updateLevel({
        openings: level.openings.map(opening => opening.id === element.id
          ? { ...opening, distance_from_start: nearest.distance_from_start }
          : opening)
      }, false);
      return;
    }

    if (movement.selection.kind === 'stair') {
      updateLevel({
        stairs: level.stairs.map(stair => stair.id === element.id
          ? { ...element, start_x: element.start_x + dx, start_y: element.start_y + dy }
          : stair)
      }, false);
      return;
    }

    if (['hatch', 'ladder'].includes(movement.selection.kind)) {
      const collection = movement.selection.kind === 'hatch' ? 'hatches' : 'ladders';
      updateLevel({
        [collection]: (level[collection] || []).map(item => item.id === element.id
          ? { ...element, x: element.x + dx, y: element.y + dy }
          : item)
      }, false);
      return;
    }

    if (['platform', 'floor_void'].includes(movement.selection.kind)) {
      const collection = movement.selection.kind === 'platform' ? 'platforms' : 'floor_voids';
      updateLevel({
        [collection]: (level[collection] || []).map(item => item.id === element.id
          ? { ...element, points: element.points.map(value => ({ ...value, x: value.x + dx, y: value.y + dy })) }
          : item)
      }, false);
      return;
    }

    if (movement.selection.kind === 'chimney' || movement.selection.kind === 'fireplace') {
      const chimneyId = movement.selection.kind === 'chimney' ? element.id : element.chimney_id;
      const sourceChimney = movement.building.chimneys.find(item => item.id === chimneyId);
      if (!sourceChimney) return;

      updateBuilding({
        chimneys: building.chimneys.map(item => item.id === chimneyId
          ? { ...sourceChimney, x: sourceChimney.x + dx, y: sourceChimney.y + dy }
          : item)
      }, false);
    }
  };

  const click = event => {
    if (busy) return;

    if (tool === 'align') {
      return;
    }

    const p = point(event, tool !== 'calibrate-image');
    const nextWallId = createWallIdFactory();
    const suppressedClick = suppressElementClickRef.current;
    suppressElementClickRef.current = null;
    if (
      suppressedClick &&
      Date.now() - suppressedClick.time < 250 &&
      Math.hypot(p.x - suppressedClick.point.x, p.y - suppressedClick.point.y) < 1
    ) {
      return;
    }

    setError('');

    if (tool === 'calibrate-image') {
      if (!map) return;
      setCalibrationPoints(current => current.length >= 2 ? [p] : [...current, p]);
      return;
    }

    if (tool === 'select') {
      selectAt(p);
      return;
    }

    if (tool === 'room' || tool === 'room-redraw') {
      const nearest = nearestWall(level, p);
      if (!nearest || nearest.error > Math.max(3, (nearest.wall.thickness || 0.5) / 2 + 1.5)) {
        setError('Click an existing wall to add or remove it from the room boundary.');
        return;
      }
      setRoomBoundaryWallIds(current => current.includes(nearest.wall.id)
        ? current.filter(id => id !== nearest.wall.id)
        : [...current, nearest.wall.id]);
      return;
    }

    const snapReferencePoint = candidate => {
      const result = snapPointToOutline(candidate, allWalls, 2);
      return result.snapped ? result.point : candidate;
    };

    if (
      ['footprint', 'wall'].includes(tool) &&
      segmentMode === 'curve'
    ) {
      if (!curveWallId) {
        const result =
          nearestWall(
            level,
            p,
            {
              outlineOnly: tool === 'footprint',
            }
          );

        if (
          !result ||
          result.error > 5
        ) {
          setError(
            `Click a ${tool === 'footprint' ? 'footprint' : 'wall'} segment first.`
          );

          return;
        }

        setCurveWallId(
          result.wall.id
        );

        setSelection({
          kind: 'wall',
          id: result.wall.id,
        });

        return;
      }

      const wall = allWalls.find(item => item.id === curveWallId);

      if (!wall) {
        setCurveWallId(null);
        return;
      }

      const arc =
        arcFromThreePoints(
          wall.start,
          wall.end,
          snapReferencePoint(p),
          {
            ...wall,
            id: wall.id,
            thickness: wall.thickness,
          }
        );

      if (!arc) {
        setError(
          'Move the curve point away from the straight segment.'
        );

        return;
      }

      replaceWall(
        wall.id,
        arc
      );

      setCurveWallId(null);

      return;
    }

    if (
      ['footprint', 'wall'].includes(tool) &&
      segmentMode === 'arc'
    ) {
      const snappedPoint = snapReferencePoint(p);
      const points = [...arcDraft, snappedPoint];
      if (points.length < 3) {
        setArcDraft(points);
        if (tool === 'footprint') {
          setDraft(current => {
            if (!current.length) return [snappedPoint];
            return current;
          });
        } else {
          setDraft(points);
        }
        return;
      }

      const [start, end, through] = points;
      const arc = arcFromThreePoints(
        start,
        end,
        through,
        {
          id: nextWallId(),
          thickness: wallThickness,
          material: tool === 'footprint'
            ? level.exterior_material || 'existing'
            : level.interior_material || 'existing',
        }
      );
      if (!arc) {
        setError('Choose three non-collinear points to draw an arc.');
        setArcDraft(points.slice(0, 2));
        return;
      }

      if (tool === 'footprint') {
        const path = [...draft];
        const samePoint = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.001;
        if (!path.length) path.push(start);
        if (!samePoint(path[path.length - 1], start)) path.push(start);
        if (!samePoint(path[path.length - 1], end)) path.push(end);
        setDraft(path);
        setDraftArcs(current => [...current, arc]);
      } else {
        updateLevel({ walls: [...level.walls, arc] });
        setSelection({ kind: 'wall', id: arc.id });
      }

      setArcDraft([]);
      setArcPointerPoint(null);
      if (tool === 'wall') setDraft([]);
      else setArcDraft([end]);
      return;
    }

    if (tool === 'circle') {
      if (!draft.length) {
        setDraft([p]);
        return;
      }

      const center = draft[0];
      const radius = Math.hypot(p.x - center.x, p.y - center.y);
      if (radius < 1) {
        setError('Choose a radius of at least 1 ft.');
        return;
      }

      const circleArcs = Array.from({ length: 4 }, (_, index) => {
        const startAngle = index * Math.PI / 2;
        const endAngle = (index + 1) * Math.PI / 2;
        const pointAt = radians => ({
          x: center.x + Math.cos(radians) * radius,
          y: center.y + Math.sin(radians) * radius,
        });

        return arcFromThreePoints(
          pointAt(startAngle),
          pointAt(endAngle),
          pointAt((startAngle + endAngle) / 2),
          {
            id: nextWallId(),
            thickness: wallThickness,
            material: circleDestination === 'footprint'
              ? level.exterior_material || 'existing'
              : level.interior_material || 'existing',
          }
        );
      });

      if (circleArcs.some(arc => !arc)) {
        setError('Could not create a circle at that radius.');
        return;
      }

      if (circleDestination === 'footprint') {
        updateLevel({
          corners: circleArcs.map(arc => arc.start),
          outline: circleArcs,
          closed: true,
          openings: [],
        });
        setSelection(null);
      } else {
        updateLevel({ walls: [...level.walls, ...circleArcs] });
        setSelection({ kind: 'wall', id: circleArcs[0].id });
      }

      setDraft([]);
      setTool('select');
      return;
    }

    if (
      tool === 'footprint' ||
      tool === 'open-below' ||
      tool === 'open-sky' ||
      tool === 'platform'
    ) {
      let draftPoint = p;
      let snappedBelow = false;

      if (
        tool === 'footprint' &&
        snapToBelow &&
        belowLevel
      ) {
        const snapped =
          snapPointToLevelBelow(
            building,
            level,
            p,
            snapTolerance
          );

        if (snapped.snapped) {
          draftPoint =
            snapped.point;
          snappedBelow = true;
        }
      }

      if (
        tool === 'footprint' &&
        snapWallAngles &&
        draft.length &&
        !snappedBelow
      ) {
        draftPoint = snapPointToRightAngle(
          draft[draft.length - 1],
          draftPoint
        );
      }

      setDraft(current => [
        ...current,
        draftPoint,
      ]);

      return;
    }

    if (tool === 'roof') {
      if (roofRingTarget === 'outer') setDraft(current => [...current, p]);
      else setRoofDraftHoles(current => current.map((ring, index) =>
        index === roofRingTarget ? [...ring, p] : ring));
      return;
    }

    if (tool === 'wall') {
      if (!draft.length) {
        const snapped = snapPointToOutline(p, allWalls, 2);
        setDraft([snapped.snapped ? snapped.point : p]);
        setConnectionMarker(snapped.snapped ? snapped.point : null);
        return;
      }

      if (
        Math.hypot(
          p.x - draft[0].x,
          p.y - draft[0].y
        ) > 0.5
      ) {
        updateLevel({
          walls: [
            ...level.walls,
            {
              id:
                nextWallId(),
              type: 'line',
              start: draft[0],
              end: (() => {
                const snapped = snapPointToOutline(p, allWalls, 2);
                return snapped.snapped ? snapped.point : snapWallAngles ? snapPointToRightAngle(draft[0], p) : p;
              })(),
              thickness:
                wallThickness,
              material:
                level.interior_material || 'existing',
            },
          ],
        });

        setDraft([]);
      }

      return;
    }

    const openingKind =
      OPENING_TOOLS[tool];

    if (openingKind) {
      const isWindow =
        openingKind === 'window';

      const openingWidth =
        openingKind ===
          'double_door'
          ? Math.max(width, 5)
          : width;

      const properties = {};

      if (
        openingKind === 'door' ||
        openingKind ===
        'double_door'
      ) {
        properties.operation =
          doorOperation;

        properties.hinge_side =
          openingKind ===
            'double_door'
            ? 'outer'
            : hingeSide;

        if (
          doorOperation ===
          'hinged'
        ) {
          properties.swing_side =
            swingSide;
        }
      }

      if (
        openingKind ===
        'curtain'
      ) {
        properties.operation =
          'curtain';
      }

      const opening =
        snapOpening(
          level,
          p,
          openingKind,
          openingWidth,

          isWindow
            ? 4
            : 7,

          isWindow
            ? 3
            : 0,

          properties
        );

      if (!opening) {
        setError(
          'Click within 5 ft of a wall with enough room. Openings cannot overlap.'
        );

        return;
      }

      updateLevel({
        openings: [
          ...level.openings,
          opening,
        ],
      });

      setSelection({
        kind: 'opening',
        id: opening.id,
      });

      return;
    }

    if (tool === 'fireplace') {
      const existing =
        nearestChimney(
          building,
          level,
          p,
          2
        );

      let chimney;

      if (existing) {
        chimney =
          existing.chimney;
      } else {
        chimney = {
          id:
            blueprintId(),

          x:
            p.x,

          y:
            p.y,

          width:
            chimneyWidth,

          depth:
            chimneyDepth,

          base_level_id:
            level.id,

          top_level_id:
            null,
        };
      }

      const fireplace = {
        id:
          blueprintId(),

        chimney_id:
          chimney.id,

        side:
          fireplaceSide,

        width:
          fireplaceWidth,

        opening_height:
          fireplaceOpeningHeight,
      };

      setHistory(current => [
        ...current.slice(-29),
        {
          kind: 'building',
          value: building,
        },
      ]);

      const nextChimneys =
        existing
          ? building.chimneys
          : [
            ...building.chimneys,
            chimney,
          ];

      onChange({
        ...building,

        chimneys:
          nextChimneys,

        levels:
          building.levels.map(
            item =>
              item.id ===
                level.id
                ? {
                  ...item,

                  fireplaces: [
                    ...(item.fireplaces || []),
                    fireplace,
                  ],
                }
                : item
          ),
      });

      setSelection({
        kind: 'fireplace',
        id: fireplace.id,
      });

      setTool('select');

      return;
    }

    if (tool === 'stairs') {
      if (!draft.length) {
        setDraft([p]);
        return;
      }

      const start =
        draft[0];

      const dx =
        p.x - start.x;

      const dy =
        p.y - start.y;

      if (
        Math.hypot(
          dx,
          dy
        ) < 0.5
      ) {
        setError(
          'Move the pointer away from the stair base to choose an upward direction.'
        );

        return;
      }

      /*
       * Direction always means UP.
       */
      const direction =
        Math.atan2(
          dy,
          dx
        );

      const stair = {
        id:
          blueprintId(),

        shape:
          stairShape,

        start_x:
          start.x,

        start_y:
          start.y,

        width,

        direction,

        length:
          stairRun,

        total_rise_feet:
          stairTotalRise ?? defaultStairRise,

        material:
          stairMaterial,

        landing_count:
          stairLandingCount,

        flight_shares:
          normalizeFlightShares(stairFlightShares, stairLandingCount + 1),

        landing_depth:
          stairLandingDepth,

        turn_degrees:
          stairTurnDegrees,

        curve_radius:
          stairCurveRadius,

        curve_degrees:
          stairCurveDegrees,
      };

      updateLevel({
        stairs: [
          ...level.stairs,
          stair,
        ],
      });

      setAngle(
        direction *
        180 /
        Math.PI
      );

      setDraft([]);

      setTool('select');

      setSelection({
        kind: 'stair',
        id: stair.id,
      });

      return;
    }

    if (
      tool === 'hatch' ||
      tool === 'ladder'
    ) {
      const corners =
        openCorners(level);

      const half =
        width / 2;

      const elementCorners = [
        {
          x: p.x - half,
          y: p.y - half,
        },
        {
          x: p.x + half,
          y: p.y - half,
        },
        {
          x: p.x + half,
          y: p.y + half,
        },
        {
          x: p.x - half,
          y: p.y + half,
        },
      ];

      const inside =
        elementCorners.every(
          corner =>
            pointInPolygon(
              corner,
              corners
            )
        );

      if (!inside) {
        setError(
          'Place the entire element inside the footprint.'
        );

        return;
      }

      const element = {
        id:
          blueprintId(),
        x: p.x,
        y: p.y,
        width,
        depth: width,
      };

      if (tool === 'hatch') {
        updateLevel({
          hatches: [
            ...level.hatches,
            element,
          ],
        });

        setSelection({
          kind: 'hatch',
          id: element.id,
        });
      } else {
        updateLevel({
          ladders: [
            ...level.ladders,
            element,
          ],
        });

        setSelection({
          kind: 'ladder',
          id: element.id,
        });
      }
    }
  };

  const chooseLevel = id => {
    onChange({
      ...building,
      visible_level_id: id,
      level_view: building.level_view || 'all',
    });

    setDraft([]);
    setHistory([]);
    setError('');
    setSelection(null);
    setCurveWallId(null);
    setArcDraft([]);
    setDraftArcs([]);
    setRoomBoundaryWallIds([]);
    setRoofDraftTemplate(null);
    setRoofDraftHoles([]);
    setRoofRingTarget('outer');
    if (open) setTool('select');
  };

  const upload =
    async event => {
      const file =
        event.target.files?.[0];

      event.target.value = '';

      if (!file) return;

      setBusy(true);
      setError('');

      try {
        const image =
          await uploadImage(
            file,
            level
          );

        updateLevel({
          floor_map: image,
        });

        fit(image);

        setTool('align');
        setImagePlacementOpen(true);
      } catch (e) {
        setError(
          e.response?.data?.message ||
          e.message ||
          'Upload failed. Please try again.'
        );
      } finally {
        setBusy(false);
      }
    };

  const map =
    level.floor_map;

  const applyImageCalibration = () => {
    if (!map || calibrationPoints.length !== 2 || !(calibrationDistance > 0)) return;
    const measured = Math.hypot(
      calibrationPoints[1].x - calibrationPoints[0].x,
      calibrationPoints[1].y - calibrationPoints[0].y
    );
    if (measured < 0.01) {
      setError('Choose two distinct grid intersections on the reference image.');
      return;
    }
    const scale = calibrationDistance / measured;
    const anchor = calibrationPoints[0];
    const calibrated = {
      ...map,
      width_feet: map.width_feet * scale,
      height_feet: map.height_feet * scale,
      x: anchor.x + ((map.x || 0) - anchor.x) * scale,
      y: anchor.y + ((map.y || 0) - anchor.y) * scale,
    };
    updateLevel({ floor_map: calibrated });
    fit(calibrated);
    setCalibrationPoints([]);
    setTool('align');
  };

  const guides =
    levelConnectionGuides(
      building,
      level
    );

  const numberField = (
    label,
    value,
    change,
    min,
    max,
    step = 0.5
  ) => (
    <label key={label}>
      {label}

      <input
        type="number"
        value={value ?? 0}
        min={min}
        max={max}
        step={step}
        onChange={event => {
          if (
            event.target.value === ''
          ) {
            return;
          }

          const number =
            Number(
              event.target.value
            );

          if (
            !Number.isFinite(
              number
            )
          ) {
            return;
          }

          change(
            Math.max(
              min ?? -Infinity,
              Math.min(
                max ?? Infinity,
                number
              )
            )
          );
        }}
      />
    </label>
  );

  const rangeField = (
    label,
    value,
    change,
    min,
    max,
    step = 0.5
  ) => {
    const current = Math.max(
      min,
      Math.min(max, Number.isFinite(value) ? value : min)
    );
    const update = raw => {
      if (raw === '') return;
      const number = Number(raw);
      if (!Number.isFinite(number)) return;
      change(Math.max(min, Math.min(max, number)));
    };

    return (
      <label key={label} className="blueprint-range-field">
        <span>{label}</span>
        <div className="blueprint-range-control">
          <input
            aria-label={label}
            type="number"
            value={current}
            min={min}
            max={max}
            step={step}
            onChange={event => update(event.target.value)}
          />
          <input
            aria-label={`${label} slider`}
            type="range"
            value={current}
            min={min}
            max={max}
            step={step}
            onChange={event => update(event.target.value)}
          />
        </div>
      </label>
    );
  };

  const flightShareFields = (shares, change) => (
    <div className="blueprint-flight-shares" aria-label="Stair flight distribution">
      <strong>Flight distribution · 100%</strong>
      {normalizeFlightShares(shares, shares?.length || 1).map((value, index) => (
        <label key={`flight-share-${index}`} className={activeStairFlight === index ? 'is-active' : ''}>
          <span>Flight {index + 1} <b>{value.toFixed(1)}%</b></span>
          <input
            aria-label={`Flight ${index + 1} share`}
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={value}
            onFocus={() => setActiveStairFlight(index)}
            onPointerDown={() => setActiveStairFlight(index)}
            onChange={event => change(redistributeFlightShares(shares, index, Number(event.target.value)))}
          />
        </label>
      ))}
    </div>
  );

  const imageRangeField = (
    label,
    key,
    min,
    max,
    step = 0.5
  ) => rangeField(
    label,
    map?.[key] ?? (key === 'opacity' ? 0.6 : key.includes('feet') ? 1 : 0),
    value =>
      updateLevel(
        {
          floor_map: {
            ...map,
            [key]: value,
          },
        },
        false
      ),
    min,
    max,
    step
  );

  const chooseTool = value => {
    setTool(value);
    if (value !== 'room-redraw') setRoomRedrawId(null);
    if (value !== 'stairs') setActiveStairFlight(null);
    setDraft([]);
    setCalibrationPoints([]);
    setArcDraft([]);
    setDraftArcs([]);
    setRoomBoundaryWallIds([]);
    setSegmentMode('line');
    setError('');
    setCurveWallId(null);

    if (value !== 'roof') setRoofDraftTemplate(null);

    if (value === 'align' || value === 'calibrate-image') {
      setImagePlacementOpen(true);
    } else if (tool === 'align' && !imagePlacementPinned) {
      setImagePlacementOpen(false);
    }

    if (value !== 'select') {
      setSelection(null);
    }
    setArcPointerPoint(null);
  };

  const requestRoofChange = nextBuilding => {
    const currentAuthoredIds = new Set((building.roofs || []).map(roof => roof.id));
    const automaticRoofs = automaticRoofFootprints(building);
    const automaticIds = new Set(automaticRoofs.map(roof => roof.id));
    const currentRoofs = [...(building.roofs || []), ...automaticRoofs];
    const addedRoofs = (nextBuilding.roofs || []).filter(roof => !currentAuthoredIds.has(roof.id));
    const promotedAutomaticIds = addedRoofs
      .filter(roof => automaticIds.has(roof.id))
      .map(roof => roof.id);
    const normalizedBuilding = promotedAutomaticIds.length ? {
      ...nextBuilding,
      suppressed_automatic_roof_ids: [...new Set([
        ...(nextBuilding.suppressed_automatic_roof_ids || []),
        ...promotedAutomaticIds,
      ])],
    } : nextBuilding;
    const conflicts = addedRoofs.flatMap(newRoof => currentRoofs
      .filter(existingRoof => existingRoof.id !== newRoof.id &&
        roofFootprintOverlapRatio(existingRoof, newRoof) >= 0.8)
      .map(existingRoof => ({ existingRoof, newRoof })));

    if (conflicts.length) {
      setRoofConflict({ nextBuilding: normalizedBuilding, conflicts });
      return;
    }
    onChange(normalizedBuilding);
  };

  const finishRoof = () => {
    if (draft.length < 3) return;
    const supportLevel = belowLevel || level;
    const template = roofDraftTemplate || {
      id: blueprintId(),
      name: `${level.name} custom footprint roof`,
      support_level_id: supportLevel.id,
      visibility_level_id: belowLevel ? level.id : (levelAbove(building, level) || level).id,
      material: 'shingles',
      thickness: 0.5,
      elevation_offset: 0,
      rotation: 0,
    };
    const roof = {
      ...template,
      type: roofStyle,
      pitch: roofPitch,
      slope_direction: roofSlopeDirection,
      overhang: roofOverhang,
      footprint: draft.map(point => ({ ...point })),
      holes: roofDraftHoles.filter(ring => ring.length >= 3).map(ring => ring.map(point => ({ ...point }))),
    };
    const exists = building.roofs.some(item => item.id === roof.id);
    requestRoofChange({
      ...building,
      roofs: exists
        ? building.roofs.map(item => item.id === roof.id ? roof : item)
        : [...building.roofs, roof],
    });
    setRoofDraftTemplate(null);
    setRoofDraftHoles([]);
    setRoofRingTarget('outer');
    setDraft([]);
    setTool('select');
  };

  const openingColor = opening => {
    switch (opening.kind) {
      case 'window':
        return '#ff6b62';

      case 'archway':
        return '#c6a5ef';

      case 'curtain':
        return '#e7a8d8';

      case 'double_door':
        return '#ffd27d';

      default:
        return '#efb465';
    }
  };

  const renderOpening = opening => {
    const wall =
      allWalls.find(
        item =>
          item.id ===
          opening.wall_id
      );

    if (!wall) return null;

    const start =
      wallPointAtDistance(
        wall,
        opening.distance_from_start -
        opening.width / 2
      );

    const end =
      wallPointAtDistance(
        wall,
        opening.distance_from_start +
        opening.width / 2
      );

    const middle =
      wallPointAtDistance(
        wall,
        opening.distance_from_start
      );

    const isSelected =
      selection?.kind ===
      'opening' &&
      selection.id ===
      opening.id;

    return (
      <g key={opening.id}>
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={
            isSelected
              ? '#ffe08a'
              : openingColor(opening)
          }
          strokeWidth={
            isSelected
              ? 2
              : 1.2
          }
        />

        {opening.kind ===
          'double_door' && (
            <circle
              cx={middle.x}
              cy={middle.y}
              r="0.35"
              fill={
                openingColor(
                  opening
                )
              }
            />
          )}

        {opening.kind ===
          'curtain' && (
            <path
              d={`
              M ${start.x} ${start.y}
              Q ${middle.x} ${middle.y + 1}
              ${end.x} ${end.y}
            `}
              stroke={
                openingColor(
                  opening
                )
              }
              strokeWidth="0.35"
            />
          )}
      </g>
    );
  };

  const stairArrowPoints = geometry => {
    if (
      !geometry ||
      !geometry.segments.length
    ) {
      return null;
    }

    const segment =
      [...geometry.segments]
        .reverse()
        .find(
          item =>
            item.kind ===
            'flight'
        ) ||
      geometry.segments[
      geometry.segments.length -
      1
      ];

    const dx =
      segment.end.x -
      segment.start.x;

    const dy =
      segment.end.y -
      segment.start.y;

    const length =
      Math.hypot(dx, dy);

    if (length < 0.001) {
      return null;
    }

    const ux =
      dx / length;

    const uy =
      dy / length;

    const px =
      -uy;

    const py =
      ux;

    const back =
      Math.min(
        1.8,
        length * 0.35
      );

    const spread =
      Math.max(
        0.8,
        width * 0.28
      );

    return {
      end:
        segment.end,

      left: {
        x:
          segment.end.x -
          ux * back +
          px * spread,

        y:
          segment.end.y -
          uy * back +
          py * spread,
      },

      right: {
        x:
          segment.end.x -
          ux * back -
          px * spread,

        y:
          segment.end.y -
          uy * back -
          py * spread,
      },
    };
  };

  const renderSelectionEditor = () => {
    if (!selection || !selected) {
      return (
        <p>
          Select an element to edit or delete it.
        </p>
      );
    }

    if (selection.kind === 'room') {
      const updateRoom = changes => updateLevel({ rooms: (level.rooms || []).map(room =>
        room.id === selected.id ? { ...room, ...changes } : room) });
      const roomBoundary = selected.region || [];
      const boundaryWalls = allWalls.filter(wall => {
        const points = wallPolyline(wall, 1);
        return points.slice(0, -1).some((start, index) => {
          const end = points[index + 1];
          const midpoint = {
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2,
          };
          return roomBoundary.some((boundaryStart, boundaryIndex) =>
            distanceToSegment(
              midpoint,
              boundaryStart,
              roomBoundary[(boundaryIndex + 1) % roomBoundary.length]
            ) <= 0.15);
        });
      });
      const boundaryThicknesses = [...new Set(boundaryWalls.map(wall => wall.thickness))];
      const roomWallThickness = boundaryThicknesses.length === 1 ? boundaryThicknesses[0] : '';
      const updateBoundaryWallThickness = thickness => {
        const boundaryIds = new Set(boundaryWalls.map(wall => wall.id));
        updateLevel({
          outline: level.outline.map(wall => boundaryIds.has(wall.id) ? { ...wall, thickness } : wall),
          walls: level.walls.map(wall => boundaryIds.has(wall.id) ? { ...wall, thickness } : wall),
        });
      };
      return <>
        <h3>Selected room</h3>
        <label>Name<input aria-label="Room name" value={selected.name || ''} onChange={event => updateRoom({ name: event.target.value })} /></label>
        <label>Purpose<select aria-label="Room purpose" value={selected.purpose || 'Other'} onChange={event => {
          const purpose = event.target.value;
          updateRoom(defaultsForRoomPurpose(selected, purpose, building));
        }}>{Object.keys(ROOM_PURPOSES).map(purpose => <option key={purpose} value={purpose}>{purpose}</option>)}</select></label>
        <label>Capabilities<input aria-label="Room capabilities" value={(selected.activity_capabilities || []).join(', ')} onChange={event => updateRoom({ activity_capabilities: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })} /></label>
        <label>Access<select aria-label="Room access" value={selected.access_policy || 'public'} onChange={event => updateRoom({ access_policy: event.target.value })}>
          <option value="public">Public</option>
          <option value="residents">Residents only</option>
          <option value="staff">Staff only</option>
          <option value="restricted">Restricted</option>
          <option value="custom">Custom</option>
        </select></label>
        <label>Occupancy limit<input aria-label="Room occupancy limit" type="number" min="1" value={selected.occupancy_limit ?? ''} onChange={event => updateRoom({ occupancy_limit: event.target.value === '' ? null : Math.max(1, Number(event.target.value) || 1) })} /></label>
        <label>Floor material<select aria-label="Room floor material" value={selected.floor_material || ''} onChange={event => updateRoom({ floor_material: event.target.value || null })}>
          <option value="">Use level floor material</option>
          {FLOOR_FINISHES.map(finish => <option key={finish} value={finish}>{finishLabel(finish)}</option>)}
        </select></label>
        {boundaryWalls.length > 0 && <>
          {numberField(
            'Room wall thickness (ft)',
            roomWallThickness,
            updateBoundaryWallThickness,
            0.1,
            20,
            0.1
          )}
          <p>
            Applies to all {boundaryWalls.length} wall {boundaryWalls.length === 1 ? 'segment' : 'segments'} around this room.
            {boundaryThicknesses.length > 1 ? ' The boundary currently uses mixed thicknesses.' : ''}
          </p>
        </>}
        <p>{selected.boundary_wall_ids?.length
          ? `Boundary follows ${selected.boundary_wall_ids.length} selected walls.`
          : selected.boundary_locked ? 'Boundary is manually locked.' : 'Boundary follows automatic wall detection.'}</p>
        {selected.detection_warning && <p role="alert">{selected.detection_warning}</p>}
        <button type="button" onClick={() => {
          chooseTool('room-redraw');
          setRoomRedrawId(selected.id);
          setRoomBoundaryWallIds(boundaryWalls.map(wall => wall.id));
          setSelection({ kind: 'room', id: selected.id });
        }}>Redraw boundary</button>
        {selected.boundary_locked && <button type="button" onClick={() => {
          const unlocked = { ...selected, boundary_locked: false, boundary_source: 'auto', detection_warning: null };
          // Keep the selected wall IDs for this reconciliation pass so the
          // detector compares against the live wall-derived outline instead of
          // a potentially stale cached polygon. Successful automatic matches
          // discard the links in reconcileDetectedRooms.
          const candidate = { ...level, rooms: (level.rooms || []).map(room => room.id === selected.id ? unlocked : room) };
          updateLevel({ rooms: reconcileRoomsForLevel(candidate) });
        }}>Use automatic boundary</button>}
      </>;
    }

    if (selection.kind === 'wall') {
      const isOutline =
        level.outline.some(
          wall =>
            wall.id ===
            selected.id
        );

      return (
        <>
          <h3>
            Selected wall
          </h3>

          <p>
            {isOutline
              ? 'Exterior wall'
              : 'Interior wall'}
            {' · '}
            {selected.type}
          </p>

          <label>{isOutline ? 'Exterior material' : 'Interior material'}
            <select value={selected.material || (isOutline ? level.exterior_material : level.interior_material) || 'existing'}
              onChange={event => updateSelection({ material: event.target.value })}>
              {WALL_FINISHES.map(finish => <option key={finish} value={finish}>{finishLabel(finish)}</option>)}
            </select>
          </label>

          {numberField(
            'Thickness (ft)',
            selected.thickness,
            value =>
              updateSelection({
                thickness: value,
              }),
            0.1,
            20,
            0.1
          )}

          {isOutline && belowLevel && (
            <button
              onClick={() => {
                const snapped =
                  snapWallToOutline(
                    selected,
                    belowLevel.outline || [],
                    snapTolerance
                  );

                replaceWall(
                  selected.id,
                  snapped
                );
              }}
            >
              Snap wall to level below
            </button>
          )}

          {selected.type === 'arc' && (
            <button
              onClick={() =>
                updateSelection({
                  type: 'line',
                  center: undefined,
                  clockwise: undefined,
                })
              }
            >
              Straighten arc
            </button>
          )}
        </>
      );
    }

    if (selection.kind === 'opening') {
      const isDoor =
        selected.kind === 'door' ||
        selected.kind ===
        'double_door';

      return (
        <>
          <h3>
            Selected opening
          </h3>

          <label>
            Type

            <select
              value={selected.kind}
              onChange={event => {
                const kind =
                  event.target.value;

                const patch = {
                  kind,
                };

                if (
                  kind ===
                  'curtain'
                ) {
                  patch.operation =
                    'curtain';
                }

                if (
                  kind === 'door' ||
                  kind ===
                  'double_door'
                ) {
                  patch.operation =
                    selected.operation ===
                      'sliding'
                      ? 'sliding'
                      : 'hinged';

                  patch.hinge_side =
                    kind ===
                      'double_door'
                      ? 'outer'
                      : (
                        selected.hinge_side ||
                        'left'
                      );

                  patch.swing_side =
                    selected.swing_side ||
                    'inward';
                }

                if (
                  kind === 'window'
                ) {
                  patch.height_from_floor =
                    selected.height_from_floor ??
                    3;
                } else {
                  patch.height_from_floor =
                    0;
                }

                updateSelection(
                  patch
                );
              }}
            >
              <option value="door">
                Door
              </option>

              <option value="double_door">
                Double door
              </option>

              <option value="archway">
                Archway
              </option>

              <option value="curtain">
                Curtain
              </option>

              <option value="window">
                Window
              </option>
            </select>
          </label>

          {numberField(
            'Width (ft)',
            selected.width,
            value =>
              updateSelection({
                width: value,
              }),
            1,
            30,
            0.5
          )}

          {numberField(
            'Height (ft)',
            selected.height,
            value =>
              updateSelection({
                height: value,
              }),
            1,
            level.floor_height,
            0.5
          )}

          {selected.kind ===
            'window' &&
            numberField(
              'Height above floor (ft)',
              selected.height_from_floor,
              value =>
                updateSelection({
                  height_from_floor:
                    value,
                }),
              0,
              Math.max(
                0,
                level.floor_height -
                selected.height
              ),
              0.5
            )}

          {isDoor && (
            <>
              <label>
                Operation

                <select
                  value={
                    selected.operation ||
                    'hinged'
                  }
                  onChange={event =>
                    updateSelection({
                      operation:
                        event.target.value,
                    })
                  }
                >
                  <option value="hinged">
                    Hinged
                  </option>

                  <option value="sliding">
                    Sliding
                  </option>
                </select>
              </label>

              {selected.kind ===
                'door' && (
                  <label>
                    {selected.operation ===
                      'sliding'
                      ? 'Slides'
                      : 'Hinge side'}

                    <select
                      value={
                        selected.hinge_side ||
                        'left'
                      }
                      onChange={event =>
                        updateSelection({
                          hinge_side:
                            event.target.value,
                        })
                      }
                    >
                      <option value="left">
                        Left
                      </option>

                      <option value="right">
                        Right
                      </option>
                    </select>
                  </label>
                )}

              {selected.operation ===
                'hinged' && (
                  <label>
                    Opens

                    <select
                      value={
                        selected.swing_side ||
                        'inward'
                      }
                      onChange={event =>
                        updateSelection({
                          swing_side:
                            event.target.value,
                        })
                      }
                    >
                      <option value="inward">
                        Inward
                      </option>

                      <option value="outward">
                        Outward
                      </option>
                    </select>
                  </label>
                )}
            </>
          )}
        </>
      );
    }

    if (selection.kind === 'stair') {
      return (
        <>
          <h3>
            Selected stairs
          </h3>

          <label>
            Shape

            <select
              value={
                selected.shape ||
                'straight'
              }
              onChange={event =>
                updateSelection({
                  shape:
                    event.target.value,
                })
              }
            >
              <option value="straight">
                Straight
              </option>

              <option value="landing">
                Landings / turns
              </option>

              <option value="curve">
                Curved
              </option>
            </select>
          </label>

          {numberField(
            'Start X (ft)',
            selected.start_x,
            value =>
              updateSelection({
                start_x: value,
              })
          )}

          {numberField(
            'Start Y (ft)',
            selected.start_y,
            value =>
              updateSelection({
                start_y: value,
              })
          )}

          {numberField(
            'Width (ft)',
            selected.width,
            value =>
              updateSelection({
                width: value,
              }),
            1,
            20,
            0.5
          )}

          {numberField(
            'Initial upward direction (°)',
            (
              selected.direction ||
              0
            ) *
            180 /
            Math.PI,
            value =>
              updateSelection({
                direction:
                  value *
                  Math.PI /
                  180,
              }),
            -360,
            360,
            1
          )}

          {numberField(
            'Total elevation change (ft)',
            selected.total_rise_feet ?? level.floor_height,
            value =>
              updateSelection({
                total_rise_feet: value,
              }),
            0.5,
            100,
            0.5
          )}

          <label>
            Stair finish

            <select
              value={selected.material || 'interior'}
              onChange={event =>
                updateSelection({
                  material: event.target.value,
                })
              }
            >
              <option value="interior">Interior</option>
              <option value="wooden-exterior">Wooden (exterior)</option>
              <option value="stone-exterior">Stone (exterior)</option>
            </select>
          </label>

          {selected.shape !== 'curve' &&
            numberField(
              'Total stair run (ft)',
              selected.length,
              value =>
                updateSelection({
                  length: value,
                }),
              2,
              100,
              0.5
            )}

          {selected.shape ===
            'landing' && (
              <>
                {numberField(
                  'Landing count',
                  selected.landing_count,
                  value => {
                    const landingCount = Math.max(1, Math.round(value));
                    updateSelection({
                      landing_count: landingCount,
                      flight_shares: resizeFlightShares(
                        selected.flight_shares,
                        landingCount + 1,
                        activeStairFlight
                      ),
                    });
                  },
                  1,
                  6,
                  1
                )}

                {flightShareFields(
                  selected.flight_shares,
                  flight_shares => updateSelection({ flight_shares })
                )}

                <p>
                  Flight percentages place each landing and control how much stair run and rise occurs on either side.
                </p>

                {numberField(
                  'Landing depth (ft)',
                  selected.landing_depth,
                  value =>
                    updateSelection({
                      landing_depth:
                        value,
                    }),
                  1,
                  20,
                  0.5
                )}

                {numberField(
                  'Turn at each landing (°)',
                  selected.turn_degrees,
                  value =>
                    updateSelection({
                      turn_degrees:
                        value,
                    }),
                  -180,
                  180,
                  5
                )}

                <p>
                  Positive values turn left while climbing; negative values turn right.
                </p>
              </>
            )}

          {selected.shape ===
            'curve' && (
              <>
                {numberField(
                  'Curve radius (ft)',
                  selected.curve_radius,
                  value =>
                    updateSelection({
                      curve_radius:
                        value,
                    }),
                  1,
                  100,
                  0.5
                )}

                {numberField(
                  'Curve while climbing (°)',
                  selected.curve_degrees,
                  value =>
                    updateSelection({
                      curve_degrees:
                        value,
                    }),
                  -360,
                  360,
                  5
                )}

                <p>
                  Positive values curve left while climbing; negative values curve right.
                </p>
              </>
            )}

          <p>
            The stair path and automatic opening in the floor above update together.
          </p>
        </>
      );
    }

    if (
      selection.kind === 'hatch' ||
      selection.kind === 'ladder'
    ) {
      return (
        <>
          <h3>
            Selected {selection.kind}
          </h3>

          {numberField(
            'Center X (ft)',
            selected.x,
            value =>
              updateSelection({
                x: value,
              })
          )}

          {numberField(
            'Center Y (ft)',
            selected.y,
            value =>
              updateSelection({
                y: value,
              })
          )}

          {numberField(
            'Width (ft)',
            selected.width,
            value =>
              updateSelection({
                width: value,
              }),
            1,
            20,
            0.5
          )}

          {numberField(
            'Depth (ft)',
            selected.depth,
            value =>
              updateSelection({
                depth: value,
              }),
            1,
            20,
            0.5
          )}
        </>
      );
    }

    if (
      selection.kind ===
      'platform'
    ) {
      return (
        <>
          <h3>
            Selected platform
          </h3>

          <label>
            Type

            <select
              value={
                selected.style ||
                'porch'
              }
              onChange={event =>
                updateSelection({
                  style:
                    event.target.value,
                })
              }
            >
              <option value="porch">
                Porch
              </option>

              <option value="deck">
                Deck
              </option>

              <option value="balcony">
                Balcony
              </option>
            </select>
          </label>

          {numberField(
            'Platform thickness (ft)',
            selected.thickness,
            value =>
              updateSelection({
                thickness:
                  value,
              }),
            0.1,
            4,
            0.1
          )}

          {numberField(
            'Elevation offset (ft)',
            selected.elevation_offset ||
            0,
            value =>
              updateSelection({
                elevation_offset:
                  value,
              }),
            -20,
            20,
            0.5
          )}

          <label>
            <input
              type="checkbox"
              checked={
                selected.railing !==
                false
              }
              onChange={event =>
                updateSelection({
                  railing:
                    event.target.checked,
                })
              }
            />

            Automatic railings on free edges
          </label>

          {selected.railing !==
            false &&
            numberField(
              'Railing height (ft)',
              selected.railing_height ||
              3.5,
              value =>
                updateSelection({
                  railing_height:
                    value,
                }),
              1,
              8,
              0.25
            )}

          <p>
            Drag highlighted vertices in the plan to reshape the platform.
          </p>

          <h4>
            Edge behavior
          </h4>

          {(selected.points || []).map(
            (
              point,
              index
            ) => (
              <label
                key={`platform-edge-${index}`}
              >
                Edge {index + 1}

                <select
                  value={
                    selected.edge_modes?.[
                    index
                    ] ||
                    'auto'
                  }
                  onChange={event => {
                    const edgeModes =
                      Array.from(
                        {
                          length:
                            selected.points.length,
                        },
                        (
                          _,
                          edgeIndex
                        ) =>
                          selected.edge_modes?.[
                          edgeIndex
                          ] ||
                          'auto'
                      );

                    edgeModes[
                      index
                    ] =
                      event.target.value;

                    updateSelection({
                      edge_modes:
                        edgeModes,
                    });
                  }}
                >
                  <option value="auto">
                    Auto
                  </option>

                  <option value="railing">
                    Railing
                  </option>

                  <option value="open">
                    Open
                  </option>

                  <option value="attached">
                    Attached to building
                  </option>
                </select>
              </label>
            )
          )}
        </>
      );
    }

    if (
      selection.kind ===
      'fireplace'
    ) {
      return (
        <>
          <h3>
            Selected fireplace
          </h3>

          <label>
            Chimney face

            <select
              value={
                selected.side ||
                'south'
              }
              onChange={event =>
                updateSelection({
                  side:
                    event.target.value,
                })
              }
            >
              <option value="north">
                North
              </option>

              <option value="south">
                South
              </option>

              <option value="east">
                East
              </option>

              <option value="west">
                West
              </option>
            </select>
          </label>

          {numberField(
            'Opening width (ft)',
            selected.width,
            value =>
              updateSelection({
                width:
                  value,
              }),
            1,
            20,
            0.5
          )}

          {numberField(
            'Opening height (ft)',
            selected.opening_height,
            value =>
              updateSelection({
                opening_height:
                  value,
              }),
            1,
            level.floor_height,
            0.5
          )}

          <p>
            This fireplace uses chimney {selected.chimney_id}.
          </p>
        </>
      );
    }

    if (
      selection.kind ===
      'chimney'
    ) {
      return (
        <>
          <h3>
            Selected chimney
          </h3>

          {numberField(
            'Center X (ft)',
            selected.x,
            value =>
              updateSelection({
                x:
                  value,
              })
          )}

          {numberField(
            'Center Y (ft)',
            selected.y,
            value =>
              updateSelection({
                y:
                  value,
              })
          )}

          {numberField(
            'Width (ft)',
            selected.width,
            value =>
              updateSelection({
                width:
                  value,
              }),
            1,
            20,
            0.5
          )}

          {numberField(
            'Depth (ft)',
            selected.depth,
            value =>
              updateSelection({
                depth:
                  value,
              }),
            1,
            20,
            0.5
          )}

          <label>
            Top level

            <select
              value={
                selected.top_level_id ||
                ''
              }
              onChange={event =>
                updateSelection({
                  top_level_id:
                    event.target.value ||
                    null,
                })
              }
            >
              <option value="">
                Continue through roof
              </option>

              {building.levels
                .filter(
                  candidate =>
                    candidate.elevation_feet >=
                    (
                      building.levels.find(
                        item =>
                          item.id ===
                          selected.base_level_id
                      )?.elevation_feet ??
                      -Infinity
                    )
                )
                .map(
                  candidate => (
                    <option
                      key={
                        candidate.id
                      }
                      value={
                        candidate.id
                      }
                    >
                      {candidate.name}
                    </option>
                  )
                )}
            </select>
          </label>

          <p>
            Fireplaces on any level can attach to this same chimney stack.
          </p>
        </>
      );
    }

    if (
      selection.kind ===
      'floor_void'
    ) {
      return (
        <>
          <h3>{selected.kind === 'open_to_sky' ? 'Open to Sky Courtyard' : 'Open to Below'}</h3>

          <p>
            Drag the highlighted corner handles in the plan to reshape this opening.
          </p>
        </>
      );
    }

    return null;
  };

  const stairCreationControls =
    tool === 'stairs' ? (
      <>
        <label>
          Stair shape

          <select
            value={stairShape}
            onChange={event =>
              setStairShape(
                event.target.value
              )
            }
          >
            <option value="straight">
              Straight
            </option>

            <option value="landing">
              Landings / turns
            </option>

            <option value="curve">
              Curved
            </option>
          </select>
        </label>

        {numberField(
          'Stair width (ft)',
          width,
          value => {
            setStairLandingDepth(current => Math.abs(current - width) < 0.001 ? value : current);
            setWidth(value);
          },
          1,
          20,
          0.5
        )}

        {numberField(
          'Total elevation change (ft)',
          stairTotalRise ?? defaultStairRise,
          setStairTotalRise,
          0.5,
          100,
          0.5
        )}

        <label>
          Stair finish

          <select
            value={stairMaterial}
            onChange={event =>
              setStairMaterial(event.target.value)
            }
          >
            <option value="interior">Interior</option>
            <option value="wooden-exterior">Wooden (exterior)</option>
            <option value="stone-exterior">Stone (exterior)</option>
          </select>
        </label>

        {stairShape !== 'curve' &&
          numberField(
            'Total stair run (ft)',
            stairRun,
            setStairRun,
            2,
            100,
            0.5
          )}

        {stairShape ===
          'landing' && (
            <>
              {numberField(
                'Landing count',
                stairLandingCount,
                value => {
                  const landingCount = Math.max(1, Math.round(value));
                  setStairFlightShares(current => resizeFlightShares(
                    current,
                    landingCount + 1,
                    activeStairFlight
                  ));
                  setStairLandingCount(landingCount);
                },
                1,
                6,
                1
              )}

              {flightShareFields(stairFlightShares, setStairFlightShares)}

              <p>
                Flight percentages place each landing and control how much stair run and rise occurs on either side.
              </p>

              {numberField(
                'Landing depth (ft)',
                stairLandingDepth,
                setStairLandingDepth,
                1,
                20,
                0.5
              )}

              {numberField(
                'Turn at each landing (°)',
                stairTurnDegrees,
                setStairTurnDegrees,
                -180,
                180,
                5
              )}

              <p>
                Positive turns left while climbing; negative turns right.
              </p>
            </>
          )}

        {stairShape === 'curve' && (
          <>
            {numberField(
              'Curve radius (ft)',
              stairCurveRadius,
              setStairCurveRadius,
              1,
              100,
              0.5
            )}

            {numberField(
              'Curve while climbing (°)',
              stairCurveDegrees,
              setStairCurveDegrees,
              -360,
              360,
              5
            )}

            <p>
              Positive curves left while climbing; negative curves right.
            </p>
          </>
        )}
      </>
    ) : null;

  const activeToolControls = (
    <>
      {OPENING_TOOLS[tool] && <label>
        Opening type
        <select aria-label="Opening type" value={tool} onChange={event => chooseTool(event.target.value)}>
          {Object.entries(OPENING_TOOLS).map(([toolName, kind]) => (
            <option key={toolName} value={toolName}>{OPENING_LABELS[kind]}</option>
          ))}
        </select>
      </label>}
      {tool !== 'select' &&
        tool !== 'stairs' &&
        tool !== 'arc' &&
        tool !== 'circle' &&
        tool !== 'roof' &&
        numberField(
          tool === 'window' ? 'Window width (ft)' : 'Opening width (ft)',
          width,
          setWidth,
          1,
          30,
          0.5
        )}

      {tool === 'circle' && (
        <label>
          Circle destination
          <select
            value={circleDestination}
            onChange={event => setCircleDestination(event.target.value)}
          >
            <option value="footprint">Replace footprint</option>
            <option value="wall">Add interior wall</option>
          </select>
        </label>
      )}

      {tool === 'roof' && (
        <>
          <label>
            Roof style
            <select value={roofStyle} onChange={event => setRoofStyle(event.target.value)}>
              {BLUEPRINT_ROOF_TYPES.filter(type => type !== 'custom').map(type => (
                <option key={type} value={type}>{type === 'shed' ? 'Shed / lean-to' : type}</option>
              ))}
            </select>
          </label>
          {numberField('Pitch (°)', roofPitch, setRoofPitch, 0, 80, 1)}
          {numberField('Slope direction (°)', roofSlopeDirection, setRoofSlopeDirection, -360, 360, 5)}
          {numberField('Overhang (ft)', roofOverhang, setRoofOverhang, 0, 20, 0.5)}
        </>
      )}

      {stairCreationControls}

      {tool === 'platform' && (
        <>
          <label>
            Platform type
            <select
              value={platformStyle}
              onChange={event => setPlatformStyle(event.target.value)}
            >
              <option value="porch">Porch</option>
              <option value="deck">Deck</option>
              <option value="balcony">Balcony</option>
            </select>
          </label>
          {numberField('Platform thickness (ft)', platformThickness, setPlatformThickness, 0.1, 4, 0.1)}
          <label className="blueprint-inline-checkbox">
            <input
              type="checkbox"
              checked={platformRailing}
              onChange={event => setPlatformRailing(event.target.checked)}
            />
            Add railings to free edges
          </label>
        </>
      )}

      {tool === 'fireplace' && (
        <>
          {numberField('New chimney width (ft)', chimneyWidth, setChimneyWidth, 1, 20, 0.5)}
          {numberField('New chimney depth (ft)', chimneyDepth, setChimneyDepth, 1, 20, 0.5)}
          {numberField('Fireplace opening width (ft)', fireplaceWidth, setFireplaceWidth, 1, 20, 0.5)}
          {numberField('Fireplace opening height (ft)', fireplaceOpeningHeight, setFireplaceOpeningHeight, 1, level.floor_height, 0.5)}
          <label>
            Fireplace face
            <select value={fireplaceSide} onChange={event => setFireplaceSide(event.target.value)}>
              <option value="north">North</option>
              <option value="south">South</option>
              <option value="east">East</option>
              <option value="west">West</option>
            </select>
          </label>
          <p>Click an existing chimney to add another fireplace opening. Click empty space to create a new chimney stack and its first fireplace.</p>
        </>
      )}

      {(tool === 'door' || tool === 'double-door') && (
        <>
          <label>
            Door operation
            <select value={doorOperation} onChange={event => setDoorOperation(event.target.value)}>
              <option value="hinged">Hinged</option>
              <option value="sliding">Sliding</option>
            </select>
          </label>
          {tool === 'door' && (
            <label>
              {doorOperation === 'sliding' ? 'Slides' : 'Hinge side'}
              <select value={hingeSide} onChange={event => setHingeSide(event.target.value)}>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
          )}
          {doorOperation === 'hinged' && (
            <label>
              Opens
              <select value={swingSide} onChange={event => setSwingSide(event.target.value)}>
                <option value="inward">Inward</option>
                <option value="outward">Outward</option>
              </select>
            </label>
          )}
        </>
      )}
    </>
  );
  const hasActiveToolControls = activeToolControls.props.children.some(Boolean);

  return (
    <section className="blueprint-levels">
      {!drafting && <h3>
        Levels
      </h3>}

      <button
        className="blueprint-primary-action"
        onClick={() => {
          fit();
          setOpen(true);
          setHistory([]);
          setDraft([]);
          setSelection(null);
          setTool(drafting ? 'footprint' : 'select');
          const rooms = drafting ? level.rooms : reconcileRoomsForLevel(level);
          onChange({
            ...building,
            visible_level_id: level.id,
            level_view: 'all',
            levels: building.levels.map(item => item.id === level.id ? { ...item, rooms } : item),
          });
        }}
      >
        {drafting ? 'Draw Footprint — Arc / Circle Tools' : 'Edit floor plan & walls'}
      </button>

      {!drafting && <><label>
        Active level

        <select
          value={level.id}
          onChange={event =>
            chooseLevel(
              event.target.value
            )
          }
          disabled={busy}
        >
          {building.levels.map(item => (
            <option
              key={item.id}
              value={item.id}
            >
              {defaultLevelName(item.level_number)}{item.name !== defaultLevelName(item.level_number) ? ` — ${item.name}` : ''} · {item.elevation_feet} ft
            </option>
          ))}
        </select>
      </label>

      <label>
        Scene visibility

        <select
          value={
            building.level_view ||
            'all'
          }
          onChange={event =>
            onChange({
              ...building,
              visible_level_id:
                level.id,
              level_view:
                event.target.value,
            })
          }
        >
          <option value="all">
            All levels
          </option>

          <option value="level">
            Selected level only
          </option>

          <option value="through">
            Selected level and below
          </option>
        </select>
      </label>

      <div className="blueprint-row">
        <button
          onClick={() =>
            onChange(
              addBuildingLevel(
                building,
                1
              )
            )
          }
        >
          Add above
        </button>

        <button
          onClick={() =>
            onChange(
              addBuildingLevel(
                building,
                -1
              )
            )
          }
        >
          Add basement
        </button>
      </div>

      {!!insertableLevelGaps.length && <div className="blueprint-level-gap-controls">
        {insertableLevelGaps.length > 1 && <label>
          Missing level
          <select aria-label="Missing level" value={selectedMissingLevelNumber}
            onChange={event => setMissingLevelNumber(event.target.value)}>
            {insertableLevelGaps.map(levelNumber => <option key={levelNumber} value={levelNumber}>
              {defaultLevelName(levelNumber)}
            </option>)}
          </select>
        </label>}
        <button type="button" onClick={() => onChange(insertMissingBuildingLevel(
          building,
          selectedMissingLevelNumber
        ))}>
          Add {defaultLevelName(selectedMissingLevelNumber)}
        </button>
      </div>}

      {levelNumberGaps.length > insertableLevelGaps.length && <p className="blueprint-level-warning" role="status">
        Some missing levels cannot be restored until their surrounding elevations are ordered from low to high.
      </p>}

      <button type="button" className="blueprint-delete-level"
        disabled={building.levels.length <= 1 || busy}
        onClick={() => setDeleteLevelImpact(levelDeletionImpact(building, level.id))}>
        Delete {level.name}
      </button>

      {numberField(
        'Foundation height (ft)',
        building.foundation_height_feet,
        value =>
          updateBuilding({
            foundation_height_feet: value,
          }),
        0,
        100
      )}

      <label>
        Foundation finish

        <select
          value={building.foundation_material}
          onChange={event =>
            updateBuilding({
              foundation_material: event.target.value,
            })
          }
        >
          <option value="stone">Stone block</option>
          <option value="exterior">Match exterior walls</option>
        </select>
      </label>

      <BlueprintRoofs
        building={building}
        level={level}
        exposedAreas={exposedAreas}
        onChange={requestRoofChange}
        onDrawCustom={template => {
          fit();
          setRoofDraftTemplate(template);
          setRoofStyle(template.type === 'custom' ? 'gable' : template.type);
          setRoofPitch(template.pitch);
          setRoofSlopeDirection(template.slope_direction);
          setRoofOverhang(template.overhang);
          setOpen(true);
          setHistory([]);
          setDraft([]);
          setRoofDraftHoles([]);
          setRoofRingTarget('outer');
          setSelection(null);
          setTool('roof');
          const rooms = reconcileRoomsForLevel(level);
          onChange({
            ...building,
            levels: building.levels.map(item => item.id === level.id ? { ...item, rooms } : item),
          });
        }}
        onEditGeometry={template => {
          const support = building.levels.find(item => item.id === template.support_level_id) || level;
          if (support.id !== level.id) updateBuilding({ visible_level_id: support.id }, false);
          fit();
          setRoofDraftTemplate(template);
          setRoofStyle(template.type);
          setRoofPitch(template.pitch);
          setRoofSlopeDirection(template.slope_direction);
          setRoofOverhang(template.overhang);
          setDraft((template.footprint || []).map(point => ({ ...point })));
          setRoofDraftHoles((template.holes || []).map(ring => ring.map(point => ({ ...point }))));
          setRoofRingTarget('outer');
          setSelection(null);
          setTool('roof');
          setOpen(true);
        }}
      />

      </>}<Dialog
        open={open}
        disableEscapeKeyDown
        onClose={(_, reason) => {
          if (!busy && reason !== 'backdropClick') {
            setOpen(false);
            setRoofDraftTemplate(null);
            setDraft([]);
            setTool('select');
            onEditorClose?.();
          }
        }}
        onKeyDownCapture={
          handleEditorKeyDown
        }
        onKeyUpCapture={
          handleEditorKeyUp
        }
        maxWidth="lg"
        fullWidth
        PaperProps={{
          className:
            'blueprint-dialog',
        }}
      >
        <DialogTitle>
          {building.name} · {level.name}
        </DialogTitle>

        <DialogContent className="blueprint-dialog-content">
          <fieldset
            disabled={busy}
            className="blueprint-workspace"
          >
            <aside className="blueprint-levels">
              <div className="blueprint-editor-actions">
                <button
                  disabled={!history.length || busy}
                  onClick={undoFloorEdit}
                >
                  Undo
                </button>
                <button
                  disabled={!selection || busy}
                  onClick={deleteSelection}
                >
                  Delete selected
                </button>
              </div>

              <label className="blueprint-editor-level-switcher">
                Editing level

                <select
                  value={level.id}
                  onChange={event => chooseLevel(event.target.value)}
                >
                  {building.levels.map(item => (
                    <option key={item.id} value={item.id}>
                      {defaultLevelName(item.level_number)}{item.name !== defaultLevelName(item.level_number) ? ` — ${item.name}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <div className="blueprint-tools" aria-label="Room detection review">
                <span>{(level.rooms || []).length} rooms · automatic detection on wall changes</span>
                <button type="button" onClick={() => updateLevel({ rooms: reconcileRoomsForLevel(level) })}>Refresh Rooms</button>
                {roomDetectionWarnings.map((warning, index) => <span key={`${index}-${warning}`} role="alert">{warning}</span>)}
              </div>

              <label>
                Level name

                <input
                  value={level.name}
                  onChange={event =>
                    updateLevel(
                      {
                        name:
                          event.target.value,
                      },
                      false
                    )
                  }
                />
              </label>

              {numberField(
                'Floor elevation (ft)',
                level.elevation_feet,
                value =>
                  updateLevel({
                    elevation_feet:
                      value,
                  }),
                -1000,
                1000
              )}

              {numberField(
                'Wall height (ft)',
                level.floor_height,
                value =>
                  updateLevel({
                    floor_height:
                      value,
                  }),
                8,
                100
              )}

              <div className="blueprint-material-controls">
                <strong>Construction materials</strong>
                <label>Floor material
                  <select value={level.floor_material || 'existing'}
                    onChange={event => updateLevel({ floor_material: event.target.value })}>
                    {FLOOR_FINISHES.map(finish => <option key={finish} value={finish}>{finishLabel(finish)}</option>)}
                  </select>
                </label>
                <label>Exterior wall material
                  <select value={level.exterior_material || 'existing'}
                    onChange={event => updateLevel({ exterior_material: event.target.value })}>
                    {WALL_FINISHES.map(finish => <option key={finish} value={finish}>{finishLabel(finish)}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => updateLevel({ outline: level.outline.map(wall => ({ ...wall,
                  material: level.exterior_material || 'existing' })) })}>
                  Apply to all exterior walls
                </button>
                <label>Interior wall material
                  <select value={level.interior_material || 'existing'}
                    onChange={event => updateLevel({ interior_material: event.target.value })}>
                    {WALL_FINISHES.map(finish => <option key={finish} value={finish}>{finishLabel(finish)}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => updateLevel({ walls: level.walls.map(wall => ({ ...wall,
                  material: level.interior_material || 'existing' })) })}>
                  Apply to all interior walls
                </button>
                <p>New segments inherit these defaults. Select any wall to assign its material independently.</p>
              </div>

              {numberField(
                'New wall thickness (ft)',
                wallThickness,
                setWallThickness,
                0.1,
                20,
                0.1
              )}

              <label>
                <input
                  type="checkbox"
                  checked={snapWallAngles}
                  onChange={event =>
                    setSnapWallAngles(event.target.checked)
                  }
                />

                Snap walls and footprint edges to the building grid (90°)
              </label>
              <p className="blueprint-hint">
                The level editor stays aligned to the building grid. The structure's real-world rotation is applied in the 3D scene.
              </p>

              {belowLevel && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={snapToBelow}
                      onChange={event =>
                        setSnapToBelow(
                          event.target.checked
                        )
                      }
                    />

                    Snap new footprint points to level below
                  </label>

                  {snapToBelow &&
                    numberField(
                      'Footprint snap distance (ft)',
                      snapTolerance,
                      setSnapTolerance,
                      0.25,
                      10,
                      0.25
                    )}

                  <button
                    onClick={() => {
                      const copied =
                        cloneOutline(
                          belowLevel,
                          level.id
                        );

                      const interiorWallIds =
                        new Set(
                          level.walls.map(
                            wall =>
                              wall.id
                          )
                        );

                      updateLevel({
                        outline:
                          copied.outline,

                        corners:
                          copied.corners,

                        openings:
                          level.openings.filter(
                            opening =>
                              interiorWallIds.has(
                                opening.wall_id
                              )
                          ),
                      });

                      setSelection(null);
                      setDraft([]);
                      setError('');
                    }}
                  >
                    Copy footprint from {belowLevel.name}
                  </button>

                  <p>
                    The lower exterior outline is shown as a red dashed guide. New footprint points snap to its vertices and wall paths.
                  </p>
                </>
              )}

              <label className="blueprint-upload">
                {busy
                  ? 'Uploading…'
                  : 'Upload floor image'}

                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={upload}
                />
              </label>

              {map && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={
                        map.visible !==
                        false
                      }
                      onChange={event =>
                        updateLevel(
                          {
                            floor_map: {
                              ...map,
                              visible:
                                event.target.checked,
                            },
                          },
                          false
                        )
                      }
                    />

                    Show reference image
                  </label>

                  <button
                    type="button"
                    aria-expanded={imagePlacementOpen}
                    onClick={() => {
                      const nextOpen = !imagePlacementOpen;
                      setImagePlacementOpen(nextOpen);
                      setImagePlacementPinned(nextOpen);
                    }}
                  >
                    Image placement {imagePlacementOpen ? '−' : '+'}
                  </button>

                  {imagePlacementOpen && (
                    <div className="blueprint-image-placement">
                      <div className="blueprint-image-placement-row" data-testid="image-height-center-row">
                        {imageRangeField('Image height (ft)', 'height_feet', 1, 1000)}
                        {imageRangeField('Vertical center (ft)', 'y', -1000, 1000)}
                      </div>

                      <div className="blueprint-image-placement-row" data-testid="image-width-row">
                        {imageRangeField('Image width (ft)', 'width_feet', 1, 1000)}
                        {imageRangeField('Horizontal center (ft)', 'x', -1000, 1000)}
                      </div>

                      {numberField(
                        'Image rotation (°)',
                        map.rotation ?? 0,
                        value =>
                          updateLevel(
                            {
                              floor_map: {
                                ...map,
                                rotation: value,
                              },
                            },
                            false
                          ),
                        -360,
                        360,
                        0.5
                      )}

                      {imageRangeField('Image opacity', 'opacity', 0, 1, 0.05)}

                      <button
                        onClick={() => {
                          const below = [
                            ...building.levels,
                          ]
                            .filter(
                              item =>
                                item.elevation_feet < level.elevation_feet &&
                                item.floor_map
                            )
                            .sort(
                              (a, b) => b.elevation_feet - a.elevation_feet
                            )[0];

                          if (!below) {
                            setError('No floor image below this level to align to yet.');
                            return;
                          }

                          const alignment = Object.fromEntries(
                            ['x', 'y', 'width_feet', 'height_feet', 'rotation']
                              .map(key => [key, below.floor_map[key]])
                          );
                          updateLevel({ floor_map: { ...map, ...alignment } });
                          fit({ ...map, ...alignment });
                        }}
                      >
                        Match image below
                      </button>
                    </div>
                  )}

                  <section className="blueprint-image-calibration" aria-label="Floor image calibration">
                    <strong>Scale from map grid</strong>
                    <p>Choose two adjacent grid intersections. Most battle maps use 5 ft between them.</p>
                    {numberField('Grid spacing (ft)', calibrationDistance, setCalibrationDistance, 0.1, 100, 0.5)}
                    <button type="button" aria-pressed={tool === 'calibrate-image'}
                      onClick={() => chooseTool('calibrate-image')}>
                      Pick two grid points
                    </button>
                    {tool === 'calibrate-image' && (
                      <>
                        <p role="status">{calibrationPoints.length} of 2 points selected</p>
                        <button type="button" disabled={calibrationPoints.length !== 2 || calibrationDistance <= 0}
                          onClick={applyImageCalibration}>Apply image calibration</button>
                      </>
                    )}
                  </section>
                </>
              )}

              <p>
                Coordinates are local feet. Grid snap: ½ ft. {drafting ? 'This draft is saved only when you choose Save Building.' : 'Changes autosave with the building.'}
              </p>

              {error && (
                <p
                  role="alert"
                  className="blueprint-error"
                >
                  {error}
                </p>
              )}
            </aside>

            <div className="blueprint-workspace-main">
              <div
                className="blueprint-menu-bar"
                role="toolbar"
                aria-label="Floor drawing tools"
              >
                {['select', 'align'].map(value => <button key={value} disabled={busy}
                  aria-pressed={tool === value} onClick={() => chooseTool(value)}>{value}</button>)}

                <label className="blueprint-menu-select">
                  <span>Structure</span>
                  <select aria-label="Structure tool" value={['footprint', 'circle', 'wall', 'platform', 'fireplace'].includes(tool) ? tool : ''}
                    onChange={event => { if (event.target.value) chooseTool(event.target.value); }}>
                    <option value="">Choose…</option>
                    <option value="footprint">Footprint</option>
                    <option value="circle">Circle</option>
                    <option value="wall">Interior wall</option>
                    <option value="platform">Platform</option>
                    <option value="fireplace">Fireplace</option>
                  </select>
                </label>

                <div className="blueprint-menu-drawer-anchor" ref={openingsMenuRef}>
                  <button type="button" disabled={busy} aria-haspopup="menu" aria-expanded={openingsDrawerOpen}
                    aria-pressed={Boolean(OPENING_TOOLS[tool])}
                    onClick={() => setOpeningsDrawerOpen(value => !value)}>Openings <span aria-hidden="true">▾</span></button>
                  {openingsDrawerOpen && <div className="blueprint-opening-drawer" role="menu" aria-label="Opening types">
                    {Object.entries(OPENING_TOOLS).map(([toolName, kind]) => <button key={toolName} role="menuitem"
                      aria-current={tool === toolName ? 'true' : undefined} onClick={() => { chooseTool(toolName); setOpeningsDrawerOpen(false); }}>
                      {OPENING_LABELS[kind]}
                    </button>)}
                  </div>}
                </div>

                <label className="blueprint-menu-select">
                  <span>Vertical</span>
                  <select aria-label="Vertical tool" value={['stairs', 'hatch', 'ladder', 'open-below', 'open-sky'].includes(tool) ? tool : ''}
                    onChange={event => { if (event.target.value) chooseTool(event.target.value); }}>
                    <option value="">Choose…</option>
                    <option value="stairs">Stairs</option>
                    <option value="hatch">Hatch</option>
                    <option value="ladder">Ladder</option>
                    <option value="open-below">Open below</option>
                    <option value="open-sky">Open sky</option>
                  </select>
                </label>

                <button disabled={busy} aria-pressed={['room', 'room-redraw'].includes(tool)} onClick={() => chooseTool('room')}>Rooms</button>
                <button disabled={busy} aria-pressed={tool === 'roof'} onClick={() => chooseTool('roof')}>Roof</button>
              </div>

              {['room', 'room-redraw'].includes(tool) && <div className="blueprint-room-boundary-status" role="status">
                {roomBoundaryWallIds.length} walls selected · {roomBoundary.error || 'Closed room boundary ready'}
                {roomBoundaryWallIds.length > 0 && <button type="button" onClick={() => setRoomBoundaryWallIds([])}>Clear selected walls</button>}
              </div>}

              {['footprint', 'wall'].includes(tool) && (
                <div className="blueprint-tools blueprint-segment-modes" role="group" aria-label={`${tool} segment mode`}>
                  {['line', 'arc', 'curve'].map(mode => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={segmentMode === mode}
                      onClick={() => {
                        setSegmentMode(mode);
                        setArcDraft(
                          mode === 'arc' && draft.length
                            ? [draft[draft.length - 1]]
                            : []
                        );
                        setCurveWallId(null);
                      }}
                    >
                      {mode === 'line' ? 'Line' : mode === 'arc' ? 'Arc' : 'Curve'}
                    </button>
                  ))}
                </div>
              )}

              {['footprint', 'wall'].includes(tool) && segmentMode === 'arc' && (
                <div className="blueprint-arc-steps" role="status" aria-label={`Arc point ${arcPlacementStep} of 3`}>
                  {['Start', 'Far end', 'Offset'].map((label, index) => {
                    const step = index + 1;
                    const state = step < arcPlacementStep
                      ? 'complete'
                      : step === arcPlacementStep
                        ? 'active'
                        : 'pending';
                    return (
                      <span
                        key={label}
                        className={`blueprint-arc-step is-${state}`}
                        aria-current={state === 'active' ? 'step' : undefined}
                      >
                        <b>{step}</b>
                        {label}
                      </span>
                    );
                  })}
                </div>
              )}

              {tool === 'roof' && (
                <div className="blueprint-roof-draft-action">
                  <span>{roofDraftTemplate ? 'Editing roof geometry' : 'Drawing roof'} · {draft.length} outer corners</span>
                  <label>Editing ring
                    <select aria-label="Roof geometry ring" value={roofRingTarget}
                      onChange={event => setRoofRingTarget(event.target.value === 'outer' ? 'outer' : Number(event.target.value))}>
                      <option value="outer">Outer footprint</option>
                      {roofDraftHoles.map((_, index) => <option key={index} value={index}>Hole {index + 1}</option>)}
                    </select>
                  </label>
                  <button type="button" onClick={() => {
                    setRoofDraftHoles(current => [...current, []]);
                    setRoofRingTarget(roofDraftHoles.length);
                  }}>Add hole</button>
                  {roofRingTarget !== 'outer' && <button type="button" onClick={() => {
                    setRoofDraftHoles(current => current.filter((_, index) => index !== roofRingTarget));
                    setRoofRingTarget('outer');
                  }}>Remove selected hole</button>}
                  <button type="button" onClick={() => {
                    if (roofRingTarget === 'outer') setDraft([]);
                    else setRoofDraftHoles(current => current.map((ring, index) => index === roofRingTarget ? [] : ring));
                  }}>Redraw selected ring</button>
                  <button type="button" disabled={draft.length < 3} onClick={finishRoof}>
                    {roofDraftTemplate && building.roofs.some(item => item.id === roofDraftTemplate.id)
                      ? 'Apply roof geometry'
                      : 'Finish Roof Polygon'}
                  </button>
                  {roofDraftTemplate && <button type="button" onClick={() => {
                    setRoofDraftTemplate(null); setRoofDraftHoles([]); setDraft([]); setTool('select');
                  }}>Cancel roof geometry</button>}
                </div>
              )}

              <p className="blueprint-hint">
                {tool === 'select'
                  ? 'Click an existing element to select it. Selected elements can be edited or deleted.'

                  : tool === 'align'
                    ? 'Drag the reference image to align it.'

                    : tool === 'footprint'
                      ? segmentMode === 'line'
                        ? 'Click exterior corners, then Finish footprint.'
                        : segmentMode === 'arc'
                          ? 'Click the arc start, end, then a point along its curve.'
                          : curveWallId
                            ? 'Click a point the selected footprint segment should pass through.'
                            : 'Click a footprint segment, then click where it should bow.'

                      : tool === 'circle'
                        ? 'Click the circle center, then a point on its circumference.'

                        : tool === 'wall'
                          ? segmentMode === 'line'
                            ? 'Click two points to add an interior wall.'
                            : segmentMode === 'arc'
                              ? 'Click the arc start, end, then a point along its curve.'
                              : curveWallId
                                ? 'Click a point the selected wall should pass through.'
                                : 'Click a wall segment, then click where it should bow.'

                          : tool === 'platform'
                            ? 'Trace a porch, deck, or balcony polygon, then choose Finish Platform. Free edges can receive automatic railings.'

                            : tool === 'fireplace'
                              ? 'Click an existing chimney to add a fireplace on this level, or click empty space to create a new chimney stack and fireplace.'

                              : tool === 'stairs'
                                ? draft.length
                                  ? 'Move the pointer to choose the initial upward direction, then click again. The arrow always points UP.'
                                  : 'Click the bottom/start of the staircase.'

                                : tool === 'open-below'
                                  ? 'Trace the area with no floor, then choose Finish Open to Below.'

                                  : tool === 'open-sky'
                                    ? 'Trace an internal open-to-sky courtyard. The opening will continue through all floors and roofs.'

                                  : tool === 'room' || tool === 'room-redraw'
                                    ? tool === 'room-redraw'
                                      ? 'Select the walls that enclose the corrected room, then choose Finish Room Boundary. Click a selected wall again to remove it.'
                                      : 'Select the walls that enclose the room, then choose Finish Room. Click a selected wall again to remove it.'

                                  : tool === 'roof'
                                    ? 'Trace the custom roof footprint, then choose Finish Roof Polygon.'

                                  : tool === 'ladder'
                                    ? 'Click to place a ladder leading upward to the next level.'

                                    : tool === 'hatch'
                                      ? 'Click to place a hatch through the current floor.'

                                      : OPENING_TOOLS[tool]
                                        ? `Click a wall to place a ${OPENING_LABELS[OPENING_TOOLS[tool]]}.`

                                        : ''}
              </p>

              <svg
                className="blueprint-canvas"
                viewBox={
                  view.join(' ')
                }
                aria-label="Floor plan tracing canvas"
                onClick={click}
                onPointerDown={event => {
                  suppressElementClickRef.current = null;
                  if (
                    tool === 'align' &&
                    map &&
                    !busy
                  ) {
                    setDrag({
                      point:
                        point(event),
                      map,
                    });

                    event.currentTarget
                      .setPointerCapture(
                        event.pointerId
                      );
                  }
                  else if (
                    tool === 'select' &&
                    selection &&
                    selected &&
                    !busy
                  ) {
                    const start = point(event);
                    const hit = selectAt(start, false);

                    if (hit?.kind === selection.kind && hit.id === selection.id) {
                      const movement = {
                        selection: { ...selection },
                        element: selected,
                        point: start,
                        level,
                        building,
                        historyRecorded: false
                      };

                      dragElementRef.current = movement;
                      suppressElementClickRef.current = false;
                      setDragElement(movement);
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                      event.preventDefault();
                    }
                  }
                }}
                onPointerMove={event => {
                  const p =
                    point(event);
                  if (tool === 'wall') {
                    const connection = snapPointToOutline(p, allWalls, 2);
                    setConnectionMarker(connection.snapped ? connection.point : null);
                  }

                  if (
                    ['footprint', 'wall'].includes(tool) &&
                    segmentMode === 'arc'
                  ) {
                    setArcPointerPoint(p);
                  }

                  if (dragOutlineVertex) {
                    const matches = candidate =>
                      Math.abs(candidate.x - dragOutlineVertex.originalPoint.x) < 0.001 &&
                      Math.abs(candidate.y - dragOutlineVertex.originalPoint.y) < 0.001;
                    const rawPoint = {
                      x: dragOutlineVertex.originalPoint.x + p.x - dragOutlineVertex.pointerStart.x,
                      y: dragOutlineVertex.originalPoint.y + p.y - dragOutlineVertex.pointerStart.y,
                    };
                    const sourceWalls = [
                      ...dragOutlineVertex.outlineSnapshot,
                      ...dragOutlineVertex.wallsSnapshot,
                    ];
                    const incidentWallIds = new Set(
                      sourceWalls
                        .filter(wall =>
                          matches(wall.start) || matches(wall.end) ||
                          (dragOutlineVertex.node === 'through' && wall.id === dragOutlineVertex.wallId)
                        )
                        .map(wall => wall.id)
                    );
                    const snapped = snapPointToOutline(
                      rawPoint,
                      sourceWalls.filter(wall => !incidentWallIds.has(wall.id)),
                      2
                    );
                    const nextPoint = snapped.snapped ? snapped.point : rawPoint;
                    setConnectionMarker(snapped.snapped ? snapped.point : null);

                    if (!dragOutlineVertex.historyRecorded) {
                      setHistory(current => [
                        ...current.slice(-29),
                        {
                          kind: 'level',
                          value: dragOutlineVertex.levelSnapshot,
                        },
                      ]);
                      setDragOutlineVertex(current => ({
                        ...current,
                        historyRecorded: true,
                      }));
                    }

                    if (dragOutlineVertex.node === 'through') {
                      const sourceWall = sourceWalls.find(wall => wall.id === dragOutlineVertex.wallId);
                      if (!sourceWall) return;
                      const arc = arcFromThreePoints(
                        sourceWall.start,
                        sourceWall.end,
                        nextPoint,
                        { ...sourceWall, through: nextPoint }
                      );
                      if (!arc) return;
                      updateLevel({
                        outline: dragOutlineVertex.outlineSnapshot.map(wall => wall.id === arc.id ? arc : wall),
                        walls: dragOutlineVertex.wallsSnapshot.map(wall => wall.id === arc.id ? arc : wall),
                      }, false);
                      return;
                    }

                    const moveWalls = walls => walls.map(wall => {
                      const start = matches(wall.start) ? nextPoint : wall.start;
                      const end = matches(wall.end) ? nextPoint : wall.end;
                      if (start === wall.start && end === wall.end) return wall;
                      if (wall.type === 'arc') {
                        const through = wall.through || wallPointAtDistance(wall, wallLength(wall) / 2);
                        return arcFromThreePoints(start, end, through, { ...wall, through }) || {
                          ...wall,
                          start,
                          end,
                        };
                      }
                      return { ...wall, start, end };
                    });

                    updateLevel({
                      outline: moveWalls(dragOutlineVertex.outlineSnapshot),
                      walls: moveWalls(dragOutlineVertex.wallsSnapshot),
                      corners: dragOutlineVertex.cornerSnapshot.map(corner =>
                        matches(corner) ? nextPoint : corner
                      ),
                    }, false);
                    return;
                  }

                  if (dragRoomVertex) {
                    if (!dragRoomVertex.historyRecorded) {
                      setHistory(current => [
                        ...current.slice(-29),
                        { kind: 'level', value: dragRoomVertex.levelSnapshot },
                      ]);
                      setDragRoomVertex(current => ({ ...current, historyRecorded: true }));
                    }
                    updateLevel({
                      rooms: (level.rooms || []).map(room => room.id === dragRoomVertex.id
                        ? {
                          ...room,
                          region: room.region.map((vertex, index) => index === dragRoomVertex.index ? p : vertex),
                          boundary_source: 'manual',
                          boundary_locked: true,
                          detection_warning: null,
                        }
                        : room),
                    }, false);
                    return;
                  }

                  if (dragRoofVertex) {
                    if (dragRoofVertex.ring === 'outer') {
                      setDraft(points => points.map((vertex, index) => index === dragRoofVertex.index ? p : vertex));
                    } else {
                      setRoofDraftHoles(rings => rings.map((ring, ringIndex) => ringIndex === dragRoofVertex.ring
                        ? ring.map((vertex, index) => index === dragRoofVertex.index ? p : vertex)
                        : ring));
                    }
                    return;
                  }

                  if (dragStairRotation) {
                    const direction = Math.atan2(
                      p.y - dragStairRotation.center.y,
                      p.x - dragStairRotation.center.x
                    );

                    if (!dragStairRotation.historyRecorded) {
                      setHistory(current => [
                        ...current.slice(-29),
                        {
                          kind: 'level',
                          value: dragStairRotation.level,
                        },
                      ]);
                      setDragStairRotation(current => ({
                        ...current,
                        historyRecorded: true,
                      }));
                    }

                    updateLevel({
                      stairs: level.stairs.map(stair =>
                        stair.id === dragStairRotation.id
                          ? { ...stair, direction }
                          : stair
                      ),
                    }, false);
                    return;
                  }

                  if (dragElement) {
                    const distance = Math.hypot(
                      p.x - dragElement.point.x,
                      p.y - dragElement.point.y
                    );

                    if (distance > 0.25) {
                      const movement = dragElementRef.current;
                      if (movement && !movement.historyRecorded) {
                        const kind = ['chimney', 'fireplace'].includes(movement.selection.kind)
                          ? 'building'
                          : 'level';
                        setHistory(current => [
                          ...current.slice(-29),
                          {
                            kind,
                            value: kind === 'building' ? movement.building : movement.level
                          }
                        ]);
                        movement.historyRecorded = true;
                      }

                      suppressElementClickRef.current = {
                        point: p,
                        time: Date.now()
                      };
                      moveSelectedElement(dragElement, p);
                    }

                    return;
                  }

                  if (dragPlatformVertex) {
                    const platform =
                      level.platforms.find(
                        item =>
                          item.id ===
                          dragPlatformVertex.id
                      );

                    if (platform) {
                      const points =
                        platform.points.map(
                          (
                            existing,
                            index
                          ) =>
                            index ===
                              dragPlatformVertex.index
                              ? p
                              : existing
                        );

                      updateLevel(
                        {
                          platforms:
                            level.platforms.map(
                              item =>
                                item.id ===
                                  platform.id
                                  ? {
                                    ...item,
                                    points,
                                  }
                                  : item
                            ),
                        },
                        false
                      );
                    }

                    return;
                  }

                  if (dragVoidVertex) {
                    const floorVoid =
                      level.floor_voids.find(
                        item =>
                          item.id ===
                          dragVoidVertex.id
                      );

                    if (floorVoid) {
                      const points =
                        floorVoid.points.map(
                          (
                            existing,
                            index
                          ) =>
                            index ===
                              dragVoidVertex.index
                              ? p
                              : existing
                        );

                      if (floorVoid.kind === 'open_to_sky') {
                        updateBuilding(moveSkyCourtyardVertex(building, floorVoid.id, dragVoidVertex.index, p), false);
                      } else {
                        updateLevel({ floor_voids: level.floor_voids.map(item => item.id === floorVoid.id ? { ...item, points } : item) }, false);
                      }
                    }

                    return;
                  }

                  if (drag) {
                    updateLevel(
                      {
                        floor_map: {
                          ...drag.map,

                          x:
                            (drag.map.x || 0) +
                            p.x -
                            drag.point.x,

                          y:
                            (drag.map.y || 0) +
                            p.y -
                            drag.point.y,
                        },
                      },
                      false
                    );

                    return;
                  }

                  if (
                    tool === 'stairs' &&
                    draft.length
                  ) {
                    const start =
                      draft[0];

                    const dx =
                      p.x -
                      start.x;

                    const dy =
                      p.y -
                      start.y;

                    if (
                      Math.hypot(
                        dx,
                        dy
                      ) > 0.25
                    ) {
                      setAngle(
                        Math.atan2(
                          dy,
                          dx
                        ) *
                        180 /
                        Math.PI
                      );
                    }
                  }
                }}
                onPointerUp={() => {
                  setDrag(null);
                  setDragElement(null);
                  dragElementRef.current = null;
                  setDragStairRotation(null);
                  setDragVoidVertex(null);
                  setDragPlatformVertex(null);
                  setDragOutlineVertex(null);
                  if (dragElement?.selection?.kind === 'wall' || dragOutlineVertex) {
                    updateLevel({ rooms: reconcileRoomsForLevel(level) }, false);
                  }
                  setDragRoomVertex(null);
                  setDragRoofVertex(null);
                }}
                onPointerCancel={() => {
                  setDrag(null);
                  setDragElement(null);
                  dragElementRef.current = null;
                  setDragStairRotation(null);
                  setDragVoidVertex(null);
                  setDragPlatformVertex(null);
                  setDragOutlineVertex(null);
                  setDragRoomVertex(null);
                  setDragRoofVertex(null);
                }}
              >
                <defs>
                  <pattern
                    id={`grid-${building.id}`}
                    width="5"
                    height="5"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 5 0 L 0 0 0 5"
                      fill="none"
                      stroke="#35493f"
                      strokeWidth="0.15"
                    />
                  </pattern>
                </defs>


                <rect
                  x={view[0]}
                  y={view[1]}
                  width={view[2]}
                  height={view[3]}
                  fill={`url(#grid-${building.id})`}
                />

                {map?.visible !== false &&
                  map?.image_url && (
                    <image
                      href={
                        map.image_url
                      }
                      x={
                        (map.x || 0) -
                        map.width_feet / 2
                      }
                      y={
                        -(map.y || 0) -
                        map.height_feet / 2
                      }
                      width={
                        map.width_feet
                      }
                      height={
                        map.height_feet
                      }
                      preserveAspectRatio="none"
                      opacity={
                        map.opacity ?? 0.6
                      }
                      transform={`rotate(${-(map.rotation || 0)
                        } ${map.x || 0
                        } ${-(map.y || 0)
                        })`}
                    />
                  )}

                <g
                  transform="scale(1,-1)"
                  fill="none"
                  stroke="#e7d6ae"
                  strokeWidth="0.45"
                >
                  {tool === 'calibrate-image' && calibrationPoints.map((point, index) => (
                    <circle key={`calibration-${index}`} cx={point.x} cy={point.y} r="1"
                      fill="#ffe08a" stroke="#14201c" strokeWidth="0.3" pointerEvents="none" />
                  ))}
                  {tool === 'calibrate-image' && calibrationPoints.length === 2 && (
                    <line x1={calibrationPoints[0].x} y1={calibrationPoints[0].y}
                      x2={calibrationPoints[1].x} y2={calibrationPoints[1].y}
                      stroke="#ffe08a" strokeDasharray="0.8 0.4" pointerEvents="none" />
                  )}
                  {tool === 'roof' && draft.length >= 2 && <polygon
                    points={draft.map(point => `${point.x},${point.y}`).join(' ')}
                    fill="rgba(255,224,138,.18)" stroke="#ffe08a" strokeWidth="0.6"
                    strokeDasharray={draft.length >= 3 ? undefined : '1 0.6'}
                  />}
                  {tool === 'roof' && roofDraftHoles.map((ring, ringIndex) => <g key={`roof-hole-${ringIndex}`}>
                    {ring.length >= 2 && <polygon points={ring.map(point => `${point.x},${point.y}`).join(' ')}
                      fill="rgba(20,32,28,.72)" stroke="#ff6b62" strokeWidth="0.55" />}
                    {ring.map((vertex, index) => <circle key={index} cx={vertex.x} cy={vertex.y} r="0.8"
                      fill={roofRingTarget === ringIndex ? '#ff6b62' : '#ffe08a'} stroke="#14201c" strokeWidth="0.25"
                      role="button" aria-label={`Move roof hole ${ringIndex + 1} corner ${index + 1}`}
                      onPointerDown={event => { event.stopPropagation(); setRoofRingTarget(ringIndex); setDragRoofVertex({ ring: ringIndex, index }); }} />)}
                  </g>)}
                  {tool === 'roof' && draft.map((vertex, index) => <circle key={`roof-outer-${index}`}
                    cx={vertex.x} cy={vertex.y} r="0.8" fill={roofRingTarget === 'outer' ? '#ffe08a' : '#efb465'}
                    stroke="#14201c" strokeWidth="0.25" role="button" aria-label={`Move roof footprint corner ${index + 1}`}
                    onPointerDown={event => { event.stopPropagation(); setRoofRingTarget('outer'); setDragRoofVertex({ ring: 'outer', index }); }} />)}
                  {exposedAreas.map((area, index) => {
                    const path = [area.footprint, ...area.holes]
                      .map(ring => `${ring.map((point, pointIndex) =>
                        `${pointIndex ? 'L' : 'M'} ${point.x} ${point.y}`
                      ).join(' ')} Z`)
                      .join(' ');

                    return (
                      <path
                        key={`exposed-roof-area-${index}`}
                        d={path}
                        fill="rgba(239,180,101,0.22)"
                        fillRule="evenodd"
                        stroke="#efb465"
                        strokeDasharray="1 0.6"
                        strokeWidth="0.45"
                      />
                    );
                  })}

                  {/*
                   * Lower-floor exterior guide.
                   */}
                  {belowLevel &&
                    (belowLevel.outline || []).map(
                      wall => (
                        <polyline
                          key={`below-${wall.id}`}
                          points={
                            wallPolyline(
                              wall,
                              0.75
                            )
                              .map(
                                point =>
                                  `${point.x},${point.y}`
                              )
                              .join(' ')
                          }
                          stroke="#ff2d2d"
                          strokeWidth="0.35"
                          strokeDasharray="1 0.75"
                          opacity="0.8"
                        />
                      )
                    )}

                  {/*
                   * Porches, decks, and balconies.
                   */}
                  {level.platforms.map(
                    platform => {
                      const selectedPlatform =
                        selection?.kind ===
                        'platform' &&
                        selection.id ===
                        platform.id;

                      return (
                        <g
                          key={
                            platform.id
                          }
                        >
                          <polygon
                            points={
                              platform.points
                                .map(
                                  point =>
                                    `${point.x},${point.y}`
                                )
                                .join(' ')
                            }
                            fill={
                              selectedPlatform
                                ? 'rgba(255,224,138,.14)'
                                : 'rgba(111,93,73,.16)'
                            }
                            stroke={
                              selectedPlatform
                                ? '#ffe08a'
                                : '#b69a78'
                            }
                            strokeWidth="0.5"
                          />

                          {platform.points.map(
                            (
                              start,
                              edgeIndex
                            ) => {
                              const end =
                                platform.points[
                                (
                                  edgeIndex +
                                  1
                                ) %
                                platform.points.length
                                ];

                              const edgeMode =
                                platformEdgeMode(
                                  level,
                                  platform,
                                  edgeIndex
                                );

                              return (
                                <line
                                  key={`platform-edge-${platform.id}-${edgeIndex}`}
                                  x1={
                                    start.x
                                  }
                                  y1={
                                    start.y
                                  }
                                  x2={
                                    end.x
                                  }
                                  y2={
                                    end.y
                                  }
                                  stroke={
                                    edgeMode ===
                                      'railing'
                                      ? '#ff6b62'
                                      : edgeMode ===
                                        'attached'
                                        ? '#ff2d2d'
                                        : '#b69a78'
                                  }
                                  strokeWidth={
                                    edgeMode ===
                                      'railing'
                                      ? 0.75
                                      : 0.4
                                  }
                                  strokeDasharray={
                                    edgeMode ===
                                      'open'
                                      ? '0.7 0.7'
                                      : undefined
                                  }
                                />
                              );
                            }
                          )}

                          {selectedPlatform &&
                            platform.points.map(
                              (
                                point,
                                index
                              ) => (
                                <circle
                                  key={`platform-vertex-${index}`}
                                  cx={
                                    point.x
                                  }
                                  cy={
                                    point.y
                                  }
                                  r="0.8"
                                  fill="#ffe08a"
                                  stroke="#14201c"
                                  strokeWidth="0.25"
                                  style={{
                                    cursor:
                                      'grab',
                                  }}
                                  onPointerDown={
                                    event => {
                                      event.stopPropagation();

                                      setDragPlatformVertex({
                                        id:
                                          platform.id,

                                        index,
                                      });
                                    }
                                  }
                                />
                              )
                            )}
                        </g>
                      );
                    }
                  )}

                  {/*
                   * Chimney footprints and fireplace openings.
                   */}
                  {activeChimneys.map(
                    chimney => {
                      const points =
                        chimneyPolygon(
                          chimney
                        );

                      const selectedChimney =
                        selection?.kind ===
                        'chimney' &&
                        selection.id ===
                        chimney.id;

                      const isPassThrough =
                        chimneyPassThroughs.some(
                          item =>
                            item.chimney_id ===
                            chimney.id
                        );

                      return (
                        <polygon
                          key={`chimney-${chimney.id}`}
                          points={
                            points
                              .map(
                                point =>
                                  `${point.x},${point.y}`
                              )
                              .join(' ')
                          }
                          fill={
                            isPassThrough
                              ? 'rgba(255,45,45,.14)'
                              : 'rgba(110,98,88,.22)'
                          }
                          stroke={
                            selectedChimney
                              ? '#ffe08a'
                              : isPassThrough
                                ? '#ff2d2d'
                                : '#8f8175'
                          }
                          strokeWidth={
                            selectedChimney
                              ? 0.9
                              : 0.5
                          }
                          strokeDasharray={
                            isPassThrough
                              ? '0.8 0.5'
                              : undefined
                          }
                        >
                          <title>
                            {isPassThrough
                              ? 'Chimney pass-through'
                              : 'Chimney stack'}
                          </title>
                        </polygon>
                      );
                    }
                  )}

                  {level.fireplaces.map(
                    fireplace => {
                      const chimney =
                        building.chimneys.find(
                          item =>
                            item.id ===
                            fireplace.chimney_id
                        );

                      if (!chimney) {
                        return null;
                      }

                      const marker =
                        fireplacePosition(
                          chimney,
                          fireplace,
                          0
                        );

                      const selectedFireplace =
                        selection?.kind ===
                        'fireplace' &&
                        selection.id ===
                        fireplace.id;

                      const horizontal =
                        fireplace.side ===
                        'north' ||
                        fireplace.side ===
                        'south';

                      const half =
                        fireplace.width /
                        2;

                      return horizontal
                        ? (
                          <line
                            key={
                              fireplace.id
                            }
                            x1={
                              marker.x -
                              half
                            }
                            y1={
                              marker.y
                            }
                            x2={
                              marker.x +
                              half
                            }
                            y2={
                              marker.y
                            }
                            stroke={
                              selectedFireplace
                                ? '#ffe08a'
                                : '#ef7f5d'
                            }
                            strokeWidth={
                              selectedFireplace
                                ? 1.4
                                : 0.9
                            }
                          />
                        )
                        : (
                          <line
                            key={
                              fireplace.id
                            }
                            x1={
                              marker.x
                            }
                            y1={
                              marker.y -
                              half
                            }
                            x2={
                              marker.x
                            }
                            y2={
                              marker.y +
                              half
                            }
                            stroke={
                              selectedFireplace
                                ? '#ffe08a'
                                : '#ef7f5d'
                            }
                            strokeWidth={
                              selectedFireplace
                                ? 1.4
                                : 0.9
                            }
                          />
                        );
                    }
                  )}

                  {/*
                   * Manual Open to Below regions.
                   */}
                  {level.floor_voids.map(
                    floorVoid => {
                      const selectedVoid =
                        selection?.kind ===
                        'floor_void' &&
                        selection.id ===
                        floorVoid.id;

                      return (
                        <g
                          key={
                            floorVoid.id
                          }
                        >
                          <polygon
                            points={
                              floorVoid.points
                                .map(
                                  p =>
                                    `${p.x},${p.y}`
                                )
                                .join(' ')
                            }
                            fill={
                              selectedVoid
                                ? 'rgba(255,224,138,.16)'
                                : 'rgba(255,45,45,.08)'
                            }
                            stroke={
                              selectedVoid
                                ? '#ffe08a'
                                : '#ff2d2d'
                            }
                            strokeDasharray="1 0.6"
                          />

                          {selectedVoid &&
                            floorVoid.points.map(
                              (
                                p,
                                index
                              ) => (
                                <circle
                                  key={
                                    index
                                  }
                                  cx={p.x}
                                  cy={p.y}
                                  r="0.8"
                                  fill="#ffe08a"
                                  stroke="#14201c"
                                  strokeWidth="0.25"
                                  style={{
                                    cursor:
                                      'grab',
                                  }}
                                  onPointerDown={
                                    event => {
                                      event.stopPropagation();

                                      setDragVoidVertex({
                                        id:
                                          floorVoid.id,
                                        index,
                                      });
                                    }
                                  }
                                />
                              )
                            )}
                        </g>
                      );
                    }
                  )}

                  {(level.rooms || []).map(room => {
                    const selectedRoom = selection?.kind === 'room' && selection.id === room.id;
                    return <g key={room.id}>
                      <polygon
                        points={(room.region || []).map(point => `${point.x},${point.y}`).join(' ')}
                        fill={selectedRoom ? 'rgba(255,224,138,.20)' : 'rgba(117,195,230,.13)'}
                        stroke={selectedRoom ? '#ffe08a' : '#ff6b62'}
                        strokeDasharray={room.boundary_locked ? '0.7 0.4' : undefined}
                        role="button"
                        aria-label={`Select room ${room.name || room.id}`}
                        onClick={event => { if (tool === 'select') { event.stopPropagation(); setSelection({ kind: 'room', id: room.id }); } }}
                      />
                      {selectedRoom && tool === 'select' && (room.region || []).map((vertex, index) => <circle
                        key={`${room.id}-vertex-${index}`}
                        cx={vertex.x}
                        cy={vertex.y}
                        r="0.8"
                        fill="#ffe08a"
                        stroke="#14201c"
                        strokeWidth="0.25"
                        role="button"
                        aria-label={`Move room corner ${index + 1}`}
                        style={{ cursor: 'grab' }}
                        onPointerDown={event => {
                          event.stopPropagation();
                          setDragRoomVertex({ id: room.id, index, levelSnapshot: level, historyRecorded: false });
                          event.currentTarget.ownerSVGElement?.setPointerCapture?.(event.pointerId);
                        }}
                      />)}
                    </g>;
                  })}
                  {/*
                   * Automatic stair openings inherited
                   * from stairs on the floor below.
                   */}
                  {automaticStairOpenings.map(
                    opening => (
                      <polygon
                        key={`automatic-stair-opening-${opening.stair_id}`}
                        points={
                          opening.points
                            .map(
                              p =>
                                `${p.x},${p.y}`
                            )
                            .join(' ')
                        }
                        fill="rgba(255,45,45,.08)"
                        stroke="#ff2d2d"
                        strokeDasharray="0.8 0.5"
                      >
                        <title>
                          Automatic stair opening from {opening.source_level_name}
                        </title>
                      </polygon>
                    )
                  )}

                  {/*
                   * Walls.
                   */}
                  {allWalls.map(wall => {
                    const points =
                      wallPolyline(
                        wall,
                        0.75
                      );

                    const selectedWall =
                      selection?.kind ===
                      'wall' &&
                      selection.id ===
                      wall.id;

                    const selectedFootprintSegment =
                      selectedWall &&
                      level.outline.some(item => item.id === wall.id);

                    const selectedRoomBoundaryWall =
                      ['room', 'room-redraw'].includes(tool) &&
                      roomBoundaryWallIds.includes(wall.id);

                    return (
                      <g key={wall.id}>
                        <polyline
                          points={
                            points
                              .map(
                                p =>
                                  `${p.x},${p.y}`
                              )
                              .join(' ')
                          }
                          stroke={
                            selectedRoomBoundaryWall
                              ? '#ff6b62'
                              : selectedWall
                              ? '#ffe08a'
                              : '#e7d6ae'
                          }
                          strokeWidth={
                            selectedRoomBoundaryWall
                              ? Math.max(1.2, wall.thickness * 0.65)
                              : selectedWall
                              ? Math.max(
                                0.8,
                                wall.thickness *
                                0.5
                              )
                              : Math.max(
                                0.45,
                                wall.thickness *
                                0.28
                              )
                          }
                          role={['room', 'room-redraw'].includes(tool) ? 'button' : undefined}
                          aria-label={['room', 'room-redraw'].includes(tool) ? `Room boundary wall ${wall.id}` : undefined}
                          aria-pressed={['room', 'room-redraw'].includes(tool) ? selectedRoomBoundaryWall : undefined}
                          style={['room', 'room-redraw'].includes(tool) ? { cursor: 'pointer' } : undefined}
                          onClick={['room', 'room-redraw'].includes(tool) ? event => {
                            event.stopPropagation();
                            setError('');
                            setRoomBoundaryWallIds(current => current.includes(wall.id)
                              ? current.filter(id => id !== wall.id)
                              : [...current, wall.id]);
                          } : undefined}
                        />

                        {selectedWall && [
                          ['start', wall.start],
                          ['end', wall.end],
                          ...(wall.type === 'arc'
                            ? [['through', wall.through || wallPointAtDistance(wall, wallLength(wall) / 2)]]
                            : []),
                        ].map(([endpoint, endpointPoint]) => (
                          <circle
                            key={`${endpoint}-handle`}
                            aria-label={`Move ${selectedFootprintSegment ? 'footprint' : 'wall'} ${endpoint} node`}
                            role="button"
                            cx={endpointPoint.x}
                            cy={endpointPoint.y}
                            r="1.15"
                            fill="#ffe08a"
                            stroke="#14201c"
                            strokeWidth="0.3"
                            style={{ cursor: 'grab' }}
                            onPointerDown={event => {
                              event.stopPropagation();
                              setDragOutlineVertex({
                                originalPoint: { ...endpointPoint },
                                pointerStart: point(event),
                                node: endpoint,
                                wallId: wall.id,
                                outlineSnapshot: level.outline,
                                wallsSnapshot: level.walls,
                                cornerSnapshot: level.corners,
                                levelSnapshot: level,
                                historyRecorded: false,
                              });
                              event.currentTarget.ownerSVGElement
                                ?.setPointerCapture?.(event.pointerId);
                            }}
                          />
                        ))}
                      </g>
                    );
                  })}

                  {/*
                   * Doors/windows/archways/curtains.
                   */}
                  {level.openings.map(
                    renderOpening
                  )}

                  {/*
                   * Existing stairs.
                   */}
                  {level.stairs.map(stair => {
                    const geometry =
                      stairGeometry(
                        stair,
                        level.floor_height
                      );

                    const selectedStair =
                      selection?.kind ===
                      'stair' &&
                      selection.id ===
                      stair.id;

                    const opening =
                      stairOpeningPolygon(
                        stair,
                        level.floor_height
                      );

                    const arrow =
                      stairArrowPoints(
                        geometry
                      );

                    return (
                      <g key={stair.id}>
                        {selectedStair &&
                          opening.length >= 3 && (
                            <polygon
                              points={
                                opening
                                  .map(
                                    p =>
                                      `${p.x},${p.y}`
                                  )
                                  .join(' ')
                              }
                              fill="rgba(255,224,138,.10)"
                              stroke="#ffe08a"
                              strokeDasharray="0.8 0.5"
                            />
                          )}

                        {geometry.segments.map(
                          (
                            segment,
                            index
                          ) => {
                            const flightIndex = geometry.segments.slice(0, index + 1)
                              .filter(item => item.kind === 'flight').length - 1;
                            const activeFlightSegment = selectedStair && activeStairFlight === flightIndex;
                            const color =
                              activeFlightSegment
                                ? '#ff6b62'
                                : selectedStair
                                  ? '#ffe08a'
                                : segment.kind ===
                                  'landing'
                                  ? '#ffd27d'
                                  : '#efb465';

                            return segment.kind === 'landing' && segment.footprint ? (
                              <polygon
                                key={index}
                                points={segment.footprint.map(point => `${point.x},${point.y}`).join(' ')}
                                fill={color}
                                fillOpacity="0.55"
                                stroke={color}
                                strokeWidth="0.35"
                              />
                            ) : (
                              <line
                                key={index}
                                x1={segment.start.x}
                                y1={segment.start.y}
                                x2={segment.end.x}
                                y2={segment.end.y}
                                stroke={color}
                                strokeWidth={activeFlightSegment
                                  ? Math.max(1.4, stair.width * 0.7)
                                  : Math.max(1, stair.width * 0.4)}
                              />
                            );
                          }
                        )}

                        {arrow && (
                          <polyline
                            points={`
                              ${arrow.left.x},${arrow.left.y}
                              ${arrow.end.x},${arrow.end.y}
                              ${arrow.right.x},${arrow.right.y}
                            `}
                            stroke="#ffe08a"
                            strokeWidth="0.7"
                          />
                        )}

                        <circle
                          cx={
                            geometry.arrival.x
                          }
                          cy={
                            geometry.arrival.y
                          }
                          r="0.65"
                          fill={selectedStair && activeStairFlight === (stair.flight_shares?.length || 1) - 1 ? '#ff6b62' : '#ffe08a'}
                        />

                        {selectedStair && (() => {
                          const radius = Math.max(6, (stair.width || 3) * 2);
                          const direction = Number(stair.direction) || 0;
                          const center = {
                            x: Number(stair.start_x) || 0,
                            y: Number(stair.start_y) || 0,
                          };
                          const handle = {
                            x: center.x + Math.cos(direction) * radius,
                            y: center.y + Math.sin(direction) * radius,
                          };

                          return (
                            <g aria-label="Rotate selected stairs">
                              <circle
                                cx={center.x}
                                cy={center.y}
                                r={radius}
                                fill="none"
                                stroke="#ef3f45"
                                strokeWidth="0.55"
                                strokeDasharray="1.2 0.7"
                                pointerEvents="none"
                              />
                              <line
                                x1={center.x}
                                y1={center.y}
                                x2={handle.x}
                                y2={handle.y}
                                stroke="#ef3f45"
                                strokeWidth="0.65"
                                pointerEvents="none"
                              />
                              <circle
                                role="button"
                                aria-label="Rotate stairs"
                                cx={handle.x}
                                cy={handle.y}
                                r="1.35"
                                fill="#ef3f45"
                                stroke="#fff2e8"
                                strokeWidth="0.35"
                                style={{ cursor: 'grab' }}
                                onPointerDown={event => {
                                  event.stopPropagation();
                                  setDragStairRotation({
                                    id: stair.id,
                                    center,
                                    level,
                                    historyRecorded: false,
                                  });
                                  event.currentTarget.ownerSVGElement
                                    ?.setPointerCapture?.(event.pointerId);
                                }}
                              >
                                <title>Drag to rotate these stairs</title>
                              </circle>
                            </g>
                          );
                        })()}
                      </g>
                    );
                  })}

                  {/*
                   * Hatches.
                   */}
                  {level.hatches.map(
                    hatch => (
                      <rect
                        key={hatch.id}
                        stroke={
                          selection?.kind ===
                            'hatch' &&
                            selection.id ===
                            hatch.id
                            ? '#ffe08a'
                            : '#efb465'
                        }
                        x={
                          hatch.x -
                          hatch.width / 2
                        }
                        y={
                          hatch.y -
                          hatch.depth / 2
                        }
                        width={
                          hatch.width
                        }
                        height={
                          hatch.depth
                        }
                      />
                    )
                  )}

                  {/*
                   * Ladders.
                   */}
                  {level.ladders.map(
                    ladder => (
                      <rect
                        key={ladder.id}
                        stroke={
                          selection?.kind ===
                            'ladder' &&
                            selection.id ===
                            ladder.id
                            ? '#ffe08a'
                            : '#ff2d2d'
                        }
                        strokeDasharray="0.8 0.5"
                        x={
                          ladder.x -
                          ladder.width / 2
                        }
                        y={
                          ladder.y -
                          ladder.depth / 2
                        }
                        width={
                          ladder.width
                        }
                        height={
                          ladder.depth
                        }
                      />
                    )
                  )}

                  {/*
                   * Arrival guides from the level below.
                   */}
                  {guides.map(
                    (
                      guide,
                      index
                    ) => (
                      <circle
                        key={index}
                        cx={guide.x}
                        cy={guide.y}
                        r="2"
                        stroke="#ff2d2d"
                        strokeDasharray="1 0.5"
                      >
                        <title>
                          {guide.kind} arrival from {guide.source}
                        </title>
                      </circle>
                    )
                  )}

                  {/*
                   * Live stair creation preview.
                   */}
                  {previewStairGeometry && (
                    <g pointerEvents="none">
                      {previewStairOpening.length >=
                        3 && (
                          <polygon
                            points={
                              previewStairOpening
                                .map(
                                  p =>
                                    `${p.x},${p.y}`
                                )
                                .join(' ')
                            }
                            fill="rgba(239,180,101,.10)"
                            stroke="#efb465"
                            strokeDasharray="0.7 0.5"
                          />
                        )}

                      {previewStairGeometry.segments.map(
                        (
                          segment,
                          index
                        ) => {
                          const flightIndex = previewStairGeometry.segments.slice(0, index + 1)
                            .filter(item => item.kind === 'flight').length - 1;
                          const active = activeStairFlight === flightIndex;
                          return <line
                            key={index}
                            x1={
                              segment.start.x
                            }
                            y1={
                              segment.start.y
                            }
                            x2={
                              segment.end.x
                            }
                            y2={
                              segment.end.y
                            }
                            stroke={
                              active
                                ? '#ff6b62'
                                : segment.kind ===
                                'landing'
                                ? '#ffd27d'
                                : '#efb465'
                            }
                            strokeWidth={
                              active ? Math.max(1.4, width * 0.7) : Math.max(
                                1,
                                width *
                                0.45
                              )
                            }
                          />;
                        }
                      )}

                      {(() => {
                        const arrow =
                          stairArrowPoints(
                            previewStairGeometry
                          );

                        if (!arrow) {
                          return null;
                        }

                        return (
                          <polyline
                            points={`
                              ${arrow.left.x},${arrow.left.y}
                              ${arrow.end.x},${arrow.end.y}
                              ${arrow.right.x},${arrow.right.y}
                            `}
                            stroke="#ffe08a"
                            strokeWidth="0.8"
                          />
                        );
                      })()}

                      <circle
                        cx={
                          previewStairGeometry
                            .arrival.x
                        }
                        cy={
                          previewStairGeometry
                            .arrival.y
                        }
                        r="0.75"
                        fill="#efb465"
                      />
                    </g>
                  )}

                  {(
                    tool === 'footprint' ||
                    tool ===
                    'open-below' ||
                    tool === 'open-sky' ||
                    tool ===
                    'platform' ||
                    tool === 'roof' ||
                    tool === 'wall'
                  ) &&
                    draft.length > 1 && (
                      <g>
                        {draft.slice(0, -1).map((start, index) => {
                          const end = draft[index + 1];
                          const arc = draftArcs.find(candidate =>
                            Math.hypot(candidate.start.x - start.x, candidate.start.y - start.y) < 0.001 &&
                            Math.hypot(candidate.end.x - end.x, candidate.end.y - end.y) < 0.001
                          );
                          const segment = arc
                            ? wallPolyline(arc, 0.4)
                            : [start, end];
                          return (
                            <polyline
                              key={`draft-segment-${index}-${arc?.id || 'line'}`}
                              points={segment.map(p => `${p.x},${p.y}`).join(' ')}
                              stroke={arc ? '#efb465' : '#ffe08a'}
                              strokeWidth={Math.max(0.45, wallThickness * 0.28)}
                              strokeDasharray={arc ? undefined : '0.8 0.45'}
                            />
                          );
                        })}
                      </g>
                    )}

                  {arcDraft.length > 1 && (
                    <polyline
                      points={arcDraft.map(p => `${p.x},${p.y}`).join(' ')}
                      stroke="#efb465"
                      strokeDasharray="0.8 0.5"
                    />
                  )}

                  {previewArc && (
                    <polyline
                      className="blueprint-arc-preview"
                      points={wallPolyline(previewArc, 0.4)
                        .map(p => `${p.x},${p.y}`)
                        .join(' ')}
                      stroke="#efb465"
                      strokeWidth="0.8"
                      strokeDasharray="0.8 0.45"
                      data-testid="blueprint-arc-preview"
                      pointerEvents="none"
                    />
                  )}

                  {tool !== 'stairs' &&
                    draft.map(
                      (
                        p,
                        index
                      ) => (
                        <circle
                          key={index}
                          cx={p.x}
                          cy={p.y}
                          r="0.6"
                          fill="#ffe08a"
                        />
                      )
                    )}

                  {tool === 'stairs' &&
                    stairStart && (
                      <circle
                        cx={
                          stairStart.x
                        }
                        cy={
                          stairStart.y
                        }
                        r="0.7"
                        fill="#ffe08a"
                      />
                    )}
                </g>
                <g pointerEvents="none" aria-label="Wall connection markers">
                  {connectionGaps.map(gap => <circle key={`${gap.wallId}:${gap.endpoint}`} cx={gap.point.x} cy={-gap.point.y} r="0.45" fill="none" stroke="#ff805d" strokeWidth="0.18">
                    <title>{`Wall ${gap.wallId} ${gap.endpoint}: ${gap.distance.toFixed(2)} ft gap`}</title>
                  </circle>)}
                  {connectionMarker && <circle cx={connectionMarker.x} cy={-connectionMarker.y} r="0.5" fill="none" stroke="#8affc1" strokeWidth="0.2" aria-label="Connected wall endpoint" />}
                </g>
              </svg>

              <div className="blueprint-tools">
                <button
                  onClick={() =>
                    fit()
                  }
                >
                  Fit plan
                </button>

                {[0.75, 1.3333].map(
                  (
                    scale,
                    index
                  ) => (
                    <button
                      key={index}
                      onClick={() =>
                        setView(
                          current => [
                            current[0] +
                            current[2] *
                            (
                              1 -
                              scale
                            ) /
                            2,

                            current[1] +
                            current[3] *
                            (
                              1 -
                              scale
                            ) /
                            2,

                            current[2] *
                            scale,

                            current[3] *
                            scale,
                          ]
                        )
                      }
                    >
                      {index
                        ? 'Zoom out'
                        : 'Zoom in'}
                    </button>
                  )
                )}

                <button
                  disabled={
                    tool !==
                    'footprint' ||
                    draft.length < 3 ||
                    arcDraft.length > 1
                  }
                  onClick={() => {
                    const nextWallId = createWallIdFactory();
                    const outline =
                      draft.map((start, index) => {
                        const end = draft[(index + 1) % draft.length];
                        const arc = draftArcs.find(candidate =>
                          Math.hypot(candidate.start.x - start.x, candidate.start.y - start.y) < 0.001 &&
                          Math.hypot(candidate.end.x - end.x, candidate.end.y - end.y) < 0.001
                        );

                        return arc || {
                          id: `${nextWallId()}-line-${index}`,
                          type: 'line',
                          start,
                          end,
                          thickness: wallThickness,
                          material: level.exterior_material || 'existing',
                        };
                      });
                    const usedWallIds = new Set(level.walls.map(wall => wall.id));
                    const uniqueOutline = outline.map((wall, index) => {
                      let id = wall.id;
                      let suffix = 1;
                      while (usedWallIds.has(id)) {
                        id = `${wall.id}-outline-${index}-${suffix++}`;
                      }
                      usedWallIds.add(id);
                      return id === wall.id ? wall : { ...wall, id };
                    });

                    updateLevel({
                      corners:
                        draft,

                      outline: uniqueOutline,

                      closed:
                        true,

                      openings:
                        [],
                    });

                    setDraft([]);
                    setDraftArcs([]);
                    setArcDraft([]);
                    setTool('select');
                  }}
                >
                  Finish footprint
                </button>

                <button
                  disabled={
                    tool !==
                    'platform' ||
                    draft.length < 3
                  }
                  onClick={() => {
                    const platform = {
                      id:
                        blueprintId(),

                      kind:
                        'platform',

                      style:
                        platformStyle,

                      points:
                        draft.map(
                          point => ({
                            ...point,
                          })
                        ),

                      thickness:
                        platformThickness,

                      elevation_offset:
                        0,

                      railing:
                        platformRailing,

                      railing_height:
                        3.5,

                      edge_modes:
                        draft.map(
                          () =>
                            'auto'
                        ),
                    };

                    updateLevel({
                      platforms: [
                        ...level.platforms,
                        platform,
                      ],
                    });

                    setDraft([]);
                    setTool('select');

                    setSelection({
                      kind:
                        'platform',

                      id:
                        platform.id,
                    });
                  }}
                >
                  Finish Platform
                </button>

                <button
                  disabled={
                    tool !==
                    'open-below' ||
                    draft.length < 3
                  }
                  onClick={() => {
                    const floorVoid = {
                      id:
                        blueprintId(),

                      points:
                        draft.map(
                          point => ({
                            ...point,
                          })
                        ),
                    };

                    updateLevel({
                      floor_voids: [
                        ...level.floor_voids,
                        floorVoid,
                      ],
                    });

                    setDraft([]);
                    setTool('select');

                    setSelection({
                      kind:
                        'floor_void',

                      id:
                        floorVoid.id,
                    });
                  }}
                >
                  Finish Open to Below
                </button>

                <button disabled={!['room', 'room-redraw'].includes(tool) || !roomBoundary.region} onClick={() => {
                  const existing = roomRedrawId
                    ? (level.rooms || []).find(room => room.id === roomRedrawId)
                    : null;
                  const room = existing
                    ? {
                      ...existing,
                      region: roomBoundary.region.map(point => ({ ...point })),
                      boundary_wall_ids: [...roomBoundaryWallIds],
                      boundary_source: 'walls',
                      boundary_locked: true,
                      detection_warning: null,
                    }
                    : {
                      ...createRoom(building, level, roomBoundary.region),
                      boundary_wall_ids: [...roomBoundaryWallIds],
                      boundary_source: 'walls',
                    };
                  updateLevel({ rooms: existing
                    ? (level.rooms || []).map(item => item.id === room.id ? room : item)
                    : [...(level.rooms || []), room] });
                  setDraft([]);
                  setRoomBoundaryWallIds([]);
                  setRoomRedrawId(null);
                  setTool('select');
                  setSelection({ kind: 'room', id: room.id });
                }}>{tool === 'room-redraw' ? 'Finish Room Boundary' : 'Finish Room'}</button>

                <button disabled={tool !== 'open-sky' || draft.length < 3} onClick={() => {
                  const id = blueprintId();
                  updateBuilding(addSkyCourtyard(building, level.elevation_feet, draft, id));
                  setDraft([]);
                  setTool('select');
                  setSelection({ kind: 'floor_void', id });
                }}>Finish Open to Sky Courtyard</button>

                <button
                  disabled={
                    !draft.length
                  }
                  onClick={() =>
                    setDraft(
                      current =>
                        current.slice(
                          0,
                          -1
                        )
                    )
                  }
                >
                  Undo point
                </button>
              </div>

              <p className="blueprint-hint">
                Red dashed exterior lines show the level below for alignment. Red floor outlines mark automatic stair openings, chimney pass-throughs, or stair/ladder arrivals. Stairs and ladders travel upward; hatches and Open to Below regions cut the current floor. Platforms add floor outside or beyond the main footprint.
              </p>
            </div>

            <aside className="blueprint-selection-panel" aria-label="Selected element settings">
              {connectionGaps.length > 0 && <div className="blueprint-tools" aria-label="Wall connections">
                {connectionGaps.map(gap => <div key={`${gap.wallId}:${gap.endpoint}`}>
                  <span>Wall {gap.wallId} {gap.endpoint}: {gap.distance.toFixed(2)} ft gap</span>
                  {gap.targets.length > 1 && <label>Connection target
                    <select aria-label={`Connection target ${gap.wallId} ${gap.endpoint}`} value={connectionRepairChoices[`${gap.wallId}:${gap.endpoint}`] || ''}
                      onChange={event => setConnectionRepairChoices(values => ({ ...values, [`${gap.wallId}:${gap.endpoint}`]: event.target.value }))}>
                      <option value="">Choose a wall</option>
                      {gap.targets.map(target => <option key={target.wallId} value={target.wallId}>Wall {target.wallId} ({target.error.toFixed(2)} ft)</option>)}
                    </select>
                  </label>}
                </div>)}
                <button type="button" disabled={!connectionGaps.some(gap => gap.repairable)} onClick={() => {
                  const repaired = repairWallConnections(level, connectionRepairChoices);
                  if (repaired.errors.length) { setError(repaired.errors.join(' ')); return; }
                  updateLevel({ outline: repaired.level.outline, walls: repaired.level.walls, openings: repaired.level.openings });
                  setConnectionRepairChoices({});
                  setError('');
                }}>Repair Wall Connections</button>
              </div>}
              {tool === 'select' ? (
                <>
                  <h3>Selected element</h3>
                  {selection ? renderSelectionEditor() : (
                    <p>Select an element on the plan to edit its settings here.</p>
                  )}
                  <p>Delete/Backspace removes the selected element. Escape clears the selection.</p>
                </>
              ) : (
                <>
                  <h3>Tool settings</h3>
                  <section
                    className="blueprint-active-tool-controls"
                    aria-label={`${tool} tool settings`}
                  >
                    <div className="blueprint-active-tool-heading">
                      <strong>{tool === 'double-door' ? 'Double door' : tool}</strong>
                    </div>
                    {hasActiveToolControls ? (
                      <div className="blueprint-active-tool-fields">
                        {activeToolControls}
                      </div>
                    ) : (
                      <p>This tool has no additional settings.</p>
                    )}
                  </section>
                  <p>Place the element on the plan. Its settings will remain here after placement.</p>
                </>
              )}
            </aside>
          </fieldset>
        </DialogContent>

        <DialogActions className="blueprint-dialog-actions">
          <span className="blueprint-save-status" role="status">
            {drafting ? 'Draft only — choose Save Building after closing this editor' : 'Changes save as you work'}
          </span>
          <Button
            className="blueprint-done-action"
            variant="contained"
            disabled={busy}
            onClick={() =>
              { setOpen(false); onEditorClose?.(); }
            }
          >
            Done editing
          </Button>
        </DialogActions>
      </Dialog>
      {deleteLevelImpact && <Dialog open onClose={() => setDeleteLevelImpact(null)} transitionDuration={0}
        PaperProps={{ className: 'blueprint-level-delete-dialog' }}>
        <DialogTitle>Delete {deleteLevelImpact?.level_name}?</DialogTitle>
        <DialogContent>
          <p>This permanently removes the level and its contents. Choose whether the floors above it stay in place or move down to close the gap.</p>
          <dl className="blueprint-level-delete-impact">
            <div><dt>Walls</dt><dd>{deleteLevelImpact?.walls || 0}</dd></div>
            <div><dt>Openings</dt><dd>{deleteLevelImpact?.openings || 0}</dd></div>
            <div><dt>Rooms</dt><dd>{deleteLevelImpact?.rooms || 0}</dd></div>
            <div><dt>Vertical connections</dt><dd>{deleteLevelImpact?.stairs || 0}</dd></div>
            <div><dt>Floor images</dt><dd>{deleteLevelImpact?.floor_images || 0}</dd></div>
            <div><dt>Roofs affected</dt><dd>{deleteLevelImpact?.roofs || 0}</dd></div>
            <div><dt>Chimneys affected</dt><dd>{deleteLevelImpact?.chimneys || 0}</dd></div>
          </dl>
          <div className="blueprint-level-delete-choices">
            <div>
              <strong>Leave level empty</strong>
              <span>Keeps upper floors at their current numbers and elevations. You can add this level again later.</span>
            </div>
            {deleteLevelImpact.upper_levels > 0 && <div>
              <strong>Collapse upper levels</strong>
              <span>Moves {deleteLevelImpact.upper_levels} upper {deleteLevelImpact.upper_levels === 1 ? 'level' : 'levels'} down {deleteLevelImpact.collapse_elevation_feet} ft and closes the numbered gap.</span>
            </div>}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteLevelImpact(null)}>Cancel</Button>
          <Button color="error" variant="outlined" onClick={() => {
            const levelId = deleteLevelImpact.level_id;
            const next = deleteBuildingLevel(building, levelId);
            onDeleteLevelReferences?.(levelId);
            onChange(next);
            setDeleteLevelImpact(null);
          }}>Delete and leave empty</Button>
          {deleteLevelImpact.upper_levels > 0 && <Button color="error" variant="contained" onClick={() => {
            const levelId = deleteLevelImpact.level_id;
            const next = deleteBuildingLevel(building, levelId, { collapseUpperLevels: true });
            onDeleteLevelReferences?.(levelId);
            onChange(next);
            setDeleteLevelImpact(null);
          }}>Delete and collapse</Button>}
        </DialogActions>
      </Dialog>}
      {roofConflict && <Dialog open onClose={() => setRoofConflict(null)} transitionDuration={0}
        PaperProps={{ className: 'blueprint-roof-conflict-dialog' }}>
        <DialogTitle>Roof footprint conflict</DialogTitle>
        <DialogContent>
          <p>The new roof substantially overlaps an existing roof on the same support level.</p>
          <div className="blueprint-roof-conflict-comparison">
            <div>
              <strong>Existing</strong>
              {[...new Map(roofConflict.conflicts.map(({ existingRoof }) => [existingRoof.id, existingRoof])).values()]
                .map(roof => <span key={roof.id}>{roof.name || roof.type}{roof.automatic ? ' · Automatic' : ''}</span>)}
            </div>
            <div>
              <strong>New</strong>
              {[...new Map(roofConflict.conflicts.map(({ newRoof }) => [newRoof.id, newRoof])).values()]
                .map(roof => <span key={roof.id}>{roof.name || roof.type}</span>)}
            </div>
          </div>
          <p>Choose which version should cover this area. The unchosen conflicting version will not be kept.</p>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            const conflictingNewIds = new Set(roofConflict.conflicts.map(({ newRoof }) => newRoof.id));
            onChange({
              ...roofConflict.nextBuilding,
              roofs: (roofConflict.nextBuilding.roofs || []).filter(roof => !conflictingNewIds.has(roof.id)),
            });
            setRoofConflict(null);
          }}>Keep existing</Button>
          <Button variant="contained" onClick={() => {
            const conflictingExistingIds = new Set(roofConflict.conflicts.map(({ existingRoof }) => existingRoof.id));
            const automaticConflictIds = roofConflict.conflicts
              .map(({ existingRoof }) => existingRoof)
              .filter(roof => roof.automatic || roof.id.startsWith('automatic-'))
              .map(roof => roof.id);
            onChange({
              ...roofConflict.nextBuilding,
              roofs: (roofConflict.nextBuilding.roofs || []).filter(roof => !conflictingExistingIds.has(roof.id)),
              suppressed_automatic_roof_ids: [...new Set([
                ...(roofConflict.nextBuilding.suppressed_automatic_roof_ids || []),
                ...automaticConflictIds,
              ])],
            });
            setRoofConflict(null);
          }}>Use new roof</Button>
        </DialogActions>
      </Dialog>}
    </section>
  );
}
