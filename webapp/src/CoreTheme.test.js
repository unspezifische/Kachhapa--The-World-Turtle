import React from 'react';
import {render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {useTheme} from '@mui/material/styles';
import CoreTheme,{buildCoreMuiTheme} from './CoreTheme';
import tokens from './styles/themeTokens.json';
function Probe(){ const theme=useTheme(); return <output>{theme.palette.mode}</output>; }
function luminance(hex){ const values=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722; }
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
test.each(['dark','light'])('%s palette maintains readable text, controls and semantic alerts',mode=>{
 const t=tokens[mode];
 for(const surface of ['bg-app','bg-surface','bg-surface-2','bg-surface-3']) for(const text of ['text-main','text-muted','text-subtle','accent-2']) expect(contrast(t[surface],t[text])).toBeGreaterThanOrEqual(4.5);
 for(const status of ['danger','warning','info','success']) expect(contrast(t[status],t[`${status}-bg`])).toBeGreaterThanOrEqual(4.5);
 expect(contrast(t.accent,t['text-on-accent'])).toBeGreaterThanOrEqual(4.5);
 expect(contrast(t.secondary,t['text-on-secondary'])).toBeGreaterThanOrEqual(4.5);
 expect(contrast(t['secondary-hover'],t['text-on-secondary'])).toBeGreaterThanOrEqual(4.5);
 expect(contrast(t['accent-hover'],t['text-on-accent'])).toBeGreaterThanOrEqual(4.5);
 expect(contrast(t.focus,t['bg-surface'])).toBeGreaterThanOrEqual(3);
 expect(buildCoreMuiTheme(mode).palette.text.primary).toBe(t['text-main']);
});
test('core routes theme MUI and body-portalled dialogs; settlement routes release the core scope',()=>{
 const root=document.documentElement;
 const view=render(<MemoryRouter initialEntries={['/dmTools']}><CoreTheme mode="dark"><Probe/></CoreTheme></MemoryRouter>);
 expect(root.dataset.kachhapaUi).toBe('core');expect(root.dataset.bsTheme).toBe('dark');expect(screen.getByText('dark')).toBeInTheDocument();
 view.rerender(<MemoryRouter><CoreTheme mode="light"><Probe/></CoreTheme></MemoryRouter>);
 expect(screen.getByText('light')).toBeInTheDocument();view.unmount();
 for (const path of ['/settlementManager','/maps/player','/worldAtlas']) {
  const map=render(<MemoryRouter initialEntries={[path]}><CoreTheme mode="dark"><Probe/></CoreTheme></MemoryRouter>);
  expect(root.dataset.kachhapaUi).toBe('settlement');expect(root.dataset.bsTheme).toBeUndefined();
  expect(screen.getByText('dark')).toBeInTheDocument();
  map.unmount();
 }
});
