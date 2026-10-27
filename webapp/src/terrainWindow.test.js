import { NullEngine, Scene, VertexBuffer } from '@babylonjs/core';
import { createTerrainWindow, terrainWindowGeometry } from './terrainWindow';

test.each([[3, 5], [5, 3], [257, 129]])('finite %ix%i windows never connect opposite edges', (columns, rows) => {
  const positions = new Float32Array(columns * rows * 3);
  const { indices } = terrainWindowGeometry(positions, columns, rows);
  expect(indices.length).toBe((columns - 1) * (rows - 1) * 6);
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = Array.from(indices.slice(i, i + 3));
    expect(Math.max(...triangle)).toBeLessThan(columns * rows);
    const xs = triangle.map(index => index % columns);
    const zs = triangle.map(index => Math.floor(index / columns));
    expect(Math.max(...xs) - Math.min(...xs)).toBe(1);
    expect(Math.max(...zs) - Math.min(...zs)).toBe(1);
  }
});

test('a sculpted sample updates only its own vertex and windows release their meshes', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const mapData = new Float32Array([
    -2, 0, -1, 0, 0, -1, 2, 0, -1,
    -2, 0, 1, 0, 0, 1, 2, 0, 1,
  ]);
  const observerCount = scene.onBeforeRenderObservable.observers.length;
  const terrain = createTerrainWindow(scene, mapData, 3, 2);
  const initialNormals = terrain.mesh.getVerticesData(VertexBuffer.NormalKind);
  for (let i = 1; i < initialNormals.length; i += 3) {
    expect(initialNormals[i]).toBeCloseTo(1);
  }
  mapData[4] = 10;
  terrain.update();
  const positions = terrain.mesh.getVerticesData(VertexBuffer.PositionKind);
  expect(Array.from(positions).filter((_, i) => i % 3 === 1)).toEqual([0, 10, 0, 0, 0, 0]);
  expect(terrain.mesh.getBoundingInfo().boundingBox.maximum.y).toBe(10);
  expect(scene.onBeforeRenderObservable.observers.length).toBe(observerCount);
  terrain.dispose();
  expect(scene.meshes).toHaveLength(0);
  scene.dispose();
  engine.dispose();
});

test('a hidden replacement window computes normals when its sampled heights are ready', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const mapData = new Float32Array([
    0, 0, 0, 1, 0, 0,
    0, 0, 1, 1, 0, 1,
  ]);
  const terrain = createTerrainWindow(scene, mapData, 2, 2, { deferNormals: true });
  expect(Array.from(terrain.mesh.getVerticesData(VertexBuffer.NormalKind))).toEqual(Array(12).fill(0));
  terrain.update();
  expect(terrain.mesh.getVerticesData(VertexBuffer.NormalKind)[1]).toBeCloseTo(1);
  terrain.dispose();
  scene.dispose();
  engine.dispose();
});
