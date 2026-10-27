import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Timeline.css';

const EMPTY_EVENT = {
  name: '', description: '', year: '', season: '', month_index: '', day: '',
  has_range: false, end_year: '', end_season: '', end_month_index: '', end_day: '',
  color: '#c8873a', is_player_visible: false, npc_ids: [],
};

const seasonFor = (calendar, monthIndex, day) => {
  if (monthIndex === '' || monthIndex === null || monthIndex === undefined) return '';
  const index = Number(monthIndex);
  const holiday = (calendar?.holidays || []).find(item => item.month_index === index && Number(item.day) === Number(day));
  if (holiday?.season) return holiday.season;
  return (calendar?.seasons || []).find(item => (item.months || []).includes(index))?.name || '';
};

const maxDay = (calendar, year, monthIndex) => {
  if (monthIndex === '' || monthIndex === null || monthIndex === undefined) return 31;
  const month = calendar?.months?.[Number(monthIndex)];
  if (!month) return 31;
  const numericYear = Number(year);
  const gregorianLeap = numericYear % 4 === 0 && (numericYear % 100 !== 0 || numericYear % 400 === 0);
  const harptosLeap = numericYear % 4 === 0;
  let result = Number((gregorianLeap || harptosLeap) && month.leap_length ? month.leap_length : month.length || 30);
  (calendar?.holidays || []).filter(item => item.month_index === Number(monthIndex) && (!item.leap_only || numericYear % 4 === 0)).forEach(item => { result = Math.max(result, Number(item.day)); });
  return result;
};

function EventCard({ event, index, canEdit, onEdit, onDelete, onVisibility }) {
  return <article className="history-event-card" style={{ '--event-accent': event.color || '#c8873a', '--event-delay': `${Math.min(index, 10) * 45}ms` }}>
    <div className="history-event-date">{event.date_label}</div>
    <h2>{event.name}</h2>
    {event.description && <p>{event.description}</p>}
    {!!event.characters?.length && <div className="history-age-list" aria-label="Character ages">{event.characters.map(character => <span key={character.id}><strong>{character.name}</strong>{character.label}</span>)}</div>}
    {canEdit && <div className="history-card-actions">
      <Button size="sm" variant="link" onClick={() => onVisibility(event)}>{event.is_player_visible ? 'Visible to players · make private' : 'DM only · show to players'}</Button>
      <Button size="sm" variant="outline-secondary" onClick={() => onEdit(event)}>Edit</Button>
      <Button size="sm" variant="outline-danger" onClick={() => onDelete(event)}>Delete</Button>
    </div>}
  </article>;
}

export default function Timeline({ headers, campaignID, accountType, username, socket }) {
  const navigate = useNavigate();
  const preferenceKey = `kachhapa-timeline-view:${username || 'user'}:${campaignID}`;
  const [layout, setLayout] = useState(() => {
    const saved = localStorage.getItem(preferenceKey);
    return saved === 'horizontal' || saved === 'vertical' ? saved : 'vertical';
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_EVENT);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [npcSearch, setNpcSearch] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportOrientation, setExportOrientation] = useState('portrait');
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState('');
  const [importError, setImportError] = useState('');
  const [notice, setNotice] = useState('');
  const horizontalRef = useRef(null);
  const canEdit = accountType?.toLowerCase() === 'dm';

  const load = useCallback(async () => {
    if (!campaignID) return;
    try {
      setError('');
      const response = await axios.get(`/api/calendar/${campaignID}/timeline`, { headers });
      setData(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The campaign timeline could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [campaignID, headers]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => {
    const saved = localStorage.getItem(preferenceKey);
    setLayout(saved === 'horizontal' || saved === 'vertical' ? saved : 'vertical');
  }, [preferenceKey]);
  useEffect(() => {
    if (!socket || !campaignID) return undefined;
    const refresh = payload => { if (payload?.campaign_id === campaignID && String(payload.kind || '').startsWith('event')) load(); };
    socket.on('calendar_updated', refresh);
    return () => socket.off('calendar_updated', refresh);
  }, [socket, campaignID, load]);

  const chooseLayout = value => { setLayout(value); localStorage.setItem(preferenceKey, value); };
  const openCreate = () => { setEditingId(null); setDraft({ ...EMPTY_EVENT, season: data?.calendar?.seasons?.[0]?.name || '' }); setNpcSearch(''); setEditorError(''); setEditorOpen(true); };
  const openEdit = event => { setEditingId(event.id); setDraft({ ...EMPTY_EVENT, ...event, has_range: event.end_year != null, month_index: event.month_index ?? '', day: event.day ?? '', end_year: event.end_year ?? '', end_season: event.end_season ?? '', end_month_index: event.end_month_index ?? '', end_day: event.end_day ?? '', npc_ids: event.npc_ids || [] }); setNpcSearch(''); setEditorError(''); setEditorOpen(true); };
  const changeMonth = value => setDraft(current => ({ ...current, month_index: value === '' ? '' : Number(value), day: '', season: value === '' ? current.season : seasonFor(data.calendar, Number(value), null) }));
  const changeDay = value => setDraft(current => { const day = value === '' ? '' : Number(value); return { ...current, day, season: seasonFor(data.calendar, current.month_index, day) }; });
  const changeEndMonth = value => setDraft(current => ({ ...current, end_month_index: value === '' ? '' : Number(value), end_day: '', end_season: value === '' ? current.end_season : seasonFor(data.calendar, Number(value), null) }));
  const changeEndDay = value => setDraft(current => { const day = value === '' ? '' : Number(value); return { ...current, end_day: day, end_season: seasonFor(data.calendar, current.end_month_index, day) }; });
  const toggleNpc = id => setDraft(current => ({ ...current, npc_ids: current.npc_ids.includes(id) ? current.npc_ids.filter(value => value !== id) : [...current.npc_ids, id] }));
  const save = async event => {
    event.preventDefault(); setSaving(true); setEditorError('');
    const payload = {
      ...draft,
      year: Number(draft.year),
      month_index: draft.month_index === '' ? null : Number(draft.month_index),
      day: draft.day === '' ? null : Number(draft.day),
      end_year: draft.has_range ? Number(draft.end_year) : null,
      end_season: draft.has_range ? draft.end_season || null : null,
      end_month_index: draft.has_range && draft.end_month_index !== '' ? Number(draft.end_month_index) : null,
      end_day: draft.has_range && draft.end_day !== '' ? Number(draft.end_day) : null,
    };
    delete payload.has_range;
    try {
      if (editingId) await axios.patch(`/api/calendar/events/${editingId}`, payload, { headers });
      else await axios.post(`/api/calendar/${campaignID}/events`, payload, { headers });
      setEditorOpen(false); await load();
    } catch (requestError) { setEditorError(requestError.response?.data?.message || 'The historical event could not be saved.'); }
    finally { setSaving(false); }
  };
  const remove = async event => {
    if (!window.confirm(`Delete “${event.name}” from the campaign history?`)) return;
    try { await axios.delete(`/api/calendar/events/${event.id}`, { headers }); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'The historical event could not be deleted.'); }
  };
  const toggleVisibility = async event => {
    try { await axios.patch(`/api/calendar/events/${event.id}`, { is_player_visible: !event.is_player_visible }, { headers }); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Visibility could not be changed.'); }
  };
  const downloadTimeline = async format => {
    setExporting(format); setExportError('');
    const params = format === 'pdf' ? { format, orientation: exportOrientation } : { format };
    try {
      const response = await axios.get(`/api/calendar/${campaignID}/timeline/export`, { headers, params, responseType: 'blob' });
      const contentType = format === 'pdf' ? 'application/pdf' : format === 'json' ? 'application/json' : 'text/markdown;charset=utf-8';
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: contentType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const calendarName = (data?.calendar?.name || 'campaign').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campaign';
      anchor.href = url;
      anchor.download = format === 'pdf' ? `${calendarName}-timeline-${exportOrientation}.pdf` : `${calendarName}-timeline.${format === 'json' ? 'json' : 'md'}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (requestError) {
      setExportError(requestError.response?.data?.message || 'The timeline export could not be created.');
    } finally { setExporting(''); }
  };
  const openImport = () => { setImportFile(null); setImportPreview(null); setImportError(''); setImportOpen(true); };
  const uploadTimeline = async commit => {
    if (!importFile) return;
    setImporting(commit ? 'commit' : 'preview'); setImportError('');
    const form = new FormData(); form.append('file', importFile); form.append('commit', commit ? 'true' : 'false');
    try {
      const response = await axios.post(`/api/calendar/${campaignID}/timeline/import`, form, { headers });
      setImportPreview(response.data);
      if (commit) {
        setNotice(`${response.data.imported} ${response.data.imported === 1 ? 'event' : 'events'} imported. ${response.data.summary.duplicates} duplicate ${response.data.summary.duplicates === 1 ? 'was' : 'were'} skipped.`);
        setImportOpen(false); await load();
      }
    } catch (requestError) { setImportError(requestError.response?.data?.message || 'The timeline file could not be imported.'); }
    finally { setImporting(''); }
  };
  const filteredNpcs = useMemo(() => (data?.npcs || []).filter(npc => npc.name.toLowerCase().includes(npcSearch.toLowerCase())), [data, npcSearch]);

  if (loading) return <main className="history-page"><div className="history-state"><Spinner animation="border" /><p>Opening the campaign annals…</p></div></main>;
  if (error && !data) return <main className="history-page"><Alert variant="danger">{error}</Alert><Button onClick={() => navigate('/calendar')}>Back to Calendar</Button></main>;
  const events = data?.events || [];

  return <main className="history-page">
    <header className="history-masthead">
      <div><span className="history-kicker">{data?.calendar?.name || 'Campaign Calendar'}</span><h1>Historical Timeline</h1><p>A living chronicle of the world, its turning seasons, and the people carried through them.</p></div>
      <div className="history-header-actions"><Button variant="outline-secondary" onClick={() => navigate('/calendar')}>Calendar</Button><Button variant="outline-secondary" onClick={() => { setExportError(''); setExportOpen(true); }}>Export</Button>{canEdit && <Button variant="outline-secondary" onClick={openImport}>Import</Button>}{canEdit && <Button onClick={openCreate}>Add Event</Button>}</div>
    </header>
    <div className="history-toolbar">
      <div className="history-layout-picker" role="radiogroup" aria-label="Timeline orientation">
        {['vertical', 'horizontal'].map(value => <button key={value} type="button" role="radio" aria-checked={layout === value} className={layout === value ? 'is-active' : ''} onClick={() => chooseLayout(value)}>{value === 'vertical' ? '↕' : '↔'} {value[0].toUpperCase() + value.slice(1)}</button>)}
      </div>
      <span>{events.length} {events.length === 1 ? 'recorded event' : 'recorded events'}</span>
    </div>
    {error && <Alert variant="danger">{error}</Alert>}
    {notice && <Alert variant="success" dismissible onClose={() => setNotice('')}>{notice}</Alert>}
    {!events.length ? <section className="history-empty"><span aria-hidden="true">✦</span><h2>No history has been recorded yet</h2><p>{canEdit ? 'Add the first turning point in this campaign world.' : 'The DM has not shared any historical events yet.'}</p>{canEdit && <Button onClick={openCreate}>Record the First Event</Button>}</section> : layout === 'vertical' ?
      <section className="history-vertical" aria-label="Vertical historical timeline">{events.map((event, index) => <div className={`history-vertical-entry ${index % 2 ? 'is-right' : 'is-left'}`} key={event.id}><span className="history-node" aria-hidden="true">{index + 1}</span><EventCard event={event} index={index} canEdit={canEdit} onEdit={openEdit} onDelete={remove} onVisibility={toggleVisibility} /></div>)}</section> :
      <section className="history-horizontal-shell" aria-label="Horizontal historical timeline"><div className="history-scroll-controls"><Button variant="outline-secondary" aria-label="Scroll timeline left" onClick={() => horizontalRef.current?.scrollBy({ left: -420, behavior: 'smooth' })}>←</Button><Button variant="outline-secondary" aria-label="Scroll timeline right" onClick={() => horizontalRef.current?.scrollBy({ left: 420, behavior: 'smooth' })}>→</Button></div><div className="history-horizontal" ref={horizontalRef} tabIndex="0"> <div className="history-horizontal-track">{events.map((event, index) => <div className={`history-horizontal-entry ${index % 2 ? 'is-below' : 'is-above'}`} key={event.id}><span className="history-node" aria-hidden="true">{index + 1}</span><EventCard event={event} index={index} canEdit={canEdit} onEdit={openEdit} onDelete={remove} onVisibility={toggleVisibility} /></div>)}</div></div></section>}

    <Modal show={editorOpen} onHide={() => !saving && setEditorOpen(false)} size="lg" centered className="history-editor-modal">
      <Form onSubmit={save}><Modal.Header closeButton><Modal.Title>{editingId ? 'Edit Historical Event' : 'Record Historical Event'}</Modal.Title></Modal.Header><Modal.Body>
        {editorError && <Alert variant="danger">{editorError}</Alert>}
        <div className="history-form-grid"><Form.Group className="history-title-field"><Form.Label htmlFor="timeline-title">Title</Form.Label><Form.Control id="timeline-title" required maxLength="100" value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></Form.Group>
          <Form.Group><Form.Label htmlFor="timeline-year">Year</Form.Label><Form.Control id="timeline-year" type="number" required value={draft.year} onChange={event => setDraft(current => ({ ...current, year: event.target.value }))} /></Form.Group>
          <Form.Group><Form.Label htmlFor="timeline-season">Season</Form.Label><Form.Select id="timeline-season" required={!draft.has_range} disabled={draft.month_index !== ''} value={draft.season} onChange={event => setDraft(current => ({ ...current, season: event.target.value }))}>{draft.has_range && <option value="">Year only</option>}{(data?.calendar?.seasons || []).map(season => <option key={season.name}>{season.name}</option>)}</Form.Select></Form.Group>
          <Form.Group><Form.Label htmlFor="timeline-month">Month</Form.Label><Form.Select id="timeline-month" value={draft.month_index} onChange={event => changeMonth(event.target.value)}><option value="">{draft.has_range ? 'No month' : 'Season only'}</option>{(data?.calendar?.months || []).map((month, index) => <option value={index} key={month.name}>{month.name}</option>)}</Form.Select></Form.Group>
          <Form.Group><Form.Label htmlFor="timeline-day">Day</Form.Label><Form.Control id="timeline-day" type="number" min="1" max={maxDay(data?.calendar, draft.year, draft.month_index)} disabled={draft.month_index === ''} value={draft.day} onChange={event => changeDay(event.target.value)} /></Form.Group>
          <Form.Group className="history-range-toggle"><Form.Check id="timeline-has-range" label="This event spans a date range" checked={draft.has_range} onChange={event => setDraft(current => ({ ...current, has_range: event.target.checked, end_year: event.target.checked ? (current.end_year || current.year) : '', end_season: event.target.checked ? current.end_season : '', end_month_index: event.target.checked ? current.end_month_index : '', end_day: event.target.checked ? current.end_day : '' }))} /></Form.Group>
          {draft.has_range && <fieldset className="history-range-fields"><legend>Range ends</legend>
            <Form.Group><Form.Label htmlFor="timeline-end-year">End year</Form.Label><Form.Control id="timeline-end-year" type="number" required value={draft.end_year} onChange={event => setDraft(current => ({ ...current, end_year: event.target.value }))} /></Form.Group>
            <Form.Group><Form.Label htmlFor="timeline-end-season">End season</Form.Label><Form.Select id="timeline-end-season" disabled={draft.end_month_index !== ''} value={draft.end_season} onChange={event => setDraft(current => ({ ...current, end_season: event.target.value }))}><option value="">Year only</option>{(data?.calendar?.seasons || []).map(season => <option key={season.name}>{season.name}</option>)}</Form.Select></Form.Group>
            <Form.Group><Form.Label htmlFor="timeline-end-month">End month</Form.Label><Form.Select id="timeline-end-month" value={draft.end_month_index} onChange={event => changeEndMonth(event.target.value)}><option value="">No month</option>{(data?.calendar?.months || []).map((month, index) => <option value={index} key={month.name}>{month.name}</option>)}</Form.Select></Form.Group>
            <Form.Group><Form.Label htmlFor="timeline-end-day">End day</Form.Label><Form.Control id="timeline-end-day" type="number" min="1" max={maxDay(data?.calendar, draft.end_year, draft.end_month_index)} disabled={draft.end_month_index === ''} value={draft.end_day} onChange={event => changeEndDay(event.target.value)} /></Form.Group>
          </fieldset>}
          <Form.Group><Form.Label htmlFor="timeline-color">Marker color</Form.Label><Form.Control id="timeline-color" type="color" value={draft.color || '#c8873a'} onChange={event => setDraft(current => ({ ...current, color: event.target.value }))} /></Form.Group>
          <Form.Group className="history-description-field"><Form.Label htmlFor="timeline-description">Description</Form.Label><Form.Control id="timeline-description" as="textarea" rows="4" value={draft.description || ''} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} /></Form.Group>
        </div>
        <section className="history-npc-picker"><div><Form.Label htmlFor="timeline-npc-search">Characters at this event</Form.Label><Form.Control id="timeline-npc-search" type="search" placeholder="Search the NPC Library" value={npcSearch} onChange={event => setNpcSearch(event.target.value)} /></div><div className="history-npc-options">{filteredNpcs.map(npc => <Form.Check key={npc.id} id={`timeline-npc-${npc.id}`} checked={draft.npc_ids.includes(npc.id)} onChange={() => toggleNpc(npc.id)} label={<span>{npc.name}{npc.disabled && <em>Historical / disabled</em>}{npc.birth_year == null && <small>Birth date unknown</small>}</span>} />)}{!filteredNpcs.length && <p>No matching NPCs.</p>}</div></section>
        <Form.Check id="timeline-player-visible" label="Visible to players" checked={draft.is_player_visible} onChange={event => setDraft(current => ({ ...current, is_player_visible: event.target.checked }))} />
      </Modal.Body><Modal.Footer><Button variant="outline-secondary" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Event'}</Button></Modal.Footer></Form>
    </Modal>
    <Modal show={exportOpen} onHide={() => !exporting && setExportOpen(false)} centered className="history-export-modal">
      <Modal.Header closeButton><Modal.Title>Export Historical Timeline</Modal.Title></Modal.Header>
      <Modal.Body>
        {exportError && <Alert variant="danger">{exportError}</Alert>}
        <section className="history-export-choice">
          <div><span aria-hidden="true">MD</span><div><h3>Markdown</h3><p>A portable text chronicle with dates, descriptions, characters, and ages.</p></div></div>
          <Button variant="outline-primary" disabled={!!exporting} onClick={() => downloadTimeline('markdown')}>{exporting === 'markdown' ? 'Preparing…' : 'Download Markdown'}</Button>
        </section>
        <section className="history-export-choice">
          <div><span aria-hidden="true">JSON</span><div><h3>Timeline JSON</h3><p>A lossless backup designed to recreate this timeline in another campaign.</p></div></div>
          <Button variant="outline-primary" disabled={!!exporting} onClick={() => downloadTimeline('json')}>{exporting === 'json' ? 'Preparing…' : 'Download JSON'}</Button>
        </section>
        <section className="history-export-choice history-export-pdf">
          <div><span aria-hidden="true">PDF</span><div><h3>Print-ready PDF</h3><p>Portrait follows a vertical spine; Landscape follows a horizontal rail.</p></div></div>
          <fieldset><legend>Page orientation</legend><div className="history-export-orientation">
            {['portrait', 'landscape'].map(value => <Form.Check key={value} type="radio" id={`timeline-export-${value}`} name="timeline-export-orientation" label={value[0].toUpperCase() + value.slice(1)} checked={exportOrientation === value} onChange={() => setExportOrientation(value)} />)}
          </div></fieldset>
          <Button disabled={!!exporting} onClick={() => downloadTimeline('pdf')}>{exporting === 'pdf' ? 'Preparing…' : 'Download PDF'}</Button>
        </section>
      </Modal.Body>
      <Modal.Footer><Button variant="outline-secondary" disabled={!!exporting} onClick={() => setExportOpen(false)}>Close</Button></Modal.Footer>
    </Modal>
    <Modal show={importOpen} onHide={() => !importing && setImportOpen(false)} size="lg" centered className="history-import-modal">
      <Modal.Header closeButton><Modal.Title>Import Historical Timeline</Modal.Title></Modal.Header>
      <Modal.Body>
        {importError && <Alert variant="danger">{importError}</Alert>}
        <div className="history-import-intro"><span aria-hidden="true">⇧</span><div><h3>Add events without replacing history</h3><p>Choose a Kachhapa JSON backup or a Markdown chronicle. You will preview every change before anything is saved.</p></div></div>
        <Form.Group className="history-import-file"><Form.Label htmlFor="timeline-import-file">Timeline file</Form.Label><Form.Control id="timeline-import-file" type="file" accept=".json,.md,.markdown,application/json,text/markdown" onChange={event => { setImportFile(event.target.files?.[0] || null); setImportPreview(null); setImportError(''); }} /><Form.Text>Maximum 2 MB and 1,000 events. Imports are private unless the source explicitly marks an event player-visible.</Form.Text></Form.Group>
        {importPreview && <section className="history-import-preview" aria-label="Timeline import preview">
          <div className="history-import-summary"><span><strong>{importPreview.summary.detected}</strong> detected</span><span className="is-ready"><strong>{importPreview.summary.ready}</strong> ready</span><span><strong>{importPreview.summary.duplicates}</strong> duplicates</span><span className={importPreview.summary.invalid ? 'is-warning' : ''}><strong>{importPreview.summary.invalid}</strong> invalid</span></div>
          {!!importPreview.events?.length && <div className="history-import-list"><h4>Ready to import</h4>{importPreview.events.map(item => <article key={item.index}><div><strong>{item.name}</strong><span>{item.date_label}</span></div>{item.warnings?.map(warning => <small key={warning}>{warning}</small>)}</article>)}</div>}
          {!!importPreview.duplicates?.length && <details><summary>{importPreview.duplicates.length} duplicate {importPreview.duplicates.length === 1 ? 'event' : 'events'} will be skipped</summary>{importPreview.duplicates.map(item => <p key={item.index}>{item.name} · {item.date_label}</p>)}</details>}
          {!!importPreview.invalid?.length && <details open><summary>{importPreview.invalid.length} invalid {importPreview.invalid.length === 1 ? 'event needs' : 'events need'} attention</summary>{importPreview.invalid.map(item => <p key={item.index}><strong>{item.name}</strong>: {item.reason}</p>)}</details>}
        </section>}
      </Modal.Body>
      <Modal.Footer><Button variant="outline-secondary" disabled={!!importing} onClick={() => setImportOpen(false)}>Cancel</Button><Button variant="outline-primary" disabled={!importFile || !!importing} onClick={() => uploadTimeline(false)}>{importing === 'preview' ? 'Reading…' : importPreview ? 'Refresh Preview' : 'Preview Import'}</Button><Button disabled={!importPreview?.summary?.ready || !!importing} onClick={() => uploadTimeline(true)}>{importing === 'commit' ? 'Importing…' : `Import ${importPreview?.summary?.ready || 0} ${importPreview?.summary?.ready === 1 ? 'Event' : 'Events'}`}</Button></Modal.Footer>
    </Modal>
  </main>;
}
