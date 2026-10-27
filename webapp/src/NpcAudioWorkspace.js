import axios from 'axios';
import { NpcVoiceEventAdapter } from './npcVoiceEventAdapter';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { useLocation } from 'react-router-dom';
import { npcAudio } from './npcAudioManager';

// Origin-local lease: player views never acquire it. A second DM tab may take control explicitly.
const tabId = `${Date.now()}-${Math.random()}`;
export function readVoiceLease(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
export default function NpcAudioWorkspace({ headers, enabled, socket }) {
  const location = useLocation();
  const campaignId = headers?.campaignID || headers?.CampaignID;
  const eligible = enabled && !location.pathname.startsWith('/maps/player');
  const [owner,setOwner] = useState(false), [status,setStatus] = useState(npcAudio.status);
  const [automatic,setAutomatic]=useState(false), [settingsError,setSettingsError]=useState('');
  const adapterRef=useRef(null);
  const [volume,setVolume] = useState(1), [muted,setMuted] = useState(false);
  const leaseKey = `kachhapa-voice-owner:${campaignId}`;
  const claim = () => {
    try { localStorage.setItem(leaseKey, JSON.stringify({ tabId, expires: Date.now()+12000 })); } catch { return; }
    setOwner(true); npcAudio.setOwner(true);
  };
  useEffect(() => npcAudio.subscribe(setStatus), []);
  useEffect(() => { npcAudio.configure(headers,campaignId); }, [headers,campaignId]);
  useEffect(() => {
    if (!eligible || !campaignId) { npcAudio.setOwner(false);setOwner(false);return; }
    const check = () => {
      const lease=readVoiceLease(leaseKey);
      if (!lease || lease.expires < Date.now() || lease.tabId===tabId) {
        try { localStorage.setItem(leaseKey,JSON.stringify({tabId,expires:Date.now()+12000})); } catch { npcAudio.setOwner(false);return; }
        npcAudio.setOwner(true);setOwner(true);
      } else { npcAudio.setOwner(false);setOwner(false); }
    };
    check();const timer=setInterval(check,3000);window.addEventListener('storage',check);
    return () => { clearInterval(timer);window.removeEventListener('storage',check);if(readVoiceLease(leaseKey)?.tabId===tabId)localStorage.removeItem(leaseKey);npcAudio.setOwner(false); };
  }, [eligible,campaignId,leaseKey]);
  useEffect(() => {
    if(!eligible || !campaignId)return;
    let live=true;
    const adapter=new NpcVoiceEventAdapter({campaignId,audio:npcAudio,storage:window.localStorage,
      loadLines:async npcId=>(await axios.get(`/api/npc-media/npcs/${npcId}/rules`,{headers})).data.lines});
    adapterRef.current=adapter;setAutomatic(false);
    const refresh=()=>axios.get('/api/npc-media/settings',{headers}).then(({data})=>{if(live){setAutomatic(Boolean(data.automatic_enabled));adapter.setEnabled(Boolean(data.automatic_enabled));}}).catch(()=>{if(live){adapter.setEnabled(false);setSettingsError('Automatic voice settings could not load. Manual playback remains available.');}});
    const receive=event=>adapter.receive(event);
    const settingsChanged=event=>{if(String(event.campaignId)===String(campaignId)){setAutomatic(event.automatic_enabled);adapter.setEnabled(event.automatic_enabled);}};
    refresh();socket?.on('npc_gameplay_event',receive);socket?.on('npc_voice_settings_changed',settingsChanged);socket?.on('connect',refresh);
    return()=>{live=false;adapter.dispose();socket?.off('npc_gameplay_event',receive);socket?.off('npc_voice_settings_changed',settingsChanged);socket?.off('connect',refresh);};
  }, [eligible,campaignId,headers,socket]);
  if (!eligible) return null;
  return <aside className="npc-audio-controls" aria-label="NPC voice playback"><strong>NPC Voice</strong><Form.Check id="npc-automatic-voices" inline label="Automatic voices" checked={automatic} onChange={async event=>{const value=event.target.checked;try{await axios.patch('/api/npc-media/settings',{automatic_enabled:value},{headers});setAutomatic(value);adapterRef.current?.setEnabled(value);setSettingsError('');}catch{setSettingsError('Could not update automatic voice settings.');}}} />{settingsError&&<Alert variant="warning">{settingsError}</Alert>}{!owner?<Button size="sm" onClick={claim}>Play voices in this window</Button>:<>
    <Form.Label>Voice volume<Form.Range aria-label="NPC voice volume" min="0" max="1" step="0.05" value={volume} onChange={event=>{const value=Number(event.target.value);setVolume(value);npcAudio.setVolume(value);}} /></Form.Label>
    <Form.Check id="npc-mute-voices" inline label="Mute voices" checked={muted} onChange={event=>{setMuted(event.target.checked);npcAudio.setMuted(event.target.checked);}} />
    <Button size="sm" variant="outline-secondary" onClick={()=>npcAudio.stopVoice()}>Stop voice</Button><span role="status">{status.playing?status.label:''}</span>
  </>}{status.error&&<Alert variant="warning" dismissible onClose={()=>npcAudio.update({error:''})}>{status.error}</Alert>}</aside>;
}
