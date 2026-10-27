import React from 'react';
import {render,screen,fireEvent,waitFor,act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import '@testing-library/jest-dom';
import axios from 'axios';
import NpcAudioWorkspace from './NpcAudioWorkspace';
import {npcAudio} from './npcAudioManager';
jest.mock('axios');
const headers={CampaignID:'1'},socket={on:jest.fn(),off:jest.fn()};
beforeEach(()=>{localStorage.clear();jest.clearAllMocks();axios.get.mockResolvedValue({data:{automatic_enabled:false}});axios.patch.mockResolvedValue({data:{automatic_enabled:true}});});
function view(path='/dmTools'){return render(<MemoryRouter initialEntries={[path]}><NpcAudioWorkspace headers={headers} enabled socket={socket}/></MemoryRouter>);}
test('player view never owns playback or subscribes to voice gameplay events',()=>{
 view('/maps/player');expect(npcAudio.owner).toBe(false);expect(socket.on).not.toHaveBeenCalled();expect(screen.queryByLabelText('NPC voice playback')).not.toBeInTheDocument();
});
test('campaign auto voices default off; only controlling DM window plays; stop and mute remain local',async()=>{
 view();await waitFor(()=>expect(axios.get).toHaveBeenCalledWith('/api/npc-media/settings',{headers}));
 expect(screen.getByLabelText('Automatic voices')).not.toBeChecked();expect(npcAudio.owner).toBe(true);
 fireEvent.click(screen.getByLabelText('Automatic voices'));
 await waitFor(()=>expect(axios.patch).toHaveBeenCalledWith('/api/npc-media/settings',{automatic_enabled:true},{headers}));
 fireEvent.click(screen.getByLabelText('Mute voices'));expect(npcAudio.muted).toBe(true);fireEvent.click(screen.getByLabelText('Mute voices'));expect(npcAudio.muted).toBe(false);
 act(()=>{localStorage.setItem('kachhapa-voice-owner:1',JSON.stringify({tabId:'other-window',expires:Date.now()+12000}));window.dispatchEvent(new StorageEvent('storage',{key:'kachhapa-voice-owner:1'}));});
 expect(npcAudio.owner).toBe(false);expect(screen.getByText('Play voices in this window')).toBeInTheDocument();
 fireEvent.click(screen.getByText('Play voices in this window'));expect(npcAudio.owner).toBe(true);
 fireEvent.click(screen.getByText('Stop voice'));expect(npcAudio.status.playing).toBe(false);
});
