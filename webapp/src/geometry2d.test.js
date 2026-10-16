import { closestPointOnSegment2d } from './geometry2d';

test('closestPointOnSegment2d clamps projections and handles zero-length segments', () => {
  expect(closestPointOnSegment2d(
    { x: 40, y: 30 },
    { x: 0, y: 0 },
    { x: 100, y: 0 }
  )).toEqual({ point: { x: 40, y: 0 }, t: 0.4, distance: 30 });

  expect(closestPointOnSegment2d(
    { x: 15, y: 20 },
    { x: 10, y: 20 },
    { x: 10, y: 20 }
  )).toEqual({ point: { x: 10, y: 20 }, t: 0, distance: 5 });
});
