import { FEET_PER_SCENE_UNIT } from './settlementEditor';

const clamp = value => Math.max(0, Math.min(1, value));
const lerp = (from, to, amount) => from + (to - from) * amount;

export function calculateTerrainFog({ cameraRadius = 1, spanFeet = 1800, fogDensity = 0.01, visibleFarFeet = null } = {}) {
  const centerDistanceFeet = Math.max(1, Number(cameraRadius) || 1) * FEET_PER_SCENE_UNIT;
  const halfSpanFeet = Math.max(100, (Number(spanFeet) || 1800) * 0.48);
  const edgeDistanceFeet = visibleFarFeet > centerDistanceFeet
    ? visibleFarFeet : Math.hypot(centerDistanceFeet, halfSpanFeet);
  const availableFadeFeet = Math.max(100, edgeDistanceFeet - centerDistanceFeet);
  // Preserve the existing saved/preset density range as a user-facing haze
  // strength while using deterministic linear distances for edge concealment.
  const intensity = clamp(((Number(fogDensity) || 0.001) - 0.001) / 0.059);
  const startFraction = lerp(0.45, 0.08, intensity);
  const endFraction = lerp(0.94, 0.58, intensity);
  const startFeet = centerDistanceFeet + availableFadeFeet * startFraction;
  const endFeet = Math.max(startFeet + 50, centerDistanceFeet + availableFadeFeet * endFraction);
  const occlusionAt = distanceFeet => clamp((distanceFeet - startFeet) / (endFeet - startFeet));
  return {
    mode: 'linear',
    intensity,
    startFeet,
    endFeet,
    centerDistanceFeet,
    edgeDistanceFeet,
    centerOcclusion: occlusionAt(centerDistanceFeet),
    edgeOcclusion: occlusionAt(edgeDistanceFeet),
    midpointOcclusion: occlusionAt(centerDistanceFeet + availableFadeFeet / 2),
  };
}
