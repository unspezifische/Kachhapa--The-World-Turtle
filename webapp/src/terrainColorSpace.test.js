import { terrainMaterialWithLinearColor } from './settlementBabylon';
import terrain from '../public/materials/terrainMaterial.json';

test('all terrain base-color textures decode sRGB before reference blending and lighting', () => {
  const corrected = terrainMaterialWithLinearColor(terrain);
  const colorTextures = corrected.blocks.filter(block => block.customType === 'BABYLON.TextureBlock');
  expect(colorTextures.map(block => block.name)).toEqual(expect.arrayContaining([
    'refTexture', 'Grass Texture', 'Sand Texture', 'Snow Texture', 'Rock Texture'
  ]));
  expect(colorTextures.every(block => block.convertToLinearSpace && !block.convertToGammaSpace)).toBe(true);
  expect(terrain.blocks.find(block => block.name === 'refTexture').convertToLinearSpace).toBe(false);
  // Do not gamma-encode the lighting result a second time before the existing
  // image-processing pipeline applies its output transform.
  expect(corrected.blocks.find(block => block.customType === 'BABYLON.FragmentOutputBlock'))
    .toEqual(terrain.blocks.find(block => block.customType === 'BABYLON.FragmentOutputBlock'));
});

test('color-space correction leaves normal and scalar maps outside baseColor untouched', () => {
  const graph = { blocks: [
    { id: 1, customType: 'BABYLON.PBRMetallicRoughnessBlock', inputs: [
      { name: 'baseColor', targetBlockId: 2 }, { name: 'perturbedNormal', targetBlockId: 3 },
      { name: 'roughness', targetBlockId: 4 }
    ] },
    { id: 2, customType: 'BABYLON.TextureBlock', convertToLinearSpace: false },
    { id: 3, customType: 'BABYLON.TextureBlock', convertToLinearSpace: false },
    { id: 4, customType: 'BABYLON.TextureBlock', convertToLinearSpace: false }
  ] };
  const corrected = terrainMaterialWithLinearColor(graph);
  expect(corrected.blocks[1].convertToLinearSpace).toBe(true);
  expect(corrected.blocks[2]).toEqual(graph.blocks[2]);
  expect(corrected.blocks[3]).toEqual(graph.blocks[3]);
});
