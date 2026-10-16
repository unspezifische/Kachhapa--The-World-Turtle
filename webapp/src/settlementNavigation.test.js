import { resolveCapabilityRoute } from './settlementNavigation';

const room = { id: 'bedroom', name: 'Bedroom', activity_capabilities: ['rest', 'sleep'], access_policy: 'residents', occupancy_limit: 1, current_occupancy: 0,
  region: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }] };
const building = { id: 'house', x: 10, y: 20, elevation: 6, levels: [
  { id: 'ground', elevation_feet: 0, openings: [{ id: 'front-door', kind: 'door', state: 'open' }], stairs: [{ id: 'stairs', target_level_id: 'upper' }] },
  { id: 'upper', elevation_feet: 10, rooms: [room] },
] };
const property = { id: 'estate', structure_ids: ['house'], boundary: { segments: [
  { id: 'north', treatment: 'wall', openings: [{ id: 'gate', opening_kind: 'gate', state: 'locked' }, { id: 'arch', opening_kind: 'archway' }] },
] } };

test('rest route traverses open estate portal, courtyard, door and stairs', () => {
  const route = resolveCapabilityRoute({ buildings: [building], properties: [property], capability: 'rest', actor: { resident: true } });
  expect(route.status).toBe('route_request');
  expect(route.steps.map(step => step.kind)).toEqual(['boundary_portal', 'cross_property', 'structure_portal', 'stairs', 'room']);
  expect(route.steps[0].id).toBe('arch');
  expect(route.destination.id).toBe('bedroom');
  expect(route.destination.property_id).toBe('estate');
});

test('locked gate, private access and full capacity each prevent invalid destination', () => {
  const locked = { ...property, boundary: { segments: [{ id: 'north', treatment: 'wall', openings: [{ id: 'gate', opening_kind: 'gate', state: 'locked' }] }] } };
  expect(resolveCapabilityRoute({ buildings: [building], properties: [locked], capability: 'rest', actor: { resident: true } }).status).toBe('no_route');
  expect(resolveCapabilityRoute({ buildings: [building], properties: [property], capability: 'rest', actor: {} }).status).toBe('no_route');
  const occupied = { ...building, levels: [building.levels[0], { ...building.levels[1], rooms: [{ ...room, current_occupancy: 1 }] }] };
  expect(resolveCapabilityRoute({ buildings: [occupied], properties: [property], capability: 'rest', actor: { resident: true } }).status).toBe('no_route');
});

test('vertical route uses the existing blueprint stair rise', () => {
  const actualStairs = { ...building, levels: [
    { ...building.levels[0], stairs: [{ id: 'drawn-stair', total_rise_feet: 10 }] },
    building.levels[1],
  ] };
  const route = resolveCapabilityRoute({ buildings: [actualStairs], properties: [property], capability: 'rest', actor: { resident: true } });
  expect(route.steps.find(step => step.kind === 'stairs')).toMatchObject({ id: 'drawn-stair', from_floor_id: 'ground', to_floor_id: 'upper' });
  const wrongRise = { ...actualStairs, levels: [{ ...actualStairs.levels[0], stairs: [{ id: 'short-stair', total_rise_feet: 4 }] }, actualStairs.levels[1]] };
  expect(resolveCapabilityRoute({ buildings: [wrongRise], properties: [property], capability: 'rest', actor: { resident: true } }).status).toBe('no_route');
});

test('third-floor destination needs both stair flights', () => {
  const top = { ...building, levels: [
    { ...building.levels[0], stairs: [{ id: 'first-flight', total_rise_feet: 10 }] },
    { id: 'middle', elevation_feet: 10, stairs: [{ id: 'second-flight', total_rise_feet: 10 }] },
    { ...building.levels[1], id: 'top', elevation_feet: 20 },
  ] };
  const route = resolveCapabilityRoute({ buildings: [top], properties: [property], capability: 'rest', actor: { resident: true } });
  expect(route.steps.filter(step => step.kind === 'stairs').map(step => step.id)).toEqual(['first-flight', 'second-flight']);
});
