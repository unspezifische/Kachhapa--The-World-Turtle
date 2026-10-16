import React,{useState} from 'react';
import {render,screen,fireEvent,act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {AppearanceProvider} from './AppearanceContext';
import CoreTheme from './CoreTheme';
import tokens from './styles/themeTokens.json';
function WorkingForm(){const [value,setValue]=useState('');return <input aria-label="Unsaved form" value={value} onChange={e=>setValue(e.target.value)}/>;}
test('incoming palettes update the provider without remounting working content',()=>{
 let colors=tokens.dark;window.KachhapaAppearance={colors:()=>colors,apply:()=>{}};
 const view=render(<MemoryRouter><AppearanceProvider><CoreTheme mode="dark"><WorkingForm/></CoreTheme></AppearanceProvider></MemoryRouter>);
 const input=screen.getByLabelText('Unsaved form');fireEvent.change(input,{target:{value:'Keep this draft'}});colors={...tokens.dark,accent:'#123456'};act(()=>window.dispatchEvent(new CustomEvent('appearance-changed')));expect(screen.getByLabelText('Unsaved form')).toBe(input);expect(input).toHaveValue('Keep this draft');view.unmount();delete window.KachhapaAppearance;
});
