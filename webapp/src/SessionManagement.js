import NpcIdentity from './NpcIdentity';
import React, { useEffect, useState, useId } from 'react';
import { Alert, Button, Form, Modal, Table } from 'react-bootstrap';
import axios from 'axios';
import './SessionManagement.css';

const duration = seconds => `${Math.floor(Math.max(0, seconds) / 60)}m ${Math.max(0, seconds) % 60}s`;
const Field = ({ label, children }) => { const id = useId(); return <Form.Group controlId={id} className="session-field"><Form.Label>{label}</Form.Label>{children}</Form.Group>; };
const text = (name, initial = '') => ({ name, defaultValue: initial });
const values = event => Object.fromEntries(new FormData(event.currentTarget));
const dateText = calendar => {
  const d = calendar?.current_date;
  return d ? `${d.month_name || `Month ${d.month_index + 1}`} ${d.day}, ${d.year} · ${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')}:${String(d.second || 0).padStart(2, '0')}` : 'Calendar not configured';
};

export default function SessionManagement({ api, headers, initialTab = 'Run Session' }) {
  const { snapshot, command, busy, error, retry, refresh } = api;
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState(initialTab);
  const [dialog, setDialog] = useState(null);
  const [notes, setNotes] = useState([]);
  const [sourceError, setSourceError] = useState('');
  const [routeContext, setRouteContext] = useState(null);
  const [routePlan, setRoutePlan] = useState(null);
  const [routeDestination, setRouteDestination] = useState('');
  const [routeMode, setRouteMode] = useState('walking');
  const [routeSearch, setRouteSearch] = useState('');
  useEffect(() => setTab(initialTab), [initialTab]);
  useEffect(() => {
    let live = true;
    const campaignId = headers?.campaignID || headers?.CampaignID;
    if (!campaignId) return;
    axios.get(`/api/campaigns/${campaignId}/quick-notes`, { headers }).then(r => { if (live) setNotes(r.data.notes || []); }).catch(() => { if (live) setSourceError('Private campaign notes could not be loaded.'); });
    return () => { live = false; };
  }, [headers]);
  if (!snapshot) return <section className="session-manager"><h2>Session Management</h2>{error ? <Alert variant="danger">{error} <Button onClick={refresh}>Retry loading</Button></Alert> : <p role="status">Loading saved sessions…</p>}</section>;
  const { document: doc, roster, now, calendar, locations = [] } = snapshot;
  const current = doc.sessions.find(s => s.id === selected) || doc.sessions.find(s => ['active', 'paused'].includes(s.status)) || [...doc.sessions].reverse().find(s => s.status === 'prepared') || doc.sessions.at(-1);
  const isLive = current?.status === 'active';
  const send = async (action, data) => {
    const ok = await command(action, data);
    if (ok) setDialog(null);
    return ok;
  };
  const sessionData = data => ({ session_id: current?.id, ...data });
  const open = (kind, value = {}) => setDialog({ kind, ...value });
  const openJourney = async group => {
    setRouteContext(null); setRoutePlan(null); setRouteDestination(''); setRouteMode('walking'); setRouteSearch('');
    open('journey', { group });
    const campaignId = headers?.campaignID || headers?.CampaignID;
    try {
      const response = await axios.get(`/api/travel/${campaignId}/context`, { headers,
        params: group.location?.settlement_id ? { settlement_id: group.location.settlement_id } : {} });
      setRouteContext(response.data);
    } catch { setSourceError('Settlement destinations could not be loaded. Manual travel is still available.'); }
  };
  const calculateJourney = async () => {
    const campaignId = headers?.campaignID || headers?.CampaignID;
    setSourceError('');
    try {
      const response = await axios.post(`/api/travel/${campaignId}/calculate`, {
        settlement_id: routeContext?.settlement_id, group_id: dialog.group.id,
        destination_key: routeDestination, party_size: Math.max(1, dialog.group.members.length)
      }, { headers });
      setRoutePlan(response.data);
      const first = response.data.options?.find(option => option.available);
      if (first) setRouteMode(first.mode);
    } catch (requestError) {
      setRoutePlan(null);
      setSourceError(requestError.response?.data?.message || 'No connected road route could be calculated. Manual travel is still available.');
    }
  };
  const locationFromForm = form => locations.find(l => l.key === form.location_key) || { kind: 'manual', label: form.location || 'Not set' };
  const locationFields = initial => <>
    <Field label="Mapped location"><Form.Select name="location_key" defaultValue={initial?.key || ''}><option value="">Narrative / unmapped location</option>{locations.map(l => <option value={l.key} key={l.key}>{l.label}</option>)}</Form.Select></Field>
    <Field label="Location description"><Form.Control {...text('location', initial?.label || '')} placeholder="E.g. Upstairs at the inn" /></Field>
  </>;
  const activeEncounter = doc.encounters.find(e => e.status === 'running');
  const encounterCard = e => <article className="session-card" key={e.id}>
    <div className="session-card-heading"><h3>{e.name}</h3><span className="session-status">{e.status} · Round {e.round}</span></div>
    <p className="session-written">{e.notes}</p>
    <div className="session-table"><Table size="sm"><thead><tr><th>Participant</th><th>Side</th><th>Initiative</th><th>HP / AC</th></tr></thead><tbody>{e.combatants.map((c, i) => <tr key={c.id} className={e.started && e.turn === i ? 'table-active' : ''}><td>{e.started && e.turn === i ? '▶ ' : ''}{c.name}{c.source === 'npcs' && <NpcIdentity npcId={c.source_id} name={c.name} headers={headers} />}</td><td>{c.disposition || (c.kind === 'player' ? 'Party' : 'Hostile')}</td><td>{e.started ? c.initiative : <Form onSubmit={async event => { event.preventDefault(); await command('initiative', { id: e.id, combatant_id: c.id, initiative: values(event).initiative }); }} className="session-inline"><Form.Control size="sm" type="number" name="initiative" aria-label={`Initiative for ${c.name}`} defaultValue={c.initiative ?? ''} required /><Button size="sm" type="submit" disabled={busy}>Set</Button>{c.kind === 'npc' && <Button size="sm" type="button" variant="secondary" disabled={busy} onClick={() => command('roll_npc_initiative', {id:e.id,combatant_id:c.id})}>Roll</Button>}</Form>}</td><td>{c.hp ?? '—'} / {c.ac ?? '—'}</td></tr>)}</tbody></Table></div>
    <div className="session-actions">{e.status === 'running' ? <>{!e.started && <Button variant="outline-secondary" disabled={busy} onClick={() => command('roll_all_npc_initiative', {id:e.id})}>Auto-roll all creatures</Button>}<Button disabled={busy || !isLive || doc.pending.length > 0 || doc.remainder > 0} onClick={() => command(e.started ? 'next_turn' : 'begin_encounter', { id: e.id })}>{e.started ? 'Next Turn' : 'Begin Encounter'}</Button><Button variant="secondary" disabled={busy} onClick={() => command('encounter_status', { id: e.id, status: 'suspended' })}>Suspend</Button></> : <Button disabled={busy || !isLive || !!activeEncounter} onClick={() => command('encounter_status', { id: e.id, status: 'running' })}>Resume Encounter</Button>}<Button variant="outline-danger" disabled={busy} onClick={() => open('resolve', { encounter: e })}>Resolve Encounter</Button></div>
  </article>;
  return <section className="session-manager" aria-label="Session Management">
    <header className="session-command-bar">
      <div><span className="session-eyebrow">AT THE TABLE</span><h2>Session Management</h2><strong className="session-clock">{dateText(calendar)}</strong></div>
      <div className="session-actions"><Button disabled={busy || !isLive || !calendar} onClick={() => open('advance')}>Advance Time</Button><Button variant="secondary" disabled={busy || !isLive || !calendar} onClick={() => command('next_event')}>Next Event</Button><Button variant="outline-secondary" disabled={busy || !isLive || !calendar} onClick={() => open('date')}>Set Date &amp; Time</Button></div>
    </header>
    {error && <Alert variant="danger" role="alert">{error} {retry && <Button disabled={busy} onClick={retry}>Retry action safely</Button>}</Alert>}
    {!calendar && <Alert variant="info">Configure the campaign calendar to use timed journeys and clock controls. Session preparation, notes and roster management are available now. <a href="/calendar">Open Calendar</a></Alert>}
    {doc.pending.length > 0 && <Alert variant="warning"><strong>Time stopped for your attention</strong><ul>{doc.pending.map(p => <li key={p.id}>{p.kind === 'arrival' ? 'Arrived: ' : 'Event: '}{p.label}</li>)}</ul><Button disabled={busy} onClick={() => command('acknowledge', { ids: doc.pending.map(p => p.id) })}>Acknowledge and stay here</Button></Alert>}
    {doc.remainder > 0 && <Alert variant="info">{doc.remainder} seconds remain from the completed combat round. <Button disabled={busy || doc.pending.length > 0 || !isLive} onClick={() => command('continue_time')}>Continue Round Clock</Button></Alert>}
    <div className="session-selector"><Field label="Session"><Form.Select aria-label="Selected session" value={current?.id || ''} onChange={event => setSelected(event.target.value)}>{!current && <option value="">No sessions prepared</option>}{[...doc.sessions].reverse().map(s => <option key={s.id} value={s.id}>{s.title} · {s.status}</option>)}</Form.Select></Field><Button disabled={busy} onClick={() => open('create')}>Create Session</Button>
      {current && <><span className="session-status">{current.status}</span>{['prepared', 'paused'].includes(current.status) && <Button disabled={busy} onClick={() => open('start')}>{current.status === 'paused' ? 'Resume Session' : 'Start Session'}</Button>}{isLive && <Button variant="secondary" disabled={busy} onClick={() => command('lifecycle', sessionData({ status: 'paused' }))}>Pause Session</Button>}{['active', 'paused'].includes(current.status) && <Button variant="outline-danger" disabled={busy} onClick={() => open('end')}>End Session</Button>}</>}
    </div>
    <div className="session-layout">
      <aside><details className="session-party" open><summary>Party &amp; Groups</summary>
        <p className="session-muted">Attendance is confirmed by the DM, independently of who is online.</p>
        {current && roster.map(c => { const state = current.roster[String(c.id)] || { attendance: 'unconfirmed', participation: 'inactive' }; return <div className="session-roster-person" key={c.id}><strong>{c.name}</strong><Form.Select size="sm" disabled={busy || current.status === 'ended'} aria-label={`Attendance for ${c.name}`} value={state.attendance} onChange={event => command('roster', sessionData({ character_id: c.id, ...state, attendance: event.target.value }))}>{['unconfirmed', 'present', 'absent'].map(v => <option key={v} value={v}>{v}</option>)}</Form.Select><Form.Select size="sm" disabled={busy || current.status === 'ended'} aria-label={`Participation for ${c.name}`} value={state.participation} onChange={event => command('roster', sessionData({ character_id: c.id, ...state, participation: event.target.value }))}>{[['inactive', 'Inactive'], ['player', 'Player controlled'], ['dm', 'DM controlled'], ['accompanying', 'Accompanying']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</Form.Select></div>; })}
        {!roster.length && <p>No player characters assigned to this campaign yet.</p>}
        <div className="session-card-heading"><h3>Groups</h3><Button size="sm" onClick={() => open('group')} disabled={busy}>New / Split Group</Button></div>
        {doc.groups.map(g => { const j = doc.journeys.find(j => j.group_id === g.id && j.status === 'travelling'); return <article className="session-group" key={g.id}><strong>{g.name}</strong><p>{g.members.map(id => roster.find(c => String(c.id) === id)?.name || 'Former character').join(', ') || 'No members'}</p><p>{j ? `${j.origin.label} → ${j.destination.label} · ${duration(j.arrival-now)} remaining${j.route_snapshot ? ` · ${Math.round((j.progress || 0) * 100)}%` : ''}` : g.location.label}</p><div className="session-actions"><Button size="sm" variant="outline-secondary" disabled={busy || !!j} onClick={() => open('group', { group: g })}>Members / Location</Button>{j ? <Button size="sm" variant="outline-danger" disabled={busy} onClick={() => open('stop', { journey: j })}>Stop Journey</Button> : <Button size="sm" disabled={busy || !isLive || !calendar || !g.members.length} onClick={() => openJourney(g)}>Travel</Button>}</div></article>; })}
      </details></aside>
      <main><nav className="session-tabs" aria-label="Session sections">{['Run Session', 'Encounters', 'Notes', 'Activity'].map(t => <Button key={t} variant={tab === t ? 'primary' : 'outline-secondary'} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</Button>)}</nav>
        {!current ? <article className="session-card"><h3>Please create a new Session before {tab === 'Notes' ? 'adding Notes' : tab === 'Encounters' ? 'adding an Encounter' : tab === 'Activity' ? 'Activity can appear' : 'running the Session'}.</h3><p>Sessions hold the plan, notes, staged encounters, activity history, and table state together.</p><Button onClick={() => open('create')}>Create a new Session</Button></article> : <>
          {tab === 'Run Session' && <>
            {activeEncounter && encounterCard(activeEncounter)}
            <article className="session-card"><div className="session-card-heading"><h3>On the horizon</h3><Button disabled={busy || !isLive || !calendar} onClick={() => open('event')}>Schedule Event</Button></div>
              {doc.journeys.filter(j => j.status === 'travelling').map(j => <p key={j.id}>{j.name} · {duration(j.arrival-now)} remaining</p>)}
              {doc.events.filter(e => ['scheduled', 'due'].includes(e.status)).map(e => <p key={e.id}>{e.name} · {e.status === 'due' ? 'Due' : `in ${duration(e.at-now)}`} {e.stop ? '· Stops time' : ''} {e.status === 'scheduled' && <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => command('cancel_event', {id:e.id})}>Cancel Event</Button>} {e.status === 'due' && <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => command('acknowledge', {ids:[e.id]})}>Acknowledge</Button>}</p>)}
              {!doc.journeys.some(j => j.status === 'travelling') && !doc.events.some(e => ['scheduled', 'due'].includes(e.status)) && <p>No active journeys or scheduled session events.</p>}
              <h4>Calendar context</h4>{(calendar?.events || []).slice(0, 8).map(e => <p key={e.id}>{e.name} · {calendar?.months[e.month_index]?.name} {e.day}, {e.year}</p>)}
              <p className="session-muted">Calendar entries do not automatically interrupt time.</p>
            </article>
            <article className="session-card"><h3>Session prep</h3><p className="session-written">{current.prep || 'Add preparation and reference material in Notes.'}</p><Button variant="outline-secondary" onClick={() => setTab('Notes')}>Open Notes</Button></article>
          </>}
          {tab === 'Notes' && <SessionNotes key={current.id} current={current} notes={notes} busy={busy} command={command} sourceError={sourceError} drafts={api.drafts} setDrafts={api.setDrafts} onPin={() => open('reference')} />}
          {tab === 'Encounters' && <>
            <article className="session-card"><div className="session-card-heading"><h3>Encounter plan</h3><span className="session-status">{current.staged.length} staged</span></div><p>Choose an encounter built in Encounter Builder, add it to this session plan, then trigger it when combat begins. Staging never rolls initiative.</p>
              {doc.templates.map(t => <div className="session-group" key={t.id}><strong>{t.name}</strong><p>{t.environment ? `${t.environment} · ` : ''}{t.participants.map(p => `${p.quantity} × ${p.name}`).join(', ')}</p><div className="session-actions"><Button size="sm" variant="secondary" disabled={busy || current.status === 'ended' || current.staged.includes(t.id)} onClick={() => command('stage', sessionData({ template_id: t.id }))}>{current.staged.includes(t.id) ? 'Added to Session' : 'Add to Session Plan'}</Button><Button size="sm" disabled={busy || !isLive || !!activeEncounter} onClick={() => open('encounter', { template: t })}>Trigger Combat</Button></div></div>)}
              {!doc.templates.length && <p>No built encounters yet. Open Encounter Builder from DM Tools to create one.</p>}
            </article>{doc.encounters.filter(e => e.status !== 'resolved').map(encounterCard)}
          </>}
          {tab === 'Activity' && <article className="session-card"><h3>Campaign session activity</h3><ol className="session-activity">{[...doc.activity].reverse().map(a => <li key={a.id}><strong>{a.action.replaceAll('_',' ')}</strong> <small>{new Date(a.recorded_at).toLocaleString()}</small></li>)}</ol></article>}
        </>}
      </main>
    </div>
    <Modal show={!!dialog} onHide={() => !busy && setDialog(null)} centered>
      <Modal.Header closeButton={!busy}><Modal.Title>{({ create:'Prepare Session', start:'Confirm Roster & Starting State', end:'End Session', group:'Group Members & Location', journey:'Start Timed Journey', stop:'Stop Journey', advance:'Advance World Time', date:'Set Campaign Date & Time', event:'Schedule Session Event', encounter:'Start Encounter', reference:'Pin Session Reference', resolve:'Resolve Encounter' })[dialog?.kind]}</Modal.Title></Modal.Header>
      <Modal.Body>{error && <Alert variant="danger">{error}</Alert>}{dialog && <Form onSubmit={async event => { event.preventDefault(); const v = values(event); const k = dialog.kind;
        if (k === 'create') { if (await send('create_session', v)) setSelected(''); }
        if (k === 'start') await send('lifecycle', sessionData({ status:'active', confirm_roster:!!v.confirm, continue_unresolved:!!v.continue }));
        if (k === 'end') await send('lifecycle', sessionData({ status:'ended', confirm_end:!!v.confirm }));
        if (k === 'group') await send('group', { id:dialog.group?.id, name:v.name, members:new FormData(event.currentTarget).getAll('members'), location:((dialog.group && (v.location_key || '') === (dialog.group.location.key || '') && v.location === (dialog.group.location.label || '')) || (!v.location_key && !v.location && !dialog.group)) ? undefined : locationFromForm(v), relocate:!!v.relocate });
        if (k === 'journey') {
          const option = routePlan?.options?.find(item => item.mode === routeMode && item.available);
          await send('journey', option ? { group_id:dialog.group.id, route_request:{ settlement_id:routePlan.settlement_id,
            destination_key:routeDestination, mode:routeMode, map_revision:routePlan.map_revision,
            party_size:Math.max(1,dialog.group.members.length) } }
            : { group_id:dialog.group.id, destination:locationFromForm(v), seconds:Number(v.minutes)*60 });
        }
        if (k === 'stop') await send('stop_journey', { id:dialog.journey.id, location:v.location });
        if (k === 'advance') await send('advance', { seconds:Number(v.minutes)*60 });
        if (k === 'event') await send('event', { name:v.name, seconds:Number(v.minutes)*60, stop:!!v.stop });
        if (k === 'date') await send('set_time', { date:v });
        if (k === 'encounter') await send('start_encounter', { template_id:dialog.template.id, characters:new FormData(event.currentTarget).getAll('characters'), initiative:v.initiative });
        if (k === 'resolve') await send('encounter_status', { id:dialog.encounter.id, status:'resolved' });
        if (k === 'reference') await send('reference', sessionData({ reference:v.note_id ? {kind:'note',note_id:Number(v.note_id)} : {kind:'wiki',label:v.label,url:v.url} }));
      }}>
        {dialog.kind === 'create' && <Field label="Session title"><Form.Control {...text('title')} required maxLength={250} autoFocus /></Field>}
        {dialog.kind === 'start' && <><p>Starting or resuming does not advance world time.</p><ul>{roster.map(c => <li key={c.id}>{c.name}: {current.roster[String(c.id)]?.attendance || 'unconfirmed'} · {current.roster[String(c.id)]?.participation || 'inactive'}</li>)}</ul><p>Close this dialog to update attendance and participation in Party &amp; Groups.</p><Form.Check id={`session-${dialog.kind}-confirm`} name="confirm" label="I confirm the roster, groups and starting locations" required /><Form.Check id="session-continue" name="continue" label="Continue any unfinished journeys, pending events and encounters" /></>}
        {dialog.kind === 'end' && <><p>Saved locations and unfinished activities will carry forward. Running combat will be suspended. World time will not advance.</p><Form.Check id={`session-${dialog.kind}-confirm`} name="confirm" label="End this session and preserve its state" required /></>}
        {dialog.kind === 'group' && <><Field label="Group name"><Form.Control {...text('name',dialog.group?.name)} required /></Field><fieldset><legend>Members</legend>{roster.map(c => <Form.Check id={`session-member-${c.id}`} key={c.id} name="members" value={c.id} label={c.name} defaultChecked={dialog.group?.members.includes(String(c.id))} />)}</fieldset>{locationFields(dialog.group?.location)}<Form.Check id="session-relocate" name="relocate" label="Explicitly relocate this group without advancing world time" /><p className="session-muted">Split groups inherit their source location. Select members from another group to merge; different locations require explicit relocation.</p></>}
        {dialog.kind === 'journey' && <><p>Travellers: {dialog.group.name}. Choose a road-aware destination, or use the manual fallback below.</p>
          {routeContext?.destinations?.length ? <><Field label="Search destinations"><Form.Control type="search" value={routeSearch} onChange={event => setRouteSearch(event.target.value)} /></Field><Field label="Settlement destination"><Form.Select aria-label="Journey destination" value={routeDestination} onChange={event => { setRouteDestination(event.target.value); setRoutePlan(null); }}><option value="">Choose a building, property, or point of interest</option>{routeContext.destinations.filter(item => !routeSearch || item.label?.toLowerCase().includes(routeSearch.toLowerCase())).map(item => <option key={item.key} value={item.key} disabled={item.access_status !== 'connected'}>{item.label}{item.access_status !== 'connected' ? ' · disconnected' : ''}</option>)}</Form.Select></Field><Button type="button" variant="secondary" disabled={!routeDestination} onClick={calculateJourney}>Calculate Routes</Button>
          {routePlan && <><fieldset><legend>Travel mode</legend>{routePlan.options.map(option => <Form.Check key={option.mode} type="radio" name="route_mode" id={`route-${option.mode}`} value={option.mode} checked={routeMode === option.mode} disabled={!option.available} onChange={() => setRouteMode(option.mode)} label={option.available ? `${option.label} · ${option.elapsed_minutes} min · ${option.distance_miles} mi` : `${option.label} · ${option.unavailable_reason}`} />)}</fieldset>{routePlan.options?.some(option => option.available) && <Button type="button" variant="link" onClick={() => setRoutePlan(null)}>Use Manual Duration Instead</Button>}</>}</> : <p>{routeContext ? 'No connected exterior destinations are available on this map.' : 'Loading settlement destinations…'}</p>}
          {(!routePlan || !routePlan.options?.some(option => option.available)) && <><hr /><p className="session-muted">Manual duration fallback</p>{locationFields()}<Field label="Travel duration (minutes)"><Form.Control name="minutes" type="number" min={1} required /></Field></>}</>}
        {dialog.kind === 'stop' && (dialog.journey.route_snapshot ? <p>The group will stop at its current calculated position on the saved route.</p> : <><p>Specify where the group has stopped.</p><Field label="Current location"><Form.Control name="location" required /></Field></>)}
        {['advance','event'].includes(dialog.kind) && <>{dialog.kind === 'event' && <Field label="Event name"><Form.Control name="name" required /></Field>}<Field label={dialog.kind === 'event' ? 'Minutes from now' : 'Minutes to advance'}><Form.Control name="minutes" type="number" min={1} required /></Field>{dialog.kind === 'event' ? <Form.Check id="session-event-stop" name="stop" label="Stop the world clock for this event" defaultChecked /> : <p>Time stops at the earliest arrival or stopping event. Other groups progress to the same instant.</p>}</>}
        {dialog.kind === 'date' && <><Field label="Month"><Form.Select name="month_index" defaultValue={calendar?.current_date.month_index}>{calendar?.months.map((m,i) => <option value={i} key={i}>{m.name}</option>)}</Form.Select></Field>{[['year','Year'],['day','Day'],['hour','Hour'],['minute','Minute'],['second','Second']].map(([key,name]) => <Field key={key} label={name}><Form.Control name={key} type="number" defaultValue={calendar?.current_date[key] || 0} required /></Field>)}<p>Forward changes stop at events. Backward corrections require stopped journeys and suspended combat.</p></>}
        {dialog.kind === 'reference' && <><Field label="Private campaign note"><Form.Select name="note_id"><option value="">Pin a Wiki page instead</option>{notes.map(n => <option value={n.id} key={n.id}>{n.content.slice(0,100)}</option>)}</Form.Select></Field><Field label="Wiki reference title"><Form.Control name="label" /></Field><Field label="Campaign Wiki path"><Form.Control name="url" placeholder="/wiki/Waterdeep%20Dragon%20Heist/Main%20Page" /></Field></>}
        {dialog.kind === 'encounter' && <><p>Start {dialog.template.name}. Select participating characters explicitly:</p>{roster.map(c => <Form.Check id={`session-encounter-character-${c.id}`} name="characters" key={c.id} value={c.id} label={c.name} defaultChecked={current.roster[String(c.id)]?.attendance === 'present' && ['player','dm'].includes(current.roster[String(c.id)]?.participation)} />)}<Field label="Creature initiative"><Form.Select name="initiative" defaultValue="manual"><option value="manual">Collect or enter rolls after starting</option><option value="automatic">Kachhapa rolls all creatures now</option></Form.Select></Field><p className="session-muted">Creature grouping comes from Encounter Builder. Player characters still roll or enter their own initiative.</p></>}
        {dialog.kind === 'resolve' && <p>Resolve {dialog.encounter.name}? Its initiative and round history will remain saved.</p>}
        <div className="session-actions session-dialog-actions"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Confirm'}</Button><Button variant="secondary" type="button" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button></div>
      </Form>}</Modal.Body>
    </Modal>
  </section>;
}

function SessionNotes({ current, notes, busy, command, onPin, sourceError, drafts, setDrafts }) {
  const draft = drafts[current.id] || {};
  const change = (key, value) => setDrafts(all => ({...all, [current.id]: {...all[current.id], [key]:value}}));
  return <article className="session-card"><h3>Session notes</h3><Form key={`${current.id}-${current.status}`} onSubmit={async event => { event.preventDefault(); if (await command('update_session',{session_id:current.id,...values(event)})) setDrafts(all => { const next={...all}; delete next[current.id]; return next; }); }}>
    <Field label="Title"><Form.Control name="title" value={draft.title ?? current.title} onChange={e => change('title',e.target.value)} required /></Field>{[['prep','Preparation'],['notes','Running notes'],['recap','Session recap']].map(([key,label]) => <Field key={key} label={label}><Form.Control as="textarea" rows={5} name={key} value={draft[key] ?? current[key]} onChange={e => change(key,e.target.value)} /></Field>)}<Button type="submit" disabled={busy}>Save Notes</Button>
  </Form><h4>Pinned references</h4>{sourceError && <Alert variant="warning">{sourceError}</Alert>}{current.references.map(r => <div key={r.id} className="session-group">{r.kind === 'wiki' ? <a href={r.url} target="_blank" rel="noreferrer">{r.label} ↗</a> : <p className="session-written">{notes.find(n => n.id === r.note_id)?.content || 'This private note is no longer available.'}</p>}<Button size="sm" variant="outline-secondary" onClick={() => command('remove_reference',{session_id:current.id,id:r.id})} disabled={busy}>Unpin</Button></div>)}<Button variant="secondary" onClick={onPin}>Pin Note / Wiki Page</Button></article>;
}
