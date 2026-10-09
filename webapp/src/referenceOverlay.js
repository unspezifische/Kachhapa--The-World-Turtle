import { Mesh, MeshBuilder, TransformNode, VertexData, StandardMaterial, Texture, Color3, Vector3 } from '@babylonjs/core';
import { FEET_PER_SCENE_UNIT as SCALE } from './settlementEditor';
import { EDITOR_ACCENT_HEX } from './editorAppearance';

export function createReferenceOverlay(scene, layer, sampleHeight, order = 0, existing = null) {
  const segments = 32, positions = [], indices = [], uvs = [], normals = [];
  const rotation = (Number(layer.rotation_degrees) || 0) * Math.PI / 180;
  for (let row = 0; row <= segments; row++) for (let col = 0; col <= segments; col++) {
    const localX = (col / segments - 0.5) * layer.width_feet;
    const localY = (0.5 - row / segments) * layer.height_feet;
    const x = (Number(layer.origin_x) || 0) + localX * Math.cos(rotation) - localY * Math.sin(rotation);
    const y = (Number(layer.origin_y) || 0) + localX * Math.sin(rotation) + localY * Math.cos(rotation);
    positions.push(x / SCALE, (sampleHeight(x, y) + 0.2 + order * 0.05) / SCALE, y / SCALE);
    uvs.push(col / segments, row / segments);
    if (row < segments && col < segments) {
      const a = row * (segments + 1) + col, b = a + 1, c = a + segments + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const mesh = existing || new Mesh(`reference-overlay-${layer.id}`, scene);
  const data = new VertexData();
  Object.assign(data, { positions, indices, uvs, normals });
  VertexData.ComputeNormals(positions, indices, normals); data.applyToMesh(mesh);
  const material = mesh.material || new StandardMaterial(`reference-overlay-material-${layer.id}`, scene);
  if (material.emissiveTexture?.url !== layer.image_url) {
    material.emissiveTexture?.dispose();
    material.emissiveTexture = new Texture(layer.image_url, scene, false, false);
  }
  // The image is rendered through the unlit emissive channel. StandardMaterial
  // otherwise contributes its default white diffuse base as well, adding white
  // to every pixel and washing uploaded maps into a pale rectangle.
  material.diffuseColor = Color3.Black();
  material.ambientColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.emissiveColor = Color3.White(); material.disableLighting = true;
  material.alpha = layer.opacity ?? 0.7; material.backFaceCulling = false;
  material.zOffset = -1 - order;
  mesh.material = material; mesh.isPickable = !!layer._placing;
  mesh.metadata = { referencePlacement: true };
  return mesh;
}

export function createReferenceGizmo(scene, sampleHeight) {
  const root = new TransformNode('reference-camera-gizmo', scene);
  const meshes = [];
  const accent = Color3.FromHexString(EDITOR_ACCENT_HEX);
  const material = new StandardMaterial('reference-camera-gizmo-material', scene);
  material.emissiveColor = accent;
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.disableDepthWrite = true;

  const register = (mesh, mode = null) => {
    mesh.parent = root;
    mesh.renderingGroupId = 3;
    mesh.isPickable = Boolean(mode);
    if (mode) mesh.metadata = { referenceGizmoMode: mode };
    if (!mesh.color) mesh.material = material;
    meshes.push(mesh);
    return mesh;
  };

  const movePad = register(MeshBuilder.CreateCylinder('reference-gizmo-move', {
    diameter: 0.62, height: 0.1, tessellation: 24,
  }, scene), 'move');
  movePad.position.y = 0.06;

  const moveCross = register(MeshBuilder.CreateLines('reference-gizmo-move-cross', { points: [
    new Vector3(-0.62, 0.13, 0), new Vector3(0.62, 0.13, 0),
    new Vector3(0, 0.13, 0), new Vector3(0, 0.13, -0.62),
    new Vector3(0, 0.13, 0), new Vector3(0, 0.13, 0.62),
  ] }, scene));
  moveCross.color = accent;

  const rotationRing = register(MeshBuilder.CreateTorus('reference-gizmo-rotate', {
    diameter: 2.45, thickness: 0.16, tessellation: 48,
  }, scene), 'rotate');
  rotationRing.position.y = 0.08;

  register(MeshBuilder.CreateTube('reference-gizmo-scale-shaft', {
    path: [new Vector3(1.12, 0.1, 1.12), new Vector3(1.82, 0.1, 1.82)],
    radius: 0.09,
    tessellation: 12,
  }, scene), 'scale');
  const scaleHandle = register(MeshBuilder.CreateBox('reference-gizmo-scale-handle', {
    width: 0.38, height: 0.14, depth: 0.38,
  }, scene), 'scale');
  scaleHandle.position.set(1.96, 0.1, 1.96);

  const updatePosition = () => {
    const camera = scene.activeCamera;
    const target = camera?.target;
    if (!target) return;
    const xFeet = target.x * SCALE, yFeet = target.z * SCALE;
    root.position.set(target.x, sampleHeight(xFeet, yFeet) / SCALE + 0.22, target.z);
    const radius = Math.max(2, Number(camera.radius) || 30);
    root.scaling.setAll(Math.max(0.16, radius * 0.035));
  };
  updatePosition();
  scene.onBeforeRenderObservable.add(updatePosition);

  return () => {
    scene.onBeforeRenderObservable.removeCallback(updatePosition);
    meshes.forEach(mesh => mesh.dispose());
    root.dispose();
    material.dispose();
  };
}
