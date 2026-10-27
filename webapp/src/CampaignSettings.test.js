import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import CampaignSettings from './CampaignSettings';

jest.mock('axios');

const initialSettings = {
  campaign: { id: 5, name: 'Test Campaign', system: 'D&D', ruleset: '5e', rules_system: 'D&D 5e', icon: null },
  installed_modules: [],
  available_modules: [],
  calendar: null,
  profile_icon_presets: [
    { key: 'wizard', name: 'Wizard', url: '/avatars/wizard.webp' },
  ],
};

beforeEach(() => jest.resetAllMocks());

test('game rules and wiki access share the narrow settings column', async () => {
  axios.get.mockResolvedValue({ data: initialSettings });

  const { container } = render(<CampaignSettings campaignID={5} headers={{ Authorization: 'Bearer token' }} embedded />);

  await screen.findByLabelText('Edition');
  const stack = container.querySelector('.campaign-settings-access-stack');
  expect(stack).toContainElement(container.querySelector('.campaign-rules-card'));
  expect(stack).toContainElement(container.querySelector('.campaign-wiki-card'));
  expect(container.querySelector('.campaign-settings-access-layout')).toContainElement(container.querySelector('.campaign-members-card'));
  expect(container.querySelector('.campaign-members-card')).not.toBe(stack);
});

test('the DM can rename the campaign', async () => {
  axios.get.mockResolvedValue({ data: initialSettings });
  axios.patch.mockResolvedValue({
    data: { campaign: { ...initialSettings.campaign, name: 'Waterdeep Nights' } },
  });
  const updated = jest.fn();
  window.addEventListener('campaign-updated', updated);

  render(<CampaignSettings campaignID={5} headers={{ Authorization: 'Bearer token' }} embedded />);

  fireEvent.change(await screen.findByLabelText('Campaign name'), { target: { value: 'Waterdeep Nights' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save name' }));

  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith(
    '/api/campaigns/5/name',
    { name: 'Waterdeep Nights' },
    { headers: { Authorization: 'Bearer token' } },
  ));
  expect(await screen.findByText('Campaign renamed to Waterdeep Nights.')).toBeInTheDocument();
  expect(updated).toHaveBeenCalled();
  window.removeEventListener('campaign-updated', updated);
});

test('the DM can choose a preloaded campaign profile icon', async () => {
  axios.get.mockResolvedValue({ data: initialSettings });
  axios.patch.mockResolvedValue({
    data: { campaign: { ...initialSettings.campaign, icon: '/avatars/wizard.webp' } },
  });

  render(<CampaignSettings campaignID={5} headers={{ Authorization: 'Bearer token' }} embedded />);

  fireEvent.click(await screen.findByRole('button', { name: 'Use Wizard campaign icon' }));

  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith(
    '/api/campaigns/5/profile-icon',
    { preset_key: 'wizard' },
    { headers: { Authorization: 'Bearer token' } },
  ));
  expect(await screen.findByText('Campaign profile icon updated.')).toBeInTheDocument();
  expect(screen.getByAltText('Current campaign icon')).toHaveAttribute('src', '/avatars/wizard.webp');
});

test('the DM can choose the D&D ruleset independently of the system', async () => {
  axios.get.mockResolvedValue({ data: initialSettings });
  axios.patch.mockResolvedValue({
    data: { campaign: { ...initialSettings.campaign, ruleset: '5e (2024)', rules_system: 'D&D 5e (2024)' } },
  });

  render(<CampaignSettings campaignID={5} headers={{ Authorization: 'Bearer token' }} embedded />);

  fireEvent.change(await screen.findByLabelText('Edition'), { target: { value: '5e (2024)' } });

  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith(
    '/api/campaigns/5/ruleset',
    { ruleset: '5e (2024)' },
    { headers: { Authorization: 'Bearer token' } },
  ));
  expect(await screen.findByText('Campaign ruleset changed to 5e (2024).')).toBeInTheDocument();
});

test('an installed module can import newly packaged NPC content', async () => {
  const settings = {
    ...initialSettings,
    installed_modules: [{
      id: 3,
      module_key: 'waterdeep_dragon_heist',
      module_name: 'Waterdeep Dragon Heist',
      setting_key: 'forgotten_realms',
      starting_year: 1492,
      settlement_strategy: 'merge',
    }],
  };
  axios.get.mockResolvedValue({ data: settings });
  axios.post.mockResolvedValue({ data: { npcs_added: 37, settlement_result: 'merged' } });

  render(<CampaignSettings campaignID={5} headers={{ Authorization: 'Bearer token' }} embedded />);

  fireEvent.click(await screen.findByRole('button', { name: 'Refresh content' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    '/api/campaigns/5/modules/waterdeep_dragon_heist/refresh',
    { settlement_strategy: 'merge' },
    { headers: { Authorization: 'Bearer token' } },
  ));
  expect(await screen.findByText('Waterdeep Dragon Heist refreshed. 37 new NPCs added to the library.')).toBeInTheDocument();
});

test('the DM can select all eligible friends, invite them, and see pending members', async () => {
  const memberPayload = {
    active: [{ id: 3, username: 'dm', status: 'active' }],
    pending: [{ id: 8, username: 'mira', status: 'pending', invitation_id: 18 }],
    friends: [{ id: 8, username: 'mira' }, { id: 9, username: 'orin' }],
  };
  axios.get.mockImplementation(url => Promise.resolve({ data: url.endsWith('/members') ? memberPayload : initialSettings }));
  axios.post.mockResolvedValue({ data: { invitations: [] } });

  render(<CampaignSettings campaignID={5} headers={{ Authorization: 'Bearer token' }} embedded />);

  expect((await screen.findAllByText('@mira')).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
  fireEvent.click(screen.getByRole('button', { name: 'Invite selected' }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    '/api/campaigns/5/invitations', { user_ids: [9] }, { headers: { Authorization: 'Bearer token' } },
  ));
});

test('the DM can set Scribes Only and assign different player wiki roles', async () => {
  const memberPayload = {
    active: [
      { id: 3, username: 'dm', status: 'active', is_dm: true, wiki_role: 'read_only' },
      { id: 9, username: 'orin', status: 'active', is_dm: false, wiki_role: 'read_only' },
    ],
    pending: [], friends: [], wiki_permission: 'everyone',
  };
  axios.get.mockImplementation(url => Promise.resolve({
    data: url.endsWith('/members') ? memberPayload : (url.endsWith('/wiki-proposals') ? [] : initialSettings),
  }));
  axios.patch.mockResolvedValue({ data: {} });

  render(<CampaignSettings campaignID={5} headers={{ Authorization: 'Bearer token' }} embedded />);

  fireEvent.change(await screen.findByLabelText('Who can write to the campaign wiki?'), { target: { value: 'scribes_only' } });
  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith(
    '/api/campaigns/5/wiki-permissions', { mode: 'scribes_only' }, { headers: { Authorization: 'Bearer token' } },
  ));
  expect(await screen.findByText(/Scribes can publish directly/)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Wiki role for @orin'), { target: { value: 'scribe_approval' } });
  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith(
    '/api/campaigns/5/members/9/wiki-role', { role: 'scribe_approval' }, { headers: { Authorization: 'Bearer token' } },
  ));
  expect(screen.getByText('DM · Full access')).toBeInTheDocument();
});

test('the DM can approve a submitted wiki change', async () => {
  const proposal = { id: 14, page_title: 'The Yawning Portal', content: '<p>New lore</p>', submitted_by: { username: 'orin' } };
  axios.get.mockImplementation(url => Promise.resolve({
    data: url.endsWith('/members')
      ? { active: [], pending: [], friends: [], wiki_permission: 'scribes_only' }
      : (url.endsWith('/wiki-proposals') ? [proposal] : initialSettings),
  }));
  axios.patch.mockResolvedValue({ data: { status: 'approved' } });

  render(<CampaignSettings campaignID={5} headers={{ Authorization: 'Bearer token' }} embedded />);

  expect(await screen.findByText('The Yawning Portal')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith(
    '/api/campaigns/5/wiki-proposals/14', { action: 'approve' }, { headers: { Authorization: 'Bearer token' } },
  ));
  expect(await screen.findByText('Wiki change approved.')).toBeInTheDocument();
});
