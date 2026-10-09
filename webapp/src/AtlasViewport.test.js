import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AtlasViewport, { atlasMarkerScale } from './AtlasViewport';

// jsdom does not ship PointerEvent; MouseEvent supplies the position fields
// Atlas dragging needs for this interaction-level test.
window.PointerEvent = MouseEvent;

const locations = [{ id: 7, name: 'Waterdeep', atlas_x: .25, atlas_y: .25, status: 'active' }];
const setup = props => {
  render(<AtlasViewport atlas={{ image_url: '/atlas.jpg' }} locations={locations} {...props} />);
  const atlas = screen.getByRole('application', { name: 'Overworld atlas map' });
  Object.defineProperty(atlas, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 100, height: 100 }), configurable: true });
  return atlas;
};

test('marker screen scale grows gently without inheriting the full atlas zoom', () => {
  expect(atlasMarkerScale(1)).toBe(1);
  expect(atlasMarkerScale(2)).toBeGreaterThan(1);
  expect(atlasMarkerScale(8)).toBeLessThan(2);
  expect(atlasMarkerScale(10)).toBe(1.65);
});

test('zoom keeps the coordinate anchor separate from the marker visual transform', () => {
  const atlas = setup();
  const pin = screen.getByTitle('Open Waterdeep');
  expect(pin).toHaveStyle({ left: '25%', top: '25%' });
  expect(pin.style.transform).toBe('');
  fireEvent.wheel(atlas, { deltaY: -500, clientX: 25, clientY: 25 });
  expect(pin).toHaveStyle({ left: '25%', top: '25%' });
  expect(pin.style.transform).toBe('');
  expect(pin.querySelector('.atlas-marker-visual').style.transform).toContain('scale(');
});

test('dragging a pin uses its tip coordinates and only writes once on release', () => {
  const onMove = jest.fn(), onSelect = jest.fn(), onOpen = jest.fn();
  const atlas = setup({ onMove, onSelect, onOpen, movableId: 7 });
  const pin = screen.getByTitle("Drag Waterdeep's pin tip to move it");
  fireEvent.pointerDown(pin, { button: 0, pointerId: 9, clientX: 25, clientY: 25 });
  fireEvent.pointerMove(atlas, { pointerId: 9, clientX: 73, clientY: 61 });
  expect(onMove).not.toHaveBeenCalled();
  fireEvent.pointerUp(atlas, { pointerId: 9, clientX: 73, clientY: 61 });
  expect(onSelect).not.toHaveBeenCalled();
  expect(onMove).toHaveBeenCalledWith(7, .73, .61);
  expect(onOpen).not.toHaveBeenCalled();
});

test('clicking a pin opens its settlement and 800% starts the handoff', () => {
  const onOpen = jest.fn();
  const atlas = setup({ onOpen });
  const pin = screen.getByTitle('Open Waterdeep');
  fireEvent.pointerDown(pin, { button: 0, pointerId: 3, clientX: 25, clientY: 25 });
  fireEvent.pointerUp(atlas, { pointerId: 3, clientX: 25, clientY: 25 });
  expect(onOpen).toHaveBeenCalledWith(7);
  const zoom = screen.getByRole('button', { name: 'Zoom in' });
  for (let index = 0; index < 7; index += 1) fireEvent.click(zoom);
  expect(screen.getByText('Atlas fading to terrain detail')).toBeInTheDocument();
});

test('a pin cannot be dragged until that settlement is armed for movement', () => {
  const onMove = jest.fn(), onOpen = jest.fn();
  const atlas = setup({ onMove, onOpen });
  const pin = screen.getByTitle('Open Waterdeep');
  fireEvent.pointerDown(pin, { button: 0, pointerId: 4, clientX: 25, clientY: 25 });
  fireEvent.pointerMove(atlas, { pointerId: 4, clientX: 70, clientY: 70 });
  fireEvent.pointerUp(atlas, { pointerId: 4, clientX: 70, clientY: 70 });
  expect(onMove).not.toHaveBeenCalled();
  expect(onOpen).not.toHaveBeenCalled();
});

test('zooming to 1000% over a settlement enters its terrain', () => {
  const onTerrainApproach = jest.fn(), onTerrainEnter = jest.fn();
  setup({ onTerrainApproach, onTerrainEnter });
  const zoom = screen.getByRole('button', { name: 'Zoom in' });
  // The fixture pin is at 25%, so zoom about its viewport point.
  for (let index = 0; index < 9; index += 1) fireEvent.wheel(screen.getByRole('application'), { deltaY: -1000, clientX: 25, clientY: 25 });
  expect(onTerrainApproach).toHaveBeenCalledWith(7);
  expect(onTerrainEnter).toHaveBeenCalledWith(7);
  expect(zoom).toBeInTheDocument();
});
