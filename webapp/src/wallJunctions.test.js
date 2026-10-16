import { appendWallAndJoin, cleanWallJunctions, detachWallJunction, findWallSnapTarget,
  joinWallPoints, moveWallJunction, reconcileWallJunctions, updateWallJunction } from './wallJunctions';

const wall = (id, points, towers = []) => ({ id, width_feet: 20, height_feet: 35,
  material: 'stone', points, towers });

test('legacy coincident towers become one persistent junction, while nearby towers remain separate', () => {
  const environment = { fortifications: [
    wall('a', [{ x: 0, y: 0, tower: true }], [{ point_index: 0, width_feet: 40 }]),
    wall('b', [{ x: 0, y: 0, tower: true }], [{ point_index: 0, width_feet: 60 }]),
    wall('c', [{ x: 1, y: 0, tower: true }])
  ] };
  const joined = reconcileWallJunctions(environment);
  expect(joined.wall_junctions).toHaveLength(1);
  expect(joined.wall_junctions[0].width_feet).toBe(40);
  expect(joined.fortifications[0].points[0].junction_id).toBe(joined.fortifications[1].points[0].junction_id);
  expect(joined.fortifications[2].points[0].junction_id).toBeUndefined();
  expect(reconcileWallJunctions(joined)).toEqual(joined);
  expect(JSON.parse(JSON.stringify(joined)).wall_junctions).toHaveLength(1);
});

test('snapping promotes direction points and gives the explicit target structure precedence', () => {
  const environment = { fortifications: [
    wall('source', [{ x: 10, y: 10, tower: false }]),
    wall('target', [{ x: 20, y: 20, tower: false }],
      [{ point_index: 0, kind: 'guardhouse', width_feet: 52, material: 'brick' }])
  ] };
  expect(findWallSnapTarget({ x: 20, y: 21 }, environment.fortifications, 'source', 5)?.wall.id)
    .toBe('target');
  const joined = joinWallPoints(environment, 'source', 0, 'target', 0);
  expect(joined.wall_junctions).toHaveLength(1);
  expect(joined.wall_junctions[0]).toMatchObject({ kind: 'guardhouse', width_feet: 52, material: 'brick' });
  expect(joined.fortifications.map(item => item.points[0])).toEqual([
    expect.objectContaining({ x: 20, y: 20, tower: true, junction_id: joined.wall_junctions[0].id }),
    expect.objectContaining({ x: 20, y: 20, tower: true, junction_id: joined.wall_junctions[0].id })
  ]);
  const changed = updateWallJunction(joined, joined.wall_junctions[0].id, { height_feet: 70 });
  expect(changed.wall_junctions[0].height_feet).toBe(70);
});

test('moving a junction moves every attached point and detaching restores independent structures', () => {
  const joined = joinWallPoints({ fortifications: [
    wall('a', [{ x: 0, y: 0, tower: true }]),
    wall('b', [{ x: 0, y: 0, tower: true }])
  ] }, 'a', 0, 'b', 0);
  const moved = moveWallJunction(joined, 'a', 0, { x: 25, y: 50 });
  expect(moved.fortifications.map(item => item.points[0])).toEqual([
    expect.objectContaining({ x: 25, y: 50 }), expect.objectContaining({ x: 25, y: 50 })
  ]);
  expect(moved.wall_junctions[0]).toMatchObject({ x: 25, y: 50 });
  const detached = detachWallJunction(moved, 'a', 0);
  expect(detached.wall_junctions).toHaveLength(0);
  expect(detached.fortifications.every(item => !item.points[0].junction_id)).toBe(true);
  expect(detached.fortifications.every(item => item.towers.length === 1)).toBe(true);
  const independent = moveWallJunction(detached, 'a', 0, { x: 90, y: 50 });
  expect(independent.fortifications[1].points[0].x).toBe(25);
});

test('deleting a wall retains a junction used by two other walls, then removes its orphan', () => {
  const first = joinWallPoints({ fortifications: [
    wall('a', [{ x: 0, y: 0, tower: true }]),
    wall('b', [{ x: 0, y: 0, tower: true }]),
    wall('c', [{ x: 0, y: 0, tower: true }])
  ] }, 'a', 0, 'b', 0);
  const joined = joinWallPoints(first, 'c', 0, 'b', 0);
  expect(cleanWallJunctions({ ...joined,
    fortifications: joined.fortifications.filter(item => item.id !== 'a') }).wall_junctions).toHaveLength(1);
  const oneLeft = cleanWallJunctions({ ...joined,
    fortifications: joined.fortifications.filter(item => item.id === 'c') });
  expect(oneLeft.wall_junctions).toHaveLength(0);
  expect(oneLeft.fortifications[0].points[0].tower).toBe(true);
});

test('a new wall ending exactly on another wall point joins at creation', () => {
  const existing = { fortifications: [wall('a', [{ x: 0, y: 0, tower: true }])] };
  const joined = appendWallAndJoin(existing, wall('b', [{ x: 10, y: 0, tower: true },
    { x: 0, y: 0, tower: true }]));
  expect(joined.wall_junctions).toHaveLength(1);
  expect(joined.fortifications[1].points[1].junction_id).toBe(joined.wall_junctions[0].id);
});
