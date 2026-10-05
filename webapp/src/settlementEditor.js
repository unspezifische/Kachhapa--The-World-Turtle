export const FEET_PER_SCENE_UNIT = 50;

export function rotatePositionAroundVerticalAxis(position, target, angle) {
  const dx=position.x-target.x,dz=position.z-target.z,cos=Math.cos(angle),sin=Math.sin(angle);
  return {x:target.x+dx*cos+dz*sin,y:position.y,z:target.z-dx*sin+dz*cos};
}

export function pitchPositionAroundTarget(position, target, angle, minimumPitch = 0.08, maximumPitch = 1.48) {
  const offset={x:position.x-target.x,y:position.y-target.y,z:position.z-target.z};
  const radius=Math.hypot(offset.x,offset.y,offset.z)||1;
  const horizontal=Math.hypot(offset.x,offset.z)||1;
  const azimuth=Math.atan2(offset.z,offset.x);
  const pitch=Math.max(minimumPitch,Math.min(maximumPitch,Math.atan2(offset.y,horizontal)+angle));
  const horizontalRadius=Math.cos(pitch)*radius;
  return {
    x:target.x+Math.cos(azimuth)*horizontalRadius,
    y:target.y+Math.sin(pitch)*radius,
    z:target.z+Math.sin(azimuth)*horizontalRadius,
  };
}

export const FALLBACK_ASSET_CATALOG = [
  { key:'timber_cottage', name:'Timber Cottage', category:'residential', width_feet:42, depth_feet:32, height_feet:28, color:'#b87742', roof_color:'#513a30', model_url:null, rooms:['Common room','Kitchen','Bedroom','Pantry','Loft'] },
  { key:'stone_townhouse', name:'Stone Townhouse', category:'residential', width_feet:36, depth_feet:46, height_feet:36, color:'#8f8373', roof_color:'#3d4650', model_url:null, rooms:['Entry hall','Parlor','Kitchen','Primary bedroom','Bedroom','Study','Cellar'] },
  { key:'shop_house', name:'Shop House', category:'commercial', width_feet:52, depth_feet:40, height_feet:32, color:'#a76d43', roof_color:'#4c352b', model_url:null, rooms:['Shop floor','Workshop','Stockroom','Kitchen','Owner bedroom','Cellar'] },
  { key:'coaching_inn', name:'Coaching Inn', category:'hospitality', width_feet:88, depth_feet:62, height_feet:40, color:'#9a633b', roof_color:'#463128', model_url:null, rooms:['Common room','Taproom','Kitchen','Pantry','Office','Six guest rooms','Stable','Cellar'] },
  { key:'storehouse', name:'Storehouse', category:'industrial', width_feet:64, depth_feet:48, height_feet:30, color:'#87603e', roof_color:'#3f342d', model_url:null, rooms:['Receiving floor','Main storage','Secure cage','Clerk office','Loading bay'] },
];

export const worldToThree = (xFeet, yFeet, elevationFeet = 0) => [
  xFeet / FEET_PER_SCENE_UNIT,
  elevationFeet / FEET_PER_SCENE_UNIT,
  -yFeet / FEET_PER_SCENE_UNIT,
];

export const threeToWorld = (point) => ({
  x: point.x * FEET_PER_SCENE_UNIT,
  y: -point.z * FEET_PER_SCENE_UNIT,
  elevation: point.y * FEET_PER_SCENE_UNIT,
});


export function referenceLayerUv(layer, xFeet, yFeet) {
  const angle = (Number(layer?.rotation_degrees) || 0) * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const dx = xFeet - (Number(layer?.origin_x) || 0);
  const dy = yFeet - (Number(layer?.origin_y) || 0);

  const localX = dx * cos + dy * sin;
  const localY = dx * sin - dy * cos; // Align orientation tracks cleanly

  return {
    u: localX / Math.max(1, Number(layer?.width_feet) || 1) + .5,
    v: localY / Math.max(1, Number(layer?.height_feet) || 1) + .5,
  };
}


export function firstPersonLookAngles(yaw, pitch, movementX, movementY, settings = {}) {
  const sensitivity = Math.max(.1, Number(settings.sensitivity) || 50) * .000044;
  const nextYaw = yaw + movementX * sensitivity * (settings.invertX ? -1 : 1);
  const nextPitch = pitch - movementY * sensitivity * (settings.invertY ? -1 : 1);
  return { yaw:nextYaw, pitch:Math.max(-Math.PI*.48, Math.min(Math.PI*.48, nextPitch)) };
}

export function calibrateReferenceLayer(layer, pointA, pointB, knownDistanceFeet) {
  const measuredDistance = Math.hypot(pointB.x-pointA.x, pointB.y-pointA.y);
  const knownDistance = Number(knownDistanceFeet);
  if (!Number.isFinite(measuredDistance) || measuredDistance <= 0 || !Number.isFinite(knownDistance) || knownDistance <= 0) return layer;
  const scale = knownDistance / measuredDistance;
  const width = Math.max(1, Number(layer.width_feet) * scale);
  const height = Math.max(1, Number(layer.height_feet) * scale);
  return {
    ...layer,
    width_feet: width,
    height_feet: height,
    feet_per_pixel: width / Math.max(1, Number(layer.pixel_width) || 1),
    feet_per_pixel_x: width / Math.max(1, Number(layer.pixel_width) || 1),
    feet_per_pixel_y: height / Math.max(1, Number(layer.pixel_height) || 1),
  };
}

export function heightmapHeightAt(heightmap, x, y) {
  if (!heightmap?.values?.length || !heightmap.grid_width || !heightmap.grid_height) return 0;
  const width = Math.max(1, Number(heightmap.width_feet) || 1);
  const height = Math.max(1, Number(heightmap.height_feet) || 1);
  const originX = Number.isFinite(heightmap.origin_x) ? heightmap.origin_x : 0;
  const originY = Number.isFinite(heightmap.origin_y) ? heightmap.origin_y : 0;

  // Terrain tiles are not image heightmaps. Their origin is the south-west
  // corner, rows increase with world Y, and every value is already measured
  // in feet. Applying the legacy image-heightmap rules here made the
  // north/east half of a tile read as out-of-bounds after a stroke was baked.
  const hasTileCoordinates = heightmap.tile_x != null && heightmap.tile_z != null
    && Number.isFinite(Number(heightmap.tile_x)) && Number.isFinite(Number(heightmap.tile_z));
  const isTerrainTile = heightmap.layer_type === 'heightmap_tile' || hasTileCoordinates;
  if (isTerrainTile) {
    const u = (x - originX) / width;
    const v = (y - originY) / height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;

    const gridWidth = Number(heightmap.grid_width), gridHeight = Number(heightmap.grid_height);
    const gx = u * (gridWidth - 1), gy = v * (gridHeight - 1);
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const x1 = Math.min(gridWidth - 1, x0 + 1), y1 = Math.min(gridHeight - 1, y0 + 1);
    const sample = (column, row) => Number(heightmap.values[row * gridWidth + column]) || 0;
    const lower = sample(x0, y0) + (sample(x1, y0) - sample(x0, y0)) * (gx - x0);
    const upper = sample(x0, y1) + (sample(x1, y1) - sample(x0, y1)) * (gx - x0);
    return lower + (upper - lower) * (gy - y0);
  }

  const u = (x - originX + width / 2) / width;
  const v = 1 - (y - originY + height / 2) / height;
  if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
  const gridWidth = Number(heightmap.grid_width), gridHeight = Number(heightmap.grid_height);
  const gx = u * (gridWidth - 1), gy = v * (gridHeight - 1), x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(gridWidth - 1, x0 + 1), y1 = Math.min(gridHeight - 1, y0 + 1);
  const sample = (column, row) => (Number(heightmap.values[row * gridWidth + column]) || 0) / 255;
  const top = sample(x0, y0) + (sample(x1, y0) - sample(x0, y0)) * (gx - x0);
  const bottom = sample(x0, y1) + (sample(x1, y1) - sample(x0, y1)) * (gx - x0);
  const normalized = top + (bottom - top) * (gy - y0);
  const minimum = Number(heightmap.min_elevation_feet) || 0, range = (Number(heightmap.max_elevation_feet) || 250) - minimum, strength = Number(heightmap.strength ?? 1), pivot = Number(heightmap.strength_pivot_feet) || 0;
  const elevation = minimum + normalized * range;
  return pivot + (elevation - pivot) * (Number.isFinite(strength) ? strength : 1);
}

export function terrainHeightAt(strokes, x, y, heightmap = null) {
  return (strokes || []).reduce((height, stroke) => {
    const radius = Math.max(1, Number(stroke.radius) || 1);
    const distance = Math.hypot(x - Number(stroke.x), y - Number(stroke.y));
    if (distance >= radius) return height;
    const normalized = 1 - (distance / radius) ** 2;
    const falloff=normalized*normalized;
    if(stroke.mode==='flatten'||stroke.mode==='smooth'){
      const target=Number(stroke.target_elevation_feet);
      const amount=Math.max(0,Math.min(1,Number(stroke.amount)||0))*falloff;
      return Number.isFinite(target)?height+(target-height)*amount:height;
    }
    return height + Number(stroke.delta || 0) * falloff;
  }, heightmapHeightAt(heightmap,x,y));
}

export function createTerrainHeightSampler(strokes, heightmap = null, cellSizeFeet = 160) {
  return createTerrainStrokeSampler(strokes, (x, y) => heightmapHeightAt(heightmap, x, y), cellSizeFeet);
}

/** Spatially indexes strokes once and composes them over an arbitrary base. */
export function createTerrainStrokeSampler(strokes, getBaseHeight, cellSizeFeet = 160) {
  const cellSize=Math.max(16,Number(cellSizeFeet)||160),rows=new Map();
  (strokes||[]).forEach((source)=>{
    const stroke={
      ...source,
      x:Number(source.x),y:Number(source.y),radius:Math.max(1,Number(source.radius)||1),
      delta:Number(source.delta||0),target_elevation_feet:Number(source.target_elevation_feet),
      amount:Math.max(0,Math.min(1,Number(source.amount)||0)),
    };
    const minColumn=Math.floor((stroke.x-stroke.radius)/cellSize),maxColumn=Math.floor((stroke.x+stroke.radius)/cellSize);
    const minRow=Math.floor((stroke.y-stroke.radius)/cellSize),maxRow=Math.floor((stroke.y+stroke.radius)/cellSize);
    for(let row=minRow;row<=maxRow;row+=1){
      let columns=rows.get(row);
      if(!columns){columns=new Map();rows.set(row,columns);}
      for(let column=minColumn;column<=maxColumn;column+=1){
        let bucket=columns.get(column);
        if(!bucket){bucket=[];columns.set(column,bucket);}
        bucket.push(stroke);
      }
    }
  });
  return (x,y)=>{
    const candidates=rows.get(Math.floor(y/cellSize))?.get(Math.floor(x/cellSize))||[];
    return candidates.reduce((height,stroke)=>{
      const distance=Math.hypot(x-stroke.x,y-stroke.y);
      if(distance>=stroke.radius)return height;
      const falloff=(1-(distance/stroke.radius)**2)**2;
      if(stroke.mode==='flatten'||stroke.mode==='smooth'){
        const amount=stroke.amount*falloff;
        return Number.isFinite(stroke.target_elevation_feet)?height+(stroke.target_elevation_feet-height)*amount:height;
      }
      return height+stroke.delta*falloff;
    },getBaseHeight(x,y));
  };
}

export function terrainSurfaceWeights(elevationFeet, normalY = 1, settings = {}) {
  const clamp=(value)=>Math.max(0,Math.min(1,value));
  const seaLevel=Number(settings.sea_level_feet)||0;
  const snowLine=Number(settings.snow_line_feet??900),snowBlend=Math.max(50,Number(settings.snow_blend_feet??500));
  const cliffStart=Math.max(.35,Math.min(.98,Number(settings.cliff_normal_threshold??.86)));
  const steepness=clamp((cliffStart-normalY)/Math.max(.05,cliffStart-.45));
  const shoreDistance=elevationFeet-seaLevel;
  const sand=clamp((18-shoreDistance)/28)*(1-steepness*.9);
  const snow=clamp((elevationFeet-snowLine)/snowBlend)*(1-steepness*.58);
  const highRock=clamp((elevationFeet-(snowLine-snowBlend*.4))/(snowBlend*1.25))*(1-snow*.7);
  const rock=clamp(steepness*1.08+highRock*.32);
  const dirt=clamp(steepness*.72+(sand*.18))*(1-rock*.45);
  const grass=clamp(1-Math.max(sand,snow)-rock*.9-dirt*.55);
  const total=sand+snow+rock+dirt+grass||1;
  return {sand:sand/total,snow:snow/total,rock:rock/total,dirt:dirt/total,grass:grass/total};
}

export function waterFlowSpeed({width_feet=30,depth_feet=5,slope=0}={}) {
  const constriction=Math.sqrt(30/Math.max(6,Number(width_feet))) * Math.sqrt(5/Math.max(1,Number(depth_feet)));
  return Math.max(.18,Math.min(3.5,.42*constriction+Math.max(0,Number(slope))*16));
}

export function waterDepthAtSeaLevel(terrainElevationFeet,seaLevelFeet=0){
  return Number(seaLevelFeet)-Number(terrainElevationFeet);
}

function projectToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const amount = lengthSquared ? Math.max(0, Math.min(1, ((point.x-start.x)*dx + (point.y-start.y)*dy) / lengthSquared)) : 0;
  const projected = { x:start.x + dx*amount, y:start.y + dy*amount };
  const length = Math.hypot(dx,dy) || 1;
  return { point:projected, distance:Math.hypot(point.x-projected.x,point.y-projected.y), tangent:{x:dx/length,y:dy/length}, amount };
}

export function nearestRoadPoint(point, roads) {
  let nearest = null;
  (roads || []).forEach((road) => {
    const points=road.points||[],segmentCount=road.closed?points.length:Math.max(0,points.length-1);
    Array.from({length:segmentCount},(_,index)=>index).forEach((index) => {
      const start=points[index],end=points[(index+1)%points.length];
      const candidate = projectToSegment(point,start,end);
      if (!nearest || candidate.distance < nearest.distance) {
        const startWidth=Number(start.width_feet??road.width_feet)||30,endWidth=Number(end.width_feet??road.width_feet)||30;
        nearest = { ...candidate, road, segmentIndex:index, width_feet:startWidth+(endWidth-startWidth)*candidate.amount };
      }
    });
  });
  return nearest;
}

export function snapRegionBoundaryPoint(point,regions,roads,{regionId=null,pointIndex=null,tolerance=80,fortifications=[]}={}){
  let best={x:Math.round(point.x),y:Math.round(point.y)},bestDistance=Number(tolerance)||80;
  let neighboringVertexFound=false;
  (regions||[]).forEach(region=>(region.points||[]).forEach((candidate)=>{
    // An edited point may join a neighboring region, but must not collapse
    // onto a different vertex in its own polygon.
    if(region.id===regionId)return;
    const distance=Math.hypot(candidate.x-point.x,candidate.y-point.y);
    if(distance<=bestDistance){best={x:candidate.x,y:candidate.y};bestDistance=distance;neighboringVertexFound=true;}
  }));
  if(neighboringVertexFound)return best;
  const wallHit=nearestRoadPoint(point,(fortifications||[]).filter(wall=>wall.visible!==false));
  if(wallHit&&wallHit.distance<=tolerance)return{x:Math.round(wallHit.point.x),y:Math.round(wallHit.point.y)};
  const roadHit=nearestRoadPoint(point,(roads||[]).filter(road=>road.visible!==false));
  if(roadHit&&roadHit.distance<=bestDistance)best={x:Math.round(roadHit.point.x),y:Math.round(roadHit.point.y)};
  return best;
}

export function snapRoadNetworkPoint(point,roads,{roadId=null,tolerance=80}={}){
  let best={x:Math.round(point.x),y:Math.round(point.y),...(point.width_feet!=null?{width_feet:point.width_feet}:{})};
  let bestDistance=Number(tolerance)||80;
  (roads||[]).forEach(road=>{
    if(road.id===roadId)return;
    (road.points||[]).forEach(candidate=>{
      const distance=Math.hypot(candidate.x-point.x,candidate.y-point.y);
      if(distance<=bestDistance){
        best={...best,x:candidate.x,y:candidate.y};
        bestDistance=distance;
      }
    });
  });
  return best;
}

export function snapRoadSplineTranslation(points,roads,{roadId=null,tolerance=80}={}){
  let offset=null,bestDistance=Number(tolerance)||80;
  (points||[]).forEach(point=>(roads||[]).forEach(road=>{
    if(road.id===roadId)return;
    (road.points||[]).forEach(candidate=>{
      const distance=Math.hypot(candidate.x-point.x,candidate.y-point.y);
      if(distance<=bestDistance){offset={x:candidate.x-point.x,y:candidate.y-point.y};bestDistance=distance;}
    });
  }));
  return(points||[]).map(point=>({...point,x:Math.round(point.x+(offset?.x||0)),y:Math.round(point.y+(offset?.y||0))}));
}

export function insertRoadControlPoint(road, point) {
  const points = road?.points || [];
  if (points.length < 2 || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return road;
  let insertAt = 1;
  let nearestDistance = Infinity;
  let nearestPoint = point;
  let widthFeet = Number(road.width_feet)||30;
  const segmentCount=road?.closed?points.length:points.length-1;
  Array.from({length:segmentCount},(_,index)=>index).forEach((index) => {
    const start=points[index],end=points[(index+1)%points.length];
    const candidate = projectToSegment(point, start, end);
    if (candidate.distance < nearestDistance) {
      nearestDistance = candidate.distance;
      insertAt = index + 1;
      nearestPoint = candidate.point;
      const startWidth=Number(start.width_feet??road.width_feet)||30,endWidth=Number(end.width_feet??road.width_feet)||30;
      const segmentLength=Math.hypot(end.x-start.x,end.y-start.y)||1;
      const amount=Math.hypot(candidate.point.x-start.x,candidate.point.y-start.y)/segmentLength;
      widthFeet=startWidth+(endWidth-startWidth)*amount;
    }
  });
  const controlPoint = { x:Math.round(nearestPoint.x), y:Math.round(nearestPoint.y), width_feet:Math.round(widthFeet) };
  return { ...road, points:[...points.slice(0, insertAt), controlPoint, ...points.slice(insertAt)] };
}

export function insertClosedBoundaryPoint(boundary, point) {
  const points=boundary?.points||[];
  if(points.length<3||!Number.isFinite(point?.x)||!Number.isFinite(point?.y))return boundary;
  let insertAt=1,nearestDistance=Infinity;
  points.forEach((start,index)=>{
    const end=points[(index+1)%points.length];
    const candidate=projectToSegment(point,start,end);
    if(candidate.distance<nearestDistance){nearestDistance=candidate.distance;insertAt=index+1;}
  });
  const controlPoint={x:Math.round(point.x),y:Math.round(point.y)};
  return{...boundary,points:[...points.slice(0,insertAt),controlPoint,...points.slice(insertAt)]};
}

export function roadWidthAt(road, amount) {
  const points=road?.points||[];
  if(!points.length)return Number(road?.width_feet)||30;
  const scaled=Math.max(0,Math.min(1,amount))*Math.max(0,points.length-1);
  const startIndex=Math.min(points.length-1,Math.floor(scaled)),endIndex=Math.min(points.length-1,startIndex+1),fraction=scaled-startIndex;
  const startWidth=Number(points[startIndex]?.width_feet??road.width_feet)||30,endWidth=Number(points[endIndex]?.width_feet??road.width_feet)||30;
  return startWidth+(endWidth-startWidth)*fraction;
}

function normalizeAngle(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

export function snapBuildingPlacement(candidate, buildings, roads, snapDistance = 18) {
  let result = { ...candidate, front_road_id:null };
  const roadHit = nearestRoadPoint(candidate, roads);
  if (roadHit && roadHit.distance <= (roadHit.width_feet/2 + candidate.depth_feet/2 + snapDistance)) {
    const normal = { x:-roadHit.tangent.y, y:roadHit.tangent.x };
    const side = ((candidate.x-roadHit.point.x)*normal.x + (candidate.y-roadHit.point.y)*normal.y) >= 0 ? 1 : -1;
    const setback = roadHit.width_feet/2 + candidate.depth_feet/2;
    result = {
      ...result,
      x:roadHit.point.x + normal.x*side*setback,
      y:roadHit.point.y + normal.y*side*setback,
      rotation:Math.atan2(roadHit.tangent.y,roadHit.tangent.x) + (side > 0 ? Math.PI : 0),
      front_road_id:roadHit.road.id,
    };
  }

  const aligned = (buildings || []).filter((building) =>
    building.id !== result.id &&
    normalizeAngle(building.rotation-result.rotation) < .08 &&
    normalizeAngle(building.rotation-result.rotation) > -.08 &&
    building.front_road_id === result.front_road_id
  );
  const tangent = {x:Math.cos(result.rotation),y:Math.sin(result.rotation)};
  const normal = {x:-tangent.y,y:tangent.x};
  aligned.forEach((building) => {
    const dx=result.x-building.x,dy=result.y-building.y;
    const along=dx*tangent.x+dy*tangent.y;
    const across=dx*normal.x+dy*normal.y;
    const edgeDistance=(result.width_feet+building.width_feet)/2;
    if(Math.abs(across)<snapDistance && Math.abs(Math.abs(along)-edgeDistance)<snapDistance){
      const direction=along>=0?1:-1;
      result={...result,x:building.x+tangent.x*edgeDistance*direction,y:building.y+tangent.y*edgeDistance*direction};
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
    rotation: 0,
    width_feet: asset.width_feet,
    depth_feet: asset.depth_feet,
    rooms: [...(asset.rooms || [])],
    front_road_id: null,
  };
  return snapBuildingPlacement(candidate, buildings, roads);
}

export function generateDefaultFloorplan(asset, point) {
  const w = asset.width_feet || 40;
  const d = asset.depth_feet || 30;
  const h = asset.height_feet || 12;

  // Create a simple rectangular footprint centered on the placement point
  const corners = [
    { x: point.x - w / 2, y: point.y - d / 2 },
    { x: point.x + w / 2, y: point.y - d / 2 },
    { x: point.x + w / 2, y: point.y + d / 2 },
    { x: point.x - w / 2, y: point.y + d / 2 },
    { x: point.x - w / 2, y: point.y - d / 2 } // Close the loop
  ];

  // Wall indices: 0=left(-X), 1=bottom(-Y), 2=right(+X), 3=top(+Y)
  // Place a door on the bottom wall (index 1), centered
  const doors = [
    { wall_index: 1, distance_from_start: w / 2, width: 4, height: 7 }
  ];

  // Place windows on the left and right walls
  const windows = [
    { wall_index: 0, distance_from_start: d / 2, width: 3, height: 4, height_from_floor: 3 },
    { wall_index: 2, distance_from_start: d / 2, width: 3, height: 4, height_from_floor: 3 }
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
    rotation: 0,
    is_blueprint: true,
    levels: [
      {
        floor_height: 10,
        corners: [{ x: point.x, y: point.y }],
        doors: [],
        windows: [],
        stairs: [],
        hatches: []
      }
    ]
  };
}

export function addBlueprintCorner(building, point) {
  const next = { ...building };
  const currentLevel = next.levels[next.levels.length - 1];
  currentLevel.corners.push({ x: point.x, y: point.y });
  return next;
}

export function closeBlueprintFootprint(building) {
  const next = { ...building };
  const currentLevel = next.levels[next.levels.length - 1];
  if (currentLevel.corners.length > 2) {
    currentLevel.corners.push({ ...currentLevel.corners[0] }); // Close polygon loop
  }
  return next;
}

export function addBlueprintLevel(building) {
  const next = { ...building };
  const prevLevel = next.levels[next.levels.length - 1];
  next.levels.push({
    floor_height: prevLevel.floor_height,
    corners: prevLevel.corners.map(c => ({ ...c })), // Copy footprint by default
    doors: [], windows: [], stairs: [], hatches: []
  });
  return next;
}

export function addBlueprintStairs(building, levelIndex, stairsData) {
  const next = { ...building };
  next.levels[levelIndex].stairs.push({
    start_x: stairsData.x,
    start_y: stairsData.y,
    direction: stairsData.direction || 0,
    width: stairsData.width || 3,
    turns: stairsData.turns || 0,
    going_down: stairsData.going_down || false,
    ...stairsData
  });
  return next;
}

export function addBlueprintHatch(building, levelIndex, hatchData) {
  const next = { ...building };
  next.levels[levelIndex].hatches.push({
    width: 3, depth: 3, has_ladder: true, ...hatchData
  });
  return next;
}

/**
 * Resizes a building by moving one corner while keeping the opposite corner anchored.
 */
export function resizeBuildingFromCorner(building, newCornerPosition, cornerOffset, roads = []) {
  const { x, y, width_feet, depth_feet } = building;

  // Calculate the original corner positions
  const halfWidth = width_feet / 2;
  const halfDepth = depth_feet / 2;

  // Apply rotation to get actual corner positions (simplified)
  const cornerX = x + cornerOffset.x * halfWidth;
  const cornerY = y + cornerOffset.y * halfDepth;

  // Calculate the change in position
  const dx = newCornerPosition.x - cornerX;
  const dy = newCornerPosition.y - cornerY;

  // Calculate new dimensions and position
  let newWidth = width_feet;
  let newDepth = depth_feet;
  let newX = x;
  let newY = y;

  // Adjust based on which corner is being moved
  if (cornerOffset.x > 0) {
    // Moving right side
    newWidth += dx * 2;  // Expand width to maintain the opposite side position
  } else {
    // Moving left side
    newWidth -= dx * 2;
  }

  if (cornerOffset.y > 0) {
    // Moving front side
    newDepth += dy * 2;  // Expand depth to maintain the opposite side position
  } else {
    // Moving back side
    newDepth -= dy * 2;
  }

  // Ensure dimensions are positive
  newWidth = Math.max(10, newWidth);
  newDepth = Math.max(10, newDepth);

  // Adjust center position to keep the opposite corner in place
  newX += (cornerOffset.x * halfWidth - (cornerOffset.x * newWidth / 2));
  newY += (cornerOffset.y * halfDepth - (cornerOffset.y * newDepth / 2));

  // Snap to roads if this is a road-facing building
  if (building.front_road_id && roads.length > 0) {
    const snapped = snapBuildingPlacement(
      { ...building, x: newX, y: newY, width_feet: newWidth, depth_feet: newDepth },
      [],
      roads
    );
    return snapped;
  }

  return {
    ...building,
    x: newX,
    y: newY,
    width_feet: newWidth,
    depth_feet: newDepth
  };
}
