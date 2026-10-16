import React, { useLayoutEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import tokens from './styles/themeTokens.json';
import { useAppearanceColors } from './AppearanceContext';
import './styles/coreTheme.css';

export const isCorePath = pathname => !['/settlementManager', '/maps/player', '/worldAtlas'].some(path => pathname === path || pathname.startsWith(`${path}/`));
export function buildCoreMuiTheme(mode, palette) {
  const colors = palette || tokens[mode === 'light' ? 'light' : 'dark'];
  return createTheme({
    zIndex:{modal:2700,tooltip:2800},
    palette: { mode: mode === 'light' ? 'light' : 'dark', primary: { main:colors.accent, contrastText:colors['text-on-accent'] }, secondary:{ main:colors.secondary, contrastText:colors['text-on-secondary'] }, background:{ default:colors['bg-app'], paper:colors['bg-surface'] }, text:{ primary:colors['text-main'], secondary:colors['text-muted'],disabled:colors['text-disabled'] }, action:{disabled:colors['text-disabled'],disabledBackground:colors['disabled-bg'],selected:colors['selected-bg'],hover:colors['bg-surface-2']}, divider:colors['border-main'], error:{main:colors.danger}, warning:{main:colors.warning}, success:{main:colors.success}, info:{main:colors.info} },
    components: { MuiBackdrop:{styleOverrides:{root:{backgroundColor:colors.overlay}}},MuiPaper:{styleOverrides:{root:{backgroundImage:'none'}}},MuiAlert:{styleOverrides:Object.fromEntries(['error','warning','success','info'].map(status=>{const key=status==='error'?'danger':status;return ['standard'+status[0].toUpperCase()+status.slice(1),{backgroundColor:colors[key+'-bg'],color:colors[key],border:`1px solid ${colors[key+'-border']}`}];}))},MuiButton:{ defaultProps:{disableElevation:true},styleOverrides:{root:{'&.Mui-disabled':{backgroundColor:colors['disabled-bg'],color:colors['text-disabled']},'&.Mui-focusVisible':{outline:`2px solid ${colors.focus}`,outlineOffset:2}},...Object.fromEntries(['error','warning','success','info'].map(status=>{const key=status==='error'?'danger':status;return ['contained'+status[0].toUpperCase()+status.slice(1),{backgroundColor:colors[key+'-bg'],color:colors[key],border:`1px solid ${colors[key+'-border']}`}];})),containedPrimary:{border:`1px solid ${colors['primary-border']}`,'&:hover':{backgroundColor:colors['accent-hover']}},containedSecondary:{border:`1px solid ${colors['secondary-border']}`,'&:hover':{backgroundColor:colors['secondary-hover']}}} }, MuiMenuItem:{styleOverrides:{root:{'&.Mui-selected':{backgroundColor:colors['selected-bg'],color:colors['text-selected']}}}},MuiInputBase:{styleOverrides:{root:{'&.Mui-disabled':{backgroundColor:colors['disabled-bg'],color:colors['text-disabled']}},input:{'&.Mui-disabled':{WebkitTextFillColor:colors['text-disabled']}}}}, MuiTableCell:{styleOverrides:{root:{borderColor:colors['border-main']}}}, MuiTooltip:{styleOverrides:{tooltip:{backgroundColor:colors['bg-surface-3'],color:colors['text-main'],border:`1px solid ${colors['border-main']}`}}} },
  });
}
export default function CoreTheme({ mode, children }) {
  const {pathname} = useLocation();
  const core = isCorePath(pathname);
  const colors = useAppearanceColors(mode);
  const theme = useMemo(() => buildCoreMuiTheme(mode, colors), [mode, colors]);
  useLayoutEffect(() => {
    const root=document.documentElement;
    root.setAttribute('data-kachhapa-ui', core ? 'core' : 'settlement');
    if (core) root.setAttribute('data-bs-theme', mode === 'light' ? 'light' : 'dark');
    else root.removeAttribute('data-bs-theme');
    let meta=document.querySelector('meta[name="theme-color"]');
    const created=!meta;
    if (!meta) { meta=document.createElement('meta'); meta.name='theme-color'; document.head.appendChild(meta); }
    const previous=meta.content;
    window.KachhapaAppearance?.apply();
    meta.content=colors['bg-app'];
    return () => { root.removeAttribute('data-kachhapa-ui'); root.removeAttribute('data-bs-theme'); if(created) meta.remove(); else meta.content=previous; };
  }, [core, mode, colors]);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
