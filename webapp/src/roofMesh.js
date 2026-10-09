import {
  Color3,
  Mesh,
  StandardMaterial,
  VertexData,
} from '@babylonjs/core';

import earcut from 'earcut';

import {
  FEET_PER_SCENE_UNIT as SCALE,
} from './settlementEditor';

const FINISH_COLORS = {
  shingles: '#65584d',
  slate: '#555d63',
  tile: '#9b5942',
  metal: '#697773',
  wood: '#805b38',
  stone: '#79786f',
};

const radians = degrees => Number(degrees || 0) * Math.PI / 180;

const ringArea = ring => ring.reduce((sum, point, index) => {
  const next = ring[(index + 1) % ring.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0) / 2;

function offsetRing(ring, amount, isHole = false) {
  if (ring.length < 3 || !amount) return ring.map(point => ({ ...point }));

  const orientation = Math.sign(ringArea(ring)) || 1;
  const distance = amount * (isHole ? -1 : 1);

  return ring.map((point, index) => {
    const previous = ring[(index + ring.length - 1) % ring.length];
    const next = ring[(index + 1) % ring.length];
    const incoming = {
      x: point.x - previous.x,
      y: point.y - previous.y,
    };
    const outgoing = {
      x: next.x - point.x,
      y: next.y - point.y,
    };
    const incomingLength = Math.hypot(incoming.x, incoming.y) || 1;
    const outgoingLength = Math.hypot(outgoing.x, outgoing.y) || 1;
    const incomingNormal = {
      x: orientation * incoming.y / incomingLength,
      y: -orientation * incoming.x / incomingLength,
    };
    const outgoingNormal = {
      x: orientation * outgoing.y / outgoingLength,
      y: -orientation * outgoing.x / outgoingLength,
    };
    const bisectorLength = Math.hypot(
      incomingNormal.x + outgoingNormal.x,
      incomingNormal.y + outgoingNormal.y
    ) || 1;
    const bisector = {
      x: (incomingNormal.x + outgoingNormal.x) / bisectorLength,
      y: (incomingNormal.y + outgoingNormal.y) / bisectorLength,
    };
    const scale = distance / Math.max(
      0.25,
      bisector.x * outgoingNormal.x + bisector.y * outgoingNormal.y
    );

    return {
      x: point.x + bisector.x * scale,
      y: point.y + bisector.y * scale,
    };
  });
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, (
    (point.x - start.x) * dx + (point.y - start.y) * dy
  ) / lengthSquared));

  return Math.hypot(point.x - start.x - dx * t, point.y - start.y - dy * t);
}

function buildCustomVertices(roof, baseElevation) {
  const vertices = roof.custom_vertices || [];
  const faces = roof.custom_faces || [];
  if (vertices.length < 3 || !faces.length) return null;

  const positions = vertices.flatMap(vertex => [
    vertex.x / SCALE,
    (baseElevation + vertex.elevation) / SCALE,
    vertex.y / SCALE,
  ]);
  const indices = faces.flatMap(face => face);

  if (indices.some(index => index < 0 || index >= vertices.length)) return null;
  return { positions, indices };
}

export function createBlueprintRoofMesh(scene, roof, baseElevation, buildingId) {
  const sourceRings = [roof.footprint || [], ...(roof.holes || [])]
    .filter(ring => ring.length >= 3);
  if (!sourceRings.length) return null;

  let positions = [];
  let indices = [];

  if (roof.type === 'custom') {
    const custom = buildCustomVertices(roof, baseElevation);
    if (custom) ({ positions, indices } = custom);
  }

  if (!positions.length) {
    const center = sourceRings[0].reduce(
      (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
      { x: 0, y: 0 }
    );
    center.x /= sourceRings[0].length;
    center.y /= sourceRings[0].length;
    const rotation = radians(roof.rotation);
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const rings = sourceRings.map((ring, index) =>
      offsetRing(ring, roof.overhang, index > 0).map(point => {
        const x = point.x - center.x;
        const y = point.y - center.y;
        return {
          x: center.x + x * cosine - y * sine,
          y: center.y + x * sine + y * cosine,
        };
      })
    );
    const flat = [];
    const holeIndices = [];
    rings.forEach((ring, index) => {
      if (index > 0) holeIndices.push(flat.length / 2);
      ring.forEach(point => flat.push(point.x, point.y));
    });
    const triangles = earcut(flat, holeIndices, 2);
    const allPoints = rings.flat();
    const outer = rings[0];
    const bounds = outer.reduce((result, point) => ({
      minX: Math.min(result.minX, point.x),
      maxX: Math.max(result.maxX, point.x),
      minY: Math.min(result.minY, point.y),
      maxY: Math.max(result.maxY, point.y),
    }), {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
    });
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const ridgeAngle = radians(Number(roof.ridge_direction) + Number(roof.rotation));
    const slopeAngle = radians(Number(roof.slope_direction) + Number(roof.rotation));
    const across = { x: -Math.sin(ridgeAngle), y: Math.cos(ridgeAngle) };
    const slope = { x: Math.cos(slopeAngle), y: Math.sin(slopeAngle) };
    const ridgeHalfWidth = Math.max(0.1, ...allPoints.map(point =>
      Math.abs((point.x - centerX) * across.x + (point.y - centerY) * across.y)
    ));
    const slopeHalfWidth = Math.max(0.1, ...allPoints.map(point =>
      Math.abs((point.x - centerX) * slope.x + (point.y - centerY) * slope.y)
    ));
    const radius = Math.max(0.1, ...outer.map(point => Math.hypot(point.x - centerX, point.y - centerY)));
    const pitch = Math.tan(radians(Math.min(80, Math.max(0, roof.pitch))));
    const mansardBreak = Math.max(0.1, Number(roof.mansard_break) || 3);
    const baseHeight = (point) => {
      const x = point.x - centerX;
      const y = point.y - centerY;

      switch (roof.type) {
        case 'shed': {
          const projection = x * slope.x + y * slope.y;
          return baseElevation + (projection + slopeHalfWidth) * pitch;
        }
        case 'gable':
          return baseElevation + Math.max(0, ridgeHalfWidth - Math.abs(x * across.x + y * across.y)) * pitch;
        case 'hip': {
          const edgeDistance = rings.reduce((minimum, ring) =>
            Math.min(minimum, ...ring.map((start, index) =>
              distanceToSegment(point, start, ring[(index + 1) % ring.length])
            )),
          Infinity);
          return baseElevation + edgeDistance * pitch;
        }
        case 'dome': {
          const radial = Math.min(1, Math.hypot(x, y) / radius);
          return baseElevation + radius * pitch * Math.sqrt(Math.max(0, 1 - radial * radial));
        }
        case 'cone':
          return baseElevation + Math.max(0, 1 - Math.hypot(x, y) / radius) * radius * pitch;
        case 'mansard': {
          const edgeDistance = rings.reduce((minimum, ring) =>
            Math.min(minimum, ...ring.map((start, index) =>
              distanceToSegment(point, start, ring[(index + 1) % ring.length])
            )),
          Infinity);
          const steepRise = mansardBreak * pitch;
          return baseElevation + (edgeDistance <= mansardBreak
            ? edgeDistance * pitch
            : steepRise + (edgeDistance - mansardBreak) * Math.tan(radians(roof.pitch * 0.35)));
        }
        default:
          return baseElevation;
      }
    };
    const subdivisions = ['dome', 'cone', 'hip', 'mansard', 'shed', 'gable'].includes(roof.type) ? 5 : 1;
    const addPoint = point => {
      positions.push(
        point.x / SCALE,
        baseHeight(point) / SCALE,
        point.y / SCALE
      );
      return positions.length / 3 - 1;
    };
    const addTriangle = (a, b, c) => indices.push(a, b, c);

    for (let triangleIndex = 0; triangleIndex < triangles.length; triangleIndex += 3) {
      const a = allPoints[triangles[triangleIndex]];
      const b = allPoints[triangles[triangleIndex + 1]];
      const c = allPoints[triangles[triangleIndex + 2]];
      const grid = [];

      for (let row = 0; row <= subdivisions; row++) {
        grid[row] = [];
        for (let column = 0; column <= subdivisions - row; column++) {
          const u = row / subdivisions;
          const v = column / subdivisions;
          grid[row][column] = addPoint({
            x: a.x + (b.x - a.x) * u + (c.x - a.x) * v,
            y: a.y + (b.y - a.y) * u + (c.y - a.y) * v,
          });
        }
      }

      for (let row = 0; row < subdivisions; row++) {
        for (let column = 0; column < subdivisions - row; column++) {
          addTriangle(grid[row][column], grid[row + 1][column], grid[row][column + 1]);
          if (column < subdivisions - row - 1) {
            addTriangle(grid[row + 1][column], grid[row + 1][column + 1], grid[row][column + 1]);
          }
        }
      }
    }

    const topVertexCount = positions.length / 3;
    for (let index = 0; index < topVertexCount; index++) {
      const positionIndex = index * 3;
      positions.push(
        positions[positionIndex],
        positions[positionIndex + 1] - roof.thickness / SCALE,
        positions[positionIndex + 2]
      );
    }
    const topIndices = [...indices];
    for (let index = 0; index < topIndices.length; index += 3) {
      indices.push(
        topIndices[index + 2] + topVertexCount,
        topIndices[index + 1] + topVertexCount,
        topIndices[index] + topVertexCount
      );
    }

    rings.forEach(ring => {
      for (let index = 0; index < ring.length; index++) {
        const start = ring[index];
        const end = ring[(index + 1) % ring.length];
        const topStart = addPoint(start);
        const topEnd = addPoint(end);
        const bottomStart = positions.length / 3;
        positions.push(
          positions[topStart * 3],
          positions[topStart * 3 + 1] - roof.thickness / SCALE,
          positions[topStart * 3 + 2]
        );
        const bottomEnd = positions.length / 3;
        positions.push(
          positions[topEnd * 3],
          positions[topEnd * 3 + 1] - roof.thickness / SCALE,
          positions[topEnd * 3 + 2]
        );
        indices.push(topStart, bottomStart, topEnd, topEnd, bottomStart, bottomEnd);
      }
    });
  }

  if (!positions.length || !indices.length) return null;

  const mesh = new Mesh(`roof-${roof.id}`, scene);
  const vertexData = new VertexData();
  const normals = [];
  VertexData.ComputeNormals(positions, indices, normals);
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.applyToMesh(mesh, true);

  const material = new StandardMaterial(`roof-${buildingId}-${roof.id}-material`, scene);
  material.diffuseColor = Color3.FromHexString(FINISH_COLORS[roof.material] || FINISH_COLORS.shingles);
  material.backFaceCulling = false;
  mesh.material = material;
  mesh.metadata = {
    settlement: true,
    kind: 'building-roof',
    roofId: roof.id,
  };
  return mesh;
}