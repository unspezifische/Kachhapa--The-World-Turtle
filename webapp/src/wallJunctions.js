import { attachedWallTower, isFortificationTowerPoint } from './settlementEditor';

const samePoint = (a, b) => Number(a.x) === Number(b.x) && Number(a.y) === Number(b.y);
const junctionId = (wallId, index) => `junction-${wallId}-${index}`;

function structureFor(wall, point, index) {
  const tower = attachedWallTower(wall, point, index);
  return {
    kind: tower?.kind || 'tower',
    shape: tower?.shape || 'circular',
    width_feet: Number(tower?.width_feet) || (Number(wall.width_feet) || 24) * 1.65,
    depth_feet: Number(tower?.depth_feet) || Number(tower?.width_feet) || (Number(wall.width_feet) || 24) * 1.65,
    height_feet: Number(tower?.height_feet) || Number(wall.height_feet) || 35,
    rotation: Number(tower?.rotation) || 0,
    material: tower?.material || wall.material || 'stone'
  };
}

export function reconcileWallJunctions(environment) {
  const walls = environment?.fortifications || [];
  const grouped = new Map();
  walls.forEach(wall => (wall.points || []).forEach((point, index) => {
    if (!isFortificationTowerPoint(wall, index) || point.junction_id || point.junction_detached) return;
    const key = `${Number(point.x)},${Number(point.y)}`;
    grouped.set(key, [...(grouped.get(key) || []), { wall, point, index }]);
  }));
  const additions = [];
  const memberships = new Map();
  grouped.forEach(group => {
    if (new Set(group.map(item => item.wall.id)).size < 2) return;
    group.sort((a, b) => String(a.wall.id).localeCompare(String(b.wall.id)) || a.index - b.index);
    const owner = group.find(item => attachedWallTower(item.wall, item.point, item.index)) || group[0];
    const id = junctionId(group[0].wall.id, group[0].index);
    additions.push({ id, x: owner.point.x, y: owner.point.y, ...structureFor(owner.wall, owner.point, owner.index) });
    group.forEach(item => memberships.set(`${item.wall.id}:${item.index}`, id));
  });
  if (!additions.length) return environment;
  return {
    ...environment,
    wall_junctions: [...(environment.wall_junctions || []), ...additions],
    fortifications: walls.map(wall => ({ ...wall, points: (wall.points || []).map((point, index) =>
      memberships.has(`${wall.id}:${index}`) ? { ...point, junction_id: memberships.get(`${wall.id}:${index}`), tower: true } : point) }))
  };
}

export function findWallSnapTarget(point, walls, wallId, tolerance) {
  let best = null;
  let distance = Number(tolerance) || 80;
  (walls || []).forEach(wall => {
    if (wall.id === wallId || wall.visible === false) return;
    (wall.points || []).forEach((candidate, index) => {
      const current = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (current <= distance) { best = { wall, point: candidate, index }; distance = current; }
    });
  });
  return best;
}

export function joinWallPoints(environment, wallId, index, targetWallId, targetIndex) {
  const walls = environment.fortifications || [];
  const sourceWall = walls.find(wall => wall.id === wallId);
  const targetWall = walls.find(wall => wall.id === targetWallId);
  const source = sourceWall?.points?.[index];
  const target = targetWall?.points?.[targetIndex];
  if (!source || !target || wallId === targetWallId) return environment;
  const junctions = environment.wall_junctions || [];
  const targetId = target.junction_id || junctionId(targetWallId, targetIndex);
  const sourceId = source.junction_id;
  const existing = junctions.find(junction => junction.id === targetId);
  const sourceJunction = junctions.find(junction => junction.id === sourceId);
  const structure = existing || { id: targetId, x: target.x, y: target.y,
    ...structureFor(targetWall, target, targetIndex),
    ...(attachedWallTower(targetWall, target, targetIndex) ? {} :
      sourceJunction || (attachedWallTower(sourceWall, source, index) ? structureFor(sourceWall, source, index) : {})) };
  const joined = walls.map(wall => ({ ...wall, points: (wall.points || []).map((point, pointIndex) => {
    const member = (wall.id === wallId && pointIndex === index) ||
      (wall.id === targetWallId && pointIndex === targetIndex) ||
      (sourceId && point.junction_id === sourceId);
    return member ? { ...point, x: target.x, y: target.y, tower: true, junction_id: targetId,
      junction_detached: false } : point;
  }) }));
  return { ...environment, fortifications: joined,
    wall_junctions: [...junctions.filter(junction => junction.id !== targetId && junction.id !== sourceId),
      { ...structure, id: targetId, x: target.x, y: target.y }] };
}

export function appendWallAndJoin(environment, wall) {
  let next = { ...environment, fortifications: [...(environment.fortifications || []), wall] };
  (wall.points || []).forEach((point, index) => {
    const target = (next.fortifications || []).flatMap(candidate => candidate.id === wall.id ? [] :
      (candidate.points || []).map((value, pointIndex) => ({ candidate, value, pointIndex })))
      .find(item => samePoint(point, item.value));
    if (target) next = joinWallPoints(next, wall.id, index, target.candidate.id, target.pointIndex);
  });
  return next;
}

export function moveWallJunction(environment, wallId, index, point) {
  const selected = environment.fortifications?.find(wall => wall.id === wallId)?.points?.[index];
  if (!selected) return environment;
  const x = Math.round(point.x), y = Math.round(point.y);
  const id = selected.junction_id;
  return { ...environment,
    fortifications: (environment.fortifications || []).map(wall => ({ ...wall,
      points: (wall.points || []).map((value, valueIndex) =>
        (id ? value.junction_id === id : wall.id === wallId && valueIndex === index)
          ? { ...value, x, y } : value) })),
    wall_junctions: (environment.wall_junctions || []).map(junction =>
      junction.id === id ? { ...junction, x, y } : junction) };
}

export function detachWallJunction(environment, wallId, index) {
  const wall = environment.fortifications?.find(value => value.id === wallId);
  const point = wall?.points?.[index];
  if (!point?.junction_id) return environment;
  const junction = (environment.wall_junctions || []).find(value => value.id === point.junction_id);
  const detached = (environment.fortifications || []).map(value => value.id !== wallId ? value : {
    ...value,
    points: value.points.map((item, itemIndex) => itemIndex === index
      ? { ...item, point_id: item.point_id || `${wallId}-point-${index}`,
        junction_id: undefined, junction_detached: true, tower: true } : item),
    towers: junction && !attachedWallTower(value, point, index)
      ? [...(value.towers || []), { ...junction, id: `${junction.id}-detached-${wallId}`,
        point_id: point.point_id || `${wallId}-point-${index}` }] : value.towers
  });
  return cleanWallJunctions({ ...environment, fortifications: detached });
}

export function cleanWallJunctions(environment) {
  const counts = new Map();
  (environment.fortifications || []).forEach(wall => (wall.points || []).forEach(point => {
    if (point.junction_id) counts.set(point.junction_id, (counts.get(point.junction_id) || 0) + 1);
  }));
  const orphaned = new Set((environment.wall_junctions || []).filter(junction => (counts.get(junction.id) || 0) < 2)
    .map(junction => junction.id));
  const junctionById = new Map((environment.wall_junctions || []).map(junction => [junction.id, junction]));
  return { ...environment,
    wall_junctions: (environment.wall_junctions || []).filter(junction => !orphaned.has(junction.id)),
    fortifications: (environment.fortifications || []).map(wall => {
      const restoredTowers = [...(wall.towers || [])];
      const points = (wall.points || []).map((point, index) => {
        if (!orphaned.has(point.junction_id)) return point;
        const pointId = point.point_id || `${wall.id}-point-${index}`;
        if (!attachedWallTower(wall, point, index)) {
          const junction = junctionById.get(point.junction_id);
          if (junction) restoredTowers.push({ ...junction, id: `${junction.id}-single-${wall.id}`,
            point_id: pointId });
        }
        return { ...point, point_id: pointId, junction_id: undefined, tower: true };
      });
      return { ...wall, points, ...(restoredTowers.length ? { towers: restoredTowers } : {}) };
    }) };
}

export function updateWallJunction(environment, id, changes) {
  return { ...environment, wall_junctions: (environment.wall_junctions || []).map(junction =>
    junction.id === id ? { ...junction, ...changes } : junction) };
}
