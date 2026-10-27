import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import io from 'socket.io-client';
import App from './App';

jest.mock('axios');
jest.mock('socket.io-client', () => jest.fn());

jest.mock('./Menu', () => () => <div data-testid="campaign-menu">Menu</div>);
jest.mock('./AccountProfile', () => () => <div>Campaign picker</div>);
jest.mock('./DMTools', () => () => <div>DM tools</div>);
jest.mock('./SettlementManager', () => () => <div>Settlement manager</div>);
jest.mock('./SettlementPlayerView', () => () => <div>Settlement player view</div>);
jest.mock('./CharacterSheet', () => () => <div>Character sheet</div>);
jest.mock('./InventoryView', () => () => <div>Inventory</div>);
jest.mock('./Journal', () => () => <div>Journal</div>);
jest.mock('./Library', () => () => <div>Library</div>);
jest.mock('./Calendar', () => () => <div>Calendar</div>);
jest.mock('./Chat', () => () => <div>Chat</div>);
jest.mock('./Register', () => () => <div>Register</div>);

const storedCampaign = {
  id: 7,
  name: 'Waterdeep',
  dmId: 42,
  ownerId: 42,
};

function storeCampaignSession() {
  localStorage.setItem('token', 'stored-token');
  localStorage.setItem('accountType', 'DM');
  localStorage.setItem('selectedCampaign', JSON.stringify(storedCampaign));
}

beforeEach(() => {
  jest.clearAllMocks();
  io.mockImplementation(() => ({
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  }));
  localStorage.clear();
  window.history.replaceState({}, '', '/login');
  axios.get.mockResolvedValue({ data: {} });
});

test('a valid restored session cannot leave the campaign shell blank at /login', async () => {
  storeCampaignSession();
  axios.post.mockResolvedValue({
    data: { success: true, username: 'dm', id: 42 },
  });

  render(<App />);

  expect(await screen.findByText('DM tools')).toBeInTheDocument();
  expect(screen.getByTestId('campaign-menu')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/dmTools');
});

test('refreshing a valid session keeps the current campaign page', async () => {
  storeCampaignSession();
  window.history.replaceState({}, '', '/journal');
  axios.post.mockResolvedValue({ data: { success: true, username: 'dm', id: 42 } });

  render(<App />);

  expect(await screen.findByText('Journal')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/journal');
});

test('the socket keeps polling fallback and rejoins its campaign once per connection', async () => {
  storeCampaignSession();
  window.history.replaceState({}, '', '/journal');
  axios.post.mockResolvedValue({ data: { success: true, username: 'dm', id: 42 } });

  render(<App />);
  expect(await screen.findByText('Journal')).toBeInTheDocument();
  await waitFor(() => expect(io).toHaveBeenCalledWith(window.location.origin, expect.objectContaining({
    path: '/socket.io/',
    transports: ['polling', 'websocket'],
    query: { token: 'stored-token', campaignID: 7 },
  })));

  const socket = io.mock.results[io.mock.results.length - 1].value;
  const handler = (event) => socket.on.mock.calls.find(([name]) => name === event)[1];
  await act(async () => handler('connect')());
  await waitFor(() => expect(socket.emit).toHaveBeenCalledWith('join_room', {
    username: 'dm', campaign_id: 7,
  }));
  expect(socket.emit.mock.calls.filter(([event]) => event === 'join_room')).toHaveLength(1);

  await act(async () => handler('disconnect')('transport error'));
  await act(async () => handler('connect')());
  await waitFor(() => expect(socket.emit.mock.calls.filter(([event]) => event === 'join_room')).toHaveLength(2));
});

test('the signed-in root opens the dashboard', async () => {
  storeCampaignSession();
  window.history.replaceState({}, '', '/');
  axios.post.mockResolvedValue({ data: { success: true, username: 'dm', id: 42 } });

  render(<App />);

  expect(await screen.findByText('Campaign picker')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/accountProfile');
});

test('the campaign picker keeps only the mobile navigation slot from the campaign shell', async () => {
  storeCampaignSession();
  window.history.replaceState({}, '', '/accountProfile');
  axios.post.mockResolvedValue({
    data: { success: true, username: 'dm', id: 42 },
  });

  render(<App />);

  expect(await screen.findByText('Campaign picker')).toBeInTheDocument();
  expect(screen.getByTestId('campaign-menu').closest('.menu-column-mobile-only')).toBeInTheDocument();
});

test('an expired token clears stale campaign state before showing login', async () => {
  storeCampaignSession();
  window.history.replaceState({}, '', '/dmTools');
  axios.post.mockRejectedValue({ response: { status: 401 } });

  render(<App />);

  await waitFor(() => expect(window.location.pathname).toBe('/login'));
  expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();
  expect(localStorage.getItem('token')).toBeNull();
  expect(localStorage.getItem('selectedCampaign')).toBeNull();
  expect(localStorage.getItem('accountType')).toBeNull();
  expect(screen.queryByTestId('campaign-menu')).not.toBeInTheDocument();
});

test('a fresh login discards stale campaign metadata and opens the campaign picker', async () => {
  localStorage.setItem('accountType', 'DM');
  localStorage.setItem('selectedCampaign', JSON.stringify(storedCampaign));
  axios.post.mockImplementation((url) => {
    if (url === '/api/login') {
      return Promise.resolve({
        data: { access_token: 'new-token', userID: 42, username: 'dm' },
      });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  render(<App />);
  fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'DM' } });
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));

  expect(await screen.findByText('Campaign picker')).toBeInTheDocument();
  await waitFor(() => expect(window.location.pathname).toBe('/accountProfile'));
  expect(localStorage.getItem('selectedCampaign')).toBeNull();
  expect(localStorage.getItem('accountType')).toBeNull();
  expect(screen.queryByTestId('campaign-menu')).not.toBeInTheDocument();
});

test('a shared session entering through a settlement URL returns to the map with campaign context', async () => {
  window.history.replaceState({}, '', '/settlementManager?campaignID=7&campaignName=Waterdeep&accountType=DM');
  axios.get.mockImplementation((url) => {
    if (url === '/api/session') return Promise.resolve({ data: { success: true, access_token: 'shared-token', id: 42, username: 'dm' } });
    return Promise.resolve({ data: {} });
  });

  render(<App />);

  expect(await screen.findByText('Settlement manager')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/settlementManager');
  expect(localStorage.getItem('token')).toBe('shared-token');
  expect(screen.queryByText('Campaign picker')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('DM sound player')).not.toBeInTheDocument();
  expect(axios.get).not.toHaveBeenCalledWith('/api/sounds', expect.anything());
});

test('credential login preserves an explicit map campaign entry', async () => {
  window.history.replaceState({}, '', '/settlementManager?campaignID=7&campaignName=Waterdeep&accountType=DM');
  axios.get.mockRejectedValue({ response: { status: 401 } });
  axios.post.mockImplementation((url) => url === '/api/login'
    ? Promise.resolve({ data: { access_token: 'new-token', userID: 42, username: 'dm' } })
    : Promise.reject(new Error(`Unexpected request: ${url}`)));

  render(<App />);
  fireEvent.change(await screen.findByPlaceholderText('Username'), { target: { value: 'DM' } });
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));

  expect(await screen.findByText('Settlement manager')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/settlementManager');
  expect(screen.queryByText('Campaign picker')).not.toBeInTheDocument();
});

test('a backend login failure is visible instead of failing silently', async () => {
  axios.post.mockImplementation((url) => url === '/api/login'
    ? Promise.reject({ response: { status: 500, data: {} } })
    : Promise.reject(new Error(`Unexpected request: ${url}`)));

  render(<App />);
  fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'user' } });
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));

  expect(await screen.findByText('The server could not complete the login request (HTTP 500).')).toBeInTheDocument();
});

test('a network login failure explains that the backend is unreachable', async () => {
  axios.post.mockImplementation((url) => url === '/api/login'
    ? Promise.reject(new Error('Network Error'))
    : Promise.reject(new Error(`Unexpected request: ${url}`)));

  render(<App />);
  fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'user' } });
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));

  expect(await screen.findByText('Unable to connect to the server backend. Check that it is running and try again.')).toBeInTheDocument();
});

test('theme changes from another Kachhapa tab update the current core page', async () => {
  render(<App />);
  act(() => window.dispatchEvent(new StorageEvent('storage', {key:'theme',newValue:'light'})));
  await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('light'));
  expect(document.documentElement.getAttribute('data-kachhapa-ui')).toBe('core');
  act(() => window.dispatchEvent(new StorageEvent('storage', {key:'theme',newValue:'dark'})));
  await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'));
});


test('a resumed saved encounter restores the player tracker using stable character identity', async () => {
  storeCampaignSession();
  localStorage.setItem('accountType','Player');
  window.history.replaceState({}, '', '/characterSheet');
  axios.post.mockResolvedValue({ data:{success:true,username:'player',id:9} });
  axios.get.mockImplementation(url => Promise.resolve({data:url === '/api/character' ? {id:11,Name:'Same Name'} : {encounter:null}}));
  render(<App />);
  await screen.findByText('Character sheet');
  await waitFor(() => expect(io).toHaveBeenCalled());
  const socket=io.mock.results.at(-1).value;
  const handler=event => socket.on.mock.calls.filter(([name])=>name===event).at(-1)[1];
  await act(async () => handler('connect')());
  await waitFor(() => expect(axios.get).toHaveBeenCalledWith('/api/character',expect.anything()));
  await act(async () => handler('combatants')([{id:'npc',characterName:'Same Name',character_id:null,initiative:15},{id:'pc',characterName:'Same Name',character_id:11,initiative:10}]));
  expect(screen.getByText('Current:')).toBeInTheDocument();
  expect(document.querySelector('.combat-banner')).toHaveTextContent('You: 2');
  await act(async () => handler('combatants')([{id:'pc',characterName:'Same Name',character_id:11,initiative:10}]));
  expect(document.querySelector('.combat-banner')).toHaveTextContent('Next: Same Name (1)');
});
