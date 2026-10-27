import React from 'react';
import { render, screen } from '@testing-library/react';
import axios from 'axios';
import SettlementPlayerView from './SettlementPlayerView';

jest.mock('axios');
jest.mock('./SettlementMapEditor', () => () => <div>Player camera view</div>);

test('a player can load the read-only settlement when DM travel context is forbidden', async () => {
  axios.get.mockImplementation((url) => {
    if (url === '/api/world-atlas/7') return Promise.resolve({ data: { locations: [{ id: 12, name: 'Turtle Bay', is_primary: true }] } });
    if (url === '/api/settlement-map/7?settlement_id=12') return Promise.resolve({ data: { settlement_id: 12, name: 'Turtle Bay', buildings: [], roads: [], terrain_strokes: [], water_bodies: [], environment: {}, reference_layers: [], asset_catalog: [] } });
    if (url === '/api/settlement-simulation/7') return Promise.resolve({ data: { time: { hour: 9, minute: 15 }, routes: [] } });
    if (url === '/api/travel/7/context') return Promise.reject({ response: { status: 403 } });
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  render(<SettlementPlayerView headers={{ campaignID: 7 }} socket={null} />);

  expect(await screen.findByText('Player camera view')).toBeInTheDocument();
  expect(await screen.findByText('Turtle Bay')).toBeInTheDocument();
  expect(screen.queryByText('Unable to load the settlement map.')).not.toBeInTheDocument();
});
