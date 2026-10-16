import React, { createContext, useContext, useEffect, useState } from 'react';
import tokens from './styles/themeTokens.json';
const AppearanceContext=createContext(null);
export function AppearanceProvider({children}) {
  const [revision,setRevision]=useState(0);
  useEffect(()=>{const update=()=>setRevision(v=>v+1);window.addEventListener('appearance-changed',update);return()=>window.removeEventListener('appearance-changed',update);},[]);
  return <AppearanceContext.Provider value={revision}>{children}</AppearanceContext.Provider>;
}
export function useAppearanceColors(mode='dark',target) {
  useContext(AppearanceContext);
  return window.KachhapaAppearance?.colors(target)||tokens[mode==='light'?'light':'dark'];
}
