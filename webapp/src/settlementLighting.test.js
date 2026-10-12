import { calculateSettlementLighting } from './settlementLighting';


describe('calculateSettlementLighting', () => {
  test('keeps legacy weather settings without cloud cover lit at noon', () => {
    const lighting = calculateSettlementLighting({
      hour: 12,
      sunIntensity: 2.2,
      moonIntensity: 0.15,
    });

    expect(Number.isFinite(lighting.sunIntensity)).toBe(true);
    expect(lighting.sunIntensity).toBeCloseTo(2.2);
    expect(lighting.daylightStrength).toBeCloseTo(1);
    expect(lighting.nightStrength).toBeCloseTo(0);
  });

  test('makes noon brighter than midnight while retaining moonlight', () => {
    const noon = calculateSettlementLighting({ hour: 12 });
    const midnight = calculateSettlementLighting({ hour: 0 });

    expect(noon.sunIntensity).toBeGreaterThan(0);
    expect(midnight.sunIntensity).toBe(0);
    expect(midnight.moonStrength).toBeCloseTo(0.15);
    expect(noon.ambientIntensity).toBeGreaterThan(midnight.ambientIntensity);
    expect(midnight.ambientIntensity).toBeGreaterThan(0);
  });

  test.each([6, 18])('changes continuously around %i:00', boundaryHour => {
    const before = calculateSettlementLighting({
      hour: boundaryHour - 1,
      minute: 59.99,
    });
    const after = calculateSettlementLighting({
      hour: boundaryHour,
      minute: 0.01,
    });

    expect(Math.abs(before.ambientIntensity - after.ambientIntensity))
      .toBeLessThan(0.001);
    expect(Math.abs(before.topDownIntensity - after.topDownIntensity))
      .toBeLessThan(0.001);
  });

  test('honors a deliberately disabled moon glow', () => {
    const midnight = calculateSettlementLighting({
      hour: 0,
      moonIntensity: 0,
    });

    expect(midnight.moonStrength).toBe(0);
    expect(midnight.ambientIntensity).toBeCloseTo(0.35);
  });
});
