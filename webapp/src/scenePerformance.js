import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';

const SAMPLE_INTERVAL_MS = 1000;

export function summarizeFrameTimes(samples) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) * 0.5)];
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  return { medianMs: median, p95Ms: p95 };
}

export function summarizeActiveMeshes(meshes) {
  const categories = {};
  for (const mesh of meshes) {
    const category = mesh.metadata?.performanceCategory || mesh.metadata?.kind || 'other';
    const current = categories[category] || { meshes: 0, instances: 0 };
    current.meshes += 1;
    current.instances += Math.max(0, Number(mesh.thinInstanceCount) || 0);
    categories[category] = current;
  }
  return categories;
}

/** Keep diagnostic work out of React's per-frame render path. */
export function observeScenePerformance(scene, onSample) {
  if (!onSample) return () => {};
  const instrumentation = new SceneInstrumentation(scene);
  const engine = scene.getEngine();
  let samples = [];
  let lastReport = performance.now();
  const observer = scene.onAfterRenderObservable.add(() => {
    const frameMs = engine.getDeltaTime();
    if (Number.isFinite(frameMs) && frameMs > 0) samples.push(frameMs);
    const now = performance.now();
    if (now - lastReport < SAMPLE_INTERVAL_MS) return;
    const times = summarizeFrameTimes(samples);
    if (times) {
      const active = scene.getActiveMeshes();
      onSample({
        ...times,
        drawCalls: instrumentation.drawCallsCounter.current,
        activeMeshes: active.length,
        totalMeshes: scene.meshes.length,
        categories: summarizeActiveMeshes(active),
      });
    }
    samples = [];
    lastReport = now;
  });
  return () => {
    scene.onAfterRenderObservable.remove(observer);
    instrumentation.dispose();
  };
}
