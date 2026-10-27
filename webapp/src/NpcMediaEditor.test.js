import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import axios from 'axios';
import NpcMediaEditor, { VoiceLineForm } from './NpcMediaEditor';
jest.mock('axios');
jest.mock('./NpcMediaImage', () => () => <span>portrait</span>);
const line = {id:'v',label:'Greeting',category:'Greeting',transcript:'Hello',description:'',quick_slot:0,display_order:0,gain:1,enabled:true};
beforeEach(()=>{
  jest.resetAllMocks();
  URL.createObjectURL=jest.fn(()=>'blob:pending');
  URL.revokeObjectURL=jest.fn();
});
test('editor loads recordings and supports multi upload with filename labels', async () => {
  axios.get.mockImplementation(url=>Promise.resolve({data:url.endsWith('/voices')?{lines:[line]}:{}}));
  axios.post.mockResolvedValue({data:{id:'audio'}});
  render(<NpcMediaEditor npc={{id:7,name:'Elion'}} headers={{CampaignID:'1'}} />);
  expect(await screen.findByLabelText('Label for Greeting')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Upload recordings'),{target:{files:[new File(['audio'],'Fireball.wav'),new File(['audio'],'Taunt.mp3')]}});
  await waitFor(()=>expect(axios.post).toHaveBeenCalledWith('/api/npc-media/npcs/7/voices',expect.objectContaining({label:'Taunt',media_asset_id:'audio'}),expect.anything()));
});
test('quick positions and category edits are saved separately from playback', () => {
  const onSave=jest.fn(),onPlay=jest.fn();
  render(<VoiceLineForm line={line} onSave={onSave} onPlay={onPlay} />);
  fireEvent.change(screen.getByLabelText('Quick slot (blank for More only)'),{target:{value:'4'}});
  fireEvent.click(screen.getByText('Save recording'));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({quick_slot:3}));
  expect(onPlay).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('▶ Play Greeting'));expect(onPlay).toHaveBeenCalledTimes(1);
});
test('frames a selected image before uploading and attaching it', async () => {
  axios.get.mockImplementation(url=>Promise.resolve({data:url.endsWith('/voices')?{lines:[]}:{}}));
  axios.post.mockImplementation(url=>Promise.resolve({data:{id:url==='/api/npc-media/assets'?'original':'framed'}}));
  axios.patch.mockResolvedValue({data:{}});
  render(<NpcMediaEditor npc={{id:7,name:'Elion'}} headers={{CampaignID:'1'}} />);
  await screen.findByText('No voice recordings yet.');
  fireEvent.change(screen.getByLabelText('Upload portrait'),{target:{files:[new File(['image'],'elion.png',{type:'image/png'})]}});
  expect(screen.getByLabelText('Frame portrait before upload')).toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Zoom in'}));
  fireEvent.click(screen.getByLabelText('Decorative border'));
  fireEvent.click(screen.getByRole('button',{name:'Use framing & upload'}));
  await waitFor(()=>expect(axios.patch).toHaveBeenCalledWith('/api/npc-media/npcs/7',{portrait:'framed'},{headers:{CampaignID:'1'}}));
  expect(axios.post).toHaveBeenCalledWith('/api/npc-media/assets/original/crop',expect.objectContaining({zoom:1.25,border:'#ffffff'}),{headers:{CampaignID:'1'}});
});
