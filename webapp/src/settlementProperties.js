// Building records remain the physical structure records. Properties own only
// parcel metadata and stable references to those existing IDs.
export const PROPERTY_SCHEMA_VERSION = 1;

const newId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function structurePointToWorld(building, point) {
  const rotation = Number(building.rotation) || 0;
  const x = Number(point.x) || 0;
  const y = Number(point.y) || 0;
  return {
    x: (Number(building.x) || 0) + x * Math.cos(rotation) - y * Math.sin(rotation),
    y: (Number(building.y) || 0) + x * Math.sin(rotation) + y * Math.cos(rotation),
  };
}

export function structureWorldElevation(building, terrainFeet = 0, floorFeet = 0) {
  const datum = building?.elevation_mode === 'fixed_world' ? 0 : (Number(terrainFeet) || 0);
  return datum + (Number(building?.elevation) || 0) + (Number(floorFeet) || 0);
}

export function footprintBoundary(building) {
  const corners = building?.levels?.find(level => level.elevation_feet === 0)?.corners;
  const points = Array.isArray(corners) && corners.length >= 3
    ? corners.map(point => building.coordinate_space === 'local' ? structurePointToWorld(building, point) : { x: point.x, y: point.y })
    : [
      { x: -(Number(building.width_feet) || 1) / 2, y: -(Number(building.depth_feet) || 1) / 2 },
      { x: (Number(building.width_feet) || 1) / 2, y: -(Number(building.depth_feet) || 1) / 2 },
      { x: (Number(building.width_feet) || 1) / 2, y: (Number(building.depth_feet) || 1) / 2 },
      { x: -(Number(building.width_feet) || 1) / 2, y: (Number(building.depth_feet) || 1) / 2 },
    ].map(point => structurePointToWorld(building, point));
  if (points.length > 1 && points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y) points.pop();
  return {
    vertices: points,
    segments: points.map((_, index) => ({ id: `boundary-${building.id}-${index}`, treatment: 'none', openings: [] })),
  };
}

export function propertyForBuilding(building) {
  return {
    id: `property-for-${building.id}`,
    name: building.name || 'Unnamed Property',
    structure_ids: [building.id],
    primary_structure_id: building.id,
    boundary: footprintBoundary(building),
    outdoor_areas: [],
    schema_version: PROPERTY_SCHEMA_VERSION,
  };
}

export function normalizePropertyCatalog(buildings = [], savedProperties = []) {
  const known = new Set(buildings.map(building => String(building.id)));
  const claimed = new Set();
  const properties = (Array.isArray(savedProperties) ? savedProperties : []).map(property => {
    // Keep invalid saved references visible so validation can report them.
    // Dropping them here would silently alter an estate on the next save.
    const structure_ids = Array.isArray(property.structure_ids) ? property.structure_ids : [];
    structure_ids.forEach(id => { if (known.has(String(id))) claimed.add(String(id)); });
    return {
      ...property,
      structure_ids,
      outdoor_areas: Array.isArray(property.outdoor_areas) ? property.outdoor_areas : [],
      schema_version: property.schema_version || PROPERTY_SCHEMA_VERSION,
    };
  });
  buildings.forEach(building => {
    if (!claimed.has(String(building.id))) properties.push(propertyForBuilding(building));
  });
  return properties;
}

export function createProperty(name = 'New Property') {
  return { id: newId('property'), name, structure_ids: [], boundary: null, outdoor_areas: [], schema_version: PROPERTY_SCHEMA_VERSION };
}

export function addStructureToProperty(properties, propertyId, structureId) {
  return properties.map(property => property.id === propertyId
    ? { ...property, structure_ids: [...new Set([...(property.structure_ids || []), structureId])], primary_structure_id: property.primary_structure_id || structureId }
    : removeStructureFromProperties([property], structureId)[0]);
}

export function removeStructureFromProperties(properties, structureId) {
  return properties.map(property => {
    const structure_ids = (property.structure_ids || []).filter(id => id !== structureId);
    return { ...property, structure_ids, primary_structure_id: property.primary_structure_id === structureId ? structure_ids[0] : property.primary_structure_id };
  });
}

export function deletePropertyKeepingBuildings(properties, propertyId, buildings) {
  const deleted = properties.find(property => property.id === propertyId);
  const remaining = properties.filter(property => property.id !== propertyId);
  (deleted?.structure_ids || []).forEach(id => {
    const building = buildings.find(item => String(item.id) === String(id));
    if (!building) return;
    const wrapper = propertyForBuilding(building);
    // A deleted legacy wrapper must not be recreated with the same identity.
    if (wrapper.id === propertyId || remaining.some(property => property.id === wrapper.id)) wrapper.id = newId('property');
    remaining.push(wrapper);
  });
  return remaining;
}
