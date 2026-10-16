import { closestPointOnSegment2d } from './geometry2d';

export const FEET_PER_SCENE_UNIT = 50;


export const FALLBACK_ASSET_CATALOG = [
  {
    key: 'timber_cottage',
    name: 'Timber Cottage',
    category: 'residential',
    width_feet: 42,
    depth_feet: 32,
    height_feet: 28,
    color: '#b87742',
    roof_color: '#513a30',
    model_url: null,
    rooms: ['Common room', 'Kitchen', 'Bedroom', 'Pantry', 'Loft']
  },
  {
    key: 'stone_townhouse',
    name: 'Stone Townhouse',
    category: 'residential',
    width_feet: 36,
    depth_feet: 46,
    height_feet: 36,
    color: '#8f8373',
    roof_color: '#3d4650',
    model_url: null,
    rooms: [
      'Entry hall',
      'Parlor',
      'Kitchen',
      'Primary bedroom',
      'Bedroom',
      'Study',
      'Cellar'
    ]
  },
  {
    key: 'shop_house',
    name: 'Shop House',
    category: 'commercial',
    width_feet: 52,
    depth_feet: 40,
    height_feet: 32,
    color: '#a76d43',
    roof_color: '#4c352b',
    model_url: null,
    rooms: [
      'Shop floor',
      'Workshop',
      'Stockroom',
      'Kitchen',
      'Owner bedroom',
      'Cellar'
    ]
  },
  {
    key: 'coaching_inn',
    name: 'Coaching Inn',
    category: 'hospitality',
    width_feet: 88,
    depth_feet: 62,
    height_feet: 40,
    color: '#9a633b',
    roof_color: '#463128',
    model_url: null,
    rooms: [
      'Common room',
      'Taproom',
      'Kitchen',
      'Pantry',
      'Office',
      'Six guest rooms',
      'Stable',
      'Cellar'
    ]
  },
  {
    key: 'storehouse',
    name: 'Storehouse',
    category: 'industrial',
    width_feet: 64,
    depth_feet: 48,
    height_feet: 30,
    color: '#87603e',
    roof_color: '#3f342d',
    model_url: null,
    rooms: [
      'Receiving floor',
      'Main storage',
      'Secure cage',
      'Clerk office',
      'Loading bay'
    ]
  }
];


export function referenceLayerUv(layer, xFeet, yFeet) {
  const angle = (Number(layer?.rotation_degrees) || 0) * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const dx = xFeet - (Number(layer?.origin_x) || 0);
  const dy = yFeet - (Number(layer?.origin_y) || 0);

  const localX = dx * cos + dy * sin;
  // World north maps to the top edge of the source image. This is the
  // inverse rotation paired with the layer's world-space placement.
  const localY = -dx * sin + dy * cos;

  return {
    u: localX / Math.max(1, Number(layer?.width_feet) || 1) + 0.5,
    v: localY / Math.max(1, Number(layer?.height_feet) || 1) + 0.5
  };
}


export function calibrateReferenceLayer(
  layer,
  pointA,
  pointB,
  knownDistanceFeet
) {
  const measuredDistance = Math.hypot(
    pointB.x - pointA.x,
    pointB.y - pointA.y
  );

  const knownDistance = Number(knownDistanceFeet);

  if (
    !Number.isFinite(measuredDistance) ||
    measuredDistance <= 0 ||
    !Number.isFinite(knownDistance) ||
    knownDistance <= 0
  ) {
    return layer;
  }

  const scale = knownDistance / measuredDistance;
  const width = Math.max(1, Number(layer.width_feet) * scale);
  const height = Math.max(1, Number(layer.height_feet) * scale);

  return {
    ...layer,
    width_feet: width,
    height_feet: height,
    origin_x: pointA.x + ((Number(layer.origin_x) || 0) - pointA.x) * scale,
    origin_y: pointA.y + ((Number(layer.origin_y) || 0) - pointA.y) * scale,
    feet_per_pixel:
      width /
      Math.max(1, Number(layer.pixel_width) || 1),
    feet_per_pixel_x:
      width /
      Math.max(1, Number(layer.pixel_width) || 1),
    feet_per_pixel_y:
      height /
      Math.max(1, Number(layer.pixel_height) || 1)
  };
}


export function heightmapHeightAt(heightmap, x, y) {
  if (
    !heightmap?.values?.length ||
    !heightmap.grid_width ||
    !heightmap.grid_height
  ) {
    return 0;
  }

  const width = Math.max(1, Number(heightmap.width_feet) || 1);
  const height = Math.max(1, Number(heightmap.height_feet) || 1);

  const originX = Number.isFinite(heightmap.origin_x)
    ? heightmap.origin_x
    : 0;

  const originY = Number.isFinite(heightmap.origin_y)
    ? heightmap.origin_y
    : 0;


  // Terrain tiles are not image heightmaps. Their origin is the south-west
  // corner, rows increase with world Y, and values are already measured in feet.
  const hasTileCoordinates =
    heightmap.tile_x != null &&
    heightmap.tile_z != null &&
    Number.isFinite(Number(heightmap.tile_x)) &&
    Number.isFinite(Number(heightmap.tile_z));

  const isTerrainTile =
    heightmap.layer_type === 'heightmap_tile' ||
    hasTileCoordinates;


  if (isTerrainTile) {
    const u = (x - originX) / width;
    const v = (y - originY) / height;

    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;

    const gridWidth = Number(heightmap.grid_width);
    const gridHeight = Number(heightmap.grid_height);

    const gx = u * (gridWidth - 1);
    const gy = v * (gridHeight - 1);

    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);

    const x1 = Math.min(gridWidth - 1, x0 + 1);
    const y1 = Math.min(gridHeight - 1, y0 + 1);

    const sample = (column, row) =>
      Number(
        heightmap.values[
        row *
        gridWidth +
        column
        ]
      ) || 0;

    const lower =
      sample(x0, y0) +
      (
        sample(x1, y0) -
        sample(x0, y0)
      ) *
      (gx - x0);

    const upper =
      sample(x0, y1) +
      (
        sample(x1, y1) -
        sample(x0, y1)
      ) *
      (gx - x0);

    return lower + (upper - lower) * (gy - y0);
  }


  const u =
    (
      x -
      originX +
      width / 2
    ) /
    width;

  const v =
    1 -
    (
      y -
      originY +
      height / 2
    ) /
    height;

  if (u < 0 || u > 1 || v < 0 || v > 1) return 0;

  const gridWidth = Number(heightmap.grid_width);
  const gridHeight = Number(heightmap.grid_height);

  const gx = u * (gridWidth - 1);
  const gy = v * (gridHeight - 1);

  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);

  const x1 = Math.min(gridWidth - 1, x0 + 1);
  const y1 = Math.min(gridHeight - 1, y0 + 1);

  const sample = (column, row) =>
    (
      Number(
        heightmap.values[
        row *
        gridWidth +
        column
        ]
      ) ||
      0
    ) /
    255;

  const top =
    sample(x0, y0) +
    (
      sample(x1, y0) -
      sample(x0, y0)
    ) *
    (gx - x0);

  const bottom =
    sample(x0, y1) +
    (
      sample(x1, y1) -
      sample(x0, y1)
    ) *
    (gx - x0);

  const normalized =
    top +
    (bottom - top) *
    (gy - y0);

  const minimum = Number(heightmap.min_elevation_feet) || 0;

  const range =
    (Number(heightmap.max_elevation_feet) || 250) -
    minimum;

  const strength = Number(heightmap.strength ?? 1);
  const pivot = Number(heightmap.strength_pivot_feet) || 0;

  const elevation =
    minimum +
    normalized *
    range;

  return (
    pivot +
    (elevation - pivot) *
    (
      Number.isFinite(strength)
        ? strength
        : 1
    )
  );
}


const clampUnit = value => Math.max(0, Math.min(1, Number(value) || 0));
const softEdge = (distance, radius) => {
  const t = clampUnit((radius - distance) / Math.max(1, radius * 0.2));
  return t * t * (3 - 2 * t);
};

export function terrainStrokeBounds(stroke) {
  const radius = Math.max(1, Number(stroke.radius) || 1);
  const endX = stroke.mode === 'slope' ? Number(stroke.end_x) : Number(stroke.x);
  const endY = stroke.mode === 'slope' ? Number(stroke.end_y) : Number(stroke.y);
  return {
    minX: Math.min(Number(stroke.x), endX) - radius,
    maxX: Math.max(Number(stroke.x), endX) + radius,
    minY: Math.min(Number(stroke.y), endY) - radius,
    maxY: Math.max(Number(stroke.y), endY) + radius
  };
}

function neighborhoodHeight(sample, x, y, radius) {
  const step = Math.max(16, Math.min(96, radius * 0.3));
  const offsets = [[0, 0, 4], [1, 0, 2], [-1, 0, 2], [0, 1, 2], [0, -1, 2],
    [1, 1, 1], [1, -1, 1], [-1, 1, 1], [-1, -1, 1]];
  const weighted = offsets.reduce((sum, [dx, dy, weight]) => sum + sample(x + dx * step, y + dy * step) * weight, 0);
  return weighted / 16;
}

export function applyTerrainStrokeAt(height, stroke, x, y, frozenHeightAt) {
  const radius = Math.max(1, Number(stroke.radius) || 1);
  let distance = Math.hypot(x - Number(stroke.x), y - Number(stroke.y));
  let target = Number(stroke.target_elevation_feet);
  if (stroke.mode === 'slope') {
    const dx = Number(stroke.end_x) - Number(stroke.x);
    const dy = Number(stroke.end_y) - Number(stroke.y);
    const lengthSquared = dx * dx + dy * dy;
    if (!(lengthSquared > 0)) return height;
    const t = clampUnit(((x - stroke.x) * dx + (y - stroke.y) * dy) / lengthSquared);
    distance = Math.hypot(x - (stroke.x + t * dx), y - (stroke.y + t * dy));
    target = Number(stroke.start_elevation_feet) + t *
      (Number(stroke.end_elevation_feet) - Number(stroke.start_elevation_feet));
  }
  if (distance >= radius) return height;
  if (stroke.mode === 'set-elevation' || stroke.mode === 'slope') {
    return Number.isFinite(target) ? height + (target - height) * softEdge(distance, radius) : height;
  }
  const falloff = (1 - (distance / radius) ** 2) ** 2;
  if (stroke.mode === 'smooth' && stroke.smoothing_version === 2) {
    const average = neighborhoodHeight(frozenHeightAt, x, y, radius);
    return height + (average - height) * clampUnit(stroke.amount) * falloff;
  }
  if (stroke.mode === 'flatten' || stroke.mode === 'smooth') {
    return Number.isFinite(target) ? height + (target - height) * clampUnit(stroke.amount) * falloff : height;
  }
  return height + Number(stroke.delta || 0) * falloff;
}

export function terrainHeightAt(strokes, x, y, heightmap = null) {
  const base = (px, py) => heightmapHeightAt(heightmap, px, py);
  return (strokes || []).reduce((height, stroke) => applyTerrainStrokeAt(height, stroke, x, y, base), base(x, y));
}


export function createTerrainHeightSampler(
  strokes,
  heightmap = null,
  cellSizeFeet = 160
) {
  return createTerrainStrokeSampler(
    strokes,
    (x, y) => heightmapHeightAt(heightmap, x, y),
    cellSizeFeet
  );
}


/**
 * Spatially indexes strokes once and composes them over an arbitrary base.
 */
export function createTerrainStrokeSampler(
  strokes,
  getBaseHeight,
  cellSizeFeet = 160,
  getFrozenHeight = getBaseHeight
) {
  const cellSize = Math.max(
    16,
    Number(cellSizeFeet) || 160
  );

  const rows = new Map();

  (strokes || []).forEach(source => {
    const stroke = {
      ...source,
      x: Number(source.x),
      y: Number(source.y),
      radius: Math.max(1, Number(source.radius) || 1),
      delta: Number(source.delta || 0),
      target_elevation_feet:
        Number(source.target_elevation_feet),
      end_x: Number(source.end_x),
      end_y: Number(source.end_y),
      amount: Math.max(
        0,
        Math.min(
          1,
          Number(source.amount) || 0
        )
      )
    };

    const bounds = terrainStrokeBounds(stroke);
    const minColumn = Math.floor(bounds.minX / cellSize);
    const maxColumn = Math.floor(bounds.maxX / cellSize);
    const minRow = Math.floor(bounds.minY / cellSize);
    const maxRow = Math.floor(bounds.maxY / cellSize);

    for (let row = minRow; row <= maxRow; row += 1) {
      let columns = rows.get(row);

      if (!columns) {
        columns = new Map();
        rows.set(row, columns);
      }

      for (let column = minColumn; column <= maxColumn; column += 1) {
        let bucket = columns.get(column);

        if (!bucket) {
          bucket = [];
          columns.set(column, bucket);
        }

        bucket.push(stroke);
      }
    }
  });


  return (x, y) => {
    const candidates =
      rows
        .get(Math.floor(y / cellSize))
        ?.get(Math.floor(x / cellSize))
      ||
      [];

    return candidates.reduce((height, stroke) =>
      applyTerrainStrokeAt(height, stroke, x, y, getFrozenHeight), getBaseHeight(x, y));
  };
}


export function terrainSurfaceWeights(
  elevationFeet,
  normalY = 1,
  settings = {}
) {
  const clamp = value => Math.max(0, Math.min(1, value));

  const seaLevel = Number(settings.sea_level_feet) || 0;

  const snowLine =
    Number(
      settings.snow_line_feet ??
      900
    );

  const snowBlend = Math.max(
    50,
    Number(
      settings.snow_blend_feet ??
      500
    )
  );

  const cliffStart = Math.max(
    0.35,
    Math.min(
      0.98,
      Number(
        settings.cliff_normal_threshold ??
        0.86
      )
    )
  );

  const steepness = clamp(
    (
      cliffStart -
      normalY
    ) /
    Math.max(
      0.05,
      cliffStart -
      0.45
    )
  );

  const shoreDistance =
    elevationFeet -
    seaLevel;

  const sand =
    clamp(
      (18 - shoreDistance) /
      28
    ) *
    (1 - steepness * 0.9);

  const snow =
    clamp(
      (
        elevationFeet -
        snowLine
      ) /
      snowBlend
    ) *
    (1 - steepness * 0.58);

  const highRock =
    clamp(
      (
        elevationFeet -
        (
          snowLine -
          snowBlend *
          0.4
        )
      ) /
      (
        snowBlend *
        1.25
      )
    ) *
    (1 - snow * 0.7);

  const rock = clamp(
    steepness * 1.08 +
    highRock * 0.32
  );

  const dirt =
    clamp(
      steepness * 0.72 +
      sand * 0.18
    ) *
    (1 - rock * 0.45);

  const grass = clamp(
    1 -
    Math.max(sand, snow) -
    rock * 0.9 -
    dirt * 0.55
  );

  const total =
    sand +
    snow +
    rock +
    dirt +
    grass ||
    1;

  return {
    sand: sand / total,
    snow: snow / total,
    rock: rock / total,
    dirt: dirt / total,
    grass: grass / total
  };
}


export function waterFlowSpeed({
  width_feet = 30,
  depth_feet = 5,
  slope = 0
} = {}) {
  const constriction =
    Math.sqrt(
      30 /
      Math.max(
        6,
        Number(width_feet)
      )
    ) *
    Math.sqrt(
      5 /
      Math.max(
        1,
        Number(depth_feet)
      )
    );

  return Math.max(
    0.18,
    Math.min(
      3.5,
      0.42 *
      constriction +
      Math.max(
        0,
        Number(slope)
      ) *
      16
    )
  );
}


export function waterDepthAtSeaLevel(
  terrainElevationFeet,
  seaLevelFeet = 0
) {
  return (
    Number(seaLevelFeet) -
    Number(terrainElevationFeet)
  );
}


function projectToSegment(point, start, end) {
  const result = closestPointOnSegment2d(point, start, end);
  const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;

  return {
    point: result.point,
    distance: result.distance,
    tangent: {
      x: (end.x - start.x) / length,
      y: (end.y - start.y) / length
    },
    amount: result.t
  };
}


export function nearestRoadPoint(point, roads) {
  let nearest = null;

  (roads || []).forEach(road => {
    const points = road.points || [];

    const segmentCount = road.closed
      ? points.length
      : Math.max(
        0,
        points.length - 1
      );

    Array
      .from(
        { length: segmentCount },
        (_, index) => index
      )
      .forEach(index => {
        const start = points[index];
        const end = points[(index + 1) % points.length];

        const candidate = projectToSegment(
          point,
          start,
          end
        );

        if (!nearest || candidate.distance < nearest.distance) {
          const startWidth =
            Number(
              start.width_feet ??
              road.width_feet
            ) ||
            30;

          const endWidth =
            Number(
              end.width_feet ??
              road.width_feet
            ) ||
            30;

          nearest = {
            ...candidate,
            road,
            segmentIndex: index,
            width_feet:
              startWidth +
              (
                endWidth -
                startWidth
              ) *
              candidate.amount
          };
        }
      });
  });

  return nearest;
}
export function snapRegionBoundaryPoint(
  point,
  regions,
  roads,
  {
    regionId = null,
    pointIndex = null,
    tolerance = 80,
    fortifications = []
  } = {}
) {
  let best = {
    x: Math.round(point.x),
    y: Math.round(point.y)
  };

  let bestDistance = Number(tolerance) || 80;
  let neighboringVertexFound = false;

  (regions || []).forEach(region =>
    (region.points || []).forEach(candidate => {
      // An edited point may join a neighboring region, but must not collapse
      // onto a different vertex in its own polygon.
      if (region.id === regionId) return;

      const distance = Math.hypot(
        candidate.x - point.x,
        candidate.y - point.y
      );

      if (distance <= bestDistance) {
        best = {
          x: candidate.x,
          y: candidate.y
        };

        bestDistance = distance;
        neighboringVertexFound = true;
      }
    })
  );

  if (neighboringVertexFound) return best;

  const wallHit = nearestRoadPoint(
    point,
    (fortifications || []).filter(wall => wall.visible !== false)
  );

  if (wallHit && wallHit.distance <= tolerance) {
    return {
      x: Math.round(wallHit.point.x),
      y: Math.round(wallHit.point.y)
    };
  }

  const roadHit = nearestRoadPoint(
    point,
    (roads || []).filter(road => road.visible !== false)
  );

  if (roadHit && roadHit.distance <= bestDistance) {
    best = {
      x: Math.round(roadHit.point.x),
      y: Math.round(roadHit.point.y)
    };
  }

  return best;
}


export function snapRoadNetworkPoint(
  point,
  roads,
  {
    roadId = null,
    tolerance = 80
  } = {}
) {
  let best = {
    x: Math.round(point.x),
    y: Math.round(point.y),
    ...(point.width_feet != null
      ? { width_feet: point.width_feet }
      : {})
  };

  let bestDistance = Number(tolerance) || 80;

  (roads || []).forEach(road => {
    if (road.id === roadId) return;

    (road.points || []).forEach(candidate => {
      const distance = Math.hypot(
        candidate.x - point.x,
        candidate.y - point.y
      );

      if (distance <= bestDistance) {
        best = {
          ...best,
          x: candidate.x,
          y: candidate.y
        };

        bestDistance = distance;
      }
    });
  });

  return best;
}

/** Snap a wall control point to another wall's authored node.  This mirrors
 * road-network snapping while deliberately excluding the wall being edited. */
export function snapFortificationNetworkPoint(
  point,
  fortifications,
  { wallId = null, tolerance = 80 } = {}
) {
  let best = { ...point, x: Math.round(point.x), y: Math.round(point.y) };
  let bestDistance = Number(tolerance) || 80;

  (fortifications || []).forEach(wall => {
    if (wall.id === wallId || wall.visible === false) return;
    (wall.points || []).forEach(candidate => {
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance <= bestDistance) {
        best = { ...best, x: candidate.x, y: candidate.y };
        bestDistance = distance;
      }
    });
  });

  return best;
}


export function snapRoadSplineTranslation(
  points,
  roads,
  {
    roadId = null,
    tolerance = 80
  } = {}
) {
  let offset = null;
  let bestDistance = Number(tolerance) || 80;

  (points || []).forEach(point =>
    (roads || []).forEach(road => {
      if (road.id === roadId) return;

      (road.points || []).forEach(candidate => {
        const distance = Math.hypot(
          candidate.x - point.x,
          candidate.y - point.y
        );

        if (distance <= bestDistance) {
          offset = {
            x: candidate.x - point.x,
            y: candidate.y - point.y
          };

          bestDistance = distance;
        }
      });
    })
  );

  return (points || []).map(point => ({
    ...point,
    x: Math.round(point.x + (offset?.x || 0)),
    y: Math.round(point.y + (offset?.y || 0))
  }));
}


export function insertRoadControlPoint(road, point) {
  const points = road?.points || [];

  if (
    points.length < 2 ||
    !Number.isFinite(point?.x) ||
    !Number.isFinite(point?.y)
  ) {
    return road;
  }

  let insertAt = 1;
  let nearestDistance = Infinity;
  let nearestPoint = point;
  let widthFeet = Number(road.width_feet) || 30;
  let sourceSegmentIndex = 0;

  const segmentCount = road?.closed
    ? points.length
    : points.length - 1;

  Array.from(
    { length: segmentCount },
    (_, index) => index
  ).forEach(index => {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const candidate = projectToSegment(point, start, end);

    if (candidate.distance < nearestDistance) {
      nearestDistance = candidate.distance;
      insertAt = index + 1;
      nearestPoint = candidate.point;
      sourceSegmentIndex = index;

      const segmentWidth = Number(road.segments?.[index]?.width_feet);
      if (Number.isFinite(segmentWidth)) {
        widthFeet = segmentWidth;
        return;
      }

      const startWidth =
        Number(start.width_feet ?? road.width_feet) ||
        30;

      const endWidth =
        Number(end.width_feet ?? road.width_feet) ||
        30;

      const segmentLength = Math.hypot(
        end.x - start.x,
        end.y - start.y
      ) || 1;

      const amount =
        Math.hypot(
          candidate.point.x - start.x,
          candidate.point.y - start.y
        ) /
        segmentLength;

      widthFeet =
        startWidth +
        (endWidth - startWidth) *
        amount;
    }
  });

  const controlPoint = {
    x: Math.round(nearestPoint.x),
    y: Math.round(nearestPoint.y),
    width_feet: Math.round(widthFeet)
  };

  const segments = Array.isArray(road.segments)
    ? [
      ...road.segments.slice(0, sourceSegmentIndex),
      { ...road.segments[sourceSegmentIndex] },
      { ...road.segments[sourceSegmentIndex] },
      ...road.segments.slice(sourceSegmentIndex + 1)
    ]
    : undefined;

  return {
    ...road,
    ...(segments ? { segments } : {}),
    points: [
      ...points.slice(0, insertAt),
      controlPoint,
      ...points.slice(insertAt)
    ]
  };
}


export function insertOpenSplineControlPoint(item, point, pointProperties = {}) {
  const isWall = 'tower' in pointProperties || item?.wall_type || item?.feature_type === 'city_wall';
  if (isWall) item = normalizeWallTopology(item);
  const points = item?.points || [];

  if (
    points.length < 2 ||
    !Number.isFinite(point?.x) ||
    !Number.isFinite(point?.y)
  ) {
    return {
      item,
      index: null
    };
  }

  let insertAt = 1;
  let nearestDistance = Infinity;
  let nearestPoint = point;

  for (let index = 0; index < points.length - 1; index += 1) {
    const candidate = projectToSegment(
      point,
      points[index],
      points[index + 1]
    );

    if (candidate.distance < nearestDistance) {
      nearestDistance = candidate.distance;
      nearestPoint = candidate.point;
      insertAt = index + 1;
    }
  }

  const controlPoint = {
    x: Math.round(nearestPoint.x),
    y: Math.round(nearestPoint.y),
    ...pointProperties
  };
  if (isWall) controlPoint.point_id = `wall-point-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    item: {
      ...item,
      ...(isWall ? { segments: [
        ...item.segments.slice(0, insertAt - 1),
        item.segments[insertAt - 1],
        { ...item.segments[insertAt - 1], id: `${controlPoint.point_id}-segment` },
        ...item.segments.slice(insertAt)
      ] } : {}),
      points: [
        ...points.slice(0, insertAt),
        controlPoint,
        ...points.slice(insertAt)
      ]
    },
    index: insertAt
  };
}

export function insertClosedSplineControlPoint(item, point) {
  const points = item?.points || [];
  if (points.length < 3 || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
    return { item, index: null };
  }

  let insertAt = null;
  let nearestDistance = Infinity;
  let nearestPoint = point;
  for (let index = 0; index < points.length; index += 1) {
    const candidate = projectToSegment(point, points[index], points[(index + 1) % points.length]);
    if (candidate.distance < nearestDistance) {
      nearestDistance = candidate.distance;
      nearestPoint = candidate.point;
      insertAt = index + 1;
    }
  }

  return {
    item: { ...item, points: [
      ...points.slice(0, insertAt),
      { x: Math.round(nearestPoint.x), y: Math.round(nearestPoint.y) },
      ...points.slice(insertAt)
    ] },
    index: insertAt
  };
}


/**
 * Older saved walls inferred towers from point position. New edits persist the
 * role on each point, while this fallback keeps existing maps looking the same
 * until a point is explicitly changed.
 */
export function isFortificationTowerPoint(wall, index) {
  const points = wall?.points || [];
  const point = points[index];

  if (!point) return false;
  if (typeof point.tower === 'boolean') return point.tower;

  return (
    index === 0 ||
    index === points.length - 1 ||
    index % 2 === 0
  );
}

/** Freeze legacy inferred roles before topology changes.  Once a point has an
 * explicit role, inserting or deleting neighbours can never change it. */
export function materializeFortificationTowerRoles(wall) {
  if (!wall?.points?.length) return wall;
  return {
    ...wall,
    points: wall.points.map((point, index) => ({
      ...point,
      tower: isFortificationTowerPoint(wall, index)
    }))
  };
}


export function deleteSplineControlPoint(
  item,
  index,
  {
    protectEndpoints = true,
    minimumPoints = 2
  } = {}
) {
  const points = item?.points || [];

  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= points.length
  ) {
    return item;
  }

  if (points.length <= minimumPoints) return item;

  if (
    protectEndpoints &&
    (
      index === 0 ||
      index === points.length - 1
    )
  ) {
    return item;
  }

  const stableItem = item?.wall_type || item?.fortification || item?.feature_type === 'city_wall'
    ? normalizeWallTopology(item)
    : item;

  return {
    ...stableItem,
    ...(stableItem !== item ? {
      segments: stableItem.segments.filter((_, segmentIndex) => segmentIndex !== index),
      ...(stableItem.towers ? { towers: stableItem.towers.map(tower => tower.point_id === stableItem.points[index].point_id
        ? { ...tower, attachment_needs_repair: true } : tower) } : {})
    } : {}),
    points: stableItem.points.filter(
      (_, pointIndex) => pointIndex !== index
    )
  };
}


export function insertClosedBoundaryPoint(boundary, point) {
  const points = boundary?.points || [];

  if (
    points.length < 3 ||
    !Number.isFinite(point?.x) ||
    !Number.isFinite(point?.y)
  ) {
    return boundary;
  }

  let insertAt = 1;
  let nearestDistance = Infinity;

  points.forEach((start, index) => {
    const end = points[(index + 1) % points.length];
    const candidate = projectToSegment(point, start, end);

    if (candidate.distance < nearestDistance) {
      nearestDistance = candidate.distance;
      insertAt = index + 1;
    }
  });

  const controlPoint = {
    x: Math.round(point.x),
    y: Math.round(point.y)
  };

  return {
    ...boundary,
    points: [
      ...points.slice(0, insertAt),
      controlPoint,
      ...points.slice(insertAt)
    ]
  };
}


export function roadWidthAt(road, amount) {
  const points = road?.points || [];
  if (!points.length) return Number(road?.width_feet) || 30;

  const scaled =
    Math.max(0, Math.min(1, amount)) *
    Math.max(0, points.length - 1);

  const startIndex = Math.min(
    points.length - 1,
    Math.floor(scaled)
  );

  const endIndex = Math.min(
    points.length - 1,
    startIndex + 1
  );

  const fraction = scaled - startIndex;

  const segmentWidth = Number(road?.segments?.[startIndex]?.width_feet);
  if (Number.isFinite(segmentWidth)) return segmentWidth;

  const startWidth =
    Number(
      points[startIndex]?.width_feet ??
      road.width_feet
    ) ||
    30;

  const endWidth =
    Number(
      points[endIndex]?.width_feet ??
      road.width_feet
    ) ||
    30;

  return startWidth + (endWidth - startWidth) * fraction;
}

export function roadSegmentIndexAt(road, point) {
  return nearestRoadPoint(point, [road])?.segmentIndex ?? null;
}

export function updateRoadSegments(road, indexes, changes) {
  if (!road?.points?.length) return road;
  const selected = new Set(indexes || []);
  const segmentCount = road.closed ? road.points.length : Math.max(0, road.points.length - 1);
  const segments = Array.from({ length: segmentCount }, (_, index) => ({
    width_feet: Number(road.segments?.[index]?.width_feet ?? road.width_feet) || 30,
    surface_type: road.segments?.[index]?.surface_type || road.surface_type || 'dirt',
    ...(road.segments?.[index] || {}),
    ...(selected.has(index) ? changes : {})
  }));
  return { ...road, segments };
}

export function applyRoadClassDefaults(road, defaults) {
  if (!road) return road;
  const segmentCount = road.closed ? road.points?.length || 0 : Math.max(0, (road.points?.length || 0) - 1);
  const width_feet = defaults.width;
  const surface_type = defaults.surface;
  return updateRoadSegments({ ...road, width_feet, surface_type },
    Array.from({ length: segmentCount }, (_, index) => index),
    { width_feet, surface_type });
}

export function updateFortificationSegment(wall, index, changes) {
  wall = normalizeWallTopology(wall);
  if (!wall?.points?.length || !Number.isInteger(index)) return wall;
  const segmentCount = wall.closed ? wall.points.length : Math.max(0, wall.points.length - 1);
  if (index < 0 || index >= segmentCount) return wall;
  const segments = Array.from({ length: segmentCount }, (_, segmentIndex) => ({
    ...(wall.segments?.[segmentIndex] || {}),
    ...(segmentIndex === index ? changes : {})
  }));
  const endIndex = (index + 1) % wall.points.length;
  return {
    ...wall,
    segments,
    points: wall.points.map((point, pointIndex) =>
      changes.gate_type && (pointIndex === index || pointIndex === endIndex)
        ? { ...point, tower: true }
        : point)
  };
}

export function normalizeWallTopology(wall) {
  const points = (wall?.points || []).map((point, index) => ({ ...point,
    point_id: point.point_id || `${wall.id}-point-${index}`,
    tower: isFortificationTowerPoint(wall, index) }));
  const segments = points.slice(1).map((_, index) => ({
    ...wall.segments?.[index], id: wall.segments?.[index]?.id || `${wall.id}-segment-${index}`
  }));
  const towers = (wall.towers || []).map(tower => {
    const point = tower.point_id ? points.find(value => value.point_id === tower.point_id) : points[tower.point_index];
    const { point_index, ...rest } = tower;
    return { ...rest, point_id: point?.point_id || tower.point_id, attachment_needs_repair: !point };
  });
  return { ...wall, points, segments, ...(wall.towers ? { towers } : {}) };
}

export function attachedWallTower(wall, point, index) {
  return (wall.towers || []).find(tower => tower.point_id
    ? Boolean(point.point_id) && tower.point_id === point.point_id
    : tower.point_index === index);
}

export function wallSegmentProperties(wall, index) {
  const override = wall?.segments?.[index] || {};
  return {
    width_feet: Number(override.width_feet ?? wall?.width_feet) || 24,
    height_feet: Number(override.height_feet ?? wall?.height_feet) || 35,
    base_elevation_feet: Number(override.base_elevation_feet ?? wall?.base_elevation_feet) || 0,
    material: override.material || wall?.material || 'stone',
    battlements: override.battlements ?? wall?.battlements ?? true,
    walkway: override.walkway ?? wall?.walkway ?? false,
    walkway_width_feet: Number(override.walkway_width_feet ?? wall?.walkway_width_feet) || 8,
    foundation_depth_feet: Number(override.foundation_depth_feet ?? wall?.foundation_depth_feet) || 0,
    ...override
  };
}

export function restoreFortificationSegmentDefaults(wall, index) {
  if (!wall?.segments?.length || !Number.isInteger(index)) return wall;
  return { ...wall, segments: wall.segments.map((segment, segmentIndex) =>
    segmentIndex === index ? { id: segment.id } : segment) };
}


function normalizeAngle(value) {
  return Math.atan2(
    Math.sin(value),
    Math.cos(value)
  );
}


export function snapBuildingPlacement(
  candidate,
  buildings,
  roads,
  snapDistance = 18
) {
  let result = {
    ...candidate,
    front_road_id: null
  };

  const roadHit = nearestRoadPoint(candidate, roads);

  if (
    roadHit &&
    roadHit.distance <=
    (
      roadHit.width_feet / 2 +
      candidate.depth_feet / 2 +
      snapDistance
    )
  ) {
    const normal = {
      x: -roadHit.tangent.y,
      y: roadHit.tangent.x
    };

    const side =
      (
        (
          candidate.x -
          roadHit.point.x
        ) *
        normal.x +
        (
          candidate.y -
          roadHit.point.y
        ) *
        normal.y
      ) >= 0
        ? 1
        : -1;

    const setback =
      roadHit.width_feet / 2 +
      candidate.depth_feet / 2;

    result = {
      ...result,
      x: roadHit.point.x + normal.x * side * setback,
      y: roadHit.point.y + normal.y * side * setback,
      rotation:
        Math.atan2(
          roadHit.tangent.y,
          roadHit.tangent.x
        ) +
        (side > 0 ? Math.PI : 0),
      front_road_id: roadHit.road.id
    };
  }

  const aligned = (buildings || []).filter(building =>
    building.id !== result.id &&
    normalizeAngle(building.rotation - result.rotation) < 0.08 &&
    normalizeAngle(building.rotation - result.rotation) > -0.08 &&
    building.front_road_id === result.front_road_id
  );

  const tangent = {
    x: Math.cos(result.rotation),
    y: Math.sin(result.rotation)
  };

  const normal = {
    x: -tangent.y,
    y: tangent.x
  };

  aligned.forEach(building => {
    const dx = result.x - building.x;
    const dy = result.y - building.y;

    const along =
      dx * tangent.x +
      dy * tangent.y;

    const across =
      dx * normal.x +
      dy * normal.y;

    const edgeDistance =
      (
        result.width_feet +
        building.width_feet
      ) /
      2;

    if (
      Math.abs(across) < snapDistance &&
      Math.abs(
        Math.abs(along) -
        edgeDistance
      ) < snapDistance
    ) {
      const direction = along >= 0 ? 1 : -1;

      result = {
        ...result,
        x:
          building.x +
          tangent.x *
          edgeDistance *
          direction,
        y:
          building.y +
          tangent.y *
          edgeDistance *
          direction
      };
    }
  });

  return result;
}


// =====================================================
// Functions for placing and editing blueprint buildings
// =====================================================

export function createBuilding(asset, point, buildings, roads) {
  const candidate = {
    id: `building-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    asset_key: asset.key,
    name: asset.name,
    x: point.x,
    y: point.y,
    elevation: 0,
    elevation_mode: 'relative_to_terrain',
    rotation: 0,
    width_feet: asset.width_feet,
    depth_feet: asset.depth_feet,
    rooms: [...(asset.rooms || [])],
    front_road_id: null
  };

  return snapBuildingPlacement(
    candidate,
    buildings,
    roads
  );
}


export function generateDefaultFloorplan(asset, point) {
  const w = asset.width_feet || 40;
  const d = asset.depth_feet || 30;
  const h = asset.height_feet || 12;

  // Create a rectangular footprint centered on the placement point.
  const corners = [
    { x: point.x - w / 2, y: point.y - d / 2 },
    { x: point.x + w / 2, y: point.y - d / 2 },
    { x: point.x + w / 2, y: point.y + d / 2 },
    { x: point.x - w / 2, y: point.y + d / 2 },
    { x: point.x - w / 2, y: point.y - d / 2 }
  ];

  // Wall indices: 0=left, 1=bottom, 2=right, 3=top.
  const doors = [
    {
      wall_index: 1,
      distance_from_start: w / 2,
      width: 4,
      height: 7
    }
  ];

  const windows = [
    {
      wall_index: 0,
      distance_from_start: d / 2,
      width: 3,
      height: 4,
      height_from_floor: 3
    },
    {
      wall_index: 2,
      distance_from_start: d / 2,
      width: 3,
      height: 4,
      height_from_floor: 3
    }
  ];

  return {
    floor_height: h,
    corners,
    doors,
    windows,
    stairs: [],
    hatches: []
  };
}


export function createBlueprintBuilding(point) {
  return {
    id: `building-${Date.now()}`,
    name: 'Custom Blueprint Building',
    x: point.x,
    y: point.y,
    elevation: 0,
    elevation_mode: 'relative_to_terrain',
    rotation: 0,
    is_blueprint: true,
    coordinate_space: 'local',
    show_roofs: true,
    roofs: [],
    width_feet: 1,
    depth_feet: 1,
    levels: [
      {
        floor_height: 10,
        id: 'ground',
        name: 'Ground floor',
        elevation_feet: 0,
        corners: [{ x: 0, y: 0 }],
        doors: [],
        windows: [],
        stairs: [],
        hatches: []
      }
    ]
  };
}


export function addBlueprintCorner(building, point) {
  const corners = [
    ...building.levels[0].corners,
    {
      x: point.x - building.x,
      y: point.y - building.y
    }
  ];

  return {
    ...building,
    width_feet: Math.max(
      1,
      Math.max(...corners.map(point => point.x)) -
      Math.min(...corners.map(point => point.x))
    ),
    depth_feet: Math.max(
      1,
      Math.max(...corners.map(point => point.y)) -
      Math.min(...corners.map(point => point.y))
    ),
    levels: building.levels.map(
      (level, index) =>
        index
          ? level
          : {
            ...level,
            corners
          }
    )
  };
}


export function closeBlueprintFootprint(building) {
  return {
    ...building,
    levels: building.levels.map(level => ({
      ...level,
      closed: level.corners.length >= 3,
      ...(level.outline?.length && Math.hypot(level.outline[level.outline.length - 1].end.x - level.outline[0].start.x, level.outline[level.outline.length - 1].end.y - level.outline[0].start.y) > 0.001 ? { outline: [...level.outline, { id: `${building.id}-closing-edge`, type: 'line', start: level.outline[level.outline.length - 1].end, end: level.outline[0].start, thickness: 0.5 }] } : {}),
    }))
  };
}


/**
 * Resizes a building by moving one corner while keeping the opposite corner
 * anchored.
 */
export function resizeBuildingFromCorner(
  building,
  newCornerPosition,
  cornerOffset,
  roads = []
) {
  const {
    x,
    y,
    width_feet,
    depth_feet
  } = building;

  const halfWidth = width_feet / 2;
  const halfDepth = depth_feet / 2;

  const cornerX = x + cornerOffset.x * halfWidth;
  const cornerY = y + cornerOffset.y * halfDepth;

  const dx = newCornerPosition.x - cornerX;
  const dy = newCornerPosition.y - cornerY;

  let newWidth = width_feet;
  let newDepth = depth_feet;
  let newX = x;
  let newY = y;

  if (cornerOffset.x > 0) newWidth += dx;
  else newWidth -= dx;

  if (cornerOffset.y > 0) newDepth += dy;
  else newDepth -= dy;

  newWidth = Math.max(10, newWidth);
  newDepth = Math.max(10, newDepth);

  const anchoredX = x - cornerOffset.x * halfWidth;
  const anchoredY = y - cornerOffset.y * halfDepth;

  newX = anchoredX + cornerOffset.x * newWidth / 2;
  newY = anchoredY + cornerOffset.y * newDepth / 2;

  if (building.front_road_id && roads.length > 0) {
    return snapBuildingPlacement(
      {
        ...building,
        x: newX,
        y: newY,
        width_feet: newWidth,
        depth_feet: newDepth
      },
      [],
      roads
    );
  }

  return {
    ...building,
    x: newX,
    y: newY,
    width_feet: newWidth,
    depth_feet: newDepth
  };
}
