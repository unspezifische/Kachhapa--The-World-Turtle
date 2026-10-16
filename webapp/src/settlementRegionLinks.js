import { sampleRoadCenterline, sampleFortificationCenterline } from './settlementBabylon';
import { closestPointOnSegment2d } from './geometry2d';

export function sourceCenterline(source, roads = [], fortifications = []) {
  if (!source) return [];
  const item = (source.kind === 'wall' ? fortifications : roads).find(value => value.id === source.id);
  if (!item) return [];
  return source.kind === 'wall' ? sampleFortificationCenterline(item) : sampleRoadCenterline(item);
}

export function nearestSplinePoint(point, roads = [], fortifications = [], tolerance = Infinity, preferredSource = null) {
  let best = null;
  const visit = (kind, item) => {
    if (preferredSource && (preferredSource.kind !== kind || preferredSource.id !== item.id)) return;
    const path = sourceCenterline({ kind, id: item.id }, roads, fortifications);
    for (let index = 0; index < path.length - 1; index += 1) {
      const start = path[index], end = path[index + 1];
      const projected = closestPointOnSegment2d(point, start, end);
      const fraction = projected.t;
      const { x, y } = projected.point;
      const distance = projected.distance;
      if (distance <= (preferredSource ? Infinity : tolerance) && (!best || distance < best.distance)) {
        best = { x, y, t: start.t + fraction * (end.t - start.t), distance,
          source: { kind, id: item.id } };
      }
    }
  };
  roads.filter(item => item.visible !== false).forEach(item => visit('road', item));
  fortifications.filter(item => item.visible !== false).forEach(item => visit('wall', item));
  return best;
}

function segmentIntersection(a, b, c, d) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const ex = d.x - c.x, ey = d.y - c.y;
  const divisor = dx * ey - dy * ex;
  if (Math.abs(divisor) < 1e-8) return null;
  const qx = c.x - a.x, qy = c.y - a.y;
  const rawU = (qx * ey - qy * ex) / divisor;
  const rawV = (qx * dy - qy * dx) / divisor;
  if (rawU < -1e-6 || rawU > 1 + 1e-6 || rawV < -1e-6 || rawV > 1 + 1e-6) return null;
  const u = Math.max(0, Math.min(1, rawU)), v = Math.max(0, Math.min(1, rawV));
  return { x: a.x + u * dx, y: a.y + u * dy,
    firstT: a.t + u * (b.t - a.t), secondT: c.t + v * (d.t - c.t) };
}

export function nearestSplineIntersection(first, second, near, roads = [], fortifications = []) {
  const a = sourceCenterline(first, roads, fortifications);
  const b = sourceCenterline(second, roads, fortifications);
  let best = null;
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      const hit = segmentIntersection(a[i], a[i + 1], b[j], b[j + 1]);
      if (!hit) continue;
      const distance = Math.hypot(hit.x - near.x, hit.y - near.y);
      if (!best || distance < best.distance) best = { ...hit, distance };
    }
  }
  return best;
}

const sameSource = (a, b) => a?.kind === b?.kind && a?.id === b?.id;

export function appendTracedBoundaryPoint(draft, point, roads, fortifications, tolerance = 80) {
  const hit = nearestSplinePoint(point, roads, fortifications, tolerance, point._source);
  if (!hit) return [...draft, { x: Math.round(point.x), y: Math.round(point.y) }];
  const last = draft[draft.length - 1];
  if (!last) return [{ x: hit.x, y: hit.y, outgoing: hit.source, t: hit.t }];
  if (last.outgoing && !sameSource(last.outgoing, hit.source)) {
    const junction = nearestSplineIntersection(last.outgoing, hit.source, point, roads, fortifications);
    if (junction) return [...draft, { x: junction.x, y: junction.y,
      incoming: last.outgoing, outgoing: hit.source, incomingT: junction.firstT,
      t: junction.secondT, junction: [last.outgoing, hit.source] }];
  }
  return [...draft, { x: hit.x, y: hit.y,
    incoming: sameSource(last.outgoing, hit.source) ? hit.source : undefined,
    outgoing: hit.source, incomingT: hit.t, t: hit.t }];
}

function pointAt(path, t) {
  const scaled = Math.max(0, Math.min(1, t)) * (path.length - 1);
  const start = path[Math.floor(scaled)], end = path[Math.min(path.length - 1, Math.ceil(scaled))];
  const fraction = scaled - Math.floor(scaled);
  return { x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction };
}

function slicePath(path, from, to) {
  const result = [pointAt(path, from)];
  if (from <= to) path.forEach(point => { if (point.t > from && point.t < to) result.push(point); });
  else [...path].reverse().forEach(point => { if (point.t < from && point.t > to) result.push(point); });
  result.push(pointAt(path, to));
  return result;
}

// Keep curve detail within a quarter foot while avoiding hundreds of redundant
// collinear points in every saved ward polygon.
function compactPath(points, tolerance = 0.25) {
  if (points.length < 3) return points;
  const start = points[0], end = points[points.length - 1];
  let farthest = 0, distance = tolerance;
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const error = closestPointOnSegment2d(point, start, end).distance;
    if (error > distance) { farthest = index; distance = error; }
  }
  return farthest ? [...compactPath(points.slice(0, farthest + 1), tolerance).slice(0, -1),
    ...compactPath(points.slice(farthest), tolerance)] : [start, end];
}

export function resolveLinkedRegion(region, roads = [], fortifications = []) {
  const anchors = region.boundary_anchors;
  if (!Array.isArray(anchors) || anchors.length < 3) return region;
  const resolved = anchors.map(anchor => {
    if (anchor.junction) {
      const hit = nearestSplineIntersection(anchor.junction[0], anchor.junction[1], anchor, roads, fortifications);
      return hit ? { ...anchor, x: hit.x, y: hit.y, incomingT: hit.firstT, t: hit.secondT } : null;
    }
    if (anchor.outgoing) {
      const path = sourceCenterline(anchor.outgoing, roads, fortifications);
      if (!path.length) return null;
      return { ...anchor, ...pointAt(path, anchor.t) };
    }
    return anchor;
  });
  if (resolved.some(anchor => !anchor)) return { ...region, boundary_needs_repair: true,
    boundary_edges: (region.boundary_edges || anchors.map((anchor, index) => {
      const end = anchors[(index + 1) % anchors.length];
      return sameSource(anchor.outgoing, end.incoming)
        ? { kind: anchor.outgoing.kind, source_id: anchor.outgoing.id } : { kind: 'free' };
    })).map((edge, index) => ({ ...edge,
      needs_repair: !resolved[index] || !resolved[(index + 1) % resolved.length] })) };
  const points = [], edges = [];
  for (let index = 0; index < resolved.length; index += 1) {
    const start = resolved[index], end = resolved[(index + 1) % resolved.length];
    const incoming = end.incoming || (index === resolved.length - 1 ? end.outgoing : null);
    const source = sameSource(start.outgoing, incoming) ? start.outgoing : null;
    const path = source ? sourceCenterline(source, roads, fortifications) : [];
    if (source && !path.length) return { ...region, boundary_needs_repair: true };
    const segment = path.length ? compactPath(slicePath(path, start.t, end.incomingT ?? end.t)) : [start, end];
    points.push(...segment.slice(0, -1).map(point => ({ x: point.x, y: point.y })));
    edges.push(source ? { kind: source.kind, source_id: source.id,
      from_t: start.t, to_t: end.incomingT ?? end.t } : { kind: 'free' });
  }
  return { ...region, boundary_anchors: resolved, boundary_edges: edges,
    points, boundary_needs_repair: false };
}

export function tracedDraftPolyline(anchors, roads = [], fortifications = []) {
  if (!anchors.length) return [];
  const points = [{ x: anchors[0].x, y: anchors[0].y }];
  for (let index = 1; index < anchors.length; index += 1) {
    const start = anchors[index - 1], end = anchors[index];
    const source = sameSource(start.outgoing, end.incoming) ? start.outgoing : null;
    const path = source ? sourceCenterline(source, roads, fortifications) : [];
    points.push(...(path.length ? slicePath(path, start.t, end.incomingT ?? end.t).slice(1)
      : [{ x: end.x, y: end.y }]));
  }
  return points;
}
