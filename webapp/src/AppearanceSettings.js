import React, {useEffect,useState,useRef} from 'react';
import {Link} from 'react-router-dom';
import axios from 'axios';
import './ThemeEditor.css';
export const TARGET_LABELS={kachhapa:'Kachhapa',wiki:'Wikis',settlement:'Settlement Simulator',mtg:'MTG Sandbox'};
export function useAppearance(headers) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const refresh=async()=>{try{const r=await axios.get('/api/appearance',{headers:{...headers,'X-Appearance-Mode':window.KachhapaAppearance?.mode()||localStorage.getItem('theme')||'dark'}});setData(r.data);window.KachhapaAppearance?.accept(r.data);}catch(e){setError(e.response?.data?.message||'Appearance could not be loaded.');}};
  useEffect(()=>{refresh();const updated=()=>setData(window.KachhapaAppearance?.snapshot()||null);window.addEventListener('appearance-changed',updated);return()=>window.removeEventListener('appearance-changed',updated);},[headers?.Authorization]); // Account changes, not campaign changes.
  const mutate=async(method,url,body)=>{setError('');setBusy(true);try{const r=await axios({method,url,headers:{...headers,'X-Appearance-Mode':window.KachhapaAppearance?.mode()||localStorage.getItem('theme')||'dark'},data:{...body,revision:data.revision}});setData(r.data);window.KachhapaAppearance?.accept(r.data);return r.data;}catch(e){if(e.response?.status===409){setData(e.response.data);window.KachhapaAppearance?.accept(e.response.data);}setError(e.response?.data?.message||'Your change could not be saved. Your draft is still here.');return null;}finally{setBusy(false);}};
  return {data,error,busy,refresh,mutate};
}
export default function AppearanceSettings({headers}) {
  const api=useAppearance(headers),[assignments,setAssignments]=useState(null),[notice,setNotice]=useState('');
  const assignmentVersion=useRef('');
  useEffect(()=>{if(api.data){const key=JSON.stringify(api.data.assignments);if(assignmentVersion.current!==key){assignmentVersion.current=key;setAssignments(api.data.assignments);}}},[api.data]);
  if(!api.data)return <section className="user-profile-card appearance-settings"><h2>Appearance &amp; Themes</h2><p>{api.error||'Loading your themes…'}</p><button onClick={api.refresh}>Retry</button></section>;
  const data=api.data;
  return <section className="user-profile-card appearance-settings"><div className="appearance-heading"><div><span className="dashboard-eyebrow">Make it your own</span><h2>Appearance &amp; Themes</h2><p>Choose independently, or use one theme everywhere. Each theme includes Dark and Light colors.</p></div><Link className="dashboard-button dashboard-button-primary" to="/themes/new">Create Theme</Link></div>
    {window.KachhapaAppearance?.recovery&&<p role="status">Recovery view uses the built-in palette temporarily. Save any assignment changes, then <a href="/profile">exit recovery view</a> to use your saved appearance.</p>}
    {api.error&&<p role="alert">{api.error}</p>}{notice&&<p role="status">{notice}</p>}
    {Object.entries(TARGET_LABELS).map(([key,label])=>{const id=(assignments||data.assignments)[key],theme=data.themes.find(t=>t.id===id)||data.themes[0],p=theme.palettes[data.mode];return <div className="appearance-row" key={key}><label>{label}<select aria-label={`${label} theme`} value={id} onChange={e=>{setNotice('');setAssignments({...assignments,[key]:e.target.value});}}>{data.themes.map(t=><option value={t.id} key={t.id}>{t.name}{t.builtin?' · Built-in':''}</option>)}</select></label><div className="theme-mini" aria-label={`${theme.name} preview`} style={{background:p['bg-surface'],color:p['text-main'],borderColor:p['border-main']}}><span>Text</span><b style={{background:p.accent,color:p['text-on-accent']}}>Primary</b><b style={{background:p.secondary,color:p['text-on-secondary']}}>Secondary</b></div><button type="button" className="dashboard-button dashboard-button-outline" onClick={()=>setAssignments(Object.fromEntries(Object.keys(TARGET_LABELS).map(k=>[k,id])))}>Use for all</button></div>;})}
    <div className="appearance-actions"><button className="dashboard-button dashboard-button-primary" disabled={api.busy} onClick={async()=>{if(await api.mutate('patch','/api/appearance',{assignments}))setNotice('Theme assignments saved.');}}>Save Assignments</button><button className="dashboard-button dashboard-button-outline" onClick={()=>setAssignments({kachhapa:'kachhapa',wiki:'kachhapa',settlement:'settlement',mtg:'kachhapa'})}>Restore Default Assignments</button><button className="dashboard-button dashboard-button-outline" disabled={api.busy} onClick={()=>api.mutate('patch','/api/appearance',{mode:data.mode==='dark'?'light':'dark'})}>Switch to {data.mode==='dark'?'Light':'Dark'} Mode</button></div>
    <h3>Your theme library</h3><div className="appearance-actions">{data.themes.map(t=><Link className="dashboard-button dashboard-button-outline" key={t.id} to={`/themes/${t.builtin?'new?from='+t.id:t.id}`}>{t.builtin?'Customize':'Edit'} {t.name}</Link>)}</div><p><small>Need a readable view? <a href="/profile?theme=default">Open appearance recovery</a>.</small></p>
  </section>;
}
