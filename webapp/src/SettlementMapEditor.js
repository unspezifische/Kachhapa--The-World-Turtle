import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Html, Line, OrbitControls, Sky, useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import HomeWorkIcon from '@mui/icons-material/HomeWork';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import StorefrontIcon from '@mui/icons-material/Storefront';
import {
  createBuilding,
  FEET_PER_SCENE_UNIT,
  firstPersonLookAngles,
  insertRoadControlPoint,
  pitchPositionAroundTarget,
  referenceLayerUv,
  resizeBuildingFromCorner,
  roadWidthAt,
  rotatePositionAroundVerticalAxis,
  snapBuildingPlacement,
  terrainHeightAt,
  terrainSurfaceWeights,
  threeToWorld,
  waterFlowSpeed,
  worldToThree,
} from './settlementEditor';
import './SettlementPresentation.css';

const TERRAIN_SIZE_FEET = 1800;
const TERRAIN_SEGMENTS = 256;
const CORNERS = [{x:-1,y:-1},{x:1,y:-1},{x:1,y:1},{x:-1,y:1}];
const EDIT_PLANE = new THREE.Plane(new THREE.Vector3(0,1,0),0);
const BIOME_TINTS={city:'#8c8170',forest:'#315e3b',swamp:'#4a6758',grassland:'#6f934f',farmland:'#9d884c',pasture:'#88a867'};

function pointInsideRegion(x,y,region){
  let inside=false;const points=region?.points||[];
  for(let index=0,previous=points.length-1;index<points.length;previous=index++){
    const a=points[index],b=points[previous];
    if(((a.y>y)!==(b.y>y))&&x<(b.x-a.x)*(y-a.y)/((b.y-a.y)||.000001)+a.x)inside=!inside;
  }
  return inside;
}

function editorBounds(referenceLayers,heightMap){
  const layers=[...(referenceLayers||[]).filter(layer=>layer.image_url),...(heightMap?[heightMap]:[])];
  if(!layers.length)return{minX:-TERRAIN_SIZE_FEET/2,maxX:TERRAIN_SIZE_FEET/2,minY:-TERRAIN_SIZE_FEET/2,maxY:TERRAIN_SIZE_FEET/2,width:TERRAIN_SIZE_FEET,height:TERRAIN_SIZE_FEET};
  const minX=Math.min(-TERRAIN_SIZE_FEET/2,...layers.map(layer=>(Number(layer.origin_x)||0)-Number(layer.width_feet)/2));
  const maxX=Math.max(TERRAIN_SIZE_FEET/2,...layers.map(layer=>(Number(layer.origin_x)||0)+Number(layer.width_feet)/2));
  const minY=Math.min(-TERRAIN_SIZE_FEET/2,...layers.map(layer=>(Number(layer.origin_y)||0)-Number(layer.height_feet)/2));
  const maxY=Math.max(TERRAIN_SIZE_FEET/2,...layers.map(layer=>(Number(layer.origin_y)||0)+Number(layer.height_feet)/2));
  return{minX,maxX,minY,maxY,width:maxX-minX,height:maxY-minY};
}

function terrainGeometry(strokes,bounds,heightMap,terrainMaterial) {
  const geometry=new THREE.BufferGeometry();
  const vertices=[],indices=[],uvs=[];
  for(let row=0;row<=TERRAIN_SEGMENTS;row+=1){
    const y=bounds.minY+(row/TERRAIN_SEGMENTS)*bounds.height;
    for(let column=0;column<=TERRAIN_SEGMENTS;column+=1){
      const x=bounds.minX+(column/TERRAIN_SEGMENTS)*bounds.width;
      vertices.push(x/FEET_PER_SCENE_UNIT,terrainHeightAt(strokes,x,y,heightMap)/FEET_PER_SCENE_UNIT,-y/FEET_PER_SCENE_UNIT);
      uvs.push(column/TERRAIN_SEGMENTS,row/TERRAIN_SEGMENTS);
    }
  }
  for(let row=0;row<TERRAIN_SEGMENTS;row+=1){
    for(let column=0;column<TERRAIN_SEGMENTS;column+=1){
      const a=row*(TERRAIN_SEGMENTS+1)+column,b=a+1,c=a+TERRAIN_SEGMENTS+1,d=c+1;
      // The terrain is built in X/-Z space. Counter-clockwise winding from
      // above keeps the textured side facing the camera instead of showing
      // the mirrored back face of the map.
      indices.push(a,b,c,b,d,c);
    }
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const normals=geometry.getAttribute('normal'),positions=geometry.getAttribute('position'),colors=[];
  const palette={sand:new THREE.Color('#cdbb82'),grass:new THREE.Color('#66844e'),dirt:new THREE.Color('#80684b'),rock:new THREE.Color('#77766f'),snow:new THREE.Color('#e8edf0')};
  for(let index=0;index<positions.count;index+=1){
    const weights=terrainSurfaceWeights(positions.getY(index)*FEET_PER_SCENE_UNIT,normals.getY(index),terrainMaterial);
    const color=new THREE.Color(0,0,0);
    Object.entries(weights).forEach(([surface,weight])=>{color.r+=palette[surface].r*weight;color.g+=palette[surface].g*weight;color.b+=palette[surface].b*weight;});
    const worldX=positions.getX(index)*FEET_PER_SCENE_UNIT,worldY=-positions.getZ(index)*FEET_PER_SCENE_UNIT;
    const region=[...(terrainMaterial?.regions||[])].reverse().find(value=>pointInsideRegion(worldX,worldY,value));
    if(region&&BIOME_TINTS[region.region_type])color.lerp(new THREE.Color(BIOME_TINTS[region.region_type]),region.region_type==='city'?.28:.36);
    colors.push(color.r,color.g,color.b);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  return geometry;
}

function TerrainReferenceProjection({layer,terrain,lit=false}){
  const texture=useTexture(layer.image_url),geometry=useMemo(()=>{
    const projected=terrain.clone(),positions=projected.getAttribute('position'),uvs=[];
    for(let index=0;index<positions.count;index+=1){
      const uv=referenceLayerUv(layer,positions.getX(index)*FEET_PER_SCENE_UNIT,-positions.getZ(index)*FEET_PER_SCENE_UNIT);
      uvs.push(uv.u,uv.v);
    }
    projected.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));return projected;
  },[layer,terrain]);
  useEffect(()=>{texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;texture.needsUpdate=true;return()=>geometry.dispose();},[geometry,texture]);
  const materialProps={map:texture,color:'#ffffff',transparent:true,opacity:THREE.MathUtils.clamp(Number(layer.opacity??.7),0,1),depthTest:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4,side:THREE.DoubleSide};
  return <mesh geometry={geometry} renderOrder={lit?1:2} raycast={()=>null}>
    {lit?<meshStandardMaterial {...materialProps} roughness={.96} metalness={0}/>:<meshBasicMaterial {...materialProps}/>} 
  </mesh>;
}

function roadGeometry(road,strokes,heightMap){
  const points=(road.points||[]).map(point=>new THREE.Vector3(point.x/FEET_PER_SCENE_UNIT,0,-point.y/FEET_PER_SCENE_UNIT));
  if(points.length<2)return new THREE.BufferGeometry();
  const curve=new THREE.CatmullRomCurve3(points,false,'catmullrom',.35),samples=Math.max(32,points.length*32),vertices=[],indices=[],uvs=[];
  for(let index=0;index<=samples;index+=1){
    const amount=index/samples,point=curve.getPoint(amount),tangent=curve.getTangent(amount).setY(0).normalize();
    const normal=new THREE.Vector3(-tangent.z,0,tangent.x).multiplyScalar(roadWidthAt(road,amount)/(2*FEET_PER_SCENE_UNIT));
    const left={x:(point.x+normal.x)*FEET_PER_SCENE_UNIT,y:-(point.z+normal.z)*FEET_PER_SCENE_UNIT};
    const right={x:(point.x-normal.x)*FEET_PER_SCENE_UNIT,y:-(point.z-normal.z)*FEET_PER_SCENE_UNIT};
    vertices.push(point.x+normal.x,(terrainHeightAt(strokes,left.x,left.y,heightMap)+.9)/FEET_PER_SCENE_UNIT,point.z+normal.z,point.x-normal.x,(terrainHeightAt(strokes,right.x,right.y,heightMap)+.9)/FEET_PER_SCENE_UNIT,point.z-normal.z);
    uvs.push(0,index/samples*8,1,index/samples*8);
    if(index<samples){const offset=index*2;indices.push(offset,offset+2,offset+1,offset+1,offset+2,offset+3);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function RoadMesh({road,strokes,heightMap,selected,onSelect,onInsert,preview=false}){
  const geometry=useMemo(()=>roadGeometry(road,strokes,heightMap),[road,strokes,heightMap]);
  const opacity=preview?.68:THREE.MathUtils.clamp(Number(road.opacity??.78),.2,1);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh geometry={geometry} receiveShadow onClick={event=>{if(preview)return;event.stopPropagation();onSelect(road.id);if(onInsert)onInsert(road.id,threeToWorld(event.point));}}>
    <meshStandardMaterial color={selected?'#f2cf78':'#9b8569'} transparent={opacity<1} opacity={opacity} depthWrite={opacity>=.98} roughness={.98} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2}/>
  </mesh>;
}

function fortificationGeometry(wall,strokes,heightMap){
  const source=(wall.points||[]).map(point=>new THREE.Vector3(point.x/FEET_PER_SCENE_UNIT,0,-point.y/FEET_PER_SCENE_UNIT));
  if(source.length<2)return new THREE.BufferGeometry();
  const curve=new THREE.CatmullRomCurve3(source,Boolean(wall.closed),'catmullrom',.2),samples=Math.max(24,source.length*18),vertices=[],indices=[];
  const halfWidth=(Number(wall.width_feet)||24)/(2*FEET_PER_SCENE_UNIT),height=(Number(wall.height_feet)||35)/FEET_PER_SCENE_UNIT;
  for(let index=0;index<=samples;index+=1){
    const amount=index/samples,point=curve.getPoint(amount),tangent=curve.getTangent(amount).setY(0).normalize(),normal=new THREE.Vector3(-tangent.z,0,tangent.x).multiplyScalar(halfWidth);
    const leftX=(point.x+normal.x)*FEET_PER_SCENE_UNIT,leftY=-(point.z+normal.z)*FEET_PER_SCENE_UNIT,rightX=(point.x-normal.x)*FEET_PER_SCENE_UNIT,rightY=-(point.z-normal.z)*FEET_PER_SCENE_UNIT;
    const leftBase=terrainHeightAt(strokes,leftX,leftY,heightMap)/FEET_PER_SCENE_UNIT,rightBase=terrainHeightAt(strokes,rightX,rightY,heightMap)/FEET_PER_SCENE_UNIT;
    vertices.push(point.x+normal.x,leftBase,point.z+normal.z,point.x-normal.x,rightBase,point.z-normal.z,point.x+normal.x,leftBase+height,point.z+normal.z,point.x-normal.x,rightBase+height,point.z-normal.z);
    if(index<samples){const offset=index*4,next=offset+4;indices.push(offset,next,offset+2,offset+2,next,next+2,offset+1,offset+3,next+1,offset+3,next+3,next+1,offset+2,next+2,offset+3,offset+3,next+2,next+3);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function FortificationMesh({wall,strokes,heightMap,selected,onSelect,onInsert}){
  const geometry=useMemo(()=>fortificationGeometry(wall,strokes,heightMap),[wall,strokes,heightMap]);useEffect(()=>()=>geometry.dispose(),[geometry]);
  if(wall.visible===false)return null;
  const select=event=>{event.stopPropagation();onSelect?.(wall.id);onInsert?.(wall.id,threeToWorld(event.point));};
  return <group><mesh geometry={geometry} castShadow receiveShadow onClick={select}><meshStandardMaterial color={selected?'#e3bd66':'#82786a'} emissive={selected?'#6d521d':'#000000'} emissiveIntensity={selected ? .32 : 0} roughness={.96}/></mesh>{(wall.points||[]).filter((_,index)=>index===0||index===(wall.points.length-1)||index%2===0).map((point,index)=>{const base=terrainHeightAt(strokes,point.x,point.y,heightMap),height=Number(wall.height_feet)||35,width=(Number(wall.width_feet)||24)*1.65;return <mesh key={`${wall.id}-tower-${index}`} position={worldToThree(point.x,point.y,base+height/2)} castShadow onClick={select}><cylinderGeometry args={[width/(2*FEET_PER_SCENE_UNIT),width/(2*FEET_PER_SCENE_UNIT),height/FEET_PER_SCENE_UNIT,10]}/><meshStandardMaterial color={selected?'#cda957':'#756c60'} roughness={.98}/></mesh>;})}</group>;
}

function RoadHandle({position,color,editable,onStart,onMove,onEnd,onRemove}){
  const ref=useRef(),{camera}=useThree();
  useFrame(()=>{if(!ref.current)return;const scale=THREE.MathUtils.clamp(camera.position.distanceTo(ref.current.position)*.035,1,45);ref.current.scale.setScalar(scale);});
  return <mesh ref={ref} position={position} renderOrder={30}
    onPointerDown={editable?event=>{event.stopPropagation();event.target.setPointerCapture?.(event.pointerId);onStart();}:undefined}
    onPointerMove={editable?event=>{event.stopPropagation();if(event.buttons===1)onMove(event);}:undefined}
    onPointerUp={editable?event=>{event.stopPropagation();event.target.releasePointerCapture?.(event.pointerId);onEnd();}:undefined}
    onDoubleClick={editable&&onRemove?event=>{event.stopPropagation();onRemove();}:undefined}>
    <sphereGeometry args={[.2,18,12]}/><meshBasicMaterial color={color} depthTest={false}/>
  </mesh>;
}

function RoadSplineHandles({road,strokes,heightMap,editable,onStart,onMove,onEnd,onRemove,color='#ffdc78'}){
  const points=road.points||[];
  if(!points.length)return null;
  return <group>
    {points.length>1&&<Line points={[...points,...(road.closed?[points[0]]:[])].map(point=>worldToThree(point.x,point.y,terrainHeightAt(strokes,point.x,point.y,heightMap)+2.2))} color={color} lineWidth={2.5} transparent opacity={.92} depthTest={false}/>} 
    {points.map((point,index)=><RoadHandle key={`${road.id}:${index}`} position={worldToThree(point.x,point.y,terrainHeightAt(strokes,point.x,point.y,heightMap)+3)} color={index===0?'#72d7ff':index===points.length-1?'#ff9a72':'#ffe08a'} editable={editable} onStart={()=>onStart(index)} onMove={onMove} onEnd={onEnd} onRemove={points.length>2&&index>0&&index<points.length-1?()=>onRemove(index):undefined}/>) }
  </group>;
}

function riverGeometry(body,strokes,heightMap){
  let sourcePoints=[...(body.points||[])];
  if(sourcePoints.length<2)return new THREE.BufferGeometry();
  if(terrainHeightAt(strokes,sourcePoints[0].x,sourcePoints[0].y,heightMap)<terrainHeightAt(strokes,sourcePoints.at(-1).x,sourcePoints.at(-1).y,heightMap))sourcePoints.reverse();
  const curve=new THREE.CatmullRomCurve3(sourcePoints.map(point=>new THREE.Vector3(point.x/FEET_PER_SCENE_UNIT,0,-point.y/FEET_PER_SCENE_UNIT)),false,'catmullrom',.35);
  const samples=Math.max(36,sourcePoints.length*28),vertices=[],indices=[],uvs=[];let previousHeight=Infinity;
  for(let index=0;index<=samples;index+=1){
    const point=curve.getPoint(index/samples),tangent=curve.getTangent(index/samples).setY(0).normalize(),normal=new THREE.Vector3(-tangent.z,0,tangent.x).multiplyScalar((body.width_feet||30)/(2*FEET_PER_SCENE_UNIT));
    const center={x:point.x*FEET_PER_SCENE_UNIT,y:-point.z*FEET_PER_SCENE_UNIT};
    previousHeight=Math.min(previousHeight,terrainHeightAt(strokes,center.x,center.y,heightMap)+1.1);
    vertices.push(point.x+normal.x,previousHeight/FEET_PER_SCENE_UNIT,point.z+normal.z,point.x-normal.x,previousHeight/FEET_PER_SCENE_UNIT,point.z-normal.z);
    uvs.push(0,index/samples*10,1,index/samples*10);
    if(index<samples){const offset=index*2;indices.push(offset,offset+2,offset+1,offset+1,offset+2,offset+3);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function WaterMaterial({body,flowSpeed}){
  const material=useRef();
  useFrame(({clock})=>{if(material.current)material.current.uniforms.time.value=clock.elapsedTime;});
  return <shaderMaterial ref={material} transparent depthWrite={false} side={THREE.DoubleSide} uniforms={{time:{value:0},flowSpeed:{value:flowSpeed},ocean:{value:body.water_type==='ocean'?1:0},waterColor:{value:new THREE.Color(body.water_type==='ocean'?'#1d6685':'#338ca0')}}} vertexShader={`uniform float time; uniform float ocean; varying vec2 vUv; void main(){vUv=uv;vec3 p=position;p.z+=ocean*(sin(p.x*2.4+time*.8)+cos(p.y*2.1+time*.55))*.018;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`} fragmentShader={`uniform float time;uniform float flowSpeed;uniform vec3 waterColor;varying vec2 vUv;void main(){float ripple=sin((vUv.y-time*flowSpeed)*34.0+sin(vUv.x*17.0))*.07;float crest=smoothstep(.82,1.0,sin((vUv.x+vUv.y-time*flowSpeed*.45)*22.0));gl_FragColor=vec4(waterColor+vec3(ripple+crest*.16),.72);}`}/>;
}

function WaterMesh({body,strokes,heightMap}){
  const isRiver=body.water_type==='river';
  const geometry=useMemo(()=>{
    if(isRiver)return riverGeometry(body,strokes,heightMap);
    const shape=new THREE.Shape((body.points||[]).map(point=>new THREE.Vector2(point.x/FEET_PER_SCENE_UNIT,point.y/FEET_PER_SCENE_UNIT)));
    return new THREE.ShapeGeometry(shape);
  },[body,strokes,heightMap,isRiver]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  const heights=(body.points||[]).map(point=>terrainHeightAt(strokes,point.x,point.y,heightMap));
  const elevation=body.surface_elevation_feet??(body.water_type==='ocean'?0:(heights.length?Math.min(...heights)+.7:.7));
  const length=Math.max(1,...(body.points||[]).slice(1).map((point,index)=>Math.hypot(point.x-body.points[index].x,point.y-body.points[index].y)));
  const slope=isRiver?Math.abs((heights[0]||0)-(heights.at(-1)||0))/length:0;
  return <mesh geometry={geometry} rotation={isRiver?undefined:[-Math.PI/2,0,0]} position={isRiver?undefined:[0,elevation/FEET_PER_SCENE_UNIT,0]} renderOrder={4}><WaterMaterial body={body} flowSpeed={waterFlowSpeed({...body,slope})}/></mesh>;
}

const REGION_COLORS={city:'#c79b54',forest:'#326a3f',swamp:'#4f6b59',grassland:'#78a35d',farmland:'#b59a52',pasture:'#91ad6c'};
function RegionMesh({region,strokes,heightMap,selected,onSelect,interactive}){
  const points=useMemo(()=>region.points||[],[region.points]),geometry=useMemo(()=>points.length>=3?new THREE.ShapeGeometry(new THREE.Shape(points.map(point=>new THREE.Vector2(point.x/FEET_PER_SCENE_UNIT,point.y/FEET_PER_SCENE_UNIT)))):new THREE.BufferGeometry(),[points]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  if(points.length<3||region.visible===false)return null;
  const elevation=Math.max(...points.map(point=>terrainHeightAt(strokes,point.x,point.y,heightMap)))+1.4;
  return <group><mesh geometry={geometry} rotation={[-Math.PI/2,0,0]} position={[0,elevation/FEET_PER_SCENE_UNIT,0]} renderOrder={3} raycast={interactive?undefined:()=>null} onClick={interactive?event=>{event.stopPropagation();onSelect(region.id);}:undefined}><meshBasicMaterial color={REGION_COLORS[region.region_type]||REGION_COLORS.grassland} transparent opacity={selected?.28:.14} depthWrite={false} side={THREE.DoubleSide}/></mesh><Line points={[...points,points[0]].map(point=>worldToThree(point.x,point.y,terrainHeightAt(strokes,point.x,point.y,heightMap)+2))} color={selected?'#ffe09a':REGION_COLORS[region.region_type]||REGION_COLORS.grassland} lineWidth={selected?3:1.5} transparent opacity={.9}/></group>;
}

function ExternalAssetModel({url,width,depth,height}){
  const{scene}=useGLTF(url);
  const{object,scale}=useMemo(()=>{
    const clone=scene.clone(true),bounds=new THREE.Box3().setFromObject(clone),size=bounds.getSize(new THREE.Vector3());
    clone.position.set(-(bounds.min.x+bounds.max.x)/2,-bounds.min.y,-(bounds.min.z+bounds.max.z)/2);
    return{object:clone,scale:Math.min(width/Math.max(size.x,.001),depth/Math.max(size.z,.001),height/Math.max(size.y,.001))};
  },[scene,width,depth,height]);
  return <primitive object={object} scale={scale}/>;
}

function buildingPresentationType(building,asset){
  const value=`${building.building_type||''} ${building.district_key||''} ${asset?.category||''}`.toLowerCase();
  if(/government|governance|civic|palace|hall/.test(value))return'government';
  if(/shop|commercial|market|tavern|inn|hospitality|service|industrial|artisan|warehouse/.test(value))return'shop';
  return'residence';
}

function BuildingTooltip({building,asset,strokes,heightMap}){
  const kind=buildingPresentationType(building,asset),roof=buildingSurfaceElevation(building,strokes,heightMap)+(building.elevation||0)+(asset?.height_feet||30);
  const roofPoint=worldToThree(building.x,building.y,roof+2),labelPoint=worldToThree(building.x,building.y,roof+20);
  const Icon=kind==='government'?AccountBalanceIcon:kind==='shop'?StorefrontIcon:HomeWorkIcon;
  return <group>
    <Line points={[roofPoint,labelPoint]} color="#f0d28a" lineWidth={1.25} depthTest={false}/>
    <Html position={labelPoint} transform sprite center distanceFactor={12} zIndexRange={[30,0]}>
      <div className={`building-world-tooltip ${kind}`}><span><Icon/></span><div><strong>{building.name||asset?.name||'Building'}</strong><small>{kind}</small></div></div>
    </Html>
  </group>;
}

function buildingSurfaceElevation(building,strokes,heightMap){
  const halfWidth=Number(building.width_feet||0)/2,halfDepth=Number(building.depth_feet||0)/2,rotation=Number(building.rotation)||0,cos=Math.cos(rotation),sin=Math.sin(rotation);
  const samples=[{x:0,y:0},...CORNERS.map(corner=>({x:corner.x*halfWidth,y:corner.y*halfDepth}))];
  return Math.max(...samples.map(sample=>terrainHeightAt(strokes,Number(building.x)+sample.x*cos-sample.y*sin,Number(building.y)+sample.x*sin+sample.y*cos,heightMap)));
}

function BuiltInBuilding({building,asset,selected,onSelect,onContextMenu,onStartMove,onStartResize,onDragMove,onDragEnd,strokes,heightMap}){
  const width=building.width_feet/FEET_PER_SCENE_UNIT,depth=building.depth_feet/FEET_PER_SCENE_UNIT,height=(asset?.height_feet||30)/FEET_PER_SCENE_UNIT;
  const elevation=buildingSurfaceElevation(building,strokes,heightMap)+(building.elevation||0),position=worldToThree(building.x,building.y,elevation);
  const roofHeight=height+.2;
  return <group position={position} rotation={[0,-building.rotation,0]} onClick={event=>{event.stopPropagation();onSelect(building);}} onContextMenu={event=>{event.stopPropagation();onContextMenu?.(event,building);}} onPointerDown={event=>{if(event.button!==0)return;event.stopPropagation();event.target.setPointerCapture?.(event.pointerId);onSelect(building);onStartMove(building.id);}} onPointerMove={event=>{if(event.buttons!==1)return;event.stopPropagation();onDragMove(event);}} onPointerUp={event=>{if(event.button!==0)return;event.stopPropagation();event.target.releasePointerCapture?.(event.pointerId);onDragEnd();}}>
    {selected&&<mesh rotation-x={-Math.PI/2} position={[0,.025,0]}><planeGeometry args={[width+.16,depth+.16]}/><meshBasicMaterial color="#f3c86a" transparent opacity={.32} side={THREE.DoubleSide}/></mesh>}
    {asset?.model_url?<ExternalAssetModel url={asset.model_url} width={width} depth={depth} height={height}/>:<>
      <mesh position={[0,height/2,0]} castShadow receiveShadow><boxGeometry args={[width,height,depth]}/><meshStandardMaterial color={asset?.color||'#a76d43'} roughness={.88}/></mesh>
      <mesh position={[0,roofHeight,0]} rotation={[0,Math.PI/4,0]} castShadow><coneGeometry args={[Math.max(width,depth)*.72,.48,4]}/><meshStandardMaterial color={asset?.roof_color||'#513a30'} roughness={.9}/></mesh>
      <mesh position={[0,height*.42,depth/2+.012]}><boxGeometry args={[Math.min(.28,width*.38),height*.64,.025]}/><meshStandardMaterial color="#35251d"/></mesh>
    </>}
    {selected&&CORNERS.map(corner=><mesh key={`${corner.x}:${corner.y}`} position={[corner.x*width/2,.09,corner.y*depth/2]} onPointerDown={event=>{event.stopPropagation();event.target.setPointerCapture?.(event.pointerId);onStartResize(building.id,corner);}} onPointerMove={event=>{event.stopPropagation();onDragMove(event);}} onPointerUp={event=>{event.stopPropagation();event.target.releasePointerCapture?.(event.pointerId);onDragEnd();}}>
      <sphereGeometry args={[.105,12,8]}/><meshBasicMaterial color="#ffe08a" depthTest={false}/>
    </mesh>)}
  </group>;
}

function StreetLight({lamp,strokes,heightMap}){const surface=terrainHeightAt(strokes,lamp.x,lamp.y,heightMap),[x,y,z]=worldToThree(lamp.x,lamp.y,surface+(Number(lamp.elevation)||0));return <group position={[x,y,z]}><mesh position={[0,.75,0]} castShadow><cylinderGeometry args={[.045,.075,1.5,8]}/><meshStandardMaterial color="#2b2925"/></mesh><mesh position={[0,1.56,0]} castShadow><boxGeometry args={[.28,.32,.28]}/><meshStandardMaterial color={lamp.lit?'#ffe09a':'#47423a'} emissive={lamp.lit?'#ffb83e':'#000'} emissiveIntensity={lamp.lit?2.6:0}/></mesh>{lamp.lit&&<pointLight position={[0,1.5,0]} color="#ffbf63" intensity={2.2} distance={5.5}/>}</group>}
function MapMarker({point,color,strokes,heightMap}){if(!point)return null;const surface=terrainHeightAt(strokes,point.x,point.y,heightMap);return <mesh position={worldToThree(point.x,point.y,surface+(Number(point.elevation)||0)+8)}><cylinderGeometry args={[.28,.28,.2,24]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.4}/></mesh>}

function PointOfInterestMarker({point,onContextMenu,strokes,heightMap}){
  if(!Number.isFinite(Number(point?.x))||!Number.isFinite(Number(point?.y)))return null;
  const surface=terrainHeightAt(strokes,Number(point.x),Number(point.y),heightMap);
  return <group position={worldToThree(Number(point.x),Number(point.y),surface+(Number(point.elevation)||0)+7)} onContextMenu={event=>{event.stopPropagation();onContextMenu?.(event,{kind:'poi',point});}}>
    <mesh><sphereGeometry args={[.22,16,10]}/><meshStandardMaterial color="#e7c56f" emissive="#7f5b1f" emissiveIntensity={.65}/></mesh>
  </group>;
}

function ReferenceLayerMesh({layer,active,onPoint}){
  const texture=useTexture(layer.image_url);
  useEffect(()=>{texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;},[texture]);
  if(!layer.visible)return null;
  return <group position={worldToThree(layer.origin_x||0,layer.origin_y||0,.6)} rotation-y={-THREE.MathUtils.degToRad(layer.rotation_degrees||0)}>
    <mesh rotation-x={-Math.PI/2} renderOrder={-100} onClick={active?event=>{event.stopPropagation();onPoint(threeToWorld(event.point));}:undefined}>
      <planeGeometry args={[layer.width_feet/FEET_PER_SCENE_UNIT,layer.height_feet/FEET_PER_SCENE_UNIT]}/>
      <meshBasicMaterial map={texture} transparent opacity={layer.opacity??.7} depthWrite={false} fog={false} polygonOffset polygonOffsetFactor={1}/>
    </mesh>
  </group>;
}

function CameraRig({bounds,fitRequest,controlsRef,viewCommand,strokes,heightMap,firstPersonSettings}){
  const{camera}=useThree(),lastFitRequest=useRef(null);
  useEffect(()=>{
    if(!fitRequest||lastFitRequest.current===fitRequest)return;lastFitRequest.current=fitRequest;
    const center=worldToThree((bounds.minX+bounds.maxX)/2,(bounds.minY+bounds.maxY)/2,0);
    const span=Math.max(bounds.width,bounds.height)/FEET_PER_SCENE_UNIT;
    camera.position.set(center[0],Math.max(12,span*.92),center[2]+Math.max(8,span*.42));
    camera.near=.005;camera.far=Math.max(300,span*12);camera.updateProjectionMatrix();
    controlsRef.current?.target.set(center[0],0,center[2]);
    controlsRef.current?.update();
  },[bounds,camera,controlsRef,fitRequest]);
  useEffect(()=>{
    if(!viewCommand)return;
    if(viewCommand.mode==='camera'&&viewCommand.camera?.position?.length===3&&viewCommand.camera?.target?.length===3){
      camera.position.fromArray(viewCommand.camera.position);controlsRef.current?.target.fromArray(viewCommand.camera.target);
    }else if(viewCommand.mode==='point'&&Number.isFinite(Number(viewCommand.point?.x))&&Number.isFinite(Number(viewCommand.point?.y))){
      const next=new THREE.Vector3(...worldToThree(Number(viewCommand.point.x),Number(viewCommand.point.y),Number(viewCommand.point.elevation)||0));
      const current=controlsRef.current?.target||new THREE.Vector3();camera.position.add(next.clone().sub(current));controlsRef.current?.target.copy(next);
    }else if(viewCommand.mode==='topdown'){
      camera.fov=42;camera.near=.005;
      const target=controlsRef.current?.target||new THREE.Vector3();
      const distance=Math.max(12,camera.position.distanceTo(target));
      camera.position.set(target.x,target.y+distance,target.z+.001);
    }else if(viewCommand.mode==='firstPerson'){
      camera.fov=Number(firstPersonSettings?.fov)||75;camera.near=.001;
      const target=(controlsRef.current?.target||new THREE.Vector3()).clone();
      const forward=target.clone().sub(camera.position).setY(0);
      if(forward.lengthSq()<.0001)forward.set(0,0,-1);else forward.normalize();
      const surface=terrainHeightAt(strokes,target.x*FEET_PER_SCENE_UNIT,-target.z*FEET_PER_SCENE_UNIT,heightMap)/FEET_PER_SCENE_UNIT;
      camera.position.set(target.x,surface+6/FEET_PER_SCENE_UNIT,target.z);
      controlsRef.current?.target.copy(camera.position).add(forward.multiplyScalar(.4));
    }else return;
    camera.updateProjectionMatrix();controlsRef.current?.update();
  },[camera,controlsRef,firstPersonSettings?.fov,heightMap,strokes,viewCommand]);
  return null;
}

function ScaleObserver({controlsRef,onScaleChange}){
  const{camera,size}=useThree(),last=useRef('');
  useFrame(()=>{
    const target=controlsRef.current?.target;if(!target||!onScaleChange||!size.height)return;
    const distance=Math.max(.02,camera.position.distanceTo(target));
    const visibleHeightFeet=2*Math.tan(THREE.MathUtils.degToRad(camera.fov||42)/2)*distance*FEET_PER_SCENE_UNIT;
    const feetPerPixel=visibleHeightFeet/size.height,desired=Math.max(.1,feetPerPixel*110),power=10**Math.floor(Math.log10(desired)),ratio=desired/power;
    const niceRatio=ratio<1.5?1:ratio<3.5?2:ratio<7.5?5:10,feet=niceRatio*power,pixels=feet/feetPerPixel;
    const key=`${feet}:${Math.round(pixels)}`;if(key===last.current)return;last.current=key;onScaleChange({feet,pixels});
  });
  return null;
}

function FirstPersonLook({enabled,controlsRef,onLockChange,settings,touchInputRef}){
  const{camera,gl}=useThree(),yaw=useRef(0),pitch=useRef(0);
  const syncFromCamera=useCallback(()=>{const direction=camera.getWorldDirection(new THREE.Vector3());yaw.current=Math.atan2(direction.x,-direction.z);pitch.current=Math.asin(THREE.MathUtils.clamp(direction.y,-1,1));},[camera]);
  const applyLook=useCallback((movementX,movementY)=>{
    if(!controlsRef.current)return;
    const next=firstPersonLookAngles(yaw.current,pitch.current,movementX,movementY,settings);
    yaw.current=next.yaw;pitch.current=next.pitch;
    const cosPitch=Math.cos(pitch.current),direction=new THREE.Vector3(Math.sin(yaw.current)*cosPitch,Math.sin(pitch.current),-Math.cos(yaw.current)*cosPitch);
    controlsRef.current.target.copy(camera.position).add(direction.multiplyScalar(.4));controlsRef.current.update();
  },[camera,controlsRef,settings]);
  useEffect(()=>{
    const updateLock=()=>{
      const locked=document.pointerLockElement===gl.domElement;onLockChange?.(locked);
      if(locked)syncFromCamera();
    };
    const aim=event=>{
      if(!enabled||document.pointerLockElement!==gl.domElement||!controlsRef.current)return;
      applyLook(event.movementX,event.movementY);
    };
    const release=event=>{if(enabled&&document.pointerLockElement===gl.domElement&&(event.code==='Escape'||event.key.toLowerCase()==='m')){event.preventDefault();event.stopImmediatePropagation();document.exitPointerLock?.();}};
    document.addEventListener('pointerlockchange',updateLock);document.addEventListener('mousemove',aim);document.addEventListener('keydown',release,true);
    return()=>{document.removeEventListener('pointerlockchange',updateLock);document.removeEventListener('mousemove',aim);document.removeEventListener('keydown',release,true);if(document.pointerLockElement===gl.domElement)document.exitPointerLock?.();};
  },[applyLook,controlsRef,enabled,gl.domElement,onLockChange,syncFromCamera]);
  useEffect(()=>{if(enabled)syncFromCamera();},[enabled,syncFromCamera]);
  useEffect(()=>{if(!enabled&&document.pointerLockElement===gl.domElement)document.exitPointerLock?.();},[enabled,gl.domElement]);
  useFrame((_,delta)=>{const touch=touchInputRef?.current;if(enabled&&touch&&(Math.abs(touch.lookX)>.01||Math.abs(touch.lookY)>.01))applyLook(touch.lookX*delta*520,touch.lookY*delta*520);});
  return null;
}

function KeyboardPan({controlsRef,virtualKeys,firstPerson,strokes,heightMap,bounds,touchInputRef,firstPersonSettings}){
  const{camera}=useThree(),keys=useRef(new Set());
  useEffect(()=>{
    const editable=target=>target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement||target?.isContentEditable;
    const normalize=event=>event.code==='ShiftLeft'?'shift':event.code==='ControlLeft'?'lower':event.key.toLowerCase();
    const down=event=>{if(editable(event.target))return;const key=normalize(event);if(['w','a','s','d','q','e','r','f','arrowup','arrowdown','arrowleft','arrowright','shift','lower'].includes(key)){keys.current.add(key);event.preventDefault();}};
    const up=event=>keys.current.delete(normalize(event));
    const blur=()=>keys.current.clear();
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
  },[]);
  useFrame((_,delta)=>{
    const target=controlsRef.current?.target,touch=touchInputRef?.current,has=key=>keys.current.has(key)||virtualKeys?.has(key);if(!target||(!firstPerson&&!keys.current.size&&!virtualKeys?.size))return;
    const frameDelta=Math.min(delta,.05);
    const turnDirection=(has('e')?1:0)-(has('q')?1:0);
    if(turnDirection){
      const rotated=rotatePositionAroundVerticalAxis(camera.position,target,turnDirection*1.15*frameDelta);
      camera.position.set(rotated.x,rotated.y,rotated.z);
    }
    const pitchDirection=(has('r')?1:0)-(has('f')?1:0);
    if(pitchDirection){
      const pitched=pitchPositionAroundTarget(camera.position,target,pitchDirection*.9*frameDelta);
      camera.position.set(pitched.x,pitched.y,pitched.z);
    }
    const forward=camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize(),right=new THREE.Vector3().crossVectors(forward,camera.up).normalize(),movement=new THREE.Vector3();
    if(has('w')||has('arrowup'))movement.add(forward);
    if(has('s')||has('arrowdown'))movement.sub(forward);
    if(has('d')||has('arrowright'))movement.add(right);
    if(has('a')||has('arrowleft'))movement.sub(right);
    if(firstPerson&&touch){movement.addScaledVector(forward,-Number(touch.moveY||0));movement.addScaledVector(right,Number(touch.moveX||0));}
    if(movement.lengthSq()){
      const walkingSpeed=Math.max(1,Number(firstPersonSettings?.walkSpeed)||8),sprinting=has('shift')||Boolean(touch?.sprint);
      const speed=(firstPerson?(walkingSpeed*(sprinting?2.25:1))/FEET_PER_SCENE_UNIT:Math.max(2,camera.position.distanceTo(target)*.72))*frameDelta;
      movement.normalize().multiplyScalar(speed);camera.position.add(movement);target.add(movement);
    }
    const elevationDirection=firstPerson?0:(has('shift')?1:0)-(has('lower')?1:0);
    if(elevationDirection){const elevationSpeed=Math.max(1,camera.position.distanceTo(target)*.45)*frameDelta*elevationDirection;camera.position.y+=elevationSpeed;target.y+=elevationSpeed;}
    if(firstPerson){
      camera.position.x=THREE.MathUtils.clamp(camera.position.x,bounds.minX/FEET_PER_SCENE_UNIT,bounds.maxX/FEET_PER_SCENE_UNIT);
      camera.position.z=THREE.MathUtils.clamp(camera.position.z,-bounds.maxY/FEET_PER_SCENE_UNIT,-bounds.minY/FEET_PER_SCENE_UNIT);
      const direction=target.clone().sub(camera.position).normalize(),surface=terrainHeightAt(strokes,camera.position.x*FEET_PER_SCENE_UNIT,-camera.position.z*FEET_PER_SCENE_UNIT,heightMap)/FEET_PER_SCENE_UNIT;
      camera.position.y=surface+(Number(firstPersonSettings?.eyeHeight)||6)/FEET_PER_SCENE_UNIT;target.copy(camera.position).add(direction.multiplyScalar(.4));
    }
    if(firstPerson||turnDirection||pitchDirection||elevationDirection||movement.lengthSq())controlsRef.current.update();
  });
  return null;
}

async function sampleHeightmap(file,bounds,minElevation,maxElevation,invert,strength=1){
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=url;await image.decode();
    const gridWidth=128,gridHeight=128,canvas=document.createElement('canvas');canvas.width=gridWidth;canvas.height=gridHeight;
    const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,gridWidth,gridHeight);
    const pixels=context.getImageData(0,0,gridWidth,gridHeight).data,values=[];
    for(let index=0;index<pixels.length;index+=4){const luminance=Math.round(pixels[index]*.2126+pixels[index+1]*.7152+pixels[index+2]*.0722);values.push(invert?255-luminance:luminance);}
    const appliedStrength=Number(strength);
    return{id:`heightmap-${Date.now()}`,layer_type:'heightmap',name:file.name,grid_width:gridWidth,grid_height:gridHeight,values,width_feet:bounds.width,height_feet:bounds.height,origin_x:(bounds.minX+bounds.maxX)/2,origin_y:(bounds.minY+bounds.maxY)/2,min_elevation_feet:minElevation,max_elevation_feet:maxElevation,strength:Number.isFinite(appliedStrength)?appliedStrength:1,strength_pivot_feet:0};
  }finally{URL.revokeObjectURL(url);}
}

function EditorWorld({activeTool,assets,buildings,setBuildings,selected,setSelected,roads,setRoads,selectedRoadId,setSelectedRoadId,setSelectedRoadPointIndex,roadMode,strokes,setStrokes,heightMap,bounds,terrainMode,terrainMaterial,brushRadius,brushStrength,selectedAssetKey,roadDraft,setRoadDraft,roadWidth,waterBodies,waterDraft,setWaterDraft,seaLevelPicking,onSeaLevelPick,regions,fortifications,setFortifications,selectedFortificationId,setSelectedFortificationId,setSelectedFortificationPointIndex,fortificationMode,fortificationDraft,setFortificationDraft,regionDraft,setRegionDraft,selectedRegionId,setSelectedRegionId,dusk,lamps,onWaypoint,partyPosition,destination,referenceLayers,onReferencePoint,calibrationPoints,fitRequest,onMapContext,onCameraChange,onScaleChange,firstPerson,onPointerLockChange,viewCommand,labelState,pointsOfInterest,virtualKeys,firstPersonSettings,touchInputRef}){
  const terrain=useMemo(()=>terrainGeometry(strokes,bounds,heightMap,terrainMaterial),[strokes,bounds,heightMap,terrainMaterial]),lastSculpt=useRef(null),[interaction,setInteraction]=useState(null);
  const controlsRef=useRef(),cameraBroadcastAt=useRef(0);const{camera}=useThree();
  useEffect(()=>()=>terrain.dispose(),[terrain]);
  const assetLookup=useMemo(()=>Object.fromEntries(assets.map(asset=>[asset.key,asset])),[assets]);
  const terrainTexture=referenceLayers.find(layer=>layer.layer_type==='terrain_texture'&&layer.visible);
  const updateBuilding=(id,updater)=>setBuildings(values=>values.map(value=>value.id===id?updater(value):value));
  const updateRoadPoint=(roadId,index,point)=>setRoads(values=>values.map(road=>road.id===roadId?{...road,points:road.points.map((value,pointIndex)=>pointIndex===index?{...value,x:Math.round(point.x),y:Math.round(point.y)}:value)}:road));
  const insertRoadPoint=(roadId,point)=>{setSelectedRoadPointIndex(null);setRoads(values=>values.map(road=>road.id===roadId?insertRoadControlPoint(road,point):road));};
  const removeRoadPoint=(roadId,index)=>{setSelectedRoadPointIndex(null);setRoads(values=>values.map(road=>road.id===roadId?{...road,points:road.points.filter((_,pointIndex)=>pointIndex!==index)}:road));};
  const updateFortificationPoint=(wallId,index,point)=>setFortifications(values=>values.map(wall=>wall.id===wallId?{...wall,points:wall.points.map((value,pointIndex)=>pointIndex===index?{...value,x:Math.round(point.x),y:Math.round(point.y)}:value)}:wall));
  const insertFortificationPoint=(wallId,point)=>{setSelectedFortificationPointIndex(null);setFortifications(values=>values.map(wall=>wall.id===wallId?insertRoadControlPoint(wall,point):wall));};
  const removeFortificationPoint=(wallId,index)=>{setSelectedFortificationPointIndex(null);setFortifications(values=>values.map(wall=>wall.id===wallId?{...wall,points:wall.points.filter((_,pointIndex)=>pointIndex!==index)}:wall));};
  const sculpt=(point)=>{const world=threeToWorld(point);if(lastSculpt.current&&Math.hypot(world.x-lastSculpt.current.x,world.y-lastSculpt.current.y)<brushRadius*.18)return;lastSculpt.current=world;setStrokes(values=>[...values,{id:`stroke-${Date.now()}-${values.length}`,x:world.x,y:world.y,radius:brushRadius,delta:terrainMode==='raise'?brushStrength:-brushStrength}].slice(-1500));};
  const applyInteraction=(event)=>{if(!interaction)return;const scenePoint=new THREE.Vector3();if(!event.ray.intersectPlane(EDIT_PLANE,scenePoint))return;const world=threeToWorld(scenePoint);if(interaction.type==='move')updateBuilding(interaction.id,building=>snapBuildingPlacement({...building,x:world.x,y:world.y},buildings,roads));else if(interaction.type==='resize')updateBuilding(interaction.id,building=>resizeBuildingFromCorner(building,world,interaction.corner,roads));else if(interaction.type==='road-point')updateRoadPoint(interaction.roadId,interaction.index,world);else if(interaction.type==='fortification-point')updateFortificationPoint(interaction.wallId,interaction.index,world);};
  const handleGroundDown=(event)=>{event.stopPropagation();if(activeTool==='terrain')sculpt(event.point);};
  const handleGroundMove=(event)=>{if(activeTool==='terrain'&&event.buttons===1)sculpt(event.point);applyInteraction(event);};
  const handleGroundClick=(event)=>{event.stopPropagation();const world=threeToWorld(event.point);if(activeTool==='build'){const asset=assetLookup[selectedAssetKey];if(asset){const next=createBuilding(asset,world,buildings,roads);setBuildings(values=>[...values,next]);setSelected(next);}}else if(activeTool==='road'&&roadMode==='draw-new'){setRoadDraft(points=>[...points,{x:Math.round(world.x),y:Math.round(world.y),width_feet:roadWidth}]);}else if(activeTool==='fortification'&&fortificationMode==='draw-new'){setFortificationDraft(points=>[...points,{x:Math.round(world.x),y:Math.round(world.y)}]);}else if(activeTool==='water'&&seaLevelPicking){onSeaLevelPick(world.elevation);}else if(activeTool==='water'){setWaterDraft(points=>[...points,{x:Math.round(world.x),y:Math.round(world.y)}]);}else if(activeTool==='region'){setRegionDraft(points=>[...points,{x:Math.round(world.x),y:Math.round(world.y)}]);}else if(activeTool==='travel')onWaypoint(world);else if(activeTool==='reference')onReferencePoint(world);else if(activeTool==='inspect')setSelected(null);};
  const openContext=(event,target)=>{const native=event.nativeEvent||event;native.preventDefault?.();const rect=native.target?.getBoundingClientRect?.();onMapContext?.({clientX:native.clientX,clientY:native.clientY,x:rect?native.clientX-rect.left:native.clientX,y:rect?native.clientY-rect.top:native.clientY,target});};
  const broadcastCamera=()=>{if(!onCameraChange)return;const now=performance.now();if(now-cameraBroadcastAt.current<80)return;cameraBroadcastAt.current=now;onCameraChange({position:camera.position.toArray(),target:(controlsRef.current?.target||new THREE.Vector3()).toArray()});};
  const visibleLabelIds=new Set((labelState?.ids||[]).map(String));
  return <>
    <color attach="background" args={[dusk?'#c48578':'#a9c9dc']}/><fog attach="fog" args={[dusk?'#c48578':'#a9c9dc',Math.max(80,Math.max(bounds.width,bounds.height)/FEET_PER_SCENE_UNIT*1.8),Math.max(180,Math.max(bounds.width,bounds.height)/FEET_PER_SCENE_UNIT*5)]}/><ambientLight intensity={dusk?.8:1.25}/><directionalLight position={[-8,14,8]} intensity={dusk?1.4:2.1} castShadow/><Sky sunPosition={dusk?[-6,2,-8]:[-4,8,-8]}/>
    {referenceLayers.filter(layer=>layer.image_url&&layer.layer_type!=='terrain_texture'&&layer.project_to_terrain===false).map(layer=><ReferenceLayerMesh key={layer.id} layer={layer} active={activeTool==='reference'} onPoint={onReferencePoint}/>)}
    <mesh geometry={terrain} receiveShadow onContextMenu={event=>{event.stopPropagation();openContext(event,{kind:'point',point:threeToWorld(event.point)});}} onPointerDown={handleGroundDown} onPointerMove={handleGroundMove} onPointerUp={()=>{setInteraction(null);lastSculpt.current=null;}} onPointerLeave={()=>{setInteraction(null);lastSculpt.current=null;}} onClick={handleGroundClick}><meshStandardMaterial vertexColors roughness={.98} side={THREE.DoubleSide}/></mesh>
    {terrainTexture&&<TerrainReferenceProjection layer={terrainTexture} terrain={terrain} lit/>}
    {referenceLayers.filter(layer=>layer.visible&&layer.image_url&&layer.layer_type!=='terrain_texture'&&layer.project_to_terrain!==false).map(layer=><TerrainReferenceProjection key={`terrain-projection-${layer.id}`} layer={layer} terrain={terrain}/>)}
    {(regions||[]).map(region=><RegionMesh key={region.id} region={region} strokes={strokes} heightMap={heightMap} selected={region.id===selectedRegionId} onSelect={setSelectedRegionId} interactive={activeTool==='region'}/>)}
    {(fortifications||[]).map(wall=><FortificationMesh key={wall.id} wall={wall} strokes={strokes} heightMap={heightMap} selected={wall.id===selectedFortificationId} onSelect={activeTool==='fortification'?id=>{setSelectedFortificationId(id);setSelectedFortificationPointIndex(null);}:undefined} onInsert={activeTool==='fortification'&&fortificationMode==='add-points'&&wall.id===selectedFortificationId?insertFortificationPoint:undefined}/>)}
    {(fortifications||[]).filter(wall=>wall.visible!==false&&wall.id===selectedFortificationId).map(wall=><RoadSplineHandles key={`wall-handles-${wall.id}`} road={wall} strokes={strokes} heightMap={heightMap} color="#7ce6ff" editable={activeTool==='fortification'&&fortificationMode==='edit-points'} onStart={index=>{setSelectedFortificationPointIndex(index);setInteraction({type:'fortification-point',wallId:wall.id,index});}} onMove={applyInteraction} onEnd={()=>setInteraction(null)} onRemove={index=>removeFortificationPoint(wall.id,index)}/>)}
    {roads.filter(road=>road.visible!==false).map(road=><RoadMesh key={road.id} road={road} strokes={strokes} heightMap={heightMap} selected={road.id===selectedRoadId} onSelect={activeTool==='road'?id=>{setSelectedRoadId(id);setSelectedRoadPointIndex(null);}:()=>{}} onInsert={activeTool==='road'&&roadMode==='add-points'&&road.id===selectedRoadId?insertRoadPoint:undefined}/>)}
    {roads.filter(road=>road.visible!==false&&road.id===selectedRoadId).map(road=><RoadSplineHandles key={`handles-${road.id}`} road={road} strokes={strokes} heightMap={heightMap} editable={activeTool==='road'&&roadMode==='edit-points'} onStart={index=>{setSelectedRoadPointIndex(index);setInteraction({type:'road-point',roadId:road.id,index});}} onMove={applyInteraction} onEnd={()=>setInteraction(null)} onRemove={index=>removeRoadPoint(road.id,index)}/>)}
    {waterBodies.map(body=><WaterMesh key={body.id} body={body} strokes={strokes} heightMap={heightMap}/>)}
    {roadDraft.length>1&&<RoadMesh road={{id:'road-preview',width_feet:roadWidth,points:roadDraft}} strokes={strokes} heightMap={heightMap} selected onSelect={()=>{}} preview/>}
    {roadDraft.length>0&&<RoadSplineHandles road={{id:'road-draft',width_feet:roadWidth,points:roadDraft}} strokes={strokes} heightMap={heightMap} editable={activeTool==='road'} onStart={index=>setInteraction({type:'road-draft-point',index})} onMove={event=>{const scenePoint=new THREE.Vector3();if(!event.ray.intersectPlane(EDIT_PLANE,scenePoint))return;const world=threeToWorld(scenePoint);setRoadDraft(points=>points.map((point,index)=>index===interaction?.index?{...point,x:Math.round(world.x),y:Math.round(world.y)}:point));}} onEnd={()=>setInteraction(null)} onRemove={index=>setRoadDraft(points=>points.filter((_,pointIndex)=>pointIndex!==index))}/>} 
    {roadDraft.length===1&&<Line points={roadDraft.map(point=>worldToThree(point.x,point.y,terrainHeightAt(strokes,point.x,point.y,heightMap)+2))} color="#ffe09a" lineWidth={3}/>} 
    {fortificationDraft.length>0&&<RoadSplineHandles road={{id:'wall-draft',points:fortificationDraft}} strokes={strokes} heightMap={heightMap} editable={activeTool==='fortification'} color="#7ce6ff" onStart={index=>setInteraction({type:'fortification-draft-point',index})} onMove={event=>{const scenePoint=new THREE.Vector3();if(!event.ray.intersectPlane(EDIT_PLANE,scenePoint))return;const world=threeToWorld(scenePoint);setFortificationDraft(points=>points.map((point,index)=>index===interaction?.index?{...point,x:Math.round(world.x),y:Math.round(world.y)}:point));}} onEnd={()=>setInteraction(null)} onRemove={index=>setFortificationDraft(points=>points.filter((_,pointIndex)=>pointIndex!==index))}/>} 
    {waterDraft.length>1&&<Line points={waterDraft.map(point=>worldToThree(point.x,point.y,terrainHeightAt(strokes,point.x,point.y,heightMap)+2))} color="#77dcec" lineWidth={3}/>} 
    {regionDraft.length>1&&<Line points={regionDraft.map(point=>worldToThree(point.x,point.y,terrainHeightAt(strokes,point.x,point.y,heightMap)+2.5))} color="#b9e38e" lineWidth={3}/>} 
    {buildings.map(building=><BuiltInBuilding key={building.id} building={building} asset={assetLookup[building.asset_key]} strokes={strokes} heightMap={heightMap} selected={selected?.id===building.id} onSelect={setSelected} onContextMenu={(event,target)=>openContext(event,{kind:'building',building:target,point:{x:target.x,y:target.y,elevation:terrainHeightAt(strokes,target.x,target.y,heightMap)}})} onStartMove={id=>{if(activeTool==='inspect')setInteraction({type:'move',id});}} onStartResize={(id,corner)=>{if(activeTool==='inspect')setInteraction({type:'resize',id,corner});}} onDragMove={applyInteraction} onDragEnd={()=>setInteraction(null)}/>)}
    {buildings.filter(building=>labelState?.showAll||visibleLabelIds.has(String(building.id))).map(building=><BuildingTooltip key={`label-${building.id}`} building={building} asset={assetLookup[building.asset_key]} strokes={strokes} heightMap={heightMap}/>)}
    {(pointsOfInterest||[]).map(point=><PointOfInterestMarker key={`poi-${point.id}`} point={point} onContextMenu={openContext} strokes={strokes} heightMap={heightMap}/>)}
    {lamps.map(lamp=><StreetLight key={lamp.id} lamp={lamp} strokes={strokes} heightMap={heightMap}/>)}<MapMarker point={partyPosition} color="#72b7ff" strokes={strokes} heightMap={heightMap}/><MapMarker point={destination} color="#f3c86a" strokes={strokes} heightMap={heightMap}/>
    {calibrationPoints.map((point,index)=><MapMarker key={`${point.x}:${point.y}:${index}`} point={point} color={index?'#ff9a72':'#72d7ff'} strokes={strokes} heightMap={heightMap}/>)}
    <ContactShadows position={[0,.04,0]} opacity={.32} scale={34} blur={2.4} far={10}/><OrbitControls ref={controlsRef} makeDefault enabled={!interaction&&!firstPerson} enableZoom enablePan screenSpacePanning enableRotate={activeTool==='inspect'||activeTool==='reference'||activeTool==='player'} onChange={broadcastCamera} mouseButtons={{LEFT:(activeTool==='inspect'||activeTool==='reference'||activeTool==='player')?THREE.MOUSE.ROTATE:undefined,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.PAN}} touches={{ONE:(activeTool==='inspect'||activeTool==='reference'||activeTool==='player')?THREE.TOUCH.ROTATE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_PAN}} target={[0,0,0]} minDistance={.02} maxDistance={Math.max(600,Math.max(bounds.width,bounds.height)/FEET_PER_SCENE_UNIT*4)} minPolarAngle={.02} maxPolarAngle={1.55}/><KeyboardPan controlsRef={controlsRef} virtualKeys={virtualKeys} firstPerson={firstPerson} strokes={strokes} heightMap={heightMap} bounds={bounds} touchInputRef={touchInputRef} firstPersonSettings={firstPersonSettings}/><CameraRig bounds={bounds} fitRequest={fitRequest} controlsRef={controlsRef} viewCommand={viewCommand} strokes={strokes} heightMap={heightMap} firstPersonSettings={firstPersonSettings}/><FirstPersonLook enabled={firstPerson} controlsRef={controlsRef} onLockChange={onPointerLockChange} settings={firstPersonSettings} touchInputRef={touchInputRef}/><ScaleObserver controlsRef={controlsRef} onScaleChange={onScaleChange}/>
  </>;
}

function CameraControls({onInput,onPreset}){
  const hold=key=>({onPointerDown:event=>{event.currentTarget.setPointerCapture?.(event.pointerId);onInput(key,true);},onPointerUp:event=>{event.currentTarget.releasePointerCapture?.(event.pointerId);onInput(key,false);},onPointerCancel:()=>onInput(key,false),onPointerLeave:event=>{if(event.buttons)onInput(key,false);}});
  return <div className="map-camera-controls" aria-label="Camera controls">
    <div className="camera-presets"><button type="button" onClick={()=>onPreset('firstPerson')}>First person</button><button type="button" onClick={()=>onPreset('topdown')}>Top-down</button></div>
    <div className="camera-control-grid">
      <button type="button" {...hold('q')} title="Orbit left (Q)">Q ↶</button><button type="button" {...hold('w')} title="Move forward (W)">W ↑</button><button type="button" {...hold('e')} title="Orbit right (E)">E ↷</button>
      <button type="button" {...hold('a')} title="Move left (A)">A ←</button><button type="button" {...hold('s')} title="Move backward (S)">S ↓</button><button type="button" {...hold('d')} title="Move right (D)">D →</button>
      <button type="button" {...hold('r')} title="Pitch up (R)">R Pitch +</button><button type="button" {...hold('raise')} title="Raise camera (Left Shift)">⇧ Raise</button><button type="button" {...hold('f')} title="Pitch down (F)">F Pitch −</button>
      <button type="button" {...hold('lower')} title="Lower camera (Left Control)">Ctrl Lower</button>
    </div>
  </div>;
}

function FirstPersonTouchControls({inputRef}){
  const bindStick=(kind)=>{
    const update=(element,event)=>{
      const bounds=element.getBoundingClientRect(),radius=Math.max(24,Math.min(bounds.width,bounds.height)/2);
      const x=THREE.MathUtils.clamp((event.clientX-(bounds.left+bounds.width/2))/radius,-1,1);
      const y=THREE.MathUtils.clamp((event.clientY-(bounds.top+bounds.height/2))/radius,-1,1);
      if(kind==='look'){inputRef.current.lookX=x;inputRef.current.lookY=y;}else{inputRef.current.moveX=x;inputRef.current.moveY=y;}
    };
    const clear=()=>{if(kind==='look'){inputRef.current.lookX=0;inputRef.current.lookY=0;}else{inputRef.current.moveX=0;inputRef.current.moveY=0;}};
    return {
      onPointerDown:event=>{event.preventDefault();event.currentTarget.setPointerCapture?.(event.pointerId);update(event.currentTarget,event);},
      onPointerMove:event=>{if(event.currentTarget.hasPointerCapture?.(event.pointerId))update(event.currentTarget,event);},
      onPointerUp:event=>{event.currentTarget.releasePointerCapture?.(event.pointerId);clear();},onPointerCancel:clear,
    };
  };
  return <div className="first-person-touch-controls" aria-label="First-person touch controls">
    <div className="touch-stick touch-look" {...bindStick('look')}><span>AIM</span></div>
    <button type="button" className="touch-sprint" onPointerDown={()=>{inputRef.current.sprint=true;}} onPointerUp={()=>{inputRef.current.sprint=false;}} onPointerCancel={()=>{inputRef.current.sprint=false;}}>SPRINT</button>
    <div className="touch-stick touch-move" {...bindStick('move')}><span>MOVE</span></div>
  </div>;
}

const DEFAULT_FIRST_PERSON_SETTINGS={sensitivity:50,invertX:false,invertY:false,fov:75,walkSpeed:8,eyeHeight:6};

function initialFirstPersonSettings(){
  try{return{...DEFAULT_FIRST_PERSON_SETTINGS,...JSON.parse(window.localStorage.getItem('kachhapa-first-person-settings')||'{}')};}catch(_error){return DEFAULT_FIRST_PERSON_SETTINGS;}
}

export default function SettlementMapEditor({activeTool,assets,buildings,setBuildings,selected,setSelected,roads,setRoads,strokes,setStrokes,heightMap=null,setHeightMap=()=>{},waterBodies=[],setWaterBodies=()=>{},mapEnvironment={},setMapEnvironment=()=>{},setFortifications=()=>{},dusk,lamps,partyPosition,destination,onWaypoint,referenceLayers=[],onReferencePoint=()=>{},calibrationPoints=[],fitRequest=0,onMapContext=()=>{},onCameraChange=null,viewCommand=null,labelState={ids:[],showAll:false},pointsOfInterest=[]}){
  const[selectedAssetKey,setSelectedAssetKey]=useState(assets[0]?.key||''),[terrainMode,setTerrainMode]=useState('raise'),[brushRadius,setBrushRadius]=useState(110),[brushStrength,setBrushStrength]=useState(8),[roadDraft,setRoadDraft]=useState([]),[roadWidth,setRoadWidth]=useState(36),[roadMode,setRoadMode]=useState('select'),[newRoadName,setNewRoadName]=useState(''),[selectedRoadId,setSelectedRoadId]=useState(null),[selectedRoadPointIndex,setSelectedRoadPointIndex]=useState(null),[waterDraft,setWaterDraft]=useState([]),[waterType,setWaterType]=useState('river'),[waterWidth,setWaterWidth]=useState(30),[waterDepth,setWaterDepth]=useState(5),[seaLevelPicking,setSeaLevelPicking]=useState(false),[regionDraft,setRegionDraft]=useState([]),[regionType,setRegionType]=useState('grassland'),[regionName,setRegionName]=useState(''),[selectedRegionId,setSelectedRegionId]=useState(null),[heightRange,setHeightRange]=useState({min:0,max:250}),[heightmapStrength,setHeightmapStrength]=useState(100),[pendingHeightmap,setPendingHeightmap]=useState(null),[invertHeightmap,setInvertHeightmap]=useState(false),[heightmapStatus,setHeightmapStatus]=useState('');
  const bounds=useMemo(()=>editorBounds(referenceLayers,heightMap),[referenceLayers,heightMap]);
  const terrainMaterial=useMemo(()=>({sea_level_feet:Number(mapEnvironment.sea_level_feet)||0,snow_line_feet:Number(mapEnvironment.terrain_material?.snow_line_feet??900),snow_blend_feet:Number(mapEnvironment.terrain_material?.snow_blend_feet??500),cliff_normal_threshold:Number(mapEnvironment.terrain_material?.cliff_normal_threshold??.86),regions:mapEnvironment.regions||[]}),[mapEnvironment]);
  const regions=mapEnvironment.regions||[];
  const fortifications=mapEnvironment.fortifications||[];
  const[fortificationMode,setFortificationMode]=useState('select'),[selectedFortificationId,setSelectedFortificationId]=useState(null),[selectedFortificationPointIndex,setSelectedFortificationPointIndex]=useState(null),[fortificationDraft,setFortificationDraft]=useState([]),[newFortificationName,setNewFortificationName]=useState(''),[newFortificationWidth,setNewFortificationWidth]=useState(24),[newFortificationHeight,setNewFortificationHeight]=useState(35);
  const setRegions=updater=>setMapEnvironment(value=>({...value,regions:typeof updater==='function'?updater(value.regions||[]):updater}));
  const[virtualKeys,setVirtualKeys]=useState(new Set()),[localViewCommand,setLocalViewCommand]=useState(null),[pointerLocked,setPointerLocked]=useState(false),[scaleIndicator,setScaleIndicator]=useState({feet:100,pixels:100}),[firstPersonSettings,setFirstPersonSettings]=useState(initialFirstPersonSettings);
  const touchInputRef=useRef({lookX:0,lookY:0,moveX:0,moveY:0,sprint:false});
  const setCameraInput=(key,pressed)=>setVirtualKeys(values=>{const next=new Set(values);if(pressed)next.add(key);else next.delete(key);return next;});
  const setCameraPreset=mode=>setLocalViewCommand({mode,nonce:Date.now()});
  const activeViewCommand=localViewCommand||viewCommand,firstPerson=activeViewCommand?.mode==='firstPerson';
  const capturePointer=event=>event.currentTarget.closest('.settlement-map, .settlement-player-view')?.querySelector('canvas')?.requestPointerLock?.();
  const releasePointer=()=>document.exitPointerLock?.();
  const updateFirstPersonSetting=(key,value)=>setFirstPersonSettings(settings=>({...settings,[key]:value}));
  const updateHeightmapStrength=value=>{setHeightmapStrength(value);if(heightMap)setHeightMap({...heightMap,strength:value/100});};
  const updateHeightmapRange=(key,value)=>{setHeightRange(range=>({...range,[key]:value}));if(heightMap)setHeightMap({...heightMap,[key==='min'?'min_elevation_feet':'max_elevation_feet']:value});};
  const selectedRoad=roads.find(road=>road.id===selectedRoadId);
  const selectedRoadPoint=selectedRoad?.points?.[selectedRoadPointIndex];
  const selectedFortification=fortifications.find(wall=>wall.id===selectedFortificationId);
  const selectedFortificationPoint=selectedFortification?.points?.[selectedFortificationPointIndex];
  const updateSelectedRoad=(changes)=>setRoads(values=>values.map(road=>road.id===selectedRoadId?{...road,...changes}:road));
  const updateSelectedRoadPointWidth=(width)=>setRoads(values=>values.map(road=>road.id===selectedRoadId?{...road,points:road.points.map((point,index)=>index===selectedRoadPointIndex?{...point,width_feet:width}:point)}:road));
  const updateSelectedRoadPoint=changes=>setRoads(values=>values.map(road=>road.id===selectedRoadId?{...road,points:road.points.map((point,index)=>index===selectedRoadPointIndex?{...point,...changes}:point)}:road));
  const updateSelectedFortification=changes=>setFortifications(values=>values.map(wall=>wall.id===selectedFortificationId?{...wall,...changes}:wall));
  const updateSelectedFortificationPoint=changes=>setFortifications(values=>values.map(wall=>wall.id===selectedFortificationId?{...wall,points:wall.points.map((point,index)=>index===selectedFortificationPointIndex?{...point,...changes}:point)}:wall));
  useEffect(()=>{if(viewCommand)setLocalViewCommand(viewCommand);},[viewCommand]);
  useEffect(()=>{try{window.localStorage.setItem('kachhapa-first-person-settings',JSON.stringify(firstPersonSettings));}catch(_error){}},[firstPersonSettings]);
  useEffect(()=>{const focus=event=>setLocalViewCommand({mode:'point',point:event.detail,nonce:Date.now()});window.addEventListener('settlement-map-focus',focus);return()=>window.removeEventListener('settlement-map-focus',focus);},[]);
  useEffect(()=>{if(heightMap){setHeightmapStrength(Math.round(Number(heightMap.strength??1)*100));setHeightRange({min:Number(heightMap.min_elevation_feet)||0,max:Number(heightMap.max_elevation_feet)||250});}},[heightMap]);
  const beginRoad=()=>{setRoadDraft([]);setSelectedRoadId(null);setSelectedRoadPointIndex(null);setRoadMode('draw-new');};
  const finishRoad=()=>{if(roadDraft.length<2)return;const road={id:`road-${Date.now()}`,name:newRoadName.trim()||`New road ${roads.length+1}`,road_class:'street',surface_type:'cobblestone',width_feet:roadWidth,opacity:.78,visible:true,pedestrian_speed_modifier:1,public_access:true,closed:false,points:roadDraft};setRoads(values=>[...values,road]);setRoadDraft([]);setNewRoadName('');setSelectedRoadId(road.id);setRoadMode('edit-points');};
  const beginFortification=()=>{setFortificationDraft([]);setSelectedFortificationId(null);setSelectedFortificationPointIndex(null);setFortificationMode('draw-new');};
  const finishFortification=()=>{if(fortificationDraft.length<2)return;const wall={id:`wall-${Date.now()}`,name:newFortificationName.trim()||`New wall ${fortifications.length+1}`,wall_type:'city_wall',width_feet:newFortificationWidth,height_feet:newFortificationHeight,closed:false,visible:true,points:fortificationDraft};setFortifications(values=>[...values,wall]);setFortificationDraft([]);setNewFortificationName('');setSelectedFortificationId(wall.id);setFortificationMode('edit-points');};
  const setSeaLevel=level=>{const seaLevel=Number(level)||0;setMapEnvironment(value=>({...value,sea_level_feet:seaLevel}));setWaterBodies(values=>values.map(body=>body.water_type==='ocean'?{...body,surface_elevation_feet:seaLevel}:body));};
  const pickSeaLevel=elevation=>{setSeaLevel(Math.round(Number(elevation)||0));setSeaLevelPicking(false);};
  const updateTerrainMaterial=changes=>setMapEnvironment(value=>({...value,terrain_material:{...(value.terrain_material||{}),...changes}}));
  const finishWater=()=>{const minimum=waterType==='river'?2:3;if(waterDraft.length<minimum)return;const body={id:`water-${Date.now()}`,name:`New ${waterType}`,water_type:waterType,width_feet:waterWidth,depth_feet:waterDepth,...(waterType==='ocean'?{surface_elevation_feet:terrainMaterial.sea_level_feet}:{}),points:waterDraft};setWaterBodies(values=>[...values,body]);setWaterDraft([]);};
  const finishRegion=()=>{if(regionDraft.length<3)return;const region={id:`region-${Date.now()}`,name:regionName.trim()||`New ${regionType}`,region_type:regionType,visible:true,points:regionDraft};setRegions(values=>[...values,region]);setRegionDraft([]);setRegionName('');setSelectedRegionId(region.id);};
  const chooseHeightmap=event=>{const file=event.target.files?.[0]||null;setPendingHeightmap(file);setHeightmapStatus(file?`${file.name} ready to apply`:'');};
  const applyHeightmap=async()=>{if(!pendingHeightmap)return;setHeightmapStatus('Sampling heightmap…');try{setHeightMap(await sampleHeightmap(pendingHeightmap,bounds,heightRange.min,heightRange.max,invertHeightmap,heightmapStrength/100));setHeightmapStatus(`Applied ${pendingHeightmap.name} at ${heightmapStrength}% strength across ${Math.round(bounds.width)} × ${Math.round(bounds.height)} ft. Brush sculpting is active.`);setPendingHeightmap(null);setTerrainMode('raise');}catch(error){console.error(error);setHeightmapStatus('Unable to read heightmap');}};
  return <>
    <Canvas shadows dpr={[1,1.7]} gl={{logarithmicDepthBuffer:true}} camera={{position:[13,15,16],fov:42,near:.005}}><Suspense fallback={null}><EditorWorld activeTool={activeTool} assets={assets} buildings={buildings} setBuildings={setBuildings} selected={selected} setSelected={setSelected} roads={roads} setRoads={setRoads} selectedRoadId={selectedRoadId} setSelectedRoadId={setSelectedRoadId} setSelectedRoadPointIndex={setSelectedRoadPointIndex} roadMode={roadMode} strokes={strokes} setStrokes={setStrokes} heightMap={heightMap} bounds={bounds} terrainMode={terrainMode} terrainMaterial={terrainMaterial} brushRadius={brushRadius} brushStrength={brushStrength} selectedAssetKey={selectedAssetKey} roadDraft={roadDraft} setRoadDraft={setRoadDraft} roadWidth={roadWidth} waterBodies={waterBodies} waterDraft={waterDraft} setWaterDraft={setWaterDraft} seaLevelPicking={seaLevelPicking} onSeaLevelPick={pickSeaLevel} regions={regions} fortifications={fortifications} setFortifications={setFortifications} selectedFortificationId={selectedFortificationId} setSelectedFortificationId={setSelectedFortificationId} setSelectedFortificationPointIndex={setSelectedFortificationPointIndex} fortificationMode={fortificationMode} fortificationDraft={fortificationDraft} setFortificationDraft={setFortificationDraft} regionDraft={regionDraft} setRegionDraft={setRegionDraft} selectedRegionId={selectedRegionId} setSelectedRegionId={setSelectedRegionId} dusk={dusk} lamps={lamps} onWaypoint={onWaypoint} partyPosition={partyPosition} destination={destination} referenceLayers={referenceLayers} onReferencePoint={onReferencePoint} calibrationPoints={calibrationPoints} fitRequest={fitRequest} onMapContext={onMapContext} onCameraChange={onCameraChange} onScaleChange={setScaleIndicator} firstPerson={firstPerson} onPointerLockChange={setPointerLocked} viewCommand={activeViewCommand} labelState={labelState} pointsOfInterest={pointsOfInterest} virtualKeys={virtualKeys} firstPersonSettings={firstPersonSettings} touchInputRef={touchInputRef}/></Suspense></Canvas>
    <div className="map-navigation-help">{firstPerson?'WASD walk · Left Shift sprint · Mouse aim · Esc or M releases cursor':'WASD pan · Q/E orbit · R/F pitch · Left Shift/Ctrl elevation'}</div>
    <div className="map-scale-indicator" aria-label={`Map scale ${scaleIndicator.feet} feet`}><span style={{width:`${Math.max(35,Math.min(180,scaleIndicator.pixels))}px`}}/><strong>{scaleIndicator.feet>=5280?`${(scaleIndicator.feet/5280).toFixed(scaleIndicator.feet%5280?1:0)} mi`:`${scaleIndicator.feet} ft`}</strong></div>
    {firstPerson&&<><div className={`first-person-pointer ${pointerLocked?'locked':''}`}>{pointerLocked?<><i/><strong>Mouse look active</strong><small>Esc or M releases the cursor</small></>:<button type="button" onClick={capturePointer}>Click to aim with mouse</button>}</div><FirstPersonTouchControls inputRef={touchInputRef}/><details className="first-person-settings"><summary>First-person settings</summary><label>Mouse sensitivity <strong>{firstPersonSettings.sensitivity}%</strong><input type="range" min="5" max="150" step="5" value={firstPersonSettings.sensitivity} onChange={event=>updateFirstPersonSetting('sensitivity',Number(event.target.value))}/></label><label><input type="checkbox" checked={firstPersonSettings.invertX} onChange={event=>updateFirstPersonSetting('invertX',event.target.checked)}/> Reverse X axis</label><label><input type="checkbox" checked={firstPersonSettings.invertY} onChange={event=>updateFirstPersonSetting('invertY',event.target.checked)}/> Reverse Y axis</label><label>Field of view <strong>{firstPersonSettings.fov}°</strong><input type="range" min="55" max="105" step="5" value={firstPersonSettings.fov} onChange={event=>updateFirstPersonSetting('fov',Number(event.target.value))}/></label><label>Walking speed <strong>{firstPersonSettings.walkSpeed} ft/s</strong><input type="range" min="3" max="20" value={firstPersonSettings.walkSpeed} onChange={event=>updateFirstPersonSetting('walkSpeed',Number(event.target.value))}/></label>{pointerLocked&&<button type="button" onClick={releasePointer}>Release cursor</button>}<small>World geometry remains measured in feet. Sprint is 2.25× walking speed.</small></details></>}
    <CameraControls onInput={setCameraInput} onPreset={setCameraPreset}/>
    {activeTool==='terrain'&&<div className="editor-menu secondary-editor-menu material-menu"><span>MASTER MATERIAL</span><label>Snow line <strong>{terrainMaterial.snow_line_feet} ft</strong><input type="range" min="100" max="4000" step="50" value={terrainMaterial.snow_line_feet} onChange={event=>updateTerrainMaterial({snow_line_feet:Number(event.target.value)})}/></label><label>Snow transition <strong>{terrainMaterial.snow_blend_feet} ft</strong><input type="range" min="50" max="2000" step="50" value={terrainMaterial.snow_blend_feet} onChange={event=>updateTerrainMaterial({snow_blend_feet:Number(event.target.value)})}/></label><label>Cliff sensitivity <strong>{Math.round((1-terrainMaterial.cliff_normal_threshold)*100)}%</strong><input type="range" min=".55" max=".95" step=".01" value={terrainMaterial.cliff_normal_threshold} onChange={event=>updateTerrainMaterial({cliff_normal_threshold:Number(event.target.value)})}/></label><small>Gentle terrain remains grassland. Dirt and rock are blended onto steep slopes; snow begins at the configured line and fades in across the transition range.</small></div>}
    {activeTool==='road'&&<div className="editor-menu secondary-editor-menu road-workflow"><span>STREETS</span><div className="road-mode-tabs"><button className={roadMode==='select'?'active':''} onClick={()=>setRoadMode('select')}>Select Road</button><button disabled={!selectedRoad} className={roadMode==='edit-points'?'active':''} onClick={()=>setRoadMode('edit-points')}>Edit Existing Points</button><button disabled={!selectedRoad} className={roadMode==='add-points'?'active':''} onClick={()=>setRoadMode('add-points')}>Add New Points</button></div><label>New street name<input value={newRoadName} onChange={event=>setNewRoadName(event.target.value)} placeholder="Street name"/></label><button className="editor-action" onClick={beginRoad}>Add New Street</button><div className="street-list"><button className="street-visibility-all" onClick={()=>setRoads(values=>values.map(road=>({...road,visible:values.some(value=>value.visible===false)})))}>{roads.some(road=>road.visible===false)?'Show all':'Hide all'}</button>{roads.map(road=><div key={road.id} className={road.id===selectedRoadId?'active':''}><button onClick={()=>{setSelectedRoadId(road.id);setSelectedRoadPointIndex(null);setRoadMode('select');}}><strong>{road.name||'Unnamed street'}</strong><small>{road.points?.length||0} points</small></button><label title={`${road.visible===false?'Show':'Hide'} ${road.name||'street'}`}><input type="checkbox" checked={road.visible!==false} onChange={event=>setRoads(values=>values.map(value=>value.id===road.id?{...value,visible:event.target.checked}:value))}/> Show</label></div>)}</div><small>{roadMode==='draw-new'?'Click terrain to place the new street.':'Click a rendered road or its list entry to select it. The numbered points appear on the map; then choose Edit Existing Points or Add New Points.'}</small></div>}
    {activeTool==='fortification'&&<div className="editor-menu secondary-editor-menu road-workflow"><span>WALLS &amp; FORTIFICATIONS</span><div className="road-mode-tabs"><button className={fortificationMode==='select'?'active':''} onClick={()=>setFortificationMode('select')}>Select Wall</button><button disabled={!selectedFortification} className={fortificationMode==='edit-points'?'active':''} onClick={()=>setFortificationMode('edit-points')}>Edit Existing Points</button><button disabled={!selectedFortification} className={fortificationMode==='add-points'?'active':''} onClick={()=>setFortificationMode('add-points')}>Add New Points</button></div><label>New wall name<input value={newFortificationName} onChange={event=>setNewFortificationName(event.target.value)} placeholder="Wall name"/></label><button className="editor-action" onClick={beginFortification}>Add New Wall</button><div className="street-list"><button className="street-visibility-all" onClick={()=>setFortifications(values=>values.map(wall=>({...wall,visible:values.some(value=>value.visible===false)})))}>{fortifications.some(wall=>wall.visible===false)?'Show all':'Hide all'}</button>{fortifications.map(wall=><div key={wall.id} className={wall.id===selectedFortificationId?'active':''}><button onClick={()=>{setSelectedFortificationId(wall.id);setSelectedFortificationPointIndex(null);setFortificationMode('select');}}><strong>{wall.name||'Unnamed wall'}</strong><small>{wall.points?.length||0} points</small></button><label><input type="checkbox" checked={wall.visible!==false} onChange={event=>setFortifications(values=>values.map(value=>value.id===wall.id?{...value,visible:event.target.checked}:value))}/> Show</label></div>)}</div><small>{fortificationMode==='draw-new'?'Click terrain to trace the wall.':'Click the 3D wall or its list entry. Cyan handles show its saved control points.'}</small></div>}
    {activeTool==='water'&&<div className="editor-menu secondary-editor-menu sea-level-menu"><span>WORLD WATER LEVEL</span><label>Sea level <strong>{terrainMaterial.sea_level_feet} ft</strong><input type="number" step="1" value={terrainMaterial.sea_level_feet} onChange={event=>setSeaLevel(event.target.value)}/></label><button className={seaLevelPicking?'editor-action active':'editor-action'} onClick={()=>setSeaLevelPicking(value=>!value)}>{seaLevelPicking?'Cancel terrain pick':'Pick level from terrain'}</button><small>{seaLevelPicking?'Click the terrain surface whose elevation should become sea level.':'Sea level controls shoreline material blending and updates every ocean surface. Lakes and rivers retain their own elevations.'}</small></div>}
    {activeTool==='region'&&<div className="editor-menu region-menu"><span>REGIONS &amp; BIOMES</span><label>Name<input value={regionName} onChange={event=>setRegionName(event.target.value)} placeholder="Region name"/></label><label>Type<select value={regionType} onChange={event=>setRegionType(event.target.value)}><option value="city">City</option><option value="forest">Forest</option><option value="swamp">Swamp</option><option value="grassland">Grassland</option><option value="farmland">Farmland</option><option value="pasture">Pasture</option></select></label><div className="road-actions"><button onClick={()=>setRegionDraft(points=>points.slice(0,-1))} disabled={!regionDraft.length}>Undo point</button><button onClick={finishRegion} disabled={regionDraft.length<3}>Finish region</button></div><div className="region-list">{regions.map(region=><div key={region.id} className={region.id===selectedRegionId?'active':''}><button onClick={()=>setSelectedRegionId(region.id)}><strong>{region.name}</strong><small>{region.region_type}</small></button><label><input type="checkbox" checked={region.visible!==false} onChange={event=>setRegions(values=>values.map(value=>value.id===region.id?{...value,visible:event.target.checked}:value))}/> Show</label></div>)}</div>{selectedRegionId&&<button className="danger-action" onClick={()=>{setRegions(values=>values.filter(region=>region.id!==selectedRegionId));setSelectedRegionId(null);}}>Delete selected region</button>}<p>Click around an area to define its broad land use. City regions are ready for civic configuration; grasslands can be refined as farmland or pasture.</p></div>}
    {activeTool==='build'&&<div className="editor-menu asset-menu"><span>BUILDING ASSETS</span>{assets.map(asset=><button key={asset.key} className={selectedAssetKey===asset.key?'active':''} onClick={()=>setSelectedAssetKey(asset.key)}><HomeWorkIcon/><span><strong>{asset.name}</strong><small>{asset.width_feet} × {asset.depth_feet} ft · {asset.rooms.length} rooms</small></span></button>)}<p>Click the center of a roof or footprint. Nearby buildings align to the road and snap side-by-side.</p></div>}
    {activeTool==='terrain'&&<div className="editor-menu terrain-menu"><span>TERRAIN SCULPT</span><div className="segmented"><button className={terrainMode==='raise'?'active':''} onClick={()=>setTerrainMode('raise')}>Raise</button><button className={terrainMode==='lower'?'active':''} onClick={()=>setTerrainMode('lower')}>Lower</button></div><label>Brush radius <strong>{brushRadius} ft</strong><input type="range" min="30" max="1200" step="10" value={brushRadius} onChange={event=>setBrushRadius(Number(event.target.value))}/></label><label>Brush strength <strong>{brushStrength} ft</strong><input type="range" min="1" max="100" value={brushStrength} onChange={event=>setBrushStrength(Number(event.target.value))}/></label><span>HEIGHTMAP STARTING POINT</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseHeightmap}/><div className="reference-dimensions"><label>Black elevation (ft)<input type="number" value={heightRange.min} onChange={event=>updateHeightmapRange('min',Number(event.target.value))}/></label><label>White elevation (ft)<input type="number" value={heightRange.max} onChange={event=>updateHeightmapRange('max',Number(event.target.value))}/></label></div><label>Heightmap strength <strong>{heightmapStrength}%</strong><input type="range" min="0" max="300" step="5" value={heightmapStrength} onChange={event=>updateHeightmapStrength(Number(event.target.value))}/></label><label className="road-checkbox"><input type="checkbox" checked={invertHeightmap} onChange={event=>setInvertHeightmap(event.target.checked)}/> Invert black and white</label><button className="editor-action" disabled={!pendingHeightmap} onClick={applyHeightmap}>Apply heightmap</button><small>{heightmapStatus||`Terrain extent: ${Math.round(bounds.width)} × ${Math.round(bounds.height)} ft`}</small><button className="editor-action" onClick={()=>setStrokes([])}>Reset sculpting</button>{heightMap&&<button className="danger-action" onClick={()=>setHeightMap(null)}>Remove heightmap</button>}<p>Height and strength changes update the loaded terrain immediately. Apply a new heightmap as a starting surface, then continue with the raise/lower brush workflow.</p></div>}
    {activeTool==='road'&&<div className="editor-menu road-menu"><span>SPLINE ROAD</span><label>New road width <strong>{roadWidth} ft</strong><input type="range" min="4" max="400" step="2" value={roadWidth} onChange={event=>setRoadWidth(Number(event.target.value))}/></label><div className="road-actions"><button onClick={()=>setRoadDraft(points=>points.slice(0,-1))} disabled={!roadDraft.length}>Undo point</button><button onClick={finishRoad} disabled={roadDraft.length<2}>Finish road</button></div>{selectedRoad&&<div className="road-metadata"><strong>{selectedRoad.name||'Selected road'} · {selectedRoad.points?.length||0} control points</strong><label>Name<input value={selectedRoad.name||''} onChange={event=>updateSelectedRoad({name:event.target.value})}/></label><small className="road-name-note">Names are labels; multiple roads may use the same name.</small><label>Class<select value={selectedRoad.road_class||'street'} onChange={event=>updateSelectedRoad({road_class:event.target.value})}><option value="street">Street</option><option value="avenue">Avenue</option><option value="lane">Lane</option><option value="pedestrian_path">Pedestrian path</option><option value="bridge">Bridge</option><option value="stairs">Stairs</option></select></label><label>Surface<select value={selectedRoad.surface_type||'cobblestone'} onChange={event=>updateSelectedRoad({surface_type:event.target.value})}><option value="cobblestone">Cobblestone</option><option value="paved">Paved</option><option value="dirt">Dirt</option><option value="wood">Wood</option><option value="stone">Stone</option></select></label><label>Default width (ft)<input type="number" min="4" max="1000" value={selectedRoad.width_feet} onChange={event=>updateSelectedRoad({width_feet:Number(event.target.value)})}/></label><div className="road-point-picker" aria-label="Road control points">{selectedRoad.points.map((point,index)=><button type="button" key={`${point.x}:${point.y}:${index}`} className={selectedRoadPointIndex===index?'active':''} onClick={()=>setSelectedRoadPointIndex(index)}>{index+1}</button>)}</div>{selectedRoadPoint&&<><div className="reference-dimensions"><label>Point {selectedRoadPointIndex+1} X<input type="number" value={selectedRoadPoint.x} onChange={event=>updateSelectedRoadPoint({x:Number(event.target.value)})}/></label><label>Point {selectedRoadPointIndex+1} Y<input type="number" value={selectedRoadPoint.y} onChange={event=>updateSelectedRoadPoint({y:Number(event.target.value)})}/></label></div><label>Point width <strong>{selectedRoadPoint.width_feet??selectedRoad.width_feet} ft</strong><input type="range" min="4" max="1000" step="1" value={selectedRoadPoint.width_feet??selectedRoad.width_feet} onChange={event=>updateSelectedRoadPointWidth(Number(event.target.value))}/></label></>}{selectedRoadPointIndex===null&&<small className="road-name-note">Select a numbered point for coordinates and width, or switch to Edit Existing Points and drag its map handle.</small>}<label>Overlay opacity <strong>{Math.round((selectedRoad.opacity??.78)*100)}%</strong><input type="range" min=".2" max="1" step=".05" value={selectedRoad.opacity??.78} onChange={event=>updateSelectedRoad({opacity:Number(event.target.value)})}/></label><label>Walking speed <strong>{selectedRoad.pedestrian_speed_modifier??1}×</strong><input type="range" min=".25" max="1.5" step=".05" value={selectedRoad.pedestrian_speed_modifier??1} onChange={event=>updateSelectedRoad({pedestrian_speed_modifier:Number(event.target.value)})}/></label><label className="road-checkbox"><input type="checkbox" checked={selectedRoad.public_access!==false} onChange={event=>updateSelectedRoad({public_access:event.target.checked})}/> Public access</label><button className="danger-action" onClick={()=>{setRoads(values=>values.filter(road=>road.id!==selectedRoadId));setSelectedRoadId(null);setSelectedRoadPointIndex(null);}}>Delete selected road</button></div>}<p>In Add New Points mode, click the selected road span. In Edit Existing Points mode, drag its numbered handles. Double-click an interior handle to remove it.</p></div>}
    {activeTool==='fortification'&&<div className="editor-menu road-menu"><span>FORTIFICATION SPLINE</span><div className="reference-dimensions"><label>New width (ft)<input type="number" min="2" value={newFortificationWidth} onChange={event=>setNewFortificationWidth(Number(event.target.value))}/></label><label>New height (ft)<input type="number" min="2" value={newFortificationHeight} onChange={event=>setNewFortificationHeight(Number(event.target.value))}/></label></div><div className="road-actions"><button onClick={()=>setFortificationDraft(points=>points.slice(0,-1))} disabled={!fortificationDraft.length}>Undo point</button><button onClick={finishFortification} disabled={fortificationDraft.length<2}>Finish wall</button></div>{selectedFortification&&<div className="road-metadata"><strong>{selectedFortification.name||'Selected wall'} · {selectedFortification.points?.length||0} control points</strong><label>Name<input value={selectedFortification.name||''} onChange={event=>updateSelectedFortification({name:event.target.value})}/></label><div className="reference-dimensions"><label>Width (ft)<input type="number" min="2" value={selectedFortification.width_feet||24} onChange={event=>updateSelectedFortification({width_feet:Number(event.target.value)})}/></label><label>Height (ft)<input type="number" min="2" value={selectedFortification.height_feet||35} onChange={event=>updateSelectedFortification({height_feet:Number(event.target.value)})}/></label></div><label className="road-checkbox"><input type="checkbox" checked={Boolean(selectedFortification.closed)} onChange={event=>updateSelectedFortification({closed:event.target.checked})}/> Closed loop</label><div className="road-point-picker" aria-label="Wall control points">{selectedFortification.points.map((point,index)=><button type="button" key={`${point.x}:${point.y}:${index}`} className={selectedFortificationPointIndex===index?'active':''} onClick={()=>setSelectedFortificationPointIndex(index)}>{index+1}</button>)}</div>{selectedFortificationPoint&&<div className="reference-dimensions"><label>Point {selectedFortificationPointIndex+1} X<input type="number" value={selectedFortificationPoint.x} onChange={event=>updateSelectedFortificationPoint({x:Number(event.target.value)})}/></label><label>Point {selectedFortificationPointIndex+1} Y<input type="number" value={selectedFortificationPoint.y} onChange={event=>updateSelectedFortificationPoint({y:Number(event.target.value)})}/></label></div>}<button className="danger-action" onClick={()=>{setFortifications(values=>values.filter(wall=>wall.id!==selectedFortificationId));setSelectedFortificationId(null);setSelectedFortificationPointIndex(null);}}>Delete selected wall</button></div>}<p>Use Add New Points on the selected wall to split a span. Use Edit Existing Points to drag cyan handles over the wall shown in the reference image.</p></div>}
    {activeTool==='water'&&<div className="editor-menu road-menu"><span>WATER BODY</span><label>Type<select value={waterType} onChange={event=>{setWaterType(event.target.value);setWaterDraft([]);}}><option value="river">River</option><option value="lake">Lake</option><option value="ocean">Ocean</option></select></label>{waterType==='river'&&<label>Width <strong>{waterWidth} ft</strong><input type="range" min="8" max="180" step="2" value={waterWidth} onChange={event=>setWaterWidth(Number(event.target.value))}/></label>}<label>Average depth <strong>{waterDepth} ft</strong><input type="range" min="1" max="60" value={waterDepth} onChange={event=>setWaterDepth(Number(event.target.value))}/></label><div className="road-actions"><button onClick={()=>setWaterDraft(points=>points.slice(0,-1))} disabled={!waterDraft.length}>Undo point</button><button onClick={finishWater} disabled={waterDraft.length<(waterType==='river'?2:3)}>Finish {waterType}</button></div><button className="danger-action" onClick={()=>setWaterBodies([])} disabled={!waterBodies.length}>Remove all water</button><p>Draw rivers from either end; flow is inferred downhill. Narrow or shallow channels animate faster. Lakes and oceans use closed shorelines.</p></div>}
  </>;
}
