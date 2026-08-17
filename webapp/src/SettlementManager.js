import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import AddIcon from '@mui/icons-material/Add';
import ParkIcon from '@mui/icons-material/Park';
import HomeWorkIcon from '@mui/icons-material/HomeWork';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import GroupsIcon from '@mui/icons-material/Groups';
import RouteIcon from '@mui/icons-material/Route';
import StorefrontIcon from '@mui/icons-material/Storefront';
import LayersIcon from '@mui/icons-material/Layers';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import PublicIcon from '@mui/icons-material/Public';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import WaterIcon from '@mui/icons-material/Water';
import FenceIcon from '@mui/icons-material/Fence';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { calibrateReferenceLayer, FALLBACK_ASSET_CATALOG } from './settlementEditor';
import { searchSettlementLocations, settlementSearchLocations } from './settlementSearch';
import './SettlementManager.css';

const SettlementMapEditor = lazy(() => import('./SettlementMapEditor'));

async function readReferenceImageDimensions(file) {
  const bytes = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
  const view = new DataView(bytes.buffer);
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const startOfFrameMarkers = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if (startOfFrameMarkers.has(marker)) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const segmentLength = view.getUint16(offset + 2);
      if (segmentLength < 2) break;
      offset += 2 + segmentLength;
    }
  }
  return null;
}

async function optimizeReferenceImage(file) {
  const dimensions = await readReferenceImageDimensions(file);
  return { file, resized: false, width: dimensions?.width, height: dimensions?.height };
}

function SalesChart({ rows }) {
  if (!rows?.length) return <div className="chart-empty">Run the economy to generate sales history.</div>;
  const width=440,height=130,pad=16,max=Math.max(...rows.map(row=>row.revenue_cp),1);
  const points=rows.map((row,index)=>`${pad+(index/Math.max(1,rows.length-1))*(width-pad*2)},${height-pad-(row.revenue_cp/max)*(height-pad*2)}`).join(' ');
  return <svg className="sales-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily business revenue"><line x1={pad} y1={height-pad} x2={width-pad} y2={height-pad}/><polyline points={points}/>{rows.map((row,index)=><circle key={row.day_index} cx={pad+(index/Math.max(1,rows.length-1))*(width-pad*2)} cy={height-pad-(row.revenue_cp/max)*(height-pad*2)} r="2"><title>Day {row.day_index}: {row.revenue_cp} cp</title></circle>)}</svg>;
}

function Stat({ icon, value, label, tone='' }) { return <div className={`settlement-stat ${tone}`}><span>{icon}</span><strong>{value}</strong><small>{label}</small></div>; }
const textAffiliation = location => location.affiliation ? ` · ${location.affiliation}` : '';

function MapLoading({ settlementName }) {
  return <div className="settlement-map-loading" role="status" aria-live="polite"><i/><strong>Loading {settlementName || 'settlement'}…</strong><span>Preparing terrain, roads, buildings, and simulation state.</span></div>;
}

function AtlasMap({ atlas, locations, selectedId, onSelect, onPlace }) {
  const zoom=Number(atlas?.tile_zoom??2), tileCount=2**zoom;
  const tiles=atlas?.tile_url_template?Array.from({length:tileCount*tileCount},(_,index)=>({x:index%tileCount,y:Math.floor(index/tileCount)})):[];
  const place = (event) => {
    if (!selectedId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    onPlace(selectedId, (event.clientX-bounds.left)/bounds.width, (event.clientY-bounds.top)/bounds.height);
  };
  return <div className={`atlas-map ${atlas?.image_url?'has-image':''}`} style={atlas?.image_url?{backgroundImage:`url(${atlas.image_url})`}:undefined} onClick={place} role="application" aria-label="Overworld settlement placement map">
    {!!tiles.length&&<div className="atlas-tiles" style={{gridTemplateColumns:`repeat(${tileCount},1fr)`}}>{tiles.map(tile=><img key={`${tile.x}-${tile.y}`} src={atlas.tile_url_template.replace('{z}',zoom).replace('{x}',tile.x).replace('{y}',tile.y)} alt="" draggable="false"/>)}</div>}
    {!atlas?.image_url&&!tiles.length&&<div className="atlas-empty"><PublicIcon/><strong>{atlas?.name||'Campaign World'}</strong><span>{atlas?.key==='faerun'?'Add a licensed Faerûn tile or image source on the server.':'A blank overworld ready for your settlements.'}</span></div>}
    {locations.filter(location=>location.atlas_x!=null&&location.atlas_y!=null).map(location=><button key={location.id} type="button" className={`atlas-marker ${location.id===selectedId?'active':''} ${location.status==='destroyed'?'destroyed':''}`} style={{left:`${location.atlas_x*100}%`,top:`${location.atlas_y*100}%`}} onClick={event=>{event.stopPropagation();onSelect(location.id);}} title={location.name}><i/><span>{location.name}{location.status==='destroyed'?' · Destroyed':''}</span></button>)}
  </div>;
}

export default function SettlementManager({ headers, socket, mainEnvironmentUrl = '/', initialTool = 'atlas' }) {
  const [day,setDay] = useState(24), [running,setRunning] = useState(false), [speed,setSpeed] = useState(1);
  const requestedTool=new URLSearchParams(window.location.search).get('tool');
  const [buildings,setBuildings] = useState([]), [selected,setSelected] = useState(null), [activeTool,setActiveTool] = useState(requestedTool==='atlas'?'atlas':initialTool);
  const [roads,setRoads] = useState([]), [terrainStrokes,setTerrainStrokes] = useState([]), [heightMap,setHeightMap] = useState(null), [waterBodies,setWaterBodies] = useState([]), [mapEnvironment,setMapEnvironment] = useState({sea_level_feet:0,terrain_material:{snow_line_feet:900,snow_blend_feet:500,cliff_normal_threshold:.86},regions:[]}), [assets,setAssets] = useState(FALLBACK_ASSET_CATALOG);
  const setFortifications=useCallback(updater=>setMapEnvironment(environment=>({...environment,fortifications:typeof updater==='function'?updater(environment.fortifications||[]):updater})),[]);
  const [referenceLayers,setReferenceLayers] = useState([]), [selectedReferenceId,setSelectedReferenceId] = useState(null);
  const [calibrationPoints,setCalibrationPoints] = useState([]), [knownDistance,setKnownDistance] = useState(471), [fitRequest,setFitRequest] = useState(0);
  const [referenceUpload,setReferenceUpload] = useState({file:null,name:'',width_feet:1800,height_feet:1800,origin_x:0,origin_y:0,scope:'city',linked_building_id:'',sync_exterior:false}), [uploadStatus,setUploadStatus] = useState('');
  const [designLoaded,setDesignLoaded] = useState(false), [mapLoading,setMapLoading] = useState(false), [saveStatus,setSaveStatus] = useState('Choose a settlement');
  const eventLog = [];
  const [simulation,setSimulation] = useState({ time:{day:24,hour:12,minute:0}, routes:[] });
  const [travelContext,setTravelContext] = useState({party_position:null,points_of_interest:[]});
  const [destination,setDestination] = useState(null), [travelPlan,setTravelPlan] = useState(null), [partySize,setPartySize] = useState(4);
  const [economy,setEconomy] = useState({day_index:0,markets:[],businesses:[],history:{}}), [selectedBusinessId,setSelectedBusinessId] = useState(null);
  const [commodityQuantity,setCommodityQuantity] = useState(25);
  const [atlas,setAtlas] = useState({atlas:{key:'blank',name:'Campaign World'},locations:[]});
  const [activeSettlementId,setActiveSettlementId] = useState(null), [settlementName,setSettlementName] = useState('World Atlas');
  const [newSettlementName,setNewSettlementName] = useState(''), [atlasStatus,setAtlasStatus] = useState('Loading World Atlas…');
  const [playerFollow,setPlayerFollow] = useState(false), [playerLabels,setPlayerLabels] = useState([]), [showAllPlayerLabels,setShowAllPlayerLabels] = useState(false), [mapContext,setMapContext] = useState(null);
  const [locationSearch,setLocationSearch] = useState(''), [selectedLocationId,setSelectedLocationId] = useState(null);
  const bootstrappedCampaign=useRef(null);
  const campaignId = headers?.campaignID || headers?.CampaignID;
  const sendPlayerCommand=useCallback((action,payload={})=>{if(!socket||!campaignId||!activeSettlementId)return;socket.emit('settlement_player_command',{campaign_id:Number(campaignId),settlement_id:Number(activeSettlementId),action,...payload});},[socket,campaignId,activeSettlementId]);
  const openPlayerView=()=>{
    const labels=playerLabels.join(','),params=new URLSearchParams({campaignID:String(campaignId||''),settlementID:String(activeSettlementId||''),campaignName:headers?.campaignName||'',accountType:'DM'});
    if(labels)params.set('labels',labels);if(showAllPlayerLabels)params.set('showAllLabels','1');
    window.open(`/maps/player?${params.toString()}`,'kachhapa-settlement-player','noopener');
  };
  const centerPlayerOn=point=>{if(point)sendPlayerCommand('focus',{point});setMapContext(null);};
  const setBuildingLabel=(building,visible)=>{const id=String(building.id);setPlayerLabels(values=>visible?[...new Set([...values,id])]:values.filter(value=>value!==id));sendPlayerCommand('label',{building_id:id,visible});setMapContext(null);};
  useEffect(()=>{setPlayerLabels([]);setShowAllPlayerLabels(false);setMapContext(null);setSelectedLocationId(null);setLocationSearch('');},[activeSettlementId]);
  const applyMap = useCallback((map) => {
    const allLayers=map.reference_layers||[],mapHeightMap=allLayers.find(layer=>layer.layer_type==='heightmap')||null,visualLayers=allLayers.filter(layer=>layer.layer_type!=='heightmap').map(layer=>({...layer,visible:layer.visible!==false,opacity:Number.isFinite(Number(layer.opacity))?Number(layer.opacity):.7,project_to_terrain:layer.project_to_terrain!==false}));
    setBuildings(map.buildings||[]);setRoads(map.roads||[]);setTerrainStrokes(map.terrain_strokes||[]);setWaterBodies(map.water_bodies||[]);setMapEnvironment(map.environment||{sea_level_feet:0,terrain_material:{snow_line_feet:900,snow_blend_feet:500,cliff_normal_threshold:.86},regions:[]});
    setHeightMap(mapHeightMap);setReferenceLayers(visualLayers);setSelectedReferenceId(visualLayers[0]?.id||null);
    if(visualLayers.length)setFitRequest(value=>value+1);
    setAssets(map.asset_catalog?.length?map.asset_catalog:FALLBACK_ASSET_CATALOG);
    setSelected(map.buildings?.[0]||null);setActiveSettlementId(map.settlement_id);setSettlementName(map.name||'New Settlement');
    setDesignLoaded(true);setSaveStatus('Saved');
  }, []);
  const openSettlement = useCallback(async (settlementId) => {
    if(!campaignId||!settlementId)return;
    const location=atlas.locations.find(item=>item.id===Number(settlementId));
    setActiveTool('inspect');setActiveSettlementId(Number(settlementId));setDesignLoaded(false);setMapLoading(true);setSaveStatus('Loading map…');setSelected(null);
    if(location?.name)setSettlementName(location.name);
    try {
      const response=await axios.get(`/api/settlement-map/${campaignId}?settlement_id=${settlementId}`,{headers});
      applyMap(response.data);
    } catch (error) {
      console.error('Unable to load settlement map:',error);
      setSaveStatus(error.response?.data?.message||'Map load failed');
    } finally {
      setMapLoading(false);
    }
  },[campaignId,headers,applyMap,atlas.locations]);
  const applySimulation = useCallback((state) => { setSimulation(state); if (state?.time?.day) setDay(state.time.day); }, []);
  const advanceTime = useCallback(async (minutes) => {
    if (!campaignId) return;
    await axios.post(`/api/calendar/${campaignId}/date/advance`, { minutes }, { headers });
    const response = await axios.get(`/api/settlement-simulation/${campaignId}`, { headers });
    applySimulation(response.data);
  }, [campaignId, headers, applySimulation]);
  useEffect(() => {
    if (!campaignId) return undefined;
    let active = true;
    setAtlasStatus('Loading World Atlas…');
    axios.get(`/api/world-atlas/${campaignId}`, {headers}).then((atlasResponse) => {
      if(!active)return;
      setAtlas(atlasResponse.data);
      setAtlasStatus('Select a settlement to load its 3D environment.');
    }).catch((error) => {
      console.error('Unable to load World Atlas:', error);
      if(active)setAtlasStatus(error.response?.data?.message||'World Atlas failed to load');
    });
    return () => { active=false; };
  }, [campaignId, headers]);

  useEffect(() => {
    if (!campaignId || !activeSettlementId || bootstrappedCampaign.current===Number(campaignId)) return undefined;
    bootstrappedCampaign.current=Number(campaignId);
    let active=true;
    axios.post(`/api/settlement-simulation/${campaignId}/bootstrap`, {}, { headers }).then(async ({data}) => {
      if(active) applySimulation(data);
      const [contextResult,economyResult]=await Promise.allSettled([
        axios.get(`/api/travel/${campaignId}/context`, { headers }),
        axios.get(`/api/economy/${campaignId}`, {headers}),
      ]);
      if(!active)return;
      if(contextResult.status==='fulfilled')setTravelContext(contextResult.value.data);
      else console.error('Unable to load settlement travel context:',contextResult.reason);
      if(economyResult.status==='fulfilled'){
        setEconomy(economyResult.value.data);
        setSelectedBusinessId(value=>value||economyResult.value.data.businesses?.[0]?.id);
      }else console.error('Unable to load settlement economy:',economyResult.reason);
    }).catch((error) => {
      bootstrappedCampaign.current=null;
      console.error('Unable to bootstrap settlement simulation:', error);
    });
    return () => { active=false; };
  }, [campaignId, activeSettlementId, headers, applySimulation]);
  useEffect(() => {
    if (!socket) return undefined;
    const update = (state) => { if (!campaignId || state.campaign_id === Number(campaignId)) applySimulation(state); };
    socket.on('settlement_simulation_updated', update);
    return () => socket.off('settlement_simulation_updated', update);
  }, [socket,campaignId,applySimulation]);
  useEffect(() => {
    if (!socket) return undefined;
    const updateParty = (position) => setTravelContext((value) => ({...value,party_position:position}));
    socket.on('party_position_updated', updateParty);
    return () => socket.off('party_position_updated', updateParty);
  }, [socket]);
  useEffect(() => {
    if (!socket) return undefined;
    const updateAtlas = (event) => {
      const location=event?.settlement;if(!location||location.campaign_id!==Number(campaignId))return;
      setAtlas(value=>({...value,locations:event.action==='deleted'?value.locations.filter(item=>item.id!==location.id):[...value.locations.filter(item=>item.id!==location.id),location]}));
    };
    socket.on('world_atlas_updated',updateAtlas);
    return()=>socket.off('world_atlas_updated',updateAtlas);
  },[socket,campaignId]);
  useEffect(()=>{
    setReferenceLayers(layers=>{let changed=false;const nextLayers=layers.map(layer=>{
      if(!layer.sync_exterior||!layer.linked_building_id)return layer;
      const building=buildings.find(item=>item.id===layer.linked_building_id);
      if(!building)return layer;
      const next={...layer,origin_x:building.x,origin_y:building.y,width_feet:building.width_feet,height_feet:building.depth_feet,feet_per_pixel_x:building.width_feet/Math.max(1,Number(layer.pixel_width)||1),feet_per_pixel_y:building.depth_feet/Math.max(1,Number(layer.pixel_height)||1),rotation_degrees:(building.rotation||0)*180/Math.PI};
      if(next.origin_x===layer.origin_x&&next.origin_y===layer.origin_y&&next.width_feet===layer.width_feet&&next.height_feet===layer.height_feet&&next.rotation_degrees===layer.rotation_degrees)return layer;
      changed=true;return next;
    });return changed?nextLayers:layers;});
  },[buildings]);
  useEffect(() => {
    if(!designLoaded||!campaignId||!activeSettlementId)return undefined;
    setSaveStatus('Unsaved changes');
    const timer=window.setTimeout(()=>{
      setSaveStatus('Saving…');
      axios.put(`/api/settlement-map/${campaignId}`,{settlement_id:activeSettlementId,terrain_strokes:terrainStrokes,roads,buildings,water_bodies:waterBodies,environment:mapEnvironment,reference_layers:[...referenceLayers,...(heightMap?[heightMap]:[])]},{headers})
        .then(()=>setSaveStatus('Saved'))
        .catch((error)=>{console.error('Unable to save settlement map:',error);setSaveStatus('Save failed');});
    },700);
    return()=>window.clearTimeout(timer);
  },[designLoaded,campaignId,activeSettlementId,headers,terrainStrokes,heightMap,roads,buildings,waterBodies,mapEnvironment,referenceLayers]);
  useEffect(() => {
    if(!socket) return undefined;
    const updateEconomy=(state)=>setEconomy(state);
    socket.on('settlement_economy_updated',updateEconomy);
    return()=>socket.off('settlement_economy_updated',updateEconomy);
  },[socket]);
  useEffect(() => { if (!running || !campaignId) return undefined; const timer=window.setInterval(()=>advanceTime(10*speed).catch(console.error),2600); return()=>window.clearInterval(timer); },[running,speed,campaignId,advanceTime]);
  const route = simulation.routes?.[0];
  const lamps = route?.lamps || [];
  const calculateTravel = async (nextDestination = destination) => {
    if (!campaignId || !nextDestination) return;
    const payload = nextDestination.id ? {poi_id:nextDestination.id,party_size:partySize} : {destination:nextDestination,party_size:partySize};
    const response = await axios.post(`/api/travel/${campaignId}/calculate`, payload, {headers});
    setTravelPlan(response.data);
  };
  const chooseDestination = (next) => { setDestination(next); setTravelPlan(null); };
  const setPartyHere = async () => {
    if (!destination) return;
    const response = await axios.patch(`/api/travel/${campaignId}/party-position`, destination, {headers});
    setTravelContext((value)=>({...value,party_position:response.data}));
    setDestination(null); setTravelPlan(null);
  };
  const selectedReference=referenceLayers.find(layer=>layer.id===selectedReferenceId)||referenceLayers[0];
  const updateReference=(id,updater)=>setReferenceLayers(values=>values.map(layer=>layer.id===id?updater(layer):layer));
  const recordCalibrationPoint=(point)=>setCalibrationPoints(values=>[...(values.length>=2?[]:values),{x:Math.round(point.x),y:Math.round(point.y)}]);
  const applyReferenceCalibration=()=>{
    if(!selectedReference||calibrationPoints.length!==2)return;
    updateReference(selectedReference.id,layer=>calibrateReferenceLayer(layer,calibrationPoints[0],calibrationPoints[1],knownDistance));
    setCalibrationPoints([]);setFitRequest(value=>value+1);
  };
  const uploadReference=async(event)=>{
    event.preventDefault();
    if(!referenceUpload.file||!campaignId)return;
    try{
      setUploadStatus('Inspecting original image…');
      const optimized=await optimizeReferenceImage(referenceUpload.file);
      const form=new FormData();
      form.append('file',optimized.file);
      form.append('settlement_id',activeSettlementId);
      ['name','width_feet','height_feet','origin_x','origin_y','scope','linked_building_id','sync_exterior'].forEach(key=>form.append(key,referenceUpload[key]));
      setUploadStatus(`${optimized.width&&optimized.height?`${optimized.width} × ${optimized.height} px · `:''}Uploading original…`);
      const response=await axios.post(`/api/settlement-map/${campaignId}/reference-layers`,form,{headers});
      const layer=response.data.layer;
      setReferenceLayers((response.data.map.reference_layers||[...referenceLayers,layer]).filter(value=>value.layer_type!=='heightmap'));
      setSelectedReferenceId(layer.id);setReferenceUpload(value=>({...value,file:null,name:''}));
      setUploadStatus(`Original retained · viewer ${layer.preview_pixel_width} × ${layer.preview_pixel_height} px`);setFitRequest(value=>value+1);
    }catch(error){console.error('Unable to upload reference map:',error);setUploadStatus(error.response?.data?.message||error.response?.data?.details||error.message||'Upload failed');}
  };
  const formatDuration = (minutes) => minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${Math.floor(minutes/60)}h ${minutes%60}m` : `${Math.floor(minutes/1440)}d ${Math.floor((minutes%1440)/60)}h`;
  const formatCost = (cp) => { const sign=cp<0?'-':'';const value=Math.abs(cp);return value>=100?`${sign}${(value/100).toFixed(1)} gp`:value>=10?`${sign}${(value/10).toFixed(1)} sp`:`${sign}${value} cp`; };
  const runEconomy=async(days)=>{const response=await axios.post(`/api/economy/${campaignId}/simulate`,{days},{headers});setEconomy(response.data);};
  const rebalanceWorkforce=async()=>{const response=await axios.post(`/api/economy/${campaignId}/workforce/rebalance`,{},{headers});setEconomy(response.data.dashboard);};
  const disruptMarket=async(key)=>{const response=await axios.post(`/api/economy/${campaignId}/commodities/${key}/purchase`,{quantity:commodityQuantity},{headers});setEconomy(response.data.dashboard);};
  const updateAtlasLocation=(next)=>setAtlas(value=>({...value,locations:value.locations.map(location=>location.id===next.id?next:location)}));
  const renameSettlement=async()=>{
    const name=settlementName.trim();if(!name||!activeSettlementId)return;
    try{const response=await axios.patch(`/api/world-atlas/${campaignId}/settlements/${activeSettlementId}`,{name},{headers});updateAtlasLocation(response.data);setSettlementName(response.data.name);}
    catch(error){setAtlasStatus(error.response?.data?.message||'Unable to rename settlement');}
  };
  const createSettlement=async(event)=>{
    event.preventDefault();setAtlasStatus('Creating…');
    try{const response=await axios.post(`/api/world-atlas/${campaignId}/settlements`,{name:newSettlementName.trim()||'New Settlement'},{headers});setAtlas(value=>({...value,locations:[...value.locations,response.data]}));setNewSettlementName('');await openSettlement(response.data.id);setActiveTool('atlas');setAtlasStatus(`${response.data.name} created. Click the overworld map to place it.`);}
    catch(error){setAtlasStatus(error.response?.data?.message||'Unable to create settlement');}
  };
  const placeSettlement=async(id,x,y)=>{
    try{const response=await axios.patch(`/api/world-atlas/${campaignId}/settlements/${id}`,{atlas_x:x,atlas_y:y},{headers});updateAtlasLocation(response.data);setAtlasStatus(`${response.data.name} placed on the atlas.`);}
    catch(error){setAtlasStatus(error.response?.data?.message||'Unable to place settlement');}
  };
  const setSettlementStatus=async(location,status)=>{
    try{const response=await axios.patch(`/api/world-atlas/${campaignId}/settlements/${location.id}`,{status},{headers});updateAtlasLocation(response.data);setAtlasStatus(status==='destroyed'?`${location.name} remains on the atlas as a destroyed settlement.`:`${location.name} restored.`);}
    catch(error){setAtlasStatus(error.response?.data?.message||'Unable to update settlement status');}
  };
  const removeSettlementMarker=async(location)=>{
    try{const response=await axios.patch(`/api/world-atlas/${campaignId}/settlements/${location.id}`,{atlas_x:null,atlas_y:null},{headers});updateAtlasLocation(response.data);setAtlasStatus(`${location.name} removed from the overworld map.`);}
    catch(error){setAtlasStatus(error.response?.data?.message||'Unable to remove settlement marker');}
  };
  const deleteSettlement=async(location)=>{
    if(!window.confirm(`Permanently delete ${location.name}? This is intended for mistakes. If it was destroyed in the story, cancel and use “Mark destroyed” instead.`))return;
    try{const response=await axios.delete(`/api/world-atlas/${campaignId}/settlements/${location.id}?reason=mistake`,{headers});setAtlas(value=>{const remaining=value.locations.filter(item=>item.id!==location.id);return {...value,locations:remaining.length?remaining:[response.data.active_settlement]};});if(location.id===activeSettlementId)await openSettlement(response.data.active_settlement.id);setAtlasStatus(`${location.name} deleted.`);}
    catch(error){setAtlasStatus(error.response?.data?.message||'Unable to delete settlement');}
  };
  const selectedBusiness=economy.businesses.find(business=>business.id===Number(selectedBusinessId));
  const selectedHistory=economy.history?.[String(selectedBusinessId)]||[];
  const tenday=selectedHistory.slice(-10).reduce((totals,row)=>({revenue:totals.revenue+row.revenue_cp,profit:totals.profit+row.profit_cp}),{revenue:0,profit:0});
  const resources=useMemo(()=>({population:economy.workforce?.agents?.length||0,food:0,wood:0,coin:0}),[economy]);
  const selectedBuilding=buildings.find(building=>building.id===selected?.id)||selected;
  const selectedAsset=assets.find(asset=>asset.key===selectedBuilding?.asset_key);
  const selectedRoad=roads.find(road=>road.id===selectedBuilding?.front_road_id);
  const updateSelectedBuilding=(updater)=>{if(!selectedBuilding)return;setBuildings(values=>values.map(building=>building.id===selectedBuilding.id?updater(building):building));};
  const activeMapKey=atlas.locations.find(location=>location.id===activeSettlementId)?.map_key||null;
  const searchableLocations=useMemo(()=>settlementSearchLocations({buildings,points:travelContext.points_of_interest,businesses:economy.businesses,assets,mapKey:activeMapKey}),[buildings,travelContext.points_of_interest,economy.businesses,assets,activeMapKey]);
  const locationResults=useMemo(()=>searchSettlementLocations(searchableLocations,locationSearch),[searchableLocations,locationSearch]);
  const selectedLocation=searchableLocations.find(location=>location.id===selectedLocationId)||null;
  const selectLocation=location=>{setSelectedLocationId(location.id);if(location.kind==='building')setSelected(location.source);};
  const centerDmOn=location=>{if(location?.point)window.dispatchEvent(new CustomEvent('settlement-map-focus',{detail:location.point}));};
  const centerPlayerOnLocation=location=>{if(location?.point)sendPlayerCommand('focus',{point:location.point});};
  return <div className="settlement-sim">
    <header className="settlement-topbar"><div className="settlement-title"><button className="return-kachhapa-button" onClick={()=>window.location.assign(mainEnvironmentUrl)} title="Return to Kachhapa" aria-label="Return to Kachhapa"><ExitToAppIcon/></button><div><span className="eyebrow">SETTLEMENT SIMULATION</span><input className="settlement-name-input" aria-label="Settlement name" value={settlementName} onChange={event=>setSettlementName(event.target.value)} onBlur={renameSettlement} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/><small className={`map-save-status ${saveStatus==='Save failed'?'error':''}`}>{saveStatus}</small></div></div><div className="settlement-date"><span>{String(simulation.time?.hour??12).padStart(2,'0')}:{String(simulation.time?.minute??0).padStart(2,'0')} · {route?.phase?.replace('_',' ') || 'off duty'}</span><strong>Day {day}</strong></div><div className="topbar-actions"><button className="open-player-view" onClick={openPlayerView}><OpenInNewIcon/> Player View</button><label title="Continuously mirror this camera in Player View"><input type="checkbox" checked={playerFollow} onChange={event=>setPlayerFollow(event.target.checked)}/> Follow DM</label><label title="Identify every building in Player View"><input type="checkbox" checked={showAllPlayerLabels} onChange={event=>{const visible=event.target.checked;setShowAllPlayerLabels(visible);sendPlayerCommand('labels_all',{visible});}}/> All labels</label><div className="time-controls"><button onClick={()=>advanceTime(-60)}>-1h</button><button onClick={()=>setRunning(v=>!v)}>{running?'Ⅱ':'▶'}</button>{[1,2,4].map(v=><button key={v} className={speed===v?'active':''} onClick={()=>setSpeed(v)}>{v}×</button>)}<button onClick={()=>advanceTime(60)}>+1h</button></div></div></header>
    <div className="settlement-body">
      <aside className="settlement-tools"><button className={activeTool==='atlas'?'active':''} onClick={()=>setActiveTool('atlas')}><PublicIcon/><span>Atlas</span></button><button disabled={!designLoaded} className={activeTool==='inspect'?'active':''} onClick={()=>setActiveTool('inspect')}><HomeWorkIcon/><span>Inspect</span></button><button disabled={!designLoaded} className={activeTool==='reference'?'active':''} onClick={()=>setActiveTool('reference')}><LayersIcon/><span>Reference</span></button><button disabled={!designLoaded} className={activeTool==='road'?'active':''} onClick={()=>setActiveTool('road')}><RouteIcon/><span>Roads</span></button><button disabled={!designLoaded} className={activeTool==='fortification'?'active':''} onClick={()=>setActiveTool('fortification')}><FenceIcon/><span>Walls</span></button><button disabled={!designLoaded} className={activeTool==='water'?'active':''} onClick={()=>setActiveTool('water')}><WaterIcon/><span>Water</span></button><button disabled={!designLoaded} className={activeTool==='region'?'active':''} onClick={()=>setActiveTool('region')}><ParkIcon/><span>Regions</span></button><button disabled={!designLoaded} className={activeTool==='build'?'active':''} onClick={()=>setActiveTool('build')}><AddIcon/><span>Build</span></button><button disabled={!designLoaded} className={activeTool==='terrain'?'active':''} onClick={()=>setActiveTool('terrain')}><ParkIcon/><span>Terrain</span></button><button disabled={!designLoaded} className={activeTool==='travel'?'active':''} onClick={()=>setActiveTool('travel')}><RouteIcon/><span>Travel</span></button><button disabled={!designLoaded} className={activeTool==='economy'?'active':''} onClick={()=>setActiveTool('economy')}><StorefrontIcon/><span>Economy</span></button></aside>
      <main className="settlement-map" onClick={()=>setMapContext(null)}>
        {activeTool!=='atlas'&&mapLoading&&<MapLoading settlementName={settlementName}/>}
        {activeTool!=='atlas'&&designLoaded&&!mapLoading&&<Suspense fallback={<MapLoading settlementName={settlementName}/>}><SettlementMapEditor activeTool={activeTool} assets={assets} buildings={buildings} setBuildings={setBuildings} selected={selectedBuilding} setSelected={setSelected} roads={roads} setRoads={setRoads} strokes={terrainStrokes} setStrokes={setTerrainStrokes} heightMap={heightMap} setHeightMap={setHeightMap} waterBodies={waterBodies} setWaterBodies={setWaterBodies} mapEnvironment={mapEnvironment} setMapEnvironment={setMapEnvironment} setFortifications={setFortifications} dusk={(simulation.time?.hour??12)>=18||(simulation.time?.hour??12)<6} lamps={lamps} partyPosition={travelContext.party_position} destination={destination} onWaypoint={(point)=>chooseDestination({...point,map_key:atlas.locations.find(location=>location.id===activeSettlementId)?.map_key||'settlement',name:'Map waypoint',road_access:true,water_access:point.x>500})} referenceLayers={referenceLayers} onReferencePoint={recordCalibrationPoint} calibrationPoints={calibrationPoints} fitRequest={fitRequest} pointsOfInterest={travelContext.points_of_interest} onMapContext={setMapContext} onCameraChange={playerFollow?camera=>sendPlayerCommand('camera',{camera}):null}/></Suspense>}
        {activeTool!=='atlas'&&!designLoaded&&!mapLoading&&<div className="settlement-map-loading is-error" role="status"><strong>{saveStatus}</strong><span>Return to the Atlas and choose a settlement to try again.</span><button type="button" onClick={()=>setActiveTool('atlas')}>Open World Atlas</button></div>}
        {activeTool!=='atlas'&&designLoaded&&!mapLoading&&<div className="map-hint">{activeTool==='travel'?'Click terrain to set a waypoint':activeTool==='build'?'Choose an asset, then click its roof center':activeTool==='terrain'?'Drag to sculpt terrain · WASD or arrows to pan':activeTool==='road'?'Click a road or list entry, then choose Add Points or Edit Points':activeTool==='fortification'?'Click a wall or list entry, then choose Add Points or Edit Points':activeTool==='water'?'Click a path for a river or a shoreline for lakes and oceans':activeTool==='region'?'Click at least three boundary points to define a region':activeTool==='reference'?'Click two known points to calibrate distance':'Drag buildings or the gold footprint vertices · Scroll to zoom · WASD or arrows to pan'}</div>}
        {activeTool==='reference'&&selectedReference&&<div className="reference-projection-toggle"><label><input type="checkbox" checked={selectedReference.project_to_terrain!==false} onChange={event=>updateReference(selectedReference.id,layer=>({...layer,project_to_terrain:event.target.checked}))}/> Project image onto sculpted terrain</label><small>Opacity controls the projected overlay, preserving the material underneath.</small></div>}
        {mapContext&&<div className="player-map-context" style={{left:mapContext.x,top:mapContext.y}} onClick={event=>event.stopPropagation()}><strong>{mapContext.target?.building?.name||mapContext.target?.point?.name||'Map point'}</strong><button onClick={()=>{centerDmOn({point:mapContext.target?.point});setMapContext(null);}}><CenterFocusStrongIcon/> Center in view</button><button onClick={()=>centerPlayerOn(mapContext.target?.point)}><CenterFocusStrongIcon/> Center in Player View</button>{mapContext.target?.kind==='building'&&<button onClick={()=>setBuildingLabel(mapContext.target.building,!playerLabels.includes(String(mapContext.target.building.id)))}><VisibilityIcon/> {playerLabels.includes(String(mapContext.target.building.id))?'Hide building label':'Show building label'}</button>}</div>}
        {activeTool==='atlas'&&<div className="world-atlas"><section className="atlas-stage"><div className="atlas-heading"><div><span>WORLD ATLAS</span><h3>{atlas.atlas?.name||'Campaign World'}</h3></div>{atlas.atlas?.source_url&&<a href={atlas.atlas.source_url} target="_blank" rel="noreferrer">Open reference atlas ↗</a>}</div><AtlasMap atlas={atlas.atlas} locations={atlas.locations} selectedId={activeSettlementId} onSelect={id=>{openSettlement(id);}} onPlace={placeSettlement}/><small className="atlas-help">Select a settlement in the list, then click the overworld map to place or move it.</small></section><aside className="atlas-list"><div><span>SETTLEMENTS</span><strong>{atlas.locations.length}</strong></div><form onSubmit={createSettlement}><input value={newSettlementName} onChange={event=>setNewSettlementName(event.target.value)} placeholder="Settlement name"/><button type="submit"><AddIcon/> Create</button></form><div className="atlas-location-list">{atlas.locations.map(location=><article key={location.id} className={`${location.id===activeSettlementId?'active ':''}${location.status==='destroyed'?'destroyed':''}`}><button type="button" className="atlas-open" onClick={()=>openSettlement(location.id)}><strong>{location.name}{location.status==='destroyed'?' · Destroyed':''}</strong><small>{location.atlas_x==null?'Not placed':`${Math.round(location.atlas_x*100)}%, ${Math.round(location.atlas_y*100)}%`} · {location.settlement_type||'town'}</small></button><div className="atlas-item-actions">{location.atlas_x!=null&&<button type="button" onClick={()=>removeSettlementMarker(location)} title={`Remove ${location.name} from map`}>Unplace</button>}<button type="button" onClick={()=>setSettlementStatus(location,location.status==='destroyed'?'active':'destroyed')}>{location.status==='destroyed'?'Restore':'Destroy'}</button><button type="button" className="atlas-delete" onClick={()=>deleteSettlement(location)} title={`Permanently delete ${location.name}`}><DeleteOutlineIcon/></button></div></article>)}</div><small className="atlas-status">{atlasStatus}</small></aside></div>}
        {activeTool==='reference'&&<div className="reference-menu"><span>REFERENCE LAYERS</span><form onSubmit={uploadReference}><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>setReferenceUpload(value=>({...value,file:event.target.files?.[0]||null,name:value.name||event.target.files?.[0]?.name.replace(/\.[^.]+$/,'')||''}))}/><label>Name<input value={referenceUpload.name} onChange={event=>setReferenceUpload(value=>({...value,name:event.target.value}))}/></label><div className="reference-dimensions"><label>Width (ft)<input type="number" min="1" value={referenceUpload.width_feet} onChange={event=>setReferenceUpload(value=>({...value,width_feet:Number(event.target.value)}))}/></label><label>Height (ft)<input type="number" min="1" value={referenceUpload.height_feet} onChange={event=>setReferenceUpload(value=>({...value,height_feet:Number(event.target.value)}))}/></label></div><button className="calculate-route" disabled={!referenceUpload.file}>Upload reference</button><small>{uploadStatus}</small></form>{referenceLayers.length>0&&<><div className="reference-layer-list">{referenceLayers.map(layer=><button key={layer.id} className={selectedReference?.id===layer.id?'active':''} onClick={()=>{setSelectedReferenceId(layer.id);setCalibrationPoints([]);}}>{layer.name}<small>{Math.round(layer.width_feet)} × {Math.round(layer.height_feet)} ft</small></button>)}</div>{selectedReference&&<div className="reference-settings"><label><input type="checkbox" checked={selectedReference.visible} onChange={event=>updateReference(selectedReference.id,layer=>({...layer,visible:event.target.checked}))}/> Visible</label><small>Scale: {(Number(selectedReference.feet_per_pixel)||Number(selectedReference.width_feet)/Math.max(1,Number(selectedReference.pixel_width))).toFixed(3)} feet per source pixel</small><label>Opacity <strong>{Math.round(selectedReference.opacity*100)}%</strong><input type="range" min="0" max="1" step=".05" value={selectedReference.opacity} onChange={event=>updateReference(selectedReference.id,layer=>({...layer,opacity:Number(event.target.value)}))}/></label><div className="reference-dimensions"><label>Width (ft)<input type="number" min="1" value={selectedReference.width_feet} onChange={event=>updateReference(selectedReference.id,layer=>({...layer,width_feet:Number(event.target.value),feet_per_pixel:Number(event.target.value)/Math.max(1,Number(layer.pixel_width))}))}/></label><label>Height (ft)<input type="number" min="1" value={selectedReference.height_feet} onChange={event=>updateReference(selectedReference.id,layer=>({...layer,height_feet:Number(event.target.value)}))}/></label><label>Center X<input type="number" value={selectedReference.origin_x} onChange={event=>updateReference(selectedReference.id,layer=>({...layer,origin_x:Number(event.target.value)}))}/></label><label>Center Y<input type="number" value={selectedReference.origin_y} onChange={event=>updateReference(selectedReference.id,layer=>({...layer,origin_y:Number(event.target.value)}))}/></label></div><div className="calibration-box"><strong>Known-distance calibration</strong><small>{calibrationPoints[0]?`A: ${calibrationPoints[0].x}, ${calibrationPoints[0].y}`:'Click point A'} · {calibrationPoints[1]?`B: ${calibrationPoints[1].x}, ${calibrationPoints[1].y}`:'Click point B'}</small><label>Distance (ft)<input type="number" min="1" value={knownDistance} onChange={event=>setKnownDistance(Number(event.target.value))}/></label><button onClick={applyReferenceCalibration} disabled={calibrationPoints.length!==2}>Apply calibration</button></div><div className="reference-actions"><button onClick={()=>setFitRequest(value=>value+1)}>Fit in view</button><button className="danger-action" onClick={()=>{setReferenceLayers(values=>values.filter(layer=>layer.id!==selectedReference.id));setSelectedReferenceId(null);setCalibrationPoints([]);}}>Remove layer</button></div></div>}</>}</div>}
        {activeTool==='travel'&&<div className="travel-menu"><span>PLAN A JOURNEY</span><label>Destination<select value={destination?.id||''} onChange={(e)=>chooseDestination(travelContext.points_of_interest.find(point=>point.id===Number(e.target.value))||null)}><option value="">Select a point of interest</option>{travelContext.points_of_interest.map(point=><option key={point.id} value={point.id}>{point.name}</option>)}</select></label><label>Travelers<input type="number" min="1" value={partySize} onChange={(e)=>setPartySize(Math.max(1,Number(e.target.value)))}/></label>{destination&&<><div className="travel-destination"><strong>{destination.name}</strong><small>{Math.round(destination.x)} E · {Math.round(destination.y)} N</small></div><button className="calculate-route" onClick={()=>calculateTravel()}>Calculate travel options</button></>}{travelPlan&&<div className="travel-options">{travelPlan.options.map(option=><div key={option.mode} className={!option.available?'unavailable':''}><strong>{option.label}</strong>{option.available?<><span>{formatDuration(option.elapsed_minutes)}</span><small>{option.distance_miles} mi · {formatCost(option.cost_cp)}</small></>:<small>{option.unavailable_reason}</small>}</div>)}<button className="set-party-button" onClick={setPartyHere}>Move party to destination</button></div>}</div>}
        {activeTool==='economy'&&<div className="economy-menu"><div className="economy-header"><div><span>SETTLEMENT ECONOMY</span><h3>Market day {economy.day_index}</h3></div><div><button onClick={()=>runEconomy(1)}>Run day</button><button onClick={()=>runEconomy(10)}>Run tenday</button></div></div><div className="market-grid">{economy.markets.map(market=><article key={market.id} className={market.price_index>1.3?'shortage':''}><div><strong>{market.name}</strong><span>{market.current_price_cp} cp</span></div><small>{Math.round(market.stock)} / {Math.round(market.target_stock)} units · {market.price_index}× base</small>{market.last_imported>0&&<em>Imported {Math.round(market.last_imported)} today</em>}<div className="market-disrupt"><input type="number" min="1" value={commodityQuantity} onChange={e=>setCommodityQuantity(Math.max(1,Number(e.target.value)))}/><button onClick={()=>disruptMarket(market.commodity_key)}>Party buys</button></div></article>)}</div><div className="business-analytics"><div className="business-select"><label>Business<select value={selectedBusinessId||''} onChange={e=>setSelectedBusinessId(Number(e.target.value))}>{economy.businesses.map(business=><option key={business.id} value={business.id}>{business.name}{business.player_owned?' · Party':''}</option>)}</select></label>{selectedBusiness&&<div className="business-health"><span className={selectedBusiness.closed?'closed':''}>{selectedBusiness.closed?'Closed':'Operating'}</span><strong>{formatCost(selectedBusiness.cash_reserves_cp)} reserves</strong><small>Foot traffic {selectedBusiness.foot_traffic}× · Slump {selectedBusiness.slump_days} days</small></div>}</div><div className="chart-wrap"><div className="chart-heading"><strong>Daily sales</strong><span>Last tenday: {formatCost(tenday.revenue)} revenue · {formatCost(tenday.profit)} profit</span></div><SalesChart rows={selectedHistory}/></div></div></div>}
      </main>
      <aside className="settlement-panel">
        {activeTool==='reference'&&selectedReference&&<section className="panel-section reference-source-detail"><div className="panel-kicker">REFERENCE SOURCE</div><p><strong>{selectedReference.pixel_width} × {selectedReference.pixel_height}</strong> source pixels</p>{selectedReference.original_image_url&&<a href={selectedReference.original_image_url} target="_blank" rel="noreferrer">Open full-resolution original ↗</a>}<label>Purpose<select value={selectedReference.scope||'city'} onChange={event=>updateReference(selectedReference.id,layer=>({...layer,scope:event.target.value}))}><option value="city">City or region</option><option value="building">Building exterior</option><option value="battle">Battle map</option></select></label><label>Linked building<select value={selectedReference.linked_building_id||''} onChange={event=>updateReference(selectedReference.id,layer=>({...layer,linked_building_id:event.target.value||null}))}><option value="">None</option>{buildings.map(building=><option key={building.id} value={building.id}>{building.name}</option>)}</select></label><label className="reference-sync"><input type="checkbox" checked={Boolean(selectedReference.sync_exterior)} onChange={event=>updateReference(selectedReference.id,layer=>({...layer,sync_exterior:event.target.checked}))}/> Keep this layer aligned to the building exterior</label></section>}
        {designLoaded&&activeTool!=='atlas'&&<section className="panel-section location-search"><div className="panel-kicker">FIND A LOCATION</div><input type="search" value={locationSearch} onChange={event=>setLocationSearch(event.target.value)} placeholder="Name, type, owner, faction…" aria-label="Search settlement locations"/>{locationSearch&&<div className="location-search-results">{locationResults.map(location=><button type="button" key={location.id} className={selectedLocation?.id===location.id?'active':''} onClick={()=>selectLocation(location)}><strong>{location.title}</strong><small>{location.type}{location.owner?` · ${location.owner}`:''}{textAffiliation(location)}</small></button>)}{!locationResults.length&&<small>No matching mapped locations.</small>}</div>}{selectedLocation&&<div className="location-search-selection"><strong>{selectedLocation.title}</strong><small>{selectedLocation.type}{selectedLocation.affiliation?` · ${selectedLocation.affiliation}`:''}</small><div><button type="button" onClick={()=>centerDmOn(selectedLocation)}><CenterFocusStrongIcon/> Center in view</button><button type="button" onClick={()=>centerPlayerOnLocation(selectedLocation)}><OpenInNewIcon/> Center in Player View</button></div></div>}</section>}
        <section className="overview-card"><div className="panel-kicker">SETTLEMENT OVERVIEW</div><div className="stat-grid"><Stat icon={<GroupsIcon/>} value={resources.population} label="Population"/><Stat icon={<AgricultureIcon/>} value={resources.food} label="Food" tone="gold"/><Stat icon={<ParkIcon/>} value={resources.wood} label="Timber" tone="green"/><Stat icon="◈" value={resources.coin} label="Coin" tone="blue"/></div></section>
        <section className="panel-section building-detail"><div className="panel-kicker">SELECTED STRUCTURE</div>{selectedBuilding?<><div className="selected-title"><span><HomeWorkIcon/></span><div><input className="building-name-input" value={selectedBuilding.name} onChange={event=>updateSelectedBuilding(building=>({...building,name:event.target.value}))}/><p>{selectedAsset?.name||selectedBuilding.asset_key}</p></div></div><dl><div><dt>Footprint</dt><dd>{Math.round(selectedBuilding.width_feet)} × {Math.round(selectedBuilding.depth_feet)} ft</dd></div><div><dt>Front edge</dt><dd>{selectedRoad?`${selectedRoad.name} · ${selectedRoad.width_feet} ft`:'Not road-aligned'}</dd></div><div><dt>Asset file</dt><dd>{selectedAsset?.model_url||'Built-in model'}</dd></div></dl><label className="structure-elevation">Elevation offset (ft)<input type="number" step="1" value={Number(selectedBuilding.elevation)||0} onChange={event=>updateSelectedBuilding(building=>({...building,elevation:Number(event.target.value)||0}))}/><small>0 keeps the full footprint above the terrain. Use a negative value to sink it.</small></label><div className="structure-actions"><button onClick={()=>updateSelectedBuilding(building=>({...building,rotation:building.rotation+Math.PI/2,front_road_id:null}))}>Rotate 90°</button><button className="danger-action" onClick={()=>{setBuildings(values=>values.filter(building=>building.id!==selectedBuilding.id));setSelected(null);}}>Delete</button></div><div className="room-list"><strong>Rooms ({selectedBuilding.rooms?.length||0})</strong><ul>{(selectedBuilding.rooms||[]).map(room=><li key={room}>{room}</li>)}</ul></div></>:<p className="empty-selection">Select a structure to drag it, rotate it, or move its gold footprint vertices.</p>}</section>
        {selectedBuilding&&<section className="panel-section location-metadata"><div className="panel-kicker">LOCATION DIRECTORY</div><label>Business or location type<input value={selectedBuilding.business_type||selectedBuilding.building_type||''} onChange={event=>updateSelectedBuilding(building=>({...building,business_type:event.target.value}))} placeholder="Tavern, guildhall, gang base…"/></label><label>Owner<input value={selectedBuilding.owner_name||''} onChange={event=>updateSelectedBuilding(building=>({...building,owner_name:event.target.value}))} placeholder="Person or family"/></label><label>Owner affiliation<input value={selectedBuilding.owner_affiliation||''} onChange={event=>updateSelectedBuilding(building=>({...building,owner_affiliation:event.target.value}))} placeholder="Guild, faction, noble house…"/></label><label>Factions<input value={Array.isArray(selectedBuilding.factions)?selectedBuilding.factions.join(', '):(selectedBuilding.factions||'')} onChange={event=>updateSelectedBuilding(building=>({...building,factions:event.target.value.split(',').map(value=>value.trim()).filter(Boolean)}))} placeholder="Red Sashes, Harpers"/></label><label>Search tags<input value={Array.isArray(selectedBuilding.tags)?selectedBuilding.tags.join(', '):(selectedBuilding.tags||'')} onChange={event=>updateSelectedBuilding(building=>({...building,tags:event.target.value.split(',').map(value=>value.trim()).filter(Boolean)}))} placeholder="Cheap ale, spell components…"/></label><label>Description<textarea value={selectedBuilding.description||''} onChange={event=>updateSelectedBuilding(building=>({...building,description:event.target.value}))}/></label><div className="location-focus-actions"><button type="button" onClick={()=>centerDmOn({point:{x:selectedBuilding.x,y:selectedBuilding.y,elevation:selectedBuilding.elevation||0}})}><CenterFocusStrongIcon/> Center in view</button><button type="button" onClick={()=>centerPlayerOnLocation({point:{x:selectedBuilding.x,y:selectedBuilding.y,elevation:selectedBuilding.elevation||0}})}><OpenInNewIcon/> Center in Player View</button></div></section>}
        <section className="panel-section route-status"><div className="panel-kicker">LAMPLIGHTER ROUTE</div><p><strong>{route?.name || 'No route configured'}</strong></p><dl><div><dt>Status</dt><dd>{route?.phase?.replace('_',' ') || '—'}</dd></div><div><dt>Lit lamps</dt><dd>{lamps.filter(l=>l.lit).length} / {lamps.length}</dd></div><div><dt>Next stop</dt><dd>{lamps.find(l=>l.id===route?.next_lamp_id)?.name || '—'}</dd></div></dl></section>
        {activeTool==='economy'&&<section className="panel-section workforce-status"><div className="panel-kicker">WORKFORCE BALANCE</div>{economy.workforce?.occupations?.map(job=><div key={job.key}><span>{job.name}</span><strong className={job.workers>job.target_workers?'over':''}>{job.workers} / {job.target_workers}</strong></div>)}<button onClick={rebalanceWorkforce}>Rebalance eligible workers</button><div className="panel-kicker noble-heading">NOBLE FAMILIES</div>{economy.noble_families?.map(family=><article key={family.id}><strong>{family.name}</strong><span>{formatCost(family.wealth_cp)} liquid</span><small>{family.investments.length} holdings · {family.recent_decisions[0]?.summary||'No meeting decisions yet'}</small></article>)}</section>}
        <section className="panel-section event-log"><div className="panel-kicker">RECENT EVENTS</div>{eventLog.map((event,index)=><div key={`${event}-${index}`}><time>Day {Math.max(1,day-index)}</time><p>{event}</p></div>)}</section>
      </aside>
    </div>
  </div>;
}
