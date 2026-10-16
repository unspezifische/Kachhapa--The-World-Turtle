import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import ThemeEditor from './ThemeEditor';
import AppearanceSettings from './AppearanceSettings';
const presets=require('../../Flask/theme_presets.json');
const headers={Authorization:'Bearer test'};
let mock;
beforeEach(()=>{mock=new MockAdapter(axios);mock.onGet('/api/appearance').reply(200,{...presets,user_id:1});});
afterEach(()=>{mock.restore();});
test('new theme saves a paired draft without changing assignments; gallery selects shared channels',async()=>{
 let saved;
 mock.onPost('/api/appearance/themes').reply(config=>{saved=JSON.parse(config.data);return [200,{...presets,revision:1,themes:[...presets.themes,{id:'test',name:saved.name,palettes:saved.palettes,builtin:false}]}];});
 render(<MemoryRouter initialEntries={['/themes/new']}><Routes><Route path="/themes/new" element={<ThemeEditor headers={headers}/>}/><Route path="/themes/:themeId" element={<ThemeEditor headers={headers}/>}/></Routes></MemoryRouter>);
 await screen.findByLabelText('Theme name');fireEvent.change(screen.getByLabelText('Theme name'),{target:{value:'Disposable'}});
 fireEvent.click(screen.getByRole('button',{name:'Primary',exact:true}));expect(screen.getByLabelText('Shared color role')).toHaveValue('accent');
 fireEvent.change(screen.getByLabelText('Color part'),{target:{value:'text'}});fireEvent.click(screen.getByRole('button',{name:'Primary',exact:true}));expect(screen.getByLabelText('Shared color role')).toHaveValue('text-on-accent');
 fireEvent.change(screen.getByLabelText('HEX color'),{target:{value:'#121212'}});fireEvent.click(screen.getByRole('button',{name:'Save Theme'}));
 await waitFor(()=>expect(saved?.name).toBe('Disposable'));expect(saved.palettes.dark['text-on-accent']).toBe('#121212');expect(saved.palettes.light).toEqual(presets.themes[0].palettes.light);expect(saved.assignments).toBeUndefined();expect(mock.history.patch).toHaveLength(0);
});
test('companion suggestion remains a draft until accepted',async()=>{
 render(<MemoryRouter><ThemeEditor headers={headers}/></MemoryRouter>);await screen.findByLabelText('Theme name');fireEvent.click(screen.getByRole('button',{name:'Suggest Light Palette'}));expect(screen.getByRole('button',{name:'Dark palette'})).toHaveAttribute('aria-pressed','true');fireEvent.click(screen.getByRole('button',{name:'Accept Suggestion'}));expect(screen.getByRole('button',{name:'Light palette'})).toHaveAttribute('aria-pressed','true');expect(mock.history.post).toHaveLength(0);
});
test('profile stages assignments and Apply to all saves only on request',async()=>{
 let payload;mock.onPatch('/api/appearance').reply(config=>{payload=JSON.parse(config.data);return [200,{...presets,revision:1,assignments:payload.assignments}];});
 render(<MemoryRouter><AppearanceSettings headers={headers}/></MemoryRouter>);await screen.findByLabelText('Kachhapa theme');fireEvent.change(screen.getByLabelText('Kachhapa theme'),{target:{value:'settlement'}});fireEvent.click(screen.getAllByRole('button',{name:'Use for all'})[0]);expect(mock.history.patch).toHaveLength(0);fireEvent.click(screen.getByRole('button',{name:'Save Assignments'}));await screen.findByText('Theme assignments saved.');expect(Object.values(payload.assignments)).toEqual(['settlement','settlement','settlement','settlement']);
});
