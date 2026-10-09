import { PointerEventTypes } from '@babylonjs/core';
import { createSettlementBabylonWorkflow } from './settlementBabylonWorkflow';

test('terrain drag stages placement, releases off terrain, and never calibrates or sculpts', () => {
  let listener;
  const canvas = document.createElement('canvas');
  canvas.setPointerCapture = jest.fn();
  let ground = { x: 2, y: 0, z: 3 };
  const state = { activeTool: 'reference', referencePlacement: { id: 'preview', origin_x: 120, origin_y: 170, width_feet: 200, height_feet: 100 },
    setReferencePlacement: jest.fn(), onReferencePoint: jest.fn(), onSculptStroke: jest.fn() };
  const scene = {
    getEngine: () => ({ getRenderingCanvas: () => canvas }),
    onPointerObservable: { add: fn => { listener = fn; return fn; }, remove: jest.fn() },
    pick: (x, y, predicate) => {
      if (predicate({ name: 'terrain' })) return { hit: !!ground, pickedPoint: ground };
      if (predicate({ isPickable: true, metadata: { referencePlacement: true } })) return { hit: true };
      return { hit: false };
    },
  };
  const dispose = createSettlementBabylonWorkflow(() => state).attach(scene);
  listener({ type: PointerEventTypes.POINTERDOWN, event: { button: 0, pointerId: 1 } });
  ground = { x: 4, y: 0, z: 4 };
  listener({ type: PointerEventTypes.POINTERMOVE, event: { buttons: 1 } });
  expect(state.setReferencePlacement).toHaveBeenLastCalledWith(expect.objectContaining({ origin_x: 220, origin_y: 220 }));
  ground = null;
  listener({ type: PointerEventTypes.POINTERUP, event: {} });
  ground = { x: 5, y: 0, z: 5 };
  listener({ type: PointerEventTypes.POINTERMOVE, event: { buttons: 0 } });
  expect(state.setReferencePlacement).toHaveBeenCalledTimes(1);
  expect(state.onReferencePoint).not.toHaveBeenCalled(); expect(state.onSculptStroke).not.toHaveBeenCalled();
  dispose(); expect(canvas.style.cursor).toBe('');
});
