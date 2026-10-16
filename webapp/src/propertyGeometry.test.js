import { createBoundary, boundarySegmentLength, validateBoundaryOpening, solidBoundaryIntervals, createOutdoorArea } from './propertyGeometry';

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

test('outdoor area is independently typed and pond is not walkable', () => {
  const polygon = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
  const pond = createOutdoorArea('estate', polygon, 'pond');
  expect(pond.walkable).toBe(false);
  expect(pond.polygon).toEqual(polygon);
  polygon[0].x = 900;
  expect(pond.polygon[0].x).toBe(0);
});
