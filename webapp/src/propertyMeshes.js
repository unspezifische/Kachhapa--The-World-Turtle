import { Color3, Mesh, MeshBuilder, StandardMaterial, Vector3, VertexData } from '@babylonjs/core';
import earcut from 'earcut';
import { FEET_PER_SCENE_UNIT as SCALE } from './settlementEditor';
import { boundarySegmentEnds, boundarySegmentLength, solidBoundaryIntervals } from './propertyGeometry';
import { drapedOutdoorTriangles, visibleOutdoorAreas } from './outdoorSurface';

const COLOR = { wall: '#938875', fence: '#666963', hedge: '#50713f' };

const materialFor = (scene, id, color) => {
  const material = new StandardMaterial(id, scene);
  try { material.diffuseColor = Color3.FromHexString(color); }
  catch { material.diffuseColor = Color3.FromHexString('#938875'); }
  material.backFaceCulling = false;
  return material;
};

export function createPropertyMeshes(scene, properties, sampleHeight, editing = false, selection = {}) {
  const result = [];
  const materials = [];
  let layerOrder = 0;
  (properties || []).forEach(property => {
    const boundary = property.boundary;
    boundary?.segments?.forEach((segment, index) => {
      const [start, end] = boundarySegmentEnds(boundary, index);
      if (!start || !end) return;
      const length = boundarySegmentLength(boundary, index);
      if (length < 0.01) return;
      const dx = (end.x - start.x) / length;
      const dz = (end.y - start.y) / length;
      const physical = !['none', 'linked_structure_wall'].includes(segment.treatment || 'none');
      const height = Number(segment.height) > 0 ? Number(segment.height) : 8;
      const thickness = Number(segment.thickness) > 0 ? Number(segment.thickness) : 1;
      const color = segment.material?.startsWith?.('#') ? segment.material : COLOR[segment.treatment] || COLOR.wall;
      const selectedSegment = selection.segmentId === segment.id;
      const material = physical ? materialFor(scene, `boundary-material-${segment.id}`, selectedSegment ? '#ffe08a' : color) : null;
      if (material) materials.push(material);
      const makeRun = (from, to, runHeight = height, bottom = 0, runMaterial = material, opening = null) => {
        if (to - from < 0.01) return;
        const offset = (from + to) / 2;
        const x = start.x + dx * offset;
        const y = start.y + dz * offset;
        const mesh = MeshBuilder.CreateBox(`boundary-${segment.id}-${from}`, {
          width: (to - from) / SCALE,
          height: runHeight / SCALE,
          depth: thickness / SCALE,
        }, scene);
        mesh.position.set(x / SCALE, (sampleHeight(x, y) + bottom + runHeight / 2) / SCALE, y / SCALE);
        mesh.rotation.y = -Math.atan2(dz, dx);
        mesh.material = runMaterial;
        mesh.metadata = opening
          ? { kind: 'property-boundary-opening', propertyId: property.id, segmentId: segment.id, openingId: opening.id }
          : { kind: 'property-boundary', propertyId: property.id, segmentId: segment.id };
        result.push(mesh);
      };
      if (physical) {
        solidBoundaryIntervals(boundary, index).forEach(run => makeRun(run.start, run.end));
        (segment.openings || []).forEach(opening => {
          const from = Number(opening.offsetAlongSegment) || 0;
          const to = from + (Number(opening.width) || 0);
          if (to > length || from < 0 || to <= from) return;
          if (opening.opening_kind === 'archway') {
            const peak = Math.min(height - 0.25, Number(opening.height) || 7);
            const radius = Math.min((to - from) / 2, peak);
            const spring = peak - radius;
            const slices = Math.max(6, Math.ceil((to - from) / 0.5));
            for (let slice = 0; slice < slices; slice += 1) {
              const left = from + (to - from) * slice / slices;
              const right = from + (to - from) * (slice + 1) / slices;
              const normalized = (2 * ((left + right) / 2 - from) / (to - from)) - 1;
              const clearance = spring + radius * Math.sqrt(Math.max(0, 1 - normalized * normalized));
              makeRun(left, right, height - clearance, clearance);
            }
          } else if (opening.opening_kind === 'door') {
            const clearance = Math.min(height - 0.5, Number(opening.height) || 7);
            makeRun(from, to, height - clearance, clearance);
          }
          if (['gate', 'door'].includes(opening.opening_kind) && opening.state !== 'open') {
            const panel = materialFor(scene, `gate-material-${opening.id}`, selection.openingId === opening.id
              ? '#ff6b62'
              : opening.panel_style === 'wrought_iron' ? '#41484b' : '#775039');
            materials.push(panel);
            const panelHeight = Math.min(height, Number(opening.height) || 7);
            if (opening.panel_style === 'wrought_iron') {
              const barWidth = Math.min(0.16, (to - from) / 20);
              const barCount = Math.max(2, Math.ceil((to - from) / 0.8));
              for (let bar = 0; bar <= barCount; bar += 1) {
                const center = from + (to - from) * bar / barCount;
                makeRun(Math.max(from, center - barWidth / 2), Math.min(to, center + barWidth / 2), panelHeight, 0, panel, opening);
              }
              makeRun(from, to, 0.16, Math.max(0, panelHeight * 0.22), panel, opening);
              makeRun(from, to, 0.16, Math.max(0, panelHeight * 0.78), panel, opening);
            } else if (opening.leaf_configuration === 'double') {
              const middle = (from + to) / 2;
              makeRun(from, middle - 0.04, panelHeight, 0, panel, opening);
              makeRun(middle + 0.04, to, panelHeight, 0, panel, opening);
            } else {
              makeRun(from, to, panelHeight, 0, panel, opening);
            }
          }
          if (editing) {
            const center = (from + to) / 2;
            const handleX = start.x + dx * center;
            const handleY = start.y + dz * center;
            const handle = MeshBuilder.CreateBox(`boundary-opening-handle-${opening.id}`, {
              width: Math.min(2, Math.max(1, to - from)) / SCALE,
              height: 2 / SCALE,
              depth: Math.max(1.5, thickness + 0.5) / SCALE,
            }, scene);
            handle.position.set(handleX / SCALE, (sampleHeight(handleX, handleY) + 1) / SCALE, handleY / SCALE);
            handle.rotation.y = -Math.atan2(dz, dx);
            const handleMaterial = materialFor(scene, `boundary-opening-handle-material-${opening.id}`,
              selection.openingId === opening.id ? '#ff6b62' : '#ffe08a');
            handleMaterial.alpha = selection.openingId === opening.id ? 0.9 : 0.55;
            materials.push(handleMaterial);
            handle.material = handleMaterial;
            handle.metadata = { kind: 'property-boundary-opening', propertyId: property.id,
              segmentId: segment.id, openingId: opening.id };
            result.push(handle);
          }
        });
      } else if (editing) {
        const line = MeshBuilder.CreateLines(`property-line-${segment.id}`, {
          points: [start, end].map(point => new Vector3(
            point.x / SCALE,
            (sampleHeight(point.x, point.y) + 0.25) / SCALE,
            point.y / SCALE,
          )),
        }, scene);
        line.color = Color3.FromHexString(selectedSegment ? '#ffe08a' : '#ff2d2d');
        line.isPickable = true;
        line.metadata = { kind: 'property-boundary', propertyId: property.id, segmentId: segment.id };
        result.push(line);
      }
    });
    visibleOutdoorAreas(property.outdoor_areas || []).forEach(({ area, polygons }) => {
      layerOrder += 1;
      polygons.forEach((polygon, polygonIndex) => {
        const rings = polygon.map(ring => ring.slice(0, -1));
        const points = rings.flat();
        const flat = points.flat();
        const holes = [];
        let offset = rings[0]?.length || 0;
        for (let index = 1; index < rings.length; index += 1) {
          holes.push(offset);
          offset += rings[index].length;
        }
        const triangulation = earcut(flat, holes);
        if (!triangulation.length) return;
        const priority = Math.max(-100, Math.min(100, Number(area.layering_priority) || 0));
        const draped = drapedOutdoorTriangles(points, triangulation, sampleHeight, area,
          0.12 + priority * 0.02 + layerOrder * 0.002);
        const positions = draped.positions.map(value => value / SCALE);
        const mesh = new Mesh(`outdoor-${area.id}-${polygonIndex}`, scene);
        const data = new VertexData();
        data.positions = positions;
        data.indices = draped.indices;
        data.normals = [];
        VertexData.ComputeNormals(positions, draped.indices, data.normals);
        data.applyToMesh(mesh);
        const material = materialFor(scene, `outdoor-material-${area.id}-${polygonIndex}`, area.material || '#8d795b');
        material.zOffset = -(priority + layerOrder / 1000);
        materials.push(material);
        mesh.material = material;
        mesh.metadata = { kind: 'outdoor-area', propertyId: property.id, outdoorAreaId: area.id };
        result.push(mesh);
      });
    });
  });
  return { meshes: result, dispose: () => { result.forEach(mesh => mesh.dispose()); materials.forEach(material => material.dispose()); } };
}
