import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import SettlementManager from './SettlementManager';

jest.setTimeout(15000);

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn(), put: jest.fn() }));
jest.mock('./AtlasViewport', () => () => null);
jest.mock('./BabylonSettlementHost', () => {
  const React = require('react');
  return function MockScene({ state }) {
    return React.createElement('button', { onClick: () => {
      const building = state.buildings[0];
      state.setSelected(building);
      state.setInspectSelection({ entityKind: 'building', id: building.id, item: building, kind: 'Building' });
    } }, 'Pick building on map');
  };
});

const headers = { campaignID: '1', campaignName: 'Test campaign' };
const building = { id: 'house-1', name: 'Copper Kettle', asset_key: 'tavern', business_type: 'tavern',
  owner_name: 'Mara Vale', district_key: 'dock_ward', factions: ['Harbor Guild'], tags: ['supper'],
  description: 'A warm neighborhood tavern.', opens_at: '09:00', closes_at: '17:00',
  width_feet: 40, depth_feet: 30, x: 0, y: 0, rooms: ['Taproom', 'Kitchen'] };
const map = { settlement_id: 1, name: 'Test town', buildings: [building], roads: [], reference_layers: [],
  water_bodies: [], environment: { regions: [] }, asset_catalog: [{ key: 'tavern', name: 'Tavern', category: 'hospitality', rooms: ['Taproom'], width_feet: 40, depth_feet: 30 }] };

beforeEach(() => {
  jest.clearAllMocks();
  axios.get.mockImplementation(url => {
    let data = {};
    if (url.includes('world-atlas')) data = { atlas: {}, locations: [{ id: 1, name: 'Test town' }, { id: 2, name: 'Other town' }] };
    else if (url.includes('terrain-tiles')) data = { tiles: [] };
    else if (url.includes('settlement-map')) data = url.includes('settlement_id=2') ? { ...map, settlement_id: 2, name: 'Other town', buildings: [] } : map;
    else if (url.includes('economy')) data = { businesses: [{ id: 3, name: 'Copper Kettle', business_type: 'tavern', closed: false }], markets: [], history: {} };
    else if (url.includes('travel')) data = { points_of_interest: [] };
    return Promise.resolve({ data });
  });
  axios.post.mockResolvedValue({ data: { time: { day: 1, hour: 12, minute: 0 }, routes: [] } });
  axios.put.mockResolvedValue({ data: {} });
});

test('Inspect selection shows details, survives map modes and editing, and clears on dismissal and settlement change', async () => {
  render(<SettlementManager headers={headers} />);
  fireEvent.click(await screen.findByRole('button', { name: /Test town Not placed/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Pick building on map' }, { timeout: 10000 }));
  const inspector = screen.getByRole('complementary', { name: 'Inspector' });
  expect(within(inspector).getByText('Copper Kettle')).toBeInTheDocument();
  expect(within(inspector).getByText('Mara Vale')).toBeInTheDocument();
  expect(within(inspector).getByText('Taproom, Kitchen')).toBeInTheDocument();
  expect(within(inspector).getByText(/Open now/)).toBeInTheDocument();
  await within(inspector).findByText('Business operating');

  fireEvent.mouseDown(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByRole('option', { name: 'Districts' }));
  expect(within(inspector).getByText('Copper Kettle')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'districts map legend' })).toHaveTextContent('dock ward');

  fireEvent.click(within(inspector).getByRole('button', { name: 'Manage building' }));
  expect(await screen.findByRole('button', { name: 'Manage' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Edit building details' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Building Name'), { target: { value: 'Silver Kettle' } });
  fireEvent.change(within(dialog).getByLabelText('Closes at'), { target: { value: '10:00' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save Building Changes' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Inspect', exact: true }));
  expect(await screen.findByText('Silver Kettle', { selector: '.inspect-record h6' })).toBeInTheDocument();
  expect(screen.getByText(/Closed now/)).toBeInTheDocument();
  expect(screen.getByText('Taproom, Kitchen')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Clear Selection' }));
  expect(screen.queryByText('Silver Kettle', { selector: '.inspect-record h6' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pick building on map' }));
  fireEvent.click(screen.getByRole('button', { name: 'Atlas', exact: true }));
  fireEvent.click(await screen.findByRole('button', { name: /Other town Not placed/ }));
  expect(await screen.findByText(/Click directly on a mapped building/)).toBeInTheDocument();
  expect(screen.queryByText('Silver Kettle', { selector: '.inspect-record h6' })).not.toBeInTheDocument();
});

test('a blueprint opens the metadata editor with its custom model preserved', async () => {
  const defaultGet = axios.get.getMockImplementation();
  const blueprint = { ...building, is_blueprint: true, coordinate_space: 'local', asset_key: 'custom-blueprint',
    levels: [{ id: 'ground', name: 'Ground floor', elevation_feet: 0,
      corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }] }], roofs: [] };
  axios.get.mockImplementation(url => url.includes('settlement-map') && !url.includes('terrain-tiles')
    ? Promise.resolve({ data: { ...map, buildings: [blueprint] } })
    : defaultGet(url));
  render(<SettlementManager headers={headers} />);
  fireEvent.click(await screen.findByRole('button', { name: /Test town Not placed/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Pick building on map' }, { timeout: 10000 }));
  fireEvent.click(screen.getByRole('button', { name: 'Building details & levels' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Edit building details' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByRole('combobox', { name: 'Model & Footprint' })).toHaveAttribute('aria-disabled', 'true');
  expect(within(dialog).getByText('Custom blueprint')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
});
