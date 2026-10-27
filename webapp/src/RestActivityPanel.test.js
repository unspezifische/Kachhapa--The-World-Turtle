import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import RestActivityPanel from './RestActivityPanel';
jest.mock('./NpcIdentity', () => () => null);
jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() }));
const destination = { id: 'bed', name: 'Bedroom', point: { x: 1, y: 2 } };
const route = { status: 'route_request', destination, destination_key: 'key', steps: [{ kind: 'stairs', from_floor_id: 'ground', to_floor_id: 'upper' }, { kind: 'room' }] };
beforeEach(() => jest.resetAllMocks());

test('preview, reservation, confirmed arrival and release use explicit separate actions', async () => {
  const npc = { id: 7, name: 'Test resident' };
  const activity = { id: 9, npc_id: 7, state: 'awaiting_arrival', route };
  axios.get.mockResolvedValueOnce({ data: { npcs: [npc], activities: [] } })
    .mockResolvedValueOnce({ data: { npcs: [npc], activities: [activity] } })
    .mockResolvedValueOnce({ data: { npcs: [npc], activities: [{ ...activity, state: 'resting' }] } })
    .mockResolvedValueOnce({ data: { npcs: [npc], activities: [] } });
  axios.post.mockResolvedValueOnce({ data: route }).mockResolvedValueOnce({ data: activity });
  axios.patch.mockResolvedValue({ data: { ...activity, state: 'resting' } });
  axios.delete.mockResolvedValue({ data: { released: true } });
  const focus = jest.fn();
  render(<RestActivityPanel campaignId={1} settlementId={3} headers={{}} onFocus={focus} />);
  fireEvent.click(screen.getByText('NPC Rest Activities'));
  await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));
  fireEvent.mouseDown(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByRole('option', { name: 'Test resident' }));
  fireEvent.click(screen.getByText('Find Rest Destination'));
  await screen.findByText('Bedroom');
  expect(axios.post.mock.calls[0][1]).toMatchObject({ preview: true, npc_id: 7 });
  fireEvent.click(screen.getByText('Show Destination'));
  expect(focus).toHaveBeenCalledWith(destination.point);
  fireEvent.click(screen.getByText('Reserve Rest Destination'));
  await screen.findByText('Reserved — awaiting arrival');
  expect(axios.patch).not.toHaveBeenCalled();
  expect(axios.post.mock.calls[1][1]).toMatchObject({ preview: false, expected_destination_key: 'key' });
  fireEvent.click(screen.getByText('Confirm Arrival & Rest'));
  await screen.findByText('Resting — space occupied');
  expect(axios.patch.mock.calls[0][1]).toEqual({ action: 'confirm_arrival' });
  fireEvent.click(screen.getByText('Finish Rest & Release Space'));
  await waitFor(() => expect(screen.queryByText('Resting — space occupied')).not.toBeInTheDocument());
});

test('no-route result offers no reservation and errors stay visible', async () => {
  axios.get.mockResolvedValue({ data: { npcs: [{ id: 7, name: 'Resident' }], activities: [] } });
  axios.post.mockResolvedValue({ data: { status: 'no_route', reason: 'Gate is locked' } });
  render(<RestActivityPanel campaignId={1} settlementId={3} headers={{}} />);
  fireEvent.click(screen.getByText('NPC Rest Activities'));
  fireEvent.mouseDown(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByRole('option', { name: 'Resident' }));
  fireEvent.click(screen.getByText('Find Rest Destination'));
  await screen.findByText('Gate is locked');
  expect(screen.queryByText('Reserve Rest Destination')).not.toBeInTheDocument();
});
