import useNpcMapTokens from './useNpcMapTokens';
import NpcTokenPanel from './NpcTokenPanel';
import RestActivityPanel from './RestActivityPanel';
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { settlementLamps } from './settlementStreetLighting';
import SettlementMoonPhase from './SettlementMoonPhase';

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
import PersonPinCircleIcon from '@mui/icons-material/PersonPinCircle';

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
import UndoIcon from '@mui/icons-material/Undo';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import AtlasViewport from './AtlasViewport';
import BlueprintLevels from './BlueprintLevels';
import PropertyEstateList from './PropertyEstateList';
import { resizeBlueprintFootprint } from './buildingBlueprint';
import ReferencePlacementPanel from './ReferencePlacementPanel';
import ValidatedNumberInput, { ValidatedNumberField } from './ValidatedNumberInput';
import { mergeReferenceSave } from './referencePlacement';
import {
  calibrateReferenceLayer,
  FALLBACK_ASSET_CATALOG,
  closeBlueprintFootprint,
} from './settlementEditor';
import {
  createTileStore,
  seedStoreFromHeightMap,
  hydrateTiles,
  setStoreDefaults,
  bakeStrokesIntoTiles,
  serializeTerrainTile,
  tileKey,
} from './settlementTiles';
import { planTerrainTileBatches, streamTerrainTileBatches, terrainTileStreamKey } from './terrainTileStream';
import { createSceneLoadMetrics } from './sceneLoadMetrics';

import {
  searchSettlementLocations,
  settlementSearchLocations
} from './settlementSearch';
import { buildingViewLegend } from './settlementInspection';
import { cleanWallJunctions, reconcileWallJunctions } from './wallJunctions';
import { addStructureToProperty, createProperty, deletePropertyKeepingBuildings, normalizePropertyCatalog, removeStructureFromProperties } from './settlementProperties';
import { createBoundary, createOutdoorArea, moveBoundaryOpening, OUTDOOR_AREA_TYPES, validateBoundaryOpening } from './propertyGeometry';
import useSessionManagement from './useSessionManagement';

import './SettlementManager.css';
import './SettlementToolPanels.css';

const loadSettlementMapEditor = () => import('./SettlementMapEditor');
const SettlementMapEditor = lazy(loadSettlementMapEditor);
const SpatialConnectionsEditor = lazy(() => import('./SpatialConnectionsEditor'));
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
  const requestedSettlementId = Number(new URLSearchParams(window.location.search).get('settlement_id')) || null;
  const requestedNpcId = Number(new URLSearchParams(window.location.search).get('place_npc')) || null;
  const [assetKey, setAssetKey] = useState(null);
  const [buildings, setBuildings] = useState([])
  const [properties, setProperties] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);
  const [newStructurePropertyId, setNewStructurePropertyId] = useState(null);
  const [propertyDraft, setPropertyDraft] = useState([]);
  const [editingPropertyBoundaryId, setEditingPropertyBoundaryId] = useState(null);
  const [outdoorTypeDraft, setOutdoorTypeDraft] = useState('yard');
  const [selectedBoundarySegment, setSelectedBoundarySegment] = useState(0);
  const [selectedBoundaryOpeningId, setSelectedBoundaryOpeningId] = useState(null);
  const [movingBoundaryOpening, setMovingBoundaryOpening] = useState(false);
  const [propertyEditError, setPropertyEditError] = useState('');
  const [manageCatalog, setManageCatalog] = useState('buildings');
  const buildToolsRef = useRef(null);
  const effectiveProperties = useMemo(() => normalizePropertyCatalog(buildings, properties), [buildings, properties]);
  const [buildMode, setBuildMode] = useState('select-placed'); // Manage existing buildings by default.
  useEffect(() => {
    if (['draw-blueprint', 'draw-property-boundary', 'edit-property-boundary', 'draw-outdoor-area'].includes(buildMode) && buildToolsRef.current) {
      buildToolsRef.current.scrollTop = 0;
    }
  }, [buildMode]);

  const [selected, setSelected] = useState(null)
  const buildingMoveHistoryRef = useRef([]);
  const [buildingMoveUndoCount, setBuildingMoveUndoCount] = useState(0);
  const recordBuildingMove = useCallback(building => {
    if (!building?.id) return;
    buildingMoveHistoryRef.current.push({ id: building.id, x: building.x, y: building.y });
    if (buildingMoveHistoryRef.current.length > 30) buildingMoveHistoryRef.current.shift();
    setBuildingMoveUndoCount(buildingMoveHistoryRef.current.length);
  }, []);
  const undoBuildingMove = useCallback(() => {
    const previous = buildingMoveHistoryRef.current.pop();
    if (!previous) return;
    const current = buildings.find(building => String(building.id) === String(previous.id));
    setBuildings(values => values.map(building => String(building.id) === String(previous.id)
      ? { ...building, x: previous.x, y: previous.y }
      : building));
    if (current) setSelected({ ...current, x: previous.x, y: previous.y });
    setBuildingMoveUndoCount(buildingMoveHistoryRef.current.length);
    setBuildMode('select-placed');
  }, [buildings]);
  const [inspectSelection, setInspectSelection] = useState(null);
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
  const [blueprintHoverPoint, setBlueprintHoverPoint] = useState(null);
  const [footprintTool, setFootprintTool] = useState('line');
  const [footprintPoints, setFootprintPoints] = useState([]);
  const [footprintError, setFootprintError] = useState('');
  useEffect(() => { setFootprintPoints([]); setFootprintError(''); }, [buildMode, footprintTool, newStructurePropertyId]);

  const setFortifications = useCallback(updater => setMapEnvironment(environment => cleanWallJunctions({ ...environment,
    fortifications: typeof updater === 'function' ? updater(environment.fortifications || []) : updater })), []);
  const [referenceLayers, setReferenceLayers] = useState([])
  const [selectedReferenceId, setSelectedReferenceId] = useState(null);
  const [referenceDraft, setReferenceDraft] = useState(null);
  const referenceCameraRef = useRef(null);
  const displayedReferenceLayers = useMemo(() => referenceDraft
    ? [...referenceLayers.filter(layer => layer.id !== referenceDraft.id), referenceDraft]
    : referenceLayers, [referenceLayers, referenceDraft]);
  const [calibrationPoints, setCalibrationPoints] = useState([])
  const [referenceCalibrationMode, setReferenceCalibrationMode] = useState(false);
  const [knownDistance, setKnownDistance] = useState(5)
  const [fitRequest, setFitRequest] = useState(0);
  const [designLoaded, setDesignLoaded] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const loadMetricsRef = useRef(null);
  if (loadMetricsRef.current === null) loadMetricsRef.current = createSceneLoadMetrics();
  const [loadDebug, setLoadDebug] = useState(null);
  const terrainCommitSeenRef = useRef(false);
  const pendingTerrainHydrationRef = useRef(false);
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
  const terrainTileStreamKeyRef = useRef(null);

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
    scatteringScale: 1.0,
    daylightSaturation: 1.12
  });

  const [weatherSettings, setWeatherSettings] = useState({
    activeWeather: 'clear',
    cloudCover: 0,
    fogDensity: 0.01,
    fogColor: '#a9c9dc',
    cloudType: 'fair-cumulus',
    cloudBaseFeet: 4200,
    cloudTopFeet: 7200,
    windDirectionDegrees: 245,
    windSpeedMph: 8,
    precipitationIntensity: 0
  });

  const [simulation, setSimulation] = useState({ time: { day: 1, hour: 12, minute: 0 }, routes: [] });
  const [travelContext, setTravelContext] = useState({ party_position: null, points_of_interest: [] });
  const [destination, setDestination] = useState(null)
  const [travelPlan, setTravelPlan] = useState(null);
  const [partySize, setPartySize] = useState(4);
  const [selectedTravelGroupId, setSelectedTravelGroupId] = useState('');
  const [selectedTravelMode, setSelectedTravelMode] = useState('walking');
  const [travelDestinationSearch, setTravelDestinationSearch] = useState('');
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
  const [blueprintOpenRequest, setBlueprintOpenRequest] = useState(null);
  const [blueprintEditorOpen, setBlueprintEditorOpen] = useState(false);
  const [accessPointBuildingId, setAccessPointBuildingId] = useState(null);
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
  const npcMap = useNpcMapTokens({headers,campaignId,settlementId:activeSettlementId});
  const npcTokens = npcMap.tokens;
  const [selectedNpcTokenId, setSelectedNpcTokenId] = useState(requestedNpcId);
  const [placingNpcId, setPlacingNpcId] = useState(requestedNpcId);
  const [npcPlacementError, setNpcPlacementError] = useState('');

  useEffect(() => {
    if (!requestedNpcId || !activeSettlementId || Number(activeSettlementId) !== Number(requestedSettlementId)) return;
    setSelectedNpcTokenId(requestedNpcId); setPlacingNpcId(requestedNpcId); setActiveTool('npcs');
  }, [activeSettlementId, requestedNpcId, requestedSettlementId]);

  const placeNpcToken = useCallback(async point => {
    if (!placingNpcId || !activeSettlementId) return;
    setNpcPlacementError('');
    const placement = npcMap.placements.find(item => Number(item.npc_id) === Number(placingNpcId));
    try {
      await axios.put(`/api/npcs/${placingNpcId}/map-placement`, {
        settlement_id: Number(activeSettlementId), x: Number(point.x), y: Number(point.y),
        elevation: Number(point.elevation) || 0, visible: true,
        ...(placement ? { expected_revision: placement.revision } : {}),
      }, { headers });
      setPlacingNpcId(null); await npcMap.refresh();
      window.dispatchEvent(new Event('npc-map-placements-changed'));
    } catch (requestError) {
      setNpcPlacementError(requestError.response?.data?.message || 'Could not place this NPC token.');
    }
  }, [activeSettlementId, headers, npcMap, placingNpcId]);

  const sessionApi = useSessionManagement(headers, socket);

  // The server rejects payloads above 2 MB, and most reverse proxies reject
  // even less. Long sculpt sessions dirty far more tiles than that, so dirty
  // tiles are streamed to the server in budget-sized chunks while the user
  // keeps drawing.
  const MAX_SAVE_BYTES = 1_500_000;    // stay well under the 2 MB server cap
  const SAVE_OVERHEAD_BYTES = 20_000;  // payload envelope + visual layers
  const MAX_TILES_PER_CHUNK = 60;      // server caps reference_layers at 100
  const estimateTileBytes = tile => ((tile?.values?.length || 0) * 12) + 256;

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
          ...chunkKeys.map(key => serializeTerrainTile(tileStoreRef.current.get(key))),
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
    if (terrainTileFetchTimerRef.current !== null) {
      window.clearTimeout(terrainTileFetchTimerRef.current);
      terrainTileFetchTimerRef.current = null;
    }
    terrainTileFetchControllerRef.current?.abort();
    terrainTileStreamKeyRef.current = null;
    setStoreDefaults(store, { seaLevelFeet: Number(map.environment?.sea_level_feet) || 0 });
    if (mapHeightMap) seedStoreFromHeightMap(store, mapHeightMap);
    hydrateTiles(store, map.reference_layers || []);
    setTileStoreVersion(v => v + 1);

    setBuildings(map.buildings || []);
    buildingMoveHistoryRef.current = [];
    setBuildingMoveUndoCount(0);
    setProperties(normalizePropertyCatalog(map.buildings || [], map.properties || []));
    setSelectedPropertyId(null);
    setNewStructurePropertyId(null);
    setPropertyDraft([]);
    setInspectSelection(null);
    setRoads(map.roads || []);
    setWaterBodies(map.water_bodies || []);
    setMapEnvironment(reconcileWallJunctions(map.environment || {
      sea_level_feet: 0,
      terrain_material: { snow_line_feet: 900, snow_blend_feet: 500, cliff_normal_threshold: .86 },
      regions: []
    }));

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
    setSelected(null);
    setActiveSettlementId(map.settlement_id);
    setSettlementName(map.name || 'New Settlement');

    setDesignLoaded(true);
    setSaveStatus('Saved');
    setAtmosphereSettings({
      sunIntensity: 2.2,
      moonIntensity: 0.15,
      scatteringScale: 1.0,
      daylightSaturation: 1.12,
      ...(map.environment?.atmosphere || {})
    });
    setWeatherSettings({
      activeWeather: 'clear',
      cloudCover: 0,
      fogDensity: 0.01,
      fogColor: '#a9c9dc',
      ...(map.environment?.weather || {})
    });
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
    setLoadDebug(loadMetricsRef.current.start());
    terrainCommitSeenRef.current = false;
    pendingTerrainHydrationRef.current = false;
    const fromAtlasZoom = options.fromAtlasZoom === true;
    const beginSceneLoad = () => {
      setActiveTool('inspect'); setActiveSettlementId(Number(settlementId)); setDesignLoaded(false); setMapLoading(true); setSaveStatus('Loading map…'); setSelected(null); setInspectSelection(null);
    };
    // Cross the Atlas threshold immediately. Prefetching normally makes the
    // data available already, but a slow request must not leave the user stuck
    // at 1000% zoom with no visible transition.
    beginSceneLoad();
    if (fromAtlasZoom) setAtlasStatus(`Preparing ${location?.name || 'settlement'} terrain…`);
    if (location?.name) setSettlementName(location.name);
    try {
      const map = await fetchSettlementMap(settlementId);
      setLoadDebug(loadMetricsRef.current.mark('mapResponse'));
      settlementMapCacheRef.current.delete(Number(settlementId));
      applyMap(map);
    } catch (error) {
      console.error('Unable to load settlement map:', error);
      setSaveStatus(error.response?.data?.message || 'Map load failed');
    } finally {
      setMapLoading(false);
    }
  }, [campaignId, applyMap, atlas.locations, fetchSettlementMap]);

  useEffect(() => {
    if (!requestedSettlementId || Number(activeSettlementId) === requestedSettlementId) return;
    if (!atlas.locations.some(location => location.id === requestedSettlementId)) return;
    openSettlement(requestedSettlementId);
  }, [activeSettlementId, atlas.locations, openSettlement, requestedSettlementId]);

  const handleSceneReady = useCallback(() => {
    setLoadDebug(loadMetricsRef.current.mark('sceneInitialized'));
    setSaveStatus('Scene initialized; loading terrain…');
  }, []);

  const handleFirstFrame = useCallback(() => {
    setLoadDebug(loadMetricsRef.current.mark('firstFrame'));
  }, []);

  const handleTerrainReady = useCallback(() => {
    terrainCommitSeenRef.current = true;
    pendingTerrainHydrationRef.current = false;
    const camera = referenceCameraRef.current;
    if (!camera || !designLoaded || !activeSettlementId) return;
    const cellFeet = activeTool === 'terrain' ? 16 : Math.max(1, Number(camera.window?.cellFeet) || 16);
    if (planTerrainTileBatches(camera, terrainTileCoverageRef.current, cellFeet).length) return;
    if (loadMetricsRef.current.snapshot().milestones.visibleTerrain !== undefined) return;
    const result = loadMetricsRef.current.mark('visibleTerrain');
    setLoadDebug(result);
    setSaveStatus(`Map ready in ${(result.milestones.visibleTerrain / 1000).toFixed(1)}s`);
  }, [activeSettlementId, activeTool, designLoaded]);

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
          axios.get(`/api/travel/${campaignId}/context`, { headers, params: { settlement_id: activeSettlementId } }),
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
    if (!campaignId || !activeSettlementId) return;
    axios.get(`/api/travel/${campaignId}/context`, { headers, params: { settlement_id: activeSettlementId } })
      .then(response => {
        setTravelContext(response.data);
        const groups = (response.data.groups || []).filter(group => group.members?.length);
        setSelectedTravelGroupId(value => groups.some(group => group.id === value) ? value : (groups[0]?.id || ''));
      })
      .catch(error => console.error('Unable to load settlement destinations:', error));
  }, [campaignId, activeSettlementId, headers]);

  useEffect(() => {
    if (selectedTravelGroupId) return;
    const group = sessionApi.snapshot?.document?.groups?.find(item => item.members?.length);
    if (group) setSelectedTravelGroupId(group.id);
  }, [selectedTravelGroupId, sessionApi.snapshot]);

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


  const lamps = useMemo(() => settlementLamps(simulation, activeSettlementId), [simulation, activeSettlementId]);

  const calculateTravel = async (nextDestination = destination) => {
    if (!campaignId || !nextDestination) return;
    const payload = nextDestination.key
      ? { settlement_id: activeSettlementId, destination_key: nextDestination.key, group_id: selectedTravelGroupId || undefined, party_size: partySize }
      : { settlement_id: activeSettlementId, destination: nextDestination, group_id: selectedTravelGroupId || undefined, party_size: partySize };
    const response = await axios.post(`/api/travel/${campaignId}/calculate`, payload, { headers });
    setTravelPlan(response.data);
    const first = response.data.options?.find(option => option.available);
    if (first) setSelectedTravelMode(first.mode);
  };

  const chooseDestination = useCallback((next) => {
    setDestination(next);
    setTravelPlan(null);
  }, []);

  const setPartyHere = async () => {
    if (!destination) return;
    const group = sessionApi.snapshot?.document?.groups?.find(item => item.id === selectedTravelGroupId);
    if (group) {
      const ok = await sessionApi.command('group', { id:group.id, name:group.name, members:group.members,
        location:destination, relocate:true });
      if (ok) { setDestination(null); setTravelPlan(null); }
      return;
    }
    const response = await axios.patch(`/api/travel/${campaignId}/party-position`, destination, { headers });
    setTravelContext((value) => ({ ...value, party_position: response.data }));
    setDestination(null); setTravelPlan(null);
  };

  const startPlannedJourney = async () => {
    const option = travelPlan?.options?.find(item => item.mode === selectedTravelMode && item.available);
    if (!option || !selectedTravelGroupId || !destination) return;
    const ok = await sessionApi.command('journey', { group_id: selectedTravelGroupId, route_request: {
      settlement_id: travelPlan.settlement_id, destination_key: destination.key,
      destination: destination.key ? undefined : destination, mode: selectedTravelMode,
      map_revision: travelPlan.map_revision, party_size: partySize
    } });
    if (ok) {
      setTravelPlan(null); setDestination(null);
      const response = await axios.get(`/api/travel/${campaignId}/context`, { headers, params: { settlement_id: activeSettlementId } });
      setTravelContext(response.data);
    }
  };

  const selectedReference = referenceLayers.find(layer => layer.id === selectedReferenceId) || referenceLayers[0];

  const updateReference = (id, updater) => setReferenceLayers(values => values.map(layer => layer.id === id ? updater(layer) : layer));

  const recordCalibrationPoint = useCallback((point) => {
    setCalibrationPoints(values => [...(values.length >= 2 ? [] : values), { x: Math.round(point.x), y: Math.round(point.y) }]);
  }, []);

  const moveTravelAccess = useCallback((point) => {
    if (!accessPointBuildingId) return;
    setBuildings(values => values.map(building => building.id === accessPointBuildingId ? {
      ...building, travel_access_points: [{ id:`travel-access-${building.id}`, label:'Primary entrance',
        x:Math.round(point.x), y:Math.round(point.y), elevation:Number(point.elevation) || 0 }]
    } : building));
  }, [accessPointBuildingId]);

  const finishTravelAccess = useCallback(() => {
    setAccessPointBuildingId(null);
    setActiveTool('build');
  }, []);

  // 2. Wrap the onWaypoint inline function
  const handleWaypoint = useCallback((point) => {
    if (accessPointBuildingId) {
      moveTravelAccess(point);
      finishTravelAccess();
      return;
    }
    chooseDestination({
      ...point,
      map_key: atlas.locations.find(location => location.id === activeSettlementId)?.map_key || 'settlement',
      name: 'Map waypoint',
      road_access: true,
      water_access: point.x > 500
    });
  }, [accessPointBuildingId, moveTravelAccess, finishTravelAccess, chooseDestination, atlas.locations, activeSettlementId]);

  const scheduleTerrainTileFetch = useCallback((camera) => {
    const bounds = camera?.terrainBounds;
    if (!designLoaded || !campaignId || !activeSettlementId || !bounds) return;
    const renderCellFeet = Math.max(1, Number(camera.window?.cellFeet) || 16);
    const requestedCellFeet = activeTool === 'terrain' ? 16 : renderCellFeet;
    const key = terrainTileStreamKey(camera, requestedCellFeet, activeSettlementId);
    if (key === terrainTileStreamKeyRef.current) return;
    terrainTileStreamKeyRef.current = key;
    if (terrainTileFetchTimerRef.current !== null) window.clearTimeout(terrainTileFetchTimerRef.current);
    terrainTileFetchControllerRef.current?.abort();
    terrainTileFetchTimerRef.current = window.setTimeout(async () => {
      terrainTileFetchTimerRef.current = null;
      const batches = planTerrainTileBatches(camera, terrainTileCoverageRef.current, requestedCellFeet);
      if (!batches.length) { terrainTileStreamKeyRef.current = null; return; }
      const trackInitialLoad = loadMetricsRef.current.snapshot().milestones.visibleTerrain === undefined;
      const controller = new AbortController();
      terrainTileFetchControllerRef.current = controller;
      let completedBatches = 0;
      try {
        await streamTerrainTileBatches(batches, terrainTileCoverageRef.current, controller.signal,
          async (batch, signal) => {
            const requestedAt = performance.now();
            const response = await axios.get(`/api/settlement-map/${campaignId}/terrain-tiles`, {
              headers, signal, params: { settlement_id: activeSettlementId,
                min_x: batch.min_x, max_x: batch.max_x, min_z: batch.min_z,
                max_z: batch.max_z, cell_feet: batch.cell_feet },
            });
            if (trackInitialLoad) {
              setLoadDebug(loadMetricsRef.current.recordTileRequest(performance.now() - requestedAt));
            }
            return response.data.tiles || [];
          }, tiles => {
            const safeTiles = tiles.filter(
              tile => !dirtyTileKeysRef.current.has(tileKey(Number(tile.tile_x), Number(tile.tile_z)))
            );
            if (safeTiles.length) {
              pendingTerrainHydrationRef.current = true;
              hydrateTiles(tileStoreRef.current, safeTiles);
              setTileStoreVersion(value => value + 1);
            }
            completedBatches += 1;
            if (trackInitialLoad) {
              if (completedBatches === 1) setLoadDebug(loadMetricsRef.current.mark('nearbyTerrain'));
              setSaveStatus(`Terrain ${completedBatches}/${batches.length} batches…`);
            }
          }
        );
        if (!controller.signal.aborted) {
          if (trackInitialLoad) {
            setLoadDebug(loadMetricsRef.current.mark('terrainData'));
            setSaveStatus('Finishing terrain…');
            if (terrainCommitSeenRef.current && !pendingTerrainHydrationRef.current) handleTerrainReady();
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) console.error('Unable to stream terrain tiles:', error);
      } finally {
        if (terrainTileFetchControllerRef.current === controller) {
          terrainTileFetchControllerRef.current = null;
          terrainTileStreamKeyRef.current = null;
        }
      }
    }, 120);
  }, [activeSettlementId, activeTool, campaignId, designLoaded, handleTerrainReady, headers]);

  useEffect(() => {
    if (referenceCameraRef.current) scheduleTerrainTileFetch(referenceCameraRef.current);
  }, [scheduleTerrainTileFetch]);

  useEffect(() => () => {
    if (terrainTileFetchTimerRef.current !== null) window.clearTimeout(terrainTileFetchTimerRef.current);
    terrainTileFetchControllerRef.current?.abort();
    terrainTileStreamKeyRef.current = null;
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
    if (!referenceDraft || calibrationPoints.length !== 2 || knownDistance <= 0) return;
    setReferenceDraft(layer => calibrateReferenceLayer(layer, calibrationPoints[0], calibrationPoints[1], knownDistance));
    setCalibrationPoints([]);
    setReferenceCalibrationMode(false);
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

  const selectedBuilding = buildings.find(building => String(building.id) === String(selected?.id)) || null;
  const selectedProperty = effectiveProperties.find(property => property.id === selectedPropertyId)
    || effectiveProperties.find(property => (property.structure_ids || []).some(id => String(id) === String(selectedBuilding?.id)))
    || null;
  const updateSelectedProperty = updater => {
    if (!selectedProperty) return;
    setProperties(values => normalizePropertyCatalog(buildings, values).map(property =>
      property.id === selectedProperty.id ? updater(property) : property));
  };
  const focusPropertyBoundary = (property = selectedProperty) => {
    const boundary = property?.boundary?.vertices || [];
    const areas = (property?.outdoor_areas || []).flatMap(area => area.polygon || []);
    const structures = buildings.filter(building => (property?.structure_ids || []).some(id => String(id) === String(building.id))).map(building => ({ x: Number(building.x) || 0, y: Number(building.y) || 0 }));
    const vertices = boundary.length ? boundary : areas.length ? areas : structures;
    if (!vertices.length) return;
    const xs = vertices.map(point => point.x), ys = vertices.map(point => point.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    window.dispatchEvent(new CustomEvent('settlement-camera-command-trigger', { detail: {
      mode: 'point', point: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, radiusFeet: Math.max(100, Math.max(maxX - minX, maxY - minY) * 2.5), topdown: true,
    } }));
  };
  const startPropertyBoundaryEdit = () => {
    if (!selectedProperty?.boundary) return;
    setPropertyDraft(selectedProperty.boundary.vertices.map(point => ({ ...point })));
    setEditingPropertyBoundaryId(selectedProperty.id);
    focusPropertyBoundary();
    setBuildMode('edit-property-boundary');
    setPropertyEditError('');
  };
  const updateBoundarySegment = updater => updateSelectedProperty(property => ({
    ...property,
    boundary: { ...property.boundary, segments: property.boundary.segments.map((segment, index) =>
      index === selectedBoundarySegment ? updater(segment) : segment) },
  }));
  const updateBoundaryOpening = (opening, changes) => {
    const next = { ...opening, ...changes };
    const error = validateBoundaryOpening(selectedProperty.boundary, selectedBoundarySegment, next, opening.id);
    if (error) { setPropertyEditError(error); return; }
    setPropertyEditError('');
    updateBoundarySegment(segment => ({ ...segment, openings: (segment.openings || []).map(item =>
      item.id === opening.id ? next : item) }));
  };
  const selectPropertyBoundaryElement = ({ propertyId, segmentId, openingId, point }) => {
    const property = effectiveProperties.find(item => item.id === propertyId);
    if (!property?.boundary) return;
    const segmentIndex = property.boundary.segments.findIndex(segment => segment.id === segmentId);
    if (segmentIndex < 0) return;
    setSelected(null);
    setSelectedPropertyId(propertyId);
    setSelectedBoundarySegment(segmentIndex);
    setSelectedBoundaryOpeningId(openingId || (movingBoundaryOpening ? selectedBoundaryOpeningId : null));
    setBuildMode('select-placed');
    if (movingBoundaryOpening && selectedBoundaryOpeningId && point) {
      const moved = moveBoundaryOpening(property.boundary, selectedBoundaryOpeningId, point);
      if (moved.error) setPropertyEditError(moved.error);
      else {
        setProperties(values => normalizePropertyCatalog(buildings, values).map(item => item.id === propertyId
          ? { ...item, boundary: moved.boundary }
          : item));
        setSelectedBoundarySegment(moved.segmentIndex);
        setPropertyEditError('');
        setMovingBoundaryOpening(false);
      }
    }
  };
  const moveSelectedBoundaryOpening = (point, context = {}) => {
    const property = effectiveProperties.find(item => item.id === context.propertyId) || selectedProperty;
    const openingId = context.openingId || selectedBoundaryOpeningId;
    if (!property?.boundary || !openingId) return;
    const moved = moveBoundaryOpening(property.boundary, openingId, point);
    if (moved.error) { setPropertyEditError(moved.error); return; }
    setProperties(values => normalizePropertyCatalog(buildings, values).map(item => item.id === property.id
      ? { ...item, boundary: moved.boundary }
      : item));
    setSelectedPropertyId(property.id);
    setSelectedBoundaryOpeningId(openingId);
    setSelectedBoundarySegment(moved.segmentIndex);
    setPropertyEditError('');
  };
  const finishPropertyPolygon = () => {
    if (!selectedProperty || propertyDraft.length < 3) return;
    if (buildMode === 'edit-property-boundary') {
      const boundary = { ...selectedProperty.boundary, vertices: propertyDraft };
      for (let index = 0; index < boundary.segments.length; index += 1) {
        for (const opening of boundary.segments[index].openings || []) {
          const error = validateBoundaryOpening(boundary, index, opening, opening.id);
          if (error) { setPropertyEditError(error); return; }
        }
      }
      updateSelectedProperty(property => ({ ...property, boundary: { ...property.boundary, vertices: propertyDraft } }));
    } else if (buildMode === 'draw-property-boundary') {
      updateSelectedProperty(property => ({ ...property, boundary: createBoundary(propertyDraft, property.id) }));
    } else if (buildMode === 'draw-outdoor-area') {
      updateSelectedProperty(property => ({ ...property, outdoor_areas: [
        ...(property.outdoor_areas || []), createOutdoorArea(property.id, propertyDraft, outdoorTypeDraft),
      ] }));
    }
    setPropertyDraft([]);
    setEditingPropertyBoundaryId(null);
    setBuildMode('select-placed');
  };
  const selectedBuildingId = selectedBuilding?.id;
  const selectedIsBlueprint = selectedBuilding?.is_blueprint;

  useEffect(() => {
    if (!selectedIsBlueprint) return;
    setBuildings(values => values.map(building => building.id === selectedBuildingId &&
      (building.level_view !== 'all' || building.show_roofs !== false)
      ? { ...building, level_view: 'all', show_roofs: false }
      : building));
  }, [selectedBuildingId, selectedIsBlueprint]);
  const selectedAsset = assets.find(asset => asset.key === selectedBuilding?.asset_key);
  const selectedRoad = roads.find(road => road.id === selectedBuilding?.front_road_id);
  const mapViewLegend = useMemo(
    () => buildingViewLegend(buildings, assets, buildingViewMode, economy.businesses),
    [assets, buildings, buildingViewMode, economy.businesses]
  );

  useEffect(() => {
    if (inspectSelection?.entityKind !== 'building') return;
    const building = buildings.find(item => String(item.id) === String(inspectSelection.id));
    if (!building) {
      setInspectSelection(null);
      setSelected(current => String(current?.id) === String(inspectSelection.id) ? null : current);
      return;
    }
    if (inspectSelection.item !== building) {
      setInspectSelection(current => current?.entityKind === 'building'
        ? { ...current, item: building, name: building.name || 'Unnamed Structure' }
        : current);
    }
  }, [buildings, inspectSelection]);

  const deleteBuildingById = useCallback((buildingId) => {
    if (buildingId == null) return;
    setBuildings(values => values.filter(building => building.id !== buildingId));
    setProperties(values => removeStructureFromProperties(values, buildingId));
    setSelected(current => current?.id === buildingId ? null : current);
    setInspectSelection(current => String(current?.id) === String(buildingId) ? null : current);
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

  const resizeSelectedBlueprint = (width, depth) => {
    if (!selectedBuilding?.is_blueprint) return;
    updateSelectedBuilding(building => resizeBlueprintFootprint(building, width, depth));
  };

  const openBuildingEditor = () => {
    if (selectedBuilding) setBuildingEditDraft(
      { ...selectedBuilding, factions: Array.isArray(selectedBuilding.factions) ? selectedBuilding.factions.join(', ') : (selectedBuilding.factions || ''), tags: Array.isArray(selectedBuilding.tags) ? selectedBuilding.tags.join(', ') : (selectedBuilding.tags || '') }
    );
  };

  const saveBuildingEditor = () => {
    if (!buildingEditDraft) return;
    if (Boolean(buildingEditDraft.opens_at) !== Boolean(buildingEditDraft.closes_at)) return;
    const asset = assets.find(item => item.key === buildingEditDraft.asset_key);
    setBuildings(values => values.map(building => building.id === buildingEditDraft.id
      ? { ...building, ...buildingEditDraft,
        factions: String(buildingEditDraft.factions || '').split(',').map(value => value.trim()).filter(Boolean),
        tags: String(buildingEditDraft.tags || '').split(',').map(value => value.trim()).filter(Boolean),
        rooms: buildingEditDraft.asset_key !== building.asset_key ? asset?.rooms || building.rooms : building.rooms }
      : building));
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

  const searchableLocations = useMemo(() => settlementSearchLocations({ buildings, properties: effectiveProperties, points: travelContext.points_of_interest, businesses: economy.businesses, assets, mapKey: activeMapKey }), [buildings, effectiveProperties, travelContext.points_of_interest, economy.businesses, assets, activeMapKey]);

  const locationResults = useMemo(() => searchSettlementLocations(searchableLocations, locationSearch), [searchableLocations, locationSearch]);

  const selectedLocation = searchableLocations.find(location => location.id === selectedLocationId) || null;

  const selectLocation = location => {
    setSelectedLocationId(location.id);
    if (location.kind === 'property') {
      setSelected(null);
      setSelectedPropertyId(location.source.id);
      setManageCatalog('properties');
      setBuildMode('select-placed');
      setActiveTool('build');
      if (location.point) focusPropertyBoundary(location.source);
    }
    if (location.kind === 'building') {
      if (location.sourceProperty) setSelectedPropertyId(location.sourceProperty.id);
      setSelected(location.source);
      setInspectSelection({ entityKind: 'building', id: location.source.id, item: location.source, kind: 'Building', name: location.title });
    }
    if (location.kind === 'room') {
      setSelected(location.sourceBuilding);
      setBuildMode('select-placed');
      setActiveTool('build');
    }
    if (location.kind === 'outdoor_area') {
      setSelectedPropertyId(location.sourceProperty.id);
      setBuildMode('select-placed');
      setActiveTool('build');
    }
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
        properties: effectiveProperties,
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
          tileLayers.push(serializeTerrainTile(tile));
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
          setSaveStatus(error.response?.data?.message || 'Save failed');
        }
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [designLoaded, referenceLayers, campaignId, activeSettlementId, headers, heightMap, roads, buildings, effectiveProperties, waterBodies, mapEnvironment, atmosphereSettings, weatherSettings, runSerializedSave, flushChunkNow, tileStoreVersion]);

  return (
    <Box className="settlement-sim" sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Clean, Fixed Material UI Global Administration Header */}
      <AppBar position="static" sx={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border-main)", boxShadow: 'none' }}>
        <Toolbar sx={{ justifyContent: 'space-between', minHeight: '64px', px: 2, gap: 2 }}>

          {/* Settlement Branding & Interactive Text Mutation Form */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton
              onClick={() => window.location.assign(mainEnvironmentUrl)}
              title="Return to Kachhapa"
              aria-label="Return to Kachhapa"
              sx={{ color: "var(--text-main)", border: "1px solid var(--border-main)", borderRadius: '6px', '&:hover': { backgroundColor: "var(--accent)", color: "var(--text-on-accent)" } }}
            >
              <ExitToAppIcon />
            </IconButton>

            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography variant="caption" sx={{ color: "var(--text-subtle)", fontSize: '9px', fontWeight: 700, letterSpacing: '0.04em' }}>
                SETTLEMENT SIMULATOR
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
                  '& .MuiInputBase-input': { color: "var(--text-main)", fontWeight: 'bold', fontSize: '16px', py: 0.2 },
                  '& .MuiInput-underline:before': { borderBottom: 'none' },
                  '& .MuiInput-underline:hover:not(.Mui-disabled):before': { borderBottom: "1px solid var(--border-main)" },
                  '& .MuiInput-underline:after': { borderBottomColor: "var(--border-main)" }
                }}
              />
              <Typography variant="caption" sx={{ color: saveStatus === 'Save failed' ? "var(--danger)" : "var(--text-main)", fontSize: '10px' }}>
                {saveStatus}
              </Typography>
            </Box>
          </Box>

          {/* Dynamic Simulation Clock Matrix */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '100px' }}>
            <Typography variant="body2" sx={{ color: "var(--text-main)", fontWeight: 'bold', letterSpacing: '0.05em' }}>
              {String(simulation.time?.hour ?? 12).padStart(2, '0')}:{String(simulation.time?.minute ?? 0).padStart(2, '0')}
            </Typography>
            <Typography variant="body2" sx={{ color: "var(--text-main)", fontWeight: 800, mt: 0.2 }}>
              {simulation.time?.month_name && simulation.time?.day != null
                ? `${simulation.time.month_name} ${simulation.time.day}`
                : '—'}
              <SettlementMoonPhase celestial={simulation.celestial} />
            </Typography>
          </Box>

          {/* Global Control Action Overlays & Steps Timers */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<OpenInNewIcon />}
              onClick={openPlayerView}
              sx={{ backgroundColor: "var(--bg-surface-2)", color: "var(--text-main)", textTransform: 'none', border: "1px solid var(--border-main)", '&:hover': { backgroundColor: "var(--accent)", color: "var(--text-on-accent)" } }}
            >
              Player View
            </Button>

            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <FormControlLabel
                control={<Checkbox size="small" checked={playerFollow} onChange={event => setPlayerFollow(event.target.checked)} sx={{ color: "var(--text-main)", '&.Mui-checked': { color: "var(--text-main)" } }} />}
                label={<Typography variant="caption" sx={{ color: "var(--text-main)", userSelect: 'none' }}>Follow DM</Typography>}
                title="Continuously mirror this camera in Player View"
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={showAllPlayerLabels} onChange={event => { const visible = event.target.checked; setShowAllPlayerLabels(visible); sendPlayerCommand('labels_all', { visible }); }} sx={{ color: "var(--text-main)", '&.Mui-checked': { color: "var(--text-main)" } }} />}
                label={<Typography variant="caption" sx={{ color: "var(--text-main)", userSelect: 'none' }}>All Labels</Typography>}
                title="Identify every building in Player View"
              />
            </Box>

            {/* Time Advancement Button Controls Groups */}
            <ButtonGroup size="small" variant="contained" sx={{ backgroundColor: "var(--bg-surface-2)", border: "1px solid var(--border-main)" }}>
              <Button onClick={() => advanceTime(-60)} sx={{ color: "var(--text-main)", backgroundColor: "var(--bg-surface-2)", minWidth: '40px' }}>-1h</Button>
              <Button onClick={() => setRunning(v => !v)} sx={{ color: "var(--text-main)", backgroundColor: "var(--bg-surface-2)", fontWeight: 'bold', minWidth: '40px' }}>
                {running ? 'Ⅱ' : '▶'}
              </Button>
              {[1, 2, 4].map(v => (
                <Button
                  key={v}
                  onClick={() => setSpeed(v)}
                  sx={{
                    color: speed === v ? "var(--danger)" : "var(--text-main)",
                    backgroundColor: speed === v ? "var(--bg-surface)" : "var(--bg-surface-2)",
                    fontWeight: speed === v ? 'bold' : 'normal'
                  }}
                >
                  {v}×
                </Button>
              ))}
              <Button onClick={() => advanceTime(60)} sx={{ color: "var(--text-main)", backgroundColor: "var(--bg-surface-2)", minWidth: '40px' }}>+1h</Button>
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
              { tool: 'npcs', icon: <PersonPinCircleIcon />, title: 'NPC Tokens', checkLoaded: true },
              { tool: 'terrain', icon: <TerrainIcon />, title: 'Terrain', checkLoaded: true },
              { tool: 'travel', icon: <NavigationIcon />, title: 'Travel', checkLoaded: true },
              { tool: 'economy', icon: <TrendingUpIcon />, title: 'Economy', checkLoaded: true },
              { tool: 'weather', icon: <ThunderstormIcon />, title: 'Weather Systems', checkLoaded: true },
              { tool: 'time', icon: <ScheduleIcon />, title: 'Time of Day', checkLoaded: true }
            ].map(item => (
              <Tooltip key={item.tool} title={item.title} placement="right" arrow>
                <span>
                  <IconButton
                    aria-label={item.title}
                    disabled={item.checkLoaded && !designLoaded}
                    onClick={() => setActiveTool(item.tool)}
                    sx={{
                      color: activeTool === item.tool ? "var(--danger)" : "var(--text-main)",
                      backgroundColor: activeTool === item.tool ? "var(--bg-surface)" : "var(--bg-surface-2)",
                      border: '1px solid',
                      borderColor: activeTool === item.tool ? "var(--primary-border)" : "var(--border-main)",
                      borderRadius: '6px',
                      width: '36px',
                      height: '36px',
                      '&.Mui-disabled': { opacity: 0.3, color: "var(--text-main)" },
                      '&:hover': { backgroundColor: "var(--bg-surface)", borderColor: "var(--primary-border)" }
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
              npcTokens={npcTokens}
              placementNpcId={placingNpcId}
              selectedNpcTokenId={selectedNpcTokenId}
              onNpcPlacementPoint={placeNpcToken}
              onNpcSelect={npcId => { setSelectedNpcTokenId(Number(npcId)); setPlacingNpcId(null); }}
              pauseScene={blueprintEditorOpen}
              tileStore={tileStoreRef.current}
              onTilesDirtied={handleTilesDirtied}
              tileStoreVersion={tileStoreVersion}
              activeTool={activeTool}
              buildMode={buildMode}
              setBuildMode={setBuildMode}
              blueprintDraft={blueprintDraft}
              setBlueprintDraft={setBlueprintDraft}
              properties={effectiveProperties}
              propertyDraft={propertyDraft}
              editingPropertyBoundaryId={editingPropertyBoundaryId}
              onPropertyBoundaryVertexMove={(index, point) => setPropertyDraft(values => values.map((vertex, vertexIndex) => vertexIndex === index ? { x: point.x, y: point.y } : vertex))}
              onPropertyPolygonPoint={point => setPropertyDraft(values => [...values, { x: point.x, y: point.y }])}
              onPropertyBoundarySelect={selectPropertyBoundaryElement}
              onPropertyBoundaryOpeningMove={moveSelectedBoundaryOpening}
              selectedBoundaryOpeningId={selectedBoundaryOpeningId}
              selectedBoundarySegmentId={selectedProperty?.boundary?.segments?.[selectedBoundarySegment]?.id || null}
              movingBoundaryOpening={movingBoundaryOpening}
              blueprintHoverPoint={blueprintHoverPoint}
              footprintTool={footprintTool}
              footprintPoints={footprintPoints}
              setFootprintPoints={setFootprintPoints}
              setFootprintError={setFootprintError}
              setBlueprintHoverPoint={setBlueprintHoverPoint}
              atmosphereSettings={atmosphereSettings}
              setAtmosphereSettings={setAtmosphereSettings}
              weatherSettings={weatherSettings}
              setWeatherSettings={setWeatherSettings}
              assets={assets}
              buildings={buildings}
              setBuildings={setBuildings}
              recordBuildingMove={recordBuildingMove}
              simulation={simulation}

              selected={selectedBuilding}
              setSelected={setSelected}
              inspectSelection={inspectSelection}
              setInspectSelection={setInspectSelection}
              viewCommand={activeViewCommand}

              buildingViewMode={buildingViewMode}
              businesses={economy.businesses}
              onManageInspectedBuilding={() => {
                if (inspectSelection?.entityKind !== 'building') return;
                setSelected(inspectSelection.item);
                setBuildMode('select-placed');
                setActiveTool('build');
              }}
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
              destination={accessPointBuildingId
                ? (buildings.find(building => building.id === accessPointBuildingId)?.travel_access_points?.[0]
                  || (travelContext.destinations || []).find(item => item.key === `${activeSettlementId}:structure:${accessPointBuildingId}`))
                : destination}
              plannedRoute={travelPlan?.options?.find(option => option.mode === selectedTravelMode && option.available)?.route || null}
              journeyPositions={(sessionApi.snapshot?.document?.journeys || []).filter(journey => journey.status === 'travelling' && journey.current_position)}
              accessPointBuildingId={accessPointBuildingId}
              onTravelAccessMove={moveTravelAccess}
              onTravelAccessEnd={finishTravelAccess}
              referenceLayers={displayedReferenceLayers}
              referencePlacement={activeTool === 'reference' ? referenceDraft : null}
              referenceCalibrationMode={referenceCalibrationMode}
              setReferencePlacement={setReferenceDraft}
              onWaypoint={handleWaypoint}
              onReferencePoint={recordCalibrationPoint}
              onCameraChange={handleCameraChange}
              saveStatus={saveStatus}
              calibrationPoints={calibrationPoints}
              fitRequest={fitRequest}
              pointsOfInterest={travelContext.points_of_interest}
              campaignName={headers?.campaignName || headers?.CampaignName || ''}
              onMapContext={setMapContext}
              onSceneReady={handleSceneReady}
              onFirstFrame={handleFirstFrame}
              onTerrainReady={handleTerrainReady}
              loadDebug={loadDebug}
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
                backgroundColor: "var(--overlay)",
                border: "1px solid var(--primary-border)",
                borderRadius: '8px',
                padding: '24px',
                textAlign: 'center',
                boxShadow: "0 8px 32px var(--border-main)",
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1.5,
                maxWidth: '360px',
                zIndex: 1000
              }}
            >
              <Typography variant="h6" sx={{ color: "var(--danger)", fontWeight: 'bold' }}>
                {saveStatus}
              </Typography>
              <Typography variant="body2" sx={{ color: "var(--text-main)", fontSize: '0.9rem', lineHeight: 1.4 }}>
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
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-main)",
                borderRadius: '20px',
                padding: '6px 16px',
                color: "var(--text-main)",
                fontSize: '0.8rem',
                fontWeight: 500,
                letterSpacing: '0.02em',
                boxShadow: "0 4px 12px var(--border-main)",
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
              {activeTool === 'npcs' && (placingNpcId ? 'Click terrain to place the selected NPC token' : 'Choose an NPC in the token panel, or select a token on the map')}
              {activeTool === 'inspect' && firstPerson && 'WASD walk · Left Shift sprint · Mouse aim · Esc or M releases cursor'}
              {activeTool === 'inspect' && !firstPerson && 'WASD pan · Q/E orbit · R/F pitch · Left Shift/Ctrl elevation · Wheel/pinch zoom'}
              {activeTool !== 'travel' && activeTool !== 'build' && activeTool !== 'npcs' && activeTool !== 'terrain' && activeTool !== 'road' && activeTool !== 'fortification' && activeTool !== 'water' && activeTool !== 'region' && activeTool !== 'inspect' && 'WASD pan · Q/E orbit · R/F pitch · Wheel/pinch zoom'}
            </Box>
          )}

          {activeTool === 'inspect' && designLoaded && (
            <Box
              className="map-view-mode"
              sx={{
                position: 'absolute',
                top: '18px',
                right: '320px',
                backgroundColor: "var(--overlay)",
                border: "1px solid var(--border-main)",
                borderRadius: '6px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                zIndex: 45,
                boxShadow: "0 4px 12px var(--border-main)"
              }}
            >
              <Typography variant="caption" sx={{ color: "var(--text-muted)", fontWeight: 'bold', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px' }}>
                Map View:
              </Typography>
              <FormControl size="small">
                <Select
                  value={buildingViewMode}
                  onChange={event => setBuildingViewMode(event.target.value)}
                  sx={{
                    height: '28px',
                    fontSize: '12px',
                    backgroundColor: "var(--bg-surface-2)",
                    color: "var(--text-main)",
                    minWidth: '130px',
                    '.MuiOutlinedInput-notchedOutline': { borderColor: "var(--border-main)" },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: "var(--border-main)" },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: "var(--border-main)" }
                  }}
                >
                  <MenuItem value="satellite" sx={{ fontSize: '12px' }}>Satellite</MenuItem>
                  <MenuItem value="building-type" sx={{ fontSize: '12px' }}>Building Type</MenuItem>
                  <MenuItem value="useful" sx={{ fontSize: '12px' }}>Useful Buildings</MenuItem>
                  <MenuItem value="districts" sx={{ fontSize: '12px' }}>Districts</MenuItem>
                </Select>
              </FormControl>
              {mapViewLegend.length > 0 && (
                <Box className="map-view-legend" role="region" aria-label={`${buildingViewMode} map legend`}>
                  {mapViewLegend.map(entry => (
                    <span key={entry.label}>
                      <i style={{ backgroundColor: entry.color }} />
                      {entry.label}
                    </span>
                  ))}
                </Box>
              )}
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
            <Box className="world-atlas" sx={{ display: 'flex', width: '100%', height: 'calc(100vh - 64px)', background: "var(--bg-app)" }}>

              {/* LEFT SIDE: OVERWORLD VIEWPORT STAGE */}
              <Box className="atlas-stage" sx={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 2, position: 'relative' }}>
                <Box className="atlas-heading" sx={{ mb: 2 }}>
                  <Typography variant="caption" sx={{ color: "var(--text-subtle)", fontWeight: 800, letterSpacing: '.13em' }}>
                    WORLD ATLAS
                  </Typography>
                  <Typography variant="h5" sx={{ color: "var(--text-main)", fontWeight: 700, mt: -0.5 }}>
                    {atlas.atlas?.name || 'Campaign World'}
                  </Typography>
                </Box>

                {/* Interactive Overworld Canvas Render Host */}
                <Box sx={{ flex: 1, borderRadius: '8px', border: "1px solid var(--border-main)", background: "var(--bg-app)" }}>
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

                <Typography variant="caption" className="atlas-help" sx={{ mt: 1, color: "var(--text-subtle)", fontStyle: 'italic' }}>
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
                  borderLeft: "1px solid var(--border-main)",
                  background: "var(--overlay)",
                  padding: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  overflowY: 'auto'
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Typography variant="subtitle2" sx={{ color: "var(--text-muted)", fontWeight: 800, letterSpacing: '.06em' }}>
                    SETTLEMENTS DIRECTORY
                  </Typography>
                  <Typography variant="h6" sx={{ color: "var(--danger)", fontWeight: 'bold', fontSize: '1.1rem' }}>
                    {atlas.locations.length}
                  </Typography>
                </Box>

                {/* 1. MAP IMAGE ASSET MANAGEMENT UPLOAD SLOTS */}
                {(!atlas.atlas?.image_url || showAtlasUpload) ? (
                  <Box
                    component="form"
                    onSubmit={async event => { await uploadAtlasImage(event); setShowAtlasUpload(false); }}
                    sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, background: "var(--bg-app)", p: 1.5, borderRadius: '4px', border: "1px solid var(--border-main)" }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: "var(--text-main)" }}>Overworld Atlas Canvas Map</Typography>
                    <Button variant="contained" component="label" size="small" fullWidth sx={{ backgroundColor: "var(--bg-surface-2)" }}>
                      Choose File Asset
                      <input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={event => setAtlasUpload(value => ({ ...value, file: event.target.files?.[0] || null }))} />
                    </Button>
                    <TextField
                      placeholder="Attribution or cartographer source notes..."
                      size="small"
                      fullWidth
                      value={atlasUpload.attribution}
                      onChange={event => setAtlasUpload(value => ({ ...value, attribution: event.target.value }))}
                      sx={{ input: { fontSize: '11px', color: "var(--text-main)" } }}
                    />
                    <Button type="submit" variant="contained" size="small" disabled={!atlasUpload.file} sx={{ backgroundColor: "var(--accent)", color: "var(--text-on-accent)", fontWeight: 'bold' }}>
                      Store Overworld Atlas
                    </Button>
                  </Box>
                ) : (
                  <Button variant="outlined" size="small" onClick={() => setShowAtlasUpload(true)} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none' }}>
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
                    sx={{ input: { fontSize: '12px', color: "var(--text-main)" } }}
                  />
                  <Button type="submit" variant="contained" size="small" sx={{ backgroundColor: "var(--bg-surface-2)", color: "var(--text-main)", minWidth: '40px', padding: 0 }}>
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
                          backgroundColor: isActive ? "var(--bg-surface-2)" : "var(--bg-surface)",
                          border: '1px solid',
                          borderColor: isActive ? "var(--primary-border)" : isDestroyed ? "var(--border-main)" : "var(--border-main)",
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
                              '&:hover h6': { color: "var(--danger)" }
                            }}
                          >
                            <Typography variant="subtitle2" sx={{ color: isDestroyed ? "var(--danger)" : "var(--text-main)", fontWeight: 600, fontSize: '13px' }}>
                              {location.name}{isDestroyed ? ' (Ruined & Destroyed)' : ''}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'block', mt: 0.2 }}>
                              {location.atlas_x == null ? 'Not placed on Overworld' : `${Math.round(location.atlas_x * 100)}%, ${Math.round(location.atlas_y * 100)}%`} · {location.settlement_type || 'settlement'}
                            </Typography>
                          </Box>

                          <Divider sx={{ borderColor: "var(--border-main)" }} />

                          {/* Micro Action Button Ribbon */}
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 0.5 }}>
                            <Button
                              size="small"
                              variant={movingAtlasId === location.id ? 'contained' : 'outlined'}
                              onClick={() => movingAtlasId === location.id ? applyAtlasMove(location) : beginAtlasMove(location)}
                              disabled={movingAtlasId === location.id && (pendingAtlasMove?.atlas_x == null || pendingAtlasMove?.atlas_y == null)}
                              sx={{ textTransform: 'none', fontSize: '10px', height: '22px', color: "var(--text-main)", borderColor: "var(--border-main)", backgroundColor: movingAtlasId === location.id ? "var(--bg-surface)" : 'transparent' }}
                            >
                              {movingAtlasId === location.id ? 'Apply' : 'Move'}
                            </Button>

                            {location.atlas_x != null && (
                              <Button size="small" variant="outlined" onClick={() => removeSettlementMarker(location)} sx={{ textTransform: 'none', fontSize: '10px', height: '22px', color: "var(--text-muted)", borderColor: "var(--border-main)" }}>
                                Unplace
                              </Button>
                            )}

                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => setSettlementStatus(location, isDestroyed ? 'active' : 'destroyed')}
                              sx={{ textTransform: 'none', fontSize: '10px', height: '22px', color: isDestroyed ? "var(--success)" : "var(--danger)", borderColor: "var(--border-main)" }}
                            >
                              {isDestroyed ? 'Restore' : 'Destroy'}
                            </Button>

                            <IconButton size="small" onClick={() => deleteSettlement(location)} title={`Permanently delete ${location.name}`} sx={{ color: "var(--danger)", ml: 'auto', padding: '2px' }}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Box>

                        </CardContent>
                      </Card>
                    );
                  })}
                </Box>

                {/* Real-time Status Text Ribbon Footer */}
                <Typography variant="caption" className="atlas-status" sx={{ mt: 'auto', display: 'block', color: "var(--text-subtle)", borderTop: "1px solid var(--border-main)", pt: 1, fontStyle: 'italic', fontSize: '10px' }}>
                  {atlasStatus}
                </Typography>
              </Box>

            </Box>
          )}


          {activeTool === 'reference' && (
            <ReferencePlacementPanel key={activeSettlementId} layers={referenceLayers.filter(l => !l.floor_level_id)} selectedId={selectedReferenceId}
              select={id => { setSelectedReferenceId(id); setCalibrationPoints([]); setReferenceCalibrationMode(false); }}
              draft={referenceDraft} setDraft={setReferenceDraft} cameraRef={referenceCameraRef}
              onFinishEdit={() => { setCalibrationPoints([]); setReferenceCalibrationMode(false); }}
              apply={applyReferencePlacement}
              remove={id => { setReferenceLayers(values => values.filter(l => l.id !== id)); setSelectedReferenceId(null); }}
              fit={reference => setLocalViewCommand({ mode: 'reference', reference, nonce: Date.now() })}
              calibration={<section className="reference-image-calibration" aria-label="Image scale calibration">
                <strong>Scale from image</strong>
                <p>Pick two points on the image with a known distance between them. For adjacent grid intersections, use the grid spacing, usually 5 ft.</p>
                <label>Known distance (ft)
                  <ValidatedNumberInput aria-label="Known distance (ft)" min={0.1} step="any" value={knownDistance} onCommit={setKnownDistance} />
                </label>
                <button type="button" aria-pressed={referenceCalibrationMode} onClick={() => {
                  setCalibrationPoints([]); setReferenceCalibrationMode(value => !value);
                }}>{referenceCalibrationMode ? 'Stop picking points' : 'Pick two image points'}</button>
                {referenceCalibrationMode && <>
                  <p role="status">{calibrationPoints.length} of 2 image points selected</p>
                  <button type="button" disabled={calibrationPoints.length !== 2 || knownDistance <= 0}
                    onClick={applyReferenceCalibration}>Apply image calibration</button>
                </>}
              </section>}
            />
          )}

          {activeTool === 'build' && designLoaded && (
            <aside ref={buildToolsRef} className="editor-menu build-tools-panel">
              <Box className="tool-mode-header">
              <Typography variant="subtitle2" sx={{ color: "var(--text-muted)", fontWeight: 800, mb: 1.5, letterSpacing: '.13em' }}>
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
                    if (nextMode !== 'draw-blueprint') { setBlueprintDraft(null); setBlueprintHoverPoint(null); setFootprintPoints([]); setFootprintError(''); setNewStructurePropertyId(null); }
                    if (!['draw-property-boundary', 'draw-outdoor-area'].includes(nextMode)) setPropertyDraft([]);
                  }
                }}
                sx={{
                  mb: 2,
                  backgroundColor: "var(--bg-surface)",
                  '& .MuiToggleButton-root': {
                    color: "var(--text-muted)",
                    borderColor: "var(--border-main)",
                    textTransform: 'none',
                    fontSize: '11px',
                    gap: '4px',
                    '&.Mui-selected': { color: "var(--danger)", backgroundColor: "var(--bg-surface)" }
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
              </Box>

              {/* MODE B: POLYGON BLUEPRINT DRAFTING */}
              {buildMode === 'draw-blueprint' && (
                <Box className="structure-drawing-steps" sx={{ display: 'flex', flexDirection: 'column', gap: 1, border: "1px solid var(--primary-border)", p: 1, mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ color: "var(--text-main)" }}>Add Building{newStructurePropertyId ? ` to ${effectiveProperties.find(property => property.id === newStructurePropertyId)?.name || 'Property'}` : ''}</Typography>
                  <ToggleButtonGroup size="small" exclusive value={footprintTool} onChange={(_, value) => { if (value) setFootprintTool(value); }} aria-label="Footprint drawing tool" sx={{ '& .MuiToggleButton-root': { color: "var(--text-main)", borderColor: "var(--border-main)", '&.Mui-selected': { color: "var(--text-main)", backgroundColor: "var(--bg-surface-2)" } } }}>
                    <ToggleButton value="line">Line</ToggleButton><ToggleButton value="arc">Arc</ToggleButton><ToggleButton value="circle">Circle</ToggleButton>
                  </ToggleButtonGroup>
                  <Typography role="status" variant="caption">{blueprintDraft?.levels?.[0]?.closed ? 'Footprint closed. Save Building, or choose Edit footprint points to continue drawing.' : footprintTool === 'circle' ? (footprintPoints.length ? 'Click a point on the circumference (at least 1 ft radius).' : 'Click the circle center on the map. Circle replaces the current draft footprint.') : footprintTool === 'arc' ? (footprintPoints.length === 2 ? 'Click a point on the curve to set its bend.' : 'Click the arc endpoint; the last corner is its start. For a new footprint, click its start first.') : 'Click successive footprint corners on the map.'}</Typography>
                  {footprintError && <Typography role="alert" color="error">{footprintError}</Typography>}
                  {!!footprintPoints.length && <Button size="small" onClick={() => { setFootprintPoints([]); setFootprintError(''); }}>Cancel Current Curve</Button>}
                  {!blueprintDraft ? (
                    <>
                      <Typography variant="caption">1. Click the map where this building starts. Choose Line, Arc or Circle below, then draw directly on the map.</Typography>
                      <Button size="small" onClick={() => { setNewStructurePropertyId(null); setBuildMode('select-placed'); }}>Cancel Adding Building</Button>
                    </>
                  ) : (
                    <>
                      <TextField label="New building name" size="small" value={blueprintDraft.name || ''} onChange={event => setBlueprintDraft(value => ({ ...value, name: event.target.value }))} />
                      <Typography variant="caption">2. Draw lines or curves on the map. Switch tools to combine straight and curved edges.</Typography>
                      <Typography variant="caption" sx={{ color: "var(--text-main)", display: 'block', mb: 1 }}>
                        Active Corners Placed: {blueprintDraft.levels?.[blueprintDraft.levels.length - 1]?.corners?.length || 0}
                      </Typography>

                      <Button variant="outlined" size="small" fullWidth
                        disabled={!blueprintDraft.levels?.[0]?.closed && (blueprintDraft.levels?.[0]?.corners.length || 0) < 3}
                        onClick={() => {
                          const closed = blueprintDraft.levels?.[0]?.closed;
                          setFootprintPoints([]);
                          const updated = closed
                            ? { ...blueprintDraft, levels: blueprintDraft.levels.map(level => ({ ...level, closed: false, outline: level.outline?.length && Math.hypot(level.outline[level.outline.length - 1].end.x - level.outline[0].start.x, level.outline[level.outline.length - 1].end.y - level.outline[0].start.y) < 0.001 ? level.outline.slice(0, -1) : level.outline })) }
                            : closeBlueprintFootprint(blueprintDraft);
                          setBlueprintDraft(updated);
                          setSelected(updated);
                          setBlueprintHoverPoint(null);
                        }} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none' }}>
                        {blueprintDraft.levels?.[0]?.closed ? 'Edit footprint points' : 'Close Footprint Polygon Loop'}
                      </Button>

                      <Typography variant="caption">3. Close the footprint to preview the walls, then Save Building. Its floor plan will be kept when you add more levels.</Typography>

                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 0.5 }}>
                        <Button disabled={(blueprintDraft.levels?.[0]?.corners.length || 0) < 3} variant="contained" color="success" size="small" onClick={() => { const finished = closeBlueprintFootprint(blueprintDraft); setBuildings(prev => [...prev.filter(b => b.id !== finished.id), finished]); if (newStructurePropertyId) setProperties(values => addStructureToProperty(normalizePropertyCatalog(buildings, values), newStructurePropertyId, finished.id)); setSelected(finished); setBlueprintDraft(null); setBlueprintHoverPoint(null); setFootprintPoints([]); setFootprintError(''); setNewStructurePropertyId(null); setBuildMode('select-placed'); }}>
                          Save Building
                        </Button>
                        <Button variant="contained" color="error" size="small" onClick={() => { setBlueprintDraft(null); setBlueprintHoverPoint(null); setFootprintPoints([]); setFootprintError(''); setBuildMode('select-placed'); }}>
                          Cancel
                        </Button>
                      </Box>
                    </>
                  )}
                </Box>
              )}

                  {['draw-property-boundary', 'edit-property-boundary', 'draw-outdoor-area'].includes(buildMode) && <Box className="property-drawing-steps" sx={{ display: 'grid', gap: 1, border: "1px solid var(--primary-border)", p: 1, mb: 1 }}>
                    <Typography variant="subtitle2">{buildMode === 'draw-outdoor-area' ? 'Outdoor Area' : 'Property Boundary'} · {selectedProperty?.name}</Typography>
                    <Typography variant="caption">{buildMode === 'edit-property-boundary' ? 'Drag the red corner handles on the map. Choose Save Boundary when finished.' : `Click the map to place corners (${propertyDraft.length} placed), then choose Finish Boundary or Finish Area.`}</Typography>
                    <Button size="small" disabled={propertyDraft.length < 3} onClick={finishPropertyPolygon}>{buildMode === 'edit-property-boundary' ? 'Save Boundary' : buildMode === 'draw-outdoor-area' ? 'Finish Area' : 'Finish Boundary'}</Button>
                    <Button size="small" onClick={() => { setPropertyDraft([]); setEditingPropertyBoundaryId(null); setBuildMode('select-placed'); }}>Cancel Drawing</Button>
                    {propertyEditError && <Typography variant="caption" color="error" role="alert">{propertyEditError}</Typography>}
                  </Box>}
              {buildMode === 'select-placed' && <RestActivityPanel campaignId={campaignId} settlementId={activeSettlementId} headers={headers} onFocus={point => window.dispatchEvent(new CustomEvent('settlement-camera-command-trigger', { detail: { mode: 'point', point, radiusFeet: 200, topdown: true } }))} />}
              {['select-placed', 'move-selected'].includes(buildMode) && <ToggleButtonGroup
                value={manageCatalog}
                exclusive
                fullWidth
                size="small"
                aria-label="Manage catalog"
                onChange={(_, value) => {
                  if (!value) return;
                  if (value === 'properties') {
                    if (selectedProperty) setSelectedPropertyId(selectedProperty.id);
                    setSelected(null);
                    setSelectedBoundarySegment(0);
                    setSelectedBoundaryOpeningId(null);
                    setMovingBoundaryOpening(false);
                  }
                  setManageCatalog(value);
                }}
                sx={{ mb: 1, '& .MuiToggleButton-root': { color: "var(--text-muted)", borderColor: "var(--border-main)", textTransform: 'none', fontWeight: 700, '&.Mui-selected': { color: "var(--text-main)", backgroundColor: "var(--bg-surface-2)", borderColor: "var(--primary-border)" } } }}
              >
                <ToggleButton value="buildings">Buildings</ToggleButton>
                <ToggleButton value="properties">Properties</ToggleButton>
              </ToggleButtonGroup>}
              {['select-placed', 'move-selected'].includes(buildMode) && manageCatalog === 'properties' && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }} aria-label="Properties and structures">
                <Typography variant="subtitle2">Properties</Typography>
                <PropertyEstateList properties={effectiveProperties} buildings={buildings} selectedId={selectedProperty?.id}
                  onSelect={id => { setSelected(null); setSelectedPropertyId(id); setSelectedBoundarySegment(0); setPropertyDraft([]); setEditingPropertyBoundaryId(null); setBuildMode('select-placed'); }}
                  onSelectBuilding={building => { setSelected(building); setBuildMode('select-placed'); }}
                  onCreate={name => { const property = createProperty(name); setProperties(values => [...normalizePropertyCatalog(buildings, values), property]); setSelectedPropertyId(property.id); setSelected(null); }}
                  onRename={(id, name) => setProperties(values => normalizePropertyCatalog(buildings, values).map(property => property.id === id ? { ...property, name } : property))}
                  onDelete={id => { setProperties(values => deletePropertyKeepingBuildings(normalizePropertyCatalog(buildings, values), id, buildings)); setSelectedPropertyId(null); setPropertyDraft([]); setEditingPropertyBoundaryId(null); setBuildMode('select-placed'); }}
                  onAddStructure={id => { focusPropertyBoundary(effectiveProperties.find(property => property.id === id)); setNewStructurePropertyId(id); setBuildMode('draw-blueprint'); setBlueprintDraft(null); setBlueprintHoverPoint(null); setFootprintPoints([]); setFootprintError(''); }}
                  onMoveBuilding={(propertyId, buildingId) => { if (buildingId != null) setProperties(values => addStructureToProperty(normalizePropertyCatalog(buildings, values), propertyId, buildingId)); }} />
                {selectedProperty && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, borderTop: "1px solid var(--border-main)", pt: 1 }}>
                  {selectedProperty.boundary && <Button size="small" onClick={() => focusPropertyBoundary()}>Focus Property Boundary</Button>}
                  <Button size="small" variant={buildMode === 'draw-property-boundary' ? 'contained' : 'outlined'} onClick={() => { setBuildMode('draw-property-boundary'); setEditingPropertyBoundaryId(null); setPropertyDraft([]); }}>Draw New Boundary</Button>
                  <Button size="small" variant={buildMode === 'draw-outdoor-area' ? 'contained' : 'outlined'} onClick={() => { setBuildMode('draw-outdoor-area'); setEditingPropertyBoundaryId(null); setPropertyDraft([]); }}>Add Outdoor Area</Button>
                  {buildMode === 'draw-outdoor-area' && <Select size="small" aria-label="Outdoor area type" value={outdoorTypeDraft} onChange={event => setOutdoorTypeDraft(event.target.value)}>{OUTDOOR_AREA_TYPES.map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}</Select>}
                  {selectedProperty.boundary && <>
                    <Button size="small" onClick={startPropertyBoundaryEdit} disabled={buildMode === 'edit-property-boundary'}>Edit Existing Boundary on Map</Button>
                    <Typography variant="caption">The property boundary is independent of the buildings. Draw New Boundary replaces it; Edit keeps its segment treatments and openings.</Typography>
                    {buildMode === 'edit-property-boundary' && <details className="property-coordinate-details"><summary>Exact corner coordinates</summary>
                      {propertyDraft.map((point, index) => <Box key={`vertex-${index}`} sx={{ display: 'flex', gap: 1 }}>
                        <ValidatedNumberField size="small" label={`Corner ${index + 1} X (ft)`} value={Number(point.x)} min={-10000000} max={10000000} onCommit={value => setPropertyDraft(values => values.map((vertex, vertexIndex) => vertexIndex === index ? { ...vertex, x: value } : vertex))} />
                        <ValidatedNumberField size="small" label={`Corner ${index + 1} Y (ft)`} value={Number(point.y)} min={-10000000} max={10000000} onCommit={value => setPropertyDraft(values => values.map((vertex, vertexIndex) => vertexIndex === index ? { ...vertex, y: value } : vertex))} />
                      </Box>)}
                    </details>}
                    <details className="property-coordinate-details"><summary>Boundary walls, gates &amp; segment details</summary>
                    <Select size="small" value={Math.min(selectedBoundarySegment, selectedProperty.boundary.segments.length - 1)} onChange={event => setSelectedBoundarySegment(Number(event.target.value))} aria-label="Boundary segment">
                      {selectedProperty.boundary.segments.map((segment, index) => <MenuItem key={segment.id} value={index}>Segment {index + 1}</MenuItem>)}
                    </Select>
                    {selectedProperty.boundary.segments[selectedBoundarySegment] && <>
                      <Select size="small" aria-label="Boundary treatment" value={selectedProperty.boundary.segments[selectedBoundarySegment].treatment || 'none'} onChange={event => updateBoundarySegment(segment => ({ ...segment, treatment: event.target.value }))}>
                        {['none', 'wall', 'fence', 'hedge', 'linked_structure_wall'].map(type => <MenuItem key={type} value={type}>{type.replaceAll('_', ' ')}</MenuItem>)}
                      </Select>
                      <TextField size="small" label="Material / color" value={selectedProperty.boundary.segments[selectedBoundarySegment].material || ''} onChange={event => updateBoundarySegment(segment => ({ ...segment, material: event.target.value }))} />
                      <ValidatedNumberField size="small" label="Height (ft)" value={Number(selectedProperty.boundary.segments[selectedBoundarySegment].height) || 8} min={1} max={100} onCommit={value => updateBoundarySegment(segment => ({ ...segment, height: value }))} />
                      <ValidatedNumberField size="small" label="Thickness (ft)" value={Number(selectedProperty.boundary.segments[selectedBoundarySegment].thickness) || 1} min={0.1} max={20} onCommit={value => updateBoundarySegment(segment => ({ ...segment, thickness: value }))} />
                      {selectedProperty.boundary.segments[selectedBoundarySegment].treatment === 'linked_structure_wall' && <TextField size="small" label="Linked wall ID" value={selectedProperty.boundary.segments[selectedBoundarySegment].linked_wall_id || ''} onChange={event => updateBoundarySegment(segment => ({ ...segment, linked_wall_id: event.target.value }))} />}
                      {selectedProperty.boundary.segments[selectedBoundarySegment].treatment === 'linked_structure_wall' &&
                        !buildings.some(building => (selectedProperty.structure_ids || []).some(id => String(id) === String(building.id)) &&
                          (building.levels || []).some(level => [...(level.outline || []), ...(level.walls || [])].some(wall => wall.id === selectedProperty.boundary.segments[selectedBoundarySegment].linked_wall_id))) &&
                        <Typography variant="caption" color="error">Linked building wall is missing. Choose an existing wall ID to restore this boundary treatment.</Typography>}
                      {selectedProperty.boundary.segments[selectedBoundarySegment].treatment !== 'none' && selectedProperty.boundary.segments[selectedBoundarySegment].treatment !== 'linked_structure_wall' && <Button size="small" onClick={() => {
                        const boundary = selectedProperty.boundary;
                        const opening = { id: `opening-${Date.now()}`, offsetAlongSegment: 2, width: 6, height: 8, opening_kind: 'gate', panel_style: 'wrought_iron', leaf_configuration: 'double', state: 'closed' };
                        const error = validateBoundaryOpening(boundary, selectedBoundarySegment, opening);
                        if (error) { setPropertyEditError(error); return; }
                        setPropertyEditError('');
                        updateBoundarySegment(segment => ({ ...segment, openings: [...(segment.openings || []), opening] }));
                      }}>Add Gate / Opening</Button>}
                      {(selectedProperty.boundary.segments[selectedBoundarySegment].openings || []).map(opening => <Box key={opening.id} sx={{ border: selectedBoundaryOpeningId === opening.id ? "2px solid var(--primary-border)" : "1px solid var(--border-main)", p: 1 }}>
                        <Button size="small" variant={selectedBoundaryOpeningId === opening.id ? 'contained' : 'outlined'}
                          onClick={() => setSelectedBoundaryOpeningId(opening.id)}>Select on map</Button>
                        <Button size="small" variant={movingBoundaryOpening && selectedBoundaryOpeningId === opening.id ? 'contained' : 'outlined'}
                          onClick={() => { setSelectedBoundaryOpeningId(opening.id); setMovingBoundaryOpening(value => !(value && selectedBoundaryOpeningId === opening.id)); }}>
                          {movingBoundaryOpening && selectedBoundaryOpeningId === opening.id ? 'Cancel move' : 'Move gate / opening'}
                        </Button>
                        <ValidatedNumberField size="small" fullWidth label="Offset along segment (ft)" value={Number(opening.offsetAlongSegment) || 0} min={0} max={1000000} onCommit={value => updateBoundaryOpening(opening, { offsetAlongSegment: value })} />
                        <ValidatedNumberField size="small" fullWidth label="Opening width (ft)" value={Number(opening.width) || 1} min={0.1} max={1000000} onCommit={value => updateBoundaryOpening(opening, { width: value })} />
                        <ValidatedNumberField size="small" fullWidth label="Opening height (ft)" value={Number(opening.height) || 7} min={1} max={100} onCommit={value => updateBoundaryOpening(opening, { height: value })} />
                        <Select size="small" fullWidth aria-label="Opening kind" value={opening.opening_kind || 'gate'} onChange={event => updateBoundarySegment(segment => ({ ...segment, openings: segment.openings.map(item => item.id === opening.id ? { ...item, opening_kind: event.target.value } : item) }))}>
                          {['gate', 'door', 'archway', 'open_passage'].map(type => <MenuItem key={type} value={type}>{type.replaceAll('_', ' ')}</MenuItem>)}
                        </Select>
                        {['gate', 'door'].includes(opening.opening_kind) && <>
                          <Select size="small" fullWidth aria-label="Panel style" value={opening.panel_style || 'wood'} onChange={event => updateBoundarySegment(segment => ({ ...segment, openings: segment.openings.map(item => item.id === opening.id ? { ...item, panel_style: event.target.value } : item) }))}>
                            {['wrought_iron', 'wood', 'custom'].map(type => <MenuItem key={type} value={type}>{type.replaceAll('_', ' ')}</MenuItem>)}
                          </Select>
                          <Select size="small" fullWidth aria-label="Gate leaves" value={opening.leaf_configuration || 'single'} onChange={event => updateBoundarySegment(segment => ({ ...segment, openings: segment.openings.map(item => item.id === opening.id ? { ...item, leaf_configuration: event.target.value } : item) }))}>
                            {['single', 'double', 'sliding'].map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                          </Select>
                          <Select size="small" fullWidth aria-label="Opening state" value={opening.state || 'closed'} onChange={event => updateBoundaryOpening(opening, { state: event.target.value })}>
                            {['open', 'closed', 'locked'].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                          </Select>
                          <Select size="small" fullWidth aria-label="Hinge side" value={opening.hinge_side || 'left'} onChange={event => updateBoundaryOpening(opening, { hinge_side: event.target.value })}>
                            {['left', 'right'].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                          </Select>
                          <Select size="small" fullWidth aria-label="Swing direction" value={opening.swing_direction || 'inward'} onChange={event => updateBoundaryOpening(opening, { swing_direction: event.target.value })}>
                            {['inward', 'outward'].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                          </Select>
                        </>}
                        <Button size="small" color="error" onClick={() => updateBoundarySegment(segment => ({ ...segment, openings: segment.openings.filter(item => item.id !== opening.id) }))}>Remove Opening</Button>
                      </Box>)}
                    </>}
                    </details>
                  </>}
                  {(selectedProperty.outdoor_areas || []).map(area => <Box key={area.id} sx={{ border: "1px solid var(--border-main)", p: 1 }}>
                    <TextField size="small" fullWidth label="Outdoor area name" value={area.name || ''} onChange={event => updateSelectedProperty(property => ({ ...property, outdoor_areas: property.outdoor_areas.map(item => item.id === area.id ? { ...item, name: event.target.value } : item) }))} />
                    <Select size="small" fullWidth aria-label="Area Type" value={area.area_type || 'custom'} onChange={event => updateSelectedProperty(property => ({ ...property, outdoor_areas: property.outdoor_areas.map(item => item.id === area.id ? { ...item, area_type: event.target.value } : item) }))}>{OUTDOOR_AREA_TYPES.map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}</Select>
                    <TextField size="small" fullWidth label="Surface color" value={area.material || ''} onChange={event => updateSelectedProperty(property => ({ ...property, outdoor_areas: property.outdoor_areas.map(item => item.id === area.id ? { ...item, material: event.target.value } : item) }))} />
                    <Select size="small" fullWidth aria-label="Outdoor elevation mode" value={area.elevation_mode || 'draped_on_terrain'} onChange={event => updateSelectedProperty(property => ({ ...property, outdoor_areas: property.outdoor_areas.map(item => item.id === area.id ? { ...item, elevation_mode: event.target.value } : item) }))}>
                      <MenuItem value="draped_on_terrain">Follow terrain</MenuItem><MenuItem value="constant">Fixed elevation</MenuItem>
                    </Select>
                    {area.elevation_mode === 'constant' && <ValidatedNumberField size="small" label="Area elevation (ft)" value={Number(area.elevation) || 0} min={-10000} max={10000} onCommit={value => updateSelectedProperty(property => ({ ...property, outdoor_areas: property.outdoor_areas.map(item => item.id === area.id ? { ...item, elevation: value } : item) }))} />}
                    <ValidatedNumberField size="small" label="Layer priority" value={Number(area.layering_priority) || 0} min={-100} max={100} onCommit={value => updateSelectedProperty(property => ({ ...property, outdoor_areas: property.outdoor_areas.map(item => item.id === area.id ? { ...item, layering_priority: value } : item) }))} />
                    <Typography variant="caption">Higher priority surfaces cover overlapping lower ones. Later areas win ties.</Typography>
                    <FormControlLabel control={<Checkbox checked={area.walkable !== false} onChange={event => updateSelectedProperty(property => ({ ...property, outdoor_areas: property.outdoor_areas.map(item => item.id === area.id ? { ...item, walkable: event.target.checked } : item) }))} />} label="Walkable" />
                    <TextField size="small" fullWidth label="Area capabilities" value={(area.activity_capabilities || []).join(', ')} onChange={event => updateSelectedProperty(property => ({ ...property, outdoor_areas: property.outdoor_areas.map(item => item.id === area.id ? { ...item, activity_capabilities: event.target.value.split(',').map(value => value.trim()).filter(Boolean) } : item) }))} />
                    <Button size="small" color="error" onClick={() => updateSelectedProperty(property => ({ ...property, outdoor_areas: property.outdoor_areas.filter(item => item.id !== area.id) }))}>Remove Area</Button>
                  </Box>)}
                  {propertyEditError && <Typography variant="caption" color="error">{propertyEditError}</Typography>}
                </Box>}
              </Box>}

              {/* MODE A: CATALOG ASSET PLACEMENT */}
              {buildMode === 'place-asset' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <Typography variant="caption" sx={{ mt: 1, display: 'block', color: "var(--text-muted)", lineHeight: '1.4' }}>
                    Click directly on the terrain grid to drop the selected model asset template.
                  </Typography>
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
                          backgroundColor: assetKey === asset.key ? "var(--bg-surface-2)" : "var(--bg-surface)",
                          border: '1px solid',
                          borderColor: assetKey === asset.key ? "var(--primary-border)" : "var(--border-main)",
                          borderRadius: '4px',
                          color: "var(--text-main)",
                          textAlign: 'left',
                          gap: '10px',
                          '&:hover': { backgroundColor: "var(--bg-surface)" }
                        }}
                      >
                        <HomeWorkIcon sx={{ color: assetKey === asset.key ? "var(--danger)" : "var(--text-muted)" }} />
                        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '12px', lineHeight: 1.2 }}>{asset.name}</Typography>
                          <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>{asset.width_feet} x {asset.depth_feet} ft</Typography>
                        </Box>
                      </Button>
                    ))}
                  </Box>
                </Box>
              )}

              {/* MODE C: PROPERTY SELECTION & ADJUSTMENT TRACKS */}
              {['select-placed', 'move-selected'].includes(buildMode) && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Typography variant="caption" sx={{ color: "var(--text-muted)", lineHeight: 1.35 }}>
                    {buildMode === 'move-selected'
                      ? 'Drag the selected structure on the map, then choose Done Moving.'
                      : 'Select a building to edit it. Turn on Move Building before dragging it on the map.'}
                  </Typography>

                  {manageCatalog === 'buildings' && selectedBuilding && (
                    <Box className="building-inspector">
                      <section className="building-inspector-section building-inspector-identity">
                        <Typography className="building-inspector-eyebrow">Selected building</Typography>
                        <TextField
                          label="Building name"
                          size="small"
                          fullWidth
                          value={selectedBuilding.name || ''}
                          onChange={e => updateSelectedBuilding(building => ({ ...building, name: e.target.value }))}
                        />
                        <Typography className="building-inspector-summary">
                          Footprint · {Math.round(selectedBuilding.width_feet)} × {Math.round(selectedBuilding.depth_feet)} ft
                        </Typography>
                        <Button variant="outlined" startIcon={<EditIcon />} onClick={openBuildingEditor}>
                          Edit building details
                        </Button>
                      </section>

                      <section className="building-inspector-section">
                        <Typography className="building-inspector-heading">Placement &amp; footprint</Typography>
                        <Button
                          className="building-inspector-primary-action"
                          variant={buildMode === 'move-selected' ? 'contained' : 'outlined'}
                          startIcon={<OpenWithIcon />}
                          onClick={() => setBuildMode(buildMode === 'move-selected' ? 'select-placed' : 'move-selected')}
                        >
                          {buildMode === 'move-selected' ? 'Done Moving' : 'Move Building'}
                        </Button>
                        <Button
                          variant="outlined"
                          startIcon={<UndoIcon />}
                          disabled={!buildingMoveUndoCount}
                          onClick={undoBuildingMove}
                        >
                          Undo Building Move
                        </Button>

                        <Box className="building-dimension-grid">
                          <Box className="building-dimension-control">
                            <ValidatedNumberField
                              label="Footprint width (ft)"
                              size="small"
                              fullWidth
                              value={Math.round(selectedBuilding.width_feet)}
                              min={10}
                              max={1000}
                              onCommit={value => selectedBuilding.is_blueprint
                                ? resizeSelectedBlueprint(value, selectedBuilding.depth_feet)
                                : updateSelectedBuilding(building => ({ ...building, width_feet: value }))}
                            />
                            <Slider
                              min={10}
                              max={1000}
                              step={1}
                              value={Math.max(10, Math.min(1000, Number(selectedBuilding.width_feet) || 10))}
                              onChange={(event, value) => selectedBuilding.is_blueprint
                                ? resizeSelectedBlueprint(Number(value), selectedBuilding.depth_feet)
                                : updateSelectedBuilding(building => ({ ...building, width_feet: Number(value) }))}
                            />
                          </Box>

                          <Box className="building-dimension-control">
                            <ValidatedNumberField
                              label="Footprint depth (ft)"
                              size="small"
                              fullWidth
                              value={Math.round(selectedBuilding.depth_feet)}
                              min={10}
                              max={1000}
                              onCommit={value => selectedBuilding.is_blueprint
                                ? resizeSelectedBlueprint(selectedBuilding.width_feet, value)
                                : updateSelectedBuilding(building => ({ ...building, depth_feet: value }))}
                            />
                            <Slider
                              min={10}
                              max={1000}
                              step={1}
                              value={Math.max(10, Math.min(1000, Number(selectedBuilding.depth_feet) || 10))}
                              onChange={(event, value) => selectedBuilding.is_blueprint
                                ? resizeSelectedBlueprint(selectedBuilding.width_feet, Number(value))
                                : updateSelectedBuilding(building => ({ ...building, depth_feet: Number(value) }))}
                            />
                          </Box>
                        </Box>

                        <Box className="building-rotation-control">
                          <Typography variant="caption">Rotation <strong>{Math.round((selectedBuilding.rotation || 0) * 180 / Math.PI)}°</strong></Typography>
                          <Slider min={0} max={359} step={1} value={Math.round((selectedBuilding.rotation || 0) * 180 / Math.PI)} onChange={(event, value) => updateSelectedBuilding(building => ({ ...building, rotation: Number(value) * Math.PI / 180 }))} />
                        </Box>
                        <Select size="small" fullWidth aria-label="Structure elevation mode" value={selectedBuilding.elevation_mode || 'relative_to_terrain'} onChange={event => updateSelectedBuilding(building => ({ ...building, elevation_mode: event.target.value }))}>
                          <MenuItem value="relative_to_terrain">Elevation above terrain</MenuItem>
                          <MenuItem value="fixed_world">Fixed settlement elevation</MenuItem>
                        </Select>
                        <ValidatedNumberField label={selectedBuilding.elevation_mode === 'fixed_world' ? 'Base elevation (ft)' : 'Base elevation above terrain (ft)'} size="small" fullWidth
                          value={Number(selectedBuilding.elevation) || 0} min={-10000} max={10000}
                          onCommit={value => updateSelectedBuilding(building => ({ ...building, elevation: value }))} />
                      </section>

                      <section className="building-inspector-section" aria-label="Travel access">
                        <Typography variant="subtitle2">Travel access</Typography>
                        {(() => {
                          const access = selectedBuilding.travel_access_points?.[0];
                          const routed = (travelContext.destinations || []).find(item => item.key === `${activeSettlementId}:structure:${selectedBuilding.id}`);
                          return <>
                            <Typography variant="caption" sx={{ color: routed?.access_status === 'disconnected' ? 'var(--danger)' : 'var(--text-muted)' }}>
                              {access ? 'Manual primary entrance' : routed?.access_source === 'opening' ? 'Automatic exterior door or gate' : 'Automatic nearest-road entrance'}{routed?.access_distance_feet != null ? ` · ${routed.access_distance_feet} ft from road` : ''}
                            </Typography>
                            {access && <Box sx={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, mt:1 }}>
                              <ValidatedNumberField label="Access X" size="small" value={Number(access.x) || 0} onCommit={value => updateSelectedBuilding(building => ({...building,travel_access_points:[{...building.travel_access_points[0],x:value}]}))} />
                              <ValidatedNumberField label="Access Y" size="small" value={Number(access.y) || 0} onCommit={value => updateSelectedBuilding(building => ({...building,travel_access_points:[{...building.travel_access_points[0],y:value}]}))} />
                            </Box>}
                            <Box sx={{ display:'flex', gap:1, mt:1 }}>
                              <Button size="small" variant="outlined" onClick={() => { setAccessPointBuildingId(selectedBuilding.id); setActiveTool('travel'); }}>Place on Map</Button>
                              {access && <Button size="small" variant="outlined" onClick={() => updateSelectedBuilding(building => { const next={...building}; delete next.travel_access_points; return next; })}>Use Automatic</Button>}
                            </Box>
                            {accessPointBuildingId === selectedBuilding.id && <Typography variant="caption">Click the map to place this entrance.</Typography>}
                          </>;
                        })()}
                      </section>

                      <Suspense fallback={<Typography variant="caption">Loading spatial graph tools…</Typography>}>
                        <SpatialConnectionsEditor
                          campaignId={campaignId}
                          settlementId={activeSettlementId}
                          building={selectedBuilding}
                          headers={headers}
                          onOpenCanonicalBlueprint={(space, reference) => {
                            const target = buildings.find(item => String(item.id) === String(space.building_id));
                            if (!target?.is_blueprint) return false;
                            if (target.id !== selectedBuilding.id) setSelected(target);
                            setBlueprintOpenRequest({ token: Date.now(), reference, buildingId: target.id });
                            return true;
                          }}
                        />
                      </Suspense>

                      {selectedBuilding.is_blueprint && <BlueprintLevels key={`${selectedBuilding.id}:${blueprintOpenRequest?.token || 'default'}`} building={selectedBuilding}
                        initialOpen={blueprintOpenRequest?.buildingId === selectedBuilding.id}
                        onEditorOpenChange={setBlueprintEditorOpen}
                        initialSelection={blueprintOpenRequest?.reference ? { ...blueprintOpenRequest.reference, element_kind: 'opening' } : null}
                        onEditorClose={() => setBlueprintOpenRequest(null)}
                        onChange={next => setBuildings(values => values.map(b => b.id === next.id ? next : b))}
                        onDeleteLevelReferences={levelId => {
                          const filtered = referenceLayersRef.current.filter(layer =>
                            !(layer.linked_building_id === selectedBuilding.id && layer.floor_level_id === levelId));
                          referenceLayersRef.current = filtered;
                          setReferenceLayers(filtered);
                        }}
                        uploadImage={uploadFloorImage} />}

                      <section className="building-inspector-danger">
                        <Button variant="contained" color="error" fullWidth startIcon={<DeleteIcon />} onClick={requestDeleteSelectedBuilding}>
                          Delete Selected Building
                        </Button>
                      </section>
                    </Box>
                  )}
                  {manageCatalog === 'buildings' && <Box className="tool-existing-list" aria-label="Existing buildings">
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
                          backgroundColor: building.id === selectedBuilding?.id ? "var(--bg-surface-2)" : "var(--bg-surface)",
                          border: '1px solid',
                          borderColor: building.id === selectedBuilding?.id ? "var(--primary-border)" : "var(--border-main)",
                          borderRadius: '4px',
                          color: "var(--text-main)",
                          textAlign: 'left',
                          '&:hover': { backgroundColor: "var(--bg-surface)" }
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '12px' }}>{building.name || 'Unnamed Structure'}</Typography>
                        <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>{Math.round(building.width_feet)} x {Math.round(building.depth_feet)} ft</Typography>
                      </Button>
                    ))}
                    {!buildings.length && (
                      <Typography variant="caption" sx={{ color: "var(--text-muted)", textAlign: 'center', display: 'block', py: 1 }}>No structures deployed yet.</Typography>
                    )}
                  </Box>
                  </Box>}
                </Box>
              )}
            </aside>
          )}

          {activeTool === 'npcs' && designLoaded && (
            <NpcTokenPanel settlementId={activeSettlementId} headers={headers} mapState={npcMap}
              selectedNpcId={selectedNpcTokenId} onSelect={npcId => { setSelectedNpcTokenId(npcId); setNpcPlacementError(''); }}
              placing={!!placingNpcId} onBeginPlace={npcId => { setSelectedNpcTokenId(npcId); setPlacingNpcId(npcId); setNpcPlacementError(''); }}
              placementError={npcPlacementError} />
          )}

          {activeTool === 'travel' && (
            <aside className="editor-menu travel-manager-panel">
              <Typography variant="subtitle2" sx={{ color: "var(--text-muted)", fontWeight: 800, mb: 1.5, letterSpacing: '.13em' }}>
                PLAN A JOURNEY
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Destination Selector */}
                {((travelContext.groups?.length ? travelContext.groups : sessionApi.snapshot?.document?.groups) || []).filter(group => group.members?.length).length > 0 && <Box>
                  <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'block', mb: 0.5, fontWeight: 'bold' }}>Travel group</Typography>
                  <Select size="small" fullWidth value={selectedTravelGroupId} onChange={event => { setSelectedTravelGroupId(event.target.value); setTravelPlan(null); }}>
                    {((travelContext.groups?.length ? travelContext.groups : sessionApi.snapshot?.document?.groups) || []).filter(group => group.members?.length).map(group => <MenuItem value={group.id} key={group.id}>{group.name}</MenuItem>)}
                  </Select>
                </Box>}
                <Box>
                  <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'block', mb: 0.5, fontWeight: 'bold' }}>
                    Destination
                  </Typography>
                  <TextField size="small" fullWidth type="search" label="Search destinations" value={travelDestinationSearch}
                    onChange={event => setTravelDestinationSearch(event.target.value)} sx={{ mb:1 }} />
                  <FormControl size="small" fullWidth>
                    <Select
                      value={destination?.key || ''}
                      onChange={e => chooseDestination((travelContext.destinations || []).find(point => point.key === e.target.value) || null)}
                      sx={{
                        backgroundColor: "var(--bg-surface-2)",
                        color: "var(--text-main)",
                        '.MuiOutlinedInput-notchedOutline': { borderColor: "var(--border-main)" },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: "var(--border-main)" }
                      }}
                    >
                      <MenuItem value="">Select a building, property, or point</MenuItem>
                      {(travelContext.destinations || []).filter(point => !travelDestinationSearch || point.label?.toLowerCase().includes(travelDestinationSearch.toLowerCase())).map(point => (
                        <MenuItem key={point.key} value={point.key} disabled={point.access_status !== 'connected'}>{point.label}{point.access_status !== 'connected' ? ' · disconnected' : ''}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>

                {/* Travelers Input */}
                <ValidatedNumberField
                  label="Travelers in Party"
                  size="small"
                  fullWidth
                  min={1}
                  value={partySize}
                  onCommit={setPartySize}
                />

                {/* Destination Metadata Card & Route Calculator */}
                {destination && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, background: "var(--bg-app)", p: 1.5, borderRadius: '4px', border: "1px solid var(--border-main)" }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 'bold', color: "var(--text-main)" }}>{destination.name}</Typography>
                      <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
                        {Math.round(destination.x)} E · {Math.round(destination.y)} N
                      </Typography>
                    </Box>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<NavigationIcon />}
                      onClick={() => calculateTravel()}
                      sx={{ backgroundColor: "var(--accent)", color: "var(--text-on-accent)", fontWeight: 'bold', textTransform: 'none', '&:hover': { backgroundColor: "var(--accent)" } }}
                    >
                      Calculate Travel Options
                    </Button>
                  </Box>
                )}

                {/* Calculated Travel Route Options */}
                {travelPlan && (
                  <Box sx={{ borderTop: "1px solid var(--border-main)", pt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: '150px', overflowY: 'auto' }}>
                      {travelPlan.options.map(option => (
                        <Box
                          key={option.mode}
                          role="button"
                          tabIndex={option.available ? 0 : -1}
                          onClick={() => option.available && setSelectedTravelMode(option.mode)}
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '8px',
                            borderRadius: '4px',
                            backgroundColor: "var(--bg-surface)",
                            border: `1px solid ${selectedTravelMode === option.mode ? 'var(--accent)' : 'var(--border-main)'}`,
                            opacity: option.available ? 1 : 0.4
                          }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600, color: option.available ? "var(--text-main)" : "var(--danger)" }}>
                            {option.label}
                          </Typography>
                          {option.available ? (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                              <Typography variant="caption" sx={{ color: "var(--text-main)" }}>{formatDuration(option.elapsed_minutes)}</Typography>
                              <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>{option.distance_miles} mi · {formatCost(option.cost_cp)}</Typography>
                            </Box>
                          ) : (
                            <Typography variant="caption" sx={{ color: "var(--danger)", fontStyle: 'italic', mt: 0.5 }}>
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
                      disabled={!selectedTravelGroupId || !travelPlan.options.some(option => option.mode === selectedTravelMode && option.available) || !sessionApi.snapshot?.document?.sessions?.some(session => session.status === 'active')}
                      onClick={startPlannedJourney}
                      sx={{ textTransform: 'none', fontWeight: 'bold' }}
                    >
                      Start Tracked Journey
                    </Button>
                    <Button variant="outlined" fullWidth onClick={setPartyHere}>Place Party Here Without Advancing Time</Button>
                    {sessionApi.error && <Typography variant="caption" sx={{ color: "var(--danger)" }}>{sessionApi.error}</Typography>}
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
                  <Typography variant="caption" sx={{ color: "var(--text-muted)", fontWeight: 800, display: 'block', letterSpacing: '.13em' }}>
                    SETTLEMENT ECONOMY
                  </Typography>
                  <Typography variant="h6" sx={{ color: "var(--text-main)", fontWeight: 700, mt: -0.5 }}>
                    Market Day {economy.day_index}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button variant="outlined" size="small" onClick={() => runEconomy(1)} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none' }}>
                    Run Day
                  </Button>
                  <Button variant="contained" size="small" onClick={() => runEconomy(10)} sx={{ backgroundColor: "var(--accent)", color: "var(--text-on-accent)", textTransform: 'none', fontWeight: 'bold', '&:hover': { backgroundColor: "var(--accent)" } }}>
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
                        backgroundColor: "var(--bg-surface)",
                        border: '1px solid',
                        borderColor: isShortage ? "var(--primary-border)" : "var(--border-main)",
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.5
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: isShortage ? "var(--danger)" : "var(--text-main)" }}>{market.name}</Typography>
                        <Typography variant="body2" sx={{ color: "var(--text-main)", fontWeight: 'bold' }}>{market.current_price_cp} cp</Typography>
                      </Box>

                      <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
                        {Math.round(market.stock)} / {Math.round(market.target_stock)} units · {market.price_index}× base
                      </Typography>

                      {market.last_imported > 0 && (
                        <Typography variant="caption" sx={{ color: "var(--success)", fontStyle: 'italic', display: 'block' }}>
                          Imported {Math.round(market.last_imported)} today
                        </Typography>
                      )}

                      <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center' }}>
                        <ValidatedNumberField
                          size="small"
                          min={1}
                          value={commodityQuantity}
                          onCommit={setCommodityQuantity}
                          sx={{ width: '65px', '& .MuiInputBase-input': { padding: '4px 6px', fontSize: '11px', color: "var(--text-main)" } }}
                        />
                        <Button variant="contained" size="small" fullWidth onClick={() => disruptMarket(market.commodity_key)} sx={{ backgroundColor: "var(--bg-surface-2)", color: "var(--text-main)", textTransform: 'none', fontSize: '10px', padding: '4px' }}>
                          Party Buys
                        </Button>
                      </Box>
                    </Box>
                  );
                })}
              </Box>

              {/* Business Financial Analytics Section */}
              <Box sx={{ borderTop: "1px solid var(--border-main)", pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  <Box sx={{ flex: 1.2 }}>
                    <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'block', mb: 0.5, fontWeight: 'bold' }}>
                      Business Venture Selection
                    </Typography>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={selectedBusinessId || ''}
                        onChange={e => setSelectedBusinessId(Number(e.target.value))}
                        sx={{ backgroundColor: "var(--bg-surface-2)", color: "var(--text-main)", '.MuiOutlinedInput-notchedOutline': { borderColor: "var(--border-main)" } }}
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
                    <Box sx={{ flex: 1, background: "var(--bg-app)", p: 1, borderRadius: '4px', border: "1px solid var(--border-main)" }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: selectedBusiness.closed ? "var(--danger)" : "var(--success)" }}>
                          {selectedBusiness.closed ? 'CLOSED' : 'OPERATING'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "var(--text-main)", fontWeight: 'bold' }}>{formatCost(selectedBusiness.cash_reserves_cp)}</Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'block', lineHeight: 1.2 }}>
                        Foot Traffic: {selectedBusiness.foot_traffic}x <br /> Slump Loop: {selectedBusiness.slump_days} days
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* SVG Analytics Charts Wrap */}
                <Box className="chart-wrap" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: "var(--text-main)" }}>Daily Performance History</Typography>
                    <Typography variant="caption" sx={{ color: "var(--danger)" }}>
                      Tenday: {formatCost(tenday.revenue)} rev · {formatCost(tenday.profit)} prof
                    </Typography>
                  </Box>
                  <Box sx={{ background: "var(--bg-app)", p: 1, borderRadius: '4px', border: "1px solid var(--border-main)" }}>
                    <SalesChart rows={selectedHistory} />
                  </Box>
                </Box>
              </Box>
            </aside>
          )}


          {activeTool === 'time' && (
            <aside className="editor-menu time-manager-panel">
              <Typography variant="subtitle2" sx={{ color: "var(--text-muted)", fontWeight: 800, mb: 1.5, letterSpacing: '.13em' }}>
                TIME OF DAY MANAGER
              </Typography>

              {/* SECTION A: STEP JUMP ADVANCEMENTS CONTAINER */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2 }}>
                <Typography variant="caption" sx={{ color: "var(--text-subtle)", fontWeight: 700, letterSpacing: '0.04em', mb: 0.5 }}>
                  STEP JUMPS
                </Typography>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Button variant="contained" size="small" startIcon={<ArrowBackIcon />} onClick={() => advanceTime(-60)} sx={{ backgroundColor: "var(--bg-surface-2)", textTransform: 'none', fontSize: '11px' }}>
                    -1 Hour
                  </Button>
                  <Button variant="contained" size="small" endIcon={<ArrowForwardIcon />} onClick={() => advanceTime(60)} sx={{ backgroundColor: "var(--bg-surface-2)", textTransform: 'none', fontSize: '11px' }}>
                    +1 Hour
                  </Button>

                  <Button variant="contained" size="small" startIcon={<FastRewindIcon />} onClick={() => advanceTime(-720)} sx={{ backgroundColor: "var(--bg-surface-2)", textTransform: 'none', fontSize: '11px' }}>
                    -12 Hours
                  </Button>
                  <Button variant="contained" size="small" endIcon={<FastForwardIcon />} onClick={() => advanceTime(720)} sx={{ backgroundColor: "var(--bg-surface-2)", textTransform: 'none', fontSize: '11px' }}>
                    +12 Hours
                  </Button>

                  <Button variant="contained" size="small" startIcon={<CalendarTodayIcon sx={{ scale: '0.8' }} />} onClick={() => advanceTime(-1440)} sx={{ backgroundColor: "var(--bg-surface-2)", textTransform: 'none', fontSize: '11px' }}>
                    -1 Day
                  </Button>
                  <Button variant="contained" size="small" endIcon={<CalendarTodayIcon sx={{ scale: '0.8' }} />} onClick={() => advanceTime(1440)} sx={{ backgroundColor: "var(--bg-surface-2)", textTransform: 'none', fontSize: '11px' }}>
                    +1 Day
                  </Button>
                </Box>
              </Box>

              {/* SECTION B: DYNAMIC CALENDAR SCHEMA SYNC INTEGRATION */}
              {!activeCalendar ? (
                <Box className="chart-empty" sx={{ padding: '12px', textAlign: 'center', background: "var(--bg-app)", borderRadius: '4px', border: "1px solid var(--border-main)" }}>
                  <Typography variant="caption" sx={{ color: "var(--text-muted)", fontStyle: 'italic' }}>
                    Synchronizing calendar matrix with database...
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, borderTop: "1px solid var(--border-main)", pt: 1.5, mb: 2 }}>
                  <Typography variant="caption" sx={{ color: "var(--text-subtle)", fontWeight: 700, letterSpacing: '0.04em' }}>
                    MANUAL DATE &amp; TIME ENTRY
                  </Typography>

                  {/* Date Row Split Box */}
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', gap: 1 }}>
                    <ValidatedNumberField
                      label="Year"
                      size="small"
                      value={manualDate.year}
                      onCommit={value => setManualDate(prev => ({ ...prev, year: value }))}
                      sx={{ input: { color: "var(--text-main)", fontSize: '12px' } }}
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
                          backgroundColor: "var(--bg-surface-2)",
                          color: "var(--text-main)",
                          '.MuiOutlinedInput-notchedOutline': { borderColor: "var(--border-main)" }
                        }}
                      >
                        {activeCalendar.months.map((m, idx) => (
                          <MenuItem key={idx} value={idx} sx={{ fontSize: '12px' }}>
                            {m.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <ValidatedNumberField
                      label="Day"
                      size="small"
                      min={1} max={activeCalendar.months[manualDate.month_index]?.length || 30}
                      value={manualDate.day}
                      onCommit={value => setManualDate(prev => ({ ...prev, day: value }))}
                      sx={{ input: { color: "var(--text-main)", fontSize: '12px' } }}
                    />
                  </Box>

                  {/* Hours & Minutes Row Split Box */}
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <ValidatedNumberField
                      label="Hour (0-23)"
                      size="small"
                      min={0} max={23}
                      value={manualDate.hour}
                      onCommit={value => setManualDate(prev => ({ ...prev, hour: value }))}
                      sx={{ input: { color: "var(--text-main)", fontSize: '12px' } }}
                    />
                    <ValidatedNumberField
                      label="Minute (0-59)"
                      size="small"
                      min={0} max={59}
                      value={manualDate.minute}
                      onCommit={value => setManualDate(prev => ({ ...prev, minute: value }))}
                      sx={{ input: { color: "var(--text-main)", fontSize: '12px' } }}
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
                    sx={{ backgroundColor: "var(--accent)", color: "var(--text-on-accent)", fontWeight: 'bold', '&:hover': { backgroundColor: "var(--accent)" } }}
                  >
                    Apply Exact Target Timeline
                  </Button>
                </Box>
              )}

              {/* SECTION C: SYSTEM HIGH-CONTRAST QUICK ACTION PRESETS */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, borderTop: "1px solid var(--border-main)", pt: 1.5 }}>
                <Typography variant="caption" sx={{ color: "var(--text-subtle)", fontWeight: 700, letterSpacing: '0.04em', mb: 0.5 }}>
                  QUICK PRESETS
                </Typography>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<WbTwilightIcon sx={{ color: "var(--text-main)" }} />}
                    onClick={() => window.dispatchEvent(new CustomEvent('settlement-time-absolute-request', { detail: { hour: 6, minute: 0, day } }))}
                    sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none', fontSize: '11px', justifyContent: 'flex-start' }}
                  >
                    Dawn (6:00)
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<WbSunnyIcon sx={{ color: "var(--text-main)" }} />}
                    onClick={() => window.dispatchEvent(new CustomEvent('settlement-time-absolute-request', { detail: { hour: 12, minute: 0, day } }))}
                    sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none', fontSize: '11px', justifyContent: 'flex-start' }}
                  >
                    Noon (12:00)
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<NightsStayIcon sx={{ color: "var(--success)" }} />}
                    onClick={() => window.dispatchEvent(new CustomEvent('settlement-time-absolute-request', { detail: { hour: 18, minute: 0, day } }))}
                    sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none', fontSize: '11px', justifyContent: 'flex-start' }}
                  >
                    Dusk (18:00)
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<BedtimeIcon sx={{ color: "var(--info)" }} />}
                    onClick={() => window.dispatchEvent(new CustomEvent('settlement-time-absolute-request', { detail: { hour: 0, minute: 0, day } }))}
                    sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none', fontSize: '11px', justifyContent: 'flex-start' }}
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
                backgroundColor: "var(--overlay)",
                border: "1px solid var(--border-main)",
                borderRadius: '6px',
                padding: '12px',
                width: '260px',
                zIndex: 45,
                boxShadow: "0 4px 12px var(--border-main)",
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5
              }}
            >
              <Box className="location-search">
                <Typography variant="caption" sx={{ color: "var(--text-subtle)", fontWeight: 800, display: 'block', letterSpacing: '.13em', mb: 0.5 }}>
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
                  sx={{ input: { color: "var(--text-main)", fontSize: '12px' } }}
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
                      borderTop: "1px solid var(--border-main)",
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
                          backgroundColor: selectedLocation?.id === location.id ? "var(--bg-surface-2)" : "var(--bg-surface)",
                          border: '1px solid',
                          borderColor: selectedLocation?.id === location.id ? "var(--primary-border)" : "var(--border-main)",
                          borderRadius: '4px',
                          color: "var(--text-main)",
                          textAlign: 'left',
                          '&:hover': { backgroundColor: "var(--bg-surface)" }
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '12px', lineHeight: 1.2 }}>
                          {location.title}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "var(--text-muted)", fontSize: '10px' }}>
                          {location.type}{location.propertyName ? ` · ${location.propertyName}` : ''}{location.owner ? ` · ${location.owner}` : ''}{textAffiliation(location)}
                        </Typography>
                      </Button>
                    ))}

                    {!locationResults.length && (
                      <Typography variant="caption" sx={{ color: "var(--text-muted)", textAlign: 'center', display: 'block', py: 1 }}>
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
                      borderTop: "1px solid var(--border-main)",
                      pt: 1.5,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1
                    }}
                  >
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 'bold', color: "var(--text-main)" }}>
                        {selectedLocation.title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "var(--text-main)", display: 'block' }}>
                        {selectedLocation.type}{selectedLocation.propertyName ? ` · ${selectedLocation.propertyName}` : ''}{selectedLocation.affiliation ? ` · ${selectedLocation.affiliation}` : ''}
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 0.5 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<CenterFocusStrongIcon />}
                        disabled={!selectedLocation.point}
                        onClick={() => selectedLocation.kind === 'property' ? focusPropertyBoundary(selectedLocation.source) : centerDmOn(selectedLocation)}
                        sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", fontSize: '10px', textTransform: 'none', padding: '4px' }}
                      >
                        Center DM
                      </Button>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<OpenInNewIcon />}
                        disabled={!selectedLocation.point}
                        onClick={() => centerPlayerOnLocation(selectedLocation)}
                        sx={{ backgroundColor: "var(--accent)", color: "var(--text-on-accent)", fontSize: '10px', textTransform: 'none', padding: '4px', '&:hover': { backgroundColor: "var(--accent)" } }}
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
              backgroundColor: "var(--bg-surface)",
              backgroundImage: 'none',
              border: "1px solid var(--border-main)",
              color: "var(--text-main)",
              p: 1
            }
          }}
        >
          <DialogTitle id="building-delete-dialog-title" sx={{ color: "var(--text-main)", fontWeight: 700, pb: 1 }}>
            Delete {buildingDeleteTarget?.name || 'this building'}?
          </DialogTitle>
          <DialogContent>
            <Typography id="building-delete-dialog-description" variant="body2" sx={{ color: "var(--text-muted)", lineHeight: 1.5, mb: 1.5 }}>
              This removes the selected building from the settlement. Press Enter to confirm or Escape to cancel.
            </Typography>
            <FormControlLabel
              control={<Checkbox checked={skipBuildingDeleteConfirmation} onChange={event => setSkipBuildingDeleteConfirmation(event.target.checked)} sx={{ color: "var(--danger)", '&.Mui-checked': { color: "var(--danger)" } }} />}
              label="Don't ask me again for this session"
              sx={{ color: "var(--text-main)", alignItems: 'center' }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button variant="outlined" onClick={closeBuildingDeleteDialog} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none' }}>
              Cancel
            </Button>
            <Button autoFocus variant="contained" color="error" startIcon={<DeleteIcon />} onClick={confirmBuildingDeletion} sx={{ fontWeight: 'bold', textTransform: 'none' }}>
              Delete Building
            </Button>
          </DialogActions>
        </Dialog>

        <><Dialog
          open={Boolean(buildingEditDraft)}
          onClose={() => setBuildingEditDraft(null)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            className: 'building-details-dialog',
            sx: {
              backgroundColor: "var(--bg-surface)",
              backgroundImage: 'none', // Overrides default light opacity filter layers
              border: "1px solid var(--border-main)",
              color: "var(--text-main)",
              p: 1
            }
          }}
        >
          {buildingEditDraft && (
            <Box component="form" onSubmit={event => { event.preventDefault(); saveBuildingEditor(); }}>
              <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, px: 2 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: "var(--text-muted)", fontWeight: 800, display: 'block', letterSpacing: '.06em' }}>
                    EDIT BUILDING
                  </Typography>
                  <Typography variant="h5" component="h2" sx={{ color: "var(--text-main)", fontWeight: 700, mt: -0.5 }}>
                    {buildingEditDraft.name || 'Building'}
                  </Typography>
                </Box>
                <IconButton onClick={() => setBuildingEditDraft(null)} aria-label="Close" sx={{ color: "var(--text-subtle)" }}>
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
                    <Typography variant="caption" sx={{ color: "var(--text-muted)", mb: 0.5, fontWeight: 'bold' }}>Model &amp; Footprint</Typography>
                    <Select
                      size="small"
                      value={buildingEditDraft.is_blueprint ? buildingEditDraft.asset_key || 'blueprint' : buildingEditDraft.asset_key || ''}
                      disabled={Boolean(buildingEditDraft.is_blueprint)}
                      inputProps={{ 'aria-label': 'Model & Footprint' }}
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
                        backgroundColor: "var(--bg-surface-2)",
                        color: "var(--text-main)",
                        '.MuiOutlinedInput-notchedOutline': { borderColor: "var(--border-main)" },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: "var(--border-main)" }
                      }}
                    >
                      {buildingEditDraft.is_blueprint && (
                        <MenuItem value={buildingEditDraft.asset_key || 'blueprint'}>Custom blueprint</MenuItem>
                      )}
                      {!buildingEditDraft.is_blueprint && buildingEditDraft.asset_key && !assets.some(asset => asset.key === buildingEditDraft.asset_key) && (
                        <MenuItem value={buildingEditDraft.asset_key}>Current model ({buildingEditDraft.asset_key})</MenuItem>
                      )}
                      {!buildingEditDraft.is_blueprint && assets.map(asset => (
                        <MenuItem key={asset.key} value={asset.key}>{asset.name} · {asset.category}</MenuItem>
                      ))}
                    </Select>
                  </Box>

                  <TextField
                    label="Business Type"
                    size="small"
                    value={buildingEditDraft.business_type || ''}
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
                    label="Opens at"
                    type="time"
                    size="small"
                    value={buildingEditDraft.opens_at || ''}
                    onChange={event => setBuildingEditDraft(value => ({ ...value, opens_at: event.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ step: 300 }}
                  />

                  <TextField
                    label="Closes at"
                    type="time"
                    size="small"
                    value={buildingEditDraft.closes_at || ''}
                    onChange={event => setBuildingEditDraft(value => ({ ...value, closes_at: event.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ step: 300 }}
                  />

                  <Typography variant="caption" sx={{ gridColumn: 'span 2', color: "var(--text-muted)" }}>
                    Hours repeat daily. A closing time before opening continues past midnight; matching times mean open 24 hours. Leave both blank when hours are unknown.
                  </Typography>

                  <FormControl size="small" sx={{ gridColumn: 'span 2' }}>
                    <Typography variant="caption" sx={{ color: "var(--text-muted)", mb: 0.5, fontWeight: 'bold' }}>
                      Linked economy business
                    </Typography>
                    <Select
                      value={buildingEditDraft.economy_business_id || ''}
                      displayEmpty
                      onChange={event => setBuildingEditDraft(value => ({ ...value, economy_business_id: event.target.value || null }))}
                      sx={{ backgroundColor: "var(--bg-surface-2)", color: "var(--text-main)" }}
                    >
                      <MenuItem value="">Match a unique business name automatically</MenuItem>
                      {buildingEditDraft.economy_business_id && !economy.businesses.some(business => String(business.id) === String(buildingEditDraft.economy_business_id)) && (
                        <MenuItem value={buildingEditDraft.economy_business_id}>Linked business unavailable</MenuItem>
                      )}
                      {economy.businesses.map(business => (
                        <MenuItem key={business.id} value={business.id}>{business.name} · {business.business_type}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <ValidatedNumberField
                    label="Elevation Offset (ft)"
                    size="small"
                    value={Number(buildingEditDraft.elevation) || 0}
                    onCommit={next => setBuildingEditDraft(value => ({ ...value, elevation: next }))}
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
                <Button variant="outlined" onClick={() => setBuildingEditDraft(null)} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none' }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={Boolean(buildingEditDraft.opens_at) !== Boolean(buildingEditDraft.closes_at)} variant="contained" sx={{ backgroundColor: "var(--accent)", color: "var(--text-on-accent)", textTransform: 'none', fontWeight: 'bold', '&:hover': { backgroundColor: "var(--accent)" } }}>
                  Save Building Changes
                </Button>
              </DialogActions>
            </Box>
          )}
        </Dialog></>

        <Dialog
          open={Boolean(buildingEvents)}
          onClose={() => setBuildingEvents(null)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              backgroundColor: "var(--bg-surface)",
              backgroundImage: 'none',
              border: "1px solid var(--border-main)",
              color: "var(--text-main)",
              p: 1
            }
          }}
        >
          {buildingEvents && (
            <>
              <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, px: 2 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: "var(--text-muted)", fontWeight: 800, display: 'block', letterSpacing: '.06em' }}>
                    CHRONICLE SCENARIO MATRIX
                  </Typography>
                  <Typography variant="h5" component="h2" sx={{ color: "var(--text-main)", fontWeight: 700, mt: -0.5 }}>
                    {selectedBuilding?.name || 'Local Landmark'} Events
                  </Typography>
                </Box>
                <IconButton onClick={() => setBuildingEvents(null)} aria-label="Close" sx={{ color: "var(--text-subtle)" }}>
                  <CloseIcon />
                </IconButton>
              </DialogTitle>

              <DialogContent sx={{ px: 2, py: 1 }}>
                <Typography variant="body2" sx={{ color: "var(--text-muted)", mb: 2, lineHeight: 1.45 }}>
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
                        backgroundColor: "var(--bg-surface)",
                        border: "1px solid var(--border-main)",
                        borderRadius: '4px',
                        color: "var(--text-main)",
                        textAlign: 'left',
                        gap: 2,
                        '&:hover': { backgroundColor: "var(--bg-surface-2)", borderColor: "var(--primary-border)" }
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ color: "var(--text-main)", fontWeight: 'bold', minWidth: '20px' }}>
                        {index + 1}
                      </Typography>
                      <Typography variant="body2" sx={{ color: "var(--text-main)", lineHeight: 1.4 }}>
                        {event}
                      </Typography>
                    </Button>
                  ))}
                </Box>
              </DialogContent>

              <DialogActions sx={{ padding: 2, px: 2 }}>
                <Button variant="outlined" onClick={() => setBuildingEvents(null)} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none' }}>
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
