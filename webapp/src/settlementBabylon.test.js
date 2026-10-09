import {
  clipSegmentToBounds,
  featureIntersectsBounds,
  oceanVertexData,
  polylinePartsInBounds,
  settlementCameraPanSpeed,
} from './settlementBabylon';

const bounds = { minX: 0, minY: 0, width: 100, height: 100, maxX: 100, maxY: 100 };

test('camera pan speed scales down close in and preserves the larger-scale rate', () => {
  expect(settlementCameraPanSpeed(1)).toBeCloseTo(1.8);
  expect(settlementCameraPanSpeed(20)).toBe(36);
});

test('ocean geometry emits no surface over terrain at or above sea level', () => {
  const data = oceanVertexData(bounds, [], null, 0, () => 0);
  expect(data.hasWater).toBe(false);
  expect(data.indices).toHaveLength(0);
});

test('ocean geometry keeps submerged cells without covering all dry terrain', () => {
  const data = oceanVertexData(bounds, [], null, 0, (x) => x < 40 ? -5 : 10);
  expect(data.hasWater).toBe(true);
  expect(data.indices.length).toBeGreaterThan(0);
  expect(data.indices.length).toBeLessThan(96 * 96 * 6);
});

describe('streamed feature bounds', () => {
  test('clips a crossing segment to the visible terrain bounds', () => {
    expect(clipSegmentToBounds(
      { x: -20, y: 50 },
      { x: 120, y: 50 },
      bounds,
    )).toEqual([{ x: 0, y: 50 }, { x: 100, y: 50 }]);
  });

  test('omits polyline pieces that do not cross streamed terrain', () => {
    expect(polylinePartsInBounds([
      { x: -20, y: -20 },
      { x: -10, y: -10 },
    ], bounds)).toEqual([]);
  });

  test('keeps connected visible road segments as one part', () => {
    expect(polylinePartsInBounds([
      { x: -10, y: 25 },
      { x: 50, y: 50 },
      { x: 110, y: 75 },
    ], bounds)).toHaveLength(1);
  });

  test('includes buildings whose footprint overlaps the terrain window', () => {
    expect(featureIntersectsBounds({ x: 110, y: 50, width_feet: 30, depth_feet: 20 }, bounds)).toBe(true);
    expect(featureIntersectsBounds({ x: 130, y: 50, width_feet: 20, depth_feet: 20 }, bounds)).toBe(false);
  });
});
