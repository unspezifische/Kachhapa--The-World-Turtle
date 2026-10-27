import {
  Color3,
  Mesh,
  StandardMaterial,
  VertexData,
} from '@babylonjs/core';

import earcut from 'earcut';
import { closestPointOnSegment2d } from './geometry2d';

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
  return closestPointOnSegment2d(point, start, end).distance;
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
    const rings = sourceRings.map((ring, index) =>
      offsetRing(ring, roof.overhang, index > 0)
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
    const roofTopBase = baseElevation + roof.thickness;
    const baseHeight = (point) => {
      const x = point.x - centerX;
      const y = point.y - centerY;

      switch (roof.type) {
        case 'shed': {
          const projection = x * slope.x + y * slope.y;
          return roofTopBase + (projection + slopeHalfWidth) * pitch;
        }
        case 'gable':
          return roofTopBase + Math.max(0, ridgeHalfWidth - Math.abs(x * across.x + y * across.y)) * pitch;
        case 'hip': {
          const edgeDistance = rings.reduce((minimum, ring) =>
            Math.min(minimum, ...ring.map((start, index) =>
              distanceToSegment(point, start, ring[(index + 1) % ring.length])
            )),
          Infinity);
          return roofTopBase + edgeDistance * pitch;
        }
        case 'dome': {
          const radial = Math.min(1, Math.hypot(x, y) / radius);
          return roofTopBase + radius * pitch * Math.sqrt(Math.max(0, 1 - radial * radial));
        }
        case 'cone':
          return roofTopBase + Math.max(0, 1 - Math.hypot(x, y) / radius) * radius * pitch;
        case 'mansard': {
          const edgeDistance = rings.reduce((minimum, ring) =>
            Math.min(minimum, ...ring.map((start, index) =>
              distanceToSegment(point, start, ring[(index + 1) % ring.length])
            )),
          Infinity);
          const steepRise = mansardBreak * pitch;
          return roofTopBase + (edgeDistance <= mansardBreak
            ? edgeDistance * pitch
            : steepRise + (edgeDistance - mansardBreak) * Math.tan(radians(roof.pitch * 0.35)));
        }
        default:
          return roofTopBase;
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

    // Close the space between supporting walls and the sloping roof. Sample
    // each footprint edge so gable ends and curved profiles do not leave
    // triangular openings above the exterior walls.
    sourceRings.forEach(ring => {
      for (let edge = 0; edge < ring.length; edge++) {
        const start = ring[edge];
        const end = ring[(edge + 1) % ring.length];
        const segments = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 2));
        for (let segment = 0; segment < segments; segment++) {
          const first = segment / segments;
          const second = (segment + 1) / segments;
          const a = { x: start.x + (end.x - start.x) * first,
            y: start.y + (end.y - start.y) * first };
          const b = { x: start.x + (end.x - start.x) * second,
            y: start.y + (end.y - start.y) * second };
          const topA = Math.max(baseElevation, baseHeight(a) - roof.thickness);
          const topB = Math.max(baseElevation, baseHeight(b) - roof.thickness);
          if (topA <= baseElevation && topB <= baseElevation) continue;
          const offset = positions.length / 3;
          positions.push(a.x / SCALE, baseElevation / SCALE, a.y / SCALE,
            b.x / SCALE, baseElevation / SCALE, b.y / SCALE,
            a.x / SCALE, topA / SCALE, a.y / SCALE,
            b.x / SCALE, topB / SCALE, b.y / SCALE);
          indices.push(offset, offset + 1, offset + 2,
            offset + 1, offset + 3, offset + 2);
        }
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
