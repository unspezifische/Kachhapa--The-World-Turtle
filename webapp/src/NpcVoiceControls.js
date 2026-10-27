import React, { useEffect, useState } from 'react';
import { Button, Alert } from 'react-bootstrap';
import axios from 'axios';
import { npcAudio } from './npcAudioManager';

export default function NpcVoiceControls({ npcId, headers, recordings }) {
  const [lines,setLines]=useState(recordings || []), [error,setError]=useState('');
  useEffect(()=>{
    if(recordings){setLines(recordings);return;}
    if(!npcId)return;
    let live=true;
    const load=()=>axios.get(`/api/npc-media/npcs/${npcId}/voices`,{headers}).then(({data})=>{if(live)setLines(data.lines || []);}).catch(()=>{if(live)setError('Voice controls could not load.');});
    load();window.addEventListener('npc-media-changed',load);
    return()=>{live=false;window.removeEventListener('npc-media-changed',load);};
  },[npcId,headers,recordings]);
  const available=lines.filter(line=>line.enabled);
  const quick=available.filter(line=>line.quick_slot!=null).sort((a,b)=>a.quick_slot-b.quick_slot);
  const play=line=>npcAudio.playVoiceLine(line);
  return <div className="npc-voice-controls" aria-label="NPC voice lines">{quick.map(line=><Button key={line.id} size="sm" variant="outline-secondary" onClick={()=>play(line)}>▶ {line.label}</Button>)}
    {!!available.length&&<details><summary>More voice lines</summary>{[...new Set(available.map(line=>line.category))].map(category=><div key={category}><strong>{category}</strong>{available.filter(line=>line.category===category).map(line=><Button key={line.id} size="sm" variant="link" onClick={()=>play(line)}>▶ {line.label}</Button>)}</div>)}</details>}
    {error&&<Alert variant="warning">{error}</Alert>}
  </div>;
}
