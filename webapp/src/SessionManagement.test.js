import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import SessionManagement from './SessionManagement';
import useSessionManagement from './useSessionManagement';

const mock = new MockAdapter(axios);
const headers = { campaignID: 5, Authorization: 'Bearer test' };
const base = '/api/campaigns/5/sessions';
const makeSnapshot = () => ({ revision:0, now:0, calendar:null, roster:[{id:1,name:'Magic Ian'}], locations:[], document:{sessions:[],groups:[{id:'party',name:'Party',members:['1'],location:{label:'Inn'}}],templates:[],encounters:[],journeys:[],events:[],pending:[],remainder:0,activity:[]} });
function Harness({ socket }) { const api=useSessionManagement(headers,socket); return <MemoryRouter><SessionManagement api={api} headers={headers} /></MemoryRouter>; }
beforeEach(() => { mock.reset(); mock.onGet('/api/campaigns/5/quick-notes').reply(200,{notes:[]}); });

test('creates a prepared session without prompting initiative or advancing the clock',async () => {
  const snap=makeSnapshot();
  mock.onGet(base).reply(200,snap);
  mock.onPost(`${base}/commands`).reply(config => { const p=JSON.parse(config.data); return [200,{...snap,revision:1,document:{...snap.document,sessions:[{id:'s1',title:p.data.title,status:'prepared',roster:{'1':{attendance:'unconfirmed',participation:'inactive'}},references:[],staged:[],prep:'',notes:'',recap:''}]}}]; });
  render(<Harness />);
  await screen.findByText(/Please create a new Session before running the Session/);
  fireEvent.click(screen.getByRole('button',{name:'Create Session'}));
  // Native label inside modal is inspected by name through its input.
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'An evening in Waterdeep'}});
  fireEvent.click(screen.getByRole('button',{name:'Confirm'}));
  await screen.findByRole('button',{name:'Start Session'});
  const sent=JSON.parse(mock.history.post[0].data);
  expect(sent.action).toBe('create_session');
  expect(sent.revision).toBe(0);
  expect(sent.request_id).toBeTruthy();
  expect(mock.history.post).toHaveLength(1);
  expect(screen.getByLabelText('Attendance for Magic Ian')).toHaveValue('unconfirmed');
});

test('conflicting tabs reload state and retain the conflict explanation', async () => {
  const snap=makeSnapshot(); mock.onGet(base).reply(200,snap);
  mock.onPost(`${base}/commands`).reply(409,{...snap,revision:2,message:'Changed in another tab'});
  render(<Harness />); await screen.findByText(/Please create a new Session before running the Session/);
  fireEvent.click(screen.getByRole('button',{name:'Create Session'}));
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Test'}});
  fireEvent.click(screen.getByRole('button',{name:'Confirm'}));
  await waitFor(() => expect(screen.getAllByText('Changed in another tab').length).toBeGreaterThan(0));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('reconnect reloads persisted state and cleans up socket listeners',async () => {
  const handlers={}; const socket={on:jest.fn((name,fn)=>{handlers[name]=fn;}),off:jest.fn()};
  mock.onGet(base).reply(200,makeSnapshot());
  const view=render(<Harness socket={socket} />);
  await screen.findByText(/Please create a new Session before running the Session/);
  await act(async () => { await handlers.connect(); });
  expect(mock.history.get.filter(r=>r.url===base)).toHaveLength(2);
  view.unmount(); expect(socket.off).toHaveBeenCalledWith('connect',expect.any(Function));
});

test('each unavailable session tab explains why it is empty', async () => {
  mock.onGet(base).reply(200,makeSnapshot());
  render(<Harness />);
  await screen.findByText(/before running the Session/);
  fireEvent.click(screen.getByRole('button',{name:'Encounters'}));
  expect(screen.getByText(/before adding an Encounter/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Notes'}));
  expect(screen.getByText(/before adding Notes/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Activity'}));
  expect(screen.getByText(/before Activity can appear/)).toBeInTheDocument();
});

test('calculates and starts an authoritative road journey from the session dialog', async () => {
  const snap = makeSnapshot();
  snap.calendar = { current_date:{year:1,month_index:0,day:1,hour:8,minute:0,second:0}, months:[{name:'Hammer'}], events:[] };
  snap.document.sessions = [{id:'s1',title:'Road test',status:'active',roster:{},references:[],staged:[],prep:'',notes:'',recap:''}];
  snap.document.groups[0].location = {kind:'coordinate',label:'South Gate',settlement_id:'town',x:0,y:0};
  mock.onGet(base).reply(200,snap);
  mock.onGet('/api/travel/5/context').reply(200, {
    settlement_id:'town', map_revision:'rev-1', destinations:[{key:'town:structure:inn',label:'The Inn',access_status:'connected'}]
  });
  mock.onPost('/api/travel/5/calculate').reply(200, {
    settlement_id:'town', map_revision:'rev-1', options:[
      {mode:'walking',label:'Walking',available:true,elapsed_minutes:12,distance_miles:0.6},
      {mode:'carriage',label:'Carriage',available:false,unavailable_reason:'Road restriction'}
    ]
  });
  mock.onPost(`${base}/commands`).reply(200, {...snap, revision:1});
  render(<Harness />);
  await screen.findByText('Road test · active');
  fireEvent.click(screen.getByRole('button',{name:'Travel'}));
  await screen.findByRole('option',{name:'The Inn'});
  fireEvent.change(screen.getByLabelText('Journey destination'),{target:{value:'town:structure:inn'}});
  fireEvent.click(screen.getByRole('button',{name:'Calculate Routes'}));
  await screen.findByLabelText('Walking · 12 min · 0.6 mi');
  fireEvent.click(screen.getByRole('button',{name:'Confirm'}));
  await waitFor(() => expect(mock.history.post.some(request => request.url === `${base}/commands`)).toBe(true));
  const request = mock.history.post.find(item => item.url === `${base}/commands`);
  const sent = JSON.parse(request.data);
  expect(sent.action).toBe('journey');
  expect(sent.data.route_request).toEqual({settlement_id:'town',destination_key:'town:structure:inn',mode:'walking',map_revision:'rev-1',party_size:1});
});
