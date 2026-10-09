import {
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
  insertRoadControlPoint,
  insertOpenSplineControlPoint,
  deleteSplineControlPoint,
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

import './SettlementPresentation.css';
import './SettlementToolPanels.css';

const TERRAIN_SIZE_FEET = 1800;
const DEFAULT_FIRST_PERSON_SETTINGS = { sensitivity: 50, invertX: false, invertY: false, fov: 75, walkSpeed: 8, eyeHeight: 6 };
const DEFAULT_BRUSH_STRENGTHS = { raise: 8, lower: 8, flatten: 35, smooth: 35 };

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

function ToolWorkflow({
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
  finishWall,

  regionMode,
  setRegionMode,
  regionDraft,
  setRegionDraft,
  finishRegion,
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
    return (
      <aside className="editor-menu inspect-menu-panel">
        <Typography variant="subtitle2" sx={{ color: '#cbbd9d', fontWeight: 800, mb: 1.5, letterSpacing: '.13em' }}>
          INSPECTOR OVERVIEW
        </Typography>

        {inspectSelection ? (
          <Box className="road-metadata" sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="caption" sx={{ color: '#7ce6ff', fontWeight: 'bold', letterSpacing: '1px', mb: 0.5, fontSize: '10px' }}>
              FEATURE SELECTION
            </Typography>

            <Typography variant="h6" sx={{ fontSize: '1.2rem', color: '#fff', fontWeight: 700, lineHeight: 1.2, mb: 0.5 }}>
              {inspectSelection.name || 'Unnamed Landmark'}
            </Typography>

            <Typography variant="caption" sx={{ display: 'inline-block', fontSize: '11px', textTransform: 'uppercase', color: '#ffe08a', mb: 1.5 }}>
              Type: {inspectSelection.kind || 'Point of Interest'}
            </Typography>

            <Typography variant="body2" sx={{ fontSize: '0.9rem', lineHeight: 1.4, color: '#cbd5e1', mb: 1.5 }}>
              {inspectSelection.public_description || inspectSelection.description || 'No additional architectural records or historical summary notes are unrolled for this quadrant selection.'}
            </Typography>

            {inspectSelection.points && (
              <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '11px' }}>
                Structural Nodes: {inspectSelection.points.length} coordinates mapped
              </Typography>
            )}

            <Button
              variant="contained"
              color="error"
              fullWidth
              onClick={() => setInspectSelection(null)}
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
              color: '#94a3b8',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1
            }}
          >
            <VisibilityIcon sx={{ fontSize: '2rem', color: '#47423a' }} />
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
        <Typography variant="subtitle2" sx={{ color: '#cbbd9d', fontWeight: 800, mb: 1.5, letterSpacing: '.13em' }}>
          STREETS &amp; HIGHWAYS
        </Typography>

        {/* Mode selectors ribbon using standard ToggleButtonGroup */}
        <ToggleButtonGroup
          value={roadMode}
          exclusive
          fullWidth
          size="small"
          onChange={(e, nextMode) => {
            if (nextMode !== null) {
              if (nextMode === 'draw-new') setRoadDraft([]);
              setRoadMode(nextMode);
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
          <ToggleButton value="select"><VisibilityIcon fontSize="small" /> Select</ToggleButton>
          <ToggleButton value="refine" disabled={!selectedRoad}><EditIcon fontSize="small" /> Refine</ToggleButton>
          <ToggleButton value="move-spline" disabled={!selectedRoad}><OpenInNewIcon fontSize="small" /> Move</ToggleButton>
          <ToggleButton value="draw-new"><AddIcon fontSize="small" /> Draw</ToggleButton>
        </ToggleButtonGroup>

        {['refine', 'move-spline'].includes(roadMode) && (
          <Box sx={{ mb: 1.5, px: 0.5 }}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={roadSnapEnabled}
                  onChange={event => setRoadSnapEnabled(event.target.checked)}
                  sx={{ color: '#718079', '&.Mui-checked': { color: '#bd9149' } }}
                />
              }
              label={
                <Typography variant="caption" sx={{ color: '#d5ddd7', fontSize: '11px' }}>
                  Snap to road network
                </Typography>
              }
              sx={{ m: 0 }}
            />
            <Typography variant="caption" sx={{ display: 'block', color: '#718079', fontSize: '10px', ml: 4 }}>
              Snap radius: {Math.round(roadSnapToleranceFeet)} ft · automatically scales with zoom
            </Typography>
          </Box>
        )}

        {roadMode === 'refine' && selectedRoad && (
          <Typography variant="caption" sx={{ display: 'block', color: '#94a3b8', lineHeight: 1.4, mb: 1.5 }}>
            Drag a control point to reshape the road. Right-click the road or a control point for add/delete options.
          </Typography>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1.5 }}>
          <Button variant="outlined" size="small" startIcon={<UndoIcon />} disabled={!canUndoSplineEdit} onClick={undoSplineEdit} sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none' }}>
            Undo Edit
          </Button>
          <Button variant="outlined" size="small" disabled={state.selectedRoadPointIndex == null} onClick={() => state.setSelectedRoadPointIndex(null)} sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none' }}>
            Clear Point
          </Button>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1.5 }}>
          <Box>
            <Typography variant="caption" sx={{ color: '#aab4ad', display: 'block', mb: 0.5 }}>New Road Class</Typography>
            <Select
              size="small"
              fullWidth
              value={roadClass}
              onChange={e => {
                const nextClass = e.target.value;
                const defaults = ROAD_CLASS_DEFAULTS[nextClass] || ROAD_CLASS_DEFAULTS.street;
                setRoadClass(nextClass);
                setRoadWidth(defaults.width);
                setRoadSurface(defaults.surface);
              }}
              sx={{ backgroundColor: '#23352d', color: '#d5ddd7' }}
            >
              {Object.entries(ROAD_CLASS_DEFAULTS).map(([key, config]) => <MenuItem key={key} value={key}>{config.label}</MenuItem>)}
            </Select>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: '#aab4ad', display: 'block', mb: 0.5 }}>New Surface</Typography>
            <Select size="small" fullWidth value={roadSurface} onChange={e => setRoadSurface(e.target.value)} sx={{ backgroundColor: '#23352d', color: '#d5ddd7' }}>
              {ROAD_SURFACE_OPTIONS.map(surface => <MenuItem key={surface} value={surface}>{surface.charAt(0).toUpperCase() + surface.slice(1)}</MenuItem>)}
            </Select>
          </Box>
        </Box>

        {/* New Width Slider Control Input packaging */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ color: '#aab4ad', display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <span>New Width</span>
            <strong>{roadWidth} ft</strong>
          </Typography>
          <Slider
            min={4}
            max={120}
            step={2}
            value={roadWidth}
            onChange={event => setRoadWidth(Number(event.target.value))}
            sx={{ color: '#bd9149' }}
          />
        </Box>

        {/* Real-time draft spline builder buttons using CSS Grid on Box */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
          <Button variant="outlined" size="small" disabled={!roadDraft.length} onClick={() => setRoadDraft(p => p.slice(0, -1))} sx={{ color: '#d5ddd7', borderColor: '#53645a' }}>
            Undo Point
          </Button>
          <Button variant="contained" size="small" disabled={roadDraft.length < 2} onClick={finishRoad} sx={{ backgroundColor: '#bd9149', color: '#17211c' }}>
            Finish Road
          </Button>
        </Box>

        <TextField
          type="search"
          placeholder="Filter existing roads..."
          size="small"
          fullWidth
          value={roadSearch}
          onChange={e => setRoadSearch(e.target.value)}
          sx={{ mb: 1.5, input: { color: '#fff', fontSize: '11px' } }}
        />

        {/* Existing Streets Scrollable Stack List wrapper */}
        <Box className="street-list" sx={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', mb: selectedRoad ? 2 : 0 }}>
          {filteredRoads.map(r => (
            <Button
              key={r.id}
              fullWidth
              onClick={() => { state.setSelectedRoadId(r.id); state.setSelectedRoadPointIndex(null); state.setSelected(r); }}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                textTransform: 'none',
                padding: '6px 10px',
                backgroundColor: r.id === state.selectedRoadId ? '#1e3a34' : '#10231f',
                border: '1px solid',
                borderColor: r.id === state.selectedRoadId ? '#ffe08a' : '#47423a',
                borderRadius: '4px',
                color: '#fff',
                textAlign: 'left',
                '&:hover': { backgroundColor: '#16322c' }
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '12px' }}>{r.name || 'Unnamed street'}</Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>{r.points?.length || 0} nodes mapped</Typography>
            </Button>
          ))}
        </Box>

        {/* Contextual Selected Road Metadata Sub-Panel Form */}
        {
          selectedRoad && (
            <Box sx={{ borderTop: '1px solid #33443b', pt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Select
                  size="small"
                  value={selectedRoad.road_class || 'street'}
                  onChange={e => state.setRoads(values => values.map(road => road.id === selectedRoad.id ? { ...road, road_class: e.target.value } : road))}
                  sx={{ backgroundColor: '#23352d', color: '#d5ddd7' }}
                >
                  {Object.entries(ROAD_CLASS_DEFAULTS).map(([key, config]) => <MenuItem key={key} value={key}>{config.label}</MenuItem>)}
                </Select>
                <Select
                  size="small"
                  value={selectedRoad.surface_type || 'dirt'}
                  onChange={e => state.setRoads(values => values.map(road => road.id === selectedRoad.id ? { ...road, surface_type: e.target.value } : road))}
                  sx={{ backgroundColor: '#23352d', color: '#d5ddd7' }}
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
                <TextField
                  label="Base Width (ft)"
                  type="number"
                  size="small"
                  value={selectedRoad.width_feet ?? 30}
                  inputProps={{ min: 4, max: 200, step: 1 }}
                  onChange={e => state.setRoads(values => values.map(road => road.id === selectedRoad.id ? { ...road, width_feet: Math.max(4, Number(e.target.value) || 4) } : road))}
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    const defaults = ROAD_CLASS_DEFAULTS[selectedRoad.road_class || 'street'] || ROAD_CLASS_DEFAULTS.street;
                    state.setRoads(values => values.map(road => road.id === selectedRoad.id ? { ...road, width_feet: defaults.width, surface_type: defaults.surface } : road));
                  }}
                  sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none' }}
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
                    onClick={() => state.setSelectedRoadPointIndex(idx)}
                    sx={{
                      minWidth: '28px',
                      height: '28px',
                      padding: 0,
                      backgroundColor: state.selectedRoadPointIndex === idx ? '#ffe08a' : '#23352d',
                      color: state.selectedRoadPointIndex === idx ? '#17211c' : '#d5ddd7',
                      '&:hover': { backgroundColor: '#a87e3e' }
                    }}
                  >
                    {idx + 1}
                  </Button>
                ))}
              </Box>

              {/* Node Coordinates editor Row inputs */}
              {selectedPoint && (
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <TextField
                    label="Coordinate X"
                    type="number"
                    size="small"
                    value={Math.round(selectedPoint.x)}
                    onChange={e => state.setRoads(v => v.map(r => r.id === selectedRoad.id ? {
                      ...r,
                      points: r.points.map((pt, pi) => pi === state.selectedRoadPointIndex ? { ...pt, x: Number(e.target.value) } : pt)
                    } : r))}
                  />
                  <TextField
                    label="Coordinate Y"
                    type="number"
                    size="small"
                    value={Math.round(selectedPoint.y)}
                    onChange={e => state.setRoads(v => v.map(r => r.id === selectedRoad.id ? {
                      ...r,
                      points: r.points.map((pt, pi) => pi === state.selectedRoadPointIndex ? { ...pt, y: Number(e.target.value) } : pt)
                    } : r))}
                  />
                </Box>
              )}

              {selectedPoint && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <TextField
                    label="Point Width (ft)"
                    type="number"
                    size="small"
                    value={selectedPoint.width_feet ?? selectedRoad.width_feet ?? roadWidth}
                    inputProps={{ min: 4, max: 200, step: 1 }}
                    onChange={e => state.setRoads(values => values.map(road => road.id === selectedRoad.id ? {
                      ...road,
                      points: road.points.map((point, pointIndex) => pointIndex === state.selectedRoadPointIndex ? { ...point, width_feet: Math.max(4, Number(e.target.value) || 4) } : point)
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
                    } : road))} sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none' }}>
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
      </aside >
    );
  }


  // Inside your activeTool === 'terrain' condition block:
  if (activeTool === 'terrain') {
    return (
      <aside className="editor-menu terrain-menu">
        <Typography variant="subtitle2" sx={{ color: '#cbbd9d', fontWeight: 800, mb: 1.5, letterSpacing: '.13em' }}>
          TERRAIN SCULPT
        </Typography>

        {/* History Actions using standard CSS Grid on a Box container */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1.5 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<UndoIcon />}
            disabled={!state.handleUndo || state.pastRef?.current?.length === 0}
            onClick={state.handleUndo}
            sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none' }}
          >
            Undo
          </Button>
          <Button
            variant="outlined"
            size="small"
            endIcon={<RedoIcon />}
            disabled={!state.handleRedo || state.futureRef?.current?.length === 0}
            onClick={state.handleRedo}
            sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none' }}
          >
            Redo
          </Button>
        </Box>

        {/* Segmented Brush Mode Ribbon */}
        <ToggleButtonGroup
          value={terrainMode}
          exclusive
          fullWidth
          size="small"
          onChange={(e, nextMode) => { if (nextMode !== null) setTerrainMode(nextMode); }}
          sx={{
            mb: 2.5,
            backgroundColor: '#10231f',
            '& .MuiToggleButton-root': {
              color: '#94a3b8',
              borderColor: '#47423a',
              fontSize: '10px',
              fontWeight: 'bold',
              '&.Mui-selected': { color: '#7ce6ff', backgroundColor: '#16322c' }
            }
          }}
        >
          <ToggleButton value="raise">RAISE</ToggleButton>
          <ToggleButton value="lower">LOWER</ToggleButton>
          <ToggleButton value="flatten">FLATTEN</ToggleButton>
          <ToggleButton value="smooth">SMOOTH</ToggleButton>
        </ToggleButtonGroup>

        {/* Sliders + Coaligned Manual Text Fields Row */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Brush Radius Controls */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: '#aab4ad' }}>Brush Radius (ft)</Typography>
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
                  '& .MuiInputBase-input': { padding: '2px 6px', textAlign: 'right', color: '#fff', fontSize: '12px' }
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
                color: '#bd9149', py: 1, '& .MuiSlider-mark': { opacity: 0 },
                ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`& .MuiSlider-mark[data-index="${97 + i}"]`, { opacity: 1 }])),
                '& .MuiSlider-markLabel': { color: '#cbbd9d', fontSize: '10px' }
              }}
            />
          </Box>

          {/* Brush Strength Controls */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: '#aab4ad' }}>
                Brush Strength {['flatten', 'smooth'].includes(terrainMode) ? '(%)' : '(ft)'}
              </Typography>
              <TextField
                type="number"
                size="small"
                value={brushStrength}
                inputProps={{ min: 1, max: 100 }}
                onChange={event => setBrushStrength(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}
                sx={{
                  width: '75px',
                  '& .MuiInputBase-input': { padding: '2px 6px', textAlign: 'right', color: '#fff', fontSize: '12px' }
                }}
              />
            </Box>
            <Slider
              min={1}
              max={100}
              value={brushStrength}
              onChange={(e, val) => setBrushStrength(Number(val))}
              sx={{ color: '#bd9149', py: 1 }}
            />
          </Box>
        </Box>

        {/* Dynamic Descriptor Caption Helper */}
        <Typography variant="caption" sx={{ mt: 2, display: 'block', color: '#94a3b8', lineHeight: '1.45' }}>
          {terrainMode === 'flatten' ? 'The first point clicked anchors the elevation target for the rest of that continuous drag stroke.' :
            terrainMode === 'smooth' ? 'Blends and averages terrain height vectors dynamically beneath the active brush footprint.' :
              'Left-click and drag across the landscape grid to deform vertices. The brush circle scales automatically.'}
        </Typography>
        <Button
          variant="outlined"
          size="small"
          fullWidth
          startIcon={<UploadFileIcon />}
          onClick={() => setShowHeightmapImport(true)}
          sx={{ mt: 1, borderColor: '#526258', color: '#cbbd9d', textTransform: 'none', fontSize: '11px' }}
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

    return (
      <aside className="editor-menu road-menu secondary-editor-menu">
        <Typography variant="subtitle2" sx={{ color: '#cbbd9d', fontWeight: 800, mb: 1.5, letterSpacing: '.13em' }}>
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
          <ToggleButton value="select"><VisibilityIcon fontSize="small" /> Select</ToggleButton>
          <ToggleButton value="refine" disabled={!selectedWall}><EditIcon fontSize="small" /> Refine</ToggleButton>
          <ToggleButton value="move-spline" disabled={!selectedWall}><OpenInNewIcon fontSize="small" /> Move</ToggleButton>
          <ToggleButton value="draw-new"><AddIcon fontSize="small" /> Draw</ToggleButton>
        </ToggleButtonGroup>

        {wallMode === 'refine' && selectedWall && (
          <Typography variant="caption" sx={{ display: 'block', color: '#94a3b8', lineHeight: 1.4, mb: 1.5 }}>
            Drag a control point above the wall to reshape it. Click the selected wall between control points to add a new point.
          </Typography>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1.5 }}>
          <Button variant="outlined" size="small" startIcon={<UndoIcon />} disabled={!canUndoSplineEdit} onClick={undoSplineEdit} sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none' }}>
            Undo Edit
          </Button>
          <Button variant="outlined" size="small" disabled={state.selectedFortificationPointIndex == null} onClick={() => state.setSelectedFortificationPointIndex(null)} sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none' }}>
            Clear Point
          </Button>
        </Box>

        {/* Slider Ribbon Controls */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ color: '#aab4ad', display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <span>New Width</span>
            <strong>{wallWidth} ft</strong>
          </Typography>
          <Slider
            min={4}
            max={120}
            step={2}
            value={wallWidth}
            onChange={event => setWallWidth(Number(event.target.value))}
            sx={{ color: '#bd9149' }}
          />
        </Box>

        {/* Action Buttons using modern Box instead of deprecated Grid */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
          <Button variant="outlined" size="small" disabled={!wallDraft.length} onClick={() => setWallDraft(p => p.slice(0, -1))} sx={{ color: '#d5ddd7', borderColor: '#53645a' }}>
            Undo Point
          </Button>
          <Button variant="contained" size="small" disabled={wallDraft.length < 2} onClick={finishWall} sx={{ backgroundColor: '#bd9149', color: '#17211c' }}>
            Finish Wall
          </Button>
        </Box>

        <TextField
          type="search"
          placeholder="Filter existing walls..."
          size="small"
          fullWidth
          value={wallSearch}
          onChange={e => setWallSearch(e.target.value)}
          sx={{ mb: 1.5, input: { color: '#fff', fontSize: '11px' } }}
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
                backgroundColor: r.id === state.selectedFortificationId ? '#1e3a34' : '#10231f',
                border: '1px solid',
                borderColor: r.id === state.selectedFortificationId ? '#ffe08a' : '#47423a',
                borderRadius: '4px',
                color: '#fff',
                textAlign: 'left',
                '&:hover': { backgroundColor: '#16322c' }
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '12px' }}>{r.name || 'Unnamed wall'}</Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>{r.points?.length || 0} nodes mapped</Typography>
            </Button>
          ))}
        </Box>

        {/* Selected Node Parameters Editor Metadata Box */}
        {selectedWall && (
          <Box sx={{ borderTop: '1px solid #33443b', pt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
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
                    backgroundColor: state.selectedFortificationPointIndex === idx ? '#ffe08a' : '#23352d',
                    color: state.selectedFortificationPointIndex === idx ? '#17211c' : '#d5ddd7',
                    '&:hover': { backgroundColor: '#a87e3e' }
                  }}
                >
                  {idx + 1}
                </Button>
              ))}
            </Box>

            {/* Point Coordinate Transforms Row (Box Grid replacing legacy layouts) */}
            {selectedPoint && (
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <TextField
                  label="Coordinate X"
                  type="number"
                  size="small"
                  value={Math.round(selectedPoint.x)}
                  onChange={e => state.setFortifications(v => v.map(w => w.id === selectedWall.id ? {
                    ...w,
                    points: w.points.map((pt, pi) => pi === state.selectedFortificationPointIndex ? { ...pt, x: Number(e.target.value) } : pt)
                  } : w))}
                />
                <TextField
                  label="Coordinate Y"
                  type="number"
                  size="small"
                  value={Math.round(selectedPoint.y)}
                  onChange={e => state.setFortifications(v => v.map(w => w.id === selectedWall.id ? {
                    ...w,
                    points: w.points.map((pt, pi) => pi === state.selectedFortificationPointIndex ? { ...pt, y: Number(e.target.value) } : pt)
                  } : w))}
                />
              </Box>
            )}

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
      <aside className="editor-menu road-menu">
        <Typography variant="subtitle2" sx={{ color: '#cbbd9d', fontWeight: 800, mb: 1.5, letterSpacing: '.13em' }}>
          {drawing.title}
        </Typography>

        <ToggleButtonGroup
          value={drawing.mode}
          exclusive
          fullWidth
          size="small"
          onChange={(e, nextMode) => {
            if (nextMode !== null) {
              if (nextMode === 'draw-new') drawing.setDraft([]);
              drawing.setMode(nextMode);
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
              '&.Mui-selected': { color: '#7ce6ff', backgroundColor: '#16322c' }
            }
          }}
        >
          <ToggleButton value="select">Select</ToggleButton>
          <ToggleButton value="draw-new">Draw</ToggleButton>
        </ToggleButtonGroup>

        {activeTool === 'road' && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ color: '#aab4ad', display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <span>Width</span>
              <strong>{roadWidth} ft</strong>
            </Typography>
            <Slider
              min={4}
              max={400}
              step={2}
              value={roadWidth}
              onChange={event => setRoadWidth(Number(event.target.value))}
              sx={{ color: '#bd9149', py: 0.5 }}
            />
          </Box>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <Button variant="outlined" size="small" disabled={!drawing.draft.length} onClick={() => drawing.setDraft(points => points.slice(0, -1))} sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none' }}>
            Undo point
          </Button>
          <Button variant="contained" size="small" disabled={drawing.draft.length < drawing.minimum} onClick={drawing.finish} sx={{ backgroundColor: '#bd9149', color: '#17211c', textTransform: 'none', fontWeight: 'bold' }}>
            Finish
          </Button>
        </Box>
      </aside>
    );
  }

  // 2. Upgraded Water Body Panel Configuration
  if (activeTool === 'water') {
    return (
      <aside className="editor-menu water-menu">
        <Typography variant="subtitle2" sx={{ color: '#cbbd9d', fontWeight: 800, mb: 1.5, letterSpacing: '.13em' }}>
          WATER BODY
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ color: '#aab4ad', display: 'block', mb: 0.5 }}>
            Type
          </Typography>
          <Select
            size="small"
            fullWidth
            value={waterType}
            onChange={event => { setWaterType(event.target.value); setWaterDraft([]); }}
            sx={{
              backgroundColor: '#23352d',
              color: '#d5ddd7',
              '.MuiOutlinedInput-notchedOutline': { borderColor: '#53645a' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#bd9149' }
            }}
          >
            <MenuItem value="river">River</MenuItem>
            <MenuItem value="lake">Lake</MenuItem>
            <MenuItem value="ocean">Ocean</MenuItem>
          </Select>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <Button variant="outlined" size="small" disabled={!waterDraft.length} onClick={() => setWaterDraft(points => points.slice(0, -1))} sx={{ color: '#d5ddd7', borderColor: '#53645a', textTransform: 'none' }}>
            Undo point
          </Button>
          <Button variant="contained" size="small" disabled={waterType !== 'ocean' && waterDraft.length < (waterType === 'river' ? 2 : 3)} onClick={finishWater} sx={{ backgroundColor: '#bd9149', color: '#17211c', textTransform: 'none', fontWeight: 'bold' }}>
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
        <Typography variant="subtitle2" sx={{ color: '#ecd89f', fontWeight: 800, mb: 1.5, letterSpacing: '.06em' }}>
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
          <Button variant="contained" fullWidth size="small" onClick={() => handleShift(-1440)} startIcon={<CalendarTodayIcon sx={{ fontSize: 12 }} />} sx={{ backgroundColor: '#23352d', fontSize: '10px' }}>
            Day
          </Button>
          <Button variant="contained" fullWidth size="small" onClick={() => handleShift(-720)} startIcon={<FastRewindIcon />} sx={{ backgroundColor: '#23352d', fontSize: '10px' }}>
            12h
          </Button>
          <Button variant="contained" fullWidth size="small" onClick={() => handleShift(-60)} startIcon={<NavigateBeforeIcon />} sx={{ backgroundColor: '#23352d', fontSize: '10px' }}>
            Hour
          </Button>
          <Button variant="contained" fullWidth size="small" onClick={() => handleShift(60)} endIcon={<NavigateNextIcon />} sx={{ backgroundColor: '#23352d', fontSize: '10px' }}>
            Hour
          </Button>
          <Button variant="contained" fullWidth size="small" onClick={() => handleShift(720)} endIcon={<FastForwardIcon />} sx={{ backgroundColor: '#23352d', fontSize: '10px' }}>
            12h
          </Button>
          <Button variant="contained" fullWidth size="small" onClick={() => handleShift(1440)} endIcon={<CalendarTodayIcon sx={{ fontSize: 12 }} />} sx={{ backgroundColor: '#23352d', fontSize: '10px' }}>
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
            borderTop: '1px solid #33443b',
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
              backgroundColor: '#bd9149',
              color: '#17211c',
              fontWeight: 'bold',
              '&:hover': { backgroundColor: '#d4a75b' }
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
        <Typography variant="subtitle2" sx={{ color: '#cbbd9d', fontWeight: 800, mb: 2, letterSpacing: '.13em' }}>
          ATMOSPHERE PLUGIN
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Typography variant="caption" sx={{ color: '#aab4ad', display: 'flex', justifyContent: 'space-between' }}>
              <span>Sun Light Glare</span>
              <strong>{atmosphereSettings.sunIntensity.toFixed(1)}x</strong>
            </Typography>
            <Slider
              min={0.5}
              max={5.0}
              step={0.1}
              value={atmosphereSettings.sunIntensity}
              onChange={e => setAtmosphereSettings(prev => ({ ...prev, sunIntensity: Number(e.target.value) }))}
              sx={{ color: '#bd9149' }}
            />
          </Box>

          <Box>
            <Typography variant="caption" sx={{ color: '#aab4ad', display: 'flex', justifyContent: 'space-between' }}>
              <span>Moon Base Glow</span>
              <strong>{Math.round(atmosphereSettings.moonIntensity * 100)}%</strong>
            </Typography>
            <Slider
              min={0.0}
              max={1.0}
              step={0.05}
              value={atmosphereSettings.moonIntensity}
              onChange={e => setAtmosphereSettings(prev => ({ ...prev, moonIntensity: Number(e.target.value) }))}
              sx={{ color: '#bd9149' }}
            />
          </Box>

          <Box>
            <Typography variant="caption" sx={{ color: '#aab4ad', display: 'flex', justifyContent: 'space-between' }}>
              <span>Rayleigh Scattering</span>
              <strong>{atmosphereSettings.scatteringScale.toFixed(1)}</strong>
            </Typography>
            <Slider
              min={0.2}
              max={3.0}
              step={0.1}
              value={atmosphereSettings.scatteringScale}
              onChange={e => setAtmosphereSettings(prev => ({ ...prev, scatteringScale: Number(e.target.value) }))}
              sx={{ color: '#bd9149' }}
            />
          </Box>

          <Box sx={{ borderTop: '1px solid #33443b', pt: 1.5 }}>
            <Typography
              variant="caption"
              sx={{
                color: '#cbbd9d',
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
                  color: '#aab4ad',
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
                sx={{ color: '#bd9149' }}
              />

              <Typography
                variant="caption"
                sx={{ color: '#718079', fontSize: '10px' }}
              >
                Distance from the camera at which atmospheric fading begins.
              </Typography>
            </Box>

            <Box>
              <Typography
                variant="caption"
                sx={{
                  color: '#aab4ad',
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
                sx={{ color: '#bd9149' }}
              />

              <Typography
                variant="caption"
                sx={{ color: '#718079', fontSize: '10px' }}
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

      if (preset === 'light-drizzle') { fallbackClouds = 0.4; fallbackFog = 0.008; }
      else if (preset === 'pouring-rain') { fallbackClouds = 0.8; fallbackFog = 0.012; }
      else if (preset === 'foggy') { fallbackClouds = 0.5; fallbackFog = 0.045; fallbackColor = "#cbd5e1"; }
      else if (preset === 'snowing') { fallbackClouds = 0.7; fallbackFog = 0.015; fallbackColor = "#e2e8f0"; }
      else if (preset === 'thunderstorm') { fallbackClouds = 1.0; fallbackFog = 0.025; fallbackColor = "#1e293b"; }

      setWeatherSettings(prev => ({
        ...prev,
        activeWeather: preset,
        cloudCover: fallbackClouds,
        fogDensity: fallbackFog,
        fogColor: fallbackColor
      }));
    };

    return (
      <aside className="editor-menu weather-menu">
        <Typography variant="subtitle2" sx={{ color: '#cbbd9d', fontWeight: 800, mb: 2, letterSpacing: '.13em' }}>
          WEATHER SYSTEM MATRIX
        </Typography>

        <Box>
          <Typography variant="caption" sx={{ color: '#aab4ad', display: 'block', mb: 0.5 }}>
            Condition Selection
          </Typography>
          <Select
            size="small"
            fullWidth
            value={weatherSettings.activeWeather}
            onChange={handlePresetChange}
            sx={{
              backgroundColor: '#23352d',
              color: '#d5ddd7',
              '.MuiOutlinedInput-notchedOutline': { borderColor: '#53645a' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#bd9149' },
              '& .MuiSelect-select': { display: 'flex', alignItems: 'center', gap: '8px' } // Aligns selected value icon + text
            }}
          >
            <MenuItem value="clear" sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <WbSunnyIcon fontSize="small" sx={{ color: '#ffca28' }} /> Clear Skies
            </MenuItem>
            <MenuItem value="light-drizzle" sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GrainIcon fontSize="small" sx={{ color: '#90caf9' }} /> Light Drizzle
            </MenuItem>
            <MenuItem value="pouring-rain" sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <WaterDropIcon fontSize="small" sx={{ color: '#42a5f5' }} /> Pouring Rain
            </MenuItem>
            <MenuItem value="foggy" sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CloudQueueIcon fontSize="small" sx={{ color: '#94a3b8' }} /> Thick Fog
            </MenuItem>
            <MenuItem value="snowing" sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AcUnitIcon fontSize="small" sx={{ color: '#e2e8f0' }} /> Snowing
            </MenuItem>
            <MenuItem value="thunderstorm" sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ThunderstormIcon fontSize="small" sx={{ color: '#b0bec5' }} /> Thunderstorm
            </MenuItem>
          </Select>
        </Box>


        <Box>
          <Typography variant="caption" sx={{ color: '#aab4ad', display: 'flex', justifyContent: 'space-between' }}>
            <span>Cloud Density</span>
            <strong>{Math.round((weatherSettings.cloudCover ?? 0) * 100)}%</strong>
          </Typography>
          <Slider
            min={0.0}
            max={1.0}
            step={0.05}
            value={weatherSettings.cloudCover ?? 0}
            onChange={e => setWeatherSettings(prev => ({ ...prev, cloudCover: Number(e.target.value) }))}
            sx={{ color: '#bd9149' }}
          />
        </Box>

        <Box>
          <Typography variant="caption" sx={{ color: '#aab4ad', display: 'flex', justifyContent: 'space-between' }}>
            <span>Fog / Haze Strength</span>
            <strong>{Math.round(Math.max(0, Math.min(1, ((weatherSettings.fogDensity ?? 0.01) - 0.001) / 0.059)) * 100)}%</strong>
          </Typography>
          <Slider
            min={0.001}
            max={0.06}
            step={0.001}
            value={weatherSettings.fogDensity}
            onChange={e => setWeatherSettings(prev => ({ ...prev, fogDensity: Number(e.target.value) }))}
            sx={{ color: '#bd9149' }}
          />
        </Box>

        <Box>
          <Typography variant="caption" sx={{ color: '#aab4ad', display: 'flex', justifyContent: 'space-between' }}>
            <span>Environment Volume</span>
            <strong>{Math.round((weatherSettings.masterVolume ?? 0.5) * 100)}%</strong>
          </Typography>
          <Slider
            min={0.0}
            max={1.0}
            step={0.05}
            value={weatherSettings.masterVolume ?? 0.5}
            onChange={e => setWeatherSettings(prev => ({ ...prev, masterVolume: Number(e.target.value) }))}
            sx={{ color: '#bd9149' }}
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
          <Typography variant="caption" sx={{ color: '#aab4ad' }}>
            Fog Tint Color
          </Typography>
          <input
            type="color"
            value={weatherSettings.fogColor}
            onChange={e => setWeatherSettings(prev => ({ ...prev, fogColor: e.target.value }))}
            style={{
              border: '1px solid #53645a',
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
        backgroundColor: '#14201cce',
        border: '1px solid #ffffff2c',
        borderRadius: '6px',
        boxShadow: '0 8px 22px #07100bbb',
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
          color: '#d8c28f',
          fontFamily: 'inherit',
          '&:hover': { backgroundColor: '#ffffff0f' },
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '10px', letterSpacing: '.13em', color: '#cbbd9d' }}>
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
            borderTop: '1px solid #ffffff1a',
          }}
        >
          {/* Mode Perspective Changers Ribbon */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: '4px' }}>
            <Tooltip title="Top Down View" arrow placement="top">
              <IconButton
                size="small"
                onClick={() => handleCommand('topdown')}
                sx={{ flex: 1, color: '#d8c28f', border: '1px solid #526258', borderRadius: '4px', '&:hover': { backgroundColor: '#ba8c42', color: '#18221e' } }}
              >
                <CenterFocusStrongIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="1st Person Mode" arrow placement="top">
              <IconButton
                size="small"
                onClick={() => handleCommand('firstPerson')}
                sx={{ flex: 1, color: '#d8c28f', border: '1px solid #526258', borderRadius: '4px', '&:hover': { backgroundColor: '#ba8c42', color: '#18221e' } }}
              >
                <VisibilityIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Orbit Camera" arrow placement="top">
              <IconButton
                size="small"
                onClick={() => handleCommand('camera')}
                sx={{ flex: 1, color: '#d8c28f', border: '1px solid #526258', borderRadius: '4px', '&:hover': { backgroundColor: '#ba8c42', color: '#18221e' } }}
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
              sx={{ gridColumn: '2', width: '100%', height: '100%', minWidth: 0, padding: 0, color: '#d8c28f', border: '1px solid #526258', '&:hover': { backgroundColor: '#ba8c42', color: '#18221e' } }}
            >
              <ArrowDropUpIcon />
            </Button>
            <Button
              onMouseDown={() => setVirtualKey('a', true)} onMouseUp={() => setVirtualKey('a', false)} onMouseLeave={() => setVirtualKey('a', false)}
              sx={{ gridRow: '2', gridColumn: '1', width: '100%', height: '100%', minWidth: 0, padding: 0, color: '#d8c28f', border: '1px solid #526258', '&:hover': { backgroundColor: '#ba8c42', color: '#18221e' } }}
            >
              <ArrowLeftIcon />
            </Button>
            <Button
              onMouseDown={() => setVirtualKey('s', true)} onMouseUp={() => setVirtualKey('s', false)} onMouseLeave={() => setVirtualKey('s', false)}
              sx={{ gridRow: '3', gridColumn: '2', width: '100%', height: '100%', minWidth: 0, padding: 0, color: '#d8c28f', border: '1px solid #526258', '&:hover': { backgroundColor: '#ba8c42', color: '#18221e' } }}
            >
              <ArrowDropDownIcon />
            </Button>
            <Button
              onMouseDown={() => setVirtualKey('d', true)} onMouseUp={() => setVirtualKey('d', false)} onMouseLeave={() => setVirtualKey('d', false)}
              sx={{ gridRow: '2', gridColumn: '3', width: '100%', height: '100%', minWidth: 0, padding: 0, color: '#d8c28f', border: '1px solid #526258', '&:hover': { backgroundColor: '#ba8c42', color: '#18221e' } }}
            >
              <ArrowRightIcon />
            </Button>
          </Box>

          {/* Orbit Rotations, Pitch Tilts, and Elevate Utilities Stack */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
              <Button size="small" variant="outlined" onMouseDown={() => setVirtualKey('q', true)} onMouseUp={() => setVirtualKey('q', false)} startIcon={<UndoIcon sx={{ scale: '0.8' }} />} sx={{ color: '#d8c28f', borderColor: '#526258', textTransform: 'none', fontSize: '10px', padding: '2px' }}>
                Q
              </Button>
              <Button size="small" variant="outlined" onMouseDown={() => setVirtualKey('e', true)} onMouseUp={() => setVirtualKey('e', false)} endIcon={<RedoIcon sx={{ scale: '0.8' }} />} sx={{ color: '#d8c28f', borderColor: '#526258', textTransform: 'none', fontSize: '10px', padding: '2px' }}>
                E
              </Button>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
              <Button size="small" variant="outlined" onMouseDown={() => setVirtualKey('r', true)} onMouseUp={() => setVirtualKey('r', false)} sx={{ color: '#d8c28f', borderColor: '#526258', textTransform: 'none', fontSize: '10px', padding: '2px' }}>
                Tilt Up (R)
              </Button>
              <Button size="small" variant="outlined" onMouseDown={() => setVirtualKey('f', true)} onMouseUp={() => setVirtualKey('f', false)} sx={{ color: '#d8c28f', borderColor: '#526258', textTransform: 'none', fontSize: '10px', padding: '2px' }}>
                Tilt Dn (F)
              </Button>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
              <Button size="small" variant="outlined" onMouseDown={() => setVirtualKey('shift', true)} onMouseUp={() => setVirtualKey('shift', false)} sx={{ color: '#d8c28f', borderColor: '#526258', textTransform: 'none', fontSize: '9px', padding: '2px' }}>
                Raise (Shift)
              </Button>
              <Button size="small" variant="outlined" onMouseDown={() => setVirtualKey('lower', true)} onMouseUp={() => setVirtualKey('lower', false)} sx={{ color: '#d8c28f', borderColor: '#526258', textTransform: 'none', fontSize: '9px', padding: '2px' }}>
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
export default function SettlementMapEditor({
  simulation,
  activeTool,
  buildMode = 'place-asset',
  setBuildMode = () => { },
  atmosphereSettings = {
    sunIntensity: 2.2,
    moonIntensity: 0.15,
    scatteringScale: 1.0,
    fogStartRatio: 0.92,
    fogEndRatio: 1.03,
  },
  setAtmosphereSettings,
  weatherSettings = { activeWeather: 'clear', fogDensity: 0.01, fogColor: '#a9c9dc' },
  setWeatherSettings,
  assets = [],
  buildings = [],
  setBuildings = () => { },

  tileStore,
  onTilesDirtied = () => { },
  tileStoreVersion = 0,

  selected,
  setSelected,
  inspectSelection,
  setInspectSelection = () => { },
  buildingViewMode = 'satellite',
  roads = [],
  setRoads = () => { },
  strokes = [],
  setStrokes = () => { },
  heightMap = null,
  setHeightMap = () => { },
  blueprintDraft = null,
  setBlueprintDraft = () => { },
  waterBodies = [],
  setWaterBodies = () => { },
  mapEnvironment = {},
  setMapEnvironment = () => { },
  setFortifications = () => { },
  lamps = [],
  partyPosition,
  destination,
  onWaypoint = () => { },
  referenceLayers = [],
  referencePlacement = null,
  setReferencePlacement = () => { },
  onReferencePoint = () => { },
  calibrationPoints = [],
  fitRequest = 0,
  onMapContext = () => { },
  onCameraChange = null,

  viewCommand = null,
  labelState = { ids: [], showAll: false },
  pointsOfInterest = [],
  campaignName = '',
  onSceneReady = () => { }
}) {
  const [assetKey, setAssetKey] = useState(assets[0]?.key || '');

  const [terrainMode, setTerrainMode] = useState('raise')
  const [brushRadius, setBrushRadius] = useState(110)
  const [brushStrengths, setBrushStrengths] = useState(DEFAULT_BRUSH_STRENGTHS);
  const [showHeightmapImport, setShowHeightmapImport] = useState(false);
  const [heightmapPlacement, setHeightmapPlacement] = useState(null);

  const [roadMode, setRoadMode] = useState('select')
  const [roadDraft, setRoadDraft] = useState([])
  const [roadWidth, setRoadWidth] = useState(ROAD_CLASS_DEFAULTS.street.width);
  const [roadClass, setRoadClass] = useState('street');
  const [roadSurface, setRoadSurface] = useState(ROAD_CLASS_DEFAULTS.street.surface);
  const [roadSnapEnabled, setRoadSnapEnabled] = useState(false);

  const [wallMode, setWallMode] = useState('select')
  const [wallDraft, setWallDraft] = useState([]);
  const [wallWidth, setWallWidth] = useState(36);

  const [regionMode, setRegionMode] = useState('select')
  const [regionDraft, setRegionDraft] = useState([]);
  const [waterType, setWaterType] = useState('river')
  const [waterDraft, setWaterDraft] = useState([]);

  const [selectedRoadId, setSelectedRoadId] = useState(null);
  const [selectedRoadPointIndex, setSelectedRoadPointIndex] = useState(null); // 👈 ADD THIS

  const [selectedFortificationId, setSelectedFortificationId] = useState(null);
  const [selectedFortificationPointIndex, setSelectedFortificationPointIndex] = useState(null); // 👈 ADD THIS

  const [selectedRegionId, setSelectedRegionId] = useState(null);

  const [splineContextMenu, setSplineContextMenu] = useState(null);
  const splineHistoryRef = useRef([]);
  const [splineHistoryVersion, setSplineHistoryVersion] = useState(0);

  const recordSplineUndo = useCallback((kind, item) => {
    if (!item?.id) return;
    splineHistoryRef.current.push({ kind, id: item.id, before: JSON.parse(JSON.stringify(item)) });
    if (splineHistoryRef.current.length > 60) splineHistoryRef.current.shift();
    setSplineHistoryVersion(value => value + 1);
  }, []);

  const undoSplineEdit = useCallback(() => {
    const entry = splineHistoryRef.current.pop();
    if (!entry) return;
    if (entry.kind === 'road') {
      setRoads(values => values.map(road => road.id === entry.id ? entry.before : road));
      setSelectedRoadId(entry.id);
      setSelectedRoadPointIndex(null);
      setSelected(entry.before);
    } else if (entry.kind === 'wall') {
      setFortifications(values => values.map(wall => wall.id === entry.id ? entry.before : wall));
      setSelectedFortificationId(entry.id);
      setSelectedFortificationPointIndex(null);
      setSelected(entry.before);
    }
    setSplineHistoryVersion(value => value + 1);
  }, [setRoads, setFortifications, setSelected]);


  const [virtualKeys, setVirtualKeys] = useState(new Set());
  const [localViewCommand, setLocalViewCommand] = useState(null);
  const [, setPointerLocked] = useState(false);
  const [scaleIndicator, setScaleIndicator] = useState({ feet: 100, pixels: 100 });
  const roadSnapToleranceFeet = useMemo(
    () => Math.max(8, Math.min(120, (Number(scaleIndicator.feet) || 100) * 0.35)),
    [scaleIndicator.feet]
  );
  const [cameraDebug, setCameraDebug] = useState(null);
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

  const regions = useMemo(() => mapEnvironment.regions || [], [mapEnvironment.regions]);
  const fortifications = mapEnvironment.fortifications || [];

  const deleteSelectedSplinePoint = useCallback((kind) => {
    if (kind === 'road') {
      const road = roads.find(value => value.id === selectedRoadId);
      if (!road || selectedRoadPointIndex == null) return;
      const updated = deleteSplineControlPoint(road, selectedRoadPointIndex);
      if (updated === road) return;
      recordSplineUndo('road', road);
      setRoads(values => values.map(value => value.id === road.id ? updated : value));
      setSelectedRoadPointIndex(null);
    } else if (kind === 'wall') {
      const wall = fortifications.find(value => value.id === selectedFortificationId);
      if (!wall || selectedFortificationPointIndex == null) return;
      const updated = deleteSplineControlPoint(wall, selectedFortificationPointIndex);
      if (updated === wall) return;
      recordSplineUndo('wall', wall);
      setFortifications(values => values.map(value => value.id === wall.id ? updated : value));
      setSelectedFortificationPointIndex(null);
    }
  }, [roads, selectedRoadId, selectedRoadPointIndex, fortifications, selectedFortificationId, selectedFortificationPointIndex, recordSplineUndo, setRoads, setFortifications]);

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
          const result = insertOpenSplineControlPoint(wall, insertionPoint);
          setFortifications(values => values.map(value => value.id === wall.id ? result.item : value));
          setSelectedFortificationId(wall.id);
          setSelectedFortificationPointIndex(result.index);
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
          }
        }
      } else if (menu.kind === 'wall') {
        const wall = fortifications.find(value => value.id === menu.id);
        if (wall) {
          const updated = deleteSplineControlPoint(wall, menu.index);
          if (updated !== wall) {
            recordSplineUndo('wall', wall);
            setFortifications(values => values.map(value => value.id === wall.id ? updated : value));
            setSelectedFortificationPointIndex(null);
          }
        }
      }
    }
    setSplineContextMenu(null);
  }, [splineContextMenu, roads, fortifications, recordSplineUndo, setRoads, setFortifications]);


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
      amount: terrainMode === 'flatten' || terrainMode === 'smooth' ? brushStrength / 100 : undefined
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
      const r = Number(stroke.radius) || 100;
      const t0 = tileIndexAt(stroke.x - r, stroke.y - r), t1 = tileIndexAt(stroke.x + r, stroke.y + r);
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
      setLocalViewCommand({ mode: e.detail.mode, nonce: Date.now() });
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

  const setRegions = updater => setMapEnvironment(value => ({ ...value, regions: typeof updater === 'function' ? updater(value.regions || []) : updater }));
  const activeViewCommand = localViewCommand || viewCommand, firstPerson = activeViewCommand?.mode === 'firstPerson', brushStrength = brushStrengths[terrainMode];

  const finishRoad = () => {
    if (roadDraft.length < 2) return;
    setRoads(values => [...values, { id: `road-${Date.now()}`, name: `New road ${values.length + 1}`, road_class: roadClass, surface_type: roadSurface, width_feet: roadWidth, opacity: .78, visible: true, points: roadDraft }]);
    setRoadDraft([]);
    setRoadMode('select');
  };

  const finishWall = () => {
    if (wallDraft.length < 2) return;
    setFortifications(values => [...values, { id: `wall-${Date.now()}`, name: `New wall ${values.length + 1}`, wall_type: 'city_wall', width_feet: 24, height_feet: 35, visible: true, points: wallDraft }]);
    setWallDraft([]);
    setWallMode('select');
  };

  const finishRegion = () => {
    if (regionDraft.length < 3) return;
    setRegions(values => [...values, { id: `region-${Date.now()}`, name: `New region ${values.length + 1}`, region_type: 'grassland', visible: true, points: regionDraft }]);
    setRegionDraft([]);
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
    if (activeTool !== 'build') setSelected?.(null);
    setSelectedRoadId(null);
    setSelectedFortificationId(null);
    setSelectedRegionId(null);
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
    activeTool,
    time: simulation?.time || viewCommand?.time || { hour: 12, minute: 0 },

    terrainMaterial,
    atmosphereSettings,
    weatherSettings,

    pastRef,
    futureRef,

    assets,
    buildings,
    setBuildings,
    blueprintDraft,
    setBlueprintDraft,

    selected,
    setSelected,
    inspectSelection,
    setInspectSelection,
    buildingViewMode,
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
    setFortifications,
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

    fortificationMode: wallMode,
    selectedFortificationId,
    setSelectedFortificationId,
    selectedFortificationPointIndex,
    setSelectedFortificationPointIndex,

    regionMode,
    selectedRegionId,
    setSelectedRegionId,
    selectedAssetKey: assetKey,
    buildMode,
    roadWidth,
    roadDraft,
    setRoadDraft,
    fortificationDraft: wallDraft,
    setFortificationDraft: setWallDraft,
    regionDraft,
    setRegionDraft,
    waterDraft,
    setWaterDraft,
    seaLevelPicking: false,
    onWaypoint,
    onReferencePoint,
    referencePlacement,
    setReferencePlacement,
    onMapContext,
    onInspectSelection: setInspectSelection,
    onSeaLevelPick: () => { },

    // Terrain editing related props
    terrainMode,
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
    pointsOfInterest,
    fitRequest,
    campaignName,
    virtualKeys,
    firstPerson: (localViewCommand || viewCommand)?.mode === 'firstPerson'
  };

  const meshState = useMemo(() => ({
    buildings: state.buildings,
    roads: state.roads,
    fortifications: state.fortifications,
    regions: state.regions,
    waterBodies: state.waterBodies,
    referenceLayers: state.referenceLayers,
    terrainMaterial: state.terrainMaterial,
    assets: state.assets,
    pointsOfInterest: state.pointsOfInterest,
    animateWater: state.animateWater,
  }), [
    state.buildings, state.roads, state.fortifications, state.regions,
    state.waterBodies, state.referenceLayers,
    state.terrainMaterial, state.assets, state.pointsOfInterest, state.animateWater
  ]);

  return (
    <>
      <BabylonSettlementHost
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
      />

      <div className="map-scale-indicator" aria-label={`Map scale ${scaleIndicator.feet} feet`}>
        <span style={{ width: `${Math.max(35, Math.min(180, scaleIndicator.pixels))}px` }} />
        <strong>
          {scaleIndicator.feet >= 5280
            ? `${(scaleIndicator.feet / 5280).toFixed(1)} mi`
            : `${scaleIndicator.feet} ft`}
        </strong>
      </div>

      {['inspect', 'player'].includes(activeTool) && inspectSelection && (
        <aside className="inspect-map-selection">
          <button
            type="button"
            className="inspect-selection-close"
            onClick={() => setInspectSelection(null)}
            aria-label="Close"
          >
            x
          </button>

          <span>
            {inspectSelection.kind}
          </span>

          <h3>
            {inspectSelection.name || 'Mapped feature'}
          </h3>

          <p>
            {inspectSelection.public_description
              || inspectSelection.description
              || inspectSelection.summary
              || 'Known settlement feature.'}
          </p>
        </aside>
      )}

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
            backgroundColor: '#14201cf2',
            border: '1px solid #53645a',
            borderRadius: '5px',
            boxShadow: '0 8px 24px #0009'
          }}
        >
          <Button
            fullWidth
            size="small"
            onClick={() => applySplineContextAction('add')}
            sx={{
              justifyContent: 'flex-start',
              color: '#d5ddd7',
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
                splineContextMenu.index === 0
                || splineContextMenu.index === splineContextMenu.pointCount - 1
                || splineContextMenu.pointCount <= 2
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
              color: '#94a3b8',
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
            background: '#0d1410e6',
            border: '1px solid #ffffff2c',
            borderRadius: '6px',
            color: '#cbbd9d',
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