import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import '@testing-library/jest-dom';
import axios from 'axios';
import Chat from './Chat';
jest.mock('axios');
jest.mock('./NpcMediaImage',()=>({asset,alt})=><img src={asset?.url} alt={alt}/>);
const headers={userID:1,CampaignID:'1'},socket={emit:jest.fn()};
beforeEach(()=>{Element.prototype.scrollIntoView=jest.fn();jest.clearAllMocks();axios.get.mockImplementation(url=>Promise.resolve({data:url==='/api/npcs'?[{id:7,name:'Elion'}]:[]}));});
test('DM composer uses canonical NPC reference and real author; sent NPC message uses its token',async()=>{
 const message={sender:1,sender_npc_id:7,sender_character_name:'Elion',sender_avatar:{mode:'image',authorized_npc:true,image_url:'/api/npc-media/messages/4/avatar'},text:'Greetings',type:'text_message',recipients:[2],group_id:'1-2'};
 const {container}=render(<Chat headers={headers} socket={socket} isDm characterName="Ian" username="dm" campaignID={1} users={[{userID:2,username:'Player',character_name:'Sangha'}]} messages={[message]} setMessages={jest.fn()} requestActiveUsers={jest.fn()}/>);
 expect(await screen.findByRole('option',{name:'Elion'})).toBeInTheDocument();
 expect(container.querySelector('img[src="/api/npc-media/messages/4/avatar"]')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Speak as'),{target:{value:'7'}});
 expect(screen.getByLabelText('Speak as').value).toBe('7');
 fireEvent.click(screen.getByText('Sangha'));fireEvent.change(screen.getByRole('textbox'),{target:{value:'Hello'}});fireEvent.submit(container.querySelector('form'));
 expect(socket.emit).toHaveBeenCalledWith('sendMessage',expect.objectContaining({sender:1,sender_npc_id:7,text:'Hello',recipients:[2]}),expect.any(Function));
});
test('player composer does not enumerate NPCs',()=>{
 render(<Chat headers={headers} socket={socket} characterName="Sangha" username="player" campaignID={1} users={[]} messages={[]} setMessages={jest.fn()} requestActiveUsers={jest.fn()}/>);
 expect(screen.queryByLabelText('Speak as')).not.toBeInTheDocument();
 expect(axios.get).not.toHaveBeenCalledWith('/api/npcs',expect.anything());
});
