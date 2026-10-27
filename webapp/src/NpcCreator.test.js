import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import NpcCreator from './NpcCreator';
import { mergeGeneration, routineForOccupation, newSchedule } from './npcDraft';
jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn() }));
const headers = { CampaignID: '1' };
const completeTemplate = {name:'',size:'Small',creature_type:'humanoid',creature_subtype:'goblinoid',alignment:'neutral evil',ac:'15',hp:'7',speed:30,strength:8,dexterity:14,constitution:10,intelligence:10,wisdom:8,charisma:8,description:'Named Goblin NPC.',saving_throws:'',skills:'',immunities:'',resistance:'',senses:'',languages:'Common, Goblin',challenge:'1/4',traits:'',actions:'Scimitar'};
beforeEach(() => {
  jest.resetAllMocks();
  URL.createObjectURL = jest.fn(() => 'blob:portrait');
  URL.revokeObjectURL = jest.fn();
  axios.get.mockImplementation(url => Promise.resolve({ data: url.includes('generation') ? { ancestries:['human','elf'], occupations:[{key:'scholar'}], genders:['woman'], alignments:['neutral'] } : { locations:[], hours_per_day:24, minutes_per_hour:60 } }));
  axios.put.mockResolvedValue({data:{revision:2,occupations:[],roles:[],social_positions:[],combat_profiles:[]}});
});
test('manual values and intentionally empty fields survive fill and targeted reroll', async () => {
  axios.post.mockResolvedValue({data:{values:{name:'Generated',creature_subtype:'elf',occupation:'scholar'},generation:{seed:1},warnings:[]}});
  render(<NpcCreator show headers={headers} onClose={jest.fn()} onSaved={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Name'), {target:{value:'Keep Name'}});
  fireEvent.click(screen.getByText('Smart Fill'));
  await waitFor(() => expect(screen.getByLabelText('Race / Species')).toHaveValue('elf'));
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
  expect(screen.getByLabelText('Race / Species')).toHaveValue('elf');
  fireEvent.click(screen.getByText('Undo generation'));
  expect(screen.getByLabelText('Name')).toHaveValue('Keep Name');
  expect(mergeGeneration({description:''},{description:'New'},['description']).description).toBe('');
});
test('steps retain a schedule draft and creation remains unsaved until review', async () => {
  render(<NpcCreator show headers={headers} onClose={jest.fn()} onSaved={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', {name: /Schedule/}));
  fireEvent.click(screen.getByText('Create Schedule'));
  fireEvent.click(screen.getByText('Build from occupations & roles'));
  expect(screen.getByLabelText('Start sleep')).toHaveValue('22:00');
  fireEvent.click(screen.getByRole('button', {name: /Identity/}));
  fireEvent.click(screen.getByRole('button', {name: /Schedule/}));
  expect(screen.getByLabelText('Start sleep')).toHaveValue('22:00');
  expect(axios.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: /Review/}));
  expect(screen.getByText('Save NPC')).toBeDisabled();
});
test('an existing module opens kept and shows override notice without duplicating its ID', async () => {
  const initial={id:7,source:'Module',module_key:'waterdeep_dragon_heist',name:'A',profile_metadata:{},revision:1};
  render(<NpcCreator show initial={initial} headers={headers} onClose={jest.fn()} onSaved={jest.fn()} />);
  expect(screen.getByText(/Saving creates a linked Homebrew override/)).toBeInTheDocument();
  expect(screen.getAllByRole('button', {name:/^Unlock .* for random changes$/})).toHaveLength(7);
  fireEvent.change(screen.getByLabelText('Name'), {target:{value:'Edited while locked'}});
  expect(screen.getByLabelText('Name')).toHaveValue('Edited while locked');
});
test('a catalog monster pre-fills an editable named NPC and preserves its catalog id on save', async () => {
  axios.get.mockImplementation(url => {
    if (url === '/api/creatures') return Promise.resolve({data:[{id:42,name:'Goblin',source:'MM',challenge:'1/4'}]});
    if (url === '/api/creatures/42') return Promise.resolve({data:{npc_template:completeTemplate}});
    return Promise.resolve({ data: url.includes('generation') ? { ancestries:[], occupations:[], genders:[], alignments:[] } : { locations:[] } });
  });
  axios.post.mockResolvedValue({data:{id:9,name:'Snik'}});
  render(<NpcCreator show headers={headers} onClose={jest.fn()} onSaved={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Search monster catalog'),{target:{value:'goblin'}});
  fireEvent.click(screen.getByText('Search'));
  const goblinResult = await screen.findByRole('button', {name: /Goblin.*MM/}); fireEvent.click(goblinResult);
  await waitFor(() => expect(screen.getByLabelText('Race / Species')).toHaveValue('goblinoid'));
  expect(screen.getByLabelText('Creature Type')).toHaveValue('humanoid');
  fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Snik'}});
  fireEvent.click(screen.getByRole('button', {name: /Review/})); fireEvent.click(screen.getByText('Save NPC'));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/npcs',expect.objectContaining({catalog_creature_id:42,name:'Snik'}),{headers}));
});
test('media is staged until save and a failed upload retries without creating a duplicate NPC', async () => {
  let uploadAttempts = 0;
  axios.get.mockImplementation(url => {
    if (url === '/api/creatures') return Promise.resolve({data:[{id:42,name:'Goblin',source:'MM',challenge:'1/4'}]});
    if (url === '/api/creatures/42') return Promise.resolve({data:{npc_template:completeTemplate}});
    return Promise.resolve({ data: url.includes('generation') ? { ancestries:[], occupations:[], genders:[], alignments:[] } : { locations:[] } });
  });
  axios.post.mockImplementation(url => {
    if (url === '/api/npcs') return Promise.resolve({data:{id:9,name:'Snik',revision:1}});
    if (url === '/api/npc-media/assets') {
      uploadAttempts += 1;
      return uploadAttempts === 1 ? Promise.reject(new Error('upload failed')) : Promise.resolve({data:{id:'portrait-1'}});
    }
    if (url === '/api/npc-media/assets/portrait-1/crop') return Promise.resolve({data:{id:'token-1'}});
    return Promise.resolve({data:{}});
  });
  axios.patch.mockResolvedValue({data:{}});
  const onSaved = jest.fn();
  render(<NpcCreator show headers={headers} onClose={jest.fn()} onSaved={onSaved} />);
  fireEvent.change(screen.getByLabelText('Search monster catalog'),{target:{value:'goblin'}});
  fireEvent.click(screen.getByText('Search'));
  fireEvent.click(await screen.findByRole('button', {name: /Goblin.*MM/}));
  await waitFor(() => expect(screen.getByLabelText('Race / Species')).toHaveValue('goblinoid'));
  fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Snik'}});
  fireEvent.change(screen.getByLabelText('Choose portrait image'), {target:{files:[new File(['portrait'], 'snik.png', {type:'image/png'})]}});
  fireEvent.click(screen.getByRole('button', {name: /Review/}));
  fireEvent.click(screen.getByText('Save NPC'));
  await screen.findByText(/NPC saved, but the artwork could not be attached/);
  fireEvent.click(screen.getByText('Save NPC'));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({id:9})));
  expect(axios.post.mock.calls.filter(([url]) => url === '/api/npcs')).toHaveLength(1);
  expect(axios.post.mock.calls.filter(([url]) => url === '/api/npc-media/assets')).toHaveLength(2);
  expect(axios.patch).toHaveBeenCalledWith('/api/npc-media/npcs/9', {portrait:'portrait-1',token:'token-1'}, {headers});
});
test('Save and Place requires a settlement and hands the saved NPC to map placement', async () => {
  axios.get.mockImplementation(url => Promise.resolve({data:
    url.includes('generation') ? {ancestries:[],occupations:[],genders:[],alignments:[]} :
    url.startsWith('/api/world-atlas/') ? {locations:[{id:3,name:'Dock Ward'}]} : {locations:[]}}));
  const npc = {id:9,revision:1,profile_metadata:{},...completeTemplate,name:'Snik'};
  axios.patch.mockResolvedValue({data:{...npc,revision:2}});
  const onPlace = jest.fn();
  render(<NpcCreator show initial={npc} headers={headers} onClose={jest.fn()} onSaved={jest.fn()} onPlace={onPlace} />);
  fireEvent.click(screen.getByRole('button', {name: /Review/}));
  expect(screen.getByText('Save & Place on Map')).toBeDisabled();
  await screen.findByText('Dock Ward');
  fireEvent.change(screen.getByLabelText('Settlement for map placement'), {target:{value:'3'}});
  await waitFor(() => expect(screen.getByText('Save & Place on Map')).toBeEnabled());
  fireEvent.click(screen.getByText('Save & Place on Map'));
  await waitFor(() => expect(onPlace).toHaveBeenCalledWith(expect.objectContaining({id:9,revision:2}), 3));
});
test('identity uses canonical selects and abilities preserve separate method drafts', async () => {
  render(<NpcCreator show headers={headers} onClose={jest.fn()} onSaved={jest.fn()} />);
  expect(screen.getByLabelText('Alignment').tagName).toBe('SELECT');
  expect(screen.getByLabelText('Size').tagName).toBe('SELECT');
  expect(screen.getByLabelText('Creature Type').tagName).toBe('SELECT');
  expect([...screen.getByLabelText('Alignment').options].map(option => option.value)).toEqual(expect.arrayContaining([
    'lawful good', 'neutral good', 'chaotic good', 'lawful neutral', 'neutral', 'chaotic neutral', 'lawful evil', 'neutral evil', 'chaotic evil',
  ]));
  expect([...screen.getByLabelText('Creature Type').options].map(option => option.value)).toHaveLength(15);
  expect([...screen.getByLabelText('Creature Type').options].map(option => option.value)).toContain('humanoid');
  fireEvent.click(screen.getByRole('button', {name: /Abilities/}));
  fireEvent.click(screen.getByText('Point Buy'));
  expect(screen.getByText('27')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Strength/), {target:{value:'15'}});
  expect(screen.getByText('18')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Manual'));
  fireEvent.change(screen.getByLabelText(/Strength/), {target:{value:'17'}});
  fireEvent.click(screen.getByText('Standard Array'));
  expect(screen.getByLabelText(/Strength/)).toHaveValue('15');
  fireEvent.click(screen.getByText('4d6 Roll'));
  fireEvent.click(screen.getByText('Roll all six scores'));
  ['Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma'].forEach(ability => {
    expect(Number(screen.getByLabelText(new RegExp(ability)).value)).toBeGreaterThanOrEqual(3);
    expect(Number(screen.getByLabelText(new RegExp(ability)).value)).toBeLessThanOrEqual(18);
  });
  fireEvent.click(screen.getByText('Point Buy'));
  expect(screen.getByLabelText(/Strength/)).toHaveValue('15');
});
test('class uses the player class catalog and only appears for active or retired adventurers', async () => {
  axios.get.mockImplementation(url => Promise.resolve({data:url.includes('generation') ? {
    ancestries:[], occupations:[
      {key:'scholar',label:'Scholar'}, {key:'clergy',label:'Clergy'},
      {key:'adventurer',label:'Adventurer'}, {key:'retired_adventurer',label:'Adventurer, retired'},
    ], classes:['Fighter','Wizard'], genders:[], alignments:[],
  } : {locations:[]}}));
  render(<NpcCreator show headers={headers} onClose={jest.fn()} onSaved={jest.fn()} />);
  const occupation = await screen.findByLabelText('Occupation');
  expect([...occupation.options].map(option => option.text)).toEqual(expect.arrayContaining(['Clergy','Adventurer','Adventurer, retired']));
  expect(screen.queryByLabelText('Class')).not.toBeInTheDocument();
  fireEvent.change(occupation, {target:{value:'adventurer'}});
  expect(screen.getByLabelText('Class')).toBeInTheDocument();
  expect([...screen.getByLabelText('Class').options].map(option => option.value)).toEqual(['','Fighter','Wizard']);
  fireEvent.change(screen.getByLabelText('Class'), {target:{value:'Wizard'}});
  fireEvent.change(occupation, {target:{value:'scholar'}});
  expect(screen.queryByLabelText('Class')).not.toBeInTheDocument();
  fireEvent.change(occupation, {target:{value:'retired_adventurer'}});
  expect(screen.getByLabelText('Class')).toHaveValue('Wizard');
});
test('combat authoring is independent from occupation and class progression is repeatable', async () => {
  axios.get.mockImplementation(url => Promise.resolve({data:url.includes('generation') ? {
    ancestries:[], occupations:[{key:'scholar',label:'Scholar'}], classes:['Rogue','Wizard'], genders:[], alignments:[],
  } : url.includes('occupation-definitions') ? [{id:4,key:'scholar',name:'Scholar'}] : {locations:[]}}));
  render(<NpcCreator show headers={headers} onClose={jest.fn()} onSaved={jest.fn()} />);
  fireEvent.change(await screen.findByLabelText('Occupation'), {target:{value:'scholar'}});
  fireEvent.click(screen.getByRole('button', {name:/Combat/}));
  fireEvent.click(screen.getByText('Classes & Levels'));
  expect(screen.getByLabelText('Class 1')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Class 1'), {target:{value:'Wizard'}});
  fireEvent.change(screen.getByLabelText('Level 1'), {target:{value:'7'}});
  fireEvent.click(screen.getByText('Add class'));
  fireEvent.change(screen.getByLabelText('Class 2'), {target:{value:'Rogue'}});
  fireEvent.change(screen.getByLabelText('Level 2'), {target:{value:'3'}});
  expect(screen.getByText(/Character level:/)).toHaveTextContent('10');
  fireEvent.click(screen.getByRole('button', {name:/Identity/}));
  expect(screen.getByLabelText('Occupation')).toHaveValue('scholar');
});
test('switching an existing combat mode requires confirmation and explains retention', async () => {
  const initial={id:9,revision:3,profile_metadata:{},...completeTemplate,name:'Renaer'};
  axios.get.mockImplementation(url => {
    if (url.endsWith('/domains')) return Promise.resolve({data:{npc_id:9,revision:3,occupations:[],roles:[],social_positions:[],combat_profiles:[{id:8,name:'Primary',authoring_mode:'template',template_creature_id:42,is_active:true,class_progression:[]} ]}});
    return Promise.resolve({data:url.includes('generation') ? {ancestries:[],occupations:[],classes:['Rogue'],genders:[],alignments:[]} : url.includes('occupation-definitions') ? [] : {locations:[]}});
  });
  render(<NpcCreator show initial={initial} headers={headers} onClose={jest.fn()} onSaved={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', {name:/Combat/}));
  await screen.findByText('NPC Template');
  fireEvent.click(screen.getByText('No Combat Profile'));
  expect(screen.getByRole('alertdialog')).toHaveTextContent('remain available as an inactive alternate');
  fireEvent.click(screen.getByText('Keep old & switch'));
  expect(screen.getByText(/simulation remain available without combat mechanics/)).toBeInTheDocument();
});
test('a no-combat resident can save without filling tactical statistics', async () => {
  const resident={id:12,revision:1,source:'Homebrew',profile_metadata:{},name:'Mara',size:'Medium',creature_type:'humanoid',creature_subtype:'human',alignment:'neutral',description:'A dock clerk.',ac:'',hp:'',speed:'',strength:'',dexterity:'',constitution:'',intelligence:'',wisdom:'',charisma:'',saving_throws:'',skills:'',immunities:'',resistance:'',senses:'',languages:'',challenge:'',traits:'',actions:''};
  axios.patch.mockResolvedValue({data:{...resident,revision:2}});
  axios.put.mockResolvedValue({data:{revision:3,occupations:[],roles:[],social_positions:[],combat_profiles:[{authoring_mode:'none',is_active:true}]}});
  render(<NpcCreator show initial={resident} headers={headers} onClose={jest.fn()} onSaved={jest.fn()} />);
  fireEvent.click(screen.getByRole('button',{name:/Combat/}));
  fireEvent.click(screen.getByText('No Combat Profile'));
  fireEvent.click(screen.getByRole('button',{name:/Review/}));
  expect(screen.getByText('Save NPC')).toBeEnabled();
  fireEvent.click(screen.getByText('Save NPC'));
  await waitFor(()=>expect(axios.patch).toHaveBeenCalledWith('/api/npcs/12',expect.objectContaining({ac:'10',hp:'1',speed:30,strength:10}),{headers}));
});
test('birth date supports partial precision and derives the season from a month', async () => {
  axios.get.mockImplementation(url => Promise.resolve({data:url.includes('generation') ? {ancestries:[],occupations:[],genders:[],alignments:[]} : url.includes('schedule-locations') ? {
    locations:[], months:Array.from({length:12},(_,index)=>({name:`Month ${index+1}`,length:30})),
    seasons:[{name:'Winter',months:[0,1,2]},{name:'Spring',months:[3,4,5]},{name:'Summer',months:[6,7,8]},{name:'Autumn',months:[9,10,11]}], holidays:[],
  } : {locations:[]}}));
  const npc = {id:9,revision:1,profile_metadata:{},...completeTemplate,name:'Snik'};
  axios.patch.mockResolvedValue({data:{...npc,revision:2,birth_year:1460,birth_season:'Summer',birth_month_index:6,birth_day:null}});
  render(<NpcCreator show initial={npc} headers={headers} onClose={jest.fn()} onSaved={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Month')).toHaveTextContent('Month 7'));
  fireEvent.change(screen.getByLabelText('Year'),{target:{value:'1460'}});
  fireEvent.change(screen.getByLabelText('Month'),{target:{value:'6'}});
  expect(screen.getByLabelText('Season')).toHaveValue('Summer');
  fireEvent.click(screen.getByRole('button',{name:/Review/}));
  fireEvent.click(screen.getByText('Save NPC'));
  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith('/api/npcs/9',expect.objectContaining({birth_year:'1460',birth_season:'Summer',birth_month_index:6,birth_day:null}),{headers}));
});
test('species derives available defaults while preserving a manually edited sense', async () => {
  axios.get.mockImplementation(url => {
    if (url === '/api/races/Dwarf') return Promise.resolve({data:{size:['M'],speed:{walk:25},darkvision:60,languageProficiencies:[{common:true,dwarvish:true}]}});
    if (url === '/api/races/Elf') return Promise.resolve({data:{size:['M'],speed:{walk:30},darkvision:120,languageProficiencies:[{common:true,elvish:true}]}});
    return Promise.resolve({data:url.includes('generation') ? {species:['Dwarf','Elf'],ancestries:[],occupations:[],genders:[],alignments:[]} : {locations:[]}});
  });
  render(<NpcCreator show headers={headers} onClose={jest.fn()} onSaved={jest.fn()} />);
  const species = screen.getByLabelText('Race / Species');
  fireEvent.change(species, {target:{value:'Dwarf'}});
  fireEvent.keyDown(species, {key:'Enter',code:'Enter'});
  await waitFor(() => expect(screen.getByLabelText('Size')).toHaveValue('Medium'));
  expect(screen.getByLabelText('Creature Type')).toHaveValue('humanoid');
  fireEvent.click(screen.getByRole('button', {name: /Combat/}));
  expect(screen.getByLabelText('Speed')).toHaveValue(25);
  await waitFor(() => expect(screen.getByLabelText('Senses')).toHaveValue('darkvision 60 ft., passive Perception 10'));
  expect(screen.getByText('Dwarvish')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Senses'), {target:{value:'tremorsense 30 ft.'}});
  fireEvent.click(screen.getByRole('button', {name: /Identity/}));
  fireEvent.change(screen.getByLabelText('Race / Species'), {target:{value:'Elf'}});
  fireEvent.keyDown(screen.getByLabelText('Race / Species'), {key:'Enter',code:'Enter'});
  await waitFor(() => expect(axios.get).toHaveBeenCalledWith('/api/races/Elf', expect.any(Object)));
  fireEvent.click(screen.getByRole('button', {name: /Combat/}));
  await waitFor(() => expect(screen.getByLabelText('Speed')).toHaveValue(30));
  expect(screen.getByLabelText('Senses')).toHaveValue('tremorsense 30 ft.');
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
