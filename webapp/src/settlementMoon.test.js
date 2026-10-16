import { moonIllumination, moonLitPath, moonPhaseFraction, moonPhaseName, selectedMoon } from './settlementMoon';

test('selects Selûne and uses calendar illumination', () => {
  const moon = selectedMoon({ moons: [
    { name: 'Other', phase_fraction: 0.5 },
    { name: 'Selûne', phase_fraction: 0.25, illumination: 0.5 },
  ] });
  expect(moon.name).toBe('Selûne');
  expect(moonPhaseFraction(moon)).toBe(0.25);
  expect(moonIllumination(moon)).toBe(0.5);
  expect(selectedMoon({ moons: [] })).toBeNull();
  expect(moonPhaseName({ phase_fraction: 0.12 })).toBe('Waxing Crescent');
  expect(moonPhaseName({ phase_fraction: 0.5 })).toBe('Full Moon');
});

test('projected phase path has the correct terminator for new, quarters, full, and waning crescent', () => {
  const extent = phase => {
    const points = [...moonLitPath(phase).matchAll(/(-?\d+\.\d+) (-?\d+\.\d+)/g)]
      .map(match => [Number(match[1]), Number(match[2])])
      .filter(([, y]) => y === 0);
    return [Math.min(...points.map(([x]) => x)), Math.max(...points.map(([x]) => x))];
  };
  expect(extent(0)).toEqual([1, 1]);
  expect(extent(0.25)).toEqual([0, 1]);
  expect(extent(0.5)).toEqual([-1, 1]);
  expect(extent(0.75)).toEqual([-1, 0]);
  expect(extent(0.875)[1]).toBeLessThan(0);
});
