import { radiusToSlider, sliderToRadius, radiusMarks } from './brushRadius';
test('brush slider reserves most travel for fine control and snaps the upper range', () => {
  expect(radiusToSlider(1000)).toBe(70);
  for (let r = 30; r <= 1000; r += 10) expect(sliderToRadius(radiusToSlider(r))).toBe(r);
  expect(radiusMarks.map(m => sliderToRadius(m.value))).toEqual([1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400]);
  expect(radiusToSlider(1375)).toBeGreaterThan(radiusToSlider(1200));
  expect(radiusToSlider(1375)).toBeLessThan(radiusToSlider(1400));
});
