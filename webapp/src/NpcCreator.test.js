import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import NpcCreator from './NpcCreator';
import { mergeGeneration, routineForOccupation, newSchedule } from './npcDraft';
jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn() }));
const headers = { CampaignID: '1' };
beforeEach(() => {
  jest.resetAllMocks();
  axios.get.mockImplementation(url => Promise.resolve({ data: url.includes('generation') ? { ancestries:['human','elf'], occupations:[{key:'scholar'}], genders:['woman'], alignments:['neutral'] } : { locations:[], hours_per_day:24, minutes_per_hour:60 } }));
});
test('manual values and intentionally empty fields survive fill and targeted reroll', async () => {
  axios.post.mockResolvedValue({data:{values:{name:'Generated',creature_subtype:'elf',occupation:'scholar'},generation:{seed:1},warnings:[]}});
  render(<NpcCreator show headers={headers} onClose={jest.fn()} onSaved={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Name'), {target:{value:'Keep Name'}});
  fireEvent.click(screen.getByText('Smart Fill'));
  await waitFor(() => expect(screen.getByLabelText('Race / Ancestry')).toHaveValue('elf'));
  expect(screen.getByLabelText('Name')).toHaveValue('Keep Name');
  expect(axios.post.mock.calls[0][1].locked_fields).toContain('name');
  fireEvent.click(screen.getByRole('button',{name:'Re-roll Name'}));
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Keep Current Value'));
  expect(screen.getByLabelText('Name')).toHaveValue('Keep Name');
  fireEvent.click(screen.getByRole('button',{name:'Re-roll Name'}));
  fireEvent.click(screen.getByText('Unlock & Re-roll'));
  await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Generated'));
  expect(screen.getByRole('button',{name:'Lock Name for random changes'})).toBeInTheDocument();
  expect(screen.getByLabelText('Race / Ancestry')).toHaveValue('elf');
  fireEvent.click(screen.getByText('Undo Last Generation'));
  expect(screen.getByLabelText('Name')).toHaveValue('Keep Name');
  expect(mergeGeneration({description:''},{description:'New'},['description']).description).toBe('');
});
test('steps retain a schedule draft and creation remains unsaved until review', async () => {
  render(<NpcCreator show headers={headers} onClose={jest.fn()} onSaved={jest.fn()} />);
  fireEvent.click(screen.getByText('4. Schedule'));
  fireEvent.click(screen.getByText('Create Schedule'));
  fireEvent.click(screen.getByText('Re-roll Routine'));
  expect(screen.getByLabelText('Start sleep')).toHaveValue('22:00');
  fireEvent.click(screen.getByText('1. Identity & Occupation'));
  fireEvent.click(screen.getByText('4. Schedule'));
  expect(screen.getByLabelText('Start sleep')).toHaveValue('22:00');
  expect(axios.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('5. Review'));
  expect(screen.getByText('Save NPC & Schedule')).toBeDisabled();
});
test('an existing module opens kept and shows override notice without duplicating its ID', async () => {
  const initial={id:7,source:'Module',module_key:'waterdeep_dragon_heist',name:'A',profile_metadata:{},revision:1};
  render(<NpcCreator show initial={initial} headers={headers} onClose={jest.fn()} onSaved={jest.fn()} />);
  expect(screen.getByText(/Saving creates a linked Homebrew override/)).toBeInTheDocument();
  expect(screen.getAllByRole('button', {name:/^Unlock .* for random changes$/})).toHaveLength(7);
  fireEvent.change(screen.getByLabelText('Name'), {target:{value:'Edited while locked'}});
  expect(screen.getByLabelText('Name')).toHaveValue('Edited while locked');
});
test('routine reroll keeps selected activities and location bindings', () => {
  const original=routineForOccupation(newSchedule(),'scholar'); original.bindings.home={resolved:{property_id:'home'}};original.rules[0].start='21:00';
  const next=routineForOccupation(original,'guard',['sleep']);
  expect(next.rules.find(rule=>rule.id==='sleep').start).toBe('21:00');
  expect(next.rules.find(rule=>rule.id==='work').activity).toBe('guard');
  expect(next.bindings.home.resolved.property_id).toBe('home');
});

test('overnight timeline has separate portions before and after midnight', () => {
  const {scheduleTimeline}=require('./npcDraft');
  const result=scheduleTimeline({rules:[{id:'sleep',start:'22:00',duration_minutes:480,activity:'sleep',repeat:{kind:'daily'}}]});
  expect(result.map(segment=>[segment.start,segment.end])).toEqual([[1320,1440],[0,360]]);
});
