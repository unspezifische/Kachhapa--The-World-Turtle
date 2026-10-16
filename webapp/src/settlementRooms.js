import { pointInPolygon } from './buildingBlueprint';
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

export function createRoom(building, level, region, purpose = 'Other') {
  const points = region.map(point => ({ x: Number(point.x), y: Number(point.y) }));
  return {
    id: `room-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    structure_id: building.id,
    floor_id: level.id,
    name: purpose === 'Other' ? 'New Room' : purpose,
    purpose,
    activity_capabilities: [...(ROOM_PURPOSES[purpose] || [])],
    access_policy: 'public',
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
