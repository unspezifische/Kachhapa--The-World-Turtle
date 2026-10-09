export const radiusToSlider = radius => radius <= 1000 ? (radius - 30) / 970 * 70 : 70 + (radius - 1000) / 1400 * 30;
export const sliderToRadius = value => value <= 70
  ? Math.max(30, Math.round((30 + value / 70 * 970) / 10) * 10)
  : Math.min(2400, 1000 + Math.round((value - 70) / 30 * 7) * 200);
export const radiusMarks = Array.from({ length: 8 }, (_, i) => ({ value: radiusToSlider(1000 + i * 200), label: i === 0 || i === 7 ? String(1000 + i * 200) : undefined }));
export const radiusStops = [...Array.from({ length: 97 }, (_, i) => ({ value: radiusToSlider(30 + i * 10) })), ...radiusMarks];
