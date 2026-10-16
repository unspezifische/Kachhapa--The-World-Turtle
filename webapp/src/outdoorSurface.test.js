import { drapedOutdoorTriangles, visibleOutdoorAreas } from './outdoorSurface';

test('higher priority surface masks overlap and preserves lower area outside it', () => {
  const square = (id, x, priority) => ({ id, layering_priority: priority, polygon: [
    { x, y: 0 }, { x: x + 10, y: 0 }, { x: x + 10, y: 10 }, { x, y: 10 },
  ] });
  const visible = visibleOutdoorAreas([square('garden', 0, 0), square('walkway', 5, 2)]);
  expect(visible.map(item => item.area.id)).toEqual(['walkway', 'garden']);
  const gardenCorners = visible[1].polygons[0][0];
  expect(Math.max(...gardenCorners.map(point => point[0]))).toBe(5);
  expect(Math.min(...gardenCorners.map(point => point[0]))).toBe(0);
});

test('later area wins a priority tie and creates a hole in a surrounding area', () => {
  const outer = { id: 'yard', polygon: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] };
  const inner = { id: 'pond', polygon: [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }] };
  const visible = visibleOutdoorAreas([outer, inner]);
  expect(visible[0].area.id).toBe('pond');
  expect(visible[1].polygons[0]).toHaveLength(2);
});

test('large draped area samples terrain inside its polygon', () => {
  const points = [[0, 0], [60, 0], [0, 60]];
  const sample = jest.fn((x, y) => x > 0 && y > 0 ? 10 : 0);
  const mesh = drapedOutdoorTriangles(points, [0, 1, 2], sample, { elevation_mode: 'draped_on_terrain' });
  expect(mesh.indices.length).toBeGreaterThan(3);
  expect(mesh.positions.some((coordinate, index) => index % 3 === 1 && coordinate === 10)).toBe(true);
  expect(sample).toHaveBeenCalledWith(10, 10);
});
