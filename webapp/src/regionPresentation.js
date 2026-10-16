import earcut from 'earcut';

const COLORS = ['#dcac60', '#67b7c5', '#a28bce', '#72b98a', '#d8857c', '#a9b960', '#cc8fba'];
export function regionFillOpacity(mapView) {
  return mapView === 'districts' ? .4 : 0;
}
export function regionPresentation(region) {
  const points = (region?.points || []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (points.length < 3) return null;
  const indices = earcut(points.flatMap(p => [p.x, p.y]));
  if (!indices.length) return null;
  let area = 0, x = 0, y = 0, largest = null;
  for (let i = 0; i < indices.length; i += 3) {
    const a = points[indices[i]], b = points[indices[i + 1]], c = points[indices[i + 2]];
    const weight = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));
    const center = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
    x += center.x * weight; y += center.y * weight; area += weight;
    if (!largest || weight > largest.weight) largest = { ...center, weight };
  }
  const centroid = { x: x / area, y: y / area };
  let inside = false;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    if ((a.y > centroid.y) !== (b.y > centroid.y) && centroid.x < (b.x - a.x) * (centroid.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  });
  let hash = 0;
  for (const char of String(region.id || region.name || 'region')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { points, indices, center: inside ? centroid : { x: largest.x, y: largest.y },
    color: /^#[0-9a-f]{6}$/i.test(region.color || '') ? region.color : COLORS[hash % COLORS.length] };
}
export function snapRegionToNetworkNodes(point, roads = [], walls = [], tolerance = 20) {
  let result = { x: Math.round(point.x), y: Math.round(point.y) }, best = tolerance;
  [...roads, ...walls].filter(item => item && item.visible !== false).forEach(item => {
    (item.points || []).filter(Boolean).forEach(node => {
      const distance = Math.hypot(node.x - point.x, node.y - point.y);
      if (distance <= best) { best = distance; result = { x: node.x, y: node.y }; }
    });
  });
  return result;
}
