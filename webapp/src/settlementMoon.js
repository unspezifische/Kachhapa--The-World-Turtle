const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function selectedMoon(celestial) {
  const moons = celestial?.moons;
  if (!Array.isArray(moons) || !moons.length) return null;
  return moons.find(moon => moon.name === 'Selûne') || moons[0];
}

export function moonPhaseFraction(moon) {
  const value = Number(moon?.phase_fraction);
  return Number.isFinite(value) ? ((value % 1) + 1) % 1 : 0;
}

export function moonIllumination(moon) {
  if (!moon) return 0;
  const supplied = Number(moon.illumination);
  if (Number.isFinite(supplied)) return clamp(supplied, 0, 1);
  return (1 - Math.cos(moonPhaseFraction(moon) * 2 * Math.PI)) / 2;
}

export function moonPhaseName(moon) {
  const phase = moonPhaseFraction(moon);
  if (phase < 1 / 16 || phase >= 15 / 16) return 'New Moon';
  if (phase < 3 / 16) return 'Waxing Crescent';
  if (phase < 5 / 16) return 'First Quarter';
  if (phase < 7 / 16) return 'Waxing Gibbous';
  if (phase < 9 / 16) return 'Full Moon';
  if (phase < 11 / 16) return 'Waning Gibbous';
  if (phase < 13 / 16) return 'Last Quarter';
  return 'Waning Crescent';
}

// Project the sunlit hemisphere onto the visible lunar disc. The terminator
// is an ellipse whose width is cos(phase angle), not a shifted oval.
export function moonLitPath(phaseFraction, cx = 0, cy = 0, radius = 1) {
  const phase = ((Number(phaseFraction) || 0) % 1 + 1) % 1;
  const waxing = phase <= 0.5;
  const terminator = (waxing ? 1 : -1) * Math.cos(phase * Math.PI * 2);
  const edge = (y, left) => {
    const extent = Math.sqrt(Math.max(0, 1 - y * y));
    const x = left ? (waxing ? terminator * extent : -extent)
      : (waxing ? extent : terminator * extent);
    return `${(cx + x * radius).toFixed(3)} ${(cy + y * radius).toFixed(3)}`;
  };
  const points = [];
  for (let step = 0; step <= 48; step += 1) points.push(edge(-1 + step / 24, false));
  for (let step = 48; step >= 0; step -= 1) points.push(edge(-1 + step / 24, true));
  return `M ${points.join(' L ')} Z`;
}
