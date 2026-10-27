import { summarizeActiveMeshes, summarizeFrameTimes } from './scenePerformance';

test('reports median and slow frames without changing the input order', () => {
  const frames = [30, 10, 20, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200];
  const copy = [...frames];
  expect(summarizeFrameTimes(frames)).toEqual({ medianMs: 100, p95Ms: 190 });
  expect(frames).toEqual(copy);
  expect(summarizeFrameTimes([])).toBeNull();
});

test('attributes active batches without counting their instances as meshes', () => {
  expect(summarizeActiveMeshes([
    { metadata: { performanceCategory: 'battlements', kind: 'wall' }, thinInstanceCount: 40 },
    { metadata: { kind: 'wall' } },
    { metadata: { kind: 'wall' } },
  ])).toEqual({
    battlements: { meshes: 1, instances: 40 },
    wall: { meshes: 2, instances: 0 },
  });
});
