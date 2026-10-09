import { PointerEventTypes } from '@babylonjs/core';
import { createSettlementBabylonWorkflow } from './settlementBabylonWorkflow';

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