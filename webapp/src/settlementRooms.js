import { pointInPolygon } from './buildingBlueprint';
import { buildWallTopology } from './wallTopology';
import { structurePointToWorld, structureWorldElevation } from './settlementProperties';

export const ROOM_PURPOSES = {
  Bedroom: ['sleep', 'rest', 'change_clothes'],
  Dormitory: ['sleep', 'rest'],
  Kitchen: ['prepare_food', 'eat', 'clean'],
  'Dining Room': ['eat', 'socialize'],
  'Common Room': ['rest', 'socialize'],
  'Study / Office': ['study', 'work'],
  Library: ['study', 'read', 'rest'],
  Workshop: ['work'],
  'Store Room': ['store_items'],
  'Bath / Washroom': ['wash'],
  Guardroom: ['guard', 'rest'],
  'Hall / Corridor': ['pass_through'],
  Stairwell: ['pass_through'],
  Stable: ['tend_animals'],
  Shop: ['trade'],
  Shrine: ['worship'],
  Cellar: ['store_items'],
  Other: [],
};

const BUSINESS_PRIVATE_ROOM_PURPOSES = new Set([
  'Kitchen',
  'Study / Office',
  'Workshop',
  'Store Room',
  'Cellar',
  'Stable',
]);

export function defaultRoomAccessPolicy(purpose = 'Other', building = {}) {
  if (['Bedroom', 'Dormitory'].includes(purpose)) return 'residents';
  if (purpose === 'Guardroom') return 'staff';
  const isBusiness = Boolean(building.business_type || building.business_id || building.business?.id);
  if (BUSINESS_PRIVATE_ROOM_PURPOSES.has(purpose)) return isBusiness ? 'staff' : 'residents';
  return 'public';
}

export function defaultsForRoomPurpose(room, purpose, building = {}) {
  const previousDefault = defaultRoomAccessPolicy(room?.purpose, building);
  const accessWasCustomized = Boolean(room?.access_policy) && room.access_policy !== previousDefault;
  return {
    purpose,
    activity_capabilities: [...(ROOM_PURPOSES[purpose] || [])],
    access_policy: accessWasCustomized
      ? room.access_policy
      : defaultRoomAccessPolicy(purpose, building),
  };
}

export function roomBoundaryFromWalls(walls = [], wallIds = [], tolerance = 0.1) {
  if (!wallIds.length) return { region: null, error: 'Select the walls enclosing a room.' };
  if (wallIds.some(id => !walls.some(wall => String(wall.id) === String(id)))) return { region: null, error: 'One or more selected boundary walls are missing.' };
  const { faces } = buildWallTopology(walls, tolerance);
  const complete = faces.filter(face => wallIds.every(id => face.wallIds.some(wallId => String(wallId) === String(id))) &&
    face.edgeWallIds.every(ids => ids.some(id => wallIds.some(selected => String(selected) === String(id)))));
  if (!complete.length) return { region: null, error: 'Selected walls must connect to form one closed room.' };
  if (complete.length > 1) return { region: null, error: 'Selected walls enclose more than one room. Remove walls until one room remains.' };
  return { region: complete[0].region, error: null };
}

export function createRoom(building, level, region, purpose = 'Other') {
  const points = region.map(point => ({ x: Number(point.x), y: Number(point.y) }));
  return {
    id: `room-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    structure_id: building.id,
    floor_id: level.id,
    name: purpose === 'Other' ? 'New Room' : purpose,
    purpose,
    activity_capabilities: [...(ROOM_PURPOSES[purpose] || [])],
    access_policy: defaultRoomAccessPolicy(purpose, building),
    occupancy_limit: null,
    floor_material: null,
    region: points,
    boundary_source: 'manual',
    boundary_locked: true,
    linked_portal_ids: [],
  };
}

export function roomInteriorPoint(region) {
  if (!Array.isArray(region) || region.length < 3) return null;
  const centroid = region.reduce((sum, point) => ({ x: sum.x + point.x / region.length, y: sum.y + point.y / region.length }), { x: 0, y: 0 });
  if (pointInPolygon(centroid, region)) return centroid;
  // Concave polygon centroids may lie outside. Try triangles along each edge.
  for (let index = 0; index < region.length; index += 1) {
    const next = region[(index + 1) % region.length];
    const candidate = { x: (centroid.x + region[index].x + next.x) / 3, y: (centroid.y + region[index].y + next.y) / 3 };
    if (pointInPolygon(candidate, region)) return candidate;
  }
  return null;
}

export function roomDestination(building, level, room, terrainFeet = 0) {
  const point = roomInteriorPoint(room.region);
  if (!point) return null;
  return {
    id: room.id, kind: 'room', property_id: building.property_id || null,
    structure_id: building.id, floor_id: level.id,
    point: structurePointToWorld(building, point),
    elevation_feet: structureWorldElevation(building, terrainFeet, level.elevation_feet),
    capabilities: room.activity_capabilities || [],
  };
}

export function findCapableRooms(buildings, capability, actor = {}) {
  const allowed = policy => policy === 'public' ||
    (policy === 'residents' && actor.resident) ||
    (policy === 'staff' && actor.staff) ||
    (policy === 'restricted' && actor.authorized) ||
    (policy === 'custom' && actor.authorized);
  return (buildings || []).flatMap(building => (building.levels || []).flatMap(level =>
    (level.rooms || []).filter(room =>
      (room.activity_capabilities || []).includes(capability) &&
      allowed(room.access_policy || 'public') &&
      (room.occupancy_limit == null || (room.current_occupancy || 0) < room.occupancy_limit)
    ).map(room => ({ building, level, room, destination: roomDestination(building, level, room) }))
      .filter(candidate => candidate.destination)));
}
