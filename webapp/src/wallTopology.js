import { arcGeometry, arcFromThreePoints, nearestPointOnWall, wallLength, wallPointAtDistance } from './buildingBlueprint';

export const WALL_CONNECTION_TOLERANCE = 0.1;
const EPS = 1e-7;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a, b) => a.x * b.y - a.y * b.x;
const minus = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const area = ring => ring.reduce((sum, p, i) => sum + cross(p, ring[(i + 1) % ring.length]), 0) / 2;

// Intersections are computed on authored curves, before any tessellation.
function intersections(a, b) {
  const ac = arcGeometry(a), bc = arcGeometry(b);
  let points = [];
  if (!ac && !bc) {
    const u = minus(a.end, a.start), v = minus(b.end, b.start), denominator = cross(u, v);
    if (Math.abs(denominator) > EPS) {
      const t = cross(minus(b.start, a.start), v) / denominator;
      points = [{ x: a.start.x + t * u.x, y: a.start.y + t * u.y }];
    } else points = [a.start, a.end, b.start, b.end];
  } else if (ac && bc) {
    const d = distance(a.center, b.center);
    if (d < EPS) points = [a.start, a.end, b.start, b.end];
    else if (d <= ac.radius + bc.radius + EPS && d >= Math.abs(ac.radius - bc.radius) - EPS) {
      const along = (ac.radius ** 2 - bc.radius ** 2 + d ** 2) / (2 * d);
      const height = Math.sqrt(Math.max(0, ac.radius ** 2 - along ** 2));
      const ux = (b.center.x - a.center.x) / d, uy = (b.center.y - a.center.y) / d;
      points = [-1, 1].map(sign => ({ x: a.center.x + along * ux - sign * height * uy, y: a.center.y + along * uy + sign * height * ux }));
    }
  } else {
    const arcWall = ac ? a : b, arc = ac || bc, line = ac ? b : a;
    const v = minus(line.end, line.start), offset = minus(line.start, arcWall.center);
    const aa = v.x ** 2 + v.y ** 2, bb = 2 * (v.x * offset.x + v.y * offset.y);
    const cc = offset.x ** 2 + offset.y ** 2 - arc.radius ** 2;
    const discriminant = bb ** 2 - 4 * aa * cc;
    if (aa > EPS && discriminant >= -EPS) points = [-1, 1].map(sign => {
      const t = (-bb + sign * Math.sqrt(Math.max(0, discriminant))) / (2 * aa);
      return { x: line.start.x + t * v.x, y: line.start.y + t * v.y };
    });
  }
  return points.filter(p => nearestPointOnWall(a, p).error < EPS && nearestPointOnWall(b, p).error < EPS);
}

export function isSimpleRoomPolygon(ring) {
  if (!Array.isArray(ring) || ring.length < 3 || !ring.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) || Math.abs(area(ring)) < EPS) return false;
  for (let i = 0; i < ring.length; i += 1) {
    if (distance(ring[i], ring[(i + 1) % ring.length]) < EPS) return false;
    for (let j = i + 1; j < ring.length; j += 1) {
      if (distance(ring[i], ring[j]) < EPS) return false;
      if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue;
      if (intersections({ start: ring[i], end: ring[(i + 1) % ring.length] }, { start: ring[j], end: ring[(j + 1) % ring.length] }).length) return false;
    }
  }
  return true;
}

export function wallConnectionDiagnostics(walls, tolerance = WALL_CONNECTION_TOLERANCE) {
  return walls.flatMap(wall => ['start', 'end'].flatMap(endpoint => {
    const point = wall[endpoint];
    const targets = walls.filter(other => other.id !== wall.id).map(other => ({ ...nearestPointOnWall(other, point), wallId: other.id }))
      .sort((a, b) => a.error - b.error);
    if (!targets.length || targets[0].error <= tolerance + EPS) return [];
    const nearest = targets[0];
    const choices = targets.filter(target => target.error <= 2 + EPS && target.error <= nearest.error + tolerance);
    return [{ wallId: wall.id, endpoint, point, distance: nearest.error, targets: choices, repairable: choices.length > 0 }];
  }));
}

export function buildWallTopology(sourceWalls, tolerance = WALL_CONNECTION_TOLERANCE) {
  const walls = sourceWalls.filter(wall => wall?.start && wall?.end && wallLength(wall) > EPS);
  const stops = walls.map(wall => [{ d: 0, point: wall.start }, { d: wallLength(wall), point: wall.end }]);
  // Endpoint-to-path welding uses Euclidean distance, not rounded grid buckets.
  walls.forEach((wall, i) => ['start', 'end'].forEach((endpoint, k) => {
    const matches = walls.map((other, j) => ({ j, ...nearestPointOnWall(other, wall[endpoint]) }))
      .filter(match => match.j !== i && match.error <= tolerance + EPS).sort((a, b) => a.error - b.error);
    if (!matches.length) return;
    const best = matches[0];
    stops[i][k].point = best.point;
    stops[best.j].push({ d: best.distance_from_start, point: best.point });
  }));
  walls.forEach((wall, i) => walls.slice(i + 1).forEach((other, offset) => {
    const j = i + offset + 1;
    intersections(wall, other).forEach(point => {
      stops[i].push({ d: nearestPointOnWall(wall, point).distance_from_start, point });
      stops[j].push({ d: nearestPointOnWall(other, point).distance_from_start, point });
    });
  }));
  // Nearby authored endpoints share one canonical position. Otherwise two
  // endpoints can independently snap to each other and merely exchange places.
  const endpointClusters = [];
  walls.forEach(wall => ['start', 'end'].forEach(endpoint => {
    const point = wall[endpoint];
    const cluster = endpointClusters.find(group => group.some(other => distance(other, point) <= tolerance + EPS));
    if (cluster) cluster.push(point);
    else endpointClusters.push([point]);
  }));
  const junctions = [];
  const canonical = point => {
    const cluster = endpointClusters.find(group => group.some(other => distance(other, point) < EPS));
    const candidate = cluster && cluster.length > 1 ? cluster[0] : point;
    const found = junctions.find(other => distance(other, candidate) < EPS);
    if (found) return found;
    junctions.push(candidate);
    return candidate;
  };
  stops.forEach(list => list.forEach(stop => { stop.point = canonical(stop.point); }));
  const vertices = [], edges = [], pairs = new Map();
  const vertex = point => {
    const existing = vertices.findIndex(value => distance(value, point) < EPS);
    if (existing >= 0) return existing;
    vertices.push({ x: point.x, y: point.y });
    return vertices.length - 1;
  };
  walls.forEach((wall, i) => {
    const sorted = stops[i].sort((a, b) => a.d - b.d).filter((stop, index, values) => !index || stop.d - values[index - 1].d > EPS);
    const points = [];
    sorted.slice(0, -1).forEach((start, index) => {
      const end = sorted[index + 1];
      const steps = arcGeometry(wall) ? Math.max(1, Math.ceil((end.d - start.d) / 0.4)) : 1;
      points.push(start.point);
      for (let step = 1; step < steps; step += 1) points.push(wallPointAtDistance(wall, start.d + (end.d - start.d) * step / steps));
    });
    points.push(sorted[sorted.length - 1].point);
    points.slice(0, -1).forEach((point, index) => {
      const a = vertex(point), b = vertex(points[index + 1]);
      if (a === b) return;
      const key = [a, b].sort((x, y) => x - y).join(':');
      if (pairs.has(key)) edges[pairs.get(key)].wallIds.add(wall.id);
      else { pairs.set(key, edges.length); edges.push({ a, b, wallIds: new Set([wall.id]) }); }
    });
  });
  const adjacency = vertices.map(() => []);
  edges.forEach((edge, id) => { adjacency[edge.a].push({ to: edge.b, id }); adjacency[edge.b].push({ to: edge.a, id }); });
  // Bridges include both dangling spurs and links between otherwise closed loops.
  const visited = new Map(), low = new Map(), bridges = new Set();
  let clock = 0;
  const visit = (v, parentEdge = -1) => {
    visited.set(v, ++clock); low.set(v, clock);
    adjacency[v].forEach(({ to, id }) => {
      if (id === parentEdge) return;
      if (!visited.has(to)) { visit(to, id); low.set(v, Math.min(low.get(v), low.get(to))); if (low.get(to) > visited.get(v)) bridges.add(id); }
      else low.set(v, Math.min(low.get(v), visited.get(to)));
    });
  };
  vertices.forEach((_, v) => { if (!visited.has(v)) visit(v); });
  const outgoing = adjacency.map((list, v) => list.filter(edge => !bridges.has(edge.id)).sort((a, b) =>
    Math.atan2(vertices[a.to].y - vertices[v].y, vertices[a.to].x - vertices[v].x) - Math.atan2(vertices[b.to].y - vertices[v].y, vertices[b.to].x - vertices[v].x)));
  const walked = new Set(), faces = [];
  outgoing.forEach((list, from) => list.forEach(first => {
    const start = `${from}:${first.to}`;
    if (walked.has(start)) return;
    let v = from, edge = first;
    const ring = [], wallIds = new Set(), edgeWallIds = [];
    for (let step = 0; step <= edges.length * 2; step += 1) {
      const key = `${v}:${edge.to}`;
      if (walked.has(key)) break;
      walked.add(key); ring.push(vertices[v]); edges[edge.id].wallIds.forEach(id => wallIds.add(id));
      edgeWallIds.push([...edges[edge.id].wallIds]);
      const previousVertex = v;
      const choices = outgoing[edge.to], reverse = choices.findIndex(item => item.to === previousVertex);
      v = edge.to; edge = choices[(reverse - 1 + choices.length) % choices.length];
      if (`${v}:${edge.to}` === start) {
        if (area(ring) > EPS && isSimpleRoomPolygon(ring)) faces.push({ region: ring, wallIds: [...wallIds], edgeWallIds });
        break;
      }
    }
  }));
  return { faces, diagnostics: wallConnectionDiagnostics(walls, tolerance) };
}

export function repairWallConnections(level, choices = {}) {
  const original = [...(level.outline || []), ...(level.walls || [])];
  const replacements = new Map(original.map(wall => [wall.id, { ...wall }]));
  const errors = [];
  wallConnectionDiagnostics(original).filter(gap => gap.repairable).forEach(gap => {
    const key = `${gap.wallId}:${gap.endpoint}`;
    const target = gap.targets.length === 1 ? gap.targets[0] : gap.targets.find(item => String(item.wallId) === String(choices[key]));
    if (!target) { errors.push(`Choose a target for wall ${gap.wallId} ${gap.endpoint}.`); return; }
    const wall = replacements.get(gap.wallId);
    // Resolve against earlier repairs too, so mutually nearby endpoints join
    // rather than swapping their original positions.
    wall[gap.endpoint] = { ...nearestPointOnWall(replacements.get(target.wallId), wall[gap.endpoint]).point };
    const before = original.find(item => item.id === gap.wallId);
    if (arcGeometry(before)) {
      const arc = arcFromThreePoints(wall.start, wall.end, before.through || wallPointAtDistance(before, wallLength(before) / 2), before);
      if (arc) replacements.set(gap.wallId, arc);
    }
  });
  replacements.forEach((wall, id) => {
    const before = original.find(item => item.id === id);
    if (distance(before.start, wall.start) < EPS && distance(before.end, wall.end) < EPS) return;
    if (distance(wall.start, wall.end) < WALL_CONNECTION_TOLERANCE) { errors.push(`Repair would collapse wall ${id}.`); return; }
    if (arcGeometry(before)) {
      const arc = arcFromThreePoints(wall.start, wall.end, before.through || wallPointAtDistance(before, wallLength(before) / 2), before);
      if (!arc) { errors.push(`Repair would invalidate arc ${id}.`); return; }
      replacements.set(id, arc);
    }
  });
  const openings = (level.openings || []).map(opening => {
    const before = original.find(wall => wall.id === opening.wall_id);
    if (!before) return opening;
    const after = replacements.get(before.id);
    if (distance(before.start, after.start) < EPS && distance(before.end, after.end) < EPS) return opening;
    const projected = nearestPointOnWall(after, wallPointAtDistance(before, opening.distance_from_start));
    if (projected.error > WALL_CONNECTION_TOLERANCE || projected.distance_from_start - opening.width / 2 < -EPS ||
      projected.distance_from_start + opening.width / 2 > wallLength(after) + EPS) errors.push(`Repair would invalidate an opening on wall ${before.id}.`);
    return { ...opening, distance_from_start: projected.distance_from_start };
  });
  if (errors.length) return { level, errors };
  return { level: { ...level, openings, outline: (level.outline || []).map(w => replacements.get(w.id)), walls: (level.walls || []).map(w => replacements.get(w.id)) }, errors };
}
