import { FEET_PER_SCENE_UNIT } from './settlementEditor';

export const FIRST_PERSON_LOOK_FEET = 1;

export function firstPersonTarget(eye, alpha, beta) {
  const distance = FIRST_PERSON_LOOK_FEET / FEET_PER_SCENE_UNIT;
  const horizontal = Math.sin(beta) * distance;
  return {
    x: eye.x - Math.cos(alpha) * horizontal,
    y: eye.y - Math.cos(beta) * distance,
    z: eye.z - Math.sin(alpha) * horizontal,
  };
}

export function firstPersonWalkSceneUnits(feetPerSecond, seconds) {
  const speed = Number(feetPerSecond);
  return (Number.isFinite(speed) && speed >= 0 ? speed : 8) * seconds / FEET_PER_SCENE_UNIT;
}
