import { createBoundary, boundarySegmentLength, validateBoundaryOpening, solidBoundaryIntervals, createOutdoorArea, moveBoundaryOpening } from './propertyGeometry';

test('hosted double gate cuts a wall without changing parcel edges', () => {
  const boundary = createBoundary([{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 40 }, { x: 0, y: 40 }], 'estate');
  const gate = { id: 'gate', offsetAlongSegment: 20, width: 12, opening_kind: 'gate', panel_style: 'wrought_iron', leaf_configuration: 'double' };
  expect(validateBoundaryOpening(boundary, 0, gate)).toBeNull();
  boundary.segments[0].openings.push(gate);
  expect(solidBoundaryIntervals(boundary, 0)).toEqual([{ start: 0, end: 20 }, { start: 32, end: 60 }]);
  expect(boundarySegmentLength(boundary, 0)).toBe(60);
  expect(boundary.vertices).toHaveLength(4);
  expect(validateBoundaryOpening(boundary, 0, { offsetAlongSegment: 25, width: 5 })).toMatch(/overlaps/);
});

test('a gate can move to another valid boundary segment without changing its identity', () => {
  const boundary = createBoundary([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }], 'estate');
  boundary.segments.forEach(segment => { segment.treatment = 'wall'; });
  boundary.segments[0].openings.push({ id: 'stable-gate', opening_kind: 'gate', offsetAlongSegment: 5, width: 6 });
  const moved = moveBoundaryOpening(boundary, 'stable-gate', { x: 40, y: 18 });
  expect(moved.error).toBeNull();
  expect(moved.segmentIndex).toBe(1);
  expect(moved.boundary.segments[0].openings).toHaveLength(0);
  expect(moved.boundary.segments[1].openings[0]).toMatchObject({ id: 'stable-gate', offsetAlongSegment: 15 });
});

test('a gate move rejects untreated segments and overlapping openings', () => {
  const boundary = createBoundary([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 0, y: 20 }], 'estate');
  boundary.segments[0] = { ...boundary.segments[0], treatment: 'wall', openings: [
    { id: 'moving', offsetAlongSegment: 2, width: 6 },
    { id: 'fixed', offsetAlongSegment: 15, width: 8 },
  ] };
  expect(moveBoundaryOpening(boundary, 'moving', { x: 20, y: 0 }).error).toMatch(/overlaps/);
  expect(moveBoundaryOpening(boundary, 'moving', { x: 30, y: 10 }).segmentIndex).toBe(0);
});

test('outdoor area is independently typed and pond is not walkable', () => {
  const polygon = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
  const pond = createOutdoorArea('estate', polygon, 'pond');
  expect(pond.walkable).toBe(false);
  expect(pond.polygon).toEqual(polygon);
  polygon[0].x = 900;
  expect(pond.polygon[0].x).toBe(0);
});
