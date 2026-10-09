import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';

import {
  AppBar,
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,

  Divider,
  FormControl,
  FormControlLabel,
  MenuItem,
  Select,
  Slider,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Tooltip,
  Typography,
  IconButton,
} from '@mui/material';

import ExitToAppIcon from '@mui/icons-material/ExitToApp';  // Icon for Exit tool

import PublicIcon from '@mui/icons-material/Public';      // Icon for Atlas tool
import HomeWorkIcon from '@mui/icons-material/HomeWork';  // Icon for Inspector tool
import CompareIcon from '@mui/icons-material/Compare';    // Icon for Reference tool
import EditRoadIcon from '@mui/icons-material/EditRoad';  // Icon for Roads tool
import FenceIcon from '@mui/icons-material/Fence';        // Icon for Walls tool
import WaterIcon from '@mui/icons-material/Water';        // Icon for Water tool
import PolylineIcon from '@mui/icons-material/Polyline';  // Icon for Regions tool
import AddBusinessIcon from '@mui/icons-material/AddBusiness';  // Icon for Build tool
import TerrainIcon from '@mui/icons-material/Terrain';    // Icon for Terrain Sculpting tool
import NavigationIcon from '@mui/icons-material/Navigation';  // Icon for Travel
import TrendingUpIcon from '@mui/icons-material/TrendingUp';  // Icon for Economy tool
import CloudIcon from '@mui/icons-material/Cloud';            // Icon for Atmosphere tool
import ThunderstormIcon from '@mui/icons-material/Thunderstorm';  // Icon for Weather tool
import ScheduleIcon from '@mui/icons-material/Schedule';          // Icon for Time of Day

// Time of Day Control Panel icons
import FastRewindIcon from '@mui/icons-material/FastRewind';  // For large negative jumps
import FastForwardIcon from '@mui/icons-material/FastForward'; // For large positive jumps
import ArrowBackIcon from '@mui/icons-material/ArrowBack';    // For standard small reverse jumps
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'; // For standard small forward jumps
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'; // For day-based jumps

import WbTwilightIcon from '@mui/icons-material/WbTwilight';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import NightsStayIcon from '@mui/icons-material/NightsStay';
import BedtimeIcon from '@mui/icons-material/Bedtime';


// Miscellaneous other icons
import AddIcon from '@mui/icons-material/Add';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import AtlasViewport from './AtlasViewport';
import BlueprintLevels from './BlueprintLevels';
import ReferencePlacementPanel from './ReferencePlacementPanel';
import { mergeReferenceSave } from './referencePlacement';
import {
  calibrateReferenceLayer,
  FALLBACK_ASSET_CATALOG,
  FEET_PER_SCENE_UNIT,
  closeBlueprintFootprint,
} from './settlementEditor';
import {
  createTileStore,
  seedStoreFromHeightMap,
  hydrateTiles,
  setStoreDefaults,
  bakeStrokesIntoTiles,
  TILE_FEET,
  tileKey,
} from './settlementTiles';

import {
  searchSettlementLocations,
  settlementSearchLocations
} from './settlementSearch';

import './SettlementManager.css';
import './SettlementToolPanels.css';

const loadSettlementMapEditor = () => import('./SettlementMapEditor');
const SettlementMapEditor = lazy(loadSettlementMapEditor);
// The MapEditor file provides the actual tool implementation. This file (SettlementManager) just provides the UI

async function readReferenceImageDimensions(file) {
  const bytes = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
  const view = new DataView(bytes.buffer);
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
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
  const width = 440, height = 130, pad = 16, max = Math.max(...rows.map(row => row.revenue_cp), 1);
  const points = rows.map((row, index) => `${pad + (index / Math.max(1, rows.length - 1)) * (width - pad * 2)},${height - pad - (row.revenue_cp / max) * (height - pad * 2)}`).join(' ');
  return <svg className="sales-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily business revenue"><line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} /><polyline points={points} />{rows.map((row, index) => <circle key={row.day_index} cx={pad + (index / Math.max(1, rows.length - 1)) * (width - pad * 2)} cy={height - pad - (row.revenue_cp / max) * (height - pad * 2)} r="2"><title>Day {row.day_index}: {row.revenue_cp} cp</title></circle>)}</svg>;
}

const textAffiliation = location => location.affiliation ? ` · ${location.affiliation}` : '';

export default function SettlementManager({ headers, socket, mainEnvironmentUrl = '/', initialTool = 'atlas' }) {
  const [localViewCommand, setLocalViewCommand] = useState({ mode: 'camera', nonce: Date.now() });
  const activeViewCommand = localViewCommand;

  const [day, setDay] = useState(24)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(1);
  const requestedTool = new URLSearchParams(window.location.search).get('tool');
  const [assetKey, setAssetKey] = useState(null);
  const [buildings, setBuildings] = useState([])
  const [buildMode, setBuildMode] = useState('place-asset'); // 'place-asset' | 'draw-blueprint'

  const [selected, setSelected] = useState(null)
  const [activeTool, setActiveTool] = useState(requestedTool === 'atlas' ? 'atlas' : initialTool);
  const [roads, setRoads] = useState([])
  const [terrainStrokes, setTerrainStrokes] = useState([])
  const [heightMap, setHeightMap] = useState(null)
  const [waterBodies, setWaterBodies] = useState([]);
  const [mapEnvironment, setMapEnvironment] = useState({
    sea_level_feet: 0,
    terrain_material: {
      snow_line_feet: 900,
      snow_blend_feet: 500,
      cliff_normal_threshold: .86
    },
    regions: []
  }), [assets, setAssets] = useState(FALLBACK_ASSET_CATALOG);
  const [blueprintDraft, setBlueprintDraft] = useState(null);

  const setFortifications = useCallback(updater => setMapEnvironment(environment => ({ ...environment, fortifications: typeof updater === 'function' ? updater(environment.fortifications || []) : updater })), []);
  const [referenceLayers, setReferenceLayers] = useState([])
  const [selectedReferenceId, setSelectedReferenceId] = useState(null);
  const [referenceDraft, setReferenceDraft] = useState(null);
  const referenceCameraRef = useRef(null);
  const displayedReferenceLayers = useMemo(() => referenceDraft
    ? [...referenceLayers.filter(layer => layer.id !== referenceDraft.id), referenceDraft]
    : referenceLayers, [referenceLayers, referenceDraft]);
  const [calibrationPoints, setCalibrationPoints] = useState([])
  const [knownDistance, setKnownDistance] = useState(471)
  const [fitRequest, setFitRequest] = useState(0);
  const [designLoaded, setDesignLoaded] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const mapLoadStartedAtRef = useRef(0);
  const [saveStatus, setSaveStatus] = useState('Choose a settlement');

  const [activeCalendar, setActiveCalendar] = useState(null);
  const [manualDate, setManualDate] = useState({ year: 1492, month_index: 0, day: 1, hour: 12, minute: 0 });

  const tileStoreRef = useRef(null);
  if (tileStoreRef.current === null) tileStoreRef.current = createTileStore();

  // tileStore is a mutable Map - its reference never changes even as tiles
  // are added, so nothing that depends on "the tile store's contents" (like
  // computing the settlement's overall bounds) can use it directly as a
  // useMemo/useEffect dependency. This counter stands in for that: bump it
  // whenever tiles are hydrated or dirtied, and pass it down so dependents
  // know to recompute.
  const [tileStoreVersion, setTileStoreVersion] = useState(0);

  // Only tiles in this set get sent on the next save - the backend merges
  // them into whatever's already stored, so we never need to resend the
  // whole settlement's terrain just because it grew.
  const dirtyTileKeysRef = useRef(new Set());
  const terrainTileCoverageRef = useRef(new Map());
  const terrainTileFetchTimerRef = useRef(null);
  const terrainTileFetchControllerRef = useRef(null);

  // Every PUT (chunk flush or debounced full save) runs through this queue so
  // two requests can never interleave and race on the server-side tile merge.
  const saveQueueRef = useRef(Promise.resolve());
  const referenceLayersRef = useRef([]);
  useEffect(() => { referenceLayersRef.current = referenceLayers; }, [referenceLayers]);

  const runSerializedSave = useCallback((task) => {
    const run = saveQueueRef.current.then(task).catch(error => {
      console.error('Unable to save settlement map:',
        error?.response?.status || error?.message, error?.response?.data || error);
      return 0;
    });
    saveQueueRef.current = run;
    return run;
  }, []);

  const [atmosphereSettings, setAtmosphereSettings] = useState({
    sunIntensity: 2.2,
    moonIntensity: 0.15,
    scatteringScale: 1.0
  });

  const [weatherSettings, setWeatherSettings] = useState({
    activeWeather: 'clear',
    fogDensity: 0.01,
    fogColor: '#a9c9dc'
  });

  const [simulation, setSimulation] = useState({ time: { day: 1, hour: 12, minute: 0 }, routes: [] });
  const [travelContext, setTravelContext] = useState({ party_position: null, points_of_interest: [] });
  const [destination, setDestination] = useState(null)
  const [travelPlan, setTravelPlan] = useState(null);
  const [partySize, setPartySize] = useState(4);
  const [economy, setEconomy] = useState({ day_index: 0, markets: [], businesses: [], history: {} });
  const [selectedBusinessId, setSelectedBusinessId] = useState(null);
  const [commodityQuantity, setCommodityQuantity] = useState(25);
  const [atlas, setAtlas] = useState({ atlas: { key: 'blank', name: 'Campaign World' }, locations: [] });
  const [atlasUpload, setAtlasUpload] = useState({ file: null, attribution: '', settingDefault: false });
  const [activeSettlementId, setActiveSettlementId] = useState(null);
  const [selectedAtlasId, setSelectedAtlasId] = useState(null);
  const [settlementName, setSettlementName] = useState('World Atlas');
  const [movingAtlasId, setMovingAtlasId] = useState(null);
  const [pendingAtlasMove, setPendingAtlasMove] = useState(null);
  const [showAtlasUpload, setShowAtlasUpload] = useState(false);
  const [newSettlementName, setNewSettlementName] = useState('');
  const [atlasStatus, setAtlasStatus] = useState('Loading World Atlas…');
  const [playerFollow, setPlayerFollow] = useState(false);
  const [playerLabels, setPlayerLabels] = useState([]);
  const [showAllPlayerLabels, setShowAllPlayerLabels] = useState(false);
  const [mapContext, setMapContext] = useState(null);
  const [firstPerson, setFirstPerson] = useState(false);

  useEffect(() => {
    const syncFirstPerson = (event) => setFirstPerson(Boolean(event?.detail));
    window.addEventListener('settlement-first-person-change', syncFirstPerson);
    return () => window.removeEventListener('settlement-first-person-change', syncFirstPerson);
  }, []);

  const [locationSearch, setLocationSearch] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState(null);

  const [buildingViewMode, setBuildingViewMode] = useState('satellite');
  const [buildingEditDraft, setBuildingEditDraft] = useState(null);
  const [buildingEvents, setBuildingEvents] = useState(null);
  const [buildingDeleteTarget, setBuildingDeleteTarget] = useState(null);
  const [skipBuildingDeleteConfirmation, setSkipBuildingDeleteConfirmation] = useState(false);
  const [buildingDeleteSessionId, setBuildingDeleteSessionId] = useState(socket?.id || null);

  useEffect(() => {
    const syncBuildingDeleteSession = () => setBuildingDeleteSessionId(socket?.id || null);
    syncBuildingDeleteSession();
    socket?.on?.('connect', syncBuildingDeleteSession);
    return () => socket?.off?.('connect', syncBuildingDeleteSession);
  }, [socket]);

  useEffect(() => {
    setBuildingDeleteTarget(null);
    setSkipBuildingDeleteConfirmation(false);
  }, [buildingDeleteSessionId]);
  const bootstrappedCampaign = useRef(null);
  const settlementMapCacheRef = useRef(new Map());
  const settlementMapRequestsRef = useRef(new Map());

  const campaignId = String(headers?.campaignID || headers?.CampaignID || '');

  // The server rejects payloads above 2 MB, and most reverse proxies reject
  // even less. Long sculpt sessions dirty far more tiles than that, so dirty
  // tiles are streamed to the server in budget-sized chunks while the user
  // keeps drawing.
  const MAX_SAVE_BYTES = 1_500_000;    // stay well under the 2 MB server cap
  const SAVE_OVERHEAD_BYTES = 20_000;  // payload envelope + visual layers
  const MAX_TILES_PER_CHUNK = 60;      // server caps reference_layers at 100
  const estimateTileBytes = tile => ((tile?.values?.length || 0) * 12) + 256;

  const serializeTileForSave = tile => ({
    layer_type: 'heightmap_tile',
    tile_x: tile.tile_x,
    tile_z: tile.tile_z,
    grid_width: tile.grid_width,
    grid_height: tile.grid_height,
    width_feet: tile.width_feet,
    height_feet: tile.height_feet,
    origin_x: tile.origin_x,
    origin_y: tile.origin_y,
    min_elevation_feet: tile.min_elevation_feet,
    max_elevation_feet: tile.max_elevation_feet,
    generated: !!tile.generated,
    values: Array.from(tile.values, value => Math.round(value * 100) / 100),
  });

  // Sends the biggest batch of dirty tiles that fits one payload. Returns the
  // number of tiles committed so callers can drain the rest.
  const flushChunkNow = useCallback(async () => {
    if (!designLoaded || !campaignId || !activeSettlementId) return 0;
    const dirtyKeys = dirtyTileKeysRef.current;
    if (!tileStoreRef.current || dirtyKeys.size === 0) return 0;

    const budget = MAX_SAVE_BYTES - SAVE_OVERHEAD_BYTES;
    const chunkKeys = [];
    let bytes = 0;
    for (const key of dirtyKeys) {
      const tile = tileStoreRef.current.get(key);
      if (!tile) { dirtyKeys.delete(key); continue; } // orphaned key
      const size = estimateTileBytes(tile);
      if (chunkKeys.length > 0 && (bytes + size > budget || chunkKeys.length >= MAX_TILES_PER_CHUNK)) break;
      chunkKeys.push(key);
      bytes += size;
    }
    if (!chunkKeys.length) return 0;

    try {
      await axios.put(`/api/settlement-map/${campaignId}`, {
        settlement_id: activeSettlementId,
        // Partial payload: the backend only applies fields it receives, so
        // omitting roads/buildings/etc. here cannot wipe them.
        reference_layers: [
          ...visibleLayersOnly(referenceLayersRef.current),
          ...chunkKeys.map(key => serializeTileForSave(tileStoreRef.current.get(key))),
        ],
      }, { headers });
      chunkKeys.forEach(key => dirtyKeys.delete(key)); // committed
      return chunkKeys.length;
    } catch (error) {
      console.error('Unable to flush terrain chunk:', error);
      return 0; // keys stay dirty; the next flush or full save retries
    }
  }, [campaignId, activeSettlementId, designLoaded, headers]);

  const flushDirtyTilesChunk = useCallback(
    () => runSerializedSave(() => flushChunkNow()),
    [runSerializedSave, flushChunkNow]
  );

  const handleTilesDirtied = useCallback((keys) => {
    if (!keys || !keys.size) return;
    keys.forEach(key => dirtyTileKeysRef.current.add(key));
    setTileStoreVersion(v => v + 1);

    // Once the dirty set outweighs one payload, start streaming chunks
    // immediately instead of waiting for the debounced full save — that wait
    // is exactly what let long sculpt sessions trip the 413 cap.
    let pendingBytes = SAVE_OVERHEAD_BYTES;
    dirtyTileKeysRef.current.forEach(key => {
      const tile = tileStoreRef.current.get(key);
      if (tile) pendingBytes += estimateTileBytes(tile);
    });
    if (pendingBytes > MAX_SAVE_BYTES) flushDirtyTilesChunk();
  }, [flushDirtyTilesChunk]);


  const visibleLayersOnly = layers => (layers || []).filter(
    layer => layer.layer_type !== 'heightmap_tile' && layer.layer_type !== 'heightmap'
  );

  const uploadAtlasImage = async event => { event.preventDefault(); if (!atlasUpload.file) return; const formElement = event.currentTarget; const form = new FormData(); form.append('file', atlasUpload.file); form.append('name', atlas.atlas?.name || 'Campaign World'); form.append('attribution', atlasUpload.attribution); form.append('setting_default', 'false'); setAtlasStatus('Uploading atlas to PostgreSQL…'); try { const response = await axios.post(`/api/world-atlas/${campaignId}/image`, form, { headers }); setAtlas(value => ({ ...value, atlas: response.data })); setAtlasUpload({ file: null, attribution: '', settingDefault: false }); setAtlasStatus('Atlas image stored privately in the campaign database.'); formElement.reset(); } catch (error) { setAtlasStatus(error.response?.data?.message || 'Unable to upload atlas image.'); } };

  const sendPlayerCommand = useCallback((action, payload = {}) => { if (!socket || !campaignId || !activeSettlementId) return; socket.emit('settlement_player_command', { campaign_id: Number(campaignId), settlement_id: Number(activeSettlementId), action, ...payload }); }, [socket, campaignId, activeSettlementId]);

  const openPlayerView = () => {
    const labels = playerLabels.join(','), params = new URLSearchParams({ campaignID: String(campaignId || ''), settlementID: String(activeSettlementId || ''), campaignName: headers?.campaignName || '', accountType: 'DM' });
    if (labels) params.set('labels', labels); if (showAllPlayerLabels) params.set('showAllLabels', '1');
    window.open(`/maps/player?${params.toString()}`, 'kachhapa-settlement-player', 'noopener');
  };
  const centerPlayerOn = point => { if (point) sendPlayerCommand('focus', { point }); setMapContext(null); };

  const setBuildingLabel = (building, visible) => { const id = String(building.id); setPlayerLabels(values => visible ? [...new Set([...values, id])] : values.filter(value => value !== id)); sendPlayerCommand('label', { building_id: id, visible }); setMapContext(null); };
  useEffect(() => { setPlayerLabels([]); setShowAllPlayerLabels(false); setMapContext(null); setSelectedLocationId(null); setLocationSearch(''); }, [activeSettlementId]);

  const applyMap = useCallback((map) => {
    const allLayers = map.reference_layers || [];
    const mapHeightMap = allLayers.find(layer => layer.layer_type === 'heightmap') || null;
    const visualLayers = allLayers
      .filter(layer => layer.layer_type !== 'heightmap' && layer.layer_type !== 'heightmap_tile')
      .map(layer => ({
        ...layer,
        visible: layer.visible !== false,
        opacity: Number.isFinite(Number(layer.opacity)) ? Number(layer.opacity) : .7,
        project_to_terrain: layer.project_to_terrain !== false
    }));

    const store = tileStoreRef.current;
    store.clear();
    dirtyTileKeysRef.current.clear();
    terrainTileCoverageRef.current.clear();
    terrainTileFetchControllerRef.current?.abort();
    setStoreDefaults(store, { seaLevelFeet: Number(map.environment?.sea_level_feet) || 0 });
    if (mapHeightMap) seedStoreFromHeightMap(store, mapHeightMap);
    hydrateTiles(store, map.reference_layers || []);
    setTileStoreVersion(v => v + 1);

    setBuildings(map.buildings || []);
    setRoads(map.roads || []);
    setWaterBodies(map.water_bodies || []);
    setMapEnvironment(map.environment || {
      sea_level_feet: 0,
      terrain_material: { snow_line_feet: 900, snow_blend_feet: 500, cliff_normal_threshold: .86 },
      regions: []
    });

    // MIGRATION LOGIC & FLOAT32ARRAY PARSING
    if (map.terrain_strokes && map.terrain_strokes.length > 0 && !mapHeightMap) {
      // Legacy strokes → bake directly into the tile store
      if (tileStoreRef.current) {
        const touched = bakeStrokesIntoTiles(tileStoreRef.current, map.terrain_strokes);
        touched.forEach(key => dirtyTileKeysRef.current.add(key));
      }
      // Do NOT setHeightMap — we're fully tile-based now
      // Clear the legacy strokes so they don't re-migrate
      setTerrainStrokes([]);
    } else if (mapHeightMap) {
      // 2. Modern Data: Ensure the values are a Float32Array for performance
      if (mapHeightMap.values && !(mapHeightMap.values instanceof Float32Array)) {
        mapHeightMap.values = new Float32Array(mapHeightMap.values);
      }
      setHeightMap(mapHeightMap);
    } else {
      setHeightMap(null);
    }

    setReferenceLayers(visualLayers);
    setSelectedReferenceId(visualLayers[0]?.id || null);
    if (visualLayers.length) setFitRequest(value => value + 1);

    setAssets(map.asset_catalog?.length ? map.asset_catalog : FALLBACK_ASSET_CATALOG);
    setSelected(map.buildings?.[0] || null);
    setActiveSettlementId(map.settlement_id);
    setSettlementName(map.name || 'New Settlement');

    setDesignLoaded(true);
    setSaveStatus('Saved');
    setAtmosphereSettings(map.environment?.atmosphere || { sunIntensity: 2.2, moonIntensity: 0.15, scatteringScale: 1.0 });
    setWeatherSettings(map.environment?.weather || { activeWeather: 'clear', fogDensity: 0.01, fogColor: '#a9c9dc' });
  }, []);


  const fetchSettlementMap = useCallback((settlementId) => {
    const id = Number(settlementId);
    if (settlementMapCacheRef.current.has(id)) return Promise.resolve(settlementMapCacheRef.current.get(id));
    if (settlementMapRequestsRef.current.has(id)) return settlementMapRequestsRef.current.get(id);
    const request = axios.get(`/api/settlement-map/${campaignId}?settlement_id=${id}`, { headers })
      .then(response => { settlementMapCacheRef.current.set(id, response.data); return response.data; })
      .finally(() => settlementMapRequestsRef.current.delete(id));
    settlementMapRequestsRef.current.set(id, request);
    return request;
  }, [campaignId, headers]);

  const prefetchSettlement = useCallback((settlementId) => {
    if (!campaignId || !settlementId) return;
    loadSettlementMapEditor();
    fetchSettlementMap(settlementId).catch(error => console.error('Unable to prefetch settlement map:', error));
  }, [campaignId, fetchSettlementMap]);

  const openSettlement = useCallback(async (settlementId, options = {}) => {
    if (!campaignId || !settlementId) return;
    const location = atlas.locations.find(item => item.id === Number(settlementId));
    const startedAt = performance.now();
    mapLoadStartedAtRef.current = startedAt;
    const fromAtlasZoom = options.fromAtlasZoom === true;
    const beginSceneLoad = () => {
      setActiveTool('inspect'); setActiveSettlementId(Number(settlementId)); setDesignLoaded(false); setMapLoading(true); setSaveStatus('Loading map…'); setSelected(null);
    };
    // Cross the Atlas threshold immediately. Prefetching normally makes the
    // data available already, but a slow request must not leave the user stuck
    // at 1000% zoom with no visible transition.
    beginSceneLoad();
    if (fromAtlasZoom) setAtlasStatus(`Preparing ${location?.name || 'settlement'} terrain…`);
    if (location?.name) setSettlementName(location.name);
    try {
      const map = await fetchSettlementMap(settlementId);
      settlementMapCacheRef.current.delete(Number(settlementId));
      applyMap(map);
    } catch (error) {
      console.error('Unable to load settlement map:', error);
      setSaveStatus(error.response?.data?.message || 'Map load failed');
    } finally {
      setMapLoading(false);
    }
  }, [campaignId, applyMap, atlas.locations, fetchSettlementMap]);

  const handleSceneReady = useCallback(() => {
    const completedMs = Math.max(0, performance.now() - mapLoadStartedAtRef.current);
    setSaveStatus(`Map loaded in ${(completedMs / 1000).toFixed(1)}s`);
  }, []);

  const applySimulation = useCallback((state) => { setSimulation(state); if (state?.time?.day) setDay(state.time.day); }, []);

  const advanceTime = useCallback(async (minutes) => {
    if (!campaignId) return;

    await axios.post(`/api/calendar/${campaignId}/date/advance`, { minutes }, { headers });
    const response = await axios.get(`/api/settlement-simulation/${campaignId}`, { headers });
    applySimulation(response.data);

    if (response.data?.time) {
      setLocalViewCommand(currentCommand => {
        // Safe check using our established local view state configuration
        const activeMode = currentCommand?.mode || 'camera';

        const nextCommand = {
          mode: activeMode,
          nonce: Date.now(),
          time: {
            year: response.data.time.year,
            month_index: response.data.time.month_index,
            day: response.data.time.day,
            hour: response.data.time.hour,
            minute: response.data.time.minute
          }
        };

        window.dispatchEvent(new CustomEvent('settlement-camera-command-trigger', {
          detail: nextCommand
        }));

        return nextCommand;
      });
    }
  }, [campaignId, headers, applySimulation]);


  useEffect(() => {
    if (!campaignId) return undefined;
    let active = true;
    setAtlasStatus('Loading World Atlas…');
    axios.get(`/api/world-atlas/${campaignId}`, { headers }).then((atlasResponse) => {
      if (!active) return;
      setAtlas(atlasResponse.data);
      setAtlasStatus('Select a settlement to load its 3D environment.');
    }).catch((error) => {
      console.error('Unable to load World Atlas:', error);
      if (active) setAtlasStatus(error.response?.data?.message || 'World Atlas failed to load');
    });
    return () => { active = false; };
  }, [campaignId, headers]);

  useEffect(() => {
    if (!campaignId || !activeSettlementId || bootstrappedCampaign.current === Number(campaignId)) return undefined;
    bootstrappedCampaign.current = Number(campaignId);
    let active = true, started = false;
    const bootstrap = () => {
      started = true; axios.post(`/api/settlement-simulation/${campaignId}/bootstrap`, {}, { headers }).then(async ({ data }) => {
        if (active) applySimulation(data);
        const [contextResult, economyResult] = await Promise.allSettled([
          axios.get(`/api/travel/${campaignId}/context`, { headers }),
          axios.get(`/api/economy/${campaignId}`, { headers }),
        ]);
        if (!active) return;
        if (contextResult.status === 'fulfilled') setTravelContext(contextResult.value.data);
        else console.error('Unable to load settlement travel context:', contextResult.reason);
        if (economyResult.status === 'fulfilled') {
          setEconomy(economyResult.value.data);
          setSelectedBusinessId(value => value || economyResult.value.data.businesses?.[0]?.id);
        } else console.error('Unable to load settlement economy:', economyResult.reason);
      }).catch((error) => {
        bootstrappedCampaign.current = null;
        console.error('Unable to bootstrap settlement simulation:', error);
      });
    };
    const idleId = window.requestIdleCallback?.(bootstrap, { timeout: 1600 });
    const timeoutId = idleId == null ? window.setTimeout(bootstrap, 500) : null;
    return () => { active = false; if (!started) bootstrappedCampaign.current = null; if (idleId != null) window.cancelIdleCallback?.(idleId); if (timeoutId != null) window.clearTimeout(timeoutId); };
  }, [campaignId, activeSettlementId, headers, applySimulation]);

  useEffect(() => {
    if (!socket) return undefined;
    const update = (state) => { if (!campaignId || state.campaign_id === Number(campaignId)) applySimulation(state); };
    socket.on('settlement_simulation_updated', update);
    return () => socket.off('settlement_simulation_updated', update);
  }, [socket, campaignId, applySimulation]);

  useEffect(() => {
    if (!socket) return undefined;
    const updateParty = (position) => setTravelContext((value) => ({ ...value, party_position: position }));
    socket.on('party_position_updated', updateParty);
    return () => socket.off('party_position_updated', updateParty);
  }, [socket]);

  useEffect(() => {
    if (!socket) return undefined;
    const updateAtlas = (event) => {
      const location = event?.settlement; if (!location || location.campaign_id !== Number(campaignId)) return;
      setAtlas(value => ({ ...value, locations: event.action === 'deleted' ? value.locations.filter(item => item.id !== location.id) : [...value.locations.filter(item => item.id !== location.id), location] }));
    };
    socket.on('world_atlas_updated', updateAtlas);
    return () => socket.off('world_atlas_updated', updateAtlas);
  }, [socket, campaignId]);

  useEffect(() => {
    setReferenceLayers(layers => {
      let changed = false; const nextLayers = layers.map(layer => {
        if (!layer.sync_exterior || !layer.linked_building_id) return layer;
        const building = buildings.find(item => item.id === layer.linked_building_id);
        if (!building) return layer;
        const next = { ...layer, origin_x: building.x, origin_y: building.y, width_feet: building.width_feet, height_feet: building.depth_feet, feet_per_pixel_x: building.width_feet / Math.max(1, Number(layer.pixel_width) || 1), feet_per_pixel_y: building.depth_feet / Math.max(1, Number(layer.pixel_height) || 1), rotation_degrees: (building.rotation || 0) * 180 / Math.PI };
        if (next.origin_x === layer.origin_x && next.origin_y === layer.origin_y && next.width_feet === layer.width_feet && next.height_feet === layer.height_feet && next.rotation_degrees === layer.rotation_degrees) return layer;
        changed = true; return next;
      }); return changed ? nextLayers : layers;
    });
  }, [buildings]);

  useEffect(() => {
    const handleRelativeTime = async (e) => {
      try {
        const minutesToShift = Number(e.detail.minutes) || 0;
        await advanceTime(minutesToShift);
      } catch (err) {
        console.error('Failed to update calendar relative bounds:', err);
      }
    };

    const handleAbsoluteTime = async (e) => {
      try {
        if (!campaignId) return;
        const { hour, minute, day, year, month_index } = e.detail;

        await axios.patch(`/api/calendar/${campaignId}/date/set`, { hour, minute, day, year, month_index }, { headers });
        const response = await axios.get(`/api/settlement-simulation/${campaignId}`, { headers });
        applySimulation(response.data);

        setLocalViewCommand(currentCommand => {
          const activeMode = currentCommand?.mode || 'camera';

          const nextCommand = {
            mode: activeMode,
            nonce: Date.now(),
            time: { hour, minute, day, year, month_index }
          };

          window.dispatchEvent(new CustomEvent('settlement-camera-command-trigger', {
            detail: nextCommand
          }));

          return nextCommand;
        });
      } catch (err) {
        console.error('Failed to save manual target calendar parameters:', err);
      }
    };


    window.addEventListener('settlement-time-advance-request', handleRelativeTime);
    window.addEventListener('settlement-time-absolute-request', handleAbsoluteTime);
    return () => {
      window.removeEventListener('settlement-time-advance-request', handleRelativeTime);
      window.removeEventListener('settlement-time-absolute-request', handleAbsoluteTime);
    };
  }, [campaignId, headers, advanceTime, applySimulation]);

  useEffect(() => {
    if (!socket) return undefined;
    const updateEconomy = (state) => setEconomy(state);
    socket.on('settlement_economy_updated', updateEconomy);
    return () => socket.off('settlement_economy_updated', updateEconomy);
  }, [socket]);

  useEffect(() => {
    if (!running || !campaignId) return undefined;
    const timer = window.setInterval(() => advanceTime(10 * speed).catch(console.error), 2600);
    return () => window.clearInterval(timer);
  }, [running, speed, campaignId, advanceTime]);

  useEffect(() => {
    if (!campaignId || activeTool !== 'time') return;
    axios.get(`/api/calendar/${campaignId}`, { headers })
      .then(response => {
        if (response.data && response.data.id) {
          setActiveCalendar(response.data);
          // Prefill our manual editing cache fields with true engine values
          const cur = response.data.current_date || {};
          setManualDate({
            year: cur.year ?? 1492,
            month_index: cur.month_index ?? 0,
            day: cur.day ?? 1,
            hour: cur.hour ?? 12,
            minute: cur.minute ?? 0
          });
        }
      })
      .catch(err => console.error("Failed to synchronize active calendar template schema:", err));
  }, [campaignId, activeTool, simulation.time, headers]);


  const route = simulation.routes?.[0];
  const lamps = route?.lamps || [];

  const calculateTravel = async (nextDestination = destination) => {
    if (!campaignId || !nextDestination) return;
    const payload = nextDestination.id ? { poi_id: nextDestination.id, party_size: partySize } : { destination: nextDestination, party_size: partySize };
    const response = await axios.post(`/api/travel/${campaignId}/calculate`, payload, { headers });
    setTravelPlan(response.data);
  };

  const chooseDestination = useCallback((next) => {
    setDestination(next);
    setTravelPlan(null);
  }, []);

  const setPartyHere = async () => {
    if (!destination) return;
    const response = await axios.patch(`/api/travel/${campaignId}/party-position`, destination, { headers });
    setTravelContext((value) => ({ ...value, party_position: response.data }));
    setDestination(null); setTravelPlan(null);
  };

  const selectedReference = referenceLayers.find(layer => layer.id === selectedReferenceId) || referenceLayers[0];

  const updateReference = (id, updater) => setReferenceLayers(values => values.map(layer => layer.id === id ? updater(layer) : layer));

  const recordCalibrationPoint = useCallback((point) => {
    setCalibrationPoints(values => [...(values.length >= 2 ? [] : values), { x: Math.round(point.x), y: Math.round(point.y) }]);
  }, []);

  // 2. Wrap the onWaypoint inline function
  const handleWaypoint = useCallback((point) => {
    chooseDestination({
      ...point,
      map_key: atlas.locations.find(location => location.id === activeSettlementId)?.map_key || 'settlement',
      name: 'Map waypoint',
      road_access: true,
      water_access: point.x > 500
    });
  }, [chooseDestination, atlas.locations, activeSettlementId]);

  const scheduleTerrainTileFetch = useCallback((camera) => {
    const bounds = camera?.terrainBounds;
    if (!designLoaded || !campaignId || !activeSettlementId || !bounds) return;
    if (terrainTileFetchTimerRef.current !== null) window.clearTimeout(terrainTileFetchTimerRef.current);
    terrainTileFetchTimerRef.current = window.setTimeout(async () => {
      terrainTileFetchTimerRef.current = null;
      let minX = Math.floor(bounds.minX / TILE_FEET);
      let maxX = Math.floor(bounds.maxX / TILE_FEET);
      let minZ = Math.floor(bounds.minY / TILE_FEET);
      let maxZ = Math.floor(bounds.maxY / TILE_FEET);
      // Keep one request bounded even when the camera is looking at the horizon.
      if ((maxX - minX + 1) * (maxZ - minZ + 1) > 1024) {
        const centerX = Math.floor(((camera.target?.[0] || 0) * FEET_PER_SCENE_UNIT) / TILE_FEET);
        const centerZ = Math.floor(((camera.target?.[2] || 0) * FEET_PER_SCENE_UNIT) / TILE_FEET);
        minX = centerX - 15; maxX = centerX + 16;
        minZ = centerZ - 15; maxZ = centerZ + 16;
      }
      const renderCellFeet = Math.max(1, Number(camera.window?.cellFeet) || 16);
      // Editing always requests the native 16-ft samples before a brush can
      // overwrite the tile. Overview modes may use compact LOD responses.
      const requestedCellFeet = activeTool === 'terrain' ? 16 : renderCellFeet;
      const requestedGrid = Math.min(257, Math.max(2, Math.ceil(TILE_FEET / requestedCellFeet) + 1));
      let needsFetch = false;
      for (let z = minZ; z <= maxZ && !needsFetch; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          if ((terrainTileCoverageRef.current.get(tileKey(x, z)) || 0) < requestedGrid) {
            needsFetch = true;
            break;
          }
        }
      }
      if (!needsFetch) return;

      terrainTileFetchControllerRef.current?.abort();
      const controller = new AbortController();
      terrainTileFetchControllerRef.current = controller;
      try {
        const response = await axios.get(`/api/settlement-map/${campaignId}/terrain-tiles`, {
          headers,
          signal: controller.signal,
          params: { settlement_id: activeSettlementId, min_x: minX, max_x: maxX,
            min_z: minZ, max_z: maxZ, cell_feet: requestedCellFeet },
        });
        if (controller.signal.aborted) return;
        for (let z = minZ; z <= maxZ; z += 1) {
          for (let x = minX; x <= maxX; x += 1) {
            terrainTileCoverageRef.current.set(tileKey(x, z), requestedGrid);
          }
        }
        const safeTiles = (response.data.tiles || []).filter(
          tile => !dirtyTileKeysRef.current.has(tileKey(Number(tile.tile_x), Number(tile.tile_z)))
        );
        if (safeTiles.length) {
          hydrateTiles(tileStoreRef.current, safeTiles);
          setTileStoreVersion(value => value + 1);
        }
      } catch (error) {
        if (!controller.signal.aborted) console.error('Unable to stream terrain tiles:', error);
      }
    }, 120);
  }, [activeSettlementId, activeTool, campaignId, designLoaded, headers]);

  useEffect(() => () => {
    if (terrainTileFetchTimerRef.current !== null) window.clearTimeout(terrainTileFetchTimerRef.current);
    terrainTileFetchControllerRef.current?.abort();
  }, []);

  // 3. Wrap the conditional onCameraChange inline function
  const handleCameraChange = useCallback((camera) => {
    referenceCameraRef.current = camera;
    scheduleTerrainTileFetch(camera);
    if (playerFollow) {
      sendPlayerCommand('camera', { camera });
    }
  }, [playerFollow, scheduleTerrainTileFetch, sendPlayerCommand]);

  const applyReferenceCalibration = () => {
    if (!selectedReference || calibrationPoints.length !== 2) return;
    updateReference(selectedReference.id, layer => calibrateReferenceLayer(layer, calibrationPoints[0], calibrationPoints[1], knownDistance));
    setCalibrationPoints([]); setFitRequest(value => value + 1);
  };

  const applyReferencePlacement = async (placement, file) => {
    if (!file) {
      setReferenceLayers(values => values.map(layer => layer.id === placement.id ? placement : layer));
      referenceLayersRef.current = referenceLayersRef.current.map(layer => layer.id === placement.id ? placement : layer);
      return placement;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('settlement_id', activeSettlementId);
    ['name', 'width_feet', 'height_feet', 'origin_x', 'origin_y', 'rotation_degrees', 'opacity', 'scope'].forEach(key => form.append(key, placement[key]));
    const response = await runSerializedSave(async () => {
      try {
        const result = await axios.post(`/api/settlement-map/${campaignId}/reference-layers`, form, { headers });
        const layer = result.data.layer;
        referenceLayersRef.current = [...referenceLayersRef.current.filter(value => value.id !== layer.id), layer];
        setReferenceLayers(referenceLayersRef.current);
        setSelectedReferenceId(layer.id);
        return result;
      } catch (error) { return { error }; }
    });
    if (response.error) throw response.error;
    return response.data.layer;
  };

  const uploadFloorImage = async (file, level) => {
    const optimized = await optimizeReferenceImage(file);
    const form = new FormData();
    form.append('file', optimized.file);
    form.append('settlement_id', activeSettlementId);
    form.append('scope', 'building');
    form.append('linked_building_id', selectedBuilding.id);
    form.append('floor_level_id', level.id);
    form.append('name', `${selectedBuilding.name} · ${level.name}`);
    const response = await axios.post(`/api/settlement-map/${campaignId}/reference-layers`, form, { headers });
    const layer = response.data.layer;
    setReferenceLayers(values => [...values.filter(l => l.id !== layer.id), layer]);
    const xs = level.corners.map(p => p.x), ys = level.corners.map(p => p.y);
    const width = Math.max(10, Math.max(...xs) - Math.min(...xs));
    return { image_url: layer.image_url, image_asset_id: layer.image_asset_id,
      x: (Math.min(...xs) + Math.max(...xs)) / 2 || 0, y: (Math.min(...ys) + Math.max(...ys)) / 2 || 0,
      width_feet: width, height_feet: width * (layer.pixel_height / Math.max(1, layer.pixel_width)), rotation: 0, opacity: 0.6, visible: true };
  };

  const formatDuration = (minutes) => minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;

  const formatCost = (cp) => { const sign = cp < 0 ? '-' : ''; const value = Math.abs(cp); return value >= 100 ? `${sign}${(value / 100).toFixed(1)} gp` : value >= 10 ? `${sign}${(value / 10).toFixed(1)} sp` : `${sign}${value} cp`; };

  const runEconomy = async (days) => { const response = await axios.post(`/api/economy/${campaignId}/simulate`, { days }, { headers }); setEconomy(response.data); };

  // eslint-disable-next-line no-unused-vars -- implemented action awaiting a UI control; see BABYLON_FOLLOW_UPS.md
  const rebalanceWorkforce = async () => { const response = await axios.post(`/api/economy/${campaignId}/workforce/rebalance`, {}, { headers }); setEconomy(response.data.dashboard); };

  const disruptMarket = async (key) => { const response = await axios.post(`/api/economy/${campaignId}/commodities/${key}/purchase`, { quantity: commodityQuantity }, { headers }); setEconomy(response.data.dashboard); };

  const updateAtlasLocation = (next) => setAtlas(value => ({ ...value, locations: value.locations.map(location => location.id === next.id ? next : location) }));

  const renameSettlement = async () => {
    const name = settlementName.trim(); if (!name || !activeSettlementId) return;
    try { const response = await axios.patch(`/api/world-atlas/${campaignId}/settlements/${activeSettlementId}`, { name }, { headers }); updateAtlasLocation(response.data); setSettlementName(response.data.name); }
    catch (error) { setAtlasStatus(error.response?.data?.message || 'Unable to rename settlement'); }
  };

  const createSettlement = async (event) => {
    event.preventDefault(); setAtlasStatus('Creating…');
    try { const response = await axios.post(`/api/world-atlas/${campaignId}/settlements`, { name: newSettlementName.trim() || 'New Settlement' }, { headers }); setAtlas(value => ({ ...value, locations: [...value.locations, response.data] })); setNewSettlementName(''); await openSettlement(response.data.id); setActiveTool('atlas'); setAtlasStatus(`${response.data.name} created. Click the overworld map to place it.`); }
    catch (error) { setAtlasStatus(error.response?.data?.message || 'Unable to create settlement'); }
  };

  const placeSettlement = async (id, x, y) => {
    const prior = atlas.locations.find(location => location.id === id);
    // Dragging feels immediate; the network request only confirms or rolls
    // back the marker rather than holding its visual position hostage.
    if (prior) updateAtlasLocation({ ...prior, atlas_x: x, atlas_y: y });
    setAtlasStatus(`Positioning ${prior?.name || 'settlement'}…`);
    try { const response = await axios.patch(`/api/world-atlas/${campaignId}/settlements/${id}`, { atlas_x: x, atlas_y: y }, { headers }); updateAtlasLocation(response.data); setAtlasStatus(`${response.data.name} placed on the atlas.`); }
    catch (error) { if (prior) updateAtlasLocation(prior); setAtlasStatus(error.response?.data?.message || 'Unable to place settlement'); }
  };

  const beginAtlasMove = location => {
    setMovingAtlasId(location.id);
    setPendingAtlasMove({ id: location.id, atlas_x: location.atlas_x, atlas_y: location.atlas_y });
    setSelectedAtlasId(location.id);
    setAtlasStatus(location.atlas_x == null
      ? `Click the atlas to place ${location.name}, then choose Apply.`
      : `Drag ${location.name}'s pin tip, then choose Apply.`);
  };

  const applyAtlasMove = async location => {
    if (!pendingAtlasMove || pendingAtlasMove.id !== location.id || pendingAtlasMove.atlas_x == null || pendingAtlasMove.atlas_y == null) return;
    await placeSettlement(location.id, pendingAtlasMove.atlas_x, pendingAtlasMove.atlas_y);
    setMovingAtlasId(null);
    setPendingAtlasMove(null);
  };

  const setSettlementStatus = async (location, status) => {
    try { const response = await axios.patch(`/api/world-atlas/${campaignId}/settlements/${location.id}`, { status }, { headers }); updateAtlasLocation(response.data); setAtlasStatus(status === 'destroyed' ? `${location.name} remains on the atlas as a destroyed settlement.` : `${location.name} restored.`); }
    catch (error) { setAtlasStatus(error.response?.data?.message || 'Unable to update settlement status'); }
  };

  const removeSettlementMarker = async (location) => {
    try { const response = await axios.patch(`/api/world-atlas/${campaignId}/settlements/${location.id}`, { atlas_x: null, atlas_y: null }, { headers }); updateAtlasLocation(response.data); setAtlasStatus(`${location.name} removed from the overworld map.`); }
    catch (error) { setAtlasStatus(error.response?.data?.message || 'Unable to remove settlement marker'); }
  };

  const deleteSettlement = async (location) => {
    if (!window.confirm(`Permanently delete ${location.name}? This is intended for mistakes. If it was destroyed in the story, cancel and use “Mark destroyed” instead.`)) return;
    try { const response = await axios.delete(`/api/world-atlas/${campaignId}/settlements/${location.id}?reason=mistake`, { headers }); setAtlas(value => { const remaining = value.locations.filter(item => item.id !== location.id); return { ...value, locations: remaining.length ? remaining : [response.data.active_settlement] }; }); if (location.id === activeSettlementId) await openSettlement(response.data.active_settlement.id); setAtlasStatus(`${location.name} deleted.`); }
    catch (error) { setAtlasStatus(error.response?.data?.message || 'Unable to delete settlement'); }
  };


  const selectedBusiness = economy.businesses.find(business => business.id === Number(selectedBusinessId));

  const selectedHistory = economy.history?.[String(selectedBusinessId)] || [];

  const tenday = selectedHistory.slice(-10).reduce((totals, row) => ({ revenue: totals.revenue + row.revenue_cp, profit: totals.profit + row.profit_cp }), { revenue: 0, profit: 0 });

  const selectedBuilding = buildings.find(building => building.id === selected?.id) || selected;
  const selectedAsset = assets.find(asset => asset.key === selectedBuilding?.asset_key);
  const selectedRoad = roads.find(road => road.id === selectedBuilding?.front_road_id);

  const deleteBuildingById = useCallback((buildingId) => {
    if (buildingId == null) return;
    setBuildings(values => values.filter(building => building.id !== buildingId));
    setSelected(current => current?.id === buildingId ? null : current);
  }, []);

  const buildingDeletePreferenceKey = buildingDeleteSessionId
    ? `kachhapa:skip-building-delete-confirmation:${buildingDeleteSessionId}`
    : null;

  const requestDeleteSelectedBuilding = useCallback(() => {
    if (!selectedBuilding) return;
    let skipConfirmation = false;
    if (buildingDeletePreferenceKey) {
      try { skipConfirmation = window.sessionStorage.getItem(buildingDeletePreferenceKey) === 'true'; }
      catch { /* Browser storage may be unavailable; keep the safe confirmation. */ }
    }
    if (skipConfirmation) {
      deleteBuildingById(selectedBuilding.id);
      return;
    }
    setSkipBuildingDeleteConfirmation(false);
    setBuildingDeleteTarget(selectedBuilding);
  }, [buildingDeletePreferenceKey, deleteBuildingById, selectedBuilding]);

  const closeBuildingDeleteDialog = useCallback(() => {
    setBuildingDeleteTarget(null);
    setSkipBuildingDeleteConfirmation(false);
  }, []);

  const confirmBuildingDeletion = useCallback(() => {
    if (!buildingDeleteTarget) return;
    if (skipBuildingDeleteConfirmation && buildingDeletePreferenceKey) {
      try { window.sessionStorage.setItem(buildingDeletePreferenceKey, 'true'); }
      catch { /* The deletion can still proceed without remembering the preference. */ }
    }
    deleteBuildingById(buildingDeleteTarget.id);
    closeBuildingDeleteDialog();
  }, [buildingDeletePreferenceKey, buildingDeleteTarget, closeBuildingDeleteDialog, deleteBuildingById, skipBuildingDeleteConfirmation]);

  useEffect(() => {
    if (activeTool !== 'build' || buildMode !== 'select-placed' || !selectedBuilding || buildingDeleteTarget) return undefined;
    const handleBuildingDeleteShortcut = event => {
      if (event.key !== 'Backspace' || event.defaultPrevented) return;
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      if (target?.isContentEditable || target?.closest?.('[contenteditable="true"]') || ['input', 'textarea', 'select'].includes(tagName)) return;
      event.preventDefault();
      requestDeleteSelectedBuilding();
    };
    window.addEventListener('keydown', handleBuildingDeleteShortcut);
    return () => window.removeEventListener('keydown', handleBuildingDeleteShortcut);
  }, [activeTool, buildMode, buildingDeleteTarget, requestDeleteSelectedBuilding, selectedBuilding]);

  const updateSelectedBuilding = (updater) => {
    if (!selectedBuilding) return;
    setBuildings(values => values.map(building => building.id === selectedBuilding.id ? updater(building) : building));
  };

  // eslint-disable-next-line no-unused-vars -- implemented dialog awaiting a UI launch control; see BABYLON_FOLLOW_UPS.md
  const openBuildingEditor = () => {
    if (selectedBuilding) setBuildingEditDraft(
      { ...selectedBuilding, factions: Array.isArray(selectedBuilding.factions) ? selectedBuilding.factions.join(', ') : (selectedBuilding.factions || ''), tags: Array.isArray(selectedBuilding.tags) ? selectedBuilding.tags.join(', ') : (selectedBuilding.tags || '') }
    );
  };

  const saveBuildingEditor = () => {
    if (!buildingEditDraft) return;
    const asset = assets.find(item => item.key === buildingEditDraft.asset_key);
    updateSelectedBuilding(building => ({ ...building, ...buildingEditDraft, factions: String(buildingEditDraft.factions || '').split(',').map(value => value.trim()).filter(Boolean), tags: String(buildingEditDraft.tags || '').split(',').map(value => value.trim()).filter(Boolean), rooms: asset?.rooms || building.rooms }));
    setBuildingEditDraft(null);
  };

  // eslint-disable-next-line no-unused-vars -- implemented action awaiting a UI control; see BABYLON_FOLLOW_UPS.md
  const rerollSelectedBuilding = () => { if (!selectedBuilding || !assets.length) return; const choices = assets.filter(asset => asset.key !== selectedBuilding.asset_key), asset = choices[Math.floor(Math.random() * choices.length)] || assets[0]; updateSelectedBuilding(building => ({ ...building, name: asset.name, asset_key: asset.key, building_type: asset.category, width_feet: asset.width_feet, depth_feet: asset.depth_feet, rooms: [...asset.rooms] })); };

  // eslint-disable-next-line no-unused-vars -- implemented dialog awaiting a UI launch control; see BABYLON_FOLLOW_UPS.md
  const openBuildingEvents = () => {
    if (!selectedBuilding) return;
    const agents = economy.workforce?.agents || [], names = (
      selectedBuilding.occupants || selectedBuilding.present_npcs || agents.slice(0, 3).map(agent => agent.name)).filter(Boolean),
      worker = names[0] || selectedBuilding.owner_name || 'a worker', visitor = names[1] || 'a familiar local', owner = selectedBuilding.owner_name || names[2] || 'the proprietor', craft = selectedBuilding.business_type || selectedBuilding.building_type || selectedAsset?.category || 'trade', rumor = selectedBuilding.rumor || `unusual activity near ${selectedRoad?.name || settlementName}`;
    setBuildingEvents([`${worker} receives an overdue delivery for ${selectedBuilding.name}.`, `${visitor}, whom ${worker} has a crush on, enters ${selectedBuilding.name}.`, `${worker} finds a customer willing to listen to an impromptu sermon.`, `A rival ${craft} practitioner challenges ${owner} to a public duel of skill.`, `The party overhears a credible rumor about ${rumor}.`]);
  };

  const startBuildingEvent = event => {
    setMapEnvironment(
      environment => (
        {
          ...environment, events: [
            event, ...(
              environment.events || []
            )].slice(0, 40)
        }
      )
    );
    setBuildingEvents(null);
  };

  const activeMapKey = atlas.locations.find(location => location.id === activeSettlementId)?.map_key || null;

  const searchableLocations = useMemo(() => settlementSearchLocations({ buildings, points: travelContext.points_of_interest, businesses: economy.businesses, assets, mapKey: activeMapKey }), [buildings, travelContext.points_of_interest, economy.businesses, assets, activeMapKey]);

  const locationResults = useMemo(() => searchSettlementLocations(searchableLocations, locationSearch), [searchableLocations, locationSearch]);

  const selectedLocation = searchableLocations.find(location => location.id === selectedLocationId) || null;

  const selectLocation = location => {
    setSelectedLocationId(location.id); if (location.kind === 'building') setSelected(location.source);
  };

  const centerDmOn = location => {
    if (location?.point) {
      window.dispatchEvent(new CustomEvent('settlement-camera-command-trigger', {
        detail: {
          mode: 'point',
          point: location.point,
          nonce: Date.now()          // forces the command to register as "new"
        }
      }));
    }
  };

  const centerPlayerOnLocation = location => {
    if (location?.point) sendPlayerCommand('focus', { point: location.point });
  };

  // *************************************************************
  // Functions to handle optimistic UI with debounced server sync
  // *************************************************************

  // Save committed map changes automatically. Live sculpt strokes are only a
  // transient preview; SettlementMapEditor bakes them into tiles on release.
  useEffect(() => {
    if (!designLoaded || !campaignId || !activeSettlementId) return undefined;
    setSaveStatus('Unsaved changes');
    const timer = window.setTimeout(() => {
      setSaveStatus('Saving…');
      // Prepare the payload. Terrain strokes are never persisted separately;
      // dirty authored tiles carry their already-baked elevation values.
      const payload = {
        settlement_id: activeSettlementId,
        terrain_strokes: [], // Clear legacy strokes to prevent DB bloat
        roads,
        buildings,
        water_bodies: waterBodies,
        environment: { ...mapEnvironment, atmosphere: atmosphereSettings, weather: weatherSettings },
        weather: weatherSettings,
        reference_layers: [...referenceLayers]
      };
      // Only send tiles dirtied since the last successful save — and only
      // as many as fit under the payload budget. The rest stream to the server
      // in follow-up chunks right after this save lands.
      const dirtyKeys = dirtyTileKeysRef.current;
      const committedChunkKeys = [];
      if (tileStoreRef.current && dirtyKeys.size > 0) {
        let budget = MAX_SAVE_BYTES - SAVE_OVERHEAD_BYTES;
        const tileLayers = [];
        for (const key of dirtyKeys) {
          const tile = tileStoreRef.current.get(key);
          if (!tile) { dirtyKeys.delete(key); continue; }
          const size = estimateTileBytes(tile);
          if (tileLayers.length > 0 && (size > budget || tileLayers.length >= MAX_TILES_PER_CHUNK)) break;
          tileLayers.push(serializeTileForSave(tile));
          committedChunkKeys.push(key);
          budget -= size;
        }
        payload.reference_layers = [...visibleLayersOnly(payload.reference_layers), ...tileLayers];
      } else {
        payload.reference_layers = visibleLayersOnly(payload.reference_layers);
      }
      // Send to server (serialized behind any in-flight chunk flush)
      runSerializedSave(async () => {
        try {
          // An upload may have completed while this save waited in the queue.
          payload.reference_layers = mergeReferenceSave(referenceLayersRef.current, payload.reference_layers);
          await axios.put(`/api/settlement-map/${campaignId}`, payload, { headers });
          setSaveStatus('Saved');
          committedChunkKeys.forEach(key => dirtyKeys.delete(key)); // committed
          // Drain any tiles that didn't fit in this payload.
          let committed = dirtyKeys.size > 0 ? await flushChunkNow() : 0;
          while (committed > 0 && dirtyTileKeysRef.current.size > 0) {
            committed = await flushChunkNow();
          }
        } catch (error) {
          console.error('Unable to save settlement map:', error);
          setSaveStatus('Save failed');
        }
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [designLoaded, referenceLayers, campaignId, activeSettlementId, headers, heightMap, roads, buildings, waterBodies, mapEnvironment, atmosphereSettings, weatherSettings, runSerializedSave, flushChunkNow, tileStoreVersion]);

  return (
    <Box className="settlement-sim" sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Clean, Fixed Material UI Global Administration Header */}
      <AppBar position="static" sx={{ backgroundColor: '#14201c', borderBottom: '1px solid #ffffff2c', boxShadow: 'none' }}>
        <Toolbar sx={{ justifyContent: 'space-between', minHeight: '64px', px: 2, gap: 2 }}>

          {/* Settlement Branding & Interactive Text Mutation Form */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton
              onClick={() => window.location.assign(mainEnvironmentUrl)}
              title="Return to Kachhapa"
              aria-label="Return to Kachhapa"
              sx={{ color: '#d8c28f', border: '1px solid #526258', borderRadius: '6px', '&:hover': { backgroundColor: '#ba8c42', color: '#18221e' } }}
            >
              <ExitToAppIcon />
            </IconButton>

            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography variant="caption" sx={{ color: '#8f9d95', fontSize: '9px', fontWeight: 700, letterSpacing: '0.04em' }}>
                SETTLEMENT SIMULATION
              </Typography>
              <TextField
                variant="standard"
                size="small"
                value={settlementName}
                onChange={event => setSettlementName(event.target.value)}
                onBlur={renameSettlement}
                onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                sx={{
                  width: '240px',
                  '& .MuiInputBase-input': { color: '#fff', fontWeight: 'bold', fontSize: '16px', py: 0.2 },
                  '& .MuiInput-underline:before': { borderBottom: 'none' },
                  '& .MuiInput-underline:hover:not(.Mui-disabled):before': { borderBottom: '1px solid #bd9149' },
                  '& .MuiInput-underline:after': { borderBottomColor: '#bd9149' }
                }}
              />
              <Typography variant="caption" sx={{ color: saveStatus === 'Save failed' ? '#f44336' : '#ffe08a', fontSize: '10px' }}>
                {saveStatus}
              </Typography>
            </Box>
          </Box>

          {/* Dynamic Simulation Clock Matrix */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '100px' }}>
            <Typography variant="body2" sx={{ color: '#d5ddd7', fontWeight: 'bold', letterSpacing: '0.05em' }}>
              {String(simulation.time?.hour ?? 12).padStart(2, '0')}:{String(simulation.time?.minute ?? 0).padStart(2, '0')}
            </Typography>
            <Typography variant="caption" sx={{ color: '#8f9d95', textTransform: 'lowercase', mt: -0.2, fontSize: '10px' }}>
              {route?.phase?.replace('_', ' ') || 'off duty'}
            </Typography>
            <Typography variant="body2" sx={{ color: '#ecd89f', fontWeight: 800, mt: 0.2 }}>
              Day {day}
            </Typography>
          </Box>

          {/* Global Control Action Overlays & Steps Timers */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<OpenInNewIcon />}
              onClick={openPlayerView}
              sx={{ backgroundColor: '#23352d', color: '#d5ddd7', textTransform: 'none', border: '1px solid #53645a', '&:hover': { backgroundColor: '#ba8c42', color: '#18221e' } }}
            >
              Player View
            </Button>

            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <FormControlLabel
                control={<Checkbox size="small" checked={playerFollow} onChange={event => setPlayerFollow(event.target.checked)} sx={{ color: '#bd9149', '&.Mui-checked': { color: '#bd9149' } }} />}
                label={<Typography variant="caption" sx={{ color: '#d5ddd7', userSelect: 'none' }}>Follow DM</Typography>}
                title="Continuously mirror this camera in Player View"
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={showAllPlayerLabels} onChange={event => { const visible = event.target.checked; setShowAllPlayerLabels(visible); sendPlayerCommand('labels_all', { visible }); }} sx={{ color: '#bd9149', '&.Mui-checked': { color: '#bd9149' } }} />}
                label={<Typography variant="caption" sx={{ color: '#d5ddd7', userSelect: 'none' }}>All Labels</Typography>}
                title="Identify every building in Player View"
              />
            </Box>

            {/* Time Advancement Button Controls Groups */}
            <ButtonGroup size="small" variant="contained" sx={{ backgroundColor: '#23352d', border: '1px solid #53645a' }}>
              <Button onClick={() => advanceTime(-60)} sx={{ color: '#d5ddd7', backgroundColor: '#23352d', minWidth: '40px' }}>-1h</Button>
              <Button onClick={() => setRunning(v => !v)} sx={{ color: '#ffe08a', backgroundColor: '#1e3a34', fontWeight: 'bold', minWidth: '40px' }}>
                {running ? 'Ⅱ' : '▶'}
              </Button>
              {[1, 2, 4].map(v => (
                <Button
                  key={v}
                  onClick={() => setSpeed(v)}
                  sx={{
                    color: speed === v ? '#7ce6ff' : '#d5ddd7',
                    backgroundColor: speed === v ? '#16322c' : '#23352d',
                    fontWeight: speed === v ? 'bold' : 'normal'
                  }}
                >
                  {v}×
                </Button>
              ))}
              <Button onClick={() => advanceTime(60)} sx={{ color: '#d5ddd7', backgroundColor: '#23352d', minWidth: '40px' }}>+1h</Button>
            </ButtonGroup>
          </Box>

        </Toolbar>
      </AppBar>

      {/* Primary Workplace Area Setup */}
      <Box className="settlement-body" sx={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Sleek Vertical Tool Selection Overlay Ribbon Panel */}
        {activeTool !== 'atlas' && (
          <Box
            className="settlement-toolbar-horizontal"
            sx={{
              position: 'absolute',
              top: '18px',
              left: '18px',
              gap: '4px',
              padding: '6px 6px',
              height: '48px',
              display: 'flex',
              flexDirection: 'row',
              // backgroundColor: '#14201cce',
              zIndex: 60,
              overflowY: 'auto'
            }}
          >
            {[
              { tool: 'atlas', icon: <PublicIcon />, title: 'Atlas' },
              { tool: 'inspect', icon: <HomeWorkIcon />, title: 'Inspect', checkLoaded: true },
              { tool: 'reference', icon: <CompareIcon />, title: 'Reference', checkLoaded: true },
              { tool: 'atmosphere', icon: <CloudIcon />, title: 'Atmosphere Configuration', checkLoaded: true },
              { tool: 'road', icon: <EditRoadIcon />, title: 'Roads', checkLoaded: true },
              { tool: 'fortification', icon: <FenceIcon />, title: 'Walls', checkLoaded: true },
              { tool: 'water', icon: <WaterIcon />, title: 'Water', checkLoaded: true },
              { tool: 'region', icon: <PolylineIcon />, title: 'Regions', checkLoaded: true },
              { tool: 'build', icon: <AddBusinessIcon />, title: 'Build', checkLoaded: true },
              { tool: 'terrain', icon: <TerrainIcon />, title: 'Terrain', checkLoaded: true },
              { tool: 'travel', icon: <NavigationIcon />, title: 'Travel', checkLoaded: true },
              { tool: 'economy', icon: <TrendingUpIcon />, title: 'Economy', checkLoaded: true },
              { tool: 'weather', icon: <ThunderstormIcon />, title: 'Weather Systems', checkLoaded: true },
              { tool: 'time', icon: <ScheduleIcon />, title: 'Time of Day', checkLoaded: true }
            ].map(item => (
              <Tooltip key={item.tool} title={item.title} placement="right" arrow>
                <span>
                  <IconButton
                    disabled={item.checkLoaded && !designLoaded}
                    onClick={() => setActiveTool(item.tool)}
                    sx={{
                      color: activeTool === item.tool ? '#7ce6ff' : '#d5ddd7',
                      backgroundColor: activeTool === item.tool ? '#16322c' : '#23352d',
                      border: '1px solid',
                      borderColor: activeTool === item.tool ? '#ffe08a' : '#53645a',
                      borderRadius: '6px',
                      width: '36px',
                      height: '36px',
                      '&.Mui-disabled': { opacity: 0.3, color: '#d5ddd7' },
                      '&:hover': { backgroundColor: '#16322c', borderColor: '#7ce6ff' }
                    }}
                  >
                    {item.icon}
                  </IconButton>
                </span>
              </Tooltip>
            ))}
          </Box>
        )}

        <main className="settlement-map" style={{ flex: 1, position: 'relative' }} onClick={() => setMapContext(null)}>
          {activeTool !== 'atlas' && designLoaded && !mapLoading && <Suspense fallback={null}>
            <SettlementMapEditor
              tileStore={tileStoreRef.current}
              onTilesDirtied={handleTilesDirtied}
              tileStoreVersion={tileStoreVersion}
              activeTool={activeTool}
              buildMode={buildMode}
              setBuildMode={setBuildMode}
              blueprintDraft={blueprintDraft}
              setBlueprintDraft={setBlueprintDraft}
              atmosphereSettings={atmosphereSettings}
              setAtmosphereSettings={setAtmosphereSettings}
              weatherSettings={weatherSettings}
              setWeatherSettings={setWeatherSettings}
              assets={assets}
              buildings={buildings}
              setBuildings={setBuildings}
              simulation={simulation}

              selected={selectedBuilding}
              setSelected={setSelected}
              viewCommand={activeViewCommand}

              buildingViewMode={buildingViewMode}
              roads={roads}
              setRoads={setRoads}
              strokes={terrainStrokes}
              setStrokes={setTerrainStrokes}
              heightMap={heightMap}
              setHeightMap={setHeightMap}
              waterBodies={waterBodies}
              setWaterBodies={setWaterBodies}
              mapEnvironment={mapEnvironment}
              setMapEnvironment={setMapEnvironment}
              setFortifications={setFortifications}
              lamps={lamps}
              partyPosition={travelContext.party_position}
              destination={destination}
              referenceLayers={displayedReferenceLayers}
              referencePlacement={activeTool === 'reference' ? referenceDraft : null}
              setReferencePlacement={setReferenceDraft}
              onWaypoint={handleWaypoint}
              onReferencePoint={recordCalibrationPoint}
              onCameraChange={handleCameraChange}
              calibrationPoints={calibrationPoints}
              fitRequest={fitRequest}
              pointsOfInterest={travelContext.points_of_interest}
              campaignName={headers?.campaignName || headers?.CampaignName || ''}
              onMapContext={setMapContext}
              onSceneReady={handleSceneReady}
            />
          </Suspense>
          }

          {activeTool !== 'atlas' && !designLoaded && !mapLoading && (
            <Box
              className="settlement-map-loading is-error"
              role="status"
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: '#1c1212ce',
                border: '1px solid #f44336',
                borderRadius: '8px',
                padding: '24px',
                textAlign: 'center',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1.5,
                maxWidth: '360px',
                zIndex: 1000
              }}
            >
              <Typography variant="h6" sx={{ color: '#ff8a80', fontWeight: 'bold' }}>
                {saveStatus}
              </Typography>
              <Typography variant="body2" sx={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.4 }}>
                Return to the Atlas and choose a settlement to try again.
              </Typography>
              <Button
                variant="contained"
                color="error"
                size="small"
                startIcon={<PublicIcon />}
                onClick={() => setActiveTool('atlas')}
                sx={{ mt: 1, textTransform: 'none', fontWeight: 'bold' }}
              >
                Open World Atlas
              </Button>
            </Box>
          )}

          {activeTool !== 'atlas' && designLoaded && !mapLoading && (
            <Box
              className="map-hint"
              sx={{
                position: 'absolute',
                bottom: '16px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#14201cdd',
                border: '1px solid #526258',
                borderRadius: '20px',
                padding: '6px 16px',
                color: '#cbd5e1',
                fontSize: '0.8rem',
                fontWeight: 500,
                letterSpacing: '0.02em',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                pointerEvents: 'none',
                zIndex: 40,
                textAlign: 'center',
                maxWidth: '80%'
              }}
            >
              {activeTool === 'travel' && 'Click terrain to set a waypoint'}
              {activeTool === 'build' && 'Choose an asset to place, or drag the selected building and its footprint handles'}
              {activeTool === 'terrain' && 'Drag to sculpt terrain · WASD or arrows to pan'}
              {activeTool === 'road' && 'Click a road or list entry, then choose Add Points or Edit Points'}
              {activeTool === 'fortification' && 'Click a wall or list entry, then choose Add Points or Edit Points'}
              {activeTool === 'water' && 'Click a path for a river or a shoreline for lakes and oceans'}
              {activeTool === 'region' && 'Select a region or begin drawing a new boundary'}
              {activeTool === 'inspect' && firstPerson && 'WASD walk · Left Shift sprint · Mouse aim · Esc or M releases cursor'}
              {activeTool === 'inspect' && !firstPerson && 'WASD pan · Q/E orbit · R/F pitch · Left Shift/Ctrl elevation · Wheel/pinch zoom'}
              {activeTool !== 'travel' && activeTool !== 'build' && activeTool !== 'terrain' && activeTool !== 'road' && activeTool !== 'fortification' && activeTool !== 'water' && activeTool !== 'region' && activeTool !== 'inspect' && 'WASD pan · Q/E orbit · R/F pitch · Wheel/pinch zoom'}
            </Box>
          )}

          {activeTool === 'inspect' && designLoaded && (
            <Box
              className="map-view-mode"
              sx={{
                position: 'absolute',
                top: '18px',
                right: '290px',
                backgroundColor: '#14201cce',
                border: '1px solid #ffffff2c',
                borderRadius: '6px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                zIndex: 45,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
              }}
            >
              <Typography variant="caption" sx={{ color: '#aab4ad', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px' }}>
                Map View:
              </Typography>
              <FormControl size="small">
                <Select
                  value={buildingViewMode}
                  onChange={event => setBuildingViewMode(event.target.value)}
                  sx={{
                    height: '28px',
                    fontSize: '12px',
                    backgroundColor: '#23352d',
                    color: '#d5ddd7',
                    minWidth: '130px',
                    '.MuiOutlinedInput-notchedOutline': { borderColor: '#53645a' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#bd9149' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#bd9149' }
                  }}
                >
                  <MenuItem value="satellite" sx={{ fontSize: '12px' }}>Satellite</MenuItem>
                  <MenuItem value="building-type" sx={{ fontSize: '12px' }}>Building Type</MenuItem>
                  <MenuItem value="useful" sx={{ fontSize: '12px' }}>Useful Buildings</MenuItem>
                  <MenuItem value="districts" sx={{ fontSize: '12px' }}>Districts</MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}

          {activeTool === 'reference' && selectedReference && !referenceDraft &&
            <div className="reference-projection-toggle">
              <label>
                <input type="checkbox" checked={selectedReference.project_to_terrain !== false} onChange={event => updateReference(selectedReference.id, layer => ({ ...layer, project_to_terrain: event.target.checked }))} /> Project image onto sculpted terrain
              </label>
              <small>Opacity controls the projected overlay, preserving the material underneath.</small>
            </div>
          }
          {mapContext && <div className="player-map-context" style={{ left: mapContext.x, top: mapContext.y }} onClick={event => event.stopPropagation()}>
            <strong>{mapContext.target?.building?.name || mapContext.target?.point?.name || 'Map point'}</strong>
            <button onClick={() => { centerDmOn({ point: mapContext.target?.point }); setMapContext(null); }}>
              <CenterFocusStrongIcon /> Center in view</button>
            <button onClick={() => centerPlayerOn(mapContext.target?.point)}>
              <CenterFocusStrongIcon /> Center in Player View</button>
            {mapContext.target?.kind === 'building' && <button onClick={() => setBuildingLabel(mapContext.target.building, !playerLabels.includes(String(mapContext.target.building.id)))}>
              <VisibilityIcon /> {playerLabels.includes(String(mapContext.target.building.id)) ? 'Hide building label' : 'Show building label'}</button>}
          </div>
          }

          {activeTool === 'atlas' && (
            <Box className="world-atlas" sx={{ display: 'flex', width: '100%', height: 'calc(100vh - 64px)', background: '#0e1814' }}>

              {/* LEFT SIDE: OVERWORLD VIEWPORT STAGE */}
              <Box className="atlas-stage" sx={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 2, position: 'relative' }}>
                <Box className="atlas-heading" sx={{ mb: 2 }}>
                  <Typography variant="caption" sx={{ color: '#8f9d95', fontWeight: 800, letterSpacing: '.13em' }}>
                    WORLD ATLAS
                  </Typography>
                  <Typography variant="h5" sx={{ color: '#ecd89f', fontWeight: 700, mt: -0.5 }}>
                    {atlas.atlas?.name || 'Campaign World'}
                  </Typography>
                </Box>

                {/* Interactive Overworld Canvas Render Host */}
                <Box sx={{ flex: 1, borderRadius: '8px', border: '1px solid #526258', background: '#07100b' }}>
                  <AtlasViewport
                    atlas={atlas.atlas}
                    locations={atlas.locations.map(location => pendingAtlasMove?.id === location.id
                      ? { ...location, atlas_x: pendingAtlasMove.atlas_x, atlas_y: pendingAtlasMove.atlas_y }
                      : location)}
                    selectedId={movingAtlasId || selectedAtlasId || activeSettlementId}
                    movableId={movingAtlasId}
                    onSelect={setSelectedAtlasId}
                    onOpen={id => openSettlement(id)}
                    onMove={(id, atlas_x, atlas_y) => { if (id === movingAtlasId) setPendingAtlasMove({ id, atlas_x, atlas_y }); }}
                    onTerrainApproach={prefetchSettlement}
                    onTerrainEnter={id => openSettlement(id, { fromAtlasZoom: true })}
                    placementEnabled={movingAtlasId != null && atlas.locations.find(location => location.id === movingAtlasId)?.atlas_x == null}
                    onPlace={(atlas_x, atlas_y) => setPendingAtlasMove({ id: movingAtlasId, atlas_x, atlas_y })}
                  />
                </Box>

                <Typography variant="caption" className="atlas-help" sx={{ mt: 1, color: '#8f9d95', fontStyle: 'italic' }}>
                  {movingAtlasId
                    ? `${atlas.locations.find(l => l.id === movingAtlasId)?.atlas_x == null ? 'Click the atlas' : 'Drag the pin tip'} to preview ${atlas.locations.find(l => l.id === movingAtlasId)?.name || 'the settlement'}'s new coordinates, then choose Apply.`
                    : 'Wheel to zoom and drag to pan. Zoom through 1000% over a settlement pin to enter its terrain.'}
                </Typography>
              </Box>

              {/* RIGHT SIDE: SETTLEMENTS DIRECTORY MANAGEMENT SIDEBAR */}
              <Box
                className="atlas-list"
                component="aside"
                sx={{
                  width: '320px',
                  borderLeft: '1px solid #ffffff2c',
                  background: '#14201cce',
                  padding: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  overflowY: 'auto'
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Typography variant="subtitle2" sx={{ color: '#cbbd9d', fontWeight: 800, letterSpacing: '.06em' }}>
                    SETTLEMENTS DIRECTORY
                  </Typography>
                  <Typography variant="h6" sx={{ color: '#7ce6ff', fontWeight: 'bold', fontSize: '1.1rem' }}>
                    {atlas.locations.length}
                  </Typography>
                </Box>

                {/* 1. MAP IMAGE ASSET MANAGEMENT UPLOAD SLOTS */}
                {(!atlas.atlas?.image_url || showAtlasUpload) ? (
                  <Box
                    component="form"
                    onSubmit={async event => { await uploadAtlasImage(event); setShowAtlasUpload(false); }}
                    sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, background: '#101815', p: 1.5, borderRadius: '4px', border: '1px solid #3d4d43' }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#fff' }}>Overworld Atlas Canvas Map</Typography>
                    <Button variant="contained" component="label" size="small" fullWidth sx={{ backgroundColor: '#23352d' }}>
                      Choose File Asset
                      <input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={event => setAtlasUpload(value => ({ ...value, file: event.target.files?.[0] || null }))} />
                    </Button>
                    <TextField
                      placeholder="Attribution or cartographer source notes..."
                      size="small"
                      fullWidth
                      value={atlasUpload.attribution}
                      onChange={event => setAtlasUpload(value => ({ ...value, attribution: event.target.value }))}
                      sx={{ input: { fontSize: '11px', color: '#fff' } }}
                    />
                    <Button type="submit" variant="contained" size="small" disabled={!atlasUpload.file} sx={{ backgroundColor: '#bd9149', color: '#17211c', fontWeight: 'bold' }}>
                      Store Overworld Atlas
                    </Button>
                  </Box>
                ) : (
                  <Button variant="outlined" size="small" onClick={() => setShowAtlasUpload(true)} sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none' }}>
                    Replace World Atlas Background Image
                  </Button>
                )}

                {/* 2. INSTANT NEW SETTLEMENT RECORD CREATOR FORM */}
                <Box component="form" onSubmit={createSettlement} sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    placeholder="New settlement name..."
                    size="small"
                    fullWidth
                    value={newSettlementName}
                    onChange={event => setNewSettlementName(event.target.value)}
                    sx={{ input: { fontSize: '12px', color: '#fff' } }}
                  />
                  <Button type="submit" variant="contained" size="small" sx={{ backgroundColor: '#1e3a34', color: '#fff', minWidth: '40px', padding: 0 }}>
                    <AddIcon />
                  </Button>
                </Box>

                {/* 3. SCROLLABLE LOCATION DIRECTORY RECORD CARDS CAROUSEL */}
                <Box className="atlas-location-list" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1, overflowY: 'auto', pr: 0.5 }}>
                  {atlas.locations.map(location => {
                    const isActive = location.id === (movingAtlasId || selectedAtlasId || activeSettlementId);
                    const isDestroyed = location.status === 'destroyed';

                    return (
                      <Card
                        key={location.id}
                        sx={{
                          backgroundColor: isActive ? '#1e3a34' : '#10231f',
                          border: '1px solid',
                          borderColor: isActive ? '#ffe08a' : isDestroyed ? '#5f2120' : '#47423a',
                          opacity: isDestroyed ? 0.65 : 1
                        }}
                      >
                        <CardContent sx={{ padding: '10px !important', display: 'flex', flexDirection: 'column', gap: 1 }}>

                          {/* Activation Click Handler Meta */}
                          <Box
                            component="button"
                            onClick={() => openSettlement(location.id)}
                            sx={{
                              background: 'none', border: 'none', padding: 0, width: '100%', textAlign: 'left', cursor: 'pointer',
                              '&:hover h6': { color: '#7ce6ff' }
                            }}
                          >
                            <Typography variant="subtitle2" sx={{ color: isDestroyed ? '#f44336' : '#fff', fontWeight: 600, fontSize: '13px' }}>
                              {location.name}{isDestroyed ? ' (Ruined & Destroyed)' : ''}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', mt: 0.2 }}>
                              {location.atlas_x == null ? 'Not placed on Overworld' : `${Math.round(location.atlas_x * 100)}%, ${Math.round(location.atlas_y * 100)}%`} · {location.settlement_type || 'settlement'}
                            </Typography>
                          </Box>

                          <Divider sx={{ borderColor: '#33443b' }} />

                          {/* Micro Action Button Ribbon */}
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 0.5 }}>
                            <Button
                              size="small"
                              variant={movingAtlasId === location.id ? 'contained' : 'outlined'}
                              onClick={() => movingAtlasId === location.id ? applyAtlasMove(location) : beginAtlasMove(location)}
                              disabled={movingAtlasId === location.id && (pendingAtlasMove?.atlas_x == null || pendingAtlasMove?.atlas_y == null)}
                              sx={{ textTransform: 'none', fontSize: '10px', height: '22px', color: '#fff', borderColor: '#53645a', backgroundColor: movingAtlasId === location.id ? '#16322c' : 'transparent' }}
                            >
                              {movingAtlasId === location.id ? 'Apply' : 'Move'}
                            </Button>

                            {location.atlas_x != null && (
                              <Button size="small" variant="outlined" onClick={() => removeSettlementMarker(location)} sx={{ textTransform: 'none', fontSize: '10px', height: '22px', color: '#94a3b8', borderColor: '#53645a' }}>
                                Unplace
                              </Button>
                            )}

                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => setSettlementStatus(location, isDestroyed ? 'active' : 'destroyed')}
                              sx={{ textTransform: 'none', fontSize: '10px', height: '22px', color: isDestroyed ? '#4caf50' : '#f44336', borderColor: '#53645a' }}
                            >
                              {isDestroyed ? 'Restore' : 'Destroy'}
                            </Button>

                            <IconButton size="small" onClick={() => deleteSettlement(location)} title={`Permanently delete ${location.name}`} sx={{ color: '#ef5350', ml: 'auto', padding: '2px' }}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Box>

                        </CardContent>
                      </Card>
                    );
                  })}
                </Box>

                {/* Real-time Status Text Ribbon Footer */}
                <Typography variant="caption" className="atlas-status" sx={{ mt: 'auto', display: 'block', color: '#8f9d95', borderTop: '1px solid #33443b', pt: 1, fontStyle: 'italic', fontSize: '10px' }}>
                  {atlasStatus}
                </Typography>
              </Box>

            </Box>
          )}


          {activeTool === 'reference' && (
            <ReferencePlacementPanel key={activeSettlementId} layers={referenceLayers.filter(l => !l.floor_level_id)} selectedId={selectedReferenceId}
              select={id => { setSelectedReferenceId(id); setCalibrationPoints([]); }}
              draft={referenceDraft} setDraft={setReferenceDraft} cameraRef={referenceCameraRef}
              apply={applyReferencePlacement}
              remove={id => { setReferenceLayers(values => values.filter(l => l.id !== id)); setSelectedReferenceId(null); }}
              fit={reference => setLocalViewCommand({ mode: 'reference', reference, nonce: Date.now() })}
              calibration={<details><summary>Distance calibration</summary>
                <p>Click two terrain points, then enter their known distance.</p>
                <p>{calibrationPoints.length}/2 points selected</p>
                <input aria-label="Known distance in feet" type="number" min="1" value={knownDistance} onChange={e => setKnownDistance(Number(e.target.value))} />
                <button disabled={calibrationPoints.length !== 2 || knownDistance <= 0} onClick={applyReferenceCalibration}>Apply calibration</button>
              </details>}
            />
          )}

          {activeTool === 'inspect' && selectedBuilding?.is_blueprint && (
            <Button sx={{ position: 'absolute', right: 24, bottom: 70, background: '#23352d', color: '#e7d6ae' }}
              onClick={() => { setBuildMode('select-placed'); setActiveTool('build'); }}>Building details & levels</Button>
          )}
          {activeTool === 'build' && designLoaded && (
            <aside className="editor-menu build-tools-panel">
              <Typography variant="subtitle2" sx={{ color: '#cbbd9d', fontWeight: 800, mb: 1.5, letterSpacing: '.13em' }}>
                BUILDINGS &amp; STRUCTURES
              </Typography>

              {/* Integrated 3-Way Mode Selection Header Ribbon Selector */}
              <ToggleButtonGroup
                value={buildMode === 'move-selected' ? 'select-placed' : buildMode}
                exclusive
                fullWidth
                size="small"
                onChange={(e, nextMode) => {
                  if (nextMode !== null) {
                    setBuildMode(nextMode);
                    if (nextMode !== 'draw-blueprint') setBlueprintDraft(null);
                  }
                }}
                sx={{
                  mb: 2,
                  backgroundColor: '#10231f',
                  '& .MuiToggleButton-root': {
                    color: '#94a3b8',
                    borderColor: '#47423a',
                    textTransform: 'none',
                    fontSize: '11px',
                    gap: '4px',
                    '&.Mui-selected': { color: '#7ce6ff', backgroundColor: '#16322c' }
                  }
                }}
              >
                <ToggleButton value="place-asset">
                  <AddIcon fontSize="small" /> Place
                </ToggleButton>
                <ToggleButton value="draw-blueprint">
                  <EditIcon fontSize="small" /> Draw
                </ToggleButton>
                <ToggleButton value="select-placed">
                  <VisibilityIcon fontSize="small" /> Manage
                </ToggleButton>
              </ToggleButtonGroup>

              {/* MODE A: CATALOG ASSET PLACEMENT */}
              {buildMode === 'place-asset' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                    {assets.map(asset => (
                      <Button
                        key={asset.key}
                        fullWidth
                        onClick={() => setAssetKey(asset.key)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          textTransform: 'none',
                          padding: '6px 10px',
                          backgroundColor: assetKey === asset.key ? '#1e3a34' : '#10231f',
                          border: '1px solid',
                          borderColor: assetKey === asset.key ? '#ffe08a' : '#47423a',
                          borderRadius: '4px',
                          color: '#fff',
                          textAlign: 'left',
                          gap: '10px',
                          '&:hover': { backgroundColor: '#16322c' }
                        }}
                      >
                        <HomeWorkIcon sx={{ color: assetKey === asset.key ? '#7ce6ff' : '#94a3b8' }} />
                        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '12px', lineHeight: 1.2 }}>{asset.name}</Typography>
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>{asset.width_feet} x {asset.depth_feet} ft</Typography>
                        </Box>
                      </Button>
                    ))}
                  </Box>
                  <Typography variant="caption" sx={{ mt: 1, display: 'block', color: '#94a3b8', lineHeight: '1.4' }}>
                    Click directly on the terrain grid to drop the selected model asset template.
                  </Typography>
                </Box>
              )}

              {/* MODE B: POLYGON BLUEPRINT DRAFTING */}
              {buildMode === 'draw-blueprint' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {!blueprintDraft ? (
                    <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', py: 1 }}>
                      Click on the map landscape grid to drop the first layout coordinate node of your custom architectural blueprint footprint polygon loop.
                    </Typography>
                  ) : (
                    <>
                      <Typography variant="body2" sx={{ color: '#fff', fontWeight: 'bold' }}>Drafting: {blueprintDraft.name}</Typography>
                      <Typography variant="caption" sx={{ color: '#ffe08a', display: 'block', mb: 1 }}>
                        Active Corners Placed: {blueprintDraft.levels?.[blueprintDraft.levels.length - 1]?.corners?.length || 0}
                      </Typography>

                      <Button variant="outlined" size="small" fullWidth onClick={() => setBlueprintDraft(closeBlueprintFootprint(blueprintDraft))} sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none' }}>
                        Close Footprint Polygon Loop
                      </Button>

                      <Typography variant="caption">Trace the ground floor here. Add upper floors and basements from the building’s Levels section after saving.</Typography>

                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 0.5 }}>
                        <Button disabled={(blueprintDraft.levels?.[0]?.corners.length || 0) < 3} variant="contained" color="success" size="small" onClick={() => { const finished = closeBlueprintFootprint(blueprintDraft); setBuildings(prev => [...prev.filter(b => b.id !== finished.id), finished]); setSelected(finished); setBlueprintDraft(null); setBuildMode('select-placed'); }}>
                          Create Building
                        </Button>
                        <Button variant="contained" color="error" size="small" onClick={() => { setBlueprintDraft(null); setBuildMode('place-asset'); }}>
                          Cancel
                        </Button>
                      </Box>
                    </>
                  )}
                </Box>
              )}

              {/* MODE C: PROPERTY SELECTION & ADJUSTMENT TRACKS */}
              {['select-placed', 'move-selected'].includes(buildMode) && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                    {buildings.map(building => (
                      <Button
                        key={building.id}
                        fullWidth
                        onClick={() => setSelected(building)}
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          textTransform: 'none',
                          padding: '6px 10px',
                          backgroundColor: building.id === selectedBuilding?.id ? '#1e3a34' : '#10231f',
                          border: '1px solid',
                          borderColor: building.id === selectedBuilding?.id ? '#ffe08a' : '#47423a',
                          borderRadius: '4px',
                          color: '#fff',
                          textAlign: 'left',
                          '&:hover': { backgroundColor: '#16322c' }
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '12px' }}>{building.name || 'Unnamed Structure'}</Typography>
                        <Typography variant="caption" sx={{ color: '#94a3b8' }}>{Math.round(building.width_feet)} x {Math.round(building.depth_feet)} ft</Typography>
                      </Button>
                    ))}
                    {!buildings.length && (
                      <Typography variant="caption" sx={{ color: '#94a3b8', textAlign: 'center', display: 'block', py: 1 }}>No structures deployed yet.</Typography>
                    )}
                  </Box>

                  <Typography variant="caption" sx={{ color: '#94a3b8', lineHeight: 1.35 }}>
                    {buildMode === 'move-selected'
                      ? 'Drag the selected structure on the map, then choose Done Moving.'
                      : 'Select a building to edit it or move it on the map.'}
                  </Typography>

                  {selectedBuilding && (
                    <Box sx={{ borderTop: '1px solid #33443b', pt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Button
                        variant={buildMode === 'move-selected' ? 'contained' : 'outlined'}
                        startIcon={<OpenWithIcon fontSize="small" />}
                        onClick={() => setBuildMode(buildMode === 'move-selected' ? 'select-placed' : 'move-selected')}
                        sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none' }}
                      >
                        {buildMode === 'move-selected' ? 'Done Moving' : 'Move Structure'}
                      </Button>
                      {selectedBuilding.is_blueprint && <BlueprintLevels key={selectedBuilding.id} building={selectedBuilding}
                        onChange={next => setBuildings(values => values.map(b => b.id === next.id ? next : b))}
                        uploadImage={uploadFloorImage} />}
                      <TextField
                        label="Rename Structure"
                        size="small"
                        fullWidth
                        value={selectedBuilding.name || ''}
                        onChange={e => updateSelectedBuilding(building => ({ ...building, name: e.target.value }))}
                      />

                      <Box>
                        <Typography variant="caption" sx={{ color: '#aab4ad', display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <span>Width Boundary</span>
                          <strong>{Math.round(selectedBuilding.width_feet)} ft</strong>
                        </Typography>
                        <Slider disabled={!!selectedBuilding.is_blueprint} min={10} max={200} step={1} value={selectedBuilding.width_feet} onChange={(e, val) => updateSelectedBuilding(building => ({ ...building, width_feet: Number(val) }))} sx={{ color: '#bd9149', py: 0.5 }} />
                      </Box>

                      <Box>
                        <Typography variant="caption" sx={{ color: '#aab4ad', display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <span>Depth Dimension</span>
                          <strong>{Math.round(selectedBuilding.depth_feet)} ft</strong>
                        </Typography>
                        <Slider disabled={!!selectedBuilding.is_blueprint} min={10} max={200} step={1} value={selectedBuilding.depth_feet} onChange={(e, val) => updateSelectedBuilding(building => ({ ...building, depth_feet: Number(val) }))} sx={{ color: '#bd9149', py: 0.5 }} />
                      </Box>

                      <Box>
                        <Typography variant="caption" sx={{ color: '#aab4ad', display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <span>Rotation Orientation</span>
                          <strong>{Math.round((selectedBuilding.rotation || 0) * 180 / Math.PI)}°</strong>
                        </Typography>
                        <Slider min={0} max={359} step={1} value={Math.round((selectedBuilding.rotation || 0) * 180 / Math.PI)} onChange={(e, val) => updateSelectedBuilding(building => ({ ...building, rotation: Number(val) * Math.PI / 180 }))} sx={{ color: '#bd9149', py: 0.5 }} />
                      </Box>

                      <Button variant="contained" color="error" fullWidth startIcon={<DeleteIcon />} onClick={requestDeleteSelectedBuilding} sx={{ fontWeight: 'bold', textTransform: 'none' }}>
                        Delete Selected Building
                      </Button>
                    </Box>
                  )}
                </Box>
              )}
            </aside>
          )}

          {activeTool === 'travel' && (
            <aside className="editor-menu travel-manager-panel">
              <Typography variant="subtitle2" sx={{ color: '#cbbd9d', fontWeight: 800, mb: 1.5, letterSpacing: '.13em' }}>
                PLAN A JOURNEY
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Destination Selector */}
                <Box>
                  <Typography variant="caption" sx={{ color: '#aab4ad', display: 'block', mb: 0.5, fontWeight: 'bold' }}>
                    Destination
                  </Typography>
                  <FormControl size="small" fullWidth>
                    <Select
                      value={destination?.id || ''}
                      onChange={e => chooseDestination(travelContext.points_of_interest.find(point => point.id === Number(e.target.value)) || null)}
                      sx={{
                        backgroundColor: '#23352d',
                        color: '#d5ddd7',
                        '.MuiOutlinedInput-notchedOutline': { borderColor: '#53645a' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#bd9149' }
                      }}
                    >
                      <MenuItem value="">Select a point of interest</MenuItem>
                      {travelContext.points_of_interest.map(point => (
                        <MenuItem key={point.id} value={point.id}>{point.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>

                {/* Travelers Input */}
                <TextField
                  label="Travelers in Party"
                  type="number"
                  size="small"
                  fullWidth
                  inputProps={{ min: 1 }}
                  value={partySize}
                  onChange={e => setPartySize(Math.max(1, Number(e.target.value)))}
                />

                {/* Destination Metadata Card & Route Calculator */}
                {destination && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, background: '#101815', p: 1.5, borderRadius: '4px', border: '1px solid #3d4d43' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#fff' }}>{destination.name}</Typography>
                      <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                        {Math.round(destination.x)} E · {Math.round(destination.y)} N
                      </Typography>
                    </Box>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<NavigationIcon />}
                      onClick={() => calculateTravel()}
                      sx={{ backgroundColor: '#bd9149', color: '#17211c', fontWeight: 'bold', textTransform: 'none', '&:hover': { backgroundColor: '#d4a75b' } }}
                    >
                      Calculate Travel Options
                    </Button>
                  </Box>
                )}

                {/* Calculated Travel Route Options */}
                {travelPlan && (
                  <Box sx={{ borderTop: '1px solid #33443b', pt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: '150px', overflowY: 'auto' }}>
                      {travelPlan.options.map(option => (
                        <Box
                          key={option.mode}
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '8px',
                            borderRadius: '4px',
                            backgroundColor: '#10231f',
                            border: '1px solid #47423a',
                            opacity: option.available ? 1 : 0.4
                          }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600, color: option.available ? '#fff' : '#ef5350' }}>
                            {option.label}
                          </Typography>
                          {option.available ? (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                              <Typography variant="caption" sx={{ color: '#ffe08a' }}>{formatDuration(option.elapsed_minutes)}</Typography>
                              <Typography variant="caption" sx={{ color: '#94a3b8' }}>{option.distance_miles} mi · {formatCost(option.cost_cp)}</Typography>
                            </Box>
                          ) : (
                            <Typography variant="caption" sx={{ color: '#ef5350', fontStyle: 'italic', mt: 0.5 }}>
                              {option.unavailable_reason}
                            </Typography>
                          )}
                        </Box>
                      ))}
                    </Box>

                    <Button
                      variant="contained"
                      color="success"
                      fullWidth
                      startIcon={<NavigationIcon />}
                      onClick={setPartyHere}
                      sx={{ textTransform: 'none', fontWeight: 'bold' }}
                    >
                      Move Party to Destination
                    </Button>
                  </Box>
                )}
              </Box>
            </aside>
          )}

          {activeTool === 'economy' && (
            <aside className="editor-menu economy-manager-panel" style={{ width: '460px' }}> {/* Slightly wider to contain the SVGs charts nicely */}
              {/* Economy Title & Trigger Actions Row */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#cbbd9d', fontWeight: 800, display: 'block', letterSpacing: '.13em' }}>
                    SETTLEMENT ECONOMY
                  </Typography>
                  <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, mt: -0.5 }}>
                    Market Day {economy.day_index}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button variant="outlined" size="small" onClick={() => runEconomy(1)} sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none' }}>
                    Run Day
                  </Button>
                  <Button variant="contained" size="small" onClick={() => runEconomy(10)} sx={{ backgroundColor: '#bd9149', color: '#17211c', textTransform: 'none', fontWeight: 'bold', '&:hover': { backgroundColor: '#d4a75b' } }}>
                    Run Tenday
                  </Button>
                </Box>
              </Box>

              {/* Commodities Stock Markets Grid Matrix */}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 3 }}>
                {economy.markets.map(market => {
                  const isShortage = market.price_index > 1.3;
                  return (
                    <Box
                      key={market.id}
                      sx={{
                        padding: '10px',
                        borderRadius: '4px',
                        backgroundColor: '#10231f',
                        border: '1px solid',
                        borderColor: isShortage ? '#ef5350' : '#47423a',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.5
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: isShortage ? '#ff8a80' : '#fff' }}>{market.name}</Typography>
                        <Typography variant="body2" sx={{ color: '#ffe08a', fontWeight: 'bold' }}>{market.current_price_cp} cp</Typography>
                      </Box>

                      <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                        {Math.round(market.stock)} / {Math.round(market.target_stock)} units · {market.price_index}× base
                      </Typography>

                      {market.last_imported > 0 && (
                        <Typography variant="caption" sx={{ color: '#81c784', fontStyle: 'italic', display: 'block' }}>
                          Imported {Math.round(market.last_imported)} today
                        </Typography>
                      )}

                      <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center' }}>
                        <TextField
                          type="number"
                          size="small"
                          inputProps={{ min: 1 }}
                          value={commodityQuantity}
                          onChange={e => setCommodityQuantity(Math.max(1, Number(e.target.value)))}
                          sx={{ width: '65px', '& .MuiInputBase-input': { padding: '4px 6px', fontSize: '11px', color: '#fff' } }}
                        />
                        <Button variant="contained" size="small" fullWidth onClick={() => disruptMarket(market.commodity_key)} sx={{ backgroundColor: '#23352d', color: '#d5ddd7', textTransform: 'none', fontSize: '10px', padding: '4px' }}>
                          Party Buys
                        </Button>
                      </Box>
                    </Box>
                  );
                })}
              </Box>

              {/* Business Financial Analytics Section */}
              <Box sx={{ borderTop: '1px solid #33443b', pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  <Box sx={{ flex: 1.2 }}>
                    <Typography variant="caption" sx={{ color: '#aab4ad', display: 'block', mb: 0.5, fontWeight: 'bold' }}>
                      Business Venture Selection
                    </Typography>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={selectedBusinessId || ''}
                        onChange={e => setSelectedBusinessId(Number(e.target.value))}
                        sx={{ backgroundColor: '#23352d', color: '#d5ddd7', '.MuiOutlinedInput-notchedOutline': { borderColor: '#53645a' } }}
                      >
                        {economy.businesses.map(business => (
                          <MenuItem key={business.id} value={business.id}>
                            {business.name}{business.player_owned ? ' (Party Venture)' : ''}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>

                  {selectedBusiness && (
                    <Box sx={{ flex: 1, background: '#101815', p: 1, borderRadius: '4px', border: '1px solid #3d4d43' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: selectedBusiness.closed ? '#ef5350' : '#4caf50' }}>
                          {selectedBusiness.closed ? 'CLOSED' : 'OPERATING'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#ffe08a', fontWeight: 'bold' }}>{formatCost(selectedBusiness.cash_reserves_cp)}</Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', lineHeight: 1.2 }}>
                        Foot Traffic: {selectedBusiness.foot_traffic}x <br /> Slump Loop: {selectedBusiness.slump_days} days
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* SVG Analytics Charts Wrap */}
                <Box className="chart-wrap" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#fff' }}>Daily Performance History</Typography>
                    <Typography variant="caption" sx={{ color: '#7ce6ff' }}>
                      Tenday: {formatCost(tenday.revenue)} rev · {formatCost(tenday.profit)} prof
                    </Typography>
                  </Box>
                  <Box sx={{ background: '#0a100d', p: 1, borderRadius: '4px', border: '1px solid #23352d' }}>
                    <SalesChart rows={selectedHistory} />
                  </Box>
                </Box>
              </Box>
            </aside>
          )}


          {activeTool === 'time' && (
            <aside className="editor-menu time-manager-panel">
              <Typography variant="subtitle2" sx={{ color: '#cbbd9d', fontWeight: 800, mb: 1.5, letterSpacing: '.13em' }}>
                TIME OF DAY MANAGER
              </Typography>

              {/* SECTION A: STEP JUMP ADVANCEMENTS CONTAINER */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2 }}>
                <Typography variant="caption" sx={{ color: '#8f9d95', fontWeight: 700, letterSpacing: '0.04em', mb: 0.5 }}>
                  STEP JUMPS
                </Typography>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Button variant="contained" size="small" startIcon={<ArrowBackIcon />} onClick={() => advanceTime(-60)} sx={{ backgroundColor: '#23352d', textTransform: 'none', fontSize: '11px' }}>
                    -1 Hour
                  </Button>
                  <Button variant="contained" size="small" endIcon={<ArrowForwardIcon />} onClick={() => advanceTime(60)} sx={{ backgroundColor: '#23352d', textTransform: 'none', fontSize: '11px' }}>
                    +1 Hour
                  </Button>

                  <Button variant="contained" size="small" startIcon={<FastRewindIcon />} onClick={() => advanceTime(-720)} sx={{ backgroundColor: '#23352d', textTransform: 'none', fontSize: '11px' }}>
                    -12 Hours
                  </Button>
                  <Button variant="contained" size="small" endIcon={<FastForwardIcon />} onClick={() => advanceTime(720)} sx={{ backgroundColor: '#23352d', textTransform: 'none', fontSize: '11px' }}>
                    +12 Hours
                  </Button>

                  <Button variant="contained" size="small" startIcon={<CalendarTodayIcon sx={{ scale: '0.8' }} />} onClick={() => advanceTime(-1440)} sx={{ backgroundColor: '#23352d', textTransform: 'none', fontSize: '11px' }}>
                    -1 Day
                  </Button>
                  <Button variant="contained" size="small" endIcon={<CalendarTodayIcon sx={{ scale: '0.8' }} />} onClick={() => advanceTime(1440)} sx={{ backgroundColor: '#23352d', textTransform: 'none', fontSize: '11px' }}>
                    +1 Day
                  </Button>
                </Box>
              </Box>

              {/* SECTION B: DYNAMIC CALENDAR SCHEMA SYNC INTEGRATION */}
              {!activeCalendar ? (
                <Box className="chart-empty" sx={{ padding: '12px', textAlign: 'center', background: '#101815', borderRadius: '4px', border: '1px solid #3d4d43' }}>
                  <Typography variant="caption" sx={{ color: '#94a3b8', fontStyle: 'italic' }}>
                    Synchronizing calendar matrix with database...
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, borderTop: '1px solid #33443b', pt: 1.5, mb: 2 }}>
                  <Typography variant="caption" sx={{ color: '#8f9d95', fontWeight: 700, letterSpacing: '0.04em' }}>
                    MANUAL DATE &amp; TIME ENTRY
                  </Typography>

                  {/* Date Row Split Box */}
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', gap: 1 }}>
                    <TextField
                      label="Year"
                      type="number"
                      size="small"
                      value={manualDate.year}
                      onChange={e => setManualDate(prev => ({ ...prev, year: Number(e.target.value) }))}
                      sx={{ input: { color: '#fff', fontSize: '12px' } }}
                    />

                    <FormControl size="small" fullWidth>
                      <Select
                        value={manualDate.month_index}
                        onChange={e => {
                          const nextMonth = Number(e.target.value);
                          setManualDate(prev => {
                            const maxDays = activeCalendar?.months?.[nextMonth]?.length || 30;
                            return { ...prev, month_index: nextMonth, day: Math.min(prev.day, maxDays) };
                          });
                        }}
                        sx={{
                          height: '40px',
                          fontSize: '11px',
                          backgroundColor: '#23352d',
                          color: '#d5ddd7',
                          '.MuiOutlinedInput-notchedOutline': { borderColor: '#53645a' }
                        }}
                      >
                        {activeCalendar.months.map((m, idx) => (
                          <MenuItem key={idx} value={idx} sx={{ fontSize: '12px' }}>
                            {m.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <TextField
                      label="Day"
                      type="number"
                      size="small"
                      inputProps={{ min: 1, max: activeCalendar.months[manualDate.month_index]?.length || 30 }}
                      value={manualDate.day}
                      onChange={e => setManualDate(prev => ({ ...prev, day: Number(e.target.value) }))}
                      sx={{ input: { color: '#fff', fontSize: '12px' } }}
                    />
                  </Box>

                  {/* Hours & Minutes Row Split Box */}
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <TextField
                      label="Hour (0-23)"
                      type="number"
                      size="small"
                      inputProps={{ min: 0, max: 23 }}
                      value={manualDate.hour}
                      onChange={e => setManualDate(prev => ({ ...prev, hour: Number(e.target.value) }))}
                      sx={{ input: { color: '#fff', fontSize: '12px' } }}
                    />
                    <TextField
                      label="Minute (0-59)"
                      type="number"
                      size="small"
                      inputProps={{ min: 0, max: 59 }}
                      value={manualDate.minute}
                      onChange={e => setManualDate(prev => ({ ...prev, minute: Number(e.target.value) }))}
                      sx={{ input: { color: '#fff', fontSize: '12px' } }}
                    />
                  </Box>

                  <Button
                    variant="contained"
                    fullWidth
                    size="small"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('settlement-time-absolute-request', {
                        detail: { ...manualDate }
                      }));
                    }}
                    sx={{ backgroundColor: '#bd9149', color: '#17211c', fontWeight: 'bold', '&:hover': { backgroundColor: '#d4a75b' } }}
                  >
                    Apply Exact Target Timeline
                  </Button>
                </Box>
              )}

              {/* SECTION C: SYSTEM HIGH-CONTRAST QUICK ACTION PRESETS */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, borderTop: '1px solid #33443b', pt: 1.5 }}>
                <Typography variant="caption" sx={{ color: '#8f9d95', fontWeight: 700, letterSpacing: '0.04em', mb: 0.5 }}>
                  QUICK PRESETS
                </Typography>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<WbTwilightIcon sx={{ color: '#ffb74d' }} />}
                    onClick={() => window.dispatchEvent(new CustomEvent('settlement-time-absolute-request', { detail: { hour: 6, minute: 0, day } }))}
                    sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none', fontSize: '11px', justifyContent: 'flex-start' }}
                  >
                    Dawn (6:00)
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<WbSunnyIcon sx={{ color: '#fbc02d' }} />}
                    onClick={() => window.dispatchEvent(new CustomEvent('settlement-time-absolute-request', { detail: { hour: 12, minute: 0, day } }))}
                    sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none', fontSize: '11px', justifyContent: 'flex-start' }}
                  >
                    Noon (12:00)
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<NightsStayIcon sx={{ color: '#81c784' }} />}
                    onClick={() => window.dispatchEvent(new CustomEvent('settlement-time-absolute-request', { detail: { hour: 18, minute: 0, day } }))}
                    sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none', fontSize: '11px', justifyContent: 'flex-start' }}
                  >
                    Dusk (18:00)
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<BedtimeIcon sx={{ color: '#90caf9' }} />}
                    onClick={() => window.dispatchEvent(new CustomEvent('settlement-time-absolute-request', { detail: { hour: 0, minute: 0, day } }))}
                    sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none', fontSize: '11px', justifyContent: 'flex-start' }}
                  >
                    Midnight (0:00)
                  </Button>
                </Box>
              </Box>
            </aside>
          )}

          {designLoaded && activeTool !== 'atlas' && (
            <Box
              className="map-location-search"
              onClick={event => event.stopPropagation()}
              sx={{
                position: 'absolute',
                top: '18px',
                right: '18px',
                backgroundColor: '#14201cce',
                border: '1px solid #ffffff2c',
                borderRadius: '6px',
                padding: '12px',
                width: '260px',
                zIndex: 45,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5
              }}
            >
              <Box className="location-search">
                <Typography variant="caption" sx={{ color: '#8f9d95', fontWeight: 800, display: 'block', letterSpacing: '.13em', mb: 0.5 }}>
                  FIND A LOCATION
                </Typography>

                <TextField
                  type="search"
                  size="small"
                  fullWidth
                  placeholder="Name, type, owner, faction…"
                  value={locationSearch}
                  onChange={event => setLocationSearch(event.target.value)}
                  inputProps={{ 'aria-label': 'Search settlement locations' }}
                  sx={{ input: { color: '#fff', fontSize: '12px' } }}
                />

                {/* Dynamic Scrollable Results Stack Container */}
                {locationSearch && (
                  <Box
                    className="location-search-results"
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      maxHeight: '160px',
                      overflowY: 'auto',
                      mt: 1,
                      borderTop: '1px solid #33443b',
                      pt: 1
                    }}
                  >
                    {locationResults.map(location => (
                      <Button
                        key={location.id}
                        fullWidth
                        onClick={() => selectLocation(location)}
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          textTransform: 'none',
                          padding: '6px 10px',
                          backgroundColor: selectedLocation?.id === location.id ? '#1e3a34' : '#10231f',
                          border: '1px solid',
                          borderColor: selectedLocation?.id === location.id ? '#ffe08a' : '#47423a',
                          borderRadius: '4px',
                          color: '#fff',
                          textAlign: 'left',
                          '&:hover': { backgroundColor: '#16322c' }
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '12px', lineHeight: 1.2 }}>
                          {location.title}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '10px' }}>
                          {location.type}{location.owner ? ` · ${location.owner}` : ''}{textAffiliation(location)}
                        </Typography>
                      </Button>
                    ))}

                    {!locationResults.length && (
                      <Typography variant="caption" sx={{ color: '#94a3b8', textAlign: 'center', display: 'block', py: 1 }}>
                        No matching mapped locations.
                      </Typography>
                    )}
                  </Box>
                )}

                {/* Contextual Selected Landmark Focus Action Ribbon */}
                {selectedLocation && (
                  <Box
                    className="location-search-selection"
                    sx={{
                      mt: 1.5,
                      borderTop: '1px solid #33443b',
                      pt: 1.5,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1
                    }}
                  >
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#ffe08a' }}>
                        {selectedLocation.title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#cbd5e1', display: 'block' }}>
                        {selectedLocation.type}{selectedLocation.affiliation ? ` · ${selectedLocation.affiliation}` : ''}
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 0.5 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<CenterFocusStrongIcon />}
                        onClick={() => centerDmOn(selectedLocation)}
                        sx={{ color: '#d5ddd7', borderColor: '#53645a', fontSize: '10px', textTransform: 'none', padding: '4px' }}
                      >
                        Center DM
                      </Button>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<OpenInNewIcon />}
                        onClick={() => centerPlayerOnLocation(selectedLocation)}
                        sx={{ backgroundColor: '#bd9149', color: '#17211c', fontSize: '10px', textTransform: 'none', padding: '4px', '&:hover': { backgroundColor: '#d4a75b' } }}
                      >
                        Center Player
                      </Button>
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>
          )}

        </main>
      </Box>

      <>
        <Dialog
          open={Boolean(buildingDeleteTarget)}
          onClose={closeBuildingDeleteDialog}
          onKeyDown={event => {
            if (event.key !== 'Enter' || event.defaultPrevented) return;
            event.preventDefault();
            confirmBuildingDeletion();
          }}
          aria-labelledby="building-delete-dialog-title"
          aria-describedby="building-delete-dialog-description"
          maxWidth="xs"
          fullWidth
          PaperProps={{
            sx: {
              backgroundColor: '#14201c',
              backgroundImage: 'none',
              border: '1px solid #9f3a3a',
              color: '#d5ddd7',
              p: 1
            }
          }}
        >
          <DialogTitle id="building-delete-dialog-title" sx={{ color: '#fff', fontWeight: 700, pb: 1 }}>
            Delete {buildingDeleteTarget?.name || 'this building'}?
          </DialogTitle>
          <DialogContent>
            <Typography id="building-delete-dialog-description" variant="body2" sx={{ color: '#c3cec7', lineHeight: 1.5, mb: 1.5 }}>
              This removes the selected building from the settlement. Press Enter to confirm or Escape to cancel.
            </Typography>
            <FormControlLabel
              control={<Checkbox checked={skipBuildingDeleteConfirmation} onChange={event => setSkipBuildingDeleteConfirmation(event.target.checked)} sx={{ color: '#e05252', '&.Mui-checked': { color: '#e05252' } }} />}
              label="Don't ask me again for this session"
              sx={{ color: '#d5ddd7', alignItems: 'center' }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button variant="outlined" onClick={closeBuildingDeleteDialog} sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none' }}>
              Cancel
            </Button>
            <Button autoFocus variant="contained" color="error" startIcon={<DeleteIcon />} onClick={confirmBuildingDeletion} sx={{ fontWeight: 'bold', textTransform: 'none' }}>
              Delete Building
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={Boolean(buildingEditDraft)}
          onClose={() => setBuildingEditDraft(null)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              backgroundColor: '#14201c',
              backgroundImage: 'none', // Overrides default light opacity filter layers
              border: '1px solid #53645a',
              color: '#d5ddd7',
              p: 1
            }
          }}
        >
          {buildingEditDraft && (
            <Box component="form" onSubmit={event => { event.preventDefault(); saveBuildingEditor(); }}>
              <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, px: 2 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#cbbd9d', fontWeight: 800, display: 'block', letterSpacing: '.06em' }}>
                    EDIT BUILDING
                  </Typography>
                  <Typography variant="h5" component="h2" sx={{ color: '#fff', fontWeight: 700, mt: -0.5 }}>
                    {buildingEditDraft.name || 'Building'}
                  </Typography>
                </Box>
                <IconButton onClick={() => setBuildingEditDraft(null)} aria-label="Close" sx={{ color: '#8f9d95' }}>
                  <CloseIcon />
                </IconButton>
              </DialogTitle>

              <DialogContent sx={{ px: 2, py: 1 }}>
                {/* Non-deprecated CSS Grid replacing the old legacy .building-edit-grid table array */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, pt: 1 }}>

                  <TextField
                    label="Building Name"
                    size="small"
                    value={buildingEditDraft.name || ''}
                    onChange={event => setBuildingEditDraft(value => ({ ...value, name: event.target.value }))}
                    sx={{ gridColumn: 'span 2' }}
                  />

                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="caption" sx={{ color: '#aab4ad', mb: 0.5, fontWeight: 'bold' }}>Model &amp; Footprint</Typography>
                    <Select
                      size="small"
                      value={buildingEditDraft.asset_key || ''}
                      onChange={event => {
                        const asset = assets.find(item => item.key === event.target.value);
                        setBuildingEditDraft(value => ({
                          ...value,
                          asset_key: event.target.value,
                          building_type: asset?.category || value.building_type,
                          width_feet: asset?.width_feet || value.width_feet,
                          depth_feet: asset?.depth_feet || value.depth_feet,
                          rooms: asset?.rooms || value.rooms
                        }));
                      }}
                      sx={{
                        backgroundColor: '#23352d',
                        color: '#d5ddd7',
                        '.MuiOutlinedInput-notchedOutline': { borderColor: '#53645a' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#bd9149' }
                      }}
                    >
                      {assets.map(asset => (
                        <MenuItem key={asset.key} value={asset.key}>{asset.name} · {asset.category}</MenuItem>
                      ))}
                    </Select>
                  </Box>

                  <TextField
                    label="Building or Business Type"
                    size="small"
                    value={buildingEditDraft.business_type || buildingEditDraft.building_type || ''}
                    onChange={event => setBuildingEditDraft(value => ({ ...value, business_type: event.target.value }))}
                    sx={{ mt: 2.2 }}
                  />

                  <TextField
                    label="Owner Name"
                    size="small"
                    value={buildingEditDraft.owner_name || ''}
                    onChange={event => setBuildingEditDraft(value => ({ ...value, owner_name: event.target.value }))}
                  />

                  <TextField
                    label="Owner Affiliation"
                    size="small"
                    value={buildingEditDraft.owner_affiliation || ''}
                    onChange={event => setBuildingEditDraft(value => ({ ...value, owner_affiliation: event.target.value }))}
                  />

                  <TextField
                    label="District Key"
                    size="small"
                    value={buildingEditDraft.district_key || ''}
                    onChange={event => setBuildingEditDraft(value => ({ ...value, district_key: event.target.value }))}
                  />

                  <TextField
                    label="Factions"
                    size="small"
                    value={buildingEditDraft.factions || ''}
                    onChange={event => setBuildingEditDraft(value => ({ ...value, factions: event.target.value }))}
                  />

                  <TextField
                    label="Search Tags"
                    size="small"
                    value={buildingEditDraft.tags || ''}
                    onChange={event => setBuildingEditDraft(value => ({ ...value, tags: event.target.value }))}
                  />

                  <TextField
                    label="Elevation Offset (ft)"
                    type="number"
                    size="small"
                    value={Number(buildingEditDraft.elevation) || 0}
                    onChange={event => setBuildingEditDraft(value => ({ ...value, elevation: Number(event.target.value) || 0 }))}
                  />

                  <TextField
                    label="Description Summary"
                    multiline
                    rows={3}
                    size="small"
                    value={buildingEditDraft.description || ''}
                    onChange={event => setBuildingEditDraft(value => ({ ...value, description: event.target.value }))}
                    sx={{ gridColumn: 'span 2' }}
                  />
                </Box>
              </DialogContent>

              <DialogActions sx={{ padding: 2, px: 2, gap: 1 }}>
                <Button variant="outlined" onClick={() => setBuildingEditDraft(null)} sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none' }}>
                  Cancel
                </Button>
                <Button type="submit" variant="contained" sx={{ backgroundColor: '#bd9149', color: '#17211c', textTransform: 'none', fontWeight: 'bold', '&:hover': { backgroundColor: '#d4a75b' } }}>
                  Save Building Changes
                </Button>
              </DialogActions>
            </Box>
          )}
        </Dialog>

        <Dialog
          open={Boolean(buildingEvents)}
          onClose={() => setBuildingEvents(null)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              backgroundColor: '#14201c',
              backgroundImage: 'none',
              border: '1px solid #53645a',
              color: '#d5ddd7',
              p: 1
            }
          }}
        >
          {buildingEvents && (
            <>
              <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, px: 2 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#cbbd9d', fontWeight: 800, display: 'block', letterSpacing: '.06em' }}>
                    CHRONICLE SCENARIO MATRIX
                  </Typography>
                  <Typography variant="h5" component="h2" sx={{ color: '#fff', fontWeight: 700, mt: -0.5 }}>
                    {selectedBuilding?.name || 'Local Landmark'} Events
                  </Typography>
                </Box>
                <IconButton onClick={() => setBuildingEvents(null)} aria-label="Close" sx={{ color: '#8f9d95' }}>
                  <CloseIcon />
                </IconButton>
              </DialogTitle>

              <DialogContent sx={{ px: 2, py: 1 }}>
                <Typography variant="body2" sx={{ color: '#aab4ad', mb: 2, lineHeight: 1.45 }}>
                  Choose one reactive event to introduce into the overworld journal log context right now. Available variables are drawn directly from active simulation profiles.
                </Typography>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: '320px', overflowY: 'auto', pr: 0.5 }}>
                  {buildingEvents.map((event, index) => (
                    <Button
                      key={event}
                      fullWidth
                      variant="contained"
                      onClick={() => startBuildingEvent(event)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        textTransform: 'none',
                        padding: '10px 14px',
                        backgroundColor: '#10231f',
                        border: '1px solid #47423a',
                        borderRadius: '4px',
                        color: '#fff',
                        textAlign: 'left',
                        gap: 2,
                        '&:hover': { backgroundColor: '#1e3a34', borderColor: '#ffe08a' }
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ color: '#ffe08a', fontWeight: 'bold', minWidth: '20px' }}>
                        {index + 1}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#cbd5e1', lineHeight: 1.4 }}>
                        {event}
                      </Typography>
                    </Button>
                  ))}
                </Box>
              </DialogContent>

              <DialogActions sx={{ padding: 2, px: 2 }}>
                <Button variant="outlined" onClick={() => setBuildingEvents(null)} sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none' }}>
                  Dismiss Panel
                </Button>
              </DialogActions>
            </>
          )}
        </Dialog>
      </>
    </Box>
  );
}
