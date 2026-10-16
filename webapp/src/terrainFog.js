import { FEET_PER_SCENE_UNIT } from './settlementEditor';

const clamp = value => Math.max(0, Math.min(1, value));
const lerp = (from, to, amount) => from + (to - from) * amount;

export function calculateTerrainFog({
  cameraRadius = 1,
  cameraBeta = Math.PI / 2,
  spanFeet = 1800,
  fogDensity = 0.01,
  visibleFarFeet = null,
} = {}) {
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
  const beta = Math.max(0, Math.min(Math.PI / 2, Number(cameraBeta) || 0));
  const topDownAmount = clamp((0.5 - beta) / 0.42);
  const altitudeFeet = centerDistanceFeet * Math.cos(beta);
  const highAltitudeAmount = clamp((altitudeFeet - 6000) / 18000);
  // Looking almost straight down has very little atmosphere between the
  // camera and terrain. Bring the edge haze back gradually at atlas heights.
  const topDownRelief = topDownAmount * (1 - highAltitudeAmount);
  const fogStartFeet = centerDistanceFeet + availableFadeFeet * startFraction;
  const fogEndFeet = Math.max(fogStartFeet + 50, centerDistanceFeet + availableFadeFeet * endFraction);
  const startFeet = lerp(fogStartFeet, edgeDistanceFeet * 1.03, topDownRelief);
  const endFeet = Math.max(startFeet + 50, lerp(fogEndFeet, edgeDistanceFeet * 1.18, topDownRelief));
  const occlusionAt = distanceFeet => clamp((distanceFeet - startFeet) / (endFeet - startFeet));
  return {
    mode: 'linear',
    intensity,
    altitudeFeet,
    topDownRelief,
    startFeet,
    endFeet,
    centerDistanceFeet,
    edgeDistanceFeet,
    centerOcclusion: occlusionAt(centerDistanceFeet),
    edgeOcclusion: occlusionAt(edgeDistanceFeet),
    midpointOcclusion: occlusionAt(centerDistanceFeet + availableFadeFeet / 2),
  };
}
