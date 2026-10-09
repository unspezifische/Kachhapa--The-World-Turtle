import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { FALLBACK_ASSET_CATALOG, FEET_PER_SCENE_UNIT } from './settlementEditor';
import { createTileStore, hydrateTiles, setStoreDefaults, TILE_FEET, tileKey } from './settlementTiles';
import './SettlementPlayerView.css';

const SettlementMapEditor = lazy(() => import('./SettlementMapEditor'));

export default function SettlementPlayerView({ headers, socket }) {
  const campaignId = headers?.campaignID || headers?.CampaignID;
  const [map, setMap] = useState({
    buildings: [],
    roads: [],
    terrain_strokes: [],
    water_bodies: [],
    environment: {},
    reference_layers: [],
    asset_catalog: FALLBACK_ASSET_CATALOG,
  });
  const [simulation, setSimulation] = useState({ time: { hour: 12 }, routes: [] });
  const [partyPosition, setPartyPosition] = useState(null);
  const [settlementId, setSettlementId] = useState(null);
  const [settlementName, setSettlementName] = useState('New Settlement');
  const [selectedBuilding,setSelectedBuilding]=useState(null);
  const [status, setStatus] = useState('Loading settlement…');
  const initialParams = new URLSearchParams(window.location.search);
  const requestedSettlementId = Number(initialParams.get('settlementID')) || null;
  const [viewCommand,setViewCommand] = useState(null);
  const [labelState,setLabelState] = useState({ids:(initialParams.get('labels')||'').split(',').filter(Boolean),showAll:initialParams.get('showAllLabels')==='1'});
  const ignoreEdit = useCallback(() => {}, []);
  const tileStoreRef = useRef(null);
  if (tileStoreRef.current === null) tileStoreRef.current = createTileStore();
  const [tileStoreVersion, setTileStoreVersion] = useState(0);
  const tileCoverageRef = useRef(new Map());
  const tileFetchTimerRef = useRef(null);
  const tileFetchControllerRef = useRef(null);

  const streamTerrainTiles = useCallback((camera) => {
    const bounds = camera?.terrainBounds;
    if (!campaignId || !settlementId || !bounds) return;
    if (tileFetchTimerRef.current !== null) clearTimeout(tileFetchTimerRef.current);
    tileFetchTimerRef.current = setTimeout(async () => {
      tileFetchTimerRef.current = null;
      let minX = Math.floor(bounds.minX / TILE_FEET), maxX = Math.floor(bounds.maxX / TILE_FEET);
      let minZ = Math.floor(bounds.minY / TILE_FEET), maxZ = Math.floor(bounds.maxY / TILE_FEET);
      if ((maxX - minX + 1) * (maxZ - minZ + 1) > 1024) {
        const centerX = Math.floor(((camera.target?.[0] || 0) * FEET_PER_SCENE_UNIT) / TILE_FEET);
        const centerZ = Math.floor(((camera.target?.[2] || 0) * FEET_PER_SCENE_UNIT) / TILE_FEET);
        minX = centerX - 15; maxX = centerX + 16; minZ = centerZ - 15; maxZ = centerZ + 16;
      }
      const cellFeet = Math.max(1, Number(camera.window?.cellFeet) || 16);
      const grid = Math.min(257, Math.max(2, Math.ceil(TILE_FEET / cellFeet) + 1));
      let needed = false;
      for (let z = minZ; z <= maxZ && !needed; z += 1) for (let x = minX; x <= maxX; x += 1) {
        if ((tileCoverageRef.current.get(tileKey(x, z)) || 0) < grid) { needed = true; break; }
      }
      if (!needed) return;
      tileFetchControllerRef.current?.abort();
      const controller = new AbortController();
      tileFetchControllerRef.current = controller;
      try {
        const response = await axios.get(`/api/settlement-map/${campaignId}/terrain-tiles`, {
          headers, signal: controller.signal,
          params: { settlement_id: settlementId, min_x: minX, max_x: maxX,
            min_z: minZ, max_z: maxZ, cell_feet: cellFeet },
        });
        if (controller.signal.aborted) return;
        for (let z = minZ; z <= maxZ; z += 1) for (let x = minX; x <= maxX; x += 1) {
          tileCoverageRef.current.set(tileKey(x, z), grid);
        }
        hydrateTiles(tileStoreRef.current, response.data.tiles || []);
        setTileStoreVersion(value => value + 1);
      } catch (error) {
        if (!controller.signal.aborted) console.error('Unable to stream player terrain:', error);
      }
    }, 120);
  }, [campaignId, headers, settlementId]);

  useEffect(() => () => {
    if (tileFetchTimerRef.current !== null) clearTimeout(tileFetchTimerRef.current);
    tileFetchControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!campaignId) return undefined;
    let active = true;

    axios.get(`/api/world-atlas/${campaignId}`, { headers }).then((atlasResponse) => {
      const location=atlasResponse.data.locations?.find(item=>item.id===requestedSettlementId)||atlasResponse.data.locations?.find(item=>item.is_primary)||atlasResponse.data.locations?.[0];
      if(!location)throw new Error('No settlement is available.');
      return Promise.all([
      axios.get(`/api/settlement-map/${campaignId}?settlement_id=${location.id}`, { headers }),
      axios.get(`/api/settlement-simulation/${campaignId}`, { headers }),
      axios.get(`/api/travel/${campaignId}/context`, { headers }),
      ]);
    }).then(([mapResponse, simulationResponse, travelResponse]) => {
      if (!active) return;
      setMap(mapResponse.data);
      tileStoreRef.current.clear();
      tileCoverageRef.current.clear();
      setStoreDefaults(tileStoreRef.current, { seaLevelFeet: Number(mapResponse.data.environment?.sea_level_feet) || 0 });
      setTileStoreVersion(value => value + 1);
      setSettlementId(mapResponse.data.settlement_id);
      setSettlementName(mapResponse.data.name||'New Settlement');
      setSimulation(simulationResponse.data);
      setPartyPosition(travelResponse.data.party_position || null);
      setStatus('');
    }).catch((error) => {
      console.error('Unable to load the player settlement map:', error);
      if (active) setStatus('Unable to load the settlement map.');
    });

    return () => { active = false; };
  }, [campaignId, headers, requestedSettlementId]);

  useEffect(() => {
    if (!socket) return undefined;
    const updateMap = (nextMap) => {
      if ((!nextMap?.campaign_id || Number(nextMap.campaign_id) === Number(campaignId)) && (!nextMap?.settlement_id || Number(nextMap.settlement_id)===Number(settlementId))) {setMap(nextMap);setSettlementName(nextMap.name||'New Settlement');}
    };
    const updateSimulation = (nextSimulation) => {
      if (!nextSimulation?.campaign_id || Number(nextSimulation.campaign_id) === Number(campaignId)) setSimulation(nextSimulation);
    };
    const updateParty = (position) => setPartyPosition(position);
    const updatePresentation = (command) => {
      if(Number(command?.campaign_id)!==Number(campaignId)||Number(command?.settlement_id)!==Number(settlementId))return;
      if(command.action==='camera')setViewCommand({mode:'camera',camera:command.camera,nonce:Date.now()});
      if(command.action==='focus')setViewCommand({mode:'point',point:command.point,nonce:Date.now()});
      if(command.action==='label')setLabelState(value=>({...value,ids:command.visible?[...new Set([...value.ids,String(command.building_id)])]:value.ids.filter(id=>id!==String(command.building_id))}));
      if(command.action==='labels_all')setLabelState(value=>({...value,showAll:Boolean(command.visible)}));
    };

    socket.on('settlement_map_updated', updateMap);
    socket.on('settlement_simulation_updated', updateSimulation);
    socket.on('party_position_updated', updateParty);
    socket.on('settlement_player_command', updatePresentation);
    return () => {
      socket.off('settlement_map_updated', updateMap);
      socket.off('settlement_simulation_updated', updateSimulation);
      socket.off('party_position_updated', updateParty);
      socket.off('settlement_player_command', updatePresentation);
    };
  }, [socket, campaignId, settlementId]);

  const route = simulation.routes?.[0];
  const hour = simulation.time?.hour ?? 12;
  const minute = simulation.time?.minute ?? 0;

  return (
    <div className="settlement-player-view">
      <Suspense fallback={<div className="settlement-player-loading" role="status"><i/><span>Preparing 3D map…</span></div>}><SettlementMapEditor
        activeTool="player"
        tileStore={tileStoreRef.current}
        tileStoreVersion={tileStoreVersion}
        onCameraChange={streamTerrainTiles}
        assets={map.asset_catalog?.length ? map.asset_catalog : FALLBACK_ASSET_CATALOG}
        buildings={map.buildings || []}
        setBuildings={ignoreEdit}
        selected={selectedBuilding}
        setSelected={setSelectedBuilding}
        roads={map.roads || []}
        setRoads={ignoreEdit}
        strokes={map.terrain_strokes || []}
        setStrokes={ignoreEdit}
        heightMap={(map.reference_layers || []).find(layer=>layer.layer_type==='heightmap') || null}
        setHeightMap={ignoreEdit}
        waterBodies={map.water_bodies || []}
        setWaterBodies={ignoreEdit}
        mapEnvironment={map.environment || {}}
        lamps={route?.lamps || []}
        partyPosition={partyPosition}
        destination={null}
        onWaypoint={ignoreEdit}
        referenceLayers={(map.reference_layers || []).filter(layer=>layer.layer_type!=='heightmap')}
        fitRequest={(map.reference_layers || []).length ? 1 : 0}
        viewCommand={viewCommand}
        labelState={labelState}
        campaignName={headers?.campaignName || headers?.CampaignName || initialParams.get('campaignName') || ''}
      /></Suspense>
      <div className="settlement-player-status" aria-live="polite">
        <strong>{settlementName}</strong>
        <span>{status || `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} · Day ${simulation.time?.day ?? '—'}`}</span>
      </div>
      {selectedBuilding&&<aside className="settlement-player-building"><button type="button" onClick={()=>setSelectedBuilding(null)} aria-label="Close">×</button><strong>{selectedBuilding.name}</strong><span>{selectedBuilding.business_type||selectedBuilding.building_type||'Building'}</span>{selectedBuilding.description&&<p>{selectedBuilding.description}</p>}<small>{selectedBuilding.owner_name?`Owner: ${selectedBuilding.owner_name}`:'Owner unknown'} · {(selectedBuilding.rooms||[]).length} rooms</small></aside>}
    </div>
  );
}
