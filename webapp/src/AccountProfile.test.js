import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import AccountProfile from './AccountProfile';

jest.mock('axios');
jest.mock('./CreateCharacterModal', () => ({ show, headers, onHide }) => show ? <div>Create character dialog for campaign {headers.CampaignID}<button type="button" onClick={onHide}>Finish character</button></div> : null);

const dmCampaign = { id: 5, name: 'Star Voyager', system: 'D&D', ruleset: '5e', dm_id: 3, owner_id: 3 };
const playerCampaign = { id: 6, name: 'The Hollow', system: 'D&D', ruleset: '5e', dm_id: 9, owner_id: 9 };
const playerCharacter = { id: 20, campaignID: 6, Name: 'Mira', Class: 'Wizard' };
const props = { headers: { Authorization: 'Bearer token', userID: 3 }, setAccountType: jest.fn(), setSelectedCampaign: jest.fn(), setCharacterName: jest.fn() };

function mockDashboard({ campaigns = [dmCampaign], characters = [], preferences = {}, notes = [], calendar = { configured: false } } = {}) {
  axios.get.mockImplementation(url => {
    if (url === '/api/campaigns') return Promise.resolve({ data: campaigns });
    if (url === '/api/characters') return Promise.resolve({ data: characters });
    if (url === '/api/profile') return Promise.resolve({ data: { username: 'tester', real_name: 'Taylor' } });
    if (url === '/api/dashboard/preferences') return Promise.resolve({ data: preferences });
    if (url.endsWith('/quick-notes')) return Promise.resolve({ data: { notes } });
    if (url.startsWith('/api/calendar/')) return Promise.resolve({ data: calendar });
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
}

function renderDashboard(customProps = props) {
  return render(<MemoryRouter initialEntries={['/accountProfile']}><Routes>
    <Route path="/accountProfile" element={<AccountProfile {...customProps} />} />
    <Route path="/dmTools" element={<div>DM landing</div>} />
    <Route path="/calendar" element={<div>Calendar landing</div>} />
    <Route path="/characterSheet" element={<div>Character landing</div>} />
    <Route path="/journal" element={<div>Journal landing</div>} />
  </Routes></MemoryRouter>);
}

beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); window.confirm = jest.fn(() => true); });

test('one click enters a DM campaign at its saved destination', async () => {
  mockDashboard({ preferences: { '5': '/calendar' } });
  renderDashboard();
  fireEvent.click(await screen.findByRole('button', { name: 'Open campaign Star Voyager' }));
  expect(screen.getByText('Calendar landing')).toBeInTheDocument();
  expect(props.setAccountType).toHaveBeenCalledWith('DM');
  expect(props.setSelectedCampaign).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }));
});

test('a direct campaign shortcut takes one click and saving the default uses its own control', async () => {
  mockDashboard();
  axios.patch.mockResolvedValue({ data: { landing_path: '/calendar' } });
  renderDashboard();
  const select = await screen.findByLabelText('Landing page for Star Voyager');
  fireEvent.change(select, { target: { value: '/calendar' } });
  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith('/api/campaigns/5/landing', { landing_path: '/calendar' }, expect.anything()));
  fireEvent.click(screen.getByRole('button', { name: 'Calendar' }));
  expect(screen.getByText('Calendar landing')).toBeInTheDocument();
});

test('player membership without a character still opens character creation', async () => {
  mockDashboard({ campaigns: [playerCampaign] });
  renderDashboard();
  fireEvent.click(await screen.findByRole('button', { name: 'Open campaign The Hollow' }));
  expect(await screen.findByText('Create character dialog for campaign 6')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Finish character' }));
  await waitFor(() => expect(axios.get).toHaveBeenCalledWith('/api/characters', expect.anything()));
});

test('a player prompt answer saves as a private character note for its campaign', async () => {
  mockDashboard({ campaigns: [playerCampaign], characters: [playerCharacter] });
  renderDashboard();
  fireEvent.change(await screen.findByLabelText('Prompt answer'), { target: { value: 'Ask the captain about the stars.' } });
  axios.post.mockResolvedValue({ data: { note: { id: 51, content: 'Saved answer', updated_at: '2026-10-10T12:00:00' } } });
  fireEvent.click(screen.getByRole('button', { name: 'Save answer as note' }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/campaigns/6/quick-notes', expect.objectContaining({ content: expect.stringContaining('Ask the captain about the stars.') }), expect.anything()));
});

test('calendar widget shows only the upcoming events returned by the API', async () => {
  mockDashboard({ calendar: { current_date: { year: 1492, month_index: 2, month_name: 'Ches', day: 10 }, months: [{ name: 'Hammer' }, { name: 'Alturiak' }, { name: 'Ches' }], events: [{ id: 1, name: 'Past', year: 1492, month_index: 2, day: 1 }, { id: 2, name: 'Festival', year: 1492, month_index: 2, day: 12 }], holidays: [] } });
  renderDashboard();
  expect(await screen.findByText('Festival')).toBeInTheDocument();
  expect(screen.queryByText('Past')).not.toBeInTheDocument();
});

test('advanced Flask links require a password check and logout is available on the dashboard', async () => {
  mockDashboard();
  axios.post.mockResolvedValue({ data: { verified: true } });
  renderDashboard();
  fireEvent.click(await screen.findByRole('button', { name: 'Advanced' }));
  expect(screen.queryByText('Open Flask Dashboard ↗')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Advanced access password'), { target: { value: 'correct horse battery staple' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/profile/verify-password', { password: 'correct horse battery staple' }, expect.anything()));
  expect(screen.getByRole('link', { name: 'Open Flask Dashboard ↗' })).toHaveAttribute('href', expect.stringContaining('/dashboard/'));
  expect(screen.getByRole('link', { name: 'Open Flask Admin ↗' })).toHaveAttribute('href', expect.stringContaining('/admin/'));
  expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
});
