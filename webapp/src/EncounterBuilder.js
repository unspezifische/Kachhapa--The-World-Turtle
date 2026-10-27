import NpcIdentity from './NpcIdentity';
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Alert, Badge, Button, Form, Modal, Spinner, Table } from 'react-bootstrap';
import './EncounterBuilder.css';

const XP_BY_CR = {'0':10,'1/8':25,'1/4':50,'1/2':100,'1':200,'2':450,'3':700,'4':1100,'5':1800,'6':2300,'7':2900,'8':3900,'9':5000,'10':5900,'11':7200,'12':8400,'13':10000,'14':11500,'15':13000,'16':15000,'17':18000,'18':20000,'19':22000,'20':25000,'21':33000,'22':41000,'23':50000,'24':62000,'25':75000,'26':90000,'27':105000,'28':120000,'29':135000,'30':155000};
const blank = () => ({ name:'', notes:'', environment:'', source:'Campaign', participants:[] });
const emptyFilters = { source:'', type:'', size:'', alignment:'', environment:'', defense:'', weakness:'', cr:'' };

const defenseText = record => [record.vulnerabilities && `Weak: ${record.vulnerabilities}`, record.resistances && `Resist: ${record.resistances}`, record.immunities && `Immune: ${record.immunities}`].filter(Boolean).join(' · ');
const numericValue = value => {
  const text = String(value ?? '').trim();
  if (text.includes('/')) {
    const [numerator, denominator] = text.split('/').map(Number);
    return denominator ? numerator / denominator : Number.POSITIVE_INFINITY;
  }
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
};
const sortValue = (record, key) => {
  if (key === 'type_size') return `${record.creature_type || ''} ${record.size || ''}`;
  if (key === 'defenses') return defenseText(record);
  if (['challenge', 'ac', 'hp'].includes(key)) return numericValue(record[key]);
  return String(record[key] || '');
};
const SORT_COLUMNS = [
  ['name', 'Name'], ['type_size', 'Type / Size'], ['alignment', 'Alignment'],
  ['environment', 'Environment'], ['challenge', 'CR'], ['ac', 'AC'], ['hp', 'HP'], ['defenses', 'Defenses'],
];

const participantXP = participant => (XP_BY_CR[String(participant.challenge)] || 0) * Number(participant.quantity || 1);
const equivalentCR = xp => Object.entries(XP_BY_CR).reduce((closest, entry) => Math.abs(entry[1] - xp) < Math.abs(closest[1] - xp) ? entry : closest, ['0', 10])[0];

export default function EncounterBuilder({ api, headers }) {
  const { snapshot, command, busy, error } = api;
  const templates = snapshot?.document?.templates || [];
  const [draft, setDraft] = useState(blank);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const [filterOptions, setFilterOptions] = useState({});
  const [creatures, setCreatures] = useState([]);
  const [npcs, setNpcs] = useState([]);
  const [sourceTab, setSourceTab] = useState('creatures');
  const [presets, setPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [sort, setSort] = useState({key:'name', direction:'asc'});
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      axios.get('/api/creatures/filters', { headers }),
      axios.get('/api/encounter-presets', { headers }),
    ]).then(([optionResponse, presetResponse]) => {
      if (active) {
        const availablePresets = presetResponse.data || [];
        setFilterOptions(optionResponse.data || {});
        setPresets(availablePresets);
        setSelectedPresetId(current => current || String(availablePresets[0]?.id || ''));
      }
    }).catch(() => { if (active) setLoadError('Some catalog filters or system encounter tables could not be loaded. Saved encounters are still available.'); });
    return () => { active = false; };
  }, [headers]);

  const search = async () => {
    setLoadError('');
    try {
      if (sourceTab === 'npcs') {
        const response = await axios.get('/api/npcs', { headers });
        const needle = query.toLowerCase();
        setNpcs((response.data || []).filter(npc => npc.combat_enabled !== false).filter(npc => !needle || `${npc.name} ${npc.creature_type} ${npc.traits}`.toLowerCase().includes(needle)));
      } else {
        const response = await axios.get('/api/creatures', { headers, params:{ q:query, ...filters, limit:200 } });
        setCreatures(response.data || []);
      }
    } catch (requestError) { setLoadError(requestError.response?.data?.message || 'The creature catalog could not be searched.'); }
  };

  useEffect(() => { search(); /* Catalog refresh follows source/filter changes. */ }, [sourceTab, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const editTemplate = template => setDraft({ ...blank(), ...template, participants:(template.participants || []).map(item => ({ disposition:'Hostile', initiative_group:'individual', ...item })) });
  const add = record => setDraft(current => {
    const sourceId = record.id;
    const existing = current.participants.findIndex(item => item.source === sourceTab && item.source_id === sourceId);
    if (existing >= 0) return {...current, participants:current.participants.map((item,index) => index === existing ? {...item,quantity:Number(item.quantity || 1)+1} : item)};
    return {...current,participants:[...current.participants,{
      name:record.name, source:sourceTab, source_id:sourceId, quantity:1, hp:record.hp, ac:record.ac,
      dexterity:record.dexterity, challenge:record.challenge, disposition:sourceTab === 'npcs' ? 'Neutral' : 'Hostile', initiative_group:'individual'
    }]};
  });
  const updateParticipant = (index, patch) => setDraft(current => ({...current,participants:current.participants.map((item,itemIndex) => itemIndex === index ? {...item,...patch} : item)}));
  const save = async event => {
    event.preventDefault();
    const ok = await command('template', draft);
    if (ok) { setNotice(`${draft.name} saved to the encounter library.`); setDraft(blank()); }
  };
  const rollPreset = async preset => {
    setLoadError('');
    try {
      const response = await axios.post('/api/encounter-presets/roll', {preset_id:preset.id}, {headers});
      setDraft({...blank(),...response.data,source:response.data.source || 'System'});
      setNotice(`Rolled a result from ${preset.name}. Review it before saving.`);
    } catch (requestError) { setLoadError(requestError.response?.data?.message || 'That random encounter could not be rolled.'); }
  };

  const openDetails = async record => {
    setDetailError('');
    setDetail({ ...record, isPreview:true });
    if (sourceTab === 'npcs') return;
    setDetailLoading(true);
    try {
      const response = await axios.get(`/api/creatures/${record.id}`, {headers});
      setDetail(response.data);
    } catch (requestError) {
      setDetailError(requestError.response?.data?.message || 'Creature details could not be loaded.');
    } finally { setDetailLoading(false); }
  };

  const balance = useMemo(() => draft.participants.reduce((total, participant) => {
    const amount = participantXP(participant);
    if (participant.disposition === 'Hostile') return total + amount;
    if (participant.disposition === 'Friendly') return total - amount;
    return total;
  }, 0), [draft.participants]);
  const results = useMemo(() => {
    const rows = [...(sourceTab === 'creatures' ? creatures : npcs)];
    const multiplier = sort.direction === 'asc' ? 1 : -1;
    return rows.sort((left, right) => {
      const leftValue = sortValue(left, sort.key);
      const rightValue = sortValue(right, sort.key);
      if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * multiplier;
      return String(leftValue).localeCompare(String(rightValue), undefined, {numeric:true, sensitivity:'base'}) * multiplier;
    });
  }, [creatures, npcs, sort, sourceTab]);
  const selectedPreset = presets.find(preset => String(preset.id) === selectedPresetId) || null;
  const changeSort = key => setSort(current => current.key === key ? {...current,direction:current.direction === 'asc' ? 'desc' : 'asc'} : {key,direction:'asc'});
  const sortHeader = ([key, label]) => <th key={key}><button type="button" className="encounter-sort-button" aria-label={`Sort by ${label}${sort.key === key ? `, ${sort.direction === 'asc' ? 'ascending' : 'descending'}` : ''}`} onClick={() => changeSort(key)}>{label}<span aria-hidden="true">{sort.key === key ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ' ↕'}</span></button></th>;
  const option = (key, label) => <Form.Select aria-label={label} value={filters[key]} onChange={event => setFilters(current => ({...current,[key]:event.target.value}))}><option value="">All {label.toLowerCase()}</option>{(filterOptions[key === 'cr' ? 'challenge_ratings' : `${key}s`] || []).map(value => <option key={value}>{value}</option>)}</Form.Select>;

  if (!snapshot) return <section className="encounter-builder-workspace"><p role="status">Loading encounter library…</p></section>;
  return <section className="encounter-builder-workspace" aria-label="Encounter Builder">
    <header className="encounter-builder-hero"><div><span>PREP WORKBENCH</span><h2>Encounter Builder</h2><p>Build reusable opposition from creature stat blocks and named campaign NPCs. Nothing here starts combat.</p></div><Button variant="outline-secondary" onClick={() => { setDraft(blank()); setNotice(''); }}>New Encounter</Button></header>
    {(error || loadError) && <Alert variant="danger" role="alert">{error || loadError}</Alert>}
    {notice && <Alert variant="success" dismissible onClose={() => setNotice('')}>{notice}</Alert>}
    <div className="encounter-builder-grid">
      <aside className="encounter-saved-panel">
        <h3>Built encounters <Badge bg="secondary">{templates.length}</Badge></h3>
        <p>Campaign encounters can be staged from Session Manager.</p>
        <div className="encounter-saved-list">{templates.map(template => <button type="button" key={template.id} className={draft.id === template.id ? 'is-active' : ''} onClick={() => editTemplate(template)}><strong>{template.name}</strong><small>{template.participants.reduce((sum,item) => sum + Number(item.quantity || 1),0)} combatants · {template.environment || template.source || 'Campaign'}</small></button>)}{!templates.length && <p className="encounter-empty">No built encounters yet.</p>}</div>
        <div className="encounter-preset-library"><strong>Random encounter table</strong><Form.Select aria-label="Random encounter table" value={selectedPresetId} onChange={event => setSelectedPresetId(event.target.value)}><option value="">Choose a table…</option>{presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name} · {preset.source}{preset.min_level ? ` · levels ${preset.min_level}–${preset.max_level}` : ''}</option>)}</Form.Select><Button size="sm" variant="outline-secondary" disabled={!selectedPreset} onClick={() => rollPreset(selectedPreset)}>Roll selected table</Button><small>{presets.length} system and installed-module tables available. Type while the menu is open to jump to a name.</small></div>
      </aside>

      <main className="encounter-catalog-panel">
        <div className="encounter-panel-heading"><div><span>1 · FIND COMBATANTS</span><h3>Creature &amp; NPC catalog</h3></div><div className="encounter-source-switch"><Button variant={sourceTab === 'creatures' ? 'primary' : 'outline-secondary'} onClick={() => setSourceTab('creatures')}>Creatures</Button><Button variant={sourceTab === 'npcs' ? 'primary' : 'outline-secondary'} onClick={() => setSourceTab('npcs')}>Named NPCs</Button></div></div>
        <div className="encounter-search-row"><Form.Control type="search" aria-label="Search encounter catalog" placeholder={sourceTab === 'creatures' ? 'Search creatures by name…' : 'Search named NPCs…'} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') search(); }} /><Button onClick={search}>Search</Button></div>
        {sourceTab === 'creatures' && <div className="encounter-filter-grid">{option('source','Source')}{option('type','Creature type')}{option('size','Size')}{option('alignment','Alignment')}{option('environment','Environment')}{option('cr','CR')}{option('weakness','Weakness')}<Form.Control aria-label="Specific defense" placeholder="Defense: fire, poison…" value={filters.defense} onChange={event => setFilters(current => ({...current,defense:event.target.value}))}/><Button variant="outline-secondary" onClick={() => setFilters(emptyFilters)}>Clear filters</Button></div>}
        <div className="dmtools-table-shell encounter-results"><Table hover className="dmtools-table"><thead><tr>{SORT_COLUMNS.map(sortHeader)}<th><span className="visually-hidden">Encounter actions</span></th></tr></thead><tbody>{results.map(record => <tr className="encounter-result-row" key={`${sourceTab}-${record.id}`} onClick={event => { if (!event.target.closest('button')) openDetails(record); }}><td><button type="button" className="encounter-entry-button" onClick={() => openDetails(record)}><strong>{record.name}</strong><small>{record.source}</small></button></td><td>{record.creature_type || '—'} / {record.size || '—'}</td><td>{record.alignment || '—'}</td><td>{record.environment || '—'}</td><td>{record.challenge || '—'}</td><td>{record.ac || '—'}</td><td>{record.hp || '—'}</td><td>{defenseText(record) || '—'}</td><td><Button size="sm" onClick={event => { event.stopPropagation(); add(record); }}>Add</Button></td></tr>)}</tbody></Table></div>
      </main>

      <form className="encounter-roster-panel" onSubmit={save}>
        <div className="encounter-panel-heading"><div><span>2 · ASSEMBLE</span><h3>Encounter roster</h3></div><strong className={balance > 0 ? 'encounter-hostile-xp' : ''}>Approx. CR {equivalentCR(Math.max(0,balance))} · {Math.max(0,balance).toLocaleString()} net hostile XP</strong></div>
        <div className="encounter-identity"><Form.Group><Form.Label>Encounter name</Form.Label><Form.Control aria-label="Encounter name" required value={draft.name} onChange={event => setDraft(current => ({...current,name:event.target.value}))}/></Form.Group><Form.Group><Form.Label>Environment / context</Form.Label><Form.Control aria-label="Encounter environment" value={draft.environment || ''} onChange={event => setDraft(current => ({...current,environment:event.target.value}))}/></Form.Group></div>
        <Form.Group><Form.Label>DM notes</Form.Label><Form.Control as="textarea" rows={2} value={draft.notes || ''} onChange={event => setDraft(current => ({...current,notes:event.target.value}))}/></Form.Group>
        <div className="encounter-roster-list">{draft.participants.map((participant,index) => <article key={`${participant.source}-${participant.source_id}-${index}`}><div><strong>{participant.quantity} × {participant.name}</strong>{participant.source === 'npcs' && <NpcIdentity npcId={participant.source_id} name={participant.name} headers={headers} />}<small>CR {participant.challenge || '—'} · {participantXP(participant).toLocaleString()} XP</small></div><Form.Control aria-label={`Quantity for ${participant.name}`} type="number" min="1" max="100" value={participant.quantity} onChange={event => updateParticipant(index,{quantity:Number(event.target.value)})}/><Form.Select aria-label={`Disposition for ${participant.name}`} value={participant.disposition} onChange={event => updateParticipant(index,{disposition:event.target.value})}><option>Hostile</option><option>Neutral</option><option>Friendly</option></Form.Select><Form.Select aria-label={`Initiative grouping for ${participant.name}`} value={participant.initiative_group} onChange={event => updateParticipant(index,{initiative_group:event.target.value})}><option value="individual">Roll each separately</option><option value="same">One roll for this creature group</option><option value="A">Initiative group A</option><option value="B">Initiative group B</option><option value="C">Initiative group C</option></Form.Select><Button variant="link" className="encounter-remove" onClick={() => setDraft(current => ({...current,participants:current.participants.filter((_,itemIndex) => itemIndex !== index)}))}>Remove</Button></article>)}{!draft.participants.length && <div className="encounter-order-empty"><strong>No combatants selected</strong><span>Search the catalog and add creatures or named NPCs.</span></div>}</div>
        <div className="encounter-save-bar"><span>Friendly CR offsets hostile CR; neutral participants are shown but excluded from the balance.</span><Button type="submit" disabled={busy || !draft.participants.length || !draft.name}>{busy ? 'Saving…' : draft.id ? 'Update Encounter' : 'Save Encounter'}</Button></div>
      </form>
    </div>
    <Modal show={Boolean(detail)} onHide={() => { setDetail(null); setDetailError(''); }} size="lg" centered scrollable className="encounter-creature-modal">
      <Modal.Header closeButton><Modal.Title>{detail?.name || 'Creature details'}{detail?.source && <Badge bg="secondary" className="ms-2">{detail.source}</Badge>}</Modal.Title></Modal.Header>
      <Modal.Body>
        {detailLoading && <div className="encounter-detail-loading" role="status"><Spinner size="sm"/> Loading complete stat block…</div>}
        {detailError && <Alert variant="danger">{detailError}</Alert>}
        {detail && <>
          <div className="encounter-detail-facts"><span><strong>Type</strong>{detail.creature_type || detail.npc_template?.creature_type || '—'}</span><span><strong>Size</strong>{detail.size || detail.npc_template?.size || '—'}</span><span><strong>Alignment</strong>{detail.alignment || detail.npc_template?.alignment || '—'}</span><span><strong>CR</strong>{detail.challenge || '—'}</span><span><strong>AC</strong>{detail.ac || '—'}</span><span><strong>HP</strong>{detail.hp || '—'}</span></div>
          <section className="encounter-detail-lore"><h4>Lore</h4><p>{detail.fluff_text || detail.description || (detailLoading ? 'Loading lore…' : 'No descriptive lore is available for this entry.')}</p></section>
          {(detail.npc_template?.traits || detail.traits) && <section><h4>Traits</h4><p className="encounter-detail-copy">{detail.npc_template?.traits || detail.traits}</p></section>}
          {(detail.npc_template?.actions || detail.actions) && <section><h4>Actions</h4><p className="encounter-detail-copy">{detail.npc_template?.actions || detail.actions}</p></section>}
        </>}
      </Modal.Body>
      <Modal.Footer><Button variant="outline-secondary" onClick={() => setDetail(null)}>Close</Button>{detail && <Button onClick={() => { add(detail); setDetail(null); }}>Add to encounter</Button>}</Modal.Footer>
    </Modal>
  </section>;
}
