import { applyRegionalRoadClassDefaults, regionalRoadSurfaceForSegment } from './regionRoadMaterials';

const square = (id, minX, minY, maxX, maxY, roadMaterial) => ({
  id,
  points: [{ x: minX, y: minY }, { x: maxX, y: minY },
    { x: maxX, y: maxY }, { x: minX, y: maxY }],
  road_material_defaults: roadMaterial
});

test('a region overrides the class material for new road segments inside it', () => {
  const points = [{ x: -100, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }];
  const regions = [square('poor-ward', 0, -50, 100, 50, { street: 'dirt' })];
  expect(regionalRoadSurfaceForSegment(points, 0, 'street', regions, 'cobblestone')).toBe('cobblestone');
  expect(regionalRoadSurfaceForSegment(points, 1, 'street', regions, 'cobblestone')).toBe('dirt');
  expect(regionalRoadSurfaceForSegment(points, 1, 'avenue', regions, 'cobblestone')).toBe('cobblestone');
});

test('the smallest matching ward wins over a larger biome', () => {
  const points = [{ x: 10, y: 10 }, { x: 20, y: 20 }];
  const regions = [square('biome', -100, -100, 100, 100, { street: 'stone' }),
    square('ward', 0, 0, 30, 30, { street: 'dirt' })];
  expect(regionalRoadSurfaceForSegment(points, 0, 'street', regions, 'cobblestone')).toBe('dirt');
});

test('Apply Class Defaults refreshes every segment using its region while preserving other metadata', () => {
  const road = { id: 'trade', road_class: 'street', width_feet: 20, surface_type: 'brick',
    points: [{ x: -100, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }],
    segments: [{ surface_type: 'brick', width_feet: 12, label: 'west' },
      { surface_type: 'stone', width_feet: 44, label: 'east' }] };
  const updated = applyRegionalRoadClassDefaults(road, { width: 30, surface: 'cobblestone' },
    [square('poor-ward', 0, -50, 100, 50, { street: 'dirt' })]);
  expect(updated.segments).toEqual([
    { surface_type: 'cobblestone', width_feet: 30, label: 'west' },
    { surface_type: 'dirt', width_feet: 30, label: 'east' }
  ]);
  expect(road.segments[1].surface_type).toBe('stone');
});
