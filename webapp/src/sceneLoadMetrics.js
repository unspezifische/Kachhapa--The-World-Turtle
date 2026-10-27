/** Timing state for one settlement transition; durations use the same start. */
export function createSceneLoadMetrics(now = () => performance.now()) {
  let startedAt = null;
  let milestones = {};
  let tileRequests = 0;
  let tileRequestMs = 0;

  const snapshot = () => ({ milestones: { ...milestones }, tileRequests, tileRequestMs });
  return {
    start() {
      startedAt = now();
      milestones = {};
      tileRequests = 0;
      tileRequestMs = 0;
      return snapshot();
    },
    mark(name) {
      if (startedAt !== null && !(name in milestones)) {
        milestones[name] = Math.max(0, now() - startedAt);
      }
      return snapshot();
    },
    recordTileRequest(durationMs) {
      tileRequests += 1;
      tileRequestMs += Math.max(0, durationMs);
      return snapshot();
    },
    snapshot,
  };
}
