import {
  daylightColorGrade,
  moonOrbit,
  normalizeWeatherVisuals,
} from './settlementEnvironment';


describe('settlement environment helpers', () => {
  test('applies preset defaults while preserving advanced weather overrides', () => {
    expect(normalizeWeatherVisuals({
      activeWeather: 'pouring-rain',
      cloudBaseFeet: 900,
    })).toMatchObject({
      cloudType: 'nimbostratus',
      cloudBaseFeet: 900,
      cloudTopFeet: 6500,
      precipitationIntensity: 0.78,
    });
  });

  test('keeps cloud layers valid and clamps visual intensities', () => {
    expect(normalizeWeatherVisuals({
      cloudBaseFeet: 1000,
      cloudTopFeet: 500,
      precipitationIntensity: 4,
      cloudCover: -1,
    })).toMatchObject({
      cloudBaseFeet: 1000,
      cloudTopFeet: 1050,
      precipitationIntensity: 1,
      cloudCover: 0,
    });
  });

  test('only applies the authored saturation boost during daylight', () => {
    expect(daylightColorGrade(0, 1.25)).toEqual({ contrast: 1.02, saturation: 1 });
    expect(daylightColorGrade(1, 1.25)).toEqual({ contrast: 1.1, saturation: 1.25 });
  });

  test('places a full moon highest around midnight and a new moon around noon', () => {
    expect(moonOrbit({ hour: 0, phaseFraction: 0.5 }).altitude).toBeCloseTo(1);
    expect(moonOrbit({ hour: 12, phaseFraction: 0 }).altitude).toBeCloseTo(1);
  });
});
