import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ToolWorkflow } from './SettlementMapEditor';
jest.mock('./BabylonSettlementHost', () => () => null);

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
  expect(current[0].points).toHaveLength(3);
  expect(screen.getByRole('status')).toHaveTextContent('Save failed');
  fireEvent.click(screen.getByRole('button', { name: 'Trace roads / walls' }));
  expect(screen.getByRole('button', { name: 'Save Region' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel draft' })).toBeInTheDocument();
});

test('a road draft has explicit Save, Undo, Cancel, and persistent save feedback', () => {
  const save = jest.fn(), setDraft = jest.fn(), setMode = jest.fn();
  render(<ToolWorkflow activeTool="road" state={{ roads: [] }} roadMode="draw-new" setRoadMode={setMode}
    roadDraft={[{ x: 0, y: 0 }, { x: 100, y: 0 }]} setRoadDraft={setDraft} finishRoad={save}
    roadWidth={30} setRoadWidth={jest.fn()} roadClass="street" setRoadClass={jest.fn()}
    roadSurface="stone" setRoadSurface={jest.fn()} roadSnapEnabled roadSnapToleranceFeet={10}
    setRoadSnapEnabled={jest.fn()} saveStatus="Saving…" />);
  fireEvent.click(screen.getByRole('button', { name: 'Save Road' }));
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('Saving…');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel draft' }));
  expect(setDraft).toHaveBeenCalledWith([]);
  expect(setMode).toHaveBeenCalledWith('select');
});
