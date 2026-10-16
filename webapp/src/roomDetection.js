import polygonClipping from 'polygon-clipping';
import { pointInPolygon, wallPolyline } from './buildingBlueprint';
import { createRoom, roomInteriorPoint } from './settlementRooms';

const EPS = 0.1;
const key = point => `${Math.round(point.x / EPS)}:${Math.round(point.y / EPS)}`;
const area = points => points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0) / 2;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const closeRing = ring => [...ring.map(p => [p.x, p.y]), [ring[0].x, ring[0].y]];

function splitSegments(segments) {
  const result = [];
  segments.forEach((segment, index) => {
    const vector = subtract(segment.b, segment.a);
    const lengthSquared = vector.x * vector.x + vector.y * vector.y;
    if (lengthSquared < EPS * EPS) return;
    const positions = [0, 1];
    segments.forEach((other, otherIndex) => {
      if (index === otherIndex) return;
      const otherVector = subtract(other.b, other.a);
      const denominator = cross(vector, otherVector);
      if (Math.abs(denominator) < 1e-8) {
        [other.a, other.b].forEach(point => {
          const t = ((point.x - segment.a.x) * vector.x + (point.y - segment.a.y) * vector.y) / lengthSquared;
          const projection = { x: segment.a.x + t * vector.x, y: segment.a.y + t * vector.y };
          if (t > EPS / Math.sqrt(lengthSquared) && t < 1 - EPS / Math.sqrt(lengthSquared) && Math.hypot(projection.x - point.x, projection.y - point.y) < EPS) positions.push(t);
        });
      } else {
        const offset = subtract(other.a, segment.a);
        const t = cross(offset, otherVector) / denominator;
        const u = cross(offset, vector) / denominator;
        if (t > -1e-6 && t < 1 + 1e-6 && u > -1e-6 && u < 1 + 1e-6) positions.push(Math.max(0, Math.min(1, t)));
      }
    });
    const sorted = [...new Set(positions.map(value => Math.round(value * 1e6) / 1e6))].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const a = { x: segment.a.x + sorted[i] * vector.x, y: segment.a.y + sorted[i] * vector.y };
      const b = { x: segment.a.x + sorted[i + 1] * vector.x, y: segment.a.y + sorted[i + 1] * vector.y };
      if (Math.hypot(b.x - a.x, b.y - a.y) >= EPS) result.push({ a, b });
    }
  });
  return result;
}

function facesFromSegments(segments) {
  const vertices = new Map();
  const outgoing = new Map();
  const edges = [];
  const unique = new Set();
  splitSegments(segments).forEach(({ a, b }) => {
    const ak = key(a), bk = key(b);
    if (ak === bk) return;
    const pair = [ak, bk].sort().join('|');
    if (unique.has(pair)) return;
    unique.add(pair);
    vertices.set(ak, a); vertices.set(bk, b);
    [[ak, bk], [bk, ak]].forEach(([from, to]) => {
      const edge = { from, to, visited: false };
      edges.push(edge);
      outgoing.set(from, [...(outgoing.get(from) || []), edge]);
    });
  });
  outgoing.forEach(list => list.sort((a, b) => {
    const origin = vertices.get(a.from);
    const pa = vertices.get(a.to), pb = vertices.get(b.to);
    return Math.atan2(pa.y - origin.y, pa.x - origin.x) - Math.atan2(pb.y - origin.y, pb.x - origin.x);
  }));
  const faces = [];
  edges.forEach(start => {
    if (start.visited) return;
    const ring = [];
    let edge = start;
    for (let steps = 0; edge && steps <= edges.length; steps += 1) {
      if (edge.visited) break;
      edge.visited = true;
      ring.push(vertices.get(edge.from));
      const list = outgoing.get(edge.to) || [];
      const from = edge.from;
      const reverseIndex = list.findIndex(item => item.to === from);
      edge = list[(reverseIndex - 1 + list.length) % list.length];
      if (edge === start) break;
    }
    if (edge === start && ring.length >= 3 && area(ring) > 1) faces.push(ring);
  });
  return faces;
}

function overlap(left, right) {
  try {
    const result = polygonClipping.intersection([[closeRing(left)]], [[closeRing(right)]]);
    return result.flatMap(polygon => polygon.map(ring => Math.abs(area(ring.slice(0, -1).map(([x, y]) => ({ x, y })))))).reduce((sum, value) => sum + value, 0);
  } catch { return 0; }
}

export function detectRooms(building, level) {
  const outline = level.outline || [];
  if (outline.length < 3) return { candidates: [], warnings: ['A closed exterior outline is required.'] };
  const walls = [...outline, ...(level.walls || [])].filter(wall => wall?.start && wall?.end);
  const segments = walls.flatMap(wall => {
    const points = wallPolyline(wall, 1);
    return points.slice(0, -1).map((a, index) => ({ a, b: points[index + 1] }));
  });
  const footprint = (level.corners || []).length >= 3 ? level.corners : outline.map(wall => wall.start);
  const voids = (level.floor_voids || []).filter(item => item.kind === 'open_to_sky');
  if (voids.length) return {
    candidates: [],
    warnings: ['Automatic room detection around open-to-sky courtyards is not supported yet. Draw rooms manually; existing rooms remain unchanged.'],
  };
  const candidates = facesFromSegments(segments).filter(region => {
    const center = roomInteriorPoint(region);
    return center && pointInPolygon(center, footprint);
  });
  const warnings = [];
  if (!candidates.length) warnings.push('No closed rooms found. Check wall endpoints or draw a room manually.');
  if (walls.some(wall => wall.type === 'arc')) warnings.push('Arc walls were approximated for room detection; review boundaries.');
  return { candidates, warnings };
}

export function reconcileDetectedRooms(building, level, candidates) {
  const existing = level.rooms || [];
  const matched = new Set();
  const warnings = [];
  const rooms = candidates.map(region => {
    const ranked = existing.map(room => ({ room, score: overlap(room.region || [], region) / Math.max(Math.abs(area(region)), Math.abs(area(room.region || [])), 1) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked.find(item => !matched.has(item.room.id));
    if (best && best.score >= 0.55) {
      matched.add(best.room.id);
      if (best.room.boundary_locked) {
        if (best.score < 0.98) {
          warnings.push(`Room ${best.room.name || best.room.id} has a locked boundary that differs from the detected walls.`);
        }
        return {
          ...best.room,
          detection_warning: best.score < 0.98 ? 'Locked boundary differs from detected walls.' : null,
        };
      }
      return {
        ...best.room,
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
    };
  });
  existing.filter(room => !matched.has(room.id)).forEach(room => {
    warnings.push(`Room ${room.name || room.id} no longer matches detected geometry; it was kept for review.`);
    rooms.push(room);
  });
  return { rooms, warnings };
}
