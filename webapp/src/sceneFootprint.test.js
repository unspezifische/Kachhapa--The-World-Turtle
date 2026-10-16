import { drawSceneFootprint, sceneFootprintPreview } from './sceneFootprint';
import { createBlueprintBuilding, closeBlueprintFootprint } from './settlementEditor';
import { openCorners } from './buildingBlueprint';

test('circle uses terrain world clicks and saves four real arcs under the original building ID', () => {
  const building = createBlueprintBuilding({ x: 100, y: 200 });
  const result = drawSceneFootprint(building, 'circle', [{ x: 0, y: 0 }], { x: 110, y: 200 });
  expect(result.building.id).toBe(building.id);
  expect(result.building.levels[0].outline).toHaveLength(4);
  expect(result.building.levels[0].outline.every(edge => edge.type === 'arc')).toBe(true);
  expect(openCorners(result.building.levels[0]).length).toBeGreaterThan(40);
  expect(result.building.levels[0].closed).toBe(true);
  expect(building.levels[0].outline).toBeUndefined();
});

test('line and arc combine without a chord replacing the curve, and closing adds only the missing edge', () => {
  const base = createBlueprintBuilding({ x: 100, y: 200 });
  const line = drawSceneFootprint(base, 'line', [], { x: 110, y: 200 }).building;
  const endpoint = drawSceneFootprint(line, 'arc', [], { x: 110, y: 210 });
  const arc = drawSceneFootprint(line, 'arc', endpoint.points, { x: 115, y: 205 }).building;
  expect(arc.width_feet).toBeCloseTo(15, 1);
  const closed = closeBlueprintFootprint(arc);
  expect(closed.levels[0].outline.map(edge => edge.type)).toEqual(['line', 'arc', 'line']);
  expect(closeBlueprintFootprint(closed).levels[0].outline).toHaveLength(3);
  expect(sceneFootprintPreview(arc, 'line', [], null).length).toBeGreaterThan(3);
});

test('invalid radius and straight arc keep pending points for correction', () => {
  const base = createBlueprintBuilding({ x: 0, y: 0 });
  expect(drawSceneFootprint(base, 'circle', [{ x: 0, y: 0 }], { x: 0.1, y: 0 }).error).toMatch(/1 ft/);
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
  const result = drawSceneFootprint(base, 'arc', points, { x: 5, y: 0 });
  expect(result.error).toBeTruthy();
  expect(result.points).toEqual(points);
});
