export const OUTDOOR_AREA_TYPES = ['courtyard', 'garden', 'lawn', 'yard', 'walkway', 'plaza', 'terrace', 'pond', 'custom'];

export const OUTDOOR_AREA_DEFAULTS = {
  courtyard: { material: '#b6a994', walkable: true, activity_capabilities: ['socialize'] },
  garden: { material: '#567f42', walkable: true, activity_capabilities: ['rest'] },
  lawn: { material: '#76a45e', walkable: true, activity_capabilities: ['rest'] },
  yard: { material: '#8d795b', walkable: true, activity_capabilities: [] },
  walkway: { material: '#ada18b', walkable: true, activity_capabilities: ['pass_through'] },
  plaza: { material: '#b8ada1', walkable: true, activity_capabilities: ['socialize'] },
  terrace: { material: '#ad9d83', walkable: true, activity_capabilities: ['rest'] },
  pond: { material: '#4e83a8', walkable: false, activity_capabilities: [] },
  custom: { material: '#968b70', walkable: true, activity_capabilities: [] },
};

export function createBoundary(vertices, propertyId) {
  return {
    vertices: vertices.map(point => ({ x: point.x, y: point.y })),
    segments: vertices.map((_, index) => ({ id: `${propertyId}-edge-${index}`, treatment: 'none', openings: [] })),
  };
}

export function boundarySegmentEnds(boundary, index) {
  const vertices = boundary?.vertices || [];
  return [vertices[index], vertices[(index + 1) % vertices.length]];
}

export function boundarySegmentLength(boundary, index) {
  const [start, end] = boundarySegmentEnds(boundary, index);
  return start && end ? Math.hypot(end.x - start.x, end.y - start.y) : 0;
}

export function validateBoundaryOpening(boundary, index, opening, omitId = null) {
  const segment = boundary?.segments?.[index];
  if (!segment || segment.arc) return 'Openings on curved property segments are not supported yet.';
  const length = boundarySegmentLength(boundary, index);
  const start = Number(opening.offsetAlongSegment);
  const width = Number(opening.width);
  if (!Number.isFinite(start) || !Number.isFinite(width) || start < 0 || width <= 0 || start + width > length + 1e-6) {
    return 'Opening must fit within the selected segment.';
  }
  if ((segment.openings || []).some(other => other.id !== omitId &&
    start < Number(other.offsetAlongSegment) + Number(other.width) &&
    start + width > Number(other.offsetAlongSegment))) return 'Opening overlaps another opening.';
  return null;
}

export function solidBoundaryIntervals(boundary, index) {
  const length = boundarySegmentLength(boundary, index);
  const openings = [...(boundary?.segments?.[index]?.openings || [])]
    .sort((a, b) => Number(a.offsetAlongSegment) - Number(b.offsetAlongSegment));
  const result = [];
  let cursor = 0;
  openings.forEach(opening => {
    const start = Math.max(0, Math.min(length, Number(opening.offsetAlongSegment)));
    const end = Math.max(start, Math.min(length, start + Number(opening.width)));
    if (start > cursor) result.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  });
  if (cursor < length) result.push({ start: cursor, end: length });
  return result;
}

export function createOutdoorArea(propertyId, polygon, areaType = 'yard') {
  const type = OUTDOOR_AREA_DEFAULTS[areaType] ? areaType : 'custom';
  const defaults = OUTDOOR_AREA_DEFAULTS[type];
  return {
    id: `outdoor-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    property_id: propertyId,
    name: type[0].toUpperCase() + type.slice(1),
    polygon: polygon.map(point => ({ x: point.x, y: point.y })),
    area_type: type,
    material: defaults.material,
    elevation_mode: 'draped_on_terrain',
    elevation: 0,
    layering_priority: 0,
    walkable: defaults.walkable,
    activity_capabilities: [...defaults.activity_capabilities],
  };
}
