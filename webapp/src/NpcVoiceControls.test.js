import React from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import '@testing-library/jest-dom';
import NpcVoiceControls from './NpcVoiceControls';
import {npcAudio} from './npcAudioManager';
jest.mock('./npcAudioManager',()=>({npcAudio:{playVoiceLine:jest.fn()}}));
test('configurable quick slots and category menu share the playback manager',()=>{
 const recordings=[{id:'v',label:'Greeting',quick_slot:3,enabled:true,category:'Greeting'},{id:'x',label:'Incantation',quick_slot:null,enabled:true,category:'Spellcasting'},{id:'disabled',label:'Hidden',quick_slot:0,enabled:false}];
 render(<NpcVoiceControls recordings={recordings}/>);
 expect(screen.queryByText('▶ Hidden')).not.toBeInTheDocument();
 fireEvent.click(screen.getAllByText('▶ Greeting')[0]);expect(npcAudio.playVoiceLine).toHaveBeenCalledWith(recordings[0]);
 fireEvent.click(screen.getByText('More voice lines'));fireEvent.click(screen.getByText('▶ Incantation'));expect(npcAudio.playVoiceLine).toHaveBeenCalledWith(recordings[1]);
});
