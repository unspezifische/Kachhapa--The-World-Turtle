import {
  memo,
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback
} from 'react';

import {
  Button,
  Collapse,
  IconButton,
  Tooltip,
  Slider,
  Typography,
  Box,
  Select,
  MenuItem,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  Checkbox,
  FormControlLabel,
} from '@mui/material';


import EditIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

import UploadFileIcon from '@mui/icons-material/UploadFile';

import RedoIcon from '@mui/icons-material/Redo';
import UndoIcon from '@mui/icons-material/Undo';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PublicIcon from '@mui/icons-material/Public';


// Time of Day Icons
import FastRewindIcon from '@mui/icons-material/FastRewind';
import FastForwardIcon from '@mui/icons-material/FastForward';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';

// Weather Icons
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import GrainIcon from '@mui/icons-material/Grain';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import ThunderstormIcon from '@mui/icons-material/Thunderstorm';

// Icons for Camera Controls
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowLeftIcon from '@mui/icons-material/ArrowLeft';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';

import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import BabylonSettlementHost from './BabylonSettlementHost';
import { radiusToSlider, sliderToRadius, radiusStops } from './brushRadius';

import {
  terrainHeightAt,
  terrainStrokeBounds,
  insertRoadControlPoint,
  insertOpenSplineControlPoint,
  insertClosedSplineControlPoint,
  deleteSplineControlPoint,
  isFortificationTowerPoint,
  materializeFortificationTowerRoles,
  updateRoadSegments,
  updateFortificationSegment,
  wallSegmentProperties,
  restoreFortificationSegmentDefaults,
  normalizeWallTopology,
  attachedWallTower,
} from './settlementEditor';

import {
  bakeStrokesIntoTiles,
  createWorldSampler,
  ensureTile,
  tileKey,
  tileIndexAt,
  TILE_FEET,
  overwriteHeightmapIntoTiles,
} from './settlementTiles';

import HeightmapImportTool from './HeightmapImportTool';
import { ValidatedNumberField } from './ValidatedNumberInput';
import { buildingOpenStatus, linkedBusinessForBuilding } from './settlementInspection';
import { resolveLinkedRegion } from './settlementRegionLinks';
import { DEFAULT_STREET_LIGHTING } from './settlementStreetLighting';
import { applyRegionalRoadClassDefaults, regionalRoadSurfaceForSegment } from './regionRoadMaterials';
import { appendWallAndJoin, detachWallJunction, findWallSnapTarget, joinWallPoints,
  moveWallJunction, updateWallJunction } from './wallJunctions';

import './SettlementPresentation.css';
import './SettlementToolPanels.css';

const TERRAIN_SIZE_FEET = 1800;
const DEFAULT_FIRST_PERSON_SETTINGS = { sensitivity: 50, invertX: false, invertY: false, fov: 75, walkSpeed: 8, eyeHeight: 6 };
const DEFAULT_BRUSH_STRENGTHS = { raise: 8, lower: 8, flatten: 35, smooth: 35, 'set-elevation': 100, slope: 100 };

const ROAD_CLASS_DEFAULTS = {
  trail: { label: 'Trail', width: 8, surface: 'dirt' },
  alley: { label: 'Alley', width: 12, surface: 'dirt' },
  lane: { label: 'Lane', width: 18, surface: 'dirt' },
  street: { label: 'Street', width: 30, surface: 'cobblestone' },
  avenue: { label: 'Avenue', width: 48, surface: 'cobblestone' },
  highway: { label: 'Highway', width: 36, surface: 'dirt' },
};
const ROAD_SURFACE_OPTIONS = ['dirt', 'cobblestone', 'brick', 'paved', 'stone', 'wood'];


function editorBounds(referenceLayers, tileStore) {
  const authoredTiles = tileStore ? [...tileStore.values()].filter(t => !t.generated || t.dirty) : [];
  const imageLayers = (referenceLayers || []).filter(layer => layer.image_url);

  if (!authoredTiles.length && !imageLayers.length) {
    return { minX: -900, maxX: 900, minY: -900, maxY: 900, width: TERRAIN_SIZE_FEET, height: TERRAIN_SIZE_FEET };
  }

  // Pad one extra tile of margin beyond the authored extent so DynamicTerrain
  // has some procedurally-generated frontier to stream into at the edges,
  // instead of a hard cutoff exactly at the last sculpted tile.
  const tileMargin = TILE_FEET;
  const tileXs = authoredTiles.flatMap(t => [t.origin_x - tileMargin, t.origin_x + TILE_FEET + tileMargin]);
  const tileYs = authoredTiles.flatMap(t => [t.origin_y - tileMargin, t.origin_y + TILE_FEET + tileMargin]);
  const imageXs = imageLayers.flatMap(layer => [
    (Number(layer.origin_x) || 0) - Number(layer.width_feet) / 2,
    (Number(layer.origin_x) || 0) + Number(layer.width_feet) / 2,
  ]);
  const imageYs = imageLayers.flatMap(layer => [
    (Number(layer.origin_y) || 0) - Number(layer.height_feet) / 2,
    (Number(layer.origin_y) || 0) + Number(layer.height_feet) / 2,
  ]);

  const minX = Math.min(-900, ...tileXs, ...imageXs);
  const maxX = Math.max(900, ...tileXs, ...imageXs);
  const minY = Math.min(-900, ...tileYs, ...imageYs);
  const maxY = Math.max(900, ...tileYs, ...imageYs);
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

export function ToolWorkflow({
  state,
  activeTool,
  assets,
  assetKey,
  setAssetKey,
  buildMode,
  setBuildMode,
  setBuildings,
  blueprintDraft,
  setBlueprintDraft,

  pastRef,
  futureRef,

  bounds,
  showHeightmapImport,
  setShowHeightmapImport,
  heightmapPlacement,
  setHeightmapPlacement,
  activeReferenceLayer,
  commitHeightmapPlacement,

  selected,
  setSelected,
  inspectSelection,
  setInspectSelection,

  roadMode,
  setRoadMode,
  roadDraft,
  setRoadDraft,
  finishRoad,
  roadName,
  setRoadName,
  roadWidth,
  setRoadWidth,
  roadClass,
  setRoadClass,
  roadSurface,
  setRoadSurface,
  roadSnapEnabled,
  setRoadSnapEnabled,
  roadSnapToleranceFeet,
  canUndoSplineEdit,
  undoSplineEdit,

  wallWidth,
  setWallWidth,
  wallMode,
  setWallMode,
  wallDraft,
  setWallDraft,
  wallPointRole,
  setWallPointRole,
  finishWall,

  regionMode,
  setRegionMode,
  regionDraft,
  setRegionDraft,
  finishRegion,
  saveStatus,
  waterType,
  setWaterType,
  waterDraft,
  setWaterDraft,
  finishWater,
  terrainMode,
  setTerrainMode,
  brushRadius,
  setBrushRadius,
  brushStrength,
  setBrushStrength,
  targetElevation,
  setTargetElevation,
  pickTerrainElevation,
  setPickTerrainElevation,
  slopeDraft,
  setSlopeDraft,
  applySlope,
  viewCommand,
  atmosphereSettings,
  setAtmosphereSettings,
  weatherSettings,
  setWeatherSettings
}) {
  // Add local UI tracking states specifically dedicated to the input fields inside this view lifecycle
  const [localDay, setLocalDay] = useState(viewCommand?.time?.day ?? 24);
  const [localHour, setLocalHour] = useState(viewCommand?.time?.hour ?? 12);
  const [localMin, setLocalMin] = useState(viewCommand?.time?.minute ?? 0);

  const [roadSearch, setRoadSearch] = useState('');
  const [wallSearch, setWallSearch] = useState('');
  const [radiusInput, setRadiusInput] = useState(String(brushRadius));
  useEffect(() => setRadiusInput(String(brushRadius)), [brushRadius]);
  const commitRadiusInput = () => {
    const radius = Math.max(30, Math.min(2400, Number(radiusInput) || 30));
    setBrushRadius(radius);
    setRadiusInput(String(radius));
  };

  // Sync inputs dynamically if time advances smoothly via active server simulation clocks
  useEffect(() => {
    if (viewCommand?.time) {
      setLocalDay(viewCommand.time.day ?? 24);
      setLocalHour(viewCommand.time.hour ?? 12);
      setLocalMin(viewCommand.time.minute ?? 0);
    }
  }, [viewCommand]);

  // Inside your activeTool === 'inspect' condition block:
  if (activeTool === 'inspect') {
    const inspectedBuilding = inspectSelection?.entityKind === 'building' ? inspectSelection.item : null;
    const inspectedAsset = assets.find(asset => asset.key === inspectedBuilding?.asset_key);
    const linkedBusiness = inspectedBuilding
      ? linkedBusinessForBuilding(inspectedBuilding, state.businesses, state.buildings)
      : null;
    const openStatus = inspectedBuilding
      ? buildingOpenStatus(inspectedBuilding, state.time)
      : null;
    const details = inspectedBuilding ? [
      ['Building type', inspectedBuilding.building_type || inspectedAsset?.category],
      ['Business type', inspectedBuilding.business_type || linkedBusiness?.business_type],
      ['Owner', inspectedBuilding.owner_name || inspectedBuilding.owner],
      ['Affiliation', inspectedBuilding.owner_affiliation || inspectedBuilding.affiliation],
      ['District', inspectedBuilding.district_key?.replace(/[_-]+/g, ' ')],
      ['Factions', Array.isArray(inspectedBuilding.factions) ? inspectedBuilding.factions.join(', ') : inspectedBuilding.factions],
      ['Tags', Array.isArray(inspectedBuilding.tags) ? inspectedBuilding.tags.join(', ') : inspectedBuilding.tags],
      ['Rooms', Array.isArray(inspectedBuilding.rooms || inspectedAsset?.rooms)
        ? (inspectedBuilding.rooms || inspectedAsset.rooms).map(room => typeof room === 'string' ? room : room?.name).filter(Boolean).join(', ')
        : inspectedBuilding.rooms],
    ].filter(([, value]) => value) : [];

    return (
      <aside className="editor-menu inspect-menu-panel" aria-label="Inspector">
        <Typography variant="subtitle2" sx={{ color: "var(--text-muted)", fontWeight: 800, mb: 1.5, letterSpacing: '.13em' }}>
          INSPECTOR OVERVIEW
        </Typography>

        {inspectSelection ? (
          <Box className="inspect-record">
            <Typography variant="caption" sx={{ color: "var(--info)", fontWeight: 'bold', letterSpacing: '1px', mb: 0.5, fontSize: '10px' }}>
              {inspectedBuilding ? 'BUILDING RECORD' : 'FEATURE SELECTION'}
            </Typography>

            <Typography variant="h6" sx={{ fontSize: '1.2rem', color: "var(--text-main)", fontWeight: 700, lineHeight: 1.2, mb: 0.5 }}>
              {inspectedBuilding?.name || inspectSelection.name || 'Unnamed Landmark'}
            </Typography>

            <Typography variant="caption" sx={{ display: 'inline-block', fontSize: '11px', textTransform: 'uppercase', color: "var(--text-main)", mb: 1.5 }}>
              {inspectedBuilding
                ? inspectedBuilding.business_type || linkedBusiness?.business_type || inspectedBuilding.building_type || inspectedAsset?.category || 'Mapped building'
                : inspectSelection.kind || 'Point of Interest'}
            </Typography>

            {inspectedBuilding && (
              <Box className="inspect-status-row">
                <span className={`inspect-status is-${openStatus.key}`}>
                  {openStatus.label}
                  {openStatus.hours ? ` · ${openStatus.hours}` : ''}
                </span>
                <span className={`inspect-status is-${typeof linkedBusiness?.closed === 'boolean' ? (linkedBusiness.closed ? 'closed' : 'operating') : 'unknown'}`}>
                  {typeof linkedBusiness?.closed === 'boolean' ? (linkedBusiness.closed ? 'Business closed' : 'Business operating') : 'Business status unknown'}
                </span>
              </Box>
            )}

            <Typography variant="body2" sx={{ fontSize: '0.9rem', lineHeight: 1.4, color: "var(--text-main)", mb: 1.5 }}>
              {inspectedBuilding?.public_description || inspectedBuilding?.description
                || inspectSelection.public_description
                || inspectSelection.description
                || 'No description has been recorded for this location.'}
            </Typography>

            {details.length > 0 && (
              <dl className="inspect-detail-grid">
                {details.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {inspectedBuilding && (
              <Button
                className="inspect-manage-action"
                variant="outlined"
                fullWidth
                onClick={state.onManageInspectedBuilding}
                sx={{ mt: 1, textTransform: 'none', fontWeight: 'bold', color: "var(--text-main)", borderColor: "var(--border-main)" }}
              >
                {inspectedBuilding.is_blueprint ? 'Building details & levels' : 'Manage building'}
              </Button>
            )}

            <Button
              className="inspect-clear-action"
              variant="text"
              fullWidth
              onClick={() => { setInspectSelection(null); setSelected(null); }}
              sx={{ mt: 2, textTransform: 'none', fontWeight: 'bold' }}
            >
              Clear Selection
            </Button>
          </Box>
        ) : (
          <Box
            className="chart-empty"
            sx={{
              padding: '24px 8px',
              textAlign: 'center',
              color: "var(--text-muted)",
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1
            }}
          >
            <VisibilityIcon sx={{ fontSize: '2rem', color: "var(--text-on-accent)" }} />
            <Typography variant="body2" sx={{ fontSize: '0.9rem', lineHeight: 1.3 }}>
              Click directly on a mapped building, street line, or point of interest marker to display its contextual database entries.
            </Typography>
          </Box>
        )}
      </aside>
    );
  }


  // Inside your activeTool === 'road' condition block:
  if (activeTool === 'road') {
    const selectedRoad = state.roads?.find(r => r.id === state.selectedRoadId);
    const filteredRoads = state.roads?.filter(r => !roadSearch || (r.name || '').toLowerCase().includes(roadSearch.toLowerCase())) || [];
    const selectedPoint = selectedRoad?.points?.[state.selectedRoadPointIndex];

    return (
      <aside className="editor-menu road-menu secondary-editor-menu">
        <Box className="tool-mode-header road-mode-header">
          <Typography variant="subtitle2" sx={{ color: "var(--text-muted)", fontWeight: 800, mb: 1.5, letterSpacing: '.13em' }}>
            STREETS &amp; HIGHWAYS
          </Typography>
          <ToggleButtonGroup
          value={roadMode}
          exclusive
          fullWidth
          size="small"
          onChange={(e, nextMode) => {
            if (nextMode !== null) {
              if (nextMode === 'draw-new') { setRoadDraft([]); setRoadName?.(''); }
              setRoadMode(nextMode);
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
              '&.Mui-selected': { color: "var(--info)", backgroundColor: "var(--bg-surface)" }
            }
          }}
        >
          <ToggleButton value="select"><VisibilityIcon fontSize="small" /> Select</ToggleButton>
          <ToggleButton value="refine" disabled={!selectedRoad}><EditIcon fontSize="small" /> Refine</ToggleButton>
          <ToggleButton value="move-spline" disabled={!selectedRoad}><OpenInNewIcon fontSize="small" /> Move</ToggleButton>
          <ToggleButton value="draw-new"><AddIcon fontSize="small" /> Draw</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {['draw-new', 'refine', 'move-spline'].includes(roadMode) && (
          <Box sx={{ mb: 1.5, px: 0.5 }}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={roadSnapEnabled}
                  onChange={event => setRoadSnapEnabled(event.target.checked)}
                  sx={{ color: "var(--text-subtle)", '&.Mui-checked': { color: "var(--text-main)" } }}
                />
              }
              label={
                <Typography variant="caption" sx={{ color: "var(--text-main)", fontSize: '11px' }}>
                  Snap to road network
                </Typography>
              }
              sx={{ m: 0 }}
            />
            <Typography variant="caption" sx={{ display: 'block', color: "var(--text-subtle)", fontSize: '10px', ml: 4 }}>
              Snap radius: {Math.round(roadSnapToleranceFeet)} ft · automatically scales with zoom
            </Typography>
          </Box>
        )}

        {roadMode === 'refine' && selectedRoad && (
          <Typography variant="caption" sx={{ display: 'block', color: "var(--text-muted)", lineHeight: 1.4, mb: 1.5 }}>
            Click a span or point to select it; Shift-click to select several. Drag selected spans or points together, or right-click for add/delete options.
          </Typography>
        )}

        {roadMode === 'move-spline' && selectedRoad && <Typography variant="caption" sx={{ color: "var(--text-muted)", mb: 1.5 }}>
          Drag {selectedRoad.name || 'the selected road'} on the map to move it.
        </Typography>}

        {roadMode === 'refine' && selectedRoad && state.selectedRoadSegmentIndexes?.length > 0 && (() => {
          const indexes = state.selectedRoadSegmentIndexes;
          const first = selectedRoad.segments?.[indexes[0]] || {};
          const width = Number(first.width_feet ?? selectedRoad.width_feet) || 30;
          const surface = first.surface_type || selectedRoad.surface_type || 'dirt';
          const defaultModes = ['trail', 'alley'].includes(selectedRoad.road_class)
            ? ['walking', 'riding'] : ['walking', 'riding', 'carriage'];
          const modes = first.allowed_modes || defaultModes;
          const patchSegments = changes => {
            state.recordSplineUndo('road', selectedRoad);
            state.setRoads(values => values.map(road => road.id === selectedRoad.id
              ? updateRoadSegments(road, indexes, changes) : road));
          };
          return <Box sx={{ mb: 1.5, p: 1.25, border: "1px solid var(--border-main)", borderRadius: 1, backgroundColor: "var(--bg-surface)" }}>
            <Typography variant="caption" sx={{ color: "var(--text-main)", display: 'block', fontWeight: 700, mb: .75 }}>
              {indexes.length === 1 ? `Selected span ${indexes[0] + 1}` : `${indexes.length} selected spans`} · Shift-click to add or remove
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <ValidatedNumberField label="Span width (ft)" size="small" value={width} onCommit={value => {
                patchSegments({ width_feet: value });
              }} />
              <Select size="small" value={surface} onChange={event => {
                patchSegments({ surface_type: event.target.value });
              }} sx={{ backgroundColor: "var(--bg-surface-2)", color: "var(--text-main)" }}>
                {ROAD_SURFACE_OPTIONS.map(value => <MenuItem key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</MenuItem>)}
              </Select>
            </Box>
            <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'block', mt: 1 }}>Allowed travel</Typography>
            <ToggleButtonGroup size="small" value={modes} onChange={(event, value) => value.length && patchSegments({ allowed_modes: value })}>
              <ToggleButton value="walking" sx={{ color: "var(--text-main)", textTransform: 'none' }}>Walk</ToggleButton>
              <ToggleButton value="riding" sx={{ color: "var(--text-main)", textTransform: 'none' }}>Ride</ToggleButton>
              <ToggleButton value="carriage" sx={{ color: "var(--text-main)", textTransform: 'none' }}>Carriage</ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 1 }}>
              <Select size="small" aria-label="Travel direction" value={first.direction || 'both'} onChange={event => patchSegments({ direction: event.target.value })}>
                <MenuItem value="both">Two-way</MenuItem><MenuItem value="forward">Forward only</MenuItem><MenuItem value="reverse">Reverse only</MenuItem>
              </Select>
              <Select size="small" aria-label="Road status" value={first.status || 'open'} onChange={event => patchSegments({ status: event.target.value })}>
                <MenuItem value="open">Open</MenuItem><MenuItem value="closed">Closed</MenuItem>
              </Select>
              <Select size="small" aria-label="Crossing behavior" value={first.crossing || 'connect'} onChange={event => patchSegments({ crossing: event.target.value })}>
                <MenuItem value="connect">Crossings connect</MenuItem><MenuItem value="grade_separated">Bridge / no connection</MenuItem>
              </Select>
              <ValidatedNumberField label="Speed multiplier" size="small" min={0.1} max={5} inputProps={{ step: .1 }}
                value={Number(first.speed_multiplier) || 1} onCommit={value => patchSegments({ speed_multiplier: value })} />
            </Box>
          </Box>;
        })()}

        {roadMode === 'refine' && <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1.5 }}>
          <Button variant="outlined" size="small" startIcon={<UndoIcon />} disabled={!canUndoSplineEdit} onClick={undoSplineEdit} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none' }}>
            Undo Edit
          </Button>
          <Button variant="outlined" size="small" disabled={!state.selectedRoadPointIndexes?.length && state.selectedRoadPointIndex == null}
            onClick={() => { state.setSelectedRoadPointIndex(null); state.setSelectedRoadPointIndexes?.([]); }}
            sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none' }}>
            Clear Points
          </Button>
        </Box>}

        {roadMode === 'draw-new' && <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1.5 }}>
          <Box>
            <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'block', mb: 0.5 }}>New Road Class</Typography>
            <Select
              size="small"
              fullWidth
              value={roadClass}
              onChange={e => {
                const nextClass = e.target.value;
                const defaults = ROAD_CLASS_DEFAULTS[nextClass] || ROAD_CLASS_DEFAULTS.street;
                setRoadClass(nextClass);
                setRoadWidth(defaults.width);
                setRoadSurface('regional-default');
              }}
              sx={{ backgroundColor: "var(--bg-surface-2)", color: "var(--text-main)" }}
            >
              {Object.entries(ROAD_CLASS_DEFAULTS).map(([key, config]) => <MenuItem key={key} value={key}>{config.label}</MenuItem>)}
            </Select>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'block', mb: 0.5 }}>New Surface</Typography>
            <Select size="small" fullWidth value={roadSurface} onChange={e => setRoadSurface(e.target.value)} sx={{ backgroundColor: "var(--bg-surface-2)", color: "var(--text-main)" }}>
              <MenuItem value="regional-default">Region or class default</MenuItem>
              {ROAD_SURFACE_OPTIONS.map(surface => <MenuItem key={surface} value={surface}>{surface.charAt(0).toUpperCase() + surface.slice(1)}</MenuItem>)}
            </Select>
          </Box>
        </Box>}

        {/* New Width Slider Control Input packaging */}
        {roadMode === 'draw-new' && <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <span>New Width</span>
            <strong>{roadWidth} ft</strong>
          </Typography>
          <Slider
            min={4}
            max={120}
            step={2}
            value={roadWidth}
            onChange={event => setRoadWidth(Number(event.target.value))}
            sx={{ color: "var(--text-main)" }}
          />
        </Box>}

        {roadMode === 'draw-new' && <TextField label="New road name" size="small" fullWidth
          value={roadName || ''} onChange={event => setRoadName?.(event.target.value)} />}

        {/* Real-time draft spline builder buttons using CSS Grid on Box */}
        {roadMode === 'draw-new' && <Box className="spline-draft-actions" sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
          <Button variant="outlined" size="small" disabled={!roadDraft.length} onClick={() => setRoadDraft(p => p.slice(0, -1))} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)" }}>
            Undo Point
          </Button>
          <Button variant="contained" size="small" disabled={roadDraft.length < 2} onClick={finishRoad} sx={{ backgroundColor: "var(--accent)", color: "var(--text-on-accent)" }}>
            Save Road
          </Button>
        </Box>}
        {roadMode === 'draw-new' && <Box sx={{ mb: 2, color: "var(--text-muted)", fontSize: 12 }}>
          {roadDraft.length} points · Click the map to add points.
          <Button size="small" onClick={() => { setRoadDraft([]); setRoadName?.(''); setRoadMode('select'); }}>Cancel draft</Button>
        </Box>}
        {roadMode === 'draw-new' && <p role="status" className="spline-save-status">{saveStatus}</p>}

        {/* Contextual Selected Road Metadata Sub-Panel Form */}
        {
          roadMode === 'refine' && selectedRoad && (
            <Box sx={{ borderTop: "1px solid var(--border-main)", pt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Select
                  size="small"
                  value={selectedRoad.road_class || 'street'}
                  onChange={e => state.setRoads(values => values.map(road => road.id === selectedRoad.id ? { ...road, road_class: e.target.value } : road))}
                  sx={{ backgroundColor: "var(--bg-surface-2)", color: "var(--text-main)" }}
                >
                  {Object.entries(ROAD_CLASS_DEFAULTS).map(([key, config]) => <MenuItem key={key} value={key}>{config.label}</MenuItem>)}
                </Select>
                <Select
                  size="small"
                  value={selectedRoad.surface_type || 'dirt'}
                  onChange={e => state.setRoads(values => values.map(road => road.id === selectedRoad.id ? { ...road, surface_type: e.target.value } : road))}
                  sx={{ backgroundColor: "var(--bg-surface-2)", color: "var(--text-main)" }}
                >
                  {ROAD_SURFACE_OPTIONS.map(surface => <MenuItem key={surface} value={surface}>{surface.charAt(0).toUpperCase() + surface.slice(1)}</MenuItem>)}
                </Select>
              </Box>

              <TextField
                label="Rename Road"
                size="small"
                fullWidth
                value={selectedRoad.name || ''}
                onChange={e => state.setRoads(v => v.map(old => old.id === selectedRoad.id ? { ...old, name: e.target.value } : old))}
              />
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <ValidatedNumberField
                  label="Base Width (ft)"
                  size="small"
                  value={selectedRoad.width_feet ?? 30}
                  min={4} max={200} inputProps={{ step: 1 }}
                  onCommit={value => state.setRoads(values => values.map(road => road.id === selectedRoad.id ? { ...road, width_feet: value } : road))}
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    const defaults = ROAD_CLASS_DEFAULTS[selectedRoad.road_class || 'street'] || ROAD_CLASS_DEFAULTS.street;
                    state.recordSplineUndo?.('road', selectedRoad);
                    state.setRoads(values => values.map(road => road.id === selectedRoad.id
                      ? applyRegionalRoadClassDefaults(road, defaults, state.regions) : road));
                  }}
                  sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none' }}
                >
                  Apply Class Defaults
                </Button>
              </Box>

              {/* Node Point Spline Matrix Selection Array layout */}
              <Box className="road-point-picker" sx={{ display: 'flex', gap: '4px', flexWrap: 'wrap', maxHeight: '80px', overflowY: 'auto' }}>
                {selectedRoad.points.map((p, idx) => (
                  <Button
                    key={idx}
                    size="small"
                    onClick={event => {
                      const current = state.selectedRoadPointIndexes || [];
                      const next = event.shiftKey
                        ? (current.includes(idx) ? current.filter(value => value !== idx) : [...current, idx])
                        : [idx];
                      state.setSelectedRoadPointIndexes?.(next);
                      state.setSelectedRoadPointIndex(next.length === 1 ? next[0] : null);
                    }}
                    sx={{
                      minWidth: '28px',
                      height: '28px',
                      padding: 0,
                      backgroundColor: (state.selectedRoadPointIndexes || []).includes(idx) || state.selectedRoadPointIndex === idx ? "var(--accent)" : "var(--bg-surface-2)",
                      color: (state.selectedRoadPointIndexes || []).includes(idx) || state.selectedRoadPointIndex === idx ? "var(--text-on-accent)" : "var(--text-main)",
                      '&:hover': { backgroundColor: "var(--accent)" }
                    }}
                  >
                    {idx + 1}
                  </Button>
                ))}
              </Box>

              {/* Node Coordinates editor Row inputs */}
              {selectedPoint && (
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <ValidatedNumberField
                    label="Coordinate X"
                    size="small"
                    value={Math.round(selectedPoint.x)}
                    onCommit={value => state.setRoads(v => v.map(r => r.id === selectedRoad.id ? {
                      ...r,
                      points: r.points.map((pt, pi) => pi === state.selectedRoadPointIndex ? { ...pt, x: value } : pt)
                    } : r))}
                  />
                  <ValidatedNumberField
                    label="Coordinate Y"
                    size="small"
                    value={Math.round(selectedPoint.y)}
                    onCommit={value => state.setRoads(v => v.map(r => r.id === selectedRoad.id ? {
                      ...r,
                      points: r.points.map((pt, pi) => pi === state.selectedRoadPointIndex ? { ...pt, y: value } : pt)
                    } : r))}
                  />
                </Box>
              )}

              {selectedPoint && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <ValidatedNumberField
                    label="Point Width (ft)"
                    size="small"
                    value={selectedPoint.width_feet ?? selectedRoad.width_feet ?? roadWidth}
                    min={4} max={200} inputProps={{ step: 1 }}
                    onCommit={value => state.setRoads(values => values.map(road => road.id === selectedRoad.id ? {
                      ...road,
                      points: road.points.map((point, pointIndex) => pointIndex === state.selectedRoadPointIndex ? { ...point, width_feet: value } : point)
                    } : road))}
                  />
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <Button size="small" variant="outlined" onClick={() => state.setRoads(values => values.map(road => road.id === selectedRoad.id ? {
                      ...road,
                      points: road.points.map((point, pointIndex) => {
                        if (pointIndex !== state.selectedRoadPointIndex) return point;
                        const { width_feet, ...rest } = point;
                        return rest;
                      })
                    } : road))} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none' }}>
                      Use Road Width
                    </Button>
                    <Button size="small" variant="outlined" color="error"
                      disabled={state.selectedRoadPointIndex === 0 || state.selectedRoadPointIndex === selectedRoad.points.length - 1 || selectedRoad.points.length <= 2}
                      onClick={() => state.deleteSelectedSplinePoint?.('road')} sx={{ textTransform: 'none' }}>
                      Delete Point
                    </Button>
                  </Box>
                </Box>
              )}

              <Button
                variant="contained"
                color="error"
                fullWidth
                startIcon={<DeleteIcon />}
                onClick={() => { state.setRoads(v => v.filter(old => old.id !== selectedRoad.id)); state.setSelectedRoadId(null); }}
              >
                Delete Road Segment
              </Button>
            </Box>
          )
        }
        <Box className="road-existing-list">
        <TextField
          type="search"
          placeholder="Filter existing roads..."
          size="small"
          fullWidth
          value={roadSearch}
          onChange={e => setRoadSearch(e.target.value)}
          sx={{ mb: 1.5, input: { color: "var(--text-main)", fontSize: '11px' } }}
        />

        {/* Existing Streets Scrollable Stack List wrapper */}
        <Box className="street-list" sx={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', mb: selectedRoad ? 2 : 0 }}>
          {filteredRoads.map(r => (
            <Button
              key={r.id}
              fullWidth
              onClick={() => { state.setSelectedRoadId(r.id); state.setSelectedRoadPointIndex(null);
                state.setSelectedRoadPointIndexes?.([]); state.setSelectedRoadSegmentIndexes?.([]); state.setSelected(r); }}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                textTransform: 'none',
                padding: '6px 10px',
                backgroundColor: r.id === state.selectedRoadId ? "var(--bg-surface-2)" : "var(--bg-surface)",
                border: '1px solid',
                borderColor: r.id === state.selectedRoadId ? "var(--primary-border)" : "var(--border-main)",
                borderRadius: '4px',
                color: "var(--text-main)",
                textAlign: 'left',
                '&:hover': { backgroundColor: "var(--bg-surface)" }
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '12px' }}>{r.name || 'Unnamed street'}</Typography>
              <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>{r.points?.length || 0} nodes mapped</Typography>
            </Button>
          ))}
        </Box>
        </Box>

      </aside >
    );
  }


  // Inside your activeTool === 'terrain' condition block:
  if (activeTool === 'terrain') {
    return (
      <aside className="editor-menu terrain-menu">
        <Box className="tool-mode-header">
        <Typography variant="subtitle2" sx={{ color: "var(--text-muted)", fontWeight: 800, mb: 1.5, letterSpacing: '.13em' }}>
          TERRAIN SCULPT
        </Typography>

        {/* Segmented Brush Mode Ribbon */}
        <ToggleButtonGroup
          value={terrainMode}
          className="terrain-mode-controls"
          exclusive
          fullWidth
          size="small"
          onChange={(e, nextMode) => { if (nextMode !== null) setTerrainMode(nextMode); }}
          sx={{
            mb: 2.5,
            backgroundColor: "var(--bg-surface)",
            '& .MuiToggleButton-root': {
              color: "var(--text-muted)",
              borderColor: "var(--border-main)",
              fontSize: '10px',
              fontWeight: 'bold',
              '&.Mui-selected': { color: "var(--info)", backgroundColor: "var(--bg-surface)" }
            }
          }}
        >
          <ToggleButton value="raise">RAISE</ToggleButton>
          <ToggleButton value="lower">LOWER</ToggleButton>
          <ToggleButton value="flatten">FLATTEN</ToggleButton>
          <ToggleButton value="smooth">SMOOTH</ToggleButton>
          <ToggleButton value="set-elevation">SET LEVEL</ToggleButton>
          <ToggleButton value="slope">SLOPE</ToggleButton>
        </ToggleButtonGroup>
        </Box>

        {terrainMode === 'set-elevation' && <Box sx={{ display: 'grid', gap: 1 }}>
          <ValidatedNumberField label="Target elevation (ft)" size="small" value={targetElevation}
            onCommit={setTargetElevation} />
          <Button size="small" variant="outlined" onClick={() => setPickTerrainElevation(true)}>
            {pickTerrainElevation ? 'Click terrain to sample height' : 'Pick height from terrain'}
          </Button>
        </Box>}

        {terrainMode === 'slope' && <Box sx={{ display: 'grid', gap: 1 }}>
          <Typography variant="caption">Click the slope start and end on the terrain. The brush radius sets half the strip width.</Typography>
          {slopeDraft?.start && <Typography variant="caption">Start: {Math.round(slopeDraft.start.x)}, {Math.round(slopeDraft.start.y)}</Typography>}
          {slopeDraft?.end && <Typography variant="caption">End: {Math.round(slopeDraft.end.x)}, {Math.round(slopeDraft.end.y)}</Typography>}
          {slopeDraft?.start && <ValidatedNumberField label="Start elevation (ft)" size="small"
            value={slopeDraft.start_elevation_feet}
            onCommit={value => setSlopeDraft(current => ({ ...current, start_elevation_feet: value }))} />}
          {slopeDraft?.end && <ValidatedNumberField label="End elevation (ft)" size="small"
            value={slopeDraft.end_elevation_feet}
            onCommit={value => setSlopeDraft(current => ({ ...current, end_elevation_feet: value }))} />}
          {slopeDraft?.end && <Button variant="contained" onClick={applySlope}>Apply Slope</Button>}
          {slopeDraft && <Button variant="outlined" onClick={() => setSlopeDraft(null)}>Cancel Slope</Button>}
        </Box>}

        {/* History Actions using standard CSS Grid on a Box container */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1.5 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<UndoIcon />}
            disabled={!state.handleUndo || state.pastRef?.current?.length === 0}
            onClick={state.handleUndo}
            sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none' }}
          >
            Undo
          </Button>
          <Button
            variant="outlined"
            size="small"
            endIcon={<RedoIcon />}
            disabled={!state.handleRedo || state.futureRef?.current?.length === 0}
            onClick={state.handleRedo}
            sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none' }}
          >
            Redo
          </Button>
        </Box>



        {/* Sliders + Coaligned Manual Text Fields Row */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Brush Radius Controls */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>Brush Radius (ft)</Typography>
              <TextField
                type="number"
                size="small"
                value={radiusInput}
                inputProps={{ min: 30, max: 2400, 'aria-label': 'Brush radius in feet' }}
                onChange={event => setRadiusInput(event.target.value)}
                onBlur={commitRadiusInput}
                onKeyDown={event => { if (event.key === 'Enter') commitRadiusInput(); }}
                sx={{
                  width: '75px',
                  '& .MuiInputBase-input': { padding: '2px 6px', textAlign: 'right', color: "var(--text-main)", fontSize: '12px' }
                }}
              />
            </Box>
            <Slider
              min={0}
              max={100}
              step={null}
              marks={radiusStops}
              value={radiusToSlider(brushRadius)}
              valueLabelDisplay="auto"
              valueLabelFormat={() => `${brushRadius} ft`}
              getAriaValueText={() => `${brushRadius} feet`}
              aria-label="Brush radius"
              onChange={(e, val) => setBrushRadius(sliderToRadius(Number(val)))}
              sx={{
                color: "var(--text-main)", py: 1, '& .MuiSlider-mark': { opacity: 0 },
                ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`& .MuiSlider-mark[data-index="${97 + i}"]`, { opacity: 1 }])),
                '& .MuiSlider-markLabel': { color: "var(--text-muted)", fontSize: '10px' }
              }}
            />
          </Box>

          {/* Brush Strength Controls */}
          {!['set-elevation', 'slope'].includes(terrainMode) && <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
                Brush Strength {['flatten', 'smooth'].includes(terrainMode) ? '(%)' : '(ft)'}
              </Typography>
              <ValidatedNumberField
                size="small"
                value={brushStrength}
                min={1} max={100}
                onCommit={setBrushStrength}
                sx={{
                  width: '75px',
                  '& .MuiInputBase-input': { padding: '2px 6px', textAlign: 'right', color: "var(--text-main)", fontSize: '12px' }
                }}
              />
            </Box>
            <Slider
              min={1}
              max={100}
              value={brushStrength}
              onChange={(e, val) => setBrushStrength(Number(val))}
              sx={{ color: "var(--text-main)", py: 1 }}
            />
          </Box>}
        </Box>

        {/* Dynamic Descriptor Caption Helper */}
        <Typography variant="caption" sx={{ mt: 2, display: 'block', color: "var(--text-muted)", lineHeight: '1.45' }}>
          {terrainMode === 'flatten' ? 'The first point clicked anchors the elevation target for the rest of that continuous drag stroke.' :
            terrainMode === 'smooth' ? 'Averages neighboring terrain and blends toward that local shape without flattening the whole brush.' :
              terrainMode === 'set-elevation' ? 'Paint an exact elevation inside the brush, with a soft outer edge.' :
                terrainMode === 'slope' ? 'Preview a graded strip between the two points before applying it.' :
                  'Left-click and drag across the landscape grid to deform vertices. The brush circle scales automatically.'}
        </Typography>
        <Button
          variant="outlined"
          size="small"
          fullWidth
          startIcon={<UploadFileIcon />}
          onClick={() => setShowHeightmapImport(true)}
          sx={{ mt: 1, borderColor: "var(--border-main)", color: "var(--text-muted)", textTransform: 'none', fontSize: '11px' }}
        >
          Import Heightmap Image
        </Button>

        {showHeightmapImport && (
          <HeightmapImportTool
            bounds={bounds}
            placement={heightmapPlacement}
            onPlacementChange={setHeightmapPlacement}
            referenceLayer={activeReferenceLayer}
            onCommit={commitHeightmapPlacement}
            onClose={() => {
              setHeightmapPlacement(null);
              setShowHeightmapImport(false);
            }}
          />
        )}
      </aside>
    );
  }


  // Provide tools for Forticiations panel
  if (activeTool === 'fortification') {
    const selectedWall = state.fortifications?.find(r => r.id === state.selectedFortificationId);
    const filteredWalls = state.fortifications?.filter(r => !wallSearch || (r.name || '').toLowerCase().includes(wallSearch.toLowerCase())) || [];
    const selectedPoint = selectedWall?.points?.[state.selectedFortificationPointIndex];
    const selectedSegment = state.selectedFortificationSegmentIndex == null ? null
      : wallSegmentProperties(selectedWall, state.selectedFortificationSegmentIndex);

    return (
      <aside className="editor-menu road-menu secondary-editor-menu fortification-tools-panel">
        <Box className="tool-mode-header">
        <Typography variant="subtitle2" sx={{ color: "var(--text-muted)", fontWeight: 800, mb: 1.5, letterSpacing: '.13em' }}>
          FORTIFICATIONS
        </Typography>

        {/* Tab Selectors using the sleek MUI ToggleButtonGroup ribbon layout */}
        <ToggleButtonGroup
          value={wallMode}
          exclusive
          fullWidth
          size="small"
          onChange={(e, nextMode) => {
            if (nextMode !== null) {
              if (nextMode === 'draw-new') setWallDraft([]);
              setWallMode(nextMode);
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
              '&.Mui-selected': { color: "var(--info)", backgroundColor: "var(--bg-surface)" }
            }
          }}
        >
          <ToggleButton value="select"><VisibilityIcon fontSize="small" /> Select</ToggleButton>
          <ToggleButton value="refine" disabled={!selectedWall}><EditIcon fontSize="small" /> Refine</ToggleButton>
          <ToggleButton value="move-spline" disabled={!selectedWall}><OpenInNewIcon fontSize="small" /> Move</ToggleButton>
          <ToggleButton value="draw-new"><AddIcon fontSize="small" /> Draw</ToggleButton>
        </ToggleButtonGroup>
        </Box>

        {wallMode === 'refine' && selectedWall && (
          <Typography variant="caption" sx={{ display: 'block', color: "var(--text-muted)", lineHeight: 1.4, mb: 1.5 }}>
            Drag a point above the wall to reshape it. Tower points permit a corner; direction points keep the wall smooth.
          </Typography>
        )}

        {wallMode === 'move-spline' && selectedWall && <Typography variant="caption" sx={{ color: "var(--text-muted)", mb: 1.5 }}>
          Drag {selectedWall.name || 'the selected wall'} on the map to move it.
        </Typography>}

        {wallMode === 'refine' && selectedWall && state.selectedFortificationSegmentIndex != null && (
          <Box sx={{ mb: 1.5, p: 1.25, border: "1px solid var(--border-main)", borderRadius: 1, backgroundColor: "var(--bg-surface)" }}>
            <Typography variant="caption" sx={{ color: "var(--text-main)", display: 'block', fontWeight: 700, mb: .75 }}>
              Selected wall span {state.selectedFortificationSegmentIndex + 1}
            </Typography>
            <Select size="small" fullWidth value={selectedSegment.gate_type || 'none'} onChange={event => {
              state.recordSplineUndo('wall', selectedWall);
              state.setFortifications(values => values.map(wall => wall.id === selectedWall.id
                ? updateFortificationSegment(materializeFortificationTowerRoles(wall), state.selectedFortificationSegmentIndex, { gate_type: event.target.value === 'none' ? null : event.target.value })
                : wall));
            }} sx={{ backgroundColor: "var(--bg-surface-2)", color: "var(--text-main)" }}>
              <MenuItem value="none">Wall span — no gate</MenuItem>
              <MenuItem value="open">Open gate — road passage</MenuItem>
              <MenuItem value="gatehouse">Gatehouse — covered, closable passage</MenuItem>
            </Select>
            <Typography variant="caption" sx={{ display: 'block', color: "var(--text-muted)", mt: .75, lineHeight: 1.35 }}>
              A gate makes both end points tower joints automatically.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 1 }}>
              <ValidatedNumberField label="Width (ft)" size="small" value={selectedSegment.width_feet} onCommit={value => {
                state.recordSplineUndo('wall', selectedWall);
                state.setFortifications(values => values.map(wall => wall.id === selectedWall.id ? updateFortificationSegment(wall, state.selectedFortificationSegmentIndex, { width_feet: value }) : wall));
              }} />
              <ValidatedNumberField label="Height (ft)" size="small" value={selectedSegment.height_feet} onCommit={value => {
                state.recordSplineUndo('wall', selectedWall);
                state.setFortifications(values => values.map(wall => wall.id === selectedWall.id ? updateFortificationSegment(wall, state.selectedFortificationSegmentIndex, { height_feet: value }) : wall));
              }} />
              <ValidatedNumberField label="Base offset (ft)" size="small" value={selectedSegment.base_elevation_feet} onCommit={value => {
                state.recordSplineUndo('wall', selectedWall);
                state.setFortifications(values => values.map(wall => wall.id === selectedWall.id ? updateFortificationSegment(wall, state.selectedFortificationSegmentIndex, { base_elevation_feet: value }) : wall));
              }} />
              <Select size="small" value={selectedSegment.material} onChange={event => {
                state.recordSplineUndo('wall', selectedWall);
                state.setFortifications(values => values.map(wall => wall.id === selectedWall.id ? updateFortificationSegment(wall, state.selectedFortificationSegmentIndex, { material: event.target.value }) : wall));
              }} sx={{ backgroundColor: "var(--bg-surface-2)", color: "var(--text-main)" }}>
                {['stone', 'brick', 'wood', 'earth'].map(value => <MenuItem key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</MenuItem>)}
              </Select>
            </Box>
            <FormControlLabel control={<Checkbox size="small" checked={Boolean(selectedSegment.battlements)} onChange={event => {
              state.recordSplineUndo('wall', selectedWall);
              state.setFortifications(values => values.map(wall => wall.id === selectedWall.id ? updateFortificationSegment(wall, state.selectedFortificationSegmentIndex, { battlements: event.target.checked }) : wall));
            }} />} label={<Typography variant="caption">Battlements</Typography>} sx={{ mt: .5 }} />
            <Button size="small" onClick={() => state.setFortifications(values => values.map(wall => wall.id === selectedWall.id ? restoreFortificationSegmentDefaults(wall, state.selectedFortificationSegmentIndex) : wall))} sx={{ color: "var(--text-muted)", textTransform: 'none' }}>Restore wall defaults</Button>
          </Box>
        )}

        {['draw-new', 'refine', 'move-spline'].includes(wallMode) && (
          <Box sx={{ mb: 1.5, px: 0.5 }}>
            <FormControlLabel
              control={<Checkbox size="small" checked={state.wallSnapEnabled}
                onChange={event => state.setWallSnapEnabled(event.target.checked)}
                sx={{ color: "var(--text-subtle)", '&.Mui-checked': { color: "var(--text-main)" } }} />}
              label={<Typography variant="caption" sx={{ color: "var(--text-main)", fontSize: '11px' }}>Snap wall points</Typography>}
              sx={{ m: 0 }}
            />
            <Typography variant="caption" sx={{ display: 'block', color: "var(--text-subtle)", fontSize: '10px', ml: 4 }}>
              Joins to another wall node within {Math.round(state.roadSnapToleranceFeet)} ft.
            </Typography>
          </Box>
        )}

        {wallMode === 'draw-new' && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'block', mb: 0.75 }}>
              Next point type
            </Typography>
            <ToggleButtonGroup
              value={wallPointRole}
              exclusive
              fullWidth
              size="small"
              onChange={(event, value) => value && setWallPointRole(value)}
            >
              <ToggleButton value="direction" sx={{ color: "var(--text-main)", textTransform: 'none' }}>Direction</ToggleButton>
              <ToggleButton value="tower" sx={{ color: "var(--text-main)", textTransform: 'none' }}>Tower</ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" sx={{ color: "var(--text-subtle)", display: 'block', mt: 0.75, lineHeight: 1.35 }}>
              Direction points bend smoothly. Tower points can form a sharp turn. Wall ends always begin as towers.
            </Typography>
          </Box>
        )}

        {wallMode === 'refine' && <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1.5 }}>
          <Button variant="outlined" size="small" startIcon={<UndoIcon />} disabled={!canUndoSplineEdit} onClick={undoSplineEdit} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none' }}>
            Undo Edit
          </Button>
          <Button variant="outlined" size="small" disabled={state.selectedFortificationPointIndex == null} onClick={() => state.setSelectedFortificationPointIndex(null)} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none' }}>
            Clear Point
          </Button>
        </Box>}

        {/* Slider Ribbon Controls */}
        {wallMode === 'draw-new' && <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <span>New Width</span>
            <strong>{wallWidth} ft</strong>
          </Typography>
          <Slider
            min={4}
            max={120}
            step={2}
            value={wallWidth}
            onChange={event => setWallWidth(Number(event.target.value))}
            sx={{ color: "var(--text-main)" }}
          />
        </Box>}

        {/* Action Buttons using modern Box instead of deprecated Grid */}
        {wallMode === 'draw-new' && <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
          <Button variant="outlined" size="small" disabled={!wallDraft.length} onClick={() => setWallDraft(p => p.slice(0, -1))} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)" }}>
            Undo Point
          </Button>
          <Button variant="contained" size="small" disabled={wallDraft.length < 2} onClick={finishWall} sx={{ backgroundColor: "var(--accent)", color: "var(--text-on-accent)" }}>
            Finish Wall
          </Button>
        </Box>}

        {/* Selected Node Parameters Editor Metadata Box */}
        {wallMode === 'refine' && selectedWall && (
          <Box sx={{ borderTop: "1px solid var(--border-main)", pt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              label="Rename Wall"
              size="small"
              fullWidth
              value={selectedWall.name || ''}
              onChange={e => state.setFortifications(v => v.map(old => old.id === selectedWall.id ? { ...old, name: e.target.value } : old))}
            />

            {/* Node Index Picker Layout Map */}
            <Box className="road-point-picker" sx={{ display: 'flex', gap: '4px', flexWrap: 'wrap', maxHeight: '80px', overflowY: 'auto' }}>
              {selectedWall.points.map((p, idx) => (
                <Button
                  key={idx}
                  size="small"
                  onClick={() => state.setSelectedFortificationPointIndex(idx)}
                  sx={{
                    minWidth: '28px',
                    height: '28px',
                    padding: 0,
                    backgroundColor: state.selectedFortificationPointIndex === idx ? "var(--accent)" : "var(--bg-surface-2)",
                    color: state.selectedFortificationPointIndex === idx ? "var(--text-on-accent)" : "var(--text-main)",
                    '&:hover': { backgroundColor: "var(--accent)" }
                  }}
                >
                  {isFortificationTowerPoint(selectedWall, idx) ? `T${idx + 1}` : idx + 1}
                </Button>
              ))}
            </Box>

            {/* Point Coordinate Transforms Row (Box Grid replacing legacy layouts) */}
            {selectedPoint && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <ToggleButtonGroup
                  value={isFortificationTowerPoint(selectedWall, state.selectedFortificationPointIndex) ? 'tower' : 'direction'}
                  exclusive
                  fullWidth
                  size="small"
                  onChange={(event, role) => {
                    if (!role || selectedPoint.junction_id) return;
                    state.recordSplineUndo('wall', selectedWall);
                    state.setFortifications(values => values.map(wall => wall.id === selectedWall.id ? {
                      ...wall,
                      points: wall.points.map((point, index) => index === state.selectedFortificationPointIndex ? {
                        ...point,
                        tower: role === 'tower'
                      } : point)
                    } : wall));
                  }}
                >
                  <ToggleButton value="direction" disabled={!!selectedPoint.junction_id} sx={{ color: "var(--text-main)", textTransform: 'none' }}>Direction Point</ToggleButton>
                  <ToggleButton value="tower" sx={{ color: "var(--text-main)", textTransform: 'none' }}>Tower Point</ToggleButton>
                </ToggleButtonGroup>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <ValidatedNumberField
                  label="Coordinate X"
                  size="small"
                  value={Math.round(selectedPoint.x)}
                  onCommit={value => state.moveWallPoint(selectedWall.id,
                    state.selectedFortificationPointIndex, { ...selectedPoint, x: value })}
                />
                <ValidatedNumberField
                  label="Coordinate Y"
                  size="small"
                  value={Math.round(selectedPoint.y)}
                  onCommit={value => state.moveWallPoint(selectedWall.id,
                    state.selectedFortificationPointIndex, { ...selectedPoint, y: value })}
                />
                </Box>
                {selectedPoint.junction_id && <Button size="small" variant="outlined"
                  onClick={state.detachSelectedWallJunction}>Detach junction</Button>}
              </Box>
            )}

            {selectedPoint && (() => {
              const sharedTower = selectedPoint.junction_id
                ? (state.wallJunctions || []).find(junction => junction.id === selectedPoint.junction_id) : null;
              const tower = sharedTower || attachedWallTower(selectedWall, selectedPoint, state.selectedFortificationPointIndex);
              const patchTower = changes => sharedTower
                ? state.updateWallJunction(sharedTower.id, changes)
                : updateTower(changes);
              const updateTower = changes => state.setFortifications(values => values.map(original => {
                if (original.id !== selectedWall.id) return original;
                const wall = normalizeWallTopology(original);
                const pointId = wall.points[state.selectedFortificationPointIndex].point_id;
                return {
                ...wall,
                towers: tower
                  ? wall.towers.map(item => item.id === tower.id ? { ...item, ...changes } : item)
                  : [...(wall.towers || []), { id: `tower-${Date.now()}`, point_id: pointId, shape: 'circular', width_feet: 36, depth_feet: 36, height_feet: selectedWall.height_feet || 35, rotation: 0, material: selectedWall.material || 'stone', ...changes }],
                points: wall.points.map((point, index) => index === state.selectedFortificationPointIndex
                  ? { ...point, tower: true }
                  : point)
              }; }));
              return <Box sx={{ borderTop: "1px solid var(--border-main)", pt: 1.25 }}>
                <Typography variant="caption" sx={{ color: "var(--text-main)", display: 'block', fontWeight: 700, mb: .75 }}>
                  {sharedTower ? 'SHARED WALL JUNCTION' : 'PROCEDURAL TOWER'}
                </Typography>
                {!tower ? <Button size="small" variant="outlined" onClick={() => { state.recordSplineUndo('wall', selectedWall); updateTower({}); }} sx={{ textTransform: 'none', color: "var(--text-main)", borderColor: "var(--border-main)" }}>Add tower at this point</Button> : <>
                  {sharedTower && <Select size="small" fullWidth value={sharedTower.kind || 'tower'}
                    onChange={event => patchTower({ kind: event.target.value })}>
                    <MenuItem value="tower">Tower</MenuItem><MenuItem value="guardhouse">Guardhouse</MenuItem>
                  </Select>}
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <Select size="small" value={tower.shape} onChange={event => patchTower({ shape: event.target.value })} sx={{ backgroundColor: "var(--bg-surface-2)", color: "var(--text-main)" }}>
                      {['circular', 'square', 'rectangular', 'triangular', 'polygonal'].map(value => <MenuItem key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</MenuItem>)}
                    </Select>
                    <ValidatedNumberField label="Height (ft)" size="small" value={tower.height_feet} onCommit={value => patchTower({ height_feet: value })} />
                    <ValidatedNumberField label="Width (ft)" size="small" value={tower.width_feet} onCommit={value => patchTower({ width_feet: value })} />
                    <ValidatedNumberField label="Depth (ft)" size="small" value={tower.depth_feet} onCommit={value => patchTower({ depth_feet: value })} />
                    <ValidatedNumberField label="Rotation (°)" size="small" value={(tower.rotation || 0) * 180 / Math.PI} onCommit={value => patchTower({ rotation: value * Math.PI / 180 })} />
                  </Box>
                  {!sharedTower && <Button size="small" color="error" onClick={() => {
                    state.recordSplineUndo('wall', selectedWall);
                    state.setFortifications(values => values.map(wall => wall.id === selectedWall.id ? {
                      ...wall, towers: wall.towers.filter(item => item.id !== tower.id),
                      points: wall.points.map((point, index) => index === state.selectedFortificationPointIndex ? { ...point, tower: false } : point)
                    } : wall));
                  }} sx={{ mt: .5, textTransform: 'none' }}>Remove tower</Button>}
                </>}
              </Box>;
            })()}

            {selectedPoint && (
              <Button size="small" variant="outlined" color="error"
                disabled={state.selectedFortificationPointIndex === 0 || state.selectedFortificationPointIndex === selectedWall.points.length - 1 || selectedWall.points.length <= 2}
                onClick={() => state.deleteSelectedSplinePoint?.('wall')} sx={{ textTransform: 'none' }}>
                Delete Selected Point
              </Button>
            )}

            <Button
              variant="contained"
              color="error"
              fullWidth
              startIcon={<DeleteIcon />}
              onClick={() => { state.setFortifications(v => v.filter(old => old.id !== selectedWall.id)); state.setSelectedFortificationId(null); state.setSelectedFortificationPointIndex(null); state.setSelected(null); }}
            >
              Delete Wall Track
            </Button>
          </Box>
        )}
        <Box className="tool-existing-list" aria-label="Existing walls">
        <TextField
          type="search"
          placeholder="Filter existing walls..."
          size="small"
          fullWidth
          value={wallSearch}
          onChange={e => setWallSearch(e.target.value)}
          sx={{ mb: 1.5, input: { color: "var(--text-main)", fontSize: '11px' } }}
        />

        {/* Existing Spline Items List Group */}
        <Box className="street-list" sx={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', mb: selectedWall ? 2 : 0 }}>
          {filteredWalls.map(r => (
            <Button
              key={r.id}
              fullWidth
              onClick={() => { state.setSelectedFortificationId(r.id); state.setSelectedFortificationPointIndex(null); state.setSelected(r); }}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                textTransform: 'none',
                padding: '6px 10px',
                backgroundColor: r.id === state.selectedFortificationId ? "var(--bg-surface-2)" : "var(--bg-surface)",
                border: '1px solid',
                borderColor: r.id === state.selectedFortificationId ? "var(--primary-border)" : "var(--border-main)",
                borderRadius: '4px',
                color: "var(--text-main)",
                textAlign: 'left',
                '&:hover': { backgroundColor: "var(--bg-surface)" }
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '12px' }}>{r.name || 'Unnamed wall'}</Typography>
              <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>{r.points?.length || 0} nodes mapped</Typography>
            </Button>
          ))}
        </Box>

        </Box>
      </aside>
    );
  }



  const drawing = activeTool === 'road' ? {
    title: 'SPLINE ROAD',
    mode: roadMode,
    setMode: setRoadMode,
    draft: roadDraft,
    setDraft: setRoadDraft,
    finish: finishRoad, minimum: 2
  } : activeTool === 'fortification' ? {
    title: 'FORTIFICATION SPLINE',
    mode: wallMode,
    setMode: setWallMode,
    draft: wallDraft,
    setDraft: setWallDraft,
    finish: finishWall,
    minimum: 2
  } : activeTool === 'region' ? {
    title: 'REGIONS & BIOMES',
    mode: regionMode,
    setMode: setRegionMode,
    draft: regionDraft,
    setDraft: setRegionDraft,
    finish: finishRegion,
    minimum: 3
  } : null;

  // 1. Upgraded Unified Drawing Panel Fallback Template
  if (drawing) {
    return (
      <aside className="editor-menu road-menu region-tools-panel">
        <Box className="tool-mode-header">
        <Typography variant="subtitle2" sx={{ color: "var(--text-muted)", fontWeight: 800, mb: 1.5, letterSpacing: '.13em' }}>
          {drawing.title}
        </Typography>

        <ToggleButtonGroup
          value={drawing.mode}
          className={activeTool === 'region' ? 'region-mode-controls' : undefined}
          exclusive
          fullWidth
          size="small"
          onChange={(e, nextMode) => {
            if (nextMode !== null) {
              if (nextMode === 'draw-new' || nextMode === 'trace') drawing.setDraft([]);
              drawing.setMode(nextMode);
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
              '&.Mui-selected': { color: "var(--info)", backgroundColor: "var(--bg-surface)" }
            }
          }}
        >
          <ToggleButton value="select">Select</ToggleButton>
          <ToggleButton value="draw-new">Draw</ToggleButton>
          {activeTool === 'region' && <ToggleButton value="trace">Trace roads / walls</ToggleButton>}
          {activeTool === 'region' && <ToggleButton value="refine"
            disabled={!state.selectedRegionId || !!state.regions.find(region => region.id === state.selectedRegionId)?.boundary_anchors?.length}>Refine</ToggleButton>}
        </ToggleButtonGroup>
        </Box>

        {activeTool === 'road' && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <span>Width</span>
              <strong>{roadWidth} ft</strong>
            </Typography>
            <Slider
              min={4}
              max={400}
              step={2}
              value={roadWidth}
              onChange={event => setRoadWidth(Number(event.target.value))}
              sx={{ color: "var(--text-main)", py: 0.5 }}
            />
          </Box>
        )}

        {['draw-new', 'trace'].includes(drawing.mode) && <Box className="spline-draft-actions" sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <Button variant="outlined" size="small" disabled={!drawing.draft.length} onClick={() => drawing.setDraft(points => points.slice(0, -1))} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none' }}>
            Undo point
          </Button>
          <Button variant="contained" size="small" disabled={drawing.draft.length < drawing.minimum} onClick={drawing.finish} sx={{ backgroundColor: "var(--accent)", color: "var(--text-on-accent)", textTransform: 'none', fontWeight: 'bold' }}>
            {activeTool === 'region' ? 'Save Region' : 'Save Wall'}
          </Button>
        </Box>}
        {['draw-new', 'trace'].includes(drawing.mode) && <Box sx={{ mt: 1, color: "var(--text-muted)", fontSize: 12 }}>
          {drawing.draft.length} points · {drawing.mode === 'trace' ? 'Click a road or wall, then another near their crossing.' : 'Click the map to add points.'}
          <Button size="small" onClick={() => { drawing.setDraft([]); drawing.setMode('select'); }}>Cancel draft</Button>
        </Box>}
        <p role="status" className="spline-save-status">{saveStatus}</p>
        {activeTool === 'region' && <Box className="region-settings">
          <ToggleButton className="region-snap-toggle" value="snap" selected={Boolean(state.regionSnapEnabled)}
            onChange={() => state.setRegionSnapEnabled(!state.regionSnapEnabled)}
            aria-label="Snap to road and wall points">Snap to road and wall points</ToggleButton>
          <Typography variant="caption">Refine snapping radius: {Math.round(state.roadSnapToleranceFeet)} ft</Typography>
          {['select', 'refine'].includes(drawing.mode) && <Button size="small" disabled={!canUndoSplineEdit}
            onClick={undoSplineEdit}>Undo last spline edit</Button>}
          {['select', 'refine'].includes(drawing.mode) && <Typography variant="subtitle2">Region settings</Typography>}
          {['select', 'refine'].includes(drawing.mode) && (() => {
            const region = (state.regions || []).find(value => value.id === state.selectedRegionId);
            if (!region) return <p>Select a region to set building and road defaults.</p>;
            const defaults = region.construction_defaults || {};
            const lighting = {
              ...DEFAULT_STREET_LIGHTING,
              ...(region.street_lighting || {}),
              coverage_by_class: {
                ...DEFAULT_STREET_LIGHTING.coverage_by_class,
                ...(region.street_lighting?.coverage_by_class || {})
              }
            };
            const patchLighting = changes => state.setRegions(values => values.map(value => value.id === region.id
              ? { ...value, street_lighting: { ...lighting, ...changes } } : value));
            const patch = changes => state.setRegions(values => values.map(value => value.id === region.id
              ? { ...value, construction_defaults: { ...(value.construction_defaults || {}), ...changes } } : value));
            const patchRoadMaterial = (roadClass, material) => state.setRegions(values => values.map(value => {
              if (value.id !== region.id) return value;
              const next = { ...(value.road_material_defaults || {}) };
              if (material) next[roadClass] = material;
              else delete next[roadClass];
              return { ...value, road_material_defaults: next };
            }));
            const choices = ['existing', 'stone', 'wood', 'brick', 'plaster'];
            return <>
              {region.boundary_needs_repair && <p role="alert">Boundary link needs repair; the last valid outline is retained.
                {(region.boundary_edges || []).filter(edge => edge.needs_repair && edge.source_id).map(edge => ` ${edge.kind}: ${edge.source_id}`).join(' · ')}
              </p>}
              {!!region.boundary_anchors?.length && <button type="button" onClick={() => {
                state.recordSplineUndo?.('region', region);
                state.setRegions(values => values.map(value => {
                  if (value.id !== region.id) return value;
                  const { boundary_anchors, boundary_edges, boundary_needs_repair, ...freeRegion } = value;
                  return freeRegion;
                }));
              }}>Detach boundary links</button>}
              {state.selectedRegionPointIndex != null && <Button size="small" variant="outlined"
                disabled={region.points?.length <= 3 || !!region.boundary_anchors?.length}
                onClick={() => state.deleteSelectedSplinePoint('region')}>
                Delete Selected Point
              </Button>}
              <Button variant="contained" color="error" size="small" startIcon={<DeleteIcon />}
                onClick={() => {
                  if (!window.confirm(`Delete region “${region.name || region.id}”?`)) return;
                  state.recordSplineUndo('region', region);
                  state.setRegions(values => values.filter(value => value.id !== region.id));
                  state.setSelectedRegionId(null);
                  state.setSelectedRegionPointIndex(null);
                  state.setSelected(null);
                  setRegionMode('select');
                }}>Delete Region</Button>
              <TextField label="Region name" size="small" value={region.name || ''}
                onChange={event => state.setRegions(values => values.map(value => value.id === region.id
                  ? { ...value, name: event.target.value } : value))} />
              {['ground_wall', 'upper_wall', 'ground_floor', 'upper_floor'].map(key => <label key={key}>
                {key.replaceAll('_', ' ')}
                <select value={defaults[key] || 'existing'} onChange={event => patch({ [key]: event.target.value })}>
                  {[...choices, ...(key.includes('floor') ? ['packed-earth'] : [])].map(choice =>
                    <option key={choice} value={choice}>{choice.replace('-', ' ')}</option>)}
                </select>
              </label>)}
              <ValidatedNumberField label="Preferred stories" size="small" min={1} max={8}
                value={defaults.preferred_stories || 2} onCommit={value => patch({ preferred_stories: value })} />
              {['ground_use', 'upper_use'].map(key => <label key={key}>{key.replace('_', ' ')}
                <select value={defaults[key] || 'residential'} onChange={event => patch({ [key]: event.target.value })}>
                  {['residential', 'shop', 'workshop', 'storage', 'mixed'].map(choice =>
                    <option key={choice} value={choice}>{choice}</option>)}
                </select>
              </label>)}
              <p>Defaults guide future fill-in buildings; existing buildings stay as designed.</p>
              <Typography variant="subtitle2" sx={{ mt: 2 }}>Default road materials</Typography>
              <p>Used for new roads in this region and when applying class defaults. Manually chosen road materials stay as set.</p>
              {Object.entries(ROAD_CLASS_DEFAULTS).map(([roadClass, definition]) =>
                <label key={roadClass} htmlFor={`region-road-material-${roadClass}`}>
                  {definition.label}
                  <select id={`region-road-material-${roadClass}`}
                    value={region.road_material_defaults?.[roadClass] || ''}
                    onChange={event => patchRoadMaterial(roadClass, event.target.value)}>
                    <option value="">Class default ({definition.surface})</option>
                    {ROAD_SURFACE_OPTIONS.map(surface => <option key={surface} value={surface}>
                      {surface.charAt(0).toUpperCase() + surface.slice(1)}
                    </option>)}
                  </select>
                </label>)}
              <Typography variant="subtitle2" sx={{ mt: 2 }}>Street Lighting</Typography>
              <Typography variant="caption">Coverage installs a percentage of possible lamps. Broken lamps remain present but unlit.</Typography>
              {Object.entries(ROAD_CLASS_DEFAULTS).map(([roadClass, definition]) => <Box key={roadClass} sx={{ mt: 1 }}>
                <Typography variant="caption" component="label" htmlFor={`lamp-coverage-${roadClass}`}>
                  {definition.label} coverage · {lighting.coverage_by_class[roadClass]}%
                </Typography>
                <Slider min={0} max={100} step={5} value={lighting.coverage_by_class[roadClass]}
                  slotProps={{ input: { id: `lamp-coverage-${roadClass}`, 'aria-label': `${definition.label} lighting coverage` } }}
                  onChange={(_, value) => patchLighting({ coverage_by_class: { ...lighting.coverage_by_class, [roadClass]: Number(value) } })} />
              </Box>)}
              <Typography variant="caption" component="label" htmlFor="lamp-broken-percent">Broken lamps · {lighting.broken_percent}%</Typography>
              <Slider min={0} max={100} step={5} value={lighting.broken_percent}
                slotProps={{ input: { id: 'lamp-broken-percent', 'aria-label': 'Broken lamps percentage' } }}
                onChange={(_, value) => patchLighting({ broken_percent: Number(value) })} />
              <ValidatedNumberField label="Base lamp spacing (feet)" size="small" min={40} max={1000}
                value={lighting.spacing_feet} onCommit={value => patchLighting({ spacing_feet: value })} />
              <Typography variant="caption" sx={{ display: 'block' }}>Full coverage installs one lamp per {lighting.spacing_feet} feet, alternating road sides. Changes apply after the map saves.</Typography>
            </>;
          })()}
          <Box className="tool-existing-list">
            <Typography variant="subtitle2">Existing regions</Typography>
            <Box className="region-settings-list" aria-label="Existing regions" sx={{ flexDirection: 'column', maxHeight: 220, overflowY: 'auto' }}>
              {(state.regions || []).map(region => <button key={region.id} type="button"
                aria-pressed={region.id === state.selectedRegionId}
                onClick={() => { state.setSelectedRegionId(region.id); state.setSelectedRegionPointIndex(null); }}>
                {region.name || region.id}</button>)}
            </Box>
          </Box>
        </Box>}
      </aside>
    );
  }

  // 2. Upgraded Water Body Panel Configuration
  if (activeTool === 'water') {
    return (
      <aside className="editor-menu water-menu">
        <Typography variant="subtitle2" sx={{ color: "var(--text-muted)", fontWeight: 800, mb: 1.5, letterSpacing: '.13em' }}>
          WATER BODY
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'block', mb: 0.5 }}>
            Type
          </Typography>
          <Select
            size="small"
            fullWidth
            value={waterType}
            onChange={event => { setWaterType(event.target.value); setWaterDraft([]); }}
            sx={{
              backgroundColor: "var(--bg-surface-2)",
              color: "var(--text-main)",
              '.MuiOutlinedInput-notchedOutline': { borderColor: "var(--border-main)" },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: "var(--border-main)" }
            }}
          >
            <MenuItem value="river">River</MenuItem>
            <MenuItem value="lake">Lake</MenuItem>
            <MenuItem value="ocean">Ocean</MenuItem>
          </Select>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <Button variant="outlined" size="small" disabled={!waterDraft.length} onClick={() => setWaterDraft(points => points.slice(0, -1))} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none' }}>
            Undo point
          </Button>
          <Button variant="contained" size="small" disabled={waterType !== 'ocean' && waterDraft.length < (waterType === 'river' ? 2 : 3)} onClick={finishWater} sx={{ backgroundColor: "var(--accent)", color: "var(--text-on-accent)", textTransform: 'none', fontWeight: 'bold' }}>
            Finish water
          </Button>
        </Box>
      </aside>
    );
  }


  if (activeTool === 'timeOfDay') {
    const handleShift = (minutes) => {
      window.dispatchEvent(new CustomEvent('settlement-time-advance-request', {
        detail: { minutes }
      }));
    };

    const handleAbsoluteSubmit = (e) => {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('settlement-time-absolute-request', {
        detail: {
          day: Math.max(1, Number(localDay) || 1),
          hour: Math.max(0, Math.min(23, Number(localHour) || 0)),
          minute: Math.max(0, Math.min(59, Number(localMin) || 0))
        }
      }));
    };

    return (
      <aside className="editor-menu time-of-day-menu">
        <Typography variant="subtitle2" sx={{ color: "var(--text-main)", fontWeight: 800, mb: 1.5, letterSpacing: '.06em' }}>
          TIME OF DAY TRACKING
        </Typography>

        {/* Grid Matrix layout replacing custom floats or flex tables */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            columnGap: 1,
            rowGap: 1.5, // spacing={1} plus the old mt: 0.5 on the second row
            mb: 2,
          }}
        >
          <Button variant="contained" fullWidth size="small" onClick={() => handleShift(-1440)} startIcon={<CalendarTodayIcon sx={{ fontSize: 12 }} />} sx={{ backgroundColor: "var(--bg-surface-2)", fontSize: '10px' }}>
            Day
          </Button>
          <Button variant="contained" fullWidth size="small" onClick={() => handleShift(-720)} startIcon={<FastRewindIcon />} sx={{ backgroundColor: "var(--bg-surface-2)", fontSize: '10px' }}>
            12h
          </Button>
          <Button variant="contained" fullWidth size="small" onClick={() => handleShift(-60)} startIcon={<NavigateBeforeIcon />} sx={{ backgroundColor: "var(--bg-surface-2)", fontSize: '10px' }}>
            Hour
          </Button>
          <Button variant="contained" fullWidth size="small" onClick={() => handleShift(60)} endIcon={<NavigateNextIcon />} sx={{ backgroundColor: "var(--bg-surface-2)", fontSize: '10px' }}>
            Hour
          </Button>
          <Button variant="contained" fullWidth size="small" onClick={() => handleShift(720)} endIcon={<FastForwardIcon />} sx={{ backgroundColor: "var(--bg-surface-2)", fontSize: '10px' }}>
            12h
          </Button>
          <Button variant="contained" fullWidth size="small" onClick={() => handleShift(1440)} endIcon={<CalendarTodayIcon sx={{ fontSize: 12 }} />} sx={{ backgroundColor: "var(--bg-surface-2)", fontSize: '10px' }}>
            Day
          </Button>
        </Box>

        {/* Manual Timeline Overrides */}
        <Box
          component="form"
          onSubmit={handleAbsoluteSubmit}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            borderTop: "1px solid var(--border-main)",
            pt: 1.5
          }}
        >
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label="Day"
              type="number"
              size="small"
              inputProps={{ min: 1 }}
              value={localDay}
              onChange={e => setLocalDay(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Hour"
              type="number"
              size="small"
              inputProps={{ min: 0, max: 23 }}
              value={localHour}
              onChange={e => setLocalHour(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Min"
              type="number"
              size="small"
              inputProps={{ min: 0, max: 59 }}
              value={localMin}
              onChange={e => setLocalMin(e.target.value)}
              sx={{ flex: 1 }}
            />
          </Box>

          <Button
            type="submit"
            variant="contained"
            fullWidth
            sx={{
              backgroundColor: "var(--accent)",
              color: "var(--text-on-accent)",
              fontWeight: 'bold',
              '&:hover': { backgroundColor: "var(--accent)" }
            }}
          >
            Apply Manual Override
          </Button>
        </Box>
      </aside>
    );
  }
  if (activeTool === 'atmosphere' && atmosphereSettings) {
    const fogStartRatio = atmosphereSettings.fogStartRatio ?? 0.92;
    const fogEndRatio = atmosphereSettings.fogEndRatio ?? 1.03;

    return (
      <aside className="editor-menu atmosphere-menu">
        <Typography variant="subtitle2" sx={{ color: "var(--text-muted)", fontWeight: 800, mb: 2, letterSpacing: '.13em' }}>
          ATMOSPHERE PLUGIN
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'flex', justifyContent: 'space-between' }}>
              <span>Sun Light Glare</span>
              <strong>{atmosphereSettings.sunIntensity.toFixed(1)}x</strong>
            </Typography>
            <Slider
              min={0.5}
              max={5.0}
              step={0.1}
              value={atmosphereSettings.sunIntensity}
              onChange={e => setAtmosphereSettings(prev => ({ ...prev, sunIntensity: Number(e.target.value) }))}
              sx={{ color: "var(--text-main)" }}
            />
          </Box>

          <Box>
            <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'flex', justifyContent: 'space-between' }}>
              <span>Moon Base Glow</span>
              <strong>{Math.round(atmosphereSettings.moonIntensity * 100)}%</strong>
            </Typography>
            <Slider
              min={0.0}
              max={1.0}
              step={0.05}
              value={atmosphereSettings.moonIntensity}
              onChange={e => setAtmosphereSettings(prev => ({ ...prev, moonIntensity: Number(e.target.value) }))}
              sx={{ color: "var(--text-main)" }}
            />
          </Box>

          <Box>
            <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'flex', justifyContent: 'space-between' }}>
              <span>Rayleigh Scattering</span>
              <strong>{atmosphereSettings.scatteringScale.toFixed(1)}</strong>
            </Typography>
            <Slider
              min={0.2}
              max={3.0}
              step={0.1}
              value={atmosphereSettings.scatteringScale}
              onChange={e => setAtmosphereSettings(prev => ({ ...prev, scatteringScale: Number(e.target.value) }))}
              sx={{ color: "var(--text-main)" }}
            />
          </Box>

          <Box>
            <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'flex', justifyContent: 'space-between' }}>
              <span>Daylight Color</span>
              <strong>{Math.round((atmosphereSettings.daylightSaturation ?? 1.12) * 100)}%</strong>
            </Typography>
            <Slider
              min={0.8}
              max={1.4}
              step={0.01}
              value={atmosphereSettings.daylightSaturation ?? 1.12}
              onChange={e => setAtmosphereSettings(prev => ({ ...prev, daylightSaturation: Number(e.target.value) }))}
              sx={{ color: "var(--text-main)" }}
            />
            <Typography variant="caption" sx={{ color: "var(--text-subtle)", fontSize: '10px' }}>
              Adds color during daylight without tinting moonlit scenes.
            </Typography>
          </Box>

          <Box sx={{ borderTop: "1px solid var(--border-main)", pt: 1.5 }}>
            <Typography
              variant="caption"
              sx={{
                color: "var(--text-muted)",
                display: 'block',
                mb: 1.5,
                fontWeight: 700,
                letterSpacing: '.08em'
              }}
            >
              DISTANCE OCCLUSION
            </Typography>

            <Box sx={{ mb: 2 }}>
              <Typography
                variant="caption"
                sx={{
                  color: "var(--text-muted)",
                  display: 'flex',
                  justifyContent: 'space-between'
                }}
              >
                <span>Fog Start</span>
                <strong>{Math.round(fogStartRatio * 100)}% of view</strong>
              </Typography>

              <Slider
                min={0.60}
                max={1.20}
                step={0.01}
                value={fogStartRatio}
                valueLabelDisplay="auto"
                valueLabelFormat={value => `${Math.round(value * 100)}%`}
                onChange={(e, value) => {
                  const start = Number(value);

                  setAtmosphereSettings(prev => ({
                    ...prev,
                    fogStartRatio: start,

                    // Never allow full fog to precede the start.
                    fogEndRatio: Math.max(
                      prev.fogEndRatio ?? 1.03,
                      start + 0.02
                    )
                  }));
                }}
                sx={{ color: "var(--text-main)" }}
              />

              <Typography
                variant="caption"
                sx={{ color: "var(--text-subtle)", fontSize: '10px' }}
              >
                Distance from the camera at which atmospheric fading begins.
              </Typography>
            </Box>

            <Box>
              <Typography
                variant="caption"
                sx={{
                  color: "var(--text-muted)",
                  display: 'flex',
                  justifyContent: 'space-between'
                }}
              >
                <span>Fog Full</span>
                <strong>{Math.round(fogEndRatio * 100)}% of view</strong>
              </Typography>

              <Slider
                min={Math.max(0.70, fogStartRatio + 0.02)}
                max={1.50}
                step={0.01}
                value={fogEndRatio}
                valueLabelDisplay="auto"
                valueLabelFormat={value => `${Math.round(value * 100)}%`}
                onChange={(e, value) =>
                  setAtmosphereSettings(prev => ({
                    ...prev,
                    fogEndRatio: Number(value)
                  }))
                }
                sx={{ color: "var(--text-main)" }}
              />

              <Typography
                variant="caption"
                sx={{ color: "var(--text-subtle)", fontSize: '10px' }}
              >
                Distance at which terrain is completely hidden by atmosphere.
              </Typography>
            </Box>
          </Box>
        </Box>
      </aside >
    );
  }


  if (activeTool === 'weather' && weatherSettings) {
    const handlePresetChange = (e) => {
      const preset = e.target.value;
      let fallbackFog = 0.002;
      let fallbackColor = "#a9c9dc";
      let fallbackClouds = 0.0;
      let visualPreset = {
        cloudType: 'fair-cumulus', cloudBaseFeet: 4200, cloudTopFeet: 7200,
        windDirectionDegrees: 245, windSpeedMph: 8, precipitationIntensity: 0
      };

      if (preset === 'light-drizzle') {
        fallbackClouds = 0.4; fallbackFog = 0.008;
        visualPreset = { cloudType: 'stratus', cloudBaseFeet: 1800, cloudTopFeet: 4300, windDirectionDegrees: 235, windSpeedMph: 12, precipitationIntensity: 0.32 };
      } else if (preset === 'pouring-rain') {
        fallbackClouds = 0.8; fallbackFog = 0.012;
        visualPreset = { cloudType: 'nimbostratus', cloudBaseFeet: 1200, cloudTopFeet: 6500, windDirectionDegrees: 225, windSpeedMph: 18, precipitationIntensity: 0.78 };
      } else if (preset === 'foggy') {
        fallbackClouds = 0.5; fallbackFog = 0.045; fallbackColor = "#cbd5e1";
        visualPreset = { cloudType: 'ground-fog', cloudBaseFeet: 0, cloudTopFeet: 220, windDirectionDegrees: 250, windSpeedMph: 3, precipitationIntensity: 0 };
      } else if (preset === 'snowing') {
        fallbackClouds = 0.7; fallbackFog = 0.015; fallbackColor = "#e2e8f0";
        visualPreset = { cloudType: 'nimbostratus', cloudBaseFeet: 1600, cloudTopFeet: 6200, windDirectionDegrees: 220, windSpeedMph: 10, precipitationIntensity: 0.58 };
      } else if (preset === 'thunderstorm') {
        fallbackClouds = 1.0; fallbackFog = 0.025; fallbackColor = "#1e293b";
        visualPreset = { cloudType: 'cumulonimbus', cloudBaseFeet: 1100, cloudTopFeet: 22000, windDirectionDegrees: 210, windSpeedMph: 28, precipitationIntensity: 1 };
      }

      setWeatherSettings(prev => ({
        ...prev,
        ...visualPreset,
        activeWeather: preset,
        cloudCover: fallbackClouds,
        fogDensity: fallbackFog,
        fogColor: fallbackColor
      }));
    };

    return (
      <aside className="editor-menu weather-menu">
        <Typography variant="subtitle2" sx={{ color: "var(--text-muted)", fontWeight: 800, mb: 2, letterSpacing: '.13em' }}>
          WEATHER SYSTEM MATRIX
        </Typography>

        <Box>
          <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'block', mb: 0.5 }}>
            Condition Selection
          </Typography>
          <Select
            size="small"
            fullWidth
            value={weatherSettings.activeWeather}
            onChange={handlePresetChange}
            sx={{
              backgroundColor: "var(--bg-surface-2)",
              color: "var(--text-main)",
              '.MuiOutlinedInput-notchedOutline': { borderColor: "var(--border-main)" },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: "var(--border-main)" },
              '& .MuiSelect-select': { display: 'flex', alignItems: 'center', gap: '8px' } // Aligns selected value icon + text
            }}
          >
            <MenuItem value="clear" sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <WbSunnyIcon fontSize="small" sx={{ color: "var(--text-main)" }} /> Clear Skies
            </MenuItem>
            <MenuItem value="light-drizzle" sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GrainIcon fontSize="small" sx={{ color: "var(--info)" }} /> Light Drizzle
            </MenuItem>
            <MenuItem value="pouring-rain" sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <WaterDropIcon fontSize="small" sx={{ color: "var(--info)" }} /> Pouring Rain
            </MenuItem>
            <MenuItem value="foggy" sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CloudQueueIcon fontSize="small" sx={{ color: "var(--text-muted)" }} /> Thick Fog
            </MenuItem>
            <MenuItem value="snowing" sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AcUnitIcon fontSize="small" sx={{ color: "var(--text-main)" }} /> Snowing
            </MenuItem>
            <MenuItem value="thunderstorm" sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ThunderstormIcon fontSize="small" sx={{ color: "var(--text-muted)" }} /> Thunderstorm
            </MenuItem>
          </Select>
        </Box>


        <Box>
          <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'flex', justifyContent: 'space-between' }}>
            <span>Cloud Density</span>
            <strong>{Math.round((weatherSettings.cloudCover ?? 0) * 100)}%</strong>
          </Typography>
          <Slider
            min={0.0}
            max={1.0}
            step={0.05}
            value={weatherSettings.cloudCover ?? 0}
            onChange={e => setWeatherSettings(prev => ({ ...prev, cloudCover: Number(e.target.value) }))}
            sx={{ color: "var(--text-main)" }}
          />
        </Box>

        <Box>
          <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'flex', justifyContent: 'space-between' }}>
            <span>Fog / Haze Strength</span>
            <strong>{Math.round(Math.max(0, Math.min(1, ((weatherSettings.fogDensity ?? 0.01) - 0.001) / 0.059)) * 100)}%</strong>
          </Typography>
          <Slider
            min={0.001}
            max={0.06}
            step={0.001}
            value={weatherSettings.fogDensity}
            onChange={e => setWeatherSettings(prev => ({ ...prev, fogDensity: Number(e.target.value) }))}
            sx={{ color: "var(--text-main)" }}
          />
        </Box>

        <Box>
          <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'flex', justifyContent: 'space-between' }}>
            <span>Environment Volume</span>
            <strong>{Math.round((weatherSettings.masterVolume ?? 0.5) * 100)}%</strong>
          </Typography>
          <Slider
            min={0.0}
            max={1.0}
            step={0.05}
            value={weatherSettings.masterVolume ?? 0.5}
            onChange={e => setWeatherSettings(prev => ({ ...prev, masterVolume: Number(e.target.value) }))}
            sx={{ color: "var(--text-main)" }}
          />
        </Box>

        <details style={{ borderTop: "1px solid var(--border-main)", paddingTop: '10px' }}>
          <summary style={{ color: "var(--text-muted)", cursor: 'pointer', fontSize: '11px', fontWeight: 700, letterSpacing: '.08em' }}>
            ADVANCED WEATHER
          </summary>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1.5 }}>
            <Select
              size="small"
              value={weatherSettings.cloudType ?? 'fair-cumulus'}
              onChange={e => setWeatherSettings(prev => ({ ...prev, cloudType: e.target.value }))}
              sx={{ color: "var(--text-main)", '.MuiOutlinedInput-notchedOutline': { borderColor: "var(--border-main)" } }}
            >
              <MenuItem value="fair-cumulus">Fair cumulus</MenuItem>
              <MenuItem value="stratus">Stratus</MenuItem>
              <MenuItem value="nimbostratus">Nimbostratus</MenuItem>
              <MenuItem value="cumulonimbus">Cumulonimbus</MenuItem>
              <MenuItem value="ground-fog">Ground fog</MenuItem>
            </Select>

            <Box>
              <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'flex', justifyContent: 'space-between' }}>
                <span>Cloud Base</span><strong>{Math.round(weatherSettings.cloudBaseFeet ?? 4200).toLocaleString()} ft</strong>
              </Typography>
              <Slider min={0} max={12000} step={100} value={weatherSettings.cloudBaseFeet ?? 4200}
                onChange={e => setWeatherSettings(prev => ({ ...prev, cloudBaseFeet: Number(e.target.value) }))} sx={{ color: "var(--text-main)" }} />
            </Box>

            <Box>
              <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'flex', justifyContent: 'space-between' }}>
                <span>Cloud Top</span><strong>{Math.round(weatherSettings.cloudTopFeet ?? 7200).toLocaleString()} ft</strong>
              </Typography>
              <Slider min={100} max={30000} step={100} value={weatherSettings.cloudTopFeet ?? 7200}
                onChange={e => setWeatherSettings(prev => ({ ...prev, cloudTopFeet: Number(e.target.value) }))} sx={{ color: "var(--text-main)" }} />
            </Box>

            <Box>
              <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'flex', justifyContent: 'space-between' }}>
                <span>Precipitation</span><strong>{Math.round((weatherSettings.precipitationIntensity ?? 0) * 100)}%</strong>
              </Typography>
              <Slider min={0} max={1} step={0.05} value={weatherSettings.precipitationIntensity ?? 0}
                onChange={e => setWeatherSettings(prev => ({ ...prev, precipitationIntensity: Number(e.target.value) }))} sx={{ color: "var(--text-main)" }} />
            </Box>

            <Box>
              <Typography variant="caption" sx={{ color: "var(--text-muted)", display: 'flex', justifyContent: 'space-between' }}>
                <span>Wind</span><strong>{Math.round(weatherSettings.windSpeedMph ?? 8)} mph</strong>
              </Typography>
              <Slider min={0} max={60} step={1} value={weatherSettings.windSpeedMph ?? 8}
                onChange={e => setWeatherSettings(prev => ({ ...prev, windSpeedMph: Number(e.target.value) }))} sx={{ color: "var(--text-main)" }} />
            </Box>
          </Box>
        </details>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
          <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
            Fog Tint Color
          </Typography>
          <input
            type="color"
            value={weatherSettings.fogColor}
            onChange={e => setWeatherSettings(prev => ({ ...prev, fogColor: e.target.value }))}
            style={{
              border: "1px solid var(--border-main)",
              borderRadius: '4px',
              background: 'none',
              cursor: 'pointer',
              width: '40px',
              height: '24px'
            }}
          />
        </Box>
      </aside>
    );
  }

  return null;
}

// ******************************************************************************
// Functions to control map elements- navigation, camera, ToD, Weather, etc.
// ******************************************************************************

function NavigationControlPanel({ viewCommand, setMapEnvironment }) {
  const [isMinimized, setIsMinimized] = useState(true);
  // const stateRef = useRef(new Set());

  // Custom pipeline to set state values on the global engine window context
  const setVirtualKey = (keyName, isPressed) => {
    window.dispatchEvent(new CustomEvent('settlement-virtual-key-update', {
      detail: { key: keyName, pressed: isPressed }
    }));
  };

  const handleCommand = (modeType) => {
    // Dispatch instant structural updates back to state frameworks
    // Top-down pushes orbit variables; firstPerson engages gravity on-foot locking
    window.dispatchEvent(new CustomEvent('settlement-camera-command-trigger', {
      detail: { mode: modeType }
    }));
  };


  return (
    <Box
      className={`nav-control-panel-wrapper ${isMinimized ? 'minimized' : ''}`}
      sx={{
        position: 'absolute',
        bottom: '16px',
        right: '16px',
        zIndex: 100,
        width: '180px',
        // The outer container now owns ALL the chrome (bg, border, shadow),
        // which eliminates the old "panel inside a panel" double-outline look
        backgroundColor: "var(--overlay)",
        border: "1px solid var(--border-main)",
        borderRadius: '6px',
        boxShadow: "0 8px 22px var(--border-main)",
        backdropFilter: 'blur(6px)',
        overflow: 'hidden',
      }}
    >
      {/* ── Integrated header: title + collapse toggle share one bar ── */}
      <Box
        component="button"
        type="button"
        onClick={() => setIsMinimized(v => !v)}
        aria-expanded={!isMinimized}
        aria-label={isMinimized ? 'Expand navigation panel' : 'Minimize navigation panel'}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          width: '100%',
          px: 1.25,
          py: 0.75,
          margin: 0,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: "var(--text-main)",
          fontFamily: 'inherit',
          '&:hover': { backgroundColor: "var(--overlay)" },
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '10px', letterSpacing: '.13em', color: "var(--text-muted)" }}>
          CAMERA NAV
        </Typography>
        {isMinimized
          ? <ExpandLessIcon sx={{ fontSize: 18 }} />
          : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
      </Box>

      {/* ── Collapsible body ── */}
      <Collapse in={!isMinimized} timeout={180}>
        <Box
          className="nav-panel-content"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            padding: '10px 12px 12px',
            borderTop: "1px solid var(--border-main)",
          }}
        >
          {/* Mode Perspective Changers Ribbon */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: '4px' }}>
            <Tooltip title="Top Down View" arrow placement="top">
              <IconButton
                size="small"
                onClick={() => handleCommand('topdown')}
                sx={{ flex: 1, color: "var(--text-main)", border: "1px solid var(--border-main)", borderRadius: '4px', '&:hover': { backgroundColor: "var(--accent)", color: "var(--text-on-accent)" } }}
              >
                <CenterFocusStrongIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="1st Person Mode" arrow placement="top">
              <IconButton
                size="small"
                onClick={() => handleCommand('firstPerson')}
                sx={{ flex: 1, color: "var(--text-main)", border: "1px solid var(--border-main)", borderRadius: '4px', '&:hover': { backgroundColor: "var(--accent)", color: "var(--text-on-accent)" } }}
              >
                <VisibilityIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Orbit Camera" arrow placement="top">
              <IconButton
                size="small"
                onClick={() => handleCommand('camera')}
                sx={{ flex: 1, color: "var(--text-main)", border: "1px solid var(--border-main)", borderRadius: '4px', '&:hover': { backgroundColor: "var(--accent)", color: "var(--text-on-accent)" } }}
              >
                <PublicIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          {/* D-Pad Translation Matrix via Native CSS Grid */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gridTemplateRows: 'repeat(3, 32px)',
              gap: '4px',
              justifyItems: 'center',
              alignItems: 'center',
            }}
          >
            <Button
              onMouseDown={() => setVirtualKey('w', true)} onMouseUp={() => setVirtualKey('w', false)} onMouseLeave={() => setVirtualKey('w', false)}
              sx={{ gridColumn: '2', width: '100%', height: '100%', minWidth: 0, padding: 0, color: "var(--text-main)", border: "1px solid var(--border-main)", '&:hover': { backgroundColor: "var(--accent)", color: "var(--text-on-accent)" } }}
            >
              <ArrowDropUpIcon />
            </Button>
            <Button
              onMouseDown={() => setVirtualKey('a', true)} onMouseUp={() => setVirtualKey('a', false)} onMouseLeave={() => setVirtualKey('a', false)}
              sx={{ gridRow: '2', gridColumn: '1', width: '100%', height: '100%', minWidth: 0, padding: 0, color: "var(--text-main)", border: "1px solid var(--border-main)", '&:hover': { backgroundColor: "var(--accent)", color: "var(--text-on-accent)" } }}
            >
              <ArrowLeftIcon />
            </Button>
            <Button
              onMouseDown={() => setVirtualKey('s', true)} onMouseUp={() => setVirtualKey('s', false)} onMouseLeave={() => setVirtualKey('s', false)}
              sx={{ gridRow: '3', gridColumn: '2', width: '100%', height: '100%', minWidth: 0, padding: 0, color: "var(--text-main)", border: "1px solid var(--border-main)", '&:hover': { backgroundColor: "var(--accent)", color: "var(--text-on-accent)" } }}
            >
              <ArrowDropDownIcon />
            </Button>
            <Button
              onMouseDown={() => setVirtualKey('d', true)} onMouseUp={() => setVirtualKey('d', false)} onMouseLeave={() => setVirtualKey('d', false)}
              sx={{ gridRow: '2', gridColumn: '3', width: '100%', height: '100%', minWidth: 0, padding: 0, color: "var(--text-main)", border: "1px solid var(--border-main)", '&:hover': { backgroundColor: "var(--accent)", color: "var(--text-on-accent)" } }}
            >
              <ArrowRightIcon />
            </Button>
          </Box>

          {/* Orbit Rotations, Pitch Tilts, and Elevate Utilities Stack */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
              <Button size="small" variant="outlined" onMouseDown={() => setVirtualKey('q', true)} onMouseUp={() => setVirtualKey('q', false)} startIcon={<UndoIcon sx={{ scale: '0.8' }} />} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none', fontSize: '10px', padding: '2px' }}>
                Q
              </Button>
              <Button size="small" variant="outlined" onMouseDown={() => setVirtualKey('e', true)} onMouseUp={() => setVirtualKey('e', false)} endIcon={<RedoIcon sx={{ scale: '0.8' }} />} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none', fontSize: '10px', padding: '2px' }}>
                E
              </Button>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
              <Button size="small" variant="outlined" onMouseDown={() => setVirtualKey('r', true)} onMouseUp={() => setVirtualKey('r', false)} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none', fontSize: '10px', padding: '2px' }}>
                Tilt Up (R)
              </Button>
              <Button size="small" variant="outlined" onMouseDown={() => setVirtualKey('f', true)} onMouseUp={() => setVirtualKey('f', false)} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none', fontSize: '10px', padding: '2px' }}>
                Tilt Dn (F)
              </Button>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
              <Button size="small" variant="outlined" onMouseDown={() => setVirtualKey('shift', true)} onMouseUp={() => setVirtualKey('shift', false)} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none', fontSize: '9px', padding: '2px' }}>
                Raise (Shift)
              </Button>
              <Button size="small" variant="outlined" onMouseDown={() => setVirtualKey('lower', true)} onMouseUp={() => setVirtualKey('lower', false)} sx={{ color: "var(--text-main)", borderColor: "var(--border-main)", textTransform: 'none', fontSize: '9px', padding: '2px' }}>
                Lower (Ctrl)
              </Button>
            </Box>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}

// This function is the main component for editing the settlement map, handling various tools and interactions.
function SettlementMapEditor({
  pauseScene = false,
  simulation,
  npcTokens = [],
  placementNpcId = null,
  selectedNpcTokenId = null,
  onNpcPlacementPoint = () => {},
  onNpcSelect = () => {},
  activeTool,
  buildMode = 'place-asset',
  setBuildMode = () => { },
  atmosphereSettings = {
    sunIntensity: 2.2,
    moonIntensity: 0.15,
    scatteringScale: 1.0,
    daylightSaturation: 1.12,
    fogStartRatio: 0.92,
    fogEndRatio: 1.03,
  },
  setAtmosphereSettings,
  weatherSettings = { activeWeather: 'clear', cloudCover: 0, fogDensity: 0.01, fogColor: '#a9c9dc' },
  setWeatherSettings,
  assets = [],
  buildings = [],
  setBuildings = () => { },
  recordBuildingMove = () => { },
  properties = [],
  propertyDraft = [],
  editingPropertyBoundaryId = null,
  onPropertyBoundaryVertexMove = () => { },
  onPropertyPolygonPoint = () => { },
  onPropertyBoundarySelect = () => { },
  onPropertyBoundaryOpeningMove = () => { },
  selectedBoundaryOpeningId = null,
  selectedBoundarySegmentId = null,
  movingBoundaryOpening = false,

  tileStore,
  onTilesDirtied = () => { },
  tileStoreVersion = 0,

  selected,
  setSelected,
  inspectSelection,
  setInspectSelection = () => { },
  buildingViewMode = 'satellite',
  businesses = [],
  onManageInspectedBuilding = () => { },
  roads = [],
  setRoads = () => { },
  strokes = [],
  setStrokes = () => { },
  heightMap = null,
  setHeightMap = () => { },
  blueprintDraft = null,
  setBlueprintDraft = () => { },
  footprintTool = 'line',
  footprintPoints = [],
  setFootprintPoints = () => { },
  setFootprintError = () => { },
  blueprintHoverPoint = null,
  setBlueprintHoverPoint = () => { },
  waterBodies = [],
  setWaterBodies = () => { },
  mapEnvironment = {},
  setMapEnvironment = () => { },
  setFortifications = () => { },
  lamps = [],
  partyPosition,
  destination,
  plannedRoute,
  journeyPositions = [],
  accessPointBuildingId,
  onTravelAccessMove = () => {},
  onTravelAccessEnd = () => {},
  onWaypoint = () => { },
  referenceLayers = [],
  referencePlacement = null,
  referenceCalibrationMode = false,
  setReferencePlacement = () => { },
  onReferencePoint = () => { },
  calibrationPoints = [],
  fitRequest = 0,
  onMapContext = () => { },
  onCameraChange = null,
  saveStatus = '',

  viewCommand = null,
  labelState = { ids: [], showAll: false },
  pointsOfInterest = [],
  campaignName = '',
  onSceneReady = () => { },
  onFirstFrame = () => { },
  onTerrainReady = () => { },
  loadDebug = null
}) {
  const [assetKey, setAssetKey] = useState(assets[0]?.key || '');

  const [terrainMode, setTerrainMode] = useState('raise')
  const [brushRadius, setBrushRadius] = useState(110)
  const [brushStrengths, setBrushStrengths] = useState(DEFAULT_BRUSH_STRENGTHS);
  const [targetElevation, setTargetElevation] = useState(100);
  const [pickTerrainElevation, setPickTerrainElevation] = useState(false);
  const [slopeDraft, setSlopeDraft] = useState(null);
  const [showHeightmapImport, setShowHeightmapImport] = useState(false);
  const [heightmapPlacement, setHeightmapPlacement] = useState(null);

  const [roadMode, setRoadMode] = useState('select')
  const [roadDraft, setRoadDraft] = useState([])
  const [roadName, setRoadName] = useState('');
  const [roadWidth, setRoadWidth] = useState(ROAD_CLASS_DEFAULTS.street.width);
  const [roadClass, setRoadClass] = useState('street');
  const [roadSurface, setRoadSurface] = useState('regional-default');
  const [roadSnapEnabled, setRoadSnapEnabled] = useState(true);
  const [splineHoverPoint, setSplineHoverPoint] = useState(null);

  const [wallMode, setWallMode] = useState('select')
  const [wallDraft, setWallDraft] = useState([]);
  const [wallWidth, setWallWidth] = useState(36);
  const [wallPointRole, setWallPointRole] = useState('direction');
  const [wallSnapEnabled, setWallSnapEnabled] = useState(true);

  const [regionMode, setRegionMode] = useState('select')
  const [regionSnapEnabled, setRegionSnapEnabled] = useState(true);
  const [regionDraft, setRegionDraft] = useState([]);
  const [waterType, setWaterType] = useState('river')
  const [waterDraft, setWaterDraft] = useState([]);

  const [selectedRoadId, setSelectedRoadId] = useState(null);
  const [selectedRoadPointIndex, setSelectedRoadPointIndex] = useState(null); // 👈 ADD THIS
  const [selectedRoadPointIndexes, setSelectedRoadPointIndexes] = useState([]);
  const [selectedRoadSegmentIndexes, setSelectedRoadSegmentIndexes] = useState([]);

  const [selectedFortificationId, setSelectedFortificationId] = useState(null);
  const [selectedFortificationPointIndex, setSelectedFortificationPointIndex] = useState(null); // 👈 ADD THIS
  const [selectedFortificationSegmentIndex, setSelectedFortificationSegmentIndex] = useState(null);

  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [selectedRegionPointIndex, setSelectedRegionPointIndex] = useState(null);

  const [splineContextMenu, setSplineContextMenu] = useState(null);
  const splineHistoryRef = useRef([]);
  const [splineHistoryVersion, setSplineHistoryVersion] = useState(0);

  const recordSplineUndo = useCallback((kind, item) => {
    if (!item?.id) return;
    splineHistoryRef.current.push(kind === 'wall'
      ? { kind: 'wall-environment', id: item.id, before: JSON.parse(JSON.stringify({
        fortifications: mapEnvironment.fortifications || [], wall_junctions: mapEnvironment.wall_junctions || [] })) }
      : { kind, id: item.id, before: JSON.parse(JSON.stringify(item)) });
    if (splineHistoryRef.current.length > 60) splineHistoryRef.current.shift();
    setSplineHistoryVersion(value => value + 1);
  }, [mapEnvironment.fortifications, mapEnvironment.wall_junctions]);

  const undoSplineEdit = useCallback(() => {
    const entry = splineHistoryRef.current.pop();
    if (!entry) return;
    if (entry.kind === 'road') {
      setRoads(values => values.map(road => road.id === entry.id ? entry.before : road));
      setSelectedRoadId(entry.id);
      setSelectedRoadPointIndex(null);
      setSelectedRoadPointIndexes([]);
      setSelected(entry.before);
    } else if (entry.kind === 'wall-environment') {
      setMapEnvironment(current => ({ ...current, ...entry.before }));
      setSelectedFortificationId(entry.id);
      setSelectedFortificationPointIndex(null);
      setSelected(entry.before.fortifications.find(wall => wall.id === entry.id) || null);
    } else if (entry.kind === 'region') {
      setMapEnvironment(value => ({ ...value, regions: (value.regions || []).some(region => region.id === entry.id)
        ? (value.regions || []).map(region => region.id === entry.id ? entry.before : region)
        : [...(value.regions || []), entry.before] }));
      setSelectedRegionId(entry.id);
      setSelectedRegionPointIndex(null);
    }
    setSplineHistoryVersion(value => value + 1);
  }, [setRoads, setFortifications, setSelected, setMapEnvironment]);


  const [virtualKeys, setVirtualKeys] = useState(new Set());
  const [localViewCommand, setLocalViewCommand] = useState(null);
  const [, setPointerLocked] = useState(false);
  const [scaleIndicator, setScaleIndicator] = useState({ feet: 100, pixels: 100 });
  const roadSnapToleranceFeet = useMemo(
    () => Math.max(8, Math.min(120, (Number(scaleIndicator.feet) || 100) * 0.35)),
    [scaleIndicator.feet]
  );
  const [cameraDebug, setCameraDebug] = useState(null);
  const [performanceDebug, setPerformanceDebug] = useState(null);
  const onCameraChangeRef = useRef(onCameraChange);
  const latestCameraPayloadRef = useRef(null);
  const cameraUpdateTimerRef = useRef(null);

  useEffect(() => {
    onCameraChangeRef.current = onCameraChange;
  }, [onCameraChange]);

  const flushCameraChange = useCallback(() => {
    cameraUpdateTimerRef.current = null;
    const payload = latestCameraPayloadRef.current;
    if (!payload) return;
    setCameraDebug(payload);
    onCameraChangeRef.current?.(payload);
  }, []);

  const handleCameraChange = useCallback((payload) => {
    latestCameraPayloadRef.current = payload;
    if (cameraUpdateTimerRef.current === null) {
      cameraUpdateTimerRef.current = setTimeout(flushCameraChange, 100);
    }
  }, [flushCameraChange]);

  useEffect(() => () => {
    if (cameraUpdateTimerRef.current !== null) {
      clearTimeout(cameraUpdateTimerRef.current);
    }
  }, []);

  const [firstPersonSettings] = useState(DEFAULT_FIRST_PERSON_SETTINGS);
  // const touchInputRef = useRef({ lookX: 0, lookY: 0, moveX: 0, moveY: 0, sprint: false });

  const [boundsExpansion, setBoundsExpansion] = useState({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  const lastExpansionRef = useRef(0);           // throttle guard

  const baseBounds = useMemo(
    () => {
      // tileStore is intentionally mutable; reading the revision here makes
      // authored/imported frontier tiles participate in the recomputation.
      void tileStoreVersion;
      return editorBounds(referenceLayers, tileStore);
    },
    [referenceLayers, tileStore, tileStoreVersion]
  );

  const activeReferenceLayer = useMemo(
    () => referenceLayers.find(layer => layer.visible !== false && layer.image_url) || null,
    [referenceLayers]
  );

  const bounds = useMemo(() => {
    const minX = baseBounds.minX - boundsExpansion.minX;
    const maxX = baseBounds.maxX + boundsExpansion.maxX;
    const minY = baseBounds.minY - boundsExpansion.minY;
    const maxY = baseBounds.maxY + boundsExpansion.maxY;
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
  }, [baseBounds, boundsExpansion]);

  // Called by the camera system when the target nears an edge
  const handleBoundsExpansion = useCallback((flags) => {
    const now = Date.now();
    if (now - lastExpansionRef.current < 2000) return;   // 2 s cooldown
    lastExpansionRef.current = now;

    const EXPAND_FT = 300;
    setBoundsExpansion(prev => {
      const next = { ...prev };
      let changed = false;
      if (flags.minX) { next.minX += EXPAND_FT; changed = true; }
      if (flags.maxX) { next.maxX += EXPAND_FT; changed = true; }
      if (flags.minY) { next.minY += EXPAND_FT; changed = true; }
      if (flags.maxY) { next.maxY += EXPAND_FT; changed = true; }
      return changed ? next : prev;
    });
  }, []);

  const commitHeightmapPlacement = useCallback(() => {
    if (!heightmapPlacement) return;
    const { touched } = overwriteHeightmapIntoTiles(tileStore, heightmapPlacement);
    if (touched.size) onTilesDirtied(touched);
    setHeightmapPlacement(null);
    setShowHeightmapImport(false);
  }, [heightmapPlacement, onTilesDirtied, tileStore]);


  const brushMeshRef = useRef(null);

  const setRegions = useCallback(updater => setMapEnvironment(value => ({ ...value,
    regions: typeof updater === 'function' ? updater(value.regions || []) : updater })), [setMapEnvironment]);
  const regions = useMemo(() => (mapEnvironment.regions || []).filter(Boolean), [mapEnvironment.regions]);
  const fortifications = useMemo(() => mapEnvironment.fortifications || [], [mapEnvironment.fortifications]);
  const wallJunctions = useMemo(() => mapEnvironment.wall_junctions || [], [mapEnvironment.wall_junctions]);
  const moveWallPoint = (wallId, index, point) => setMapEnvironment(current =>
    moveWallJunction(current, wallId, index, point));
  const commitWallPointSnap = (wallId, index) => {
    if (!wallSnapEnabled) return;
    setMapEnvironment(current => {
      const point = current.fortifications?.find(wall => wall.id === wallId)?.points?.[index];
      if (!point) return current;
      const target = findWallSnapTarget(point, current.fortifications, wallId, roadSnapToleranceFeet);
      return target ? joinWallPoints(current, wallId, index, target.wall.id, target.index) : current;
    });
  };
  const detachSelectedWallJunction = () => {
    if (selectedFortificationPointIndex == null) return;
    const wall = fortifications.find(value => value.id === selectedFortificationId);
    if (!wall?.points?.[selectedFortificationPointIndex]?.junction_id) return;
    recordSplineUndo('wall', wall);
    setMapEnvironment(current => detachWallJunction(current, wall.id, selectedFortificationPointIndex));
  };

  useEffect(() => {
    if (!regions.some(region => region.boundary_anchors?.length)) return;
    setMapEnvironment(current => {
      const next = (current.regions || []).map(region => resolveLinkedRegion(region, roads,
        current.fortifications || []));
      return JSON.stringify(next) === JSON.stringify(current.regions || [])
        ? current : { ...current, regions: next };
    });
  }, [roads, mapEnvironment.fortifications, regions, setMapEnvironment]);

  const deleteSelectedSplinePoint = useCallback((kind) => {
    if (kind === 'road') {
      const road = roads.find(value => value.id === selectedRoadId);
      if (!road || selectedRoadPointIndex == null) return;
      const updated = deleteSplineControlPoint(road, selectedRoadPointIndex);
      if (updated === road) return;
      recordSplineUndo('road', road);
      setRoads(values => values.map(value => value.id === road.id ? updated : value));
      setSelectedRoadPointIndex(null);
      setSelectedRoadPointIndexes([]);
    } else if (kind === 'wall') {
      const wall = fortifications.find(value => value.id === selectedFortificationId);
      if (!wall || selectedFortificationPointIndex == null) return;
      const updated = deleteSplineControlPoint(materializeFortificationTowerRoles(wall), selectedFortificationPointIndex);
      if (updated === wall) return;
      recordSplineUndo('wall', wall);
      setFortifications(values => values.map(value => value.id === wall.id ? updated : value));
      setSelectedFortificationPointIndex(null);
    } else if (kind === 'region') {
      const region = regions.find(value => value.id === selectedRegionId);
      if (!region || selectedRegionPointIndex == null || region.boundary_anchors?.length) return;
      const updated = deleteSplineControlPoint(region, selectedRegionPointIndex,
        { protectEndpoints: false, minimumPoints: 3 });
      if (updated === region) return;
      recordSplineUndo('region', region);
      setRegions(values => values.map(value => value.id === region.id ? updated : value));
      setSelectedRegionPointIndex(null);
    }
  }, [roads, selectedRoadId, selectedRoadPointIndex, fortifications, selectedFortificationId,
    selectedFortificationPointIndex, regions, selectedRegionId, selectedRegionPointIndex,
    recordSplineUndo, setRoads, setFortifications, setRegions]);

  const applySplineContextAction = useCallback((action) => {
    const menu = splineContextMenu;
    if (!menu) return;
    if (action === 'add') {
      if (menu.kind === 'road') {
        const road = roads.find(value => value.id === menu.id);
        if (road) {
          recordSplineUndo('road', road);
          let insertionPoint = menu.point;
          if (Number.isInteger(menu.index) && road.points.length > 1) {
            const neighborIndex = menu.index < road.points.length - 1 ? menu.index + 1 : menu.index - 1;
            const neighbor = road.points[neighborIndex];
            const selectedPoint = road.points[menu.index];
            insertionPoint = { x: (selectedPoint.x + neighbor.x) / 2, y: (selectedPoint.y + neighbor.y) / 2 };
          }
          const updated = insertRoadControlPoint(road, insertionPoint);
          let index = null;
          for (let i = 0; i < updated.points.length; i += 1) {
            if (i >= road.points.length || updated.points[i] !== road.points[i]) { index = i; break; }
          }
          setRoads(values => values.map(value => value.id === road.id ? updated : value));
          setSelectedRoadId(road.id);
          setSelectedRoadPointIndex(index);
          setSelectedRoadPointIndexes(index == null ? [] : [index]);
        }
      } else if (menu.kind === 'wall') {
        const wall = fortifications.find(value => value.id === menu.id);
        if (wall) {
          recordSplineUndo('wall', wall);
          let insertionPoint = menu.point;
          if (Number.isInteger(menu.index) && wall.points.length > 1) {
            const neighborIndex = menu.index < wall.points.length - 1 ? menu.index + 1 : menu.index - 1;
            const neighbor = wall.points[neighborIndex];
            const selectedPoint = wall.points[menu.index];
            insertionPoint = { x: (selectedPoint.x + neighbor.x) / 2, y: (selectedPoint.y + neighbor.y) / 2 };
          }
          const result = insertOpenSplineControlPoint(materializeFortificationTowerRoles(wall), insertionPoint, { tower: false });
          setFortifications(values => values.map(value => value.id === wall.id ? result.item : value));
          setSelectedFortificationId(wall.id);
          setSelectedFortificationPointIndex(result.index);
        }
      } else if (menu.kind === 'region') {
        const region = regions.find(value => value.id === menu.id);
        if (region && !region.boundary_anchors?.length) {
          let insertionPoint = menu.point;
          if (Number.isInteger(menu.index) && region.points.length > 1) {
            const selectedPoint = region.points[menu.index];
            const neighbor = region.points[(menu.index + 1) % region.points.length];
            insertionPoint = { x: (selectedPoint.x + neighbor.x) / 2, y: (selectedPoint.y + neighbor.y) / 2 };
          }
          const result = insertClosedSplineControlPoint(region, insertionPoint);
          if (result.index != null) {
            recordSplineUndo('region', region);
            setRegions(values => values.map(value => value.id === region.id ? result.item : value));
            setSelectedRegionId(region.id);
            setSelectedRegionPointIndex(result.index);
          }
        }
      }
    } else if (action === 'delete' && Number.isInteger(menu.index)) {
      if (menu.kind === 'road') {
        const road = roads.find(value => value.id === menu.id);
        if (road) {
          const updated = deleteSplineControlPoint(road, menu.index);
          if (updated !== road) {
            recordSplineUndo('road', road);
            setRoads(values => values.map(value => value.id === road.id ? updated : value));
            setSelectedRoadPointIndex(null);
            setSelectedRoadPointIndexes([]);
          }
        }
      } else if (menu.kind === 'wall') {
        const wall = fortifications.find(value => value.id === menu.id);
        if (wall) {
          const updated = deleteSplineControlPoint(materializeFortificationTowerRoles(wall), menu.index);
          if (updated !== wall) {
            recordSplineUndo('wall', wall);
            setFortifications(values => values.map(value => value.id === wall.id ? updated : value));
            setSelectedFortificationPointIndex(null);
          }
        }
      } else if (menu.kind === 'region') {
        const region = regions.find(value => value.id === menu.id);
        if (region && !region.boundary_anchors?.length) {
          const updated = deleteSplineControlPoint(region, menu.index,
            { protectEndpoints: false, minimumPoints: 3 });
          if (updated !== region) {
            recordSplineUndo('region', region);
            setRegions(values => values.map(value => value.id === region.id ? updated : value));
            setSelectedRegionPointIndex(null);
          }
        }
      }
    }
    setSplineContextMenu(null);
  }, [splineContextMenu, roads, fortifications, regions, recordSplineUndo,
    setRoads, setFortifications, setRegions]);


  const terrainMaterial = useMemo(() => ({
    sea_level_feet: Number(mapEnvironment.sea_level_feet) || 0,
    snow_line_feet: Number(mapEnvironment.terrain_material?.snow_line_feet ?? 900),
    snow_blend_feet: Number(mapEnvironment.terrain_material?.snow_blend_feet ?? 500),
    cliff_normal_threshold: Number(mapEnvironment.terrain_material?.cliff_normal_threshold ?? .86),
    regions
  }), [mapEnvironment, regions]);

  // ********************************************** //
  // Functions for terrain sculpting with Undo/Redo //
  // ********************************************** //

  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const gestureStartSnapshotRef = useRef(null);
  const gestureTileSnapshotRef = useRef(null);
  const gestureStrokesRef = useRef([]);
  const pendingStrokePreviewRef = useRef([]);
  const strokePreviewFrameRef = useRef(null);
  const lastStrokePreviewRef = useRef(0);

  const flushStrokePreview = useCallback(timestamp => {
    if (timestamp - lastStrokePreviewRef.current < 28) {
      strokePreviewFrameRef.current = requestAnimationFrame(flushStrokePreview);
      return;
    }
    strokePreviewFrameRef.current = null;
    if (!pendingStrokePreviewRef.current.length) return;
    lastStrokePreviewRef.current = timestamp;
    const batch = pendingStrokePreviewRef.current;
    pendingStrokePreviewRef.current = [];
    setStrokes(previous => [...previous, ...batch]);
  }, [setStrokes]);

  useEffect(() => () => {
    if (strokePreviewFrameRef.current !== null) cancelAnimationFrame(strokePreviewFrameRef.current);
  }, []);

  const onSculptStroke = stroke => {
    const next = {
      ...stroke,
      mode: terrainMode,
      delta: terrainMode === 'raise' ? brushStrength : terrainMode === 'lower' ? -brushStrength : 0,
      amount: terrainMode === 'flatten' || terrainMode === 'smooth' ? brushStrength / 100 : undefined,
      ...(terrainMode === 'set-elevation' ? { target_elevation_feet: targetElevation } : {}),
      ...(terrainMode === 'smooth' ? { smoothing_version: 2 } : {})
    };

    gestureStrokesRef.current.push(next);
    pendingStrokePreviewRef.current.push(next);
    // Pointer events can arrive much faster than the display can present
    // frames. Coalesce them into one React update per animation frame.
    if (strokePreviewFrameRef.current === null) {
      strokePreviewFrameRef.current = requestAnimationFrame(flushStrokePreview);
    }
  };

  const onSculptStart = () => {
    gestureStrokesRef.current = [];
    pendingStrokePreviewRef.current = [];
    if (strokePreviewFrameRef.current !== null) {
      cancelAnimationFrame(strokePreviewFrameRef.current);
      strokePreviewFrameRef.current = null;
    }
  };

  const onSculptEnd = () => {
    if (strokePreviewFrameRef.current !== null) {
      cancelAnimationFrame(strokePreviewFrameRef.current);
      strokePreviewFrameRef.current = null;
    }
    pendingStrokePreviewRef.current = [];
    const strokes = gestureStrokesRef.current;
    if (!strokes || strokes.length === 0) return;

    // Snapshot only the tiles THIS gesture could actually touch, not the
    // whole tile store — grab each one's pre-bake values before we mutate it.
    const beforeTiles = [];
    const seen = new Set();
    strokes.forEach(stroke => {
      const bounds = terrainStrokeBounds(stroke);
      const t0 = tileIndexAt(bounds.minX, bounds.minY), t1 = tileIndexAt(bounds.maxX, bounds.maxY);
      for (let tz = t0.tz; tz <= t1.tz; tz++) for (let tx = t0.tx; tx <= t1.tx; tx++) {
        const key = tileKey(tx, tz);
        if (seen.has(key)) continue;
        seen.add(key);
        const tile = ensureTile(tileStore, tx, tz);
        if (tile) beforeTiles.push({ key, values: tile.values.slice() });
      }
    });

    const touchedKeys = bakeStrokesIntoTiles(tileStore, strokes);

    if (beforeTiles.length > 0) {
      const changedBefore = beforeTiles.filter(t => touchedKeys.has(t.key));
      if (changedBefore.length > 0) {
        pastRef.current.push(changedBefore.map(t => ({
          key: t.key,
          values: new Float32Array(t.values),
        })));
        if (pastRef.current.length > 30) pastRef.current.shift();
        futureRef.current = [];
      }
    }

    onTilesDirtied(touchedKeys);
    setStrokes([]);
    gestureStrokesRef.current = [];
    gestureTileSnapshotRef.current = null;
    gestureStartSnapshotRef.current = null;
  };

  const handleUndo = () => {
    const snap = pastRef.current.pop();
    if (!snap || snap.length === 0) return;

    // Save current tile state for redo
    const redoEntries = snap.map(entry => {
      const t = tileStore.get(entry.key);
      return {
        key: entry.key,
        values: t ? new Float32Array(t.values) : null,
      };
    }).filter(e => e.values);
    futureRef.current.push(redoEntries);

    // Restore tile values
    snap.forEach(entry => {
      const t = tileStore.get(entry.key);
      if (t) t.values.set(entry.values);
    });
    onTilesDirtied(new Set(snap.map(entry => entry.key)));

    // Clear strokes → triggers Babylon refresh
    setStrokes([]);
  };

  const handleRedo = () => {
    const snap = futureRef.current.pop();
    if (!snap || snap.length === 0) return;

    const undoEntries = snap.map(entry => {
      const t = tileStore.get(entry.key);
      return {
        key: entry.key,
        values: t ? new Float32Array(t.values) : null,
      };
    }).filter(e => e.values);
    pastRef.current.push(undoEntries);

    snap.forEach(entry => {
      const t = tileStore.get(entry.key);
      if (t) t.values.set(entry.values);
    });
    onTilesDirtied(new Set(snap.map(entry => entry.key)));

    setStrokes([]);
  };

  const sampleTerrainHeight = useMemo(() => tileStore
    ? createWorldSampler(tileStore, () => strokes, () => heightmapPlacement, { materializeMissing: false })
    : (x, y) => terrainHeightAt(strokes, x, y, heightMap),
    [tileStore, strokes, heightmapPlacement, heightMap]);

  const sampleCommittedHeight = (x, y) => createWorldSampler(tileStore, () => [], () => heightmapPlacement,
    { materializeMissing: false })(x, y);
  const onPickTerrainElevation = point => {
    setTargetElevation(Math.round(sampleCommittedHeight(point.x, point.y)));
    setPickTerrainElevation(false);
  };
  const onSlopePoint = point => {
    const elevation = Math.round(sampleCommittedHeight(point.x, point.y));
    setSlopeDraft(current => !current?.start || current.end
      ? { start: { x: point.x, y: point.y }, start_elevation_feet: elevation }
      : { ...current, end: { x: point.x, y: point.y }, end_elevation_feet: elevation });
  };
  const slopeStroke = slopeDraft?.start && slopeDraft?.end ? {
    id: `slope-preview`, mode: 'slope',
    x: slopeDraft.start.x, y: slopeDraft.start.y,
    end_x: slopeDraft.end.x, end_y: slopeDraft.end.y,
    start_elevation_feet: slopeDraft.start_elevation_feet,
    end_elevation_feet: slopeDraft.end_elevation_feet,
    radius: brushRadius
  } : null;
  useEffect(() => {
    if (terrainMode === 'slope') setStrokes(slopeStroke ? [slopeStroke] : []);
    else if (slopeDraft) {
      setSlopeDraft(null);
      setStrokes([]);
    }
  }, [terrainMode, slopeDraft, brushRadius]); // slope preview is transient; committed heights live in tiles
  const applySlope = () => {
    if (!slopeStroke || Math.hypot(slopeStroke.end_x - slopeStroke.x, slopeStroke.end_y - slopeStroke.y) < 1) return;
    onSculptStart();
    onSculptStroke({ ...slopeStroke, id: `slope-${Date.now()}` });
    onSculptEnd();
    setSlopeDraft(null);
  };

  // ********************************************************* //
  // Hook listeners to intercept virtual panels actions safely //
  // ********************************************************* //
  useEffect(() => {
    const handleKeyUpdate = (e) => {
      const orbitBreakingKeys = new Set(['q', 'e', 'r', 'f', 'shift', 'lower']);

      if (e.detail.pressed && orbitBreakingKeys.has(e.detail.key.toLowerCase())) {
        // If the player is locked on-foot but hits an orbiting utility button,
        // force a camera breakout action to Orbit Cam mode
        setLocalViewCommand(prev => {
          if (prev?.mode === 'firstPerson') {
            return { mode: 'camera', nonce: Date.now() };
          }
          return prev;
        });
      }

      setVirtualKeys(prev => {
        const next = new Set(prev);
        if (e.detail.pressed) next.add(e.detail.key);
        else next.delete(e.detail.key);
        return next;
      });
    };

    const handleCommandUpdate = (e) => {
      // If the command is a structural perspective shift away from 'firstPerson',
      // make sure we notify the parent tree immediately
      setLocalViewCommand({ ...e.detail, nonce: Date.now() });
    };

    window.addEventListener('settlement-virtual-key-update', handleKeyUpdate);
    window.addEventListener('settlement-camera-command-trigger', handleCommandUpdate);
    return () => {
      window.removeEventListener('settlement-virtual-key-update', handleKeyUpdate);
      window.removeEventListener('settlement-camera-command-trigger', handleCommandUpdate);
    };
  }, []);

  useEffect(() => {
    if (activeTool !== 'terrain') return;

    // Grab handle references to your interactive control panel panels
    const toolPanel = document.querySelector('.terrain-menu'); // Maps to your panel class selector
    const brushMesh = brushMeshRef.current;

    const hideBrush = () => { if (brushMesh) brushMesh.setEnabled(false); };

    if (toolPanel) {
      // If the cursor rolls inside the panel boundary box, force-kill the WebGL preview mesh
      toolPanel.addEventListener('mouseenter', hideBrush);
    }

    return () => {
      if (toolPanel) {
        toolPanel.removeEventListener('mouseenter', hideBrush);
      }
    };
  }, [activeTool]);

  const activeViewCommand = localViewCommand || viewCommand, firstPerson = activeViewCommand?.mode === 'firstPerson', brushStrength = brushStrengths[terrainMode];

  const finishRoad = () => {
    if (roadDraft.length < 2) return;
    const id = `road-${Date.now()}`;
    const classSurface = ROAD_CLASS_DEFAULTS[roadClass]?.surface || ROAD_CLASS_DEFAULTS.street.surface;
    const segments = roadDraft.slice(1).map((_, index) => ({ width_feet: roadWidth,
      surface_type: roadSurface === 'regional-default'
        ? regionalRoadSurfaceForSegment(roadDraft, index, roadClass, regions, classSurface)
        : roadSurface }));
    setRoads(values => [...values, { id, name: roadName.trim() || `New road ${values.length + 1}`,
      road_class: roadClass, surface_type: roadSurface === 'regional-default' ? classSurface : roadSurface,
      width_feet: roadWidth, segments, opacity: .78, visible: true, points: roadDraft }]);
    setSelectedRoadId(id);
    setSelectedRoadPointIndex(null);
    setSelectedRoadPointIndexes([]);
    setSelectedRoadSegmentIndexes([]);
    setRoadDraft([]);
    setRoadName('');
    setSplineHoverPoint(null);
    setRoadMode('refine');
  };

  const finishWall = () => {
    if (wallDraft.length < 2) return;
    const points = wallDraft.map((point, index) => ({
      ...point,
      tower: index === 0 || index === wallDraft.length - 1 ? true : point.tower === true
    }));
    setMapEnvironment(current => {
      const wall = { id: `wall-${Date.now()}`,
        name: `New wall ${(current.fortifications || []).length + 1}`, wall_type: 'city_wall',
        width_feet: wallWidth, height_feet: 35, visible: true, points };
      return wallSnapEnabled ? appendWallAndJoin(current, wall)
        : { ...current, fortifications: [...(current.fortifications || []), wall] };
    });
    setWallDraft([]);
    setWallMode('select');
  };

  const finishRegion = () => {
    if (regionDraft.length < 3) return;
    const id = `region-${Date.now()}`;
    setRegions(values => {
      const region = { id, name: `New region ${values.length + 1}`, region_type: 'grassland', visible: true,
        points: regionDraft.map(({ x, y }) => ({ x, y })),
        ...(regionMode === 'trace' ? { boundary_anchors: regionDraft } : {}) };
      return [...values, regionMode === 'trace' ? resolveLinkedRegion(region, roads, fortifications) : region];
    });
    setSelectedRegionId(id);
    setRegionDraft([]);
    setSplineHoverPoint(null);
    setRegionMode('select');
  };

  const finishWater = () => {
    if (waterType !== 'ocean' && waterDraft.length < (waterType === 'river' ? 2 : 3)) return;
    setWaterBodies(values => [...values.filter(body => waterType !== 'ocean' || body.water_type !== 'ocean'), { id: `water-${Date.now()}`, name: `New ${waterType}`, water_type: waterType, width_feet: 30, depth_feet: 5, surface_elevation_feet: terrainMaterial.sea_level_feet, points: waterDraft }]);
    setWaterDraft([]);
  };

  useEffect(() => {
    if (viewCommand) setLocalViewCommand(viewCommand);
  }, [viewCommand]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('settlement-first-person-change', { detail: firstPerson }));
  }, [firstPerson]);

  useEffect(() => {
    if (!['build', 'inspect', 'player'].includes(activeTool)) setSelected?.(null);
    setSelectedRoadId(null);
    setSelectedRoadPointIndexes([]);
    setSelectedFortificationId(null);
    setSelectedRegionId(null);
    setSelectedRegionPointIndex(null);
    setSplineContextMenu(null);
  }, [activeTool, setSelected]);

  useEffect(() => {
    const onKeyDown = event => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z' || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;
      if (!['road', 'fortification'].includes(activeTool)) return;
      event.preventDefault();
      undoSplineEdit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTool, undoSplineEdit]);

  const state = {
    npcTokens,
    placementNpcId,
    selectedNpcTokenId,
    onNpcPlacementPoint,
    onNpcSelect,
    activeTool,
    time: simulation?.time || viewCommand?.time || { hour: 12, minute: 0 },
    celestial: simulation?.celestial || { moons: [] },

    terrainMaterial,
    atmosphereSettings,
    weatherSettings,

    pastRef,
    futureRef,

    assets,
    buildings,
    properties,
    propertyDraft,
    editingPropertyBoundaryId,
    onPropertyBoundaryVertexMove,
    onPropertyPolygonPoint,
    onPropertyBoundarySelect,
    onPropertyBoundaryOpeningMove,
    selectedBoundaryOpeningId,
    selectedBoundarySegmentId,
    movingBoundaryOpening,
    setBuildings,
    recordBuildingMove,
    blueprintDraft,
    setBlueprintDraft,
    blueprintHoverPoint,
    footprintTool, footprintPoints, setFootprintPoints, setFootprintError,
    setBlueprintHoverPoint,

    selected,
    setSelected,
    inspectSelection,
    setInspectSelection,
    buildingViewMode,
    businesses,
    onManageInspectedBuilding,
    roads,
    setRoads,
    strokes,
    heightMap,
    setHeightMap,
    waterBodies,
    setWaterBodies,
    bounds,
    regions,
    setRegions,
    fortifications,
    wallJunctions,
    setFortifications,
    moveWallPoint,
    commitWallPointSnap,
    detachSelectedWallJunction,
    updateWallJunction: (id, changes) => setMapEnvironment(current => updateWallJunction(current, id, changes)),
    roadMode,
    roadSnapEnabled,
    roadSnapToleranceFeet,
    recordSplineUndo,
    openSplineContextMenu: setSplineContextMenu,
    deleteSelectedSplinePoint,
    selectedRoadId,
    setSelectedRoadId,
    selectedRoadPointIndex,
    setSelectedRoadPointIndex,
    selectedRoadPointIndexes,
    setSelectedRoadPointIndexes,
    selectedRoadSegmentIndexes,
    setSelectedRoadSegmentIndexes,

    fortificationMode: wallMode,
    wallSnapEnabled,
    setWallSnapEnabled,
    selectedFortificationId,
    setSelectedFortificationId,
    selectedFortificationPointIndex,
    setSelectedFortificationPointIndex,
    selectedFortificationSegmentIndex,
    setSelectedFortificationSegmentIndex,

    regionMode,
    selectedRegionId,
    selectedRegionPointIndex,
    regionSnapEnabled,
    setRegionSnapEnabled,
    setSelectedRegionId,
    setSelectedRegionPointIndex,
    selectedAssetKey: assetKey,
    buildMode,
    roadWidth,
    roadDraft,
    setRoadDraft,
    fortificationDraft: wallDraft,
    setFortificationDraft: setWallDraft,
    fortificationPointRole: wallPointRole,
    regionDraft,
    setRegionDraft,
    splineHoverPoint,
    setSplineHoverPoint,
    waterDraft,
    setWaterDraft,
    seaLevelPicking: false,
    onWaypoint,
    onReferencePoint,
    referencePlacement,
    referenceCalibrationMode,
    setReferencePlacement,
    onMapContext,
    onInspectSelection: setInspectSelection,
    onSeaLevelPick: () => { },

    // Terrain editing related props
    terrainMode,
    pickTerrainElevation,
    onPickTerrainElevation,
    onSlopePoint,
    brushRadius,
    brushMeshRef,
    onBrushRadiusChange: setBrushRadius,
    brushStrength,
    onSculptStroke,
    onSculptEnd,
    onSculptStart,
    handleUndo,
    handleRedo,
    sampleTerrainHeight,
    terrainCellFeet: cameraDebug?.window?.cellFeet || 0,
    heightmapPlacement,
    setHeightmapPlacement,

    viewCommand: activeViewCommand,

    firstPersonSettings,
    animateWater: ['inspect', 'player'].includes(activeTool),
    referenceLayers,
    calibrationPoints,
    lamps,
    partyPosition,
    destination,
    plannedRoute,
    journeyPositions,
    accessPointBuildingId,
    onTravelAccessMove,
    onTravelAccessEnd,
    pointsOfInterest,
    fitRequest,
    campaignName,
    virtualKeys,
    firstPerson: (localViewCommand || viewCommand)?.mode === 'firstPerson'
  };

  const meshState = useMemo(() => ({
    buildings: state.buildings,
    properties: state.properties,
    roads: state.roads,
    fortifications: state.fortifications,
    wallJunctions: state.wallJunctions,
    regions: state.regions,
    waterBodies: state.waterBodies,
    referenceLayers: state.referenceLayers,
    terrainMaterial: state.terrainMaterial,
    assets: state.assets,
    pointsOfInterest: state.pointsOfInterest,
    partyPosition: state.partyPosition,
    destination: state.destination,
    accessPointBuildingId: state.accessPointBuildingId,
    plannedRoute: state.plannedRoute,
    journeyPositions: state.journeyPositions,
    npcTokens: state.npcTokens,
    animateWater: state.animateWater,
  }), [
    state.buildings, state.properties, state.roads, state.fortifications, state.wallJunctions, state.regions,
    state.waterBodies, state.referenceLayers,
    state.terrainMaterial, state.assets, state.pointsOfInterest, state.partyPosition, state.destination, state.accessPointBuildingId,
    state.plannedRoute, state.journeyPositions, state.npcTokens, state.animateWater
  ]);

  return (
    <>
      <BabylonSettlementHost
        paused={pauseScene}
        tileStore={tileStore}
        tileStoreVersion={tileStoreVersion}
        state={state}
        meshState={meshState}
        bounds={bounds}
        brushStrength={brushStrengths[terrainMode]}
        onCameraChange={handleCameraChange}
        onPointerLockChange={setPointerLocked}
        onScaleChange={setScaleIndicator}
        onBoundsExpansion={handleBoundsExpansion}
        onSceneReady={onSceneReady}
        onPerformanceSample={setPerformanceDebug}
        onFirstFrame={onFirstFrame}
        onTerrainReady={onTerrainReady}
      />

      <div className="map-scale-indicator" aria-label={`Map scale ${scaleIndicator.feet} feet`}>
        <span style={{ width: `${Math.max(35, Math.min(180, scaleIndicator.pixels))}px` }} />
        <strong>
          {scaleIndicator.feet >= 5280
            ? `${(scaleIndicator.feet / 5280).toFixed(1)} mi`
            : `${scaleIndicator.feet} ft`}
        </strong>
      </div>

      {splineContextMenu && (
        <Box
          onContextMenu={event => event.preventDefault()}
          sx={{
            position: 'fixed',
            left: splineContextMenu.clientX,
            top: splineContextMenu.clientY,
            zIndex: 1500,
            minWidth: 170,
            p: 0.5,
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-main)",
            borderRadius: '5px',
            boxShadow: "0 8px 24px var(--border-main)"
          }}
        >
          <Button
            fullWidth
            size="small"
            onClick={() => applySplineContextAction('add')}
            sx={{
              justifyContent: 'flex-start',
              color: "var(--text-main)",
              textTransform: 'none'
            }}
          >
            {Number.isInteger(splineContextMenu.index)
              ? 'Add Adjacent Point'
              : 'Add Point Here'}
          </Button>

          {Number.isInteger(splineContextMenu.index) && (
            <Button
              fullWidth
              size="small"
              color="error"
              disabled={
                (splineContextMenu.kind !== 'region' &&
                  (splineContextMenu.index === 0 ||
                    splineContextMenu.index === splineContextMenu.pointCount - 1))
                || splineContextMenu.pointCount <= (splineContextMenu.kind === 'region' ? 3 : 2)
              }
              onClick={() => applySplineContextAction('delete')}
              sx={{
                justifyContent: 'flex-start',
                textTransform: 'none'
              }}
            >
              Delete Point
            </Button>
          )}

          <Button
            fullWidth
            size="small"
            onClick={() => setSplineContextMenu(null)}
            sx={{
              justifyContent: 'flex-start',
              color: "var(--text-muted)",
              textTransform: 'none'
            }}
          >
            Cancel
          </Button>
        </Box>
      )}

      <ToolWorkflow
        state={state}
        activeTool={activeTool}
        saveStatus={saveStatus}
        viewCommand={activeViewCommand}

        bounds={bounds}
        showHeightmapImport={showHeightmapImport}
        setShowHeightmapImport={setShowHeightmapImport}
        heightmapPlacement={heightmapPlacement}
        setHeightmapPlacement={setHeightmapPlacement}
        activeReferenceLayer={activeReferenceLayer}
        commitHeightmapPlacement={commitHeightmapPlacement}

        // Brush Configurations
        terrainMode={terrainMode}
        setTerrainMode={setTerrainMode}
        brushRadius={brushRadius}
        setBrushRadius={setBrushRadius} // Passes down your top-level hook setter directly
        brushStrength={brushStrength}
        targetElevation={targetElevation}
        setTargetElevation={setTargetElevation}
        pickTerrainElevation={pickTerrainElevation}
        setPickTerrainElevation={setPickTerrainElevation}
        slopeDraft={slopeDraft}
        setSlopeDraft={setSlopeDraft}
        applySlope={applySlope}

        // Maps value updates straight into your nested strengths array object slot cleanly
        setBrushStrength={value =>
          setBrushStrengths(values => ({
            ...values,
            [terrainMode]: value
          }))
        }

        selected={selected}
        setSelected={setSelected}
        inspectSelection={inspectSelection}
        setInspectSelection={setInspectSelection}

        atmosphereSettings={atmosphereSettings}
        setAtmosphereSettings={setAtmosphereSettings}
        weatherSettings={weatherSettings}
        setWeatherSettings={setWeatherSettings}

        assets={assets}
        assetKey={assetKey}
        setAssetKey={setAssetKey}
        buildings={buildings}
        setBuildings={setBuildings}
        buildMode={buildMode}
        setBuildMode={setBuildMode}
        blueprintDraft={blueprintDraft}
        setBlueprintDraft={setBlueprintDraft}

        roadMode={roadMode}
        setRoadMode={setRoadMode}
        roadDraft={roadDraft}
        setRoadDraft={setRoadDraft}
        finishRoad={finishRoad}
        roadName={roadName}
        setRoadName={setRoadName}
        roadWidth={roadWidth}
        setRoadWidth={setRoadWidth}
        roadClass={roadClass}
        setRoadClass={setRoadClass}
        roadSurface={roadSurface}
        setRoadSurface={setRoadSurface}
        roadSnapEnabled={roadSnapEnabled}
        setRoadSnapEnabled={setRoadSnapEnabled}
        roadSnapToleranceFeet={roadSnapToleranceFeet}
        canUndoSplineEdit={
          splineHistoryVersion > 0
          && splineHistoryRef.current.length > 0
        }
        undoSplineEdit={undoSplineEdit}

        wallMode={wallMode}
        wallWidth={wallWidth}
        setWallMode={setWallMode}
        setWallWidth={setWallWidth}
        wallDraft={wallDraft}
        setWallDraft={setWallDraft}
        wallPointRole={wallPointRole}
        setWallPointRole={setWallPointRole}
        finishWall={finishWall}

        regionMode={regionMode}
        setRegionMode={setRegionMode}
        regionDraft={regionDraft}
        setRegionDraft={setRegionDraft}
        finishRegion={finishRegion}

        waterType={waterType}
        setWaterType={setWaterType}
        waterDraft={waterDraft}
        setWaterDraft={setWaterDraft}
        finishWater={finishWater}
      />

      <NavigationControlPanel
        viewCommand={state.viewCommand}
      />

      {cameraDebug && (
        <Box
          sx={{
            position: 'absolute',
            left: 12,
            bottom: 56,
            zIndex: 5,
            minWidth: 220,
            padding: '8px 10px',
            background: "var(--bg-app)",
            border: "1px solid var(--border-main)",
            borderRadius: '6px',
            color: "var(--text-muted)",
            fontFamily: 'monospace',
            fontSize: '11px',
            lineHeight: 1.6,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontWeight: 700,
              letterSpacing: '.08em',
              marginBottom: 2
            }}
          >
            CAMERA DEBUG
          </div>

          <div>
            target: {cameraDebug.target?.map(v => v.toFixed(1)).join(', ')}
          </div>

          <div>
            radius (zoom): {cameraDebug.radius?.toFixed(1)}
          </div>

          <div>
            alpha/beta: {cameraDebug.alpha?.toFixed(2)} / {cameraDebug.beta?.toFixed(2)}
          </div>

          <div>
            LOD: {cameraDebug.window
              ? `${cameraDebug.window.cellFeet} ft/cell`
              : '—'}
          </div>

          {performanceDebug && (
            <div>
              frame: {performanceDebug.medianMs.toFixed(1)} ms median
              {' '}· {performanceDebug.p95Ms.toFixed(1)} ms p95
              <br />
              draw calls: {performanceDebug.drawCalls}
              {' '}· meshes: {performanceDebug.activeMeshes}/{performanceDebug.totalMeshes}
              {performanceDebug.categories && (
                <>
                  <br />
                  {Object.entries(performanceDebug.categories)
                    .sort((a, b) => b[1].meshes - a[1].meshes)
                    .slice(0, 6)
                    .map(([kind, count]) => `${kind}: ${count.meshes}${count.instances ? ` (${count.instances} instances)` : ''}`)
                    .join(' · ')}
                </>
              )}
            </div>
          )}

          {loadDebug && (
            <div>
              load: {Object.entries(loadDebug.milestones)
                .map(([stage, ms]) => `${stage} ${(ms / 1000).toFixed(1)}s`)
                .join(' · ')}
              {loadDebug.tileRequests > 0 &&
                ` · tile requests ${loadDebug.tileRequests} / ${(loadDebug.tileRequestMs / 1000).toFixed(1)}s total`}
            </div>
          )}

          {cameraDebug.bounds && (
            <div>
              bounds: x[
              {cameraDebug.bounds.minX?.toFixed(0)},
              {' '}
              {cameraDebug.bounds.maxX?.toFixed(0)}
              ] y[
              {cameraDebug.bounds.minY?.toFixed(0)},
              {' '}
              {cameraDebug.bounds.maxY?.toFixed(0)}
              ]
            </div>
          )}

          {cameraDebug.window && (
            <>
              {cameraDebug.window.totalTiles != null && (
                <div>
                  loaded: {cameraDebug.window.loadedTiles}/{cameraDebug.window.totalTiles} sampled tile regions
                </div>
              )}

              <div>
                height AGL: {cameraDebug.window.h?.toFixed(0)} ft
                {' '}· view: {cameraDebug.window.dForward?.toFixed(0)} ft
              </div>

              <div>
                tiles: {cameraDebug.window.tilesX}×{cameraDebug.window.tilesZ}
                {' '}· cell: {cameraDebug.window.cellFeet} ft
              </div>

              <div>
                buffer: {cameraDebug.window.cellsX}×{cameraDebug.window.cellsZ} cells
                {' '}· span: {cameraDebug.window.spanFeet?.toFixed(0)} ft
              </div>

              {cameraDebug.fog && (
                <>
                  <div>
                    fog: {cameraDebug.fog.mode}
                    {' '}· {cameraDebug.fog.startFeet?.toFixed(0)}–{cameraDebug.fog.endFeet?.toFixed(0)} ft
                  </div>

                  <div>
                    occlusion: center {Math.round((cameraDebug.fog.centerOcclusion || 0) * 100)}%
                    {' '}· mid {Math.round((cameraDebug.fog.midpointOcclusion || 0) * 100)}%
                    {' '}· edge {Math.round((cameraDebug.fog.edgeOcclusion || 0) * 100)}%
                  </div>
                </>
              )}
            </>
          )}
        </Box>
      )}
    </>
  );
}

// The floor plan dialog owns input while it is open. Hold the map's last frame
// and avoid rebuilding its derived scene state for every blueprint text edit.
export default memo(SettlementMapEditor, (previous, next) =>
  previous.pauseScene && next.pauseScene
);
