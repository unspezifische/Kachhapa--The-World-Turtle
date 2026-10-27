import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Menu from './Menu';

const baseProps = {
  headers: { userID: 9, characterName: 'Mira' },
  selectedCampaign: { id: 7, name: 'Waterdeep' },
  setSelectedCampaign: jest.fn(),
  theme: 'dark',
  setTheme: jest.fn(),
};

beforeEach(() => jest.restoreAllMocks());

test('DM mobile navigation exposes role-aware primary destinations', () => {
  render(<MemoryRouter initialEntries={['/dmTools']}><Menu {...baseProps} accountType="DM" /></MemoryRouter>);

  const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
  expect(navigation).toHaveTextContent('Dashboard');
  expect(navigation).toHaveTextContent('DM Tools');
  expect(navigation).toHaveTextContent('Calendar');
  expect(navigation).toHaveTextContent('More');
  expect(within(navigation).getByRole('button', { name: /DM Tools/i })).toHaveAttribute('aria-current', 'page');
});

test('player mobile navigation uses Character and More contains secondary routes', () => {
  render(<MemoryRouter initialEntries={['/journal']}><Menu {...baseProps} accountType="Player" /></MemoryRouter>);

  expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toHaveTextContent('Character');
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  expect(screen.getByRole('presentation')).toBeInTheDocument();
  expect(screen.getAllByText('Inventory').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Spellbook').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Settlement Simulator').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Close more navigation' })).toBeInTheDocument();
});

test('mobile utility controls toggle the theme', () => {
  const setTheme = jest.fn();
  render(<MemoryRouter><Menu {...baseProps} accountType="DM" setTheme={setTheme} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  fireEvent.click(screen.getByRole('button', { name: 'Light Mode' }));
  expect(setTheme).toHaveBeenCalledWith(expect.any(Function));
});

test('players can open the Settlement Simulator in read-only Player View', () => {
  const playerWindow = { focus: jest.fn() };
  const open = jest.spyOn(window, 'open').mockReturnValue(playerWindow);
  render(<MemoryRouter><Menu {...baseProps} accountType="Player" /></MemoryRouter>);

  fireEvent.click(screen.getAllByText('Settlement Simulator')[0]);

  expect(open).toHaveBeenCalledWith(expect.stringMatching(/^\/maps\/player\?/), 'kachhapa-settlement-player');
  expect(open.mock.calls[0][0]).toContain('campaignID=7');
});

test('DMs keep the editable Settlement Manager destination', () => {
  const dmWindow = { focus: jest.fn() };
  const open = jest.spyOn(window, 'open').mockReturnValue(dmWindow);
  render(<MemoryRouter><Menu {...baseProps} accountType="DM" /></MemoryRouter>);

  fireEvent.click(screen.getAllByText('Settlement Simulator')[0]);

  expect(open).toHaveBeenCalledWith(expect.stringMatching(/^\/settlementManager\?/), 'kachhapa-settlement-dm');
});
