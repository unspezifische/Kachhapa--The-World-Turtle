import {
  addStructureToProperty, createProperty, normalizePropertyCatalog,
  propertyForBuilding, removeStructureFromProperties, structurePointToWorld,
  structureWorldElevation,
  deletePropertyKeepingBuildings,
} from './settlementProperties';

test('legacy building keeps its identity and gets a detached parcel boundary', () => {
  const building = { id: 'old-house', name: 'House', x: 10, y: 20, width_feet: 20, depth_feet: 10 };
  const [property] = normalizePropertyCatalog([building]);
  expect(property.id).toBe('property-for-old-house');
  expect(property.structure_ids).toEqual(['old-house']);
  expect(property.boundary.vertices[0]).toEqual({ x: 0, y: 15 });
  const edited = { ...property, boundary: { ...property.boundary, vertices: [{ x: 99, y: 99 }] } };
  expect(building).toEqual({ id: 'old-house', name: 'House', x: 10, y: 20, width_feet: 20, depth_feet: 10 });
  expect(normalizePropertyCatalog([building], [edited])[0].boundary.vertices[0]).toEqual({ x: 99, y: 99 });
});

test('one property owns two independent existing structure records', () => {
  const first = { id: 'a', x: 0, y: 0, elevation: 6 };
  const second = { id: 'b', x: 30, y: 0, elevation: -3 };
  const property = createProperty('Estate');
  const joined = addStructureToProperty(addStructureToProperty([property], property.id, 'a'), property.id, 'b');
  expect(normalizePropertyCatalog([first, second], JSON.parse(JSON.stringify(joined)))[0].structure_ids).toEqual(['a', 'b']);
  expect(structureWorldElevation(first, 100, 10)).toBe(116);
  expect(structureWorldElevation(second, 100, 10)).toBe(107);
  expect(structureWorldElevation({ ...second, elevation_mode: 'fixed_world' }, 100, 10)).toBe(7);
  expect(structurePointToWorld({ x: 10, y: 20, rotation: Math.PI / 2 }, { x: 2, y: 0 }).x).toBeCloseTo(10);
  expect(removeStructureFromProperties(joined, 'a')[0].primary_structure_id).toBe('b');
});

test('unclaimed buildings retain stable wrappers while empty parcels survive', () => {
  const empty = createProperty('Garden');
  const result = normalizePropertyCatalog([{ id: 'unclaimed' }], [empty]);
  expect(result.map(property => property.id)).toEqual([empty.id, propertyForBuilding({ id: 'unclaimed' }).id]);
});

test('normalization preserves dangling and conflicting links for explicit validation', () => {
  const saved = [
    { id: 'one', structure_ids: ['house', 'missing'] },
    { id: 'two', structure_ids: ['house'] },
  ];
  expect(normalizePropertyCatalog([{ id: 'house' }], saved).map(property => property.structure_ids))
    .toEqual([['house', 'missing'], ['house']]);
});

test('property deletion removes its parcel while keeping building identity and geometry', () => {
  const building = { id: 'tower', name: 'Kolat Towers', x: 10, y: 20, levels: [{ id: 'ground', rooms: [{ id: 'study' }] }] };
  const original = JSON.stringify(building);
  const property = { ...propertyForBuilding(building), outdoor_areas: [{ id: 'garden' }] };
  const remaining = deletePropertyKeepingBuildings([property], property.id, [building]);
  expect(remaining).toHaveLength(1);
  expect(remaining[0].id).not.toBe(property.id);
  expect(remaining[0].structure_ids).toEqual(['tower']);
  expect(remaining[0].outdoor_areas).toEqual([]);
  expect(JSON.stringify(building)).toBe(original);
});
