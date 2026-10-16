const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, Number(value) || 0));


export const WEATHER_VISUAL_PRESETS = {
  clear: {
    cloudType: 'fair-cumulus',
    cloudBaseFeet: 4200,
    cloudTopFeet: 7200,
    windDirectionDegrees: 245,
    windSpeedMph: 8,
    precipitationIntensity: 0,
  },
  'light-drizzle': {
    cloudType: 'stratus',
    cloudBaseFeet: 1800,
    cloudTopFeet: 4300,
    windDirectionDegrees: 235,
    windSpeedMph: 12,
    precipitationIntensity: 0.32,
  },
  'pouring-rain': {
    cloudType: 'nimbostratus',
    cloudBaseFeet: 1200,
    cloudTopFeet: 6500,
    windDirectionDegrees: 225,
    windSpeedMph: 18,
    precipitationIntensity: 0.78,
  },
  foggy: {
    cloudType: 'ground-fog',
    cloudBaseFeet: 0,
    cloudTopFeet: 220,
    windDirectionDegrees: 250,
    windSpeedMph: 3,
    precipitationIntensity: 0,
  },
  snowing: {
    cloudType: 'nimbostratus',
    cloudBaseFeet: 1600,
    cloudTopFeet: 6200,
    windDirectionDegrees: 220,
    windSpeedMph: 10,
    precipitationIntensity: 0.58,
  },
  thunderstorm: {
    cloudType: 'cumulonimbus',
    cloudBaseFeet: 1100,
    cloudTopFeet: 22000,
    windDirectionDegrees: 210,
    windSpeedMph: 28,
    precipitationIntensity: 1,
  },
};


export function normalizeWeatherVisuals(settings = {}) {
  const preset = WEATHER_VISUAL_PRESETS[settings.activeWeather] ||
    WEATHER_VISUAL_PRESETS.clear;
  const base = Math.max(0, Number(settings.cloudBaseFeet ?? preset.cloudBaseFeet) || 0);
  const top = Math.max(base + 50, Number(settings.cloudTopFeet ?? preset.cloudTopFeet) || 0);

  return {
    ...preset,
    ...settings,
    cloudBaseFeet: base,
    cloudTopFeet: top,
    cloudCover: clamp(settings.cloudCover ?? 0, 0, 1),
    windDirectionDegrees: ((Number(settings.windDirectionDegrees ?? preset.windDirectionDegrees) || 0) % 360 + 360) % 360,
    windSpeedMph: clamp(settings.windSpeedMph ?? preset.windSpeedMph, 0, 120),
    precipitationIntensity: clamp(
      settings.precipitationIntensity ?? preset.precipitationIntensity,
      0,
      1
    ),
  };
}


export function daylightColorGrade(daylightStrength, saturation = 1.12) {
  const daylight = clamp(daylightStrength, 0, 1);
  const requestedSaturation = clamp(saturation, 0.7, 1.5);

  return {
    contrast: 1.02 + daylight * 0.08,
    saturation: 1 + (requestedSaturation - 1) * daylight,
  };
}


export function moonOrbit({ hour = 0, minute = 0, phaseFraction = 0.5 } = {}) {
  const time = ((Number(hour) || 0) + (Number(minute) || 0) / 60) / 24;
  const phase = ((Number(phaseFraction) || 0) % 1 + 1) % 1;
  const angle = (time - phase - 0.25) * Math.PI * 2;

  return {
    angle,
    altitude: Math.sin(angle),
    azimuthX: Math.cos(angle),
    azimuthZ: Math.sin((phase + 0.125) * Math.PI * 2) * 0.35,
  };
}

