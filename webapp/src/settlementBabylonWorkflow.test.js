import { PointerEventTypes } from '@babylonjs/core';
import { createSettlementBabylonWorkflow } from './settlementBabylonWorkflow';

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
