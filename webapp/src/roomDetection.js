import polygonClipping from 'polygon-clipping';
import { pointInPolygon, openCorners } from './buildingBlueprint';
import { createRoom, roomBoundaryFromWalls, roomInteriorPoint } from './settlementRooms';

import { buildWallTopology, isSimpleRoomPolygon } from './wallTopology';

const area = points => points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0) / 2;
const closeRing = ring => [...ring.map(p => [p.x, p.y]), [ring[0].x, ring[0].y]];

function overlap(left, right) {
  try {
    const result = polygonClipping.intersection([[closeRing(left)]], [[closeRing(right)]]);
    return result.flatMap(polygon => polygon.map(ring => Math.abs(area(ring.slice(0, -1).map(([x, y]) => ({ x, y })))))).reduce((sum, value) => sum + value, 0);
  } catch { return 0; }
}

export function detectRooms(building, level) {
  const outline = level.outline || [];
  if (!outline.length) return { candidates: [], warnings: ['A closed exterior outline is required.'] };
  const walls = [...outline, ...(level.walls || [])].filter(wall => wall?.start && wall?.end);
  const topology = buildWallTopology(walls);
  const footprint = openCorners(level);
  const voids = (level.floor_voids || []).filter(item => item.kind === 'open_to_sky');
  if (voids.length) return {
    candidates: [],
    warnings: ['Automatic room detection around open-to-sky courtyards is not supported yet. Draw rooms manually; existing rooms remain unchanged.'],
  };
  const candidates = topology.faces.map(face => face.region).filter(region => {
    const center = roomInteriorPoint(region);
    return center && pointInPolygon(center, footprint);
  });
  const warnings = [];
  if (!candidates.length) warnings.push('No closed rooms found. Check wall endpoints or draw a room manually.');
  topology.diagnostics.forEach(gap => warnings.push(`Wall ${gap.wallId} ${gap.endpoint} is disconnected (${gap.distance.toFixed(2)} ft gap).`));
  return { candidates, warnings };
}

export function reconcileDetectedRooms(building, level, candidates) {
  const allWalls = [...(level.outline || []), ...(level.walls || [])];
  const existing = (level.rooms || []).map(room => {
    if (!room.boundary_wall_ids?.length) return room;
    const resolved = roomBoundaryFromWalls(allWalls, room.boundary_wall_ids);
    return resolved.region
      ? { ...room, region: resolved.region, detection_warning: null }
      : { ...room, detection_warning: resolved.error };
  });
  const matched = new Set();
  const warnings = [];
  const rooms = candidates.filter(isSimpleRoomPolygon).map(region => {
    const ranked = existing.map(room => {
      const sharedArea = overlap(room.region || [], region);
      return { room, score: sharedArea / Math.max(Math.abs(area(region)), Math.abs(area(room.region || [])), 1),
        splitsAutomaticRoom: room.boundary_source === 'auto' && !room.boundary_locked && sharedArea / Math.max(Math.abs(area(region)), 1e-7) > 0.98 };
    })
      .sort((a, b) => b.score - a.score);
    const best = ranked.find(item => !matched.has(item.room.id));
    if (best && (best.score >= 0.55 || best.splitsAutomaticRoom)) {
      matched.add(best.room.id);
      if (best.room.boundary_locked && isSimpleRoomPolygon(best.room.region || [])) {
        const detectionWarning = best.room.detection_warning ||
          (best.score < 0.98 ? 'Locked boundary differs from detected walls.' : null);
        if (detectionWarning) warnings.push(`Room ${best.room.name || best.room.id}: ${detectionWarning}`);
        return {
          ...best.room,
          detection_warning: detectionWarning,
        };
      }
      const automaticRoom = { ...best.room };
      delete automaticRoom.boundary_wall_ids;
      return {
        ...automaticRoom,
        region,
        boundary_source: 'auto',
        boundary_locked: false,
        detection_warning: null,
      };
    }
    return {
      ...createRoom(building, level, region),
      boundary_source: 'auto',
      boundary_locked: false,
      detection_warning: null,
    };
  });
  existing.filter(room => !matched.has(room.id)).forEach(room => {
    const detectionWarning = isSimpleRoomPolygon(room.region || [])
      ? 'No longer matches detected geometry; redraw its boundary using connected walls.'
      : 'Boundary intersects itself or is degenerate; redraw it using connected walls.';
    warnings.push(`Room ${room.name || room.id}: ${detectionWarning} It was kept for review.`);
    rooms.push({ ...room, detection_warning: detectionWarning });
  });
  return { rooms, warnings };
}
