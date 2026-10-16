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
  await screen.findByText('Prepare your first session');
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
  render(<Harness />); await screen.findByText('Prepare your first session');
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
  await screen.findByText('Prepare your first session');
  await act(async () => { await handlers.connect(); });
  expect(mock.history.get.filter(r=>r.url===base)).toHaveLength(2);
  view.unmount(); expect(socket.off).toHaveBeenCalledWith('connect',expect.any(Function));
});
