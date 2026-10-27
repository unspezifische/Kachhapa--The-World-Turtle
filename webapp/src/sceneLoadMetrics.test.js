import { createSceneLoadMetrics } from './sceneLoadMetrics';

test('tracks distinct load milestones and request work from one transition start', () => {
  let clock = 100;
  const tracker = createSceneLoadMetrics(() => clock);
  tracker.start();
  clock = 150;
  tracker.mark('mapResponse');
  clock = 200;
  tracker.mark('sceneInitialized');
  clock = 250;
  tracker.mark('sceneInitialized');
  tracker.recordTileRequest(30);
  tracker.recordTileRequest(20);
  clock = 500;
  expect(tracker.mark('visibleTerrain')).toEqual({
    milestones: { mapResponse: 50, sceneInitialized: 100, visibleTerrain: 400 },
    tileRequests: 2,
    tileRequestMs: 50,
  });
  tracker.start();
  expect(tracker.snapshot()).toEqual({ milestones: {}, tileRequests: 0, tileRequestMs: 0 });
});
