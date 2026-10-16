import { regionPresentation, snapRegionToNetworkNodes, regionFillOpacity } from './regionPresentation';

test('region fills appear only in Districts view, including when editing regions at night', () => {
  expect(regionFillOpacity('districts')).toBe(.4);
  for (const mode of ['satellite', 'ownership', 'business', undefined]) expect(regionFillOpacity(mode)).toBe(0);
});

test('districts triangulate concave shapes and have stable region-specific colors', () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 100 }, { x: 0, y: 100 }];
  const first = regionPresentation({ id: 'ward-a', points });
  expect(first.indices).toHaveLength(12);
  expect(first.center.x <= 20 || first.center.y <= 20).toBe(true);
  expect(first.color).toBe(regionPresentation({ id: 'ward-a', points: [...points].reverse() }).color);
  expect(first.color).not.toBe(regionPresentation({ id: 'ward-b', points }).color);
  expect(regionPresentation({ points: [null] })).toBeNull();
});

test('refinement snaps to authored road and wall nodes rather than segment middles', () => {
  const roads = [{ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }];
  expect(snapRegionToNetworkNodes({ x: 98, y: 3 }, roads, [], 10)).toEqual({ x: 100, y: 0 });
  expect(snapRegionToNetworkNodes({ x: 50, y: 3 }, roads, [], 10)).toEqual({ x: 50, y: 3 });
  expect(snapRegionToNetworkNodes({ x: 4, y: 7 }, [], [{ points: [{ x: 5, y: 5 }] }], 10)).toEqual({ x: 5, y: 5 });
});
