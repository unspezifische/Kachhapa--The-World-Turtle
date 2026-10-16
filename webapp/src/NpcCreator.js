import React, { useEffect, useState } from 'react';
import { Modal, Button, Form, Alert, InputGroup } from 'react-bootstrap';
import axios from 'axios';
import { ABILITIES, NPC_FIELDS, newNpcDraft, mergeGeneration } from './npcDraft';
import NpcScheduleEditor from './NpcScheduleEditor';
import './NpcWorkflow.css';
const labels = { creature_subtype: 'Race / Ancestry', creature_type: 'Creature Type', ac: 'Armor Class', hp: 'Hit Points', saving_throws: 'Saving Throws', challenge: 'Challenge', occupation: 'Occupation' };
const label = key => labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const steps = ['Identity & Occupation', 'Abilities', 'Character Details', 'Schedule', 'Review'];
export default function NpcCreator({ show, onClose, headers, initial = null, onSaved }) {
  const [draft, setDraft] = useState(newNpcDraft);
  const [schedule, setSchedule] = useState(null);
  const [locks, setLocks] = useState([]);
  const [step, setStep] = useState(0);
  const [options, setOptions] = useState({ ancestries: [], occupations: [], genders: [], alignments: [] });
  const [catalog, setCatalog] = useState({ locations: [] });
  const [history, setHistory] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rerollField, setRerollField] = useState(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  useEffect(() => {
    if (!show) return;
    setDraft(initial ? { ...newNpcDraft(), ...initial, ...initial.profile_metadata } : newNpcDraft());
    setSchedule(initial?.schedule || null); setLocks(initial ? [...NPC_FIELDS] : []); setStep(0); setHistory([]); setError(''); setWarnings(initial?.schedule_warnings || []); setDirty(false); setConfirmDiscard(false); setRerollField(null); setScheduleError('');
    let active = true;
    Promise.all([axios.get('/api/npcs/generation-options', { headers }), axios.get('/api/npcs/schedule-locations', { headers })]).then(([generation, locations]) => {
      if (active) { setOptions(generation.data); setCatalog(locations.data); }
    }).catch(() => { if (active) setError('Could not load generation and location options. Manual editing is available.'); });
    return () => { active = false; };
  }, [show, initial, headers]);
  const change = (key, value) => { setDraft(current => ({ ...current, [key]: value })); setLocks(current => current.includes(key) ? current : [...current, key]); setDirty(true); };
  const generate = async (target, random = false) => {
    setBusy(true); setError('');
    try {
      const { data } = await axios.post('/api/npcs/smart-fill', { values: draft, locked_fields: locks, target, seed: `${Date.now()}-${Math.random()}` }, { headers });
      setHistory(current => [...current.slice(-19), { draft, schedule, locks, warnings }]);
      setDraft({ ...mergeGeneration(draft, data.values, locks, target), generation: data.generation }); setWarnings(data.warnings || []); if (target) setLocks(current => current.filter(key => key !== target)); setRerollField(null); setDirty(true);
      if (random && locks.length) setWarnings(current => [...current, 'Kept fields were preserved. Unlock them to generate a completely new NPC.']);
    } catch (err) { setError(err.response?.data?.message || 'Could not generate this NPC.'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError('');
    try {
      const payload = { ...Object.fromEntries(NPC_FIELDS.map(key => [key, draft[key] ?? ''])), generation: draft.generation || {}, locked_fields: locks, schedule, ...(initial ? { expected_revision: initial.revision } : {}) };
      const { data } = initial ? await axios.patch(`/api/npcs/${initial.id}`, payload, { headers }) : await axios.post('/api/npcs', payload, { headers });
      onSaved(data); onClose();
    } catch (err) { setError(err.response?.data?.message || 'Could not save the NPC. Your draft is still here.'); }
    finally { setBusy(false); }
  };
  const field = key => {
    const choices = key === 'creature_subtype' ? options.ancestries : key === 'occupation' ? options.occupations?.map(item => item.key) : key === 'gender' ? options.genders : key === 'alignment' ? options.alignments : key === 'size' ? ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'] : null;
    return <Form.Group key={key} className="npc-edit-field">
      <Form.Label htmlFor={`npc-${key}`}>{label(key)}</Form.Label>
      <InputGroup>{choices?.length ? <><Form.Control id={`npc-${key}`} list={`npc-options-${key}`} value={draft[key] ?? ''} onChange={event => change(key, event.target.value)} /><datalist id={`npc-options-${key}`}>{choices.map(value => <option key={value} value={value} />)}</datalist></> : <Form.Control id={`npc-${key}`} as={['description', 'traits', 'actions'].includes(key) ? 'textarea' : 'input'} type={ABILITIES.includes(key) || key === 'speed' ? 'number' : 'text'} value={draft[key] ?? ''} onChange={event => change(key, event.target.value)} />}
      <Button variant="outline-secondary" title={locks.includes(key) ? `Unlock ${label(key)} for random changes (manual editing is always available)` : `Lock ${label(key)} against random changes (manual editing is always available)`} aria-label={`${locks.includes(key) ? 'Unlock' : 'Lock'} ${label(key)} for random changes`} aria-pressed={locks.includes(key)} onClick={() => setLocks(current => current.includes(key) ? current.filter(value => value !== key) : [...current, key])}>{locks.includes(key) ? '🔒' : '🔓'}</Button></InputGroup><div className="npc-field-actions"><Button variant="outline-secondary" size="sm" disabled={busy} aria-label={`Re-roll ${label(key)}`} onClick={() => locks.includes(key) ? setRerollField(key) : generate(key)}>Re-roll</Button></div>
    </Form.Group>;
  };
  const incomplete = NPC_FIELDS.filter(key => ['name', 'size', 'creature_type', 'alignment', 'ac', 'hp', 'speed', ...ABILITIES, 'description'].includes(key) && (draft[key] === '' || draft[key] == null));
  const complete = [['name','size','creature_type','alignment'].every(key => !!draft[key]), ABILITIES.every(key => Number(draft[key]) >= 1 && Number(draft[key]) <= 30), ['description','ac','hp','speed'].every(key => draft[key] !== '' && draft[key] != null), !!schedule, !incomplete.length && !scheduleError];
  return <Modal show={show} onHide={() => dirty ? setConfirmDiscard(true) : onClose()} size="xl" centered backdrop="static" className="npc-workflow-modal" backdropClassName="npc-workflow-backdrop">
    <Modal.Header closeButton><Modal.Title>{initial ? 'Edit Character & Schedule' : 'Create NPC'}</Modal.Title></Modal.Header>
    <Modal.Body>
      {confirmDiscard ? <Alert variant="warning">Discard your unsaved changes?<div className="npc-inline-actions"><Button onClick={onClose}>Discard Draft</Button><Button onClick={() => setConfirmDiscard(false)}>Keep Editing</Button></div></Alert> : <>
        {(initial?.module_key || (initial?.source && initial.source !== 'Homebrew')) && <Alert variant="info">Saving creates a linked Homebrew override. The module original and this NPC’s ID are retained.</Alert>}
        <nav className="npc-step-nav" aria-label="NPC creator steps">{steps.map((title, index) => <Button key={title} variant={step === index ? 'primary' : 'outline-secondary'} aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)}>{index + 1}. {title}{complete[index] && <span aria-label="completed"> ✓</span>}</Button>)}</nav>
        <div className="npc-inline-actions"><Button disabled={busy} onClick={() => generate()}>Smart Fill</Button><Button variant="outline-secondary" disabled={busy} onClick={() => generate(null, true)}>Generate Random NPC</Button><Button variant="outline-secondary" disabled={!history.length || busy} onClick={() => { const previous = history[history.length - 1]; setDraft(previous.draft); setSchedule(previous.schedule); setLocks(previous.locks); setWarnings(previous.warnings); setHistory(history.slice(0, -1)); }}>Undo Last Generation</Button><span>{locks.length} fields protected from random changes</span></div>
        <p>🔒 protects a field from Smart Fill and random generation. You can always edit it manually. Re-roll unlocks that field and generates a new value.</p>
        {rerollField && <Alert variant="warning" role="alertdialog" aria-label="Confirm locked field re-roll">Unlock and re-roll {label(rerollField)}? This replaces its current value.<div className="npc-inline-actions"><Button disabled={busy} onClick={() => generate(rerollField)}>Unlock &amp; Re-roll</Button><Button onClick={() => setRerollField(null)}>Keep Current Value</Button></div></Alert>}
        <div className="npc-creator-layout"><main>
          <h3>{steps[step]}</h3>
          {step === 0 && <div className="npc-field-grid">{['name', 'gender', 'creature_subtype', 'occupation', 'size', 'creature_type', 'alignment'].map(field)}</div>}
          {step === 1 && <><p>Smart Fill rolls 4d6, drops the lowest, and favors abilities relevant to a kept occupation. Keep any scores you want to preserve.</p><div className="npc-field-grid">{ABILITIES.map(field)}</div></>}
          {step === 2 && <><div className="npc-field-grid">{['description', 'traits', 'actions'].map(field)}</div><details><summary>Combat and supporting details</summary><div className="npc-field-grid">{['ac', 'hp', 'speed', 'saving_throws', 'skills', 'immunities', 'resistance', 'senses', 'languages', 'challenge'].map(field)}</div></details></>}
          <div hidden={step !== 3}><NpcScheduleEditor onError={setScheduleError} value={schedule} onChange={value => { setSchedule(value); setDirty(true); }} npc={initial} occupation={draft.occupation} locations={catalog.locations} clock={catalog} warnings={warnings.filter(w => w.includes('mapping'))} /></div>
          {step === 4 && <><p>{incomplete.length ? `Complete required fields: ${incomplete.map(label).join(', ')}` : 'Character fields are ready to save.'}</p><dl>{NPC_FIELDS.map(key => <React.Fragment key={key}><dt>{label(key)}</dt><dd>{draft[key] || '—'}</dd></React.Fragment>)}</dl><p>{schedule ? `${schedule.rules?.length || 0} routine activities; ${schedule.exceptions?.length || 0} exceptions. Unmapped schedules are saved as disabled drafts.` : 'No schedule assigned.'}</p></>}
        </main><aside className="npc-live-card" aria-label="NPC card preview"><h3>{draft.name || 'New NPC'}</h3><p>{draft.creature_subtype || 'Choose ancestry'} · {draft.occupation || 'Choose occupation'}</p><p>{draft.size} {draft.creature_type} · {draft.alignment}</p><p>AC {draft.ac || '—'} · HP {draft.hp || '—'} · Speed {draft.speed || '—'}</p><div className="npc-ability-preview">{ABILITIES.map(key => <span key={key}>{key.slice(0, 3).toUpperCase()} <strong>{draft[key] || '—'}</strong></span>)}</div><p>{draft.description}</p><p>{schedule ? `${schedule.rules?.length || 0} scheduled activities` : 'Schedule optional'}</p></aside></div>
        {warnings.map((warning, index) => <Alert variant="warning" key={index}>{warning}</Alert>)}
        {scheduleError && <Alert variant="warning" role="alert">{scheduleError}</Alert>}
        {error && <Alert variant="danger" role="alert">{error}</Alert>}
      </>}
    </Modal.Body><Modal.Footer><Button variant="outline-secondary" onClick={() => dirty ? setConfirmDiscard(true) : onClose()}>Cancel</Button><Button variant="outline-secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>{step < 4 ? <Button onClick={() => setStep(step + 1)}>Next</Button> : <Button disabled={busy || incomplete.length > 0 || !!scheduleError} onClick={save}>{busy ? 'Saving…' : 'Save NPC & Schedule'}</Button>}</Modal.Footer>
  </Modal>;
}
