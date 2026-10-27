import { Matrix } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import '@babylonjs/core/Meshes/thinInstanceMesh';

export function sameThinBoxes(previous, next) {
  return previous?.length === next.length && previous.every((box, index) =>
    Object.keys(box).every(property => box[property] === next[index][property]));
}

/** A pickable box draw submission with per-box local transforms. */
export function createThinBoxBatch(scene, name, material, boxes, metadata, parent = null) {
  if (!boxes.length) return null;
  const mesh = MeshBuilder.CreateBox(name, { size: 1 }, scene);
  mesh.parent = parent;
  mesh.material = material;
  mesh.metadata = metadata;
  mesh.thinInstanceEnablePicking = true;
  const matrices = new Float32Array(boxes.length * 16);
  boxes.forEach((box, index) => {
    Matrix.Scaling(box.width, box.height, box.depth)
      .multiply(Matrix.RotationY(box.angle || 0))
      .multiply(Matrix.Translation(box.x, box.y, box.z))
      .copyToArray(matrices, index * 16);
  });
  mesh.thinInstanceSetBuffer('matrix', matrices, 16, false);
  mesh.thinInstanceRefreshBoundingInfo();
  return mesh;
}
