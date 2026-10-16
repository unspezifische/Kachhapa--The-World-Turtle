import { findCapableRooms } from './settlementRooms';
import { normalizePropertyCatalog } from './settlementProperties';

const passage = opening => {
  if (['archway', 'open_passage'].includes(opening.opening_kind || opening.kind)) return true;
  if (opening.state === 'locked') return false;
  return opening.state !== 'closed';
};

export function propertyEntrance(property) {
  const boundary = property?.boundary;
  if (!boundary?.segments?.length) return { kind: 'unbounded', id: property?.id };
  const openEdge = boundary.segments.find(segment => segment.treatment === 'none');
  if (openEdge) return { kind: 'open_boundary', id: openEdge.id };
  for (const segment of boundary.segments) {
    const opening = (segment.openings || []).find(passage);
    if (opening) return { kind: 'boundary_portal', id: opening.id, segment_id: segment.id };
  }
  return null;
}

export function structureEntrance(building) {
  const ground = (building.levels || []).find(level => Number(level.elevation_feet) === 0) || building.levels?.[0];
  if (!ground) return { kind: 'asset_entrance', id: building.id };
  const opening = (ground.openings || ground.doors || []).find(item =>
    ['door', 'double_door', 'archway', 'open_passage'].includes(item.kind) &&
    (item.state !== 'locked' && item.state !== 'closed' || ['archway', 'open_passage'].includes(item.kind)));
  return opening ? { kind: 'structure_portal', id: opening.id || `${building.id}-entrance`, floor_id: ground.id } : null;
}

export function verticalConnector(building, targetLevel) {
  const levels = building.levels || [];
  const ground = levels.find(level => Number(level.elevation_feet) === 0) || levels[0];
  if (!ground) return null;
  if (ground.id === targetLevel.id) return [];
  const edges = new Map(levels.map(level => [level.id, []]));
  levels.forEach(level => (level.stairs || []).forEach(stair => {
    const rise = Number(stair.total_rise_feet);
    const explicitId = stair.target_level_id || stair.connects_to_level_id;
    const next = levels.find(candidate => candidate.id === explicitId) ||
      (Number.isFinite(rise) && rise > 0 ? levels.find(candidate =>
        Math.abs((Number(level.elevation_feet) || 0) + rise - (Number(candidate.elevation_feet) || 0)) < 0.5) : null);
    if (!next || next.id === level.id) return;
    edges.get(level.id).push({ kind: 'stairs', id: stair.id, from_floor_id: level.id, to_floor_id: next.id });
    edges.get(next.id).push({ kind: 'stairs', id: stair.id, from_floor_id: next.id, to_floor_id: level.id });
  }));
  const queue = [{ id: ground.id, path: [] }];
  const seen = new Set([ground.id]);
  for (const current of queue) {
    for (const edge of edges.get(current.id) || []) {
      if (seen.has(edge.to_floor_id)) continue;
      const path = [...current.path, edge];
      if (edge.to_floor_id === targetLevel.id) return path;
      seen.add(edge.to_floor_id);
      queue.push({ id: edge.to_floor_id, path });
    }
  }
  return null;
}

export function resolveCapabilityRoute({ buildings = [], properties = [], capability, actor = {} }) {
  const catalog = normalizePropertyCatalog(buildings, properties);
  const candidates = findCapableRooms(buildings, capability, actor);
  for (const candidate of candidates) {
    const property = catalog.find(item => (item.structure_ids || []).some(id => String(id) === String(candidate.building.id)));
    const gate = propertyEntrance(property);
    if (!gate) continue;
    const entrance = structureEntrance(candidate.building);
    if (!entrance) continue;
    const vertical = verticalConnector(candidate.building, candidate.level);
    if (!vertical) continue;
    return {
      status: 'route_request',
      destination: { ...candidate.destination, property_id: property?.id || null },
      steps: [gate, { kind: 'cross_property', id: property?.id }, entrance,
        ...vertical, { kind: 'room', id: candidate.room.id }],
    };
  }
  return { status: 'no_route', reason: candidates.length ? 'No accessible entrance or vertical connector' : 'No permitted room with available capacity' };
}
