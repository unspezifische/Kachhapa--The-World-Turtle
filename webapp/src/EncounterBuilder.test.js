import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import EncounterBuilder from './EncounterBuilder';

const mock = new MockAdapter(axios);
const headers = {campaignID:5,Authorization:'Bearer test'};
const snapshot = {document:{templates:[{id:'one',name:'Road ambush',environment:'Road',participants:[{name:'Bandit',quantity:3}]}]}};

beforeEach(() => {
  mock.reset();
  mock.onGet('/api/creatures/filters').reply(200,{sources:['MM'],types:['humanoid'],sizes:['Small'],alignments:['neutral evil'],environments:['forest'],challenge_ratings:['1/4'],weaknesses:['radiant']});
  mock.onGet('/api/encounter-presets').reply(200,[{id:'1:0',name:'Arctic',source:'XGE',entry_count:100,min_level:1,max_level:4}]);
  mock.onGet('/api/creatures').reply(200,[{id:7,name:'Goblin',source:'MM',creature_type:'humanoid',size:'Small',alignment:'neutral evil',environment:'forest',challenge:'1/4',ac:'15',hp:'7',dexterity:14,resistances:'',immunities:'',vulnerabilities:''}]);
});

test('builds a reusable encounter from the filterable creature table', async () => {
  const command = jest.fn().mockResolvedValue(true);
  render(<EncounterBuilder api={{snapshot,command,busy:false,error:''}} headers={headers}/>);
  expect(await screen.findByText('Road ambush')).toBeInTheDocument();
  expect(screen.getByLabelText('Source')).toBeInTheDocument();
  expect(screen.getByLabelText('Creature type')).toBeInTheDocument();
  expect(screen.getByLabelText('Specific defense')).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button',{name:'Add'}));
  fireEvent.change(screen.getByLabelText('Encounter name'),{target:{value:'Goblin patrol'}});
  fireEvent.change(screen.getByLabelText('Disposition for Goblin'),{target:{value:'Friendly'}});
  fireEvent.change(screen.getByLabelText('Initiative grouping for Goblin'),{target:{value:'same'}});
  fireEvent.click(screen.getByRole('button',{name:'Save Encounter'}));
  await waitFor(() => expect(command).toHaveBeenCalledWith('template',expect.objectContaining({
    name:'Goblin patrol',participants:[expect.objectContaining({name:'Goblin',disposition:'Friendly',initiative_group:'same'})]
  })));
});

test('loads system random tables into a reviewable encounter draft', async () => {
  mock.onPost('/api/encounter-presets/roll').reply(200,{name:'Arctic — Random Result',source:'XGE',environment:'Arctic',notes:'Two wolves',participants:[{source:'creatures',source_id:8,name:'Wolf',quantity:2,challenge:'1/4',disposition:'Hostile',initiative_group:'same'}]});
  render(<EncounterBuilder api={{snapshot,command:jest.fn(),busy:false,error:''}} headers={headers}/>);
  expect(await screen.findByRole('option',{name:/Arctic · XGE/})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Roll selected table'}));
  expect(await screen.findByDisplayValue('Arctic — Random Result')).toBeInTheDocument();
  expect(screen.getByText('2 × Wolf')).toBeInTheDocument();
});

test('filters by source and sorts every result column in either direction', async () => {
  mock.onGet('/api/creatures').reply(200,[
    {id:7,name:'Goblin',source:'MM',creature_type:'humanoid',size:'Small',alignment:'neutral evil',environment:'forest',challenge:'1/4',ac:'15',hp:'7'},
    {id:8,name:'Ogre',source:'MM',creature_type:'giant',size:'Large',alignment:'chaotic evil',environment:'hill',challenge:'2',ac:'11',hp:'59'},
  ]);
  render(<EncounterBuilder api={{snapshot,command:jest.fn(),busy:false,error:''}} headers={headers}/>);
  await screen.findByRole('button',{name:/Goblin/});
  fireEvent.change(screen.getByLabelText('Source'),{target:{value:'MM'}});
  await waitFor(() => expect(mock.history.get[mock.history.get.length - 1].params).toEqual(expect.objectContaining({source:'MM'})));

  const table = screen.getByRole('table');
  for (const label of ['Name','Type / Size','Alignment','Environment','CR','AC','HP','Defenses']) {
    expect(within(table).getByRole('button',{name:new RegExp(`Sort by ${label}`)})).toBeInTheDocument();
  }
  fireEvent.click(within(table).getByRole('button',{name:/Sort by HP/}));
  let rows = within(table).getAllByRole('row').slice(1);
  expect(within(rows[0]).getByRole('button',{name:/Goblin/})).toBeInTheDocument();
  fireEvent.click(within(table).getByRole('button',{name:/Sort by HP, ascending/}));
  rows = within(table).getAllByRole('row').slice(1);
  expect(within(rows[0]).getByRole('button',{name:/Ogre/})).toBeInTheDocument();
});

test('opens a creature detail modal with imported 5etools lore', async () => {
  mock.onGet('/api/creatures/7').reply(200,{id:7,name:'Goblin',source:'MM',creature_type:'humanoid',size:'Small',alignment:'neutral evil',challenge:'1/4',ac:'15',hp:'7',fluff_text:'Goblins are small, black-hearted humanoids.',npc_template:{traits:'Nimble Escape: The goblin can disengage.',actions:'Scimitar: Melee Weapon Attack.'}});
  render(<EncounterBuilder api={{snapshot,command:jest.fn(),busy:false,error:''}} headers={headers}/>);
  fireEvent.click(await screen.findByRole('button',{name:/Goblin/}));
  const dialog = await screen.findByRole('dialog');
  expect(await within(dialog).findByText('Goblins are small, black-hearted humanoids.')).toBeInTheDocument();
  expect(within(dialog).getByText(/Nimble Escape/)).toBeInTheDocument();
  fireEvent.click(within(dialog).getAllByRole('button',{name:'Close'}).at(-1));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('named NPC search uses resolved combat data and omits no-combat residents', async () => {
  mock.onGet('/api/npcs').reply(200,[
    {id:21,name:'Renaer',source:'Campaign',creature_type:'humanoid',size:'Medium',alignment:'good',challenge:'3',ac:'16',hp:'66',dexterity:16,combat_enabled:true},
    {id:22,name:'Dock clerk',source:'Campaign',creature_type:'humanoid',size:'Medium',alignment:'neutral',combat_enabled:false},
  ]);
  render(<EncounterBuilder api={{snapshot,command:jest.fn(),busy:false,error:''}} headers={headers}/>);
  fireEvent.click(screen.getByText('Named NPCs'));
  expect(await screen.findByRole('button',{name:/Renaer/})).toBeInTheDocument();
  expect(screen.queryByText('Dock clerk')).not.toBeInTheDocument();
  const row=screen.getByRole('button',{name:/Renaer/}).closest('tr');
  expect(within(row).getByText('66')).toBeInTheDocument();
});
