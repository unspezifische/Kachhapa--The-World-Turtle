import polygonClipping from 'polygon-clipping';

let blueprintSequence = 0;

export const blueprintId = () =>
  `plan-${Date.now()}-${(++blueprintSequence).toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export const DEFAULT_EXTERIOR_WALL_THICKNESS = 2;
export const DEFAULT_INTERIOR_WALL_THICKNESS = 0.5;
export const BLUEPRINT_ROOF_TYPES = [
  'flat',
  'shed',
  'gable',
  'hip',
  'dome',
  'cone',
  'mansard',
  'custom',
];

const ROOF_FINISHES = [
  'shingles',
  'slate',
  'tile',
  'metal',
  'wood',
  'stone',
];

const TAU = Math.PI * 2;

const positiveAngle = value => {
  let result = value % TAU;
  if (result < 0) result += TAU;
  return result;
};

const pointDistance = (a, b) =>
  Math.hypot(b.x - a.x, b.y - a.y);

const normalizeVector = (x, y) => {
  const length = Math.hypot(x, y) || 1;

  return {
    x: x / length,
    y: y / length,
  };
};

const shiftPoint = (point, building) =>
  building.coordinate_space === 'local'
    ? { ...point }
    : {
      ...point,
      x: point.x - building.x,
      y: point.y - building.y,
    };

export function pointInPolygon(point, polygon) {
  let inside = false;

  for (
    let i = 0, j = polygon.length - 1;
    i < polygon.length;
    j = i++
  ) {
    const a = polygon[i];
    const b = polygon[j];

    if (
      (a.y > point.y) !== (b.y > point.y) &&
      point.x <
      ((b.x - a.x) * (point.y - a.y)) /
      (b.y - a.y) +
      a.x
    ) {
      inside = !inside;
    }
  }

  return inside;
}

/* -------------------------------------------------------------------------- */
/* Walls                                                                       */
/* -------------------------------------------------------------------------- */

export function arcGeometry(wall) {
  if (wall.type !== 'arc' || !wall.center) return null;

  const radius = pointDistance(wall.center, wall.start);

  if (radius < 0.001) return null;

  const startAngle = Math.atan2(
    wall.start.y - wall.center.y,
    wall.start.x - wall.center.x
  );

  const endAngle = Math.atan2(
    wall.end.y - wall.center.y,
    wall.end.x - wall.center.x
  );

  let sweep;

  if (wall.clockwise) {
    sweep = -positiveAngle(startAngle - endAngle);
  } else {
    sweep = positiveAngle(endAngle - startAngle);
  }

  if (Math.abs(sweep) < 0.0001) {
    sweep = wall.clockwise ? -TAU : TAU;
  }

  return {
    radius,
    startAngle,
    endAngle,
    sweep,
  };
}

export function wallLength(wall) {
  if (wall.type === 'arc') {
    const arc = arcGeometry(wall);

    if (arc) {
      return Math.abs(arc.sweep * arc.radius);
    }
  }

  return pointDistance(wall.start, wall.end);
}

export function wallPointAtDistance(wall, distance) {
  const length = wallLength(wall);

  if (length < 0.001) {
    return { ...wall.start };
  }

  const clamped =
    Math.max(
      0,
      Math.min(length, distance)
    );

  const t = clamped / length;

  if (wall.type === 'arc') {
    const arc = arcGeometry(wall);

    if (arc) {
      const angle =
        arc.startAngle +
        arc.sweep * t;

      return {
        x:
          wall.center.x +
          Math.cos(angle) * arc.radius,

        y:
          wall.center.y +
          Math.sin(angle) * arc.radius,
      };
    }
  }

  return {
    x:
      wall.start.x +
      (wall.end.x - wall.start.x) * t,

    y:
      wall.start.y +
      (wall.end.y - wall.start.y) * t,
  };
}

export function wallTangentAtDistance(wall, distance) {
  if (wall.type === 'arc') {
    const arc = arcGeometry(wall);

    if (arc) {
      const length = wallLength(wall);

      const t =
        length > 0
          ? Math.max(
            0,
            Math.min(
              1,
              distance / length
            )
          )
          : 0;

      const angle =
        arc.startAngle +
        arc.sweep * t;

      const direction =
        Math.sign(arc.sweep) || 1;

      return {
        x:
          -Math.sin(angle) *
          direction,

        y:
          Math.cos(angle) *
          direction,
      };
    }
  }

  return normalizeVector(
    wall.end.x - wall.start.x,
    wall.end.y - wall.start.y
  );
}

export function wallPolyline(
  wall,
  maxSegmentLength = 1
) {
  const length = wallLength(wall);

  if (
    wall.type !== 'arc' ||
    !arcGeometry(wall)
  ) {
    return [
      { ...wall.start },
      { ...wall.end },
    ];
  }

  const steps =
    Math.max(
      4,
      Math.ceil(
        length /
        maxSegmentLength
      )
    );

  return Array.from(
    { length: steps + 1 },
    (_, i) =>
      wallPointAtDistance(
        wall,
        length * i / steps
      )
  );
}

export function arcFromThreePoints(
  start,
  end,
  through,
  properties = {}
) {
  const ax = start.x;
  const ay = start.y;

  const bx = end.x;
  const by = end.y;

  const cx = through.x;
  const cy = through.y;

  const denominator =
    2 *
    (
      ax * (by - cy) +
      bx * (cy - ay) +
      cx * (ay - by)
    );

  if (Math.abs(denominator) < 0.0001) {
    return null;
  }

  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;

  const center = {
    x:
      (
        a2 * (by - cy) +
        b2 * (cy - ay) +
        c2 * (ay - by)
      ) /
      denominator,

    y:
      (
        a2 * (cx - bx) +
        b2 * (ax - cx) +
        c2 * (bx - ax)
      ) /
      denominator,
  };

  const startAngle =
    positiveAngle(
      Math.atan2(
        start.y - center.y,
        start.x - center.x
      )
    );

  const endAngle =
    positiveAngle(
      Math.atan2(
        end.y - center.y,
        end.x - center.x
      )
    );

  const throughAngle =
    positiveAngle(
      Math.atan2(
        through.y - center.y,
        through.x - center.x
      )
    );

  const ccwSweep =
    positiveAngle(
      endAngle - startAngle
    );

  const ccwToThrough =
    positiveAngle(
      throughAngle - startAngle
    );

  return {
    ...properties,

    type: 'arc',

    start:
      { ...start },

    end:
      { ...end },

    through:
      { ...through },

    center,

    clockwise:
      ccwToThrough >
      ccwSweep,
  };
}

function normalizeWall(
  wall,
  fallbackId,
  defaultThickness,
  building
) {
  const result = {
    ...wall,

    id:
      wall.id ||
      fallbackId,

    type:
      wall.type === 'arc'
        ? 'arc'
        : 'line',

    start:
      shiftPoint(
        wall.start,
        building
      ),

    end:
      shiftPoint(
        wall.end,
        building
      ),

    thickness:
      Number(wall.thickness) > 0
        ? Number(wall.thickness)
        : defaultThickness,
  };

  if (
    result.type === 'arc' &&
    wall.center
  ) {
    result.center =
      shiftPoint(
        wall.center,
        building
      );

    result.clockwise =
      wall.clockwise === true;

    if (wall.through) {
      result.through = shiftPoint(wall.through, building);
    }
  }

  return result;
}

export function blueprintWalls(level) {
  return [
    ...(level.outline || []),
    ...(level.walls || []),
  ];
}

export function openCorners(level) {
  if (
    level.outline &&
    level.outline.length
  ) {
    const points = [];

    level.outline.forEach(
      (wall, wallIndex) => {
        const sampled =
          wallPolyline(wall, 1);

        sampled.forEach(
          (point, pointIndex) => {
            if (
              wallIndex > 0 &&
              pointIndex === 0
            ) {
              return;
            }

            points.push(point);
          }
        );
      }
    );

    if (
      points.length > 1 &&
      pointDistance(
        points[0],
        points[
        points.length - 1
        ]
      ) < 0.001
    ) {
      points.pop();
    }

    return points;
  }

  const points =
    level.corners || [];

  const last =
    points[
    points.length - 1
    ];

  return (
    points.length > 1 &&
    points[0].x === last.x &&
    points[0].y === last.y
  )
    ? points.slice(0, -1)
    : points;
}

export function exposedRoofFootprints(lowerLevel, upperLevel) {
  const lower = openCorners(lowerLevel);
  const upper = openCorners(upperLevel);

  if (lower.length < 3 || upper.length < 3) return [];

  const closeRing = points => [
    ...points.map(point => [point.x, point.y]),
    [points[0].x, points[0].y],
  ];

  return polygonClipping
    .difference(
      [[closeRing(lower)]],
      [[closeRing(upper)]]
    )
    .flatMap(polygon => {
      const [outer, ...holes] = polygon;
      const toPoints = ring => ring.slice(0, -1).map(([x, y]) => ({ x, y }));

      if (!outer || outer.length < 4) return [];

      return [{
        footprint: toPoints(outer),
        holes: holes.map(toPoints),
      }];
    });
}

export function normalizeRoof(roof, building, levels = building.levels || []) {
  const support = levels.find(
    level => level.id === roof.support_level_id
  ) || levels[0];
  const defaultVisibility = support
    ? levelAbove({ levels }, support) || support
    : null;
  const visibility = levels.find(
    level => level.id === roof.visibility_level_id
  ) || defaultVisibility;
  const normalizeRing = ring => (ring || [])
    .map(point => shiftPoint(point, building))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  const pitch = Number(roof.pitch);

  return {
    ...roof,
    id: roof.id || blueprintId(),
    type: BLUEPRINT_ROOF_TYPES.includes(roof.type) ? roof.type : 'gable',
    support_level_id: support?.id || '',
    visibility_level_id: visibility?.id || support?.id || '',
    footprint: normalizeRing(roof.footprint || roof.points),
    holes: (roof.holes || []).map(normalizeRing),
    pitch: Math.max(0, Math.min(80, Number.isFinite(pitch) ? pitch : 30)),
    overhang: Math.max(0, Number(roof.overhang) || 0),
    thickness: Math.max(0.1, Number(roof.thickness) || 0.5),
    elevation_offset: Number(roof.elevation_offset) || 0,
    material: ROOF_FINISHES.includes(roof.material) ? roof.material : 'shingles',
    ridge_direction: Number(roof.ridge_direction) || 0,
    slope_direction: Number(roof.slope_direction) || 0,
    rotation: Number(roof.rotation) || 0,
    mansard_break: Math.max(0.1, Number(roof.mansard_break) || 3),
    custom_vertices: (roof.custom_vertices || []).map(vertex => ({
      ...shiftPoint(vertex, building),
      elevation: Number(vertex.elevation) || 0,
    })),
    custom_faces: (roof.custom_faces || []).map(face => [...face]),
  };
}

export function isRoofVisible(building, roof) {
  if (building.show_roofs === false) return false;

  const visibilityLevel = building.levels?.find(
    level => level.id === roof.visibility_level_id
  );
  const selectedLevel = building.levels?.find(
    level => level.id === building.visible_level_id
  ) || building.levels?.[0];

  if (!visibilityLevel) return false;
  if (building.level_view === 'level') {
    return visibilityLevel.id === selectedLevel?.id;
  }
  if (building.level_view === 'through') {
    return visibilityLevel.elevation_feet <= selectedLevel?.elevation_feet;
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/* Stairs                                                                      */
/* -------------------------------------------------------------------------- */

export function normalizeStair(
  stair,
  floorHeight = 10,
  defaultExteriorRise = floorHeight
) {
  const shape =
    ['straight', 'landing', 'curve']
      .includes(stair.shape)
      ? stair.shape
      : 'straight';

  const material =
    ['interior', 'wooden-exterior', 'stone-exterior']
      .includes(stair.material)
      ? stair.material
      : 'interior';

  return {
    ...stair,

    id:
      stair.id ||
      blueprintId(),

    shape,

    start_x:
      Number(stair.start_x) || 0,

    start_y:
      Number(stair.start_y) || 0,

    width:
      Math.max(
        1,
        Number(stair.width) || 3
      ),

    total_rise_feet:
      Math.max(
        0.5,
        Number.isFinite(Number(stair.total_rise_feet))
          ? Number(stair.total_rise_feet)
          : material === 'interior'
            ? floorHeight
            : defaultExteriorRise
      ),

    material,

    direction:
      Number(stair.direction) || 0,

    length:
      Math.max(
        1,
        Number(stair.length) ||
        Math.ceil(
          floorHeight / 0.8
        )
      ),

    landing_count:
      Math.max(
        1,
        Math.round(
          Number(
            stair.landing_count
          ) || 1
        )
      ),

    landing_depth:
      Math.max(
        1,
        Number(
          stair.landing_depth
        ) ||
        Number(stair.width) ||
        3
      ),

    turn_degrees:
      Number.isFinite(
        Number(
          stair.turn_degrees
        )
      )
        ? Number(
          stair.turn_degrees
        )
        : 90,

    curve_radius:
      Math.max(
        1,
        Number(
          stair.curve_radius
        ) || 8
      ),

    curve_degrees:
      Number.isFinite(
        Number(
          stair.curve_degrees
        )
      )
        ? Number(
          stair.curve_degrees
        )
        : 90,
  };
}

/**
 * Builds the center path and elevation information for a staircase.
 *
 * Each segment is either:
 *   flight  - elevation rises from rise_start to rise_end
 *   landing - elevation is constant
 */
export function stairGeometry(
  source,
  floorHeight = 10
) {
  const stair =
    normalizeStair(
      source,
      floorHeight
    );
  const totalRise = stair.total_rise_feet;

  const start = {
    x:
      stair.start_x,

    y:
      stair.start_y,
  };

  if (
    stair.shape ===
    'curve'
  ) {
    const curveRadians =
      stair.curve_degrees *
      Math.PI /
      180;

    const sign =
      Math.sign(
        curveRadians
      ) || 1;

    const initial = {
      x:
        Math.cos(
          stair.direction
        ),

      y:
        Math.sin(
          stair.direction
        ),
    };

    const left = {
      x:
        -initial.y,

      y:
        initial.x,
    };

    const center = {
      x:
        start.x +
        left.x *
        stair.curve_radius *
        sign,

      y:
        start.y +
        left.y *
        stair.curve_radius *
        sign,
    };

    const radiusAngle =
      Math.atan2(
        start.y -
        center.y,

        start.x -
        center.x
      );

    const arcLength =
      Math.abs(
        curveRadians *
        stair.curve_radius
      );

    const stepCount =
      Math.max(
        2,

        Math.ceil(
            totalRise /
          0.8
        )
      );

    const points = [];
    const segments = [];

    for (
      let i = 0;
      i <= stepCount;
      i++
    ) {
      const t =
        i /
        stepCount;

      const angle =
        radiusAngle +
        curveRadians *
        t;

      points.push({
        x:
          center.x +
          Math.cos(angle) *
          stair.curve_radius,

        y:
          center.y +
          Math.sin(angle) *
          stair.curve_radius,
      });
    }

    for (
      let i = 0;
      i < stepCount;
      i++
    ) {
      segments.push({
        kind:
          'flight',

        start:
          points[i],

        end:
          points[i + 1],

        run:
          arcLength /
          stepCount,

        rise_start:
          totalRise *
          i /
          stepCount,

        rise_end:
          totalRise *
          (i + 1) /
          stepCount,
      });
    }

    return {
      stair,
      points,
      segments,
      center,

      arrival:
        points[
        points.length - 1
        ],
    };
  }

  if (
    stair.shape ===
    'landing'
  ) {
    const landingCount =
      stair.landing_count;

    const flightCount =
      landingCount + 1;

    const flightRun =
      stair.length /
      flightCount;

    const risePerFlight =
      totalRise /
      flightCount;

    const turn =
      stair.turn_degrees *
      Math.PI /
      180;

    const points = [
      { ...start },
    ];

    const segments = [];

    let current =
      { ...start };

    let direction =
      stair.direction;

    let rise = 0;

    for (
      let flight = 0;
      flight < flightCount;
      flight++
    ) {
      const next = {
        x:
          current.x +
          Math.cos(
            direction
          ) *
          flightRun,

        y:
          current.y +
          Math.sin(
            direction
          ) *
          flightRun,
      };

      const nextRise =
        rise +
        risePerFlight;

      segments.push({
        kind:
          'flight',

        start:
          { ...current },

        end:
          { ...next },

        run:
          flightRun,

        rise_start:
          rise,

        rise_end:
          nextRise,
      });

      current =
        { ...next };

      rise =
        nextRise;

      points.push(
        { ...current }
      );

      if (
        flight <
        landingCount
      ) {
        direction +=
          turn;

        const landingEnd = {
          x:
            current.x +
            Math.cos(
              direction
            ) *
            stair.landing_depth,

          y:
            current.y +
            Math.sin(
              direction
            ) *
            stair.landing_depth,
        };

        segments.push({
          kind:
            'landing',

          start:
            { ...current },

          end:
            { ...landingEnd },

          run:
            stair.landing_depth,

          rise_start:
            rise,

          rise_end:
            rise,
        });

        current =
          { ...landingEnd };

        points.push(
          { ...current }
        );
      }
    }

    return {
      stair,
      points,
      segments,

      arrival:
        { ...current },
    };
  }

  const arrival = {
    x:
      start.x +
      Math.cos(
        stair.direction
      ) *
      stair.length,

    y:
      start.y +
      Math.sin(
        stair.direction
      ) *
      stair.length,
  };

  return {
    stair,

    points: [
      start,
      arrival,
    ],

    segments: [
      {
        kind:
          'flight',

        start,
        end:
          arrival,

        run:
          stair.length,

        rise_start:
          0,

        rise_end:
          totalRise,
      },
    ],

    arrival,
  };
}

export function stairCenterline(
  stair,
  floorHeight = 10
) {
  return stairGeometry(
    stair,
    floorHeight
  ).points;
}

export function stairArrival(
  stair,
  floorHeight = 10
) {
  return stairGeometry(
    stair,
    floorHeight
  ).arrival;
}

function offsetPolyline(
  points,
  halfWidth
) {
  if (
    points.length < 2
  ) {
    return [];
  }

  const left = [];
  const right = [];

  for (
    let i = 0;
    i < points.length;
    i++
  ) {
    const previous =
      points[
      Math.max(
        0,
        i - 1
      )
      ];

    const next =
      points[
      Math.min(
        points.length - 1,
        i + 1
      )
      ];

    const tangent =
      normalizeVector(
        next.x -
        previous.x,

        next.y -
        previous.y
      );

    const normal = {
      x:
        -tangent.y,

      y:
        tangent.x,
    };

    left.push({
      x:
        points[i].x +
        normal.x *
        halfWidth,

      y:
        points[i].y +
        normal.y *
        halfWidth,
    });

    right.push({
      x:
        points[i].x -
        normal.x *
        halfWidth,

      y:
        points[i].y -
        normal.y *
        halfWidth,
    });
  }

  return [
    ...left,
    ...right.reverse(),
  ];
}

/**
 * Returns the floor opening that should appear on the level ABOVE this stair.
 *
 * This is intentionally derived rather than stored.
 */
export function stairOpeningPolygon(
  source,
  floorHeight = 10
) {
  const stair =
    normalizeStair(
      source,
      floorHeight
    );

  if (
    stair.shape ===
    'curve'
  ) {
    const curve =
      stairGeometry(
        stair,
        floorHeight
      );

    const center =
      curve.center;

    const start =
      curve.points[0];

    const startAngle =
      Math.atan2(
        start.y -
        center.y,

        start.x -
        center.x
      );

    const sweep =
      stair.curve_degrees *
      Math.PI /
      180;

    const outerRadius =
      stair.curve_radius +
      stair.width /
      2;

    const innerRadius =
      Math.max(
        0.25,

        stair.curve_radius -
        stair.width /
        2
      );

    const samples =
      Math.max(
        8,

        Math.ceil(
          Math.abs(
            stair.curve_degrees
          ) /
          10
        )
      );

    const outer = [];
    const inner = [];

    for (
      let i = 0;
      i <= samples;
      i++
    ) {
      const angle =
        startAngle +
        sweep *
        i /
        samples;

      outer.push({
        x:
          center.x +
          Math.cos(angle) *
          outerRadius,

        y:
          center.y +
          Math.sin(angle) *
          outerRadius,
      });
    }

    for (
      let i = samples;
      i >= 0;
      i--
    ) {
      const angle =
        startAngle +
        sweep *
        i /
        samples;

      inner.push({
        x:
          center.x +
          Math.cos(angle) *
          innerRadius,

        y:
          center.y +
          Math.sin(angle) *
          innerRadius,
      });
    }

    return [
      ...outer,
      ...inner,
    ];
  }

  return offsetPolyline(
    stairCenterline(
      stair,
      floorHeight
    ),

    stair.width /
    2
  );
}

export function stairOpeningsForLevel(
  building,
  targetLevel
) {
  return building.levels.flatMap(
    sourceLevel => {
      return (
        sourceLevel.stairs ||
        []
      ).flatMap(stair => {
        const destinationElevation =
          sourceLevel.elevation_feet +
          normalizeStair(
            stair,
            sourceLevel.floor_height
          ).total_rise_feet;

        if (
          Math.abs(
            destinationElevation -
            targetLevel.elevation_feet
          ) >
          0.01
        ) {
          return [];
        }

        return [{
          source_level_id:
            sourceLevel.id,

          source_level_name:
            sourceLevel.name,

          stair_id:
            stair.id,

          points:
            stairOpeningPolygon(
              stair,
              sourceLevel.floor_height
            ),
        }];
      });
    }
  );
}


/* -------------------------------------------------------------------------- */
/* Stacked levels, platforms, fireplaces, and chimneys                        */
/* -------------------------------------------------------------------------- */

export function levelBelow(building, level) {
  if (!building?.levels?.length || !level) return null;

  return [...building.levels]
    .filter(
      candidate =>
        candidate.id !== level.id &&
        candidate.elevation_feet < level.elevation_feet
    )
    .sort(
      (a, b) =>
        b.elevation_feet - a.elevation_feet
    )[0] || null;
}

export function levelAbove(building, level) {
  if (!building?.levels?.length || !level) return null;

  return [...building.levels]
    .filter(
      candidate =>
        candidate.id !== level.id &&
        candidate.elevation_feet > level.elevation_feet
    )
    .sort(
      (a, b) =>
        a.elevation_feet - b.elevation_feet
    )[0] || null;
}

export function cloneOutline(
  sourceLevel,
  targetLevelId = blueprintId()
) {
  if (!sourceLevel) {
    return {
      outline: [],
      corners: [],
    };
  }

  const outline = (
    sourceLevel.outline || []
  ).map(
    (wall, index) => ({
      ...wall,

      id:
        `${targetLevelId}-outline-${index}`,

      start:
        { ...wall.start },

      end:
        { ...wall.end },

      center:
        wall.center
          ? { ...wall.center }
          : undefined,
    })
  );

  return {
    outline,

    corners:
      openCorners({
        ...sourceLevel,
        outline,
      }).map(
        point => ({ ...point })
      ),
  };
}

function nearestPointOnWall(
  wall,
  point
) {
  const polyline =
    wallPolyline(
      wall,
      0.5
    );

  let best = null;
  let traveled = 0;

  for (
    let i = 0;
    i < polyline.length - 1;
    i++
  ) {
    const start =
      polyline[i];

    const end =
      polyline[i + 1];

    const segmentLength =
      pointDistance(
        start,
        end
      );

    const result =
      closestPointOnSegment(
        point,
        start,
        end
      );

    if (
      !best ||
      result.error <
      best.error
    ) {
      best = {
        wall,

        point:
          result.point,

        error:
          result.error,

        distance_from_start:
          traveled +
          result.t *
          segmentLength,
      };
    }

    traveled +=
      segmentLength;
  }

  return best;
}

export function snapPointToOutline(
  point,
  outline,
  tolerance = 2
) {
  if (
    !point ||
    !outline?.length
  ) {
    return {
      point:
        { ...point },

      snapped:
        false,

      wall:
        null,

      error:
        Infinity,
    };
  }

  let best = null;

  outline.forEach(
    wall => {
      const result =
        nearestPointOnWall(
          wall,
          point
        );

      if (
        result &&
        (
          !best ||
          result.error <
          best.error
        )
      ) {
        best = result;
      }
    }
  );

  if (
    !best ||
    best.error > tolerance
  ) {
    return {
      point:
        { ...point },

      snapped:
        false,

      wall:
        best?.wall ||
        null,

      error:
        best?.error ??
        Infinity,
    };
  }

  /*
   * Give exact lower-floor vertices priority when close enough. This prevents
   * tiny endpoint gaps between stacked wall segments.
   */
  const vertices =
    outline.flatMap(
      wall => [
        wall.start,
        wall.end,
      ]
    );

  const nearestVertex =
    vertices
      .map(
        vertex => ({
          point:
            vertex,

          error:
            pointDistance(
              point,
              vertex
            ),
        })
      )
      .sort(
        (a, b) =>
          a.error -
          b.error
      )[0];

  if (
    nearestVertex &&
    nearestVertex.error <=
    tolerance
  ) {
    return {
      point:
      {
        ...nearestVertex.point,
      },

      snapped:
        true,

      wall:
        best.wall,

      error:
        nearestVertex.error,

      vertex:
        true,
    };
  }

  return {
    point:
    {
      ...best.point,
    },

    snapped:
      true,

    wall:
      best.wall,

    error:
      best.error,

    vertex:
      false,
  };
}

export function snapPointToLevelBelow(
  building,
  level,
  point,
  tolerance = 2
) {
  const below =
    levelBelow(
      building,
      level
    );

  if (!below) {
    return {
      point:
        { ...point },

      snapped:
        false,

      wall:
        null,

      error:
        Infinity,

      level:
        null,
    };
  }

  const nearestCorner = (below.corners || [])
    .map(corner => ({
      point: corner,
      error: pointDistance(point, corner),
    }))
    .sort((a, b) => a.error - b.error)[0];

  if (nearestCorner && nearestCorner.error <= tolerance) {
    return {
      point: { ...nearestCorner.point },
      snapped: true,
      wall: null,
      error: nearestCorner.error,
      vertex: true,
      level: below,
    };
  }

  return {
    ...snapPointToOutline(
      point,
      below.outline || [],
      tolerance
    ),

    level:
      below,
  };
}

export function snapPointToRightAngle(start, point) {
  const dx = point.x - start.x;
  const dy = point.y - start.y;

  return Math.abs(dx) >= Math.abs(dy)
    ? { x: point.x, y: start.y }
    : { x: start.x, y: point.y };
}

export function snapWallToOutline(
  wall,
  outline,
  tolerance = 2
) {
  if (
    !wall ||
    !outline?.length
  ) {
    return wall;
  }

  const start =
    snapPointToOutline(
      wall.start,
      outline,
      tolerance
    );

  const end =
    snapPointToOutline(
      wall.end,
      outline,
      tolerance
    );

  const next = {
    ...wall,

    start:
      start.snapped
        ? start.point
        : wall.start,

    end:
      end.snapped
        ? end.point
        : wall.end,
  };

  /*
   * If an arc is already almost coincident with a lower arc, copying the lower
   * arc's circle prevents visibly different radii on stacked tower walls.
   */
  if (
    wall.type === 'arc'
  ) {
    const midpoint =
      wallPointAtDistance(
        wall,
        wallLength(wall) / 2
      );

    const nearestArc =
      outline
        .filter(
          candidate =>
            candidate.type ===
            'arc'
        )
        .map(
          candidate => {
            const result =
              nearestPointOnWall(
                candidate,
                midpoint
              );

            return {
              wall:
                candidate,

              error:
                result?.error ??
                Infinity,
            };
          }
        )
        .sort(
          (a, b) =>
            a.error -
            b.error
        )[0];

    if (
      nearestArc &&
      nearestArc.error <=
      tolerance
    ) {
      next.center = {
        ...nearestArc.wall.center,
      };

      next.clockwise =
        nearestArc.wall.clockwise;
    }
  }

  return next;
}

export function normalizePlatform(
  platform,
  building
) {
  const points =
    (
      platform.points ||
      []
    ).map(
      point =>
        shiftPoint(
          point,
          building
        )
    );

  const edgeModes =
    Array.from(
      {
        length:
          points.length,
      },
      (_, index) =>
        platform.edge_modes?.[index] ||
        'auto'
    );

  return {
    ...platform,

    id:
      platform.id ||
      blueprintId(),

    kind:
      'platform',

    style:
      ['porch', 'deck', 'balcony']
        .includes(
          platform.style
        )
        ? platform.style
        : 'porch',

    points,

    thickness:
      Math.max(
        0.1,
        Number(
          platform.thickness
        ) || 0.5
      ),

    elevation_offset:
      Number(
        platform.elevation_offset
      ) || 0,

    railing:
      platform.railing !==
      false,

    railing_height:
      Math.max(
        1,
        Number(
          platform.railing_height
        ) || 3.5
      ),

    edge_modes:
      edgeModes,
  };
}

export function platformEdgeMode(
  level,
  platform,
  edgeIndex,
  tolerance = 0.75
) {
  const points =
    platform.points ||
    [];

  if (
    points.length < 2
  ) {
    return 'open';
  }

  const explicit =
    platform.edge_modes?.[
    edgeIndex
    ];

  if (
    explicit &&
    explicit !== 'auto'
  ) {
    return explicit;
  }

  if (
    platform.railing ===
    false
  ) {
    return 'open';
  }

  const start =
    points[
    edgeIndex %
    points.length
    ];

  const end =
    points[
    (
      edgeIndex + 1
    ) %
    points.length
    ];

  const midpoint = {
    x:
      (
        start.x +
        end.x
      ) /
      2,

    y:
      (
        start.y +
        end.y
      ) /
      2,
  };

  const nearest =
    nearestWall(
      level,
      midpoint,
      {
        outlineOnly:
          true,
      }
    );

  if (
    nearest &&
    nearest.error <=
    tolerance
  ) {
    return 'attached';
  }

  return 'railing';
}

export function normalizeChimney(
  chimney,
  building
) {
  const local =
    building.coordinate_space ===
      'local'
      ? {
        x:
          Number(
            chimney.x
          ) || 0,

        y:
          Number(
            chimney.y
          ) || 0,
      }
      : {
        x:
          (
            Number(
              chimney.x
            ) || 0
          ) -
          building.x,

        y:
          (
            Number(
              chimney.y
            ) || 0
          ) -
          building.y,
      };

  return {
    ...chimney,

    id:
      chimney.id ||
      blueprintId(),

    x:
      local.x,

    y:
      local.y,

    width:
      Math.max(
        1,
        Number(
          chimney.width
        ) || 4
      ),

    depth:
      Math.max(
        1,
        Number(
          chimney.depth
        ) || 3
      ),

    base_level_id:
      chimney.base_level_id ||
      building.levels?.[0]?.id ||
      null,

    top_level_id:
      chimney.top_level_id ||
      null,
  };
}

export function chimneyLevelRange(
  building,
  chimney
) {
  const sorted =
    [...(building.levels || [])]
      .sort(
        (a, b) =>
          a.elevation_feet -
          b.elevation_feet
      );

  const baseIndex =
    Math.max(
      0,
      sorted.findIndex(
        level =>
          level.id ===
          chimney.base_level_id
      )
    );

  const topIndex =
    chimney.top_level_id
      ? sorted.findIndex(
        level =>
          level.id ===
          chimney.top_level_id
      )
      : sorted.length - 1;

  return {
    sorted,

    baseIndex,

    topIndex:
      topIndex >= 0
        ? topIndex
        : sorted.length - 1,
  };
}

export function chimneyIsActiveOnLevel(
  building,
  chimney,
  level
) {
  if (!level) return false;

  const range =
    chimneyLevelRange(
      building,
      chimney
    );

  const index =
    range.sorted.findIndex(
      item =>
        item.id ===
        level.id
    );

  return (
    index >= range.baseIndex &&
    index <= range.topIndex
  );
}

export function chimneysForLevel(
  building,
  level
) {
  return (
    building.chimneys ||
    []
  ).filter(
    chimney =>
      chimneyIsActiveOnLevel(
        building,
        chimney,
        level
      )
  );
}

export function chimneyPolygon(
  chimney,
  padding = 0
) {
  const halfWidth =
    chimney.width /
    2 +
    padding;

  const halfDepth =
    chimney.depth /
    2 +
    padding;

  return [
    {
      x:
        chimney.x -
        halfWidth,

      y:
        chimney.y -
        halfDepth,
    },

    {
      x:
        chimney.x +
        halfWidth,

      y:
        chimney.y -
        halfDepth,
    },

    {
      x:
        chimney.x +
        halfWidth,

      y:
        chimney.y +
        halfDepth,
    },

    {
      x:
        chimney.x -
        halfWidth,

      y:
        chimney.y +
        halfDepth,
    },
  ];
}

export function chimneyPassThroughsForLevel(
  building,
  level
) {
  return chimneysForLevel(
    building,
    level
  )
    .filter(
      chimney => {
        const base =
          building.levels.find(
            candidate =>
              candidate.id ===
              chimney.base_level_id
          );

        return (
          base &&
          level.elevation_feet >
          base.elevation_feet
        );
      }
    )
    .map(
      chimney => ({
        chimney_id:
          chimney.id,

        points:
          chimneyPolygon(
            chimney,
            0.08
          ),
      })
    );
}

export function fireplacePosition(
  chimney,
  fireplace,
  offset = 0
) {
  const side =
    fireplace.side ||
    'south';

  switch (side) {
    case 'north':
      return {
        x:
          chimney.x,

        y:
          chimney.y +
          chimney.depth /
          2 +
          offset,

        angle:
          Math.PI /
          2,
      };

    case 'east':
      return {
        x:
          chimney.x +
          chimney.width /
          2 +
          offset,

        y:
          chimney.y,

        angle:
          0,
      };

    case 'west':
      return {
        x:
          chimney.x -
          chimney.width /
          2 -
          offset,

        y:
          chimney.y,

        angle:
          Math.PI,
      };

    case 'south':
    default:
      return {
        x:
          chimney.x,

        y:
          chimney.y -
          chimney.depth /
          2 -
          offset,

        angle:
          -Math.PI /
          2,
      };
  }
}

export function nearestChimney(
  building,
  level,
  point,
  tolerance = 2
) {
  const candidates =
    chimneysForLevel(
      building,
      level
    );

  let best = null;

  candidates.forEach(
    chimney => {
      const dx =
        Math.max(
          Math.abs(
            point.x -
            chimney.x
          ) -
          chimney.width /
          2,
          0
        );

      const dy =
        Math.max(
          Math.abs(
            point.y -
            chimney.y
          ) -
          chimney.depth /
          2,
          0
        );

      const distance =
        Math.hypot(
          dx,
          dy
        );

      if (
        !best ||
        distance <
        best.distance
      ) {
        best = {
          chimney,
          distance,
        };
      }
    }
  );

  if (
    !best ||
    best.distance >
    tolerance
  ) {
    return null;
  }

  return best;
}

/* -------------------------------------------------------------------------- */
/* Normalization                                                               */
/* -------------------------------------------------------------------------- */

function normalizeOpening(
  opening,
  fallbackKind,
  walls
) {
  const kind =
    opening.kind ||
    fallbackKind;

  const wallId =
    opening.wall_id ||
    walls[
      opening.wall_index
    ]?.id ||
    null;

  const isWindow =
    kind === 'window';

  return {
    ...opening,

    id:
      opening.id ||
      blueprintId(),

    kind,

    wall_id:
      wallId,

    width:
      Number(
        opening.width
      ) ||
      (
        kind ===
          'double_door'
          ? 6
          : 3
      ),

    height:
      Number(
        opening.height
      ) ||
      (
        isWindow
          ? 4
          : 7
      ),

    height_from_floor:
      isWindow
        ? Number(
          opening
            .height_from_floor
        ) || 3
        : 0,

    operation:
      opening.operation ||
      (
        kind ===
          'curtain'
          ? 'curtain'
          : (
            kind ===
            'door' ||
            kind ===
            'double_door'
          )
            ? 'hinged'
            : undefined
      ),

    hinge_side:
      opening.hinge_side ||
      (
        kind ===
          'double_door'
          ? 'outer'
          : 'left'
      ),

    swing_side:
      opening.swing_side ||
      'inward',
  };
}

export function normalizeBlueprint(building) {
  let elevation = 0;
  const foundationHeight = Math.max(
    0,
    Number(building.foundation_height_feet) || 0
  );

  const levels = (
    building.levels || []
  ).map(
    (
      rawLevel,
      levelIndex
    ) => {
      const levelId =
        rawLevel.id ||
        `level-${levelIndex}`;

      const floorHeight =
        Number(
          rawLevel.floor_height
        ) || 10;

      const levelElevation =
        rawLevel.elevation_feet ??
        elevation;

      const corners = (
        rawLevel.corners || []
      ).map(
        point =>
          shiftPoint(
            point,
            building
          )
      );

      const exteriorThickness =
        Number(
          rawLevel
            .exterior_wall_thickness
        ) > 0
          ? Number(
            rawLevel
              .exterior_wall_thickness
          )
          : DEFAULT_EXTERIOR_WALL_THICKNESS;

      const interiorThickness =
        Number(
          rawLevel
            .interior_wall_thickness
        ) > 0
          ? Number(
            rawLevel
              .interior_wall_thickness
          )
          : DEFAULT_INTERIOR_WALL_THICKNESS;

      const outline =
        rawLevel.outline?.length
          ? rawLevel.outline.map(
            (
              wall,
              index
            ) =>
              normalizeWall(
                wall,
                `${levelId}-outline-${index}`,
                exteriorThickness,
                building
              )
          )
          : corners.length >= 3
            ? corners.map(
              (
                start,
                index
              ) => ({
                id:
                  `${levelId}-outline-${index}`,

                type:
                  'line',

                start,

                end:
                  corners[
                  (
                    index + 1
                  ) %
                  corners.length
                  ],

                thickness:
                  exteriorThickness,
              })
            )
            : [];

      const walls = (
        rawLevel.walls || []
      ).map(
        (
          wall,
          index
        ) =>
          normalizeWall(
            wall,
            wall.id ||
            `${levelId}-wall-${index}`,
            interiorThickness,
            building
          )
      );

      const allWalls = [
        ...outline,
        ...walls,
      ];

      const rawOpenings =
        rawLevel.openings?.length
          ? rawLevel.openings
          : [
            ...(
              rawLevel.doors ||
              []
            ).map(
              opening => ({
                ...opening,

                kind:
                  opening.kind ||
                  'door',
              })
            ),

            ...(
              rawLevel.windows ||
              []
            ).map(
              opening => ({
                ...opening,

                kind:
                  'window',
              })
            ),
          ];

      const openings =
        rawOpenings.map(
          opening =>
            normalizeOpening(
              opening,
              opening.kind ||
              'door',
              allWalls
            )
        );

      const legacyLadders = (
        rawLevel.hatches || []
      )
        .filter(
          hatch =>
            hatch.has_ladder
        )
        .map(
          hatch => ({
            ...hatch,

            id:
              hatch.id ||
              blueprintId(),
          })
        );

      const hatches = (
        rawLevel.hatches || []
      )
        .filter(
          hatch =>
            !hatch.has_ladder
        )
        .map(
          hatch => ({
            ...hatch,

            id:
              hatch.id ||
              blueprintId(),
          })
        );

      const ladders = [
        ...(rawLevel.ladders || []),
        ...legacyLadders,
      ].map(
        ladder => ({
          ...ladder,

          id:
            ladder.id ||
            blueprintId(),

          width:
            Number(
              ladder.width
            ) || 3,

          depth:
            Number(
              ladder.depth
            ) || 3,
        })
      );

      const floorVoids = (
        rawLevel.floor_voids ||
        []
      ).map(
        floorVoid => ({
          ...floorVoid,

          id:
            floorVoid.id ||
            blueprintId(),

          points:
            (
              floorVoid.points ||
              []
            ).map(
              point =>
                shiftPoint(
                  point,
                  building
                )
            ),
        })
      );

      const platforms = (
        rawLevel.platforms ||
        []
      ).map(
        platform =>
          normalizePlatform(
            platform,
            building
          )
      );

      const fireplaces = (
        rawLevel.fireplaces ||
        []
      ).map(
        fireplace => ({
          ...fireplace,

          id:
            fireplace.id ||
            blueprintId(),

          chimney_id:
            fireplace.chimney_id ||
            null,

          side:
            ['north', 'south', 'east', 'west']
              .includes(
                fireplace.side
              )
              ? fireplace.side
              : 'south',

          width:
            Math.max(
              1,
              Number(
                fireplace.width
              ) || 5
            ),

          opening_height:
            Math.max(
              1,
              Number(
                fireplace.opening_height
              ) || 4
            ),
        })
      );

      const stairs = (
        rawLevel.stairs ||
        []
      ).map(
        stair =>
          normalizeStair(
            stair,
            floorHeight,
            levelElevation === 0 && foundationHeight > 0
              ? foundationHeight
              : floorHeight
          )
      );

      const level = {
        ...rawLevel,

        id:
          levelId,

        name:
          rawLevel.name ||
          (
            levelIndex
              ? `Level ${levelIndex}`
              : 'Ground floor'
          ),

        floor_height:
          floorHeight,

        elevation_feet:
          levelElevation,

        exterior_wall_thickness:
          exteriorThickness,

        interior_wall_thickness:
          interiorThickness,

        corners,

        outline,
        walls,
        openings,

        doors:
          openings.filter(
            opening =>
              opening.kind !==
              'window'
          ),

        windows:
          openings.filter(
            opening =>
              opening.kind ===
              'window'
          ),

        stairs,
        hatches,
        ladders,

        floor_voids:
          floorVoids,

        platforms,

        fireplaces,

        connectors:
          rawLevel.connectors ||
          [],
      };

      elevation =
        levelElevation +
        floorHeight;

      return level;
    }
  );

  const normalizedBuilding = {
    ...building,

    coordinate_space:
      'local',

    show_roofs:
      building.show_roofs !== false,

    foundation_height_feet:
      foundationHeight,

    foundation_material:
      building.foundation_material === 'exterior'
        ? 'exterior'
        : 'stone',

    levels,
  };

  const chimneyContext = {
    ...building,
    levels,
  };

  const chimneys = (
    building.chimneys ||
    []
  ).map(
    chimney =>
      normalizeChimney(
        chimney,
        chimneyContext
      )
  );

  const roofs = (
    building.roofs || []
  ).map(
    roof =>
      normalizeRoof(
        roof,
        building,
        levels
      )
  );

  return {
    ...normalizedBuilding,
    roofs,
    chimneys,
  };
}

export function addBuildingLevel(
  building,
  direction = 1
) {
  const next =
    normalizeBlueprint(
      building
    );

  const sorted = [
    ...next.levels,
  ].sort(
    (a, b) =>
      a.elevation_feet -
      b.elevation_feet
  );

  const source =
    direction > 0
      ? sorted[
      sorted.length - 1
      ]
      : sorted[0];

  if (!source) return next;

  const elevation =
    direction > 0
      ? source.elevation_feet +
      source.floor_height
      : source.elevation_feet -
      source.floor_height;

  const id =
    blueprintId();

  const outline =
    source.outline.map(
      (
        wall,
        index
      ) => ({
        ...wall,

        id:
          `${id}-outline-${index}`,

        start:
          { ...wall.start },

        end:
          { ...wall.end },

        center:
          wall.center
            ? { ...wall.center }
            : undefined,
      })
    );

  const level = {
    id,

    name:
      elevation < 0
        ? `Basement ${sorted.filter(
          item =>
            item.elevation_feet <
            0
        ).length + 1
        }`
        : `Level ${sorted.filter(
          item =>
            item.elevation_feet >=
            0
        ).length
        }`,

    elevation_feet:
      elevation,

    floor_height:
      source.floor_height,

    exterior_wall_thickness:
      source.exterior_wall_thickness,

    interior_wall_thickness:
      source.interior_wall_thickness,

    corners:
      source.corners.map(
        point => ({
          ...point,
        })
      ),

    outline,
    walls: [],
    openings: [],
    doors: [],
    windows: [],
    stairs: [],
    hatches: [],
    ladders: [],
    floor_voids: [],
    platforms: [],
    fireplaces: [],
    connectors: [],
  };

  return {
    ...next,

    visible_level_id:
      level.id,

    level_view:
      'level',

    levels: [
      ...next.levels,
      level,
    ].sort(
      (a, b) =>
        a.elevation_feet -
        b.elevation_feet
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Level connections                                                           */
/* -------------------------------------------------------------------------- */

export function levelConnectionGuides(
  building,
  level
) {
  return building.levels.flatMap(
    source => {
      const stairs = (
        source.stairs || []
      ).map(
        stair => {
          const arrival =
            stairArrival(
              stair,
              source.floor_height
            );

          return {
            kind:
              'stairs',

            x:
              arrival.x,

            y:
              arrival.y,

            source:
              source.name,

            targetElevation:
              source.elevation_feet +
              normalizeStair(
                stair,
                source.floor_height
              ).total_rise_feet,
          };
        }
      );

      const ladders = (
        source.ladders || []
      ).map(
        ladder => ({
          kind:
            'ladder',

          x:
            ladder.x,

          y:
            ladder.y,

          source:
            source.name,

          targetElevation:
            source.elevation_feet +
            source.floor_height,
        })
      );

      return [
        ...stairs,
        ...ladders,
      ].filter(
        guide =>
          Math.abs(
            guide.targetElevation -
            level.elevation_feet
          ) <
          0.01
      );
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Selection / openings                                                        */
/* -------------------------------------------------------------------------- */

function closestPointOnSegment(
  point,
  start,
  end
) {
  const dx =
    end.x - start.x;

  const dy =
    end.y - start.y;

  const lengthSquared =
    dx * dx +
    dy * dy;

  if (
    lengthSquared <
    0.000001
  ) {
    return {
      point:
        { ...start },

      t:
        0,

      error:
        pointDistance(
          point,
          start
        ),
    };
  }

  const t =
    Math.max(
      0,
      Math.min(
        1,

        (
          (
            point.x -
            start.x
          ) *
          dx +
          (
            point.y -
            start.y
          ) *
          dy
        ) /
        lengthSquared
      )
    );

  const closest = {
    x:
      start.x +
      dx * t,

    y:
      start.y +
      dy * t,
  };

  return {
    point:
      closest,

    t,

    error:
      pointDistance(
        point,
        closest
      ),
  };
}

export function distanceToSegment(
  point,
  start,
  end
) {
  return closestPointOnSegment(
    point,
    start,
    end
  ).error;
}

export function nearestWall(
  level,
  point,
  {
    outlineOnly = false,
  } = {}
) {
  const walls =
    outlineOnly
      ? level.outline || []
      : blueprintWalls(level);

  let nearest = null;

  walls.forEach(
    wall => {
      const length =
        wallLength(wall);

      if (
        length < 0.001
      ) {
        return;
      }

      const polyline =
        wallPolyline(
          wall,
          0.75
        );

      let traveled = 0;

      for (
        let i = 0;
        i <
        polyline.length - 1;
        i++
      ) {
        const a =
          polyline[i];

        const b =
          polyline[i + 1];

        const segmentLength =
          pointDistance(
            a,
            b
          );

        const result =
          closestPointOnSegment(
            point,
            a,
            b
          );

        const wallDistance =
          traveled +
          result.t *
          segmentLength;

        if (
          !nearest ||
          result.error <
          nearest.error
        ) {
          nearest = {
            wall,

            wall_id:
              wall.id,

            distance_from_start:
              wallDistance,

            point:
              result.point,

            error:
              result.error,
          };
        }

        traveled +=
          segmentLength;
      }
    }
  );

  return nearest;
}

export function snapOpening(
  level,
  point,
  kind,
  width = 3,
  height = 7,
  sill = 0,
  properties = {}
) {
  const nearest =
    nearestWall(
      level,
      point
    );

  if (
    !nearest ||
    nearest.error >
    5
  ) {
    return null;
  }

  const wall =
    nearest.wall;

  const length =
    wallLength(wall);

  if (
    length <
    width + 0.2
  ) {
    return null;
  }

  const distance =
    Math.max(
      width / 2 + 0.1,

      Math.min(
        length -
        width / 2 -
        0.1,

        nearest
          .distance_from_start
      )
    );

  if (
    height + sill >
    level.floor_height
  ) {
    return null;
  }

  const openings =
    level.openings ||
    [
      ...(level.doors || []),
      ...(level.windows || []),
    ];

  if (
    openings.some(
      opening =>
        opening.wall_id ===
        wall.id &&
        Math.abs(
          opening
            .distance_from_start -
          distance
        ) <
        (
          opening.width +
          width
        ) /
        2 +
        0.1
    )
  ) {
    return null;
  }

  return {
    id:
      blueprintId(),

    kind,

    wall_id:
      wall.id,

    distance_from_start:
      distance,

    width,
    height,

    height_from_floor:
      kind ===
        'window'
        ? sill
        : 0,

    ...properties,
  };
}

export function wallPanels(
  length,
  height,
  openings
) {
  const valid =
    openings
      .filter(
        opening =>
          opening.width > 0 &&
          opening.height > 0
      )
      .map(
        opening => ({
          left:
            Math.max(
              0,

              opening
                .distance_from_start -
              opening.width /
              2
            ),

          right:
            Math.min(
              length,

              opening
                .distance_from_start +
              opening.width /
              2
            ),

          bottom:
            Math.max(
              0,

              opening
                .height_from_floor ||
              0
            ),

          top:
            Math.min(
              height,

              (
                opening
                  .height_from_floor ||
                0
              ) +
              opening.height
            ),
        })
      );

  const xs = [
    ...new Set([
      0,
      length,

      ...valid.flatMap(
        opening => [
          opening.left,
          opening.right,
        ]
      ),
    ]),
  ].sort(
    (a, b) =>
      a - b
  );

  const ys = [
    ...new Set([
      0,
      height,

      ...valid.flatMap(
        opening => [
          opening.bottom,
          opening.top,
        ]
      ),
    ]),
  ].sort(
    (a, b) =>
      a - b
  );

  const panels = [];

  for (
    let i = 1;
    i < xs.length;
    i++
  ) {
    for (
      let j = 1;
      j < ys.length;
      j++
    ) {
      const x =
        (
          xs[i - 1] +
          xs[i]
        ) /
        2;

      const y =
        (
          ys[j - 1] +
          ys[j]
        ) /
        2;

      if (!valid.some(opening => opening.left < x && x < opening.right && opening.bottom < y && y < opening.top)) {
        panels.push({
          x,
          y,

          width:
            xs[i] -
            xs[i - 1],

          height:
            ys[j] -
            ys[j - 1],
        });
      }
    }
  }

  return panels;
}