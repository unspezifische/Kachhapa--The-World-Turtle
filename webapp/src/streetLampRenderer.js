import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { FEET_PER_SCENE_UNIT } from './settlementEditor';

const unit = FEET_PER_SCENE_UNIT;

/** Instanced fixtures plus a bounded light pool; no light per city lamp. */
export function createStreetLampRenderer(scene, camera) {
  const fixtures = [];
  const makeFixture = (name, kind, color, emissive = false) => {
    const mesh = kind === 'pole'
      ? MeshBuilder.CreateCylinder(name, { height: 10 / unit, diameter: 0.6 / unit, tessellation: 6 }, scene)
      : kind === 'marker'
        ? MeshBuilder.CreateSphere(name, { diameter: 1 / unit, segments: 6 }, scene)
        : MeshBuilder.CreateBox(name, { width: 1.5 / unit, height: 2 / unit, depth: 1.5 / unit }, scene);
    const material = new StandardMaterial(`${name}-material`, scene);
    material.diffuseColor = Color3.FromHexString(color);
    material.specularColor = Color3.Black();
    material.maxSimultaneousLights = 12;
    if (emissive) {
      material.disableLighting = true;
      material.emissiveColor = new Color3(2.5, 1.5, 0.5);
    }
    mesh.material = material;
    mesh.isPickable = false;
    mesh.setEnabled(false);
    fixtures.push(mesh);
    return mesh;
  };
  const poles = makeFixture('street-lamp-poles', 'pole', '#453b31');
  const dark = makeFixture('street-lamp-unlit', 'lantern', '#6f6250');
  const broken = makeFixture('street-lamp-broken', 'lantern', '#302b25');
  const lit = makeFixture('street-lamp-lit', 'lantern', '#ffd08a', true);
  const marker = makeFixture('street-lamp-marker', 'marker', '#ffd08a', true);
  const pool = Array.from({ length: 8 }, (_, index) => {
    const light = new PointLight(`street-lamp-light-${index}`, Vector3.Zero(), scene);
    light.diffuse = new Color3(1, 0.66, 0.28);
    light.specular = Color3.Black();
    light.range = 65 / unit;
    light.intensity = 0;
    return { light, lampId: null, next: null };
  });
  let elapsed = 1;
  let signature = '';
  let visible = [];
  let configuredMaterialCount = -1;
  const buffer = (mesh, positions, scale = 1) => {
    mesh.setEnabled(positions.length > 0);
    if (!positions.length) return;
    const matrices = new Float32Array(positions.length * 16);
    positions.forEach((position, index) => Matrix.Scaling(scale, scale, scale)
      .multiply(Matrix.Translation(position.x, position.y, position.z)).copyToArray(matrices, index * 16));
    mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
    mesh.thinInstanceRefreshBoundingInfo();
  };
  return {
    update(state, bounds, delta) {
      elapsed += delta;
      if (elapsed >= 0.2) {
        elapsed = 0;
        visible = (state.lamps || []).filter(lamp => !bounds || (
          lamp.x >= bounds.minX && lamp.x <= bounds.maxX &&
          lamp.y >= bounds.minY && lamp.y <= bounds.maxY
        )).map(lamp => {
          const elevation = state.sampleTerrainHeight?.(lamp.x, lamp.y) ?? lamp.elevation ?? 0;
          return { ...lamp, position: new Vector3(lamp.x / unit, (elevation + 11) / unit, lamp.y / unit) };
        });
        const markerScale = camera.radius * unit > 1000
          ? Math.max(2, Math.round(camera.radius / 30)) : 0;
        const nextSignature = `${markerScale}:` + visible.map(lamp => `${lamp.id}:${lamp.position.y.toFixed(4)}:${lamp.x}:${lamp.y}:${lamp.lit}:${lamp.broken}`).join('|');
        if (signature !== nextSignature) {
          signature = nextSignature;
          buffer(poles, visible.map(lamp => new Vector3(
            lamp.position.x,
            lamp.position.y - 6 / unit,
            lamp.position.z
          )));
          const litPositions = visible.filter(lamp => lamp.lit && !lamp.broken).map(lamp => lamp.position);
          buffer(lit, litPositions);
          buffer(marker, markerScale ? litPositions : [], markerScale);
          buffer(dark, visible.filter(lamp => !lamp.lit && !lamp.broken).map(lamp => lamp.position));
          buffer(broken, visible.filter(lamp => lamp.broken).map(lamp => lamp.position));
        }
        // Select by camera proximity. At city scales only emissive markers remain.
        const nearby = camera.radius * unit <= 1000
          ? visible.filter(lamp => lamp.lit && !lamp.broken &&
              Vector3.DistanceSquared(lamp.position, camera.position) < (160 / unit) ** 2)
            .sort((a, b) => Vector3.DistanceSquared(a.position, camera.position) - Vector3.DistanceSquared(b.position, camera.position))
            .slice(0, 8)
          : [];
        const wanted = new Map(nearby.map(lamp => [lamp.id, lamp]));
        pool.forEach(slot => {
          slot.next = wanted.get(slot.lampId) || null;
          if (slot.next) wanted.delete(slot.lampId);
        });
        pool.filter(slot => !slot.next).forEach(slot => {
          const next = wanted.values().next().value;
          slot.next = next || null;
          if (next) wanted.delete(next.id);
        });
        if (configuredMaterialCount !== scene.materials.length) {
          configuredMaterialCount = scene.materials.length;
          scene.materials.forEach(material => {
            if ('maxSimultaneousLights' in material && material.maxSimultaneousLights !== 12) {
              material.maxSimultaneousLights = 12;
            }
          });
        }
      }
      const blend = 1 - Math.exp(-Math.min(delta, 0.1) * 6);
      pool.forEach(slot => {
        const sameLamp = slot.next && slot.lampId === slot.next.id;
        const target = sameLamp ? 2.2 : 0;
        slot.light.intensity += (target - slot.light.intensity) * blend;
        if (!sameLamp && slot.light.intensity < 0.02) {
          slot.lampId = slot.next?.id || null;
          if (slot.next) slot.light.position.copyFrom(slot.next.position);
        } else if (sameLamp) {
          slot.light.position.copyFrom(slot.next.position);
        }
      });
    },
    dispose() {
      fixtures.forEach(mesh => { mesh.material.dispose(); mesh.dispose(); });
      pool.forEach(slot => slot.light.dispose());
    },
  };
}
