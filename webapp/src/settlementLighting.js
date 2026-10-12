const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));


const finiteNumber = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback;

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};


export function calculateSettlementLighting({
  hour = 12,
  minute = 0,
  sunIntensity = 2.2,
  moonIntensity = 0.15,
  cloudCover = 0,
} = {}) {
  const safeHour = finiteNumber(hour, 12);
  const safeMinute = finiteNumber(minute, 0);
  const absoluteHour = safeHour + safeMinute / 60;
  const celestialAngle = ((absoluteHour - 6) / 24) * Math.PI * 2;
  const cosAngle = Math.cos(celestialAngle);
  const sinAngle = Math.sin(celestialAngle);

  const daylightStrength = Math.max(0, sinAngle);
  const nightStrength = Math.max(0, -sinAngle);
  const safeSunIntensity = Math.max(0, finiteNumber(sunIntensity, 2.2));
  const safeMoonIntensity = Math.max(0, finiteNumber(moonIntensity, 0.15));
  const safeCloudCover = clamp(finiteNumber(cloudCover, 0), 0, 1);
  const moonStrength = nightStrength * safeMoonIntensity;

  return {
    cosAngle,
    sinAngle,
    daylightStrength,
    nightStrength,
    moonStrength,
    sunIntensity:
      daylightStrength *
      safeSunIntensity *
      (1 - safeCloudCover * 0.45),
    // These share the same twilight baseline so crossing sunrise or sunset
    // cannot cause a one-frame jump between unrelated day/night values.
    ambientIntensity:
      0.35 +
      daylightStrength * 0.9 +
      moonStrength,
    topDownIntensity:
      0.18 +
      daylightStrength * 0.57 +
      moonStrength * 0.7,
  };
}
