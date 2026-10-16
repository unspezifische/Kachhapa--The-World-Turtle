import { PointerEventTypes } from '@babylonjs/core';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { createSettlementBabylonWorkflow } from './settlementBabylonWorkflow';
import { closeBlueprintFootprint } from './settlementEditor';

test('terrain sculpting creates, moves, and disposes its visible brush cursor', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const brushMeshRef = { current: null };
  const state = { activeTool: 'terrain', brushMeshRef, brushRadius: 100 };
  const dispose = createSettlementBabylonWorkflow(() => state).attach(scene);
  const brush = brushMeshRef.current;

  expect(brush).toBeTruthy();
  expect(brush.isEnabled()).toBe(false);
  expect(brush.isPickable).toBe(false);

  scene.onPointerObservable.notifyObservers({
    type: PointerEventTypes.POINTERMOVE,
    event: { buttons: 0 },
    pickInfo: { hit: true, pickedMesh: { name: 'terrain' }, pickedPoint: new Vector3(1, 2, 3) }
  }, PointerEventTypes.POINTERMOVE);

  expect(brush.isEnabled()).toBe(true);
  expect(brush.position.x).toBe(1);
  expect(brush.position.z).toBe(3);
  expect(brush.scaling.x).toBe(2);

  dispose();
  expect(brushMeshRef.current).toBeNull();
  expect(brush.isDisposed()).toBe(true);
  scene.dispose();
  engine.dispose();
});

test('blueprint footprint collects terrain points, previews the next edge, and stops adding corners when closed', () => {
  let listener;
  let ground = new Vector3(0, 0, 0);
  const terrain = { name: 'terrain', metadata: { kind: 'terrain' }, isEnabled: () => true };
  const state = { activeTool: 'build', buildMode: 'draw-blueprint', blueprintDraft: null,
    setBlueprintDraft: value => { state.blueprintDraft = value; },
    setBlueprintHoverPoint: jest.fn(), setSelected: jest.fn() };
  const scene = { pointerX: 0, pointerY: 0,
    getEngine: () => ({ getRenderingCanvas: () => document.createElement('canvas') }),
    onPointerObservable: { add: callback => { listener = callback; return callback; }, remove: jest.fn() },
    pick: (_x, _y, predicate) => predicate(terrain)
      ? { hit: true, pickedMesh: terrain, pickedPoint: ground } : { hit: false } };
  const dispose = createSettlementBabylonWorkflow(() => state).attach(scene);
  const click = () => listener({ type: PointerEventTypes.POINTERDOWN, event: { button: 0 },
    pickInfo: { hit: true, pickedMesh: terrain, pickedPoint: ground } });
  click();
  ground = new Vector3(2, 0, 0);
  listener({ type: PointerEventTypes.POINTERMOVE, event: { buttons: 0 },
    pickInfo: { hit: true, pickedMesh: terrain, pickedPoint: ground } });
  expect(state.setBlueprintHoverPoint).toHaveBeenCalledWith(expect.objectContaining({ x: 100, y: 0 }));
  click();
  ground = new Vector3(2, 0, 2);
  click();
  expect(state.blueprintDraft.levels[0].corners).toHaveLength(3);
  state.blueprintDraft = closeBlueprintFootprint(state.blueprintDraft);
  ground = new Vector3(4, 0, 2);
  click();
  expect(state.blueprintDraft.levels[0].corners).toHaveLength(3);
  dispose();
});

test('property boundary and outdoor area tools send terrain clicks to the polygon editor', () => {
  let listener;
  let ground = new Vector3(1, 0, 2);
  const terrain = { name: 'terrain', metadata: { kind: 'terrain' }, isEnabled: () => true };
  const onPropertyPolygonPoint = jest.fn();
  const state = { activeTool: 'build', buildMode: 'draw-property-boundary', onPropertyPolygonPoint };
  const scene = { pointerX: 0, pointerY: 0,
    getEngine: () => ({ getRenderingCanvas: () => document.createElement('canvas') }),
    onPointerObservable: { add: callback => { listener = callback; return callback; }, remove: jest.fn() },
    pick: (_x, _y, predicate) => predicate(terrain)
      ? { hit: true, pickedMesh: terrain, pickedPoint: ground } : { hit: false } };
  const dispose = createSettlementBabylonWorkflow(() => state).attach(scene);
  const click = () => listener({ type: PointerEventTypes.POINTERDOWN, event: { button: 0 },
    pickInfo: { hit: true, pickedMesh: terrain, pickedPoint: ground } });

  click();
  expect(onPropertyPolygonPoint).toHaveBeenLastCalledWith(expect.objectContaining({ x: 50, y: 100 }));
  state.buildMode = 'draw-outdoor-area';
  ground = new Vector3(3, 0, 4);
  click();
  expect(onPropertyPolygonPoint).toHaveBeenLastCalledWith(expect.objectContaining({ x: 150, y: 200 }));
  expect(onPropertyPolygonPoint).toHaveBeenCalledTimes(2);
  dispose();
});

test('editing a property corner follows terrain and never places another building', () => {
  let listener;
  const terrain = { name: 'terrain', metadata: { kind: 'terrain' }, isEnabled: () => true };
  const handle = { metadata: { kind: 'property-boundary-handle', propertyId: 'estate', index: 2 } };
  const state = { activeTool: 'build', buildMode: 'edit-property-boundary', editingPropertyBoundaryId: 'estate',
    onPropertyBoundaryVertexMove: jest.fn(), setBuildings: jest.fn() };
  const scene = { pointerX: 0, pointerY: 0,
    getEngine: () => ({ getRenderingCanvas: () => document.createElement('canvas') }),
    onPointerObservable: { add: callback => { listener = callback; return callback; }, remove: jest.fn() },
    pick: (_x, _y, predicate) => predicate(handle)
      ? { hit: true, pickedMesh: handle, pickedPoint: new Vector3(0, 0, 0) }
      : { hit: true, pickedMesh: terrain, pickedPoint: new Vector3(2, 0, 3) } };
  const dispose = createSettlementBabylonWorkflow(() => state).attach(scene);
  listener({ type: PointerEventTypes.POINTERDOWN, event: { button: 0 }, pickInfo: { hit: true, pickedMesh: handle, pickedPoint: new Vector3(0, 0, 0) } });
  listener({ type: PointerEventTypes.POINTERMOVE, event: { buttons: 1 }, pickInfo: { hit: true, pickedMesh: handle, pickedPoint: new Vector3(0, 0, 0) } });
  expect(state.onPropertyBoundaryVertexMove).toHaveBeenCalledWith(2, expect.objectContaining({ x: 100, y: 150 }));
  listener({ type: PointerEventTypes.POINTERUP, event: { button: 0 } });
  expect(state.setBuildings).not.toHaveBeenCalled();
  dispose();
});

test('Shift-click selects multiple road handles and drags them as a group', () => {
  let listener;
  const road = { id: 'road', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }] };
  const terrain = { name: 'terrain', metadata: { kind: 'terrain' }, isEnabled: () => true };
  const state = { activeTool: 'road', roadMode: 'refine', selectedRoadId: 'road',
    selectedRoadPointIndexes: [], roadSnapEnabled: false, roads: [road],
    setSelectedRoadId: jest.fn(), setSelectedRoadPointIndex: jest.fn(),
    setSelectedRoadPointIndexes: jest.fn(value => { state.selectedRoadPointIndexes = value; }),
    setRoads: updater => { state.roads = updater(state.roads); }, recordSplineUndo: jest.fn() };
  const scene = { pointerX: 0, pointerY: 0,
    getEngine: () => ({ getRenderingCanvas: () => document.createElement('canvas') }),
    onPointerObservable: { add: callback => { listener = callback; return callback; }, remove: jest.fn() },
    pick: (_x, _y, predicate) => predicate(terrain)
      ? { hit: true, pickedMesh: terrain, pickedPoint: { x: 1, y: 0, z: 0 } }
      : { hit: false } };
  const dispose = createSettlementBabylonWorkflow(() => state).attach(scene);
  const click = (index, shiftKey) => listener({ type: PointerEventTypes.POINTERDOWN,
    event: { button: 0, shiftKey }, pickInfo: { hit: true,
      pickedMesh: { metadata: { kind: 'spline-handle', type: 'road-point', id: 'road', index, item: road } },
      pickedPoint: { x: road.points[index].x / 50, y: 0, z: 0 } } });
  click(0, true);
  click(1, true);
  expect(state.selectedRoadPointIndexes).toEqual([0, 1]);
  expect(state.setSelectedRoadPointIndex).toHaveBeenLastCalledWith(null);
  click(0, false);
  listener({ type: PointerEventTypes.POINTERMOVE, event: { buttons: 1 },
    pickInfo: { hit: true, pickedMesh: terrain, pickedPoint: { x: 1, y: 0, z: 0 } } });
  expect(state.roads[0].points).toEqual([{ x: 50, y: 0 }, { x: 150, y: 0 }, { x: 200, y: 0 }]);
  expect(state.recordSplineUndo).toHaveBeenCalledTimes(1);
  dispose();
});

test('region handle wins over a wall when refining a shared vertex', () => {
  let listener;
  const region = { id: 'ward', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }] };
  const wall = { metadata: { kind: 'wall', item: { id: 'wall' } } };
  const handle = { metadata: { kind: 'spline-handle', type: 'region-point', id: 'ward', index: 1, item: region } };
  const state = { activeTool: 'region', regionMode: 'refine', selectedRegionId: 'ward',
    setSelectedRegionId: jest.fn(), setSelectedRegionPointIndex: jest.fn(),
    setSelected: jest.fn() };
  const scene = { pointerX: 0, pointerY: 0,
    getEngine: () => ({ getRenderingCanvas: () => document.createElement('canvas') }),
    onPointerObservable: { add: callback => { listener = callback; return callback; }, remove: jest.fn() },
    pick: (_x, _y, predicate) => predicate(handle)
      ? { hit: true, pickedMesh: handle, pickedPoint: { x: 2, y: 0, z: 0 } }
      : { hit: false } };
  const dispose = createSettlementBabylonWorkflow(() => state).attach(scene);
  listener({ type: PointerEventTypes.POINTERDOWN, event: { button: 0 },
    pickInfo: { hit: true, pickedMesh: wall, pickedPoint: { x: 2, y: 0, z: 0 } } });
  expect(state.setSelectedRegionPointIndex).toHaveBeenCalledWith(1);
  expect(state.setSelected).not.toHaveBeenCalled();
  dispose();
});

test('right-clicking a region point opens its spline edit menu through a wall', () => {
  let listener;
  const region = { id: 'ward', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }] };
  const wall = { metadata: { kind: 'wall', item: { id: 'wall' } } };
  const handle = { metadata: { kind: 'spline-handle', type: 'region-point', id: 'ward', index: 0, item: region } };
  const state = { activeTool: 'region', regionMode: 'refine', selectedRegionId: 'ward',
    setSelectedRegionId: jest.fn(), setSelectedRegionPointIndex: jest.fn(),
    openSplineContextMenu: jest.fn() };
  const scene = { pointerX: 0, pointerY: 0,
    getEngine: () => ({ getRenderingCanvas: () => document.createElement('canvas') }),
    onPointerObservable: { add: callback => { listener = callback; return callback; }, remove: jest.fn() },
    pick: (_x, _y, predicate) => predicate(handle)
      ? { hit: true, pickedMesh: handle, pickedPoint: { x: 0, y: 0, z: 0 } }
      : { hit: false } };
  const dispose = createSettlementBabylonWorkflow(() => state).attach(scene);
  listener({ type: PointerEventTypes.POINTERDOWN,
    event: { button: 2, clientX: 20, clientY: 30, preventDefault: jest.fn() },
    pickInfo: { hit: true, pickedMesh: wall, pickedPoint: { x: 0, y: 0, z: 0 } } });
  expect(state.openSplineContextMenu).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'region', id: 'ward', index: 0, pointCount: 3, clientX: 20, clientY: 30
  }));
  dispose();
});

test.each([true, false])('region refinement survives a delayed update after pointer-up (snap=%s)', regionSnapEnabled => {
  let listener;
  const updates = [];
  const region = { id: 'ward', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }] };
  const terrain = { name: 'terrain', metadata: { kind: 'terrain' }, isEnabled: () => true };
  const state = { activeTool: 'region', regionMode: 'refine', regionSnapEnabled, roadSnapToleranceFeet: 10,
    roads: [{ points: [{ x: 100, y: 100 }] }], fortifications: [], setRegions: updater => updates.push(updater) };
  const scene = { getEngine: () => ({ getRenderingCanvas: () => document.createElement('canvas') }),
    onPointerObservable: { add: callback => { listener = callback; return callback; }, remove: jest.fn() },
    pick: (_x, _y, predicate) => predicate(terrain) ? { hit: true, pickedMesh: terrain, pickedPoint: { x: 1.96, y: 0, z: 1.94 } } : { hit: false } };
  const workflow = createSettlementBabylonWorkflow(() => state);
  const dispose = workflow.attach(scene);
  workflow.beginPointDrag('region-point', 'ward', 1);
  listener({ type: PointerEventTypes.POINTERMOVE, event: { buttons: 1 }, pickInfo: { pickedMesh: terrain, pickedPoint: { x: 1.96, y: 0, z: 1.94 } } });
  workflow.endPointer();
  expect(updates).toHaveLength(1);
  const result = updates[0]([region]);
  expect(result[0].points[1]).toEqual(regionSnapEnabled ? { x: 100, y: 100 } : { x: 98, y: 97 });
  expect(result[0].points[0]).toEqual(region.points[0]);
  dispose();
});

test('drawing a road through an existing road adds a snapped point instead of selecting it', () => {
  let listener, draft = [];
  const canvas = document.createElement('canvas');
  const terrain = { name: 'terrain', metadata: { kind: 'terrain' }, isEnabled: () => true };
  const road = { id: 'existing', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  const state = { activeTool: 'road', roadMode: 'draw-new', roads: [road], roadSnapEnabled: true,
    roadSnapToleranceFeet: 10, roadWidth: 30, setRoadDraft: updater => { draft = updater(draft); },
    setSelected: jest.fn(), setSelectedRoadId: jest.fn(), setSplineHoverPoint: jest.fn() };
  const scene = { getEngine: () => ({ getRenderingCanvas: () => canvas }),
    onPointerObservable: { add: callback => { listener = callback; return callback; }, remove: jest.fn() },
    pick: (_x, _y, predicate) => predicate(terrain) ? { hit: true, pickedMesh: terrain,
      pickedPoint: { x: 1, y: 0, z: 0.05 } } : { hit: false } };
  const dispose = createSettlementBabylonWorkflow(() => state).attach(scene);
  const pickInfo = { pickedMesh: { metadata: { kind: 'road', item: road } }, pickedPoint: { x: 1, y: 0, z: 0.05 } };
  listener({ type: PointerEventTypes.POINTERDOWN, event: { button: 0 }, pickInfo });
  expect(draft[0]).toMatchObject({ x: 50, y: 0, width_feet: 30 });
  expect(state.setSelectedRoadId).not.toHaveBeenCalled();
  listener({ type: PointerEventTypes.POINTERMOVE, event: { buttons: 0 }, pickInfo });
  expect(state.setSplineHoverPoint).toHaveBeenCalled();
  dispose();
});

test('tracing a city wall uses the clicked wall rather than terrain behind its raised mesh', () => {
  let listener, draft = [];
  const canvas = document.createElement('canvas');
  const terrain = { name: 'terrain', metadata: { kind: 'terrain' } };
  const wall = { id: 'city-wall', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  const state = { activeTool: 'region', regionMode: 'trace', roads: [], fortifications: [wall],
    roadSnapToleranceFeet: 8, setRegionDraft: updater => { draft = updater(draft); },
    setSelected: jest.fn(), setSelectedFortificationId: jest.fn() };
  const scene = { getEngine: () => ({ getRenderingCanvas: () => canvas }),
    onPointerObservable: { add: callback => { listener = callback; return callback; }, remove: jest.fn() },
    pick: (_x, _y, predicate) => predicate(terrain) ? { hit: true, pickedMesh: terrain,
      pickedPoint: { x: 1, y: 0, z: 10 } } : { hit: false } };
  const dispose = createSettlementBabylonWorkflow(() => state).attach(scene);
  listener({ type: PointerEventTypes.POINTERDOWN, event: { button: 0 }, pickInfo: {
    pickedMesh: { metadata: { kind: 'wall', item: wall } }, pickedPoint: { x: 1, y: 0.7, z: 0.2 } } });
  expect(draft[0]).toMatchObject({ x: 50, y: 0, outgoing: { kind: 'wall', id: 'city-wall' } });
  expect(state.setSelectedFortificationId).not.toHaveBeenCalled();
  dispose();
});

test('whole-road drag updater remains valid after pointer-up clears the interaction', () => {
  let listener;
  const road = {
    id: 'road-1',
    points: [{ x: 0, y: 0 }, { x: 10, y: 10 }]
  };
  const queuedRoadUpdates = [];
  const canvas = document.createElement('canvas');
  canvas.setPointerCapture = jest.fn();
  const terrainMesh = {
    name: 'terrain',
    metadata: { kind: 'terrain' },
    isEnabled: () => true
  };
  const roadMesh = {
    isPickable: true,
    isEnabled: () => true,
    metadata: { kind: 'road', item: road }
  };
  const state = {
    activeTool: 'road',
    roadMode: 'move-spline',
    roads: [road],
    roadSnapEnabled: false,
    setRoads: updater => queuedRoadUpdates.push(updater),
    setSelectedRoadId: jest.fn(),
    setSelectedRoadPointIndex: jest.fn(),
    setSelected: jest.fn(),
    recordSplineUndo: jest.fn()
  };
  const scene = {
    pointerX: 0,
    pointerY: 0,
    getEngine: () => ({ getRenderingCanvas: () => canvas }),
    onPointerObservable: {
      add: callback => { listener = callback; return callback; },
      remove: jest.fn()
    },
    pick: (_x, _y, predicate) => predicate(terrainMesh)
      ? { hit: true, pickedMesh: terrainMesh, pickedPoint: { x: 2, y: 0, z: 3 } }
      : { hit: false }
  };
  const dispose = createSettlementBabylonWorkflow(() => state).attach(scene);

  listener({
    type: PointerEventTypes.POINTERDOWN,
    event: { button: 0, pointerId: 1 },
    pickInfo: { pickedMesh: roadMesh, pickedPoint: { x: 0, y: 0, z: 0 } }
  });
  listener({
    type: PointerEventTypes.POINTERMOVE,
    event: { buttons: 1 },
    pickInfo: { pickedMesh: roadMesh, pickedPoint: { x: 0, y: 0, z: 0 } }
  });
  listener({ type: PointerEventTypes.POINTERUP, event: {} });

  expect(queuedRoadUpdates).toHaveLength(1);
  expect(() => queuedRoadUpdates[0]([road])).not.toThrow();
  expect(queuedRoadUpdates[0]([road])[0].points).not.toEqual(road.points);

  dispose();
});

test('selected structure can be moved and its updater survives pointer-up', () => {
  let listener;
  const building = { id: 'building-1', x: 0, y: 0, width_feet: 20, depth_feet: 20 };
  const queuedBuildingUpdates = [];
  const canvas = document.createElement('canvas');
  canvas.setPointerCapture = jest.fn();
  const terrainMesh = {
    name: 'terrain',
    metadata: { kind: 'terrain' },
    isEnabled: () => true
  };
  const buildingMesh = {
    name: 'building-mesh',
    isPickable: true,
    isEnabled: () => true,
    metadata: { kind: 'building', item: building }
  };
  const state = {
    activeTool: 'build',
    buildMode: 'move-selected',
    selected: building,
    buildings: [building],
    roads: [],
    setBuildings: updater => queuedBuildingUpdates.push(updater),
    setSelected: jest.fn()
  };
  const scene = {
    pointerX: 0,
    pointerY: 0,
    getEngine: () => ({ getRenderingCanvas: () => canvas }),
    onPointerObservable: {
      add: callback => { listener = callback; return callback; },
      remove: jest.fn()
    },
    pick: (_x, _y, predicate) => predicate(terrainMesh)
      ? { hit: true, pickedMesh: terrainMesh, pickedPoint: { x: 2, y: 0, z: 3 } }
      : { hit: false }
  };
  const dispose = createSettlementBabylonWorkflow(() => state).attach(scene);

  listener({
    type: PointerEventTypes.POINTERDOWN,
    event: { button: 0, pointerId: 1 },
    pickInfo: { pickedMesh: buildingMesh, pickedPoint: { x: 0, y: 0, z: 0 } }
  });
  listener({
    type: PointerEventTypes.POINTERMOVE,
    event: { buttons: 1 },
    pickInfo: { pickedMesh: buildingMesh, pickedPoint: { x: 0, y: 0, z: 0 } }
  });
  listener({ type: PointerEventTypes.POINTERUP, event: {} });

  expect(queuedBuildingUpdates).toHaveLength(1);
  const movedBuildings = queuedBuildingUpdates[0]([building]);
  expect(movedBuildings[0].x).not.toBe(building.x);
  expect(movedBuildings[0].y).not.toBe(building.y);

  dispose();
});

test('clicking terrain in move mode relocates the selected building without placing a copy', () => {
  let listener;
  const building = { id: 'existing', x: 0, y: 0, asset_key: 'house' };
  const terrain = { metadata: { kind: 'terrain' }, isEnabled: () => true };
  const setBuildings = jest.fn();
  const setSelected = jest.fn();
  const setBuildMode = jest.fn();
  const state = {
    activeTool: 'build', buildMode: 'move-selected', selected: building,
    selectedAssetKey: 'house', buildings: [building], roads: [],
    setBuildings, setSelected, setBuildMode,
  };
  const scene = {
    pointerX: 0, pointerY: 0,
    getEngine: () => ({ getRenderingCanvas: () => document.createElement('canvas') }),
    onPointerObservable: { add: callback => { listener = callback; return callback; }, remove: jest.fn() },
    pick: (_x, _y, predicate) => predicate(terrain)
      ? { hit: true, pickedMesh: terrain, pickedPoint: { x: 2, y: 0, z: 3 } }
      : { hit: false },
  };
  const dispose = createSettlementBabylonWorkflow(() => state).attach(scene);
  listener({ type: PointerEventTypes.POINTERDOWN, event: { button: 0 },
    pickInfo: { pickedMesh: terrain, pickedPoint: { x: 2, y: 0, z: 3 } } });
  expect(setBuildings).toHaveBeenCalledTimes(1);
  const result = setBuildings.mock.calls[0][0]([building]);
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ id: 'existing', x: 100, y: 150 });
  expect(setSelected).toHaveBeenCalledWith(result[0]);
  expect(setBuildMode).toHaveBeenCalledWith('select-placed');
  dispose();
});

test.each(['building', 'building-roof'])('Inspect resolves %s picks to the latest parent building record without dragging it', kind => {
  let listener;
  const oldBuilding = { id: 'house', name: 'Old name' };
  const building = { ...oldBuilding, name: 'Copper Kettle', business_type: 'tavern' };
  const state = {
    activeTool: 'inspect', buildings: [building],
    setSelected: jest.fn(), setInspectSelection: jest.fn(), setBuildings: jest.fn(),
  };
  const mesh = { isPickable: true, isEnabled: () => true, metadata: { kind, item: oldBuilding } };
  const scene = {
    getEngine: () => ({ getRenderingCanvas: () => document.createElement('canvas') }),
    onPointerObservable: { add: callback => { listener = callback; return callback; }, remove: jest.fn() },
  };
  const dispose = createSettlementBabylonWorkflow(() => state).attach(scene);
  listener({ type: PointerEventTypes.POINTERDOWN, event: { button: 0 },
    pickInfo: { pickedMesh: mesh, pickedPoint: { x: 0, y: 0, z: 0 } } });
  expect(state.setSelected).toHaveBeenCalledWith(building);
  expect(state.setInspectSelection).toHaveBeenCalledWith(expect.objectContaining({ entityKind: 'building', id: 'house', item: building }));
  listener({ type: PointerEventTypes.POINTERMOVE, event: { buttons: 1 },
    pickInfo: { pickedMesh: mesh, pickedPoint: { x: 1, y: 0, z: 2 } } });
  expect(state.setBuildings).not.toHaveBeenCalled();
  dispose();
});

test('Inspect keeps point of interest identity separate from building selection', () => {
  let listener;
  const point = { id: 'landmark', name: 'Old Well', point_type: 'well', description: 'A village well.' };
  const state = { activeTool: 'inspect', setSelected: jest.fn(), setInspectSelection: jest.fn() };
  const scene = {
    getEngine: () => ({ getRenderingCanvas: () => document.createElement('canvas') }),
    onPointerObservable: { add: callback => { listener = callback; return callback; }, remove: jest.fn() },
  };
  const dispose = createSettlementBabylonWorkflow(() => state).attach(scene);
  listener({ type: PointerEventTypes.POINTERDOWN, event: { button: 0 },
    pickInfo: { pickedMesh: { metadata: { kind: 'poi', item: point } }, pickedPoint: { x: 0, y: 0, z: 0 } } });
  expect(state.setSelected).toHaveBeenCalledWith(null);
  expect(state.setInspectSelection).toHaveBeenCalledWith(expect.objectContaining({ entityKind: 'poi', id: 'landmark', item: point }));
  dispose();
});
