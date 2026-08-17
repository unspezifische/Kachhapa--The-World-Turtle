import { calibrateReferenceLayer, firstPersonLookAngles, heightmapHeightAt, insertRoadControlPoint, nearestRoadPoint, pitchPositionAroundTarget, referenceLayerUv, resizeBuildingFromCorner, roadWidthAt, rotatePositionAroundVerticalAxis, snapBuildingPlacement, terrainHeightAt, terrainSurfaceWeights, waterFlowSpeed } from './settlementEditor';

test('camera rotation preserves radius and opposite turns restore the position', () => {
  const target={x:3,y:0,z:-2},position={x:13,y:15,z:8};
  const turned=rotatePositionAroundVerticalAxis(position,target,Math.PI/2);
  expect(Math.hypot(turned.x-target.x,turned.z-target.z)).toBeCloseTo(Math.hypot(position.x-target.x,position.z-target.z));
  const restored=rotatePositionAroundVerticalAxis(turned,target,-Math.PI/2);
  expect(restored.x).toBeCloseTo(position.x);
  expect(restored.y).toBe(position.y);
  expect(restored.z).toBeCloseTo(position.z);
});

test('camera pitch preserves orbit radius and can be reversed', () => {
  const target={x:3,y:2,z:-2},position={x:13,y:10,z:8};
  const pitched=pitchPositionAroundTarget(position,target,.2);
  expect(Math.hypot(pitched.x-target.x,pitched.y-target.y,pitched.z-target.z)).toBeCloseTo(Math.hypot(position.x-target.x,position.y-target.y,position.z-target.z));
  expect(pitched.y).toBeGreaterThan(position.y);
  const restored=pitchPositionAroundTarget(pitched,target,-.2);
  expect(restored.x).toBeCloseTo(position.x);
  expect(restored.y).toBeCloseTo(position.y);
  expect(restored.z).toBeCloseTo(position.z);
});

test('known-distance calibration scales a reference layer without changing its aspect ratio', () => {
  const layer={width_feet:1000,height_feet:500,pixel_width:2000};
  const calibrated=calibrateReferenceLayer(layer,{x:0,y:0},{x:100,y:0},250);
  expect(calibrated.width_feet).toBe(2500);
  expect(calibrated.height_feet).toBe(1250);
  expect(calibrated.feet_per_pixel).toBe(1.25);
});

test('reference layer UVs keep map north at the top and respect calibrated extents', () => {
  const layer={width_feet:100,height_feet:200,origin_x:10,origin_y:20,rotation_degrees:0};
  expect(referenceLayerUv(layer,10,120)).toEqual({u:.5,v:1});
  expect(referenceLayerUv(layer,-40,20)).toEqual({u:0,v:.5});
});

test('first-person mouse look follows conventional axes and supports inversion', () => {
  const normal=firstPersonLookAngles(0,0,10,-10,{sensitivity:50});
  expect(normal.yaw).toBeGreaterThan(0);
  expect(normal.pitch).toBeGreaterThan(0);
  const inverted=firstPersonLookAngles(0,0,10,-10,{sensitivity:50,invertX:true,invertY:true});
  expect(inverted.yaw).toBeLessThan(0);
  expect(inverted.pitch).toBeLessThan(0);
});

test('terrain strokes blend smoothly and stop at their radius', () => {
  const strokes=[{x:0,y:0,radius:100,delta:20}];
  expect(terrainHeightAt(strokes,0,0)).toBe(20);
  expect(terrainHeightAt(strokes,100,0)).toBe(0);
  expect(terrainHeightAt(strokes,50,0)).toBeCloseTo(11.25);
});

test('heightmaps are bilinearly sampled in world-foot bounds and remain sculptable', () => {
  const heightmap={grid_width:2,grid_height:2,values:[0,255,0,255],width_feet:100,height_feet:100,origin_x:0,origin_y:0,min_elevation_feet:0,max_elevation_feet:200};
  expect(heightmapHeightAt(heightmap,-50,0)).toBe(0);
  expect(heightmapHeightAt(heightmap,50,0)).toBe(200);
  expect(terrainHeightAt([{x:50,y:0,radius:20,delta:10}],50,0,heightmap)).toBe(210);
});

test('heightmap strength scales both positive and negative relief around world zero', () => {
  const heightmap={grid_width:2,grid_height:2,values:[255,255,255,255],width_feet:100,height_feet:100,origin_x:0,origin_y:0,min_elevation_feet:10,max_elevation_feet:210,strength:.5};
  expect(heightmapHeightAt(heightmap,0,0)).toBe(105);
  expect(heightmapHeightAt({...heightmap,values:[0,0,0,0],min_elevation_feet:-120,max_elevation_feet:120,strength:2},0,0)).toBe(-240);
});

test('terrain material shifts from sand to rock and snow by elevation and slope', () => {
  expect(terrainSurfaceWeights(-12,1).sand).toBeGreaterThan(terrainSurfaceWeights(45,1).sand);
  expect(terrainSurfaceWeights(45,.55).rock).toBeGreaterThan(terrainSurfaceWeights(45,1).rock);
  expect(terrainSurfaceWeights(1600,1).snow).toBeGreaterThan(terrainSurfaceWeights(60,1).snow);
  expect(terrainSurfaceWeights(120,1).grass).toBeGreaterThan(.8);
});

test('terrain snow line and sea level are configurable', () => {
  expect(terrainSurfaceWeights(700,1,{snow_line_feet:500,snow_blend_feet:200}).snow).toBeGreaterThan(0);
  expect(terrainSurfaceWeights(90,1,{sea_level_feet:100}).sand).toBeGreaterThan(terrainSurfaceWeights(90,1,{sea_level_feet:0}).sand);
});

test('river flow accelerates when channels narrow, shallow, or steepen', () => {
  const broad=waterFlowSpeed({width_feet:60,depth_feet:10,slope:0});
  expect(waterFlowSpeed({width_feet:12,depth_feet:2,slope:0})).toBeGreaterThan(broad);
  expect(waterFlowSpeed({width_feet:60,depth_feet:10,slope:.08})).toBeGreaterThan(broad);
});

test('nearestRoadPoint projects onto a road segment', () => {
  const hit=nearestRoadPoint({x:40,y:30},[{id:'road',width_feet:30,points:[{x:0,y:0},{x:100,y:0}]}]);
  expect(hit.point).toEqual({x:40,y:0});
  expect(hit.distance).toBe(30);
});

test('clicking a road span inserts a control point into that span', () => {
  const road={id:'road',width_feet:30,points:[{x:0,y:0},{x:100,y:0},{x:100,y:100}]};
  const updated=insertRoadControlPoint(road,{x:92.4,y:61.6});
  expect(updated.points).toEqual([{x:0,y:0},{x:100,y:0},{x:100,y:62,width_feet:30},{x:100,y:100}]);
  expect(road.points).toHaveLength(3);
});

test('clicking the closing span of a closed wall inserts a control point', () => {
  const wall={id:'wall',closed:true,width_feet:24,points:[{x:0,y:0},{x:100,y:0},{x:100,y:100}]};
  const updated=insertRoadControlPoint(wall,{x:45,y:55});
  expect(updated.points).toHaveLength(4);
  expect(updated.points[3]).toEqual({x:50,y:50,width_feet:24});
});

test('road width interpolates between control points and survives point insertion', () => {
  const road={id:'road',width_feet:30,points:[{x:0,y:0,width_feet:20},{x:100,y:0,width_feet:60}]};
  expect(roadWidthAt(road,.5)).toBe(40);
  const updated=insertRoadControlPoint(road,{x:25,y:12});
  expect(updated.points[1]).toEqual({x:25,y:0,width_feet:30});
});

test('duplicate road names retain independent IDs and local widths', () => {
  const roads=[
    {id:'north-high-road',name:'High Road',width_feet:20,points:[{x:0,y:0,width_feet:20},{x:100,y:0,width_feet:40}]},
    {id:'south-high-road',name:'High Road',width_feet:60,points:[{x:0,y:100},{x:100,y:100}]},
  ];
  const hit=nearestRoadPoint({x:75,y:4},roads);
  expect(hit.road.id).toBe('north-high-road');
  expect(hit.width_feet).toBe(35);
});

test('buildings align their front edge with the road and snap beside neighbors', () => {
  const roads=[{id:'road',width_feet:30,points:[{x:-100,y:0},{x:100,y:0}]}];
  const first=snapBuildingPlacement({id:'a',x:0,y:40,width_feet:40,depth_feet:30,rotation:0},[],roads);
  const second=snapBuildingPlacement({id:'b',x:38,y:42,width_feet:40,depth_feet:30,rotation:0},[first],roads);
  expect(first.front_road_id).toBe('road');
  expect(Math.abs(first.y)).toBe(30);
  expect(Math.hypot(second.x-first.x,second.y-first.y)).toBeCloseTo(40);
});

test('moving a footprint corner keeps its opposite corner anchored', () => {
  const building={x:0,y:0,width_feet:40,depth_feet:20,rotation:0};
  const resized=resizeBuildingFromCorner(building,{x:30,y:20},{x:1,y:1});
  expect(resized.width_feet).toBe(50);
  expect(resized.depth_feet).toBe(30);
  expect(resized.x).toBe(5);
  expect(resized.y).toBe(5);
});

test('a road-fronting building remains edge-snapped when its footprint expands', () => {
  const roads=[{id:'road',width_feet:30,points:[{x:-100,y:0},{x:100,y:0}]}];
  const building={id:'warehouse',x:0,y:30,width_feet:40,depth_feet:30,rotation:0,front_road_id:'road'};
  const resized=resizeBuildingFromCorner(building,{x:35,y:-25},{x:1,y:-1},roads);
  expect(resized.y-resized.depth_feet/2).toBeCloseTo(15);
});
