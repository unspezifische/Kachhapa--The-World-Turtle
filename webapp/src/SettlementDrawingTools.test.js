import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ToolWorkflow } from './SettlementMapEditor';
jest.mock('./BabylonSettlementHost', () => () => null);

test('region panel lists existing regions and exposes a refinement snapping toggle', () => {
  const select = jest.fn(), setSnap = jest.fn();
  render(<ToolWorkflow activeTool="region" state={{ regions: [{ id: 'ward', name: 'North Ward' }, { id: 'port', name: 'Harbor' }],
    selectedRegionId: null, setSelectedRegionId: select, setSelectedRegionPointIndex: jest.fn(),
    regionSnapEnabled: true, setRegionSnapEnabled: setSnap, roadSnapToleranceFeet: 12 }}
    regionDraft={[]} regionMode="select" setRegionMode={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Harbor' }));
  expect(select).toHaveBeenCalledWith('port');
  const snapping = screen.getByRole('button', { name: 'Snap to road and wall points' });
  expect(snapping).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(snapping);
  expect(setSnap).toHaveBeenCalledWith(false);
});

test('region settings persist material and use defaults without modifying the existing buildings', () => {
  let current;
  function Harness() {
    const [regions, setRegions] = useState([{ id: 'ward', name: 'North Ward', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] }]);
    const [draft, setDraft] = useState([]), [mode, setMode] = useState('select');
    current = regions;
    return <ToolWorkflow activeTool="region" state={{ regions, setRegions, selectedRegionId: 'ward', setSelectedRegionId: jest.fn() }}
      regionDraft={draft} setRegionDraft={setDraft} regionMode={mode} setRegionMode={setMode} finishRegion={jest.fn()}
      saveStatus="Save failed" />;
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText('ground wall'), { target: { value: 'stone' } });
  fireEvent.change(screen.getByLabelText('upper wall'), { target: { value: 'wood' } });
  fireEvent.change(screen.getByLabelText('ground use'), { target: { value: 'shop' } });
  expect(current[0].construction_defaults).toMatchObject({ ground_wall: 'stone', upper_wall: 'wood', ground_use: 'shop' });
  fireEvent.change(screen.getByLabelText('Street'), { target: { value: 'dirt' } });
  expect(current[0].road_material_defaults).toMatchObject({ street: 'dirt' });
  expect(current[0].points).toHaveLength(3);
  expect(screen.getByRole('status')).toHaveTextContent('Save failed');
  fireEvent.click(screen.getByRole('button', { name: 'Trace roads / walls' }));
  expect(screen.getByRole('button', { name: 'Save Region' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel draft' })).toBeInTheDocument();
});

test('a road draft has explicit Save, Undo, Cancel, and persistent save feedback', () => {
  const save = jest.fn(), setDraft = jest.fn(), setMode = jest.fn(), setName = jest.fn();
  render(<ToolWorkflow activeTool="road" state={{ roads: [] }} roadMode="draw-new" setRoadMode={setMode}
    roadDraft={[{ x: 0, y: 0 }, { x: 100, y: 0 }]} setRoadDraft={setDraft} finishRoad={save}
    roadName="Trade Way" setRoadName={setName}
    roadWidth={30} setRoadWidth={jest.fn()} roadClass="street" setRoadClass={jest.fn()}
    roadSurface="stone" setRoadSurface={jest.fn()} roadSnapEnabled roadSnapToleranceFeet={10}
    setRoadSnapEnabled={jest.fn()} saveStatus="Saving…" />);
  expect(screen.getByRole('textbox', { name: 'New road name' })).toHaveValue('Trade Way');
  fireEvent.change(screen.getByRole('textbox', { name: 'New road name' }), { target: { value: 'High Road' } });
  expect(setName).toHaveBeenCalledWith('High Road');
  fireEvent.click(screen.getByRole('button', { name: 'Save Road' }));
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('Saving…');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel draft' }));
  expect(setDraft).toHaveBeenCalledWith([]);
  expect(setMode).toHaveBeenCalledWith('select');
});

test('road select mode shows the list alone and refine controls stay above it', () => {
  const road = { id: 'main', name: 'Main Street', road_class: 'street',
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  const props = { activeTool: 'road', roadDraft: [], setRoadDraft: jest.fn(),
    roadWidth: 30, roadClass: 'street', roadSurface: 'cobblestone',
    roadSnapEnabled: true, roadSnapToleranceFeet: 10, setRoadSnapEnabled: jest.fn(),
    state: { roads: [road], selectedRoadId: 'main', selectedRoadPointIndexes: [],
      setSelectedRoadId: jest.fn(), setSelectedRoadPointIndex: jest.fn(),
      setSelectedRoadPointIndexes: jest.fn(), setSelectedRoadSegmentIndexes: jest.fn(),
      setSelected: jest.fn(), setRoads: jest.fn() } };
  const { container, rerender } = render(<ToolWorkflow {...props} roadMode="select" setRoadMode={jest.fn()} />);
  expect(screen.getByPlaceholderText('Filter existing roads...')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Rename Road' })).not.toBeInTheDocument();
  expect(container.querySelector('.road-mode-header')).toBeInTheDocument();
  rerender(<ToolWorkflow {...props} roadMode="refine" setRoadMode={jest.fn()} />);
  const details = screen.getByRole('textbox', { name: 'Rename Road' });
  const list = container.querySelector('.road-existing-list');
  expect(details.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('terrain keeps every brush mode in the header above history and brush controls', () => {
  const setTerrainMode = jest.fn();
  const { container } = render(<ToolWorkflow activeTool="terrain" terrainMode="raise"
    setTerrainMode={setTerrainMode} brushRadius={100} setBrushRadius={jest.fn()}
    brushStrength={10} setBrushStrength={jest.fn()} state={{ pastRef: { current: [] }, futureRef: { current: [] } }} />);
  const header = container.querySelector('.terrain-menu .tool-mode-header');
  expect(header).toBeInTheDocument();
  for (const mode of ['RAISE', 'LOWER', 'FLATTEN', 'SMOOTH', 'SET LEVEL', 'SLOPE']) {
    expect(header).toContainElement(screen.getByRole('button', { name: mode }));
  }
  expect(header.compareDocumentPosition(screen.getByRole('button', { name: 'Undo' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'LOWER' }));
  expect(setTerrainMode).toHaveBeenCalledWith('lower');
});

test('Set Level exposes target and sampling controls; Slope exposes editable endpoints and Apply', () => {
  const props = { activeTool: 'terrain', setTerrainMode: jest.fn(), brushRadius: 100,
    setBrushRadius: jest.fn(), brushStrength: 10, setBrushStrength: jest.fn(),
    state: { pastRef: { current: [] }, futureRef: { current: [] } } };
  const { rerender } = render(<ToolWorkflow {...props} terrainMode="set-elevation"
    targetElevation={120} setTargetElevation={jest.fn()} pickTerrainElevation={false}
    setPickTerrainElevation={jest.fn()} />);
  expect(screen.getByRole('spinbutton', { name: 'Target elevation (ft)' })).toHaveValue(120);
  expect(screen.getByRole('button', { name: 'Pick height from terrain' })).toBeInTheDocument();
  rerender(<ToolWorkflow {...props} terrainMode="slope" slopeDraft={{
    start: { x: 0, y: 0 }, end: { x: 100, y: 0 },
    start_elevation_feet: 20, end_elevation_feet: 80
  }} setSlopeDraft={jest.fn()} applySlope={jest.fn()} />);
  expect(screen.getByRole('spinbutton', { name: 'Start elevation (ft)' })).toHaveValue(20);
  expect(screen.getByRole('spinbutton', { name: 'End elevation (ft)' })).toHaveValue(80);
  expect(screen.getByRole('button', { name: 'Apply Slope' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel Slope' })).toBeInTheDocument();
});

test('a linked wall point exposes one shared junction editor and Detach', () => {
  const junction = { id: 'j', x: 0, y: 0, kind: 'guardhouse', shape: 'rectangular',
    width_feet: 40, depth_feet: 30, height_feet: 35 };
  render(<ToolWorkflow activeTool="fortification" wallMode="refine" setWallMode={jest.fn()}
    wallDraft={[]} wallWidth={12} wallPointRole="direction" state={{
      fortifications: [{ id: 'a', name: 'North', points: [
        { x: 0, y: 0, tower: true, junction_id: 'j' }, { x: 100, y: 0, tower: true }
      ] }], wallJunctions: [junction], selectedFortificationId: 'a',
      selectedFortificationPointIndex: 0, selectedFortificationSegmentIndex: null,
      wallSnapEnabled: true, roadSnapToleranceFeet: 10, setWallSnapEnabled: jest.fn(),
      setFortifications: jest.fn(), setSelectedFortificationPointIndex: jest.fn(),
      updateWallJunction: jest.fn(), detachSelectedWallJunction: jest.fn()
    }} />);
  expect(screen.getByText('SHARED WALL JUNCTION')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Detach junction' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Direction Point' })).toBeDisabled();
});

test('fortification mode controls precede their own actions and the wall list', () => {
  const wall = { id: 'wall-1', name: 'North Wall', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  const props = { activeTool: 'fortification', wallDraft: [], setWallDraft: jest.fn(),
    wallWidth: 12, setWallWidth: jest.fn(), wallPointRole: 'direction', setWallPointRole: jest.fn(),
    state: { fortifications: [wall], selectedFortificationId: 'wall-1',
      selectedFortificationPointIndex: null, selectedFortificationSegmentIndex: null,
      wallSnapEnabled: false, roadSnapToleranceFeet: 10, setWallSnapEnabled: jest.fn() } };
  const { container, rerender } = render(<ToolWorkflow {...props} wallMode="select" setWallMode={jest.fn()} />);
  const header = container.querySelector('.fortification-tools-panel .tool-mode-header');
  const list = container.querySelector('[aria-label="Existing walls"]');
  expect(header).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Filter existing walls...')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Finish Wall' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete Wall Track' })).not.toBeInTheDocument();
  rerender(<ToolWorkflow {...props} wallMode="draw-new" setWallMode={jest.fn()} />);
  const finish = screen.getByRole('button', { name: 'Finish Wall' });
  expect(finish.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Delete Wall Track' })).not.toBeInTheDocument();
  rerender(<ToolWorkflow {...props} wallMode="refine" setWallMode={jest.fn()} />);
  const deleteWall = screen.getByRole('button', { name: 'Delete Wall Track' });
  expect(deleteWall.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Finish Wall' })).not.toBeInTheDocument();
  rerender(<ToolWorkflow {...props} wallMode="move-spline" setWallMode={jest.fn()} />);
  expect(screen.getByText(/Drag North Wall on the map/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete Wall Track' })).not.toBeInTheDocument();
});

test('linked region settings and detach stay above the list in Select', () => {
  const region = { id: 'ward', name: 'North Ward', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
    boundary_anchors: [{ kind: 'road', source_id: 'main' }] };
  const props = { activeTool: 'region', regionDraft: [], setRegionDraft: jest.fn(),
    state: { regions: [region], selectedRegionId: 'ward', setSelectedRegionId: jest.fn(),
      selectedRegionPointIndex: null, roadSnapToleranceFeet: 10, setRegions: jest.fn(),
      setRegionSnapEnabled: jest.fn() } };
  const { container, rerender } = render(<ToolWorkflow {...props} regionMode="select" setRegionMode={jest.fn()} />);
  const header = container.querySelector('.region-tools-panel .tool-mode-header');
  const list = container.querySelector('[aria-label="Existing regions"]');
  expect(header).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Refine' })).toBeDisabled();
  const detach = screen.getByRole('button', { name: 'Detach boundary links' });
  expect(detach.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Region name' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save Region' })).not.toBeInTheDocument();
  rerender(<ToolWorkflow {...props} regionMode="trace" setRegionMode={jest.fn()} />);
  const save = screen.getByRole('button', { name: 'Save Region' });
  expect(save.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Detach boundary links' })).not.toBeInTheDocument();
});
