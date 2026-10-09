import { Mesh, VertexData, VertexBuffer } from '@babylonjs/core';

// A streamed window is a finite rectangle, not a repeating heightmap. Each
// stored sample has exactly one vertex, including rectangular/non-square windows.
export function terrainWindowGeometry(mapData, columns, rows) {
  const indices = new Uint32Array((columns - 1) * (rows - 1) * 6);
  const uvs = new Float32Array(columns * rows * 2);
  let offset = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * columns + column;
      uvs[a * 2] = column / (columns - 1);
      uvs[a * 2 + 1] = row / (rows - 1);
      if (row < rows - 1 && column < columns - 1) {
        const b = a + 1, c = a + columns, d = c + 1;
        // Babylon's left-handed winding must face +Y for a ground surface.
        indices.set([a, b, c, b, d, c], offset);
        offset += 6;
      }
    }
  }
  return { positions: mapData, indices, uvs };
}

export function createTerrainWindow(scene, mapData, columns, rows) {
  const mesh = new Mesh('terrain', scene);
  const geometry = terrainWindowGeometry(mapData, columns, rows);
  const normals = new Float32Array(mapData.length);
  const data = new VertexData();
  Object.assign(data, geometry, { normals });
  VertexData.ComputeNormals(mapData, geometry.indices, normals);
  data.applyToMesh(mesh, true);
  return {
    mesh,
    mapData,
    _lastDebugLOD: 0,
    update() {
      VertexData.ComputeNormals(mapData, geometry.indices, normals);
      mesh.updateVerticesData(VertexBuffer.PositionKind, mapData, true);
      mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
    },
    dispose() { mesh.dispose(); },
  };
}
