import { NullEngine, Scene } from '@babylonjs/core';
import { createPropertyMeshes } from './propertyMeshes';

test('property mesh keeps ownership line independent of gate cutout and outdoor surface', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const property = { id: 'estate', boundary: {
    vertices: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }],
    segments: [
      { id: 'south', treatment: 'wall', openings: [{ id: 'gate', opening_kind: 'gate', offsetAlongSegment: 7, width: 6, state: 'open' }] },
      { id: 'east', treatment: 'none', openings: [] },
      { id: 'north', treatment: 'none', openings: [] },
      { id: 'west', treatment: 'none', openings: [] },
    ],
  }, outdoor_areas: [{ id: 'garden', polygon: [{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 2, y: 6 }], material: '#567f42' }] };
  const rendered = createPropertyMeshes(scene, [property], () => 0, true);
  expect(rendered.meshes.filter(mesh => mesh.metadata?.segmentId === 'south')).toHaveLength(2);
  expect(rendered.meshes.some(mesh => mesh.metadata?.outdoorAreaId === 'garden')).toBe(true);
  expect(rendered.meshes.some(mesh => mesh.name === 'property-line-east')).toBe(true);
  rendered.dispose();
  scene.dispose();
  engine.dispose();
});

test('closed iron gate has grille bars while an arch keeps a curved clear opening', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const property = { id: 'estate', boundary: {
    vertices: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 0, y: 20 }],
    segments: [
      { id: 'south', treatment: 'wall', height: 12, openings: [
        { id: 'iron', opening_kind: 'gate', panel_style: 'wrought_iron', leaf_configuration: 'double', offsetAlongSegment: 3, width: 6, height: 8, state: 'closed' },
        { id: 'arch', opening_kind: 'archway', offsetAlongSegment: 15, width: 8, height: 9 },
      ] },
      { id: 'east', treatment: 'none' }, { id: 'north', treatment: 'none' }, { id: 'west', treatment: 'none' },
    ],
  } };
  const rendered = createPropertyMeshes(scene, [property], () => 0);
  const south = rendered.meshes.filter(mesh => mesh.metadata?.segmentId === 'south');
  expect(south.length).toBeGreaterThan(20);
  expect(south.some(mesh => mesh.position.y > 0.03 && mesh.getBoundingInfo().boundingBox.extendSize.y < 0.01)).toBe(true);
  const archRuns = south.filter(mesh => {
    const offset = Number(mesh.name.slice('boundary-south-'.length));
    return offset >= 15 && offset < 23;
  });
  expect(archRuns.length).toBeGreaterThan(4);
  expect(new Set(archRuns.map(mesh => mesh.position.y.toFixed(2))).size).toBeGreaterThan(2);
  rendered.dispose();
  scene.dispose();
  engine.dispose();
});
