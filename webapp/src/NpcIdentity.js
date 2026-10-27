import React, { useEffect, useState } from 'react';
import axios from 'axios';
import NpcMediaImage from './NpcMediaImage';
import NpcVoiceControls from './NpcVoiceControls';

export default function NpcIdentity({ npcId, name, headers, portrait = false, voices = true }) {
  const [media,setMedia]=useState(null);
  useEffect(()=>{if(!npcId)return;let live=true;const load=()=>axios.get(`/api/npc-media/npcs/${npcId}`,{headers}).then(({data})=>{if(live)setMedia(data);}).catch(()=>{if(live)setMedia(null);});load();window.addEventListener('npc-media-changed',load);return()=>{live=false;window.removeEventListener('npc-media-changed',load);};},[npcId,headers]);
  return <div className="npc-identity"><NpcMediaImage asset={media?.[portrait?'portrait':'token']} headers={headers} size={portrait?512:128} alt={`${name || 'NPC'} ${portrait?'portrait':'token'}`} style={{width:portrait?200:48,height:portrait?'auto':48,objectFit:'contain'}} />{voices&&<NpcVoiceControls npcId={npcId} headers={headers} />}</div>;
}
