import React, { useState } from 'react';
import { Button, Form, Alert } from 'react-bootstrap';
import { newSchedule, routineForOccupation, isScheduleShape, scheduleTimeline } from './npcDraft';
const activities = ['sleep', 'rest', 'eat', 'prepare_food', 'wash', 'work', 'study', 'socialize', 'worship', 'store_items', 'guard', 'tend_animals', 'trade', 'pass_through', 'change_clothes', 'clean', 'read'];
export default function NpcScheduleEditor({ value, onChange, npc, occupation, locations = [], readOnly = false, warnings = [], clock = {}, onError = () => {}, onGenerate }) {
  const [json, setJson] = useState('');
  const [error, setErrorState] = useState('');
  const setError = message => { setErrorState(message); onError(message); };
  const [kept, setKept] = useState([]);
  const schedule = value;
  const hours = clock.hours_per_day || 24, minutes = clock.minutes_per_hour || 60, dayMinutes = hours * minutes;
  const set = (key, next) => onChange({ ...schedule, [key]: next });
  const changeRule = (section, id, patch) => set(section, schedule[section].map(rule => rule.id === id ? { ...rule, ...patch } : rule));
  const addRule = section => {
    const id = `activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const binding = `location-${id}`;
    onChange({ ...schedule, bindings: { ...schedule.bindings, [binding]: {} }, [section]: [...(schedule[section] || []), { id, repeat: section === 'exceptions' ? { kind: 'once', date: { year: 1, month_index: 0, day: 1 } } : { kind: 'daily' }, start: '09:00', duration_minutes: 60, priority: section === 'exceptions' ? 100 : 10, activity: 'rest', destination: { binding, capability: 'rest', fallbacks: [] }, arrival_policy: 'require_arrival', on_unavailable: 'wait_and_retry', retry_minutes: 15 }] });
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(schedule, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${schedule.schedule_key || 'npc-schedule'}.json`; anchor.click(); URL.revokeObjectURL(url);
  };
  if (!schedule) return <section className="npc-schedule"><p>No schedule assigned. Scheduling is optional.</p>{!readOnly && <Button onClick={() => onChange(newSchedule(npc))}>Create Schedule</Button>}</section>;
  return <section className="npc-schedule" aria-label="NPC schedule">
    <p>Campaign time · {hours}-hour day · DM only · planned activities, not automatic movement.</p>
    <div className="npc-timeline" aria-label="Daily schedule timeline">{scheduleTimeline(schedule, dayMinutes, minutes).map(segment => <div key={segment.id} style={{ left: `${segment.start / dayMinutes * 100}%`, width: `${(segment.end - segment.start) / dayMinutes * 100}%` }} title={`${segment.label}: ${segment.start}–${segment.end} campaign minutes`}>{segment.label}</div>)}</div>
    <div className="npc-inline-actions">
      {!readOnly && <><Form.Check id="npc-schedule-enabled" label="Enable when valid and mapped" checked={!!schedule.enabled} onChange={event => set('enabled', event.target.checked)} /><Button size="sm" onClick={() => onGenerate ? onGenerate(schedule, kept) : onChange(routineForOccupation(schedule, occupation, kept))}>Build from occupations &amp; roles</Button><Button size="sm" onClick={() => onChange(null)}>Remove Schedule</Button></>}
      <Button size="sm" onClick={download}>Export JSON</Button>
    </div>
    {warnings.map(warning => <Alert variant="warning" key={warning}>{warning}</Alert>)}
    {['rules', 'exceptions'].map(section => <div key={section}>
      <h4>{section === 'rules' ? 'Daily routine' : 'Exceptions'}</h4>
      {(schedule[section] || []).map(rule => <div className="npc-schedule-rule" key={rule.id}>
        {readOnly ? <><strong>{rule.start} · {rule.activity}</strong><p>{rule.duration_minutes} minutes · {rule.repeat?.kind} · {schedule.bindings?.[rule.destination?.binding]?.label || rule.destination?.binding || 'Unmapped location'}</p><p>{rule.notes}</p><small>{rule.provenance?.basis || schedule.provenance?.basis}</small></> : <>
          <div className="npc-field-grid">
            <Form.Group controlId={`schedule-${rule.id}-start`}><Form.Label>Start time</Form.Label><Form.Control aria-label={`Start ${rule.id}`} value={rule.start} onChange={event => changeRule(section, rule.id, { start: event.target.value })} /></Form.Group>
            <Form.Group controlId={`schedule-${rule.id}-duration`}><Form.Label>Duration (minutes)</Form.Label><Form.Control type="number" min="1" value={rule.duration_minutes} onChange={event => changeRule(section, rule.id, { duration_minutes: Number(event.target.value) })} /></Form.Group>
            <Form.Group controlId={`schedule-${rule.id}-activity`}><Form.Label>Activity</Form.Label><Form.Select value={rule.activity} onChange={event => changeRule(section, rule.id, { activity: event.target.value, destination: { ...rule.destination, capability: event.target.value } })}>{activities.map(activity => <option key={activity}>{activity}</option>)}</Form.Select></Form.Group>
            <Form.Group controlId={`schedule-${rule.id}-priority`}><Form.Label>Priority</Form.Label><Form.Control type="number" value={rule.priority} onChange={event => changeRule(section, rule.id, { priority: Number(event.target.value) })} /></Form.Group>
            <Form.Group controlId={`schedule-${rule.id}-repeat`}><Form.Label>Recurrence</Form.Label><Form.Select value={rule.repeat?.kind || 'daily'} onChange={event => changeRule(section, rule.id, { repeat: event.target.value === 'daily' ? { kind: 'daily' } : event.target.value === 'cycle' ? { kind: 'cycle', cycle_days: 10, day_indices: [0], anchor_date: { year: 1, month_index: 0, day: 1 } } : { kind: 'once', date: { year: 1, month_index: 0, day: 1 } } })}><option>daily</option><option>cycle</option><option>once</option></Form.Select></Form.Group>
            <Form.Group controlId={`schedule-${rule.id}-destination`}><Form.Label>Destination</Form.Label><Form.Select value={locations.find(location => JSON.stringify(location.resolved) === JSON.stringify(schedule.bindings?.[rule.destination.binding]?.resolved))?.id || ''} onChange={event => { const location = locations.find(item => item.id === event.target.value); set('bindings', { ...schedule.bindings, [rule.destination.binding]: { ...schedule.bindings[rule.destination.binding], resolved: location?.resolved, label: location?.label } }); }}><option value="">Unmapped — choose a location</option>{locations.map(location => <option key={location.id} value={location.id}>{location.label}</option>)}</Form.Select></Form.Group>
            <Form.Group controlId={`schedule-${rule.id}-unavailable`}><Form.Label>If unavailable</Form.Label><Form.Select value={rule.on_unavailable} onChange={event => changeRule(section, rule.id, { on_unavailable: event.target.value })}><option value="wait_and_retry">Wait and retry</option><option value="skip">Skip</option></Form.Select></Form.Group>
            {rule.on_unavailable === 'wait_and_retry' && <Form.Group controlId={`schedule-${rule.id}-retry`}><Form.Label>Retry minutes</Form.Label><Form.Control type="number" value={rule.retry_minutes || 15} onChange={event => changeRule(section, rule.id, { retry_minutes: Number(event.target.value) })} /></Form.Group>}
          </div>
          <Form.Group controlId={`schedule-${rule.id}-notes`}><Form.Label>DM notes</Form.Label><Form.Control as="textarea" value={rule.notes || ''} onChange={event => changeRule(section, rule.id, { notes: event.target.value })} /></Form.Group>
          <div className="npc-inline-actions"><Form.Check id={`keep-${rule.id}`} label="Keep activity during routine re-roll" checked={kept.includes(rule.id)} onChange={event => setKept(event.target.checked ? [...kept, rule.id] : kept.filter(id => id !== rule.id))} /><Button size="sm" onClick={() => set(section, schedule[section].filter(item => item.id !== rule.id))}>Remove Activity</Button></div>
          <details><summary>Recurrence, capabilities, fallbacks and provenance</summary><p>Edit these structured details below; unknown fields are preserved.</p><Form.Control as="textarea" rows={6} key={JSON.stringify({ repeat: rule.repeat, destination: rule.destination, provenance: rule.provenance })} defaultValue={JSON.stringify({ repeat: rule.repeat, destination: rule.destination, provenance: rule.provenance || schedule.provenance }, null, 2)} onBlur={event => { try { const patch = JSON.parse(event.target.value); changeRule(section, rule.id, patch); setError(''); } catch { setError('Activity details must be valid JSON.'); } }} /></details>
        </>}
      </div>)}
      {!readOnly && <Button size="sm" onClick={() => addRule(section)}>Add {section === 'rules' ? 'Activity' : 'Exception'}</Button>}
    </div>)}
    <details><summary>Schedule JSON and import</summary><Form.Control as="textarea" rows={12} readOnly={readOnly} value={json || JSON.stringify(schedule, null, 2)} onChange={event => { setJson(event.target.value); onError('Apply or discard your JSON edits before saving.'); }} />{!readOnly && <><Button size="sm" onClick={() => { setJson(''); setError(''); }}>Discard JSON Edits</Button><Button size="sm" onClick={() => { try { const parsed = JSON.parse(json); if (!isScheduleShape(parsed)) throw new Error(); onChange(parsed); setJson(''); setError(''); } catch { setError('Paste a valid version 1 schedule JSON object.'); } }}>Apply JSON</Button><Form.Control type="file" accept=".json" aria-label="Import schedule JSON" onChange={async event => { try { const file = event.target.files[0]; if (!file || file.size > 1024 * 1024) throw new Error(); const parsed = JSON.parse(await file.text()); if (!isScheduleShape(parsed)) throw new Error(); onChange(parsed); setError(''); } catch { setError('Choose a valid schedule JSON file under 1 MB.'); } }} /></>}</details>
    {error && <Alert variant="danger" role="alert">{error}</Alert>}
  </section>;
}
