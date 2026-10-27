import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import Spellbook from './Spellbook';

jest.mock('axios');

const headers = { Authorization: 'Bearer token', CampaignID: 7, userID: 42 };
const spell = {
  id: 10, name: 'Fireball', source: 'PHB', page: 241, level: 3,
  school: 'Evocation', casting_time: '1 action', range: '150 Feet',
  components: ['V', 'S', 'M (bat guano and sulfur)'], duration: 'Instant',
  description: 'A bright streak flashes.\n\nEach creature makes a Dexterity saving throw.',
  classes: ['Sorcerer', 'Wizard'], damage_types: ['fire'], conditions: [],
  saving_throws: ['dexterity'], spell_attacks: [], ritual: false, concentration: false,
  eligibility: { eligible: true, reason: 'Available to your Wizard class', source: 'class' },
  in_spellbook: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  axios.get.mockResolvedValue({ data: {
    spells: [spell], total: 1,
    filters: { classes: ['Wizard'], levels: ['3'], schools: ['Evocation'], casting_times: ['1 action'], sources: ['PHB'], damage_types: ['fire'], conditions: [], saving_throws: ['dexterity'], spell_attacks: [] },
  } });
});

test('searches and filters the imported spell catalog', async () => {
  render(<Spellbook headers={headers} />);
  expect(await screen.findByText('Fireball')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Classes'), { target: { name: 'class', value: 'Wizard' } });
  await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith('/api/spell-catalog', expect.objectContaining({
    headers,
    params: expect.objectContaining({ class: 'Wizard', page: 1, page_size: 50 }),
  })));
});

test('opens a readable spell detail panel', async () => {
  render(<Spellbook headers={headers} />);
  fireEvent.click(await screen.findByText('Fireball'));
  expect(screen.getByRole('dialog', { name: 'Fireball' })).toBeInTheDocument();
  expect(screen.getByText(/Each creature makes/)).toBeInTheDocument();
  expect(screen.getByText(/Sorcerer · Wizard/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add to Spell Book' })).toBeEnabled();
});

test('adds an eligible spell to the character spellbook', async () => {
  axios.post.mockResolvedValue({ data: { message: 'Added to your spellbook' } });
  render(<Spellbook headers={headers} />);
  fireEvent.click(await screen.findByText('Fireball'));
  fireEvent.click(screen.getByRole('button', { name: 'Add to Spell Book' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/spellbook/spells/10', {}, { headers }));
  expect(await screen.findByRole('button', { name: 'Already in your spellbook' })).toBeDisabled();
  expect(screen.getByText(/now prepared on your character sheet/i)).toBeInTheDocument();
});

test('explains why an unavailable spell cannot be added', async () => {
  axios.get.mockResolvedValue({ data: {
    spells: [{ ...spell, eligibility: { eligible: false, reason: 'This spell is a mystery to you', source: null } }],
    total: 1, filters: {},
  } });
  render(<Spellbook headers={headers} />);
  fireEvent.click(await screen.findByText('Fireball'));
  expect(screen.getByRole('button', { name: 'This spell is a mystery to you' })).toBeDisabled();
  expect(axios.post).not.toHaveBeenCalled();
});
