import NpcIdentity from './NpcIdentity';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Button, Form, Alert, InputGroup } from 'react-bootstrap';
import { Autocomplete, Chip, TextField } from '@mui/material';
import axios from 'axios';
import { NPC_BIRTH_FIELDS, NPC_FIELDS, newNpcDraft, mergeGeneration, occupationUsesClass, routineForOccupation } from './npcDraft';
import {
  ABILITIES, ALIGNMENTS, CREATURE_TYPES, POINT_COSTS, SAVING_THROWS, SIZES, SKILLS,
  abilityDraftsFromNpc, abilityModifier, normalizeTags, parseLanguages, parseProficiencies,
  pointBuyOptions, pointBuyRemaining, proficiencyBonus, rollAbilityScore,
  serializeProficiencies, speciesDefaults, standardArrayOptions,
} from './npcEditorRules';
import NpcScheduleEditor from './NpcScheduleEditor';
import NpcImageFramer from './NpcImageFramer';
import './NpcWorkflow.css';

const labels = {
  creature_subtype: 'Race / Species', creature_type: 'Creature Type', ac: 'Armor Class', hp: 'Hit Points',
  saving_throws: 'Saving Throws', challenge: 'Challenge Rating', occupation: 'Occupation', character_class: 'Class',
};
const label = key => labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const steps = ['Identity', 'Abilities', 'Combat', 'Character', 'Schedule', 'Review'];
const EMPTY_OPTIONS = { ancestries: [], species: [], occupations: [], classes: [], genders: [], alignments: ALIGNMENTS, sizes: SIZES, creature_types: CREATURE_TYPES, skills: SKILLS.map(([name]) => name), saving_throws: SAVING_THROWS.map(([name]) => name), languages: [] };
const titleCase = value => String(value || '').replace(/(^|[\s-])\w/g, character => character.toUpperCase());
const withCurrentChoice = (choices, current) => current
  ? [current, ...choices.filter(value => value.toLocaleLowerCase() !== String(current).toLocaleLowerCase())]
  : choices;
const EMPTY_DOMAINS = { occupations: [], roles: [], social_positions: [], combat_profile: null };
const LEGACY_COMBAT_KEYS = ['size', 'creature_type', 'creature_subtype', 'alignment', 'ac', 'hp', 'speed', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma', 'saving_throws', 'skills', 'immunities', 'resistance', 'senses', 'languages', 'challenge', 'traits', 'actions'];
const occupationLabel = value => titleCase(String(value || '').replace(/_/g, ' '));

const derivedSeason = (catalog, monthIndex, day) => {
  if (monthIndex === '' || monthIndex === null || monthIndex === undefined) return '';
  const index = Number(monthIndex);
  const holiday = (catalog.holidays || []).find(item => item.month_index === index && Number(item.day) === Number(day));
  if (holiday?.season) return holiday.season;
  return (catalog.seasons || []).find(item => (item.months || []).includes(index))?.name || '';
};

function FieldShell({ fieldKey, locks, setLocks, busy, onReroll, children }) {
  const locked = locks.includes(fieldKey);
  return <Form.Group className="npc-edit-field">
    <Form.Label htmlFor={`npc-${fieldKey}`}>{label(fieldKey)}</Form.Label>
    <InputGroup>{children}<Button className="npc-lock-button" variant="outline-secondary"
      title={locked ? `Unlock ${label(fieldKey)} for random changes` : `Lock ${label(fieldKey)} against random changes`}
      aria-label={`${locked ? 'Unlock' : 'Lock'} ${label(fieldKey)} for random changes`} aria-pressed={locked}
      onClick={() => setLocks(current => locked ? current.filter(value => value !== fieldKey) : [...current, fieldKey])}>{locked ? 'Locked' : 'Open'}</Button></InputGroup>
    {onReroll && <div className="npc-field-actions"><Button variant="link" size="sm" disabled={busy} aria-label={`Re-roll ${label(fieldKey)}`} onClick={onReroll}>Re-roll</Button></div>}
  </Form.Group>;
}

function ProficiencyEditor({ title, catalog, value, scores, challenge, onChange }) {
  const names = catalog.map(([name]) => name);
  const calculated = item => abilityModifier(scores[item.ability]) + proficiencyBonus(challenge);
  const updateSelected = selectedNames => {
    const retained = new Map(value.selected.map(item => [item.name, item]));
    onChange({ ...value, selected: selectedNames.map(name => {
      const definition = catalog.find(([candidate]) => candidate === name);
      return retained.get(name) || { name, ability: definition[1], override: null };
    }) });
  };
  return <section className="npc-proficiency-editor" aria-label={title}>
    <Autocomplete multiple disableCloseOnSelect options={names} value={value.selected.map(item => item.name)} onChange={(event, next) => updateSelected(next)}
      renderTags={(selected, getTagProps) => selected.map((name, index) => { const tagProps = getTagProps({ index }); delete tagProps.key; return <Chip key={name} label={name} size="small" {...tagProps} />; })}
      renderInput={params => <TextField {...params} label={title} size="small" helperText="Choose proficiencies; bonuses update with abilities and challenge rating." />} />
    {!!value.selected.length && <div className="npc-proficiency-bonuses">{value.selected.map(item => <label key={item.name}>
      <span>{item.name} <small>{title === 'Skills' ? titleCase(item.ability) : 'save'}</small></span>
      <input aria-label={`${item.name} bonus override`} type="number" value={item.override ?? ''}
        placeholder={`${calculated(item) >= 0 ? '+' : ''}${calculated(item)}`}
        onChange={event => onChange({ ...value, selected: value.selected.map(current => current.name === item.name ? { ...current, override: event.target.value === '' ? null : Number(event.target.value) } : current) })} />
    </label>)}</div>}
    {!!value.custom.length && <div className="npc-legacy-tags"><small>Preserved custom entries</small>{value.custom.map(entry => <Chip key={entry} label={entry} size="small" onDelete={() => onChange({ ...value, custom: value.custom.filter(item => item !== entry) })} />)}</div>}
  </section>;
}

export default function NpcCreator({ show, onClose, headers, initial = null, onSaved, onPlace = () => {} }) {
  const [draft, setDraft] = useState(newNpcDraft);
  const [schedule, setSchedule] = useState(null);
  const [locks, setLocks] = useState([]);
  const [step, setStep] = useState(0);
  const [options, setOptions] = useState(EMPTY_OPTIONS);
  const [catalog, setCatalog] = useState({ locations: [], settlements: [] });
  const [history, setHistory] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rerollField, setRerollField] = useState(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [creatureSearch, setCreatureSearch] = useState('');
  const [creatures, setCreatures] = useState([]);
  const [catalogCreature, setCatalogCreature] = useState(null);
  const [abilityMethod, setAbilityMethod] = useState('manual');
  const [abilityDrafts, setAbilityDrafts] = useState(() => abilityDraftsFromNpc(newNpcDraft()));
  const [skillState, setSkillState] = useState({ selected: [], custom: [] });
  const [saveState, setSaveState] = useState({ selected: [], custom: [] });
  const [languages, setLanguages] = useState([]);
  const [autoFields, setAutoFields] = useState(new Set(['size', 'speed', 'senses', 'languages', 'creature_type']));
  const [media, setMedia] = useState({ file: null, preview: '', crop: { x: .5, y: .5, zoom: 1, shape: 'circle', border: '#b32234' }, createToken: true, portraitAsset: null, tokenAsset: null });
  const [placementSettlementId, setPlacementSettlementId] = useState('');
  const [savedNpc, setSavedNpc] = useState(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [occupationDefinitions, setOccupationDefinitions] = useState([]);
  const [domains, setDomains] = useState(EMPTY_DOMAINS);
  const [domainDirty, setDomainDirty] = useState(false);
  const [domainsSaved, setDomainsSaved] = useState(false);
  const [customOccupation, setCustomOccupation] = useState('');
  const [pendingCombatMode, setPendingCombatMode] = useState('');
  const [combatModeChangeConfirmed, setCombatModeChangeConfirmed] = useState(false);

  useEffect(() => () => { if (media.preview) URL.revokeObjectURL(media.preview); }, [media.preview]);

  useEffect(() => {
    if (!show) return;
    const next = initial ? { ...newNpcDraft(), ...initial, ...initial.profile_metadata } : newNpcDraft();
    const method = initial?.profile_metadata?.ability_score_method || 'manual';
    setDraft(next); setSchedule(initial?.schedule || null); setLocks(initial ? [...NPC_FIELDS] : []); setStep(0);
    setHistory([]); setError(''); setWarnings(initial?.schedule_warnings || []); setDirty(false); setConfirmDiscard(false);
    setRerollField(null); setScheduleError(''); setCatalogCreature(null); setCreatureSearch(''); setCreatures([]);
    setAbilityMethod(method); setAbilityDrafts(abilityDraftsFromNpc(next, method));
    setSkillState(parseProficiencies(next.skills, SKILLS, next, next.challenge));
    setSaveState(parseProficiencies(next.saving_throws, SAVING_THROWS, next, next.challenge));
    setLanguages(parseLanguages(next.languages)); setAutoFields(new Set(initial ? ['creature_type'] : ['size', 'speed', 'senses', 'languages', 'creature_type']));
    setPlacementSettlementId(''); setSavedNpc(null); setProfileSaved(false);
    setOccupationDefinitions([]); setDomains(EMPTY_DOMAINS); setDomainDirty(false); setDomainsSaved(false);
    setCustomOccupation(''); setPendingCombatMode(''); setCombatModeChangeConfirmed(false);
    setMedia(current => ({ ...current, file: null, preview: '', portraitAsset: null, tokenAsset: null }));
    let active = true;
    const campaignId = headers?.campaignID || headers?.CampaignID;
    Promise.allSettled([
      axios.get('/api/npcs/generation-options', { headers }),
      axios.get('/api/npcs/schedule-locations', { headers }),
      campaignId ? axios.get(`/api/world-atlas/${campaignId}`, { headers }) : Promise.resolve({ data: { locations: [] } }),
      axios.get('/api/npcs/occupation-definitions', { headers }),
      initial?.id ? axios.get(`/api/npcs/${initial.id}/domains`, { headers }) : Promise.resolve({ data: null }),
    ]).then(([generation, locations, atlas, definitions, domainResponse]) => {
      if (!active) return;
      if (generation.status === 'fulfilled') {
        setOptions({ ...EMPTY_OPTIONS, ...generation.value.data });
        setLanguages(current => normalizeTags(current, generation.value.data.languages || []));
      }
      if (locations.status === 'fulfilled' || atlas.status === 'fulfilled') setCatalog({
        ...(locations.status === 'fulfilled' ? locations.value.data : { locations: [] }),
        settlements: atlas.status === 'fulfilled' ? atlas.value.data.locations || [] : [],
      });
      if (definitions.status === 'fulfilled' && Array.isArray(definitions.value.data)) setOccupationDefinitions(definitions.value.data);
      if (domainResponse.status === 'fulfilled' && domainResponse.value.data?.npc_id) {
        const loaded = domainResponse.value.data;
        const active = (loaded.combat_profiles || []).find(profile => profile.is_active) || null;
        setDomains({ occupations: loaded.occupations || [], roles: loaded.roles || [], social_positions: loaded.social_positions || [], combat_profile: active });
        const primary = (loaded.occupations || []).find(item => item.is_primary && item.status === 'current');
        if (primary?.occupation?.key) setDraft(current => ({ ...current, occupation: primary.occupation.key }));
      }
      if (generation.status === 'rejected' || locations.status === 'rejected') setError('Some campaign options could not be loaded. Existing values remain editable.');
    });
    return () => { active = false; };
  }, [show, initial, headers]);

  const markChanged = () => { setDirty(true); setProfileSaved(false); };
  const markDomainChanged = () => { setDirty(true); setDomainDirty(true); setDomainsSaved(false); };
  const change = (key, value, { derived = false } = {}) => {
    setDraft(current => {
      const next = { ...current, [key]: value };
      if (key === 'wisdom' && autoFields.has('senses')) {
        const passive = `passive Perception ${10 + abilityModifier(value)}`;
        next.senses = current.senses?.match(/darkvision[^,]*/i)?.[0] ? `${current.senses.match(/darkvision[^,]*/i)[0]}, ${passive}` : passive;
      }
      return next;
    });
    if (!derived) {
      setLocks(current => current.includes(key) ? current : [...current, key]);
      if (['size', 'speed', 'senses', 'languages', 'creature_type'].includes(key)) setAutoFields(current => new Set([...current].filter(item => item !== key)));
      markChanged();
    }
  };

  useEffect(() => {
    setDraft(current => {
      const skills = serializeProficiencies(skillState.selected, skillState.custom, current, current.challenge);
      const saving_throws = serializeProficiencies(saveState.selected, saveState.custom, current, current.challenge);
      return skills === current.skills && saving_throws === current.saving_throws ? current : { ...current, skills, saving_throws };
    });
  }, [skillState, saveState, draft.challenge, draft.strength, draft.dexterity, draft.constitution, draft.intelligence, draft.wisdom, draft.charisma]);

  const updateProficiency = (fieldKey, setter) => next => {
    setter(next); setLocks(current => current.includes(fieldKey) ? current : [...current, fieldKey]); markChanged();
  };

  const generate = async (target, random = false) => {
    setBusy(true); setError('');
    try {
      const { data } = await axios.post('/api/npcs/smart-fill', { values: draft, locked_fields: locks, target, seed: `${Date.now()}-${Math.random()}` }, { headers });
      setHistory(current => [...current.slice(-19), { draft, schedule, locks, warnings }]);
      const next = { ...mergeGeneration(draft, data.values, locks, target), generation: data.generation };
      setDraft(next); setAbilityDrafts(current => ({ ...current, [abilityMethod]: Object.fromEntries(ABILITIES.map(key => [key, next[key]])) }));
      setSkillState(parseProficiencies(next.skills, SKILLS, next, next.challenge)); setSaveState(parseProficiencies(next.saving_throws, SAVING_THROWS, next, next.challenge));
      setLanguages(parseLanguages(next.languages, options.languages)); setWarnings(data.warnings || []);
      if (target) setLocks(current => current.filter(key => key !== target));
      setRerollField(null); markChanged();
      if (random && locks.length) setWarnings(current => [...current, 'Kept fields were preserved. Unlock them to generate a completely new NPC.']);
    } catch (requestError) { setError(requestError.response?.data?.message || 'Could not generate this NPC.'); }
    finally { setBusy(false); }
  };

  const findCreatures = async () => {
    setBusy(true); setError('');
    try { const { data } = await axios.get('/api/creatures', { headers, params: { q: creatureSearch } }); setCreatures(data); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Could not search the creature catalog.'); }
    finally { setBusy(false); }
  };

  const applyCreatureTemplate = async creature => {
    setBusy(true); setError('');
    try {
      const { data } = await axios.get(`/api/creatures/${creature.id}`, { headers });
      const next = { ...draft, ...data.npc_template };
      setDraft(next); setAbilityDrafts(abilityDraftsFromNpc(next)); setAbilityMethod('manual');
      setSkillState(parseProficiencies(next.skills, SKILLS, next, next.challenge)); setSaveState(parseProficiencies(next.saving_throws, SAVING_THROWS, next, next.challenge));
      setLanguages(parseLanguages(next.languages, options.languages)); setAutoFields(new Set());
      setLocks(NPC_FIELDS.filter(key => key !== 'name')); setCatalogCreature(creature); setCreatures([]); markChanged();
      setDomains(current => ({ ...current, combat_profile: { ...(current.combat_profile || {}), authoring_mode: 'template', template_creature_id: creature.id, name: 'Primary', is_active: true } }));
      markDomainChanged();
    } catch (requestError) { setError(requestError.response?.data?.message || 'Could not load that creature.'); }
    finally { setBusy(false); }
  };

  const requestCombatMode = mode => {
    const current = domains.combat_profile?.authoring_mode;
    if (current && current !== mode) { setPendingCombatMode(mode); return; }
    setDomains(value => ({ ...value, combat_profile: { ...(value.combat_profile || {}), authoring_mode: mode, name: value.combat_profile?.name || 'Primary', is_active: true, class_progression: mode === 'class' && !value.combat_profile?.class_progression?.length ? [{ class_name: options.classes?.[0] || '', level: 1, subclass_name: '', choices: {} }] : value.combat_profile?.class_progression || [] } }));
    markDomainChanged();
  };
  const confirmCombatMode = () => {
    setDomains(value => {
      const retained = { ...(value.combat_profile || {}) };
      delete retained.id;
      return { ...value, combat_profile: { ...retained, authoring_mode: pendingCombatMode, name: retained.name || 'Primary', is_active: true, class_progression: pendingCombatMode === 'class' && !retained.class_progression?.length ? [{ class_name: options.classes?.[0] || '', level: 1, subclass_name: '', choices: {} }] : retained.class_progression || [] } };
    });
    setPendingCombatMode(''); setCombatModeChangeConfirmed(true); markDomainChanged();
  };
  const updateCombatProfile = patch => { setDomains(value => ({ ...value, combat_profile: { ...(value.combat_profile || {}), ...patch } })); markDomainChanged(); };
  const updateDomainRows = (key, rows) => { setDomains(value => ({ ...value, [key]: rows })); markDomainChanged(); };

  const createOccupationDefinition = async name => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;
    const existing = occupationDefinitions.find(item => item.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase() || item.key === trimmed.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '_'));
    if (existing) return existing;
    const response = await axios.post('/api/npcs/occupation-definitions', { name: trimmed }, { headers });
    setOccupationDefinitions(current => [...current, response.data].sort((a, b) => a.name.localeCompare(b.name)));
    return response.data;
  };

  const saveDomains = async npc => {
    if (!domainDirty || domainsSaved) return npc;
    let definitions = occupationDefinitions;
    let primary = definitions.find(item => item.key === draft.occupation);
    if (draft.occupation && !primary) {
      primary = await createOccupationDefinition(options.occupations.find(item => item.key === draft.occupation)?.label || occupationLabel(draft.occupation));
      definitions = primary ? [...definitions, primary] : definitions;
    }
    const extra = (domains.occupations || []).filter(item => {
      const definition = definitions.find(candidate => candidate.id === Number(item.occupation_id));
      return !primary || definition?.key !== primary.key;
    }).map(item => ({ occupation_id: Number(item.occupation_id), status: item.status || 'current', is_primary: false,
      started_at_world_date: item.started_at_world_date || null, ended_at_world_date: item.ended_at_world_date || null,
      notes: item.notes || '', provenance: item.provenance || {} }));
    const occupations = primary ? [{ occupation_id: primary.id, status: 'current', is_primary: true }, ...extra] : extra;
    let combatProfile = domains.combat_profile;
    if (combatProfile?.authoring_mode === 'custom') combatProfile = { ...combatProfile, custom_definition: Object.fromEntries(LEGACY_COMBAT_KEYS.map(key => [key, draft[key]])) };
    const response = await axios.put(`/api/npcs/${npc.id}/domains`, {
      expected_revision: npc.revision, occupations, roles: domains.roles || [], social_positions: domains.social_positions || [],
      ...(combatProfile ? { combat_profile: combatProfile, confirm_combat_mode_change: combatModeChangeConfirmed } : {}),
    }, { headers });
    setDomainsSaved(true); setDomains(current => ({ ...current, occupations: response.data.occupations || occupations,
      roles: response.data.roles || current.roles, social_positions: response.data.social_positions || current.social_positions,
      combat_profile: (response.data.combat_profiles || []).find(profile => profile.is_active) || current.combat_profile }));
    return { ...npc, revision: response.data.revision ?? npc.revision };
  };
  const generateScheduleFromDomains = async currentSchedule => {
    const npc = initial || savedNpc;
    if (npc?.id && !domainDirty) {
      setBusy(true); setError('');
      try {
        const response = await axios.post(`/api/npcs/${npc.id}/schedule-suggestion`, {}, { headers });
        setSchedule(response.data.schedule); markChanged();
      } catch (requestError) { setError(requestError.response?.data?.message || 'Could not build a schedule from the NPC domains.'); }
      finally { setBusy(false); }
      return;
    }
    setSchedule(routineForOccupation(currentSchedule, draft.occupation)); markChanged();
  };

  const updateSpecies = async value => {
    const species = String(value || '').trim();
    change('creature_subtype', species);
    if (!species) return;
    try {
      const system = headers?.System || 'D&D 5e';
      const { data } = await axios.get(`/api/races/${encodeURIComponent(species)}`, { headers: { ...headers, System: system }, params: { system } });
      const defaults = speciesDefaults(data, draft.wisdom);
      setDraft(current => ({ ...current,
        ...(autoFields.has('size') && defaults.size ? { size: defaults.size } : {}),
        ...(autoFields.has('speed') && defaults.speed !== '' ? { speed: defaults.speed } : {}),
        ...(autoFields.has('senses') ? { senses: defaults.senses } : {}),
        ...(autoFields.has('languages') && defaults.languages.length ? { languages: defaults.languages.join(', ') } : {}),
        ...(autoFields.has('creature_type') ? { creature_type: defaults.creatureType } : {}),
      }));
      if (autoFields.has('languages') && defaults.languages.length) setLanguages(defaults.languages);
    } catch {
      const defaults = speciesDefaults(null, draft.wisdom);
      if (autoFields.has('senses')) change('senses', defaults.senses, { derived: true });
      if (autoFields.has('creature_type')) change('creature_type', defaults.creatureType, { derived: true });
    }
  };

  const changeAbilityMethod = method => {
    const values = abilityDrafts[method];
    setAbilityMethod(method); setDraft(current => ({ ...current, ...values }));
    setLocks(current => [...new Set([...current, ...ABILITIES])]); markChanged();
  };
  const updateAbility = (ability, value) => {
    const nextValue = value === '' ? '' : Number(value);
    setAbilityDrafts(current => ({ ...current, [abilityMethod]: { ...current[abilityMethod], [ability]: nextValue } }));
    change(ability, nextValue);
  };
  const rollAbilities = () => {
    const scores = Object.fromEntries(ABILITIES.map(ability => [ability, rollAbilityScore()]));
    setAbilityDrafts(current => ({ ...current, roll: scores })); setDraft(current => ({ ...current, ...scores }));
    setLocks(current => [...new Set([...current, ...ABILITIES])]); markChanged();
  };

  const uploadMedia = async npc => {
    if (!media.file) return;
    let portrait = media.portraitAsset;
    let token = media.tokenAsset;
    if (!portrait) {
      const form = new FormData(); form.append('file', media.file);
      portrait = (await axios.post('/api/npc-media/assets', form, { headers })).data;
      setMedia(current => ({ ...current, portraitAsset: portrait }));
    }
    if (media.createToken && !token) {
      token = (await axios.post(`/api/npc-media/assets/${portrait.id}/crop`, media.crop, { headers })).data;
      setMedia(current => ({ ...current, tokenAsset: token }));
    }
    await axios.patch(`/api/npc-media/npcs/${npc.id}`, { portrait: portrait.id, ...(media.createToken ? { token: token.id } : {}) }, { headers });
  };

  const save = async place => {
    if (place && !placementSettlementId) { setError('Choose a settlement before placing this NPC on a map.'); return; }
    setBusy(true); setError('');
    let npc = savedNpc;
    try {
      if (!profileSaved || !npc) {
        const existing = initial || npc;
        const fields = Object.fromEntries(NPC_FIELDS.map(key => [key, draft[key] ?? '']));
        if (domains.combat_profile?.authoring_mode === 'none') {
          Object.assign(fields, { ac: fields.ac || '10', hp: fields.hp || '1', speed: fields.speed || 30,
            ...Object.fromEntries(ABILITIES.map(key => [key, fields[key] || 10])) });
        }
        const payload = { ...fields,
          ...Object.fromEntries(NPC_BIRTH_FIELDS.map(key => [key, draft[key] === '' ? null : draft[key]])), ability_score_method: abilityMethod,
          generation: draft.generation || {}, locked_fields: locks, schedule,
          ...(!initial && !savedNpc && catalogCreature ? { catalog_creature_id: catalogCreature.id } : {}),
          ...(existing ? { expected_revision: existing.revision } : {}) };
        const response = existing ? await axios.patch(`/api/npcs/${existing.id}`, payload, { headers }) : await axios.post('/api/npcs', payload, { headers });
        npc = response.data; setSavedNpc(npc); setProfileSaved(true);
      }
      npc = await saveDomains(npc); setSavedNpc(npc);
      try { await uploadMedia(npc); }
      catch (mediaError) {
        setError(`NPC saved, but the artwork could not be attached. ${mediaError.response?.data?.message || 'Retry to finish the media upload.'}`);
        return;
      }
      onSaved(npc); onClose();
      if (place) onPlace(npc, Number(placementSettlementId));
    } catch (requestError) { setError(requestError.response?.data?.message || 'Could not save the NPC. Your draft is still here.'); }
    finally { setBusy(false); }
  };

  const textField = key => <FieldShell key={key} fieldKey={key} locks={locks} setLocks={setLocks} busy={busy} onReroll={() => locks.includes(key) ? setRerollField(key) : generate(key)}>
    <Form.Control id={`npc-${key}`} as={['description', 'traits', 'actions'].includes(key) ? 'textarea' : 'input'} type={key === 'speed' ? 'number' : 'text'} value={draft[key] ?? ''} onChange={event => change(key, event.target.value)} />
  </FieldShell>;
  const selectField = (key, choices, format = titleCase, onChange = value => change(key, value), canReroll = true) => <FieldShell key={key} fieldKey={key} locks={locks} setLocks={setLocks} busy={busy} onReroll={canReroll ? () => locks.includes(key) ? setRerollField(key) : generate(key) : null}>
    <Form.Select id={`npc-${key}`} value={draft[key] ?? ''} onChange={event => onChange(event.target.value)}><option value="">Choose {label(key).toLowerCase()}</option>{choices.map(value => <option key={value} value={value}>{format(value)}</option>)}</Form.Select>
  </FieldShell>;

  const noCombat = domains.combat_profile?.authoring_mode === 'none';
  const requiredFields = ['name', 'size', 'creature_type', 'alignment', ...(noCombat ? [] : ['ac', 'hp', 'speed', ...ABILITIES]), 'description'];
  const incomplete = NPC_FIELDS.filter(key => requiredFields.includes(key) && (draft[key] === '' || draft[key] == null));
  const complete = [
    ['name', 'size', 'creature_type', 'alignment'].every(key => !!draft[key]),
    ABILITIES.every(key => Number(draft[key]) >= 1 && Number(draft[key]) <= 30),
    ['ac', 'hp', 'speed'].every(key => draft[key] !== '' && draft[key] != null),
    !!draft.description,
    !scheduleError,
    !incomplete.length && !scheduleError,
  ];
  const speciesOptions = useMemo(() => [...new Set([...(options.species || []), ...(options.ancestries || []).map(titleCase), ...(draft.creature_subtype ? [draft.creature_subtype] : [])])].sort((a, b) => a.localeCompare(b)), [options.species, options.ancestries, draft.creature_subtype]);
  const occupationOptions = useMemo(() => {
    const byKey = new Map((options.occupations || []).map(item => [item.key, item]));
    occupationDefinitions.forEach(item => byKey.set(item.key, { key: item.key, label: item.name, id: item.id }));
    if (draft.occupation && !byKey.has(draft.occupation)) byKey.set(draft.occupation, { key: draft.occupation, label: occupationLabel(draft.occupation) });
    return [...byKey.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [options.occupations, occupationDefinitions, draft.occupation]);
  const scoreValues = Object.fromEntries(ABILITIES.map(key => [key, draft[key]]));
  const domainIssues = [];
  if (domains.combat_profile?.authoring_mode === 'template' && !domains.combat_profile.template_creature_id) domainIssues.push('Choose a creature template on the Identity step.');
  if (domains.combat_profile?.authoring_mode === 'class') {
    const classes = domains.combat_profile.class_progression || [];
    if (!classes.length || classes.some(item => !item.class_name || Number(item.level) < 1 || Number(item.level) > 20)) domainIssues.push('Every class entry needs a class and a level from 1 to 20.');
    if (classes.reduce((sum, item) => sum + Number(item.level || 0), 0) > 20) domainIssues.push('Combined character class level cannot exceed 20.');
  }
  if ((domains.roles || []).some(role => !String(role.position_title || '').trim())) domainIssues.push('Every role needs a position or title.');
  if ((domains.social_positions || []).some(position => !String(position.name || '').trim())) domainIssues.push('Every social position needs a name.');

  return <Modal show={show} onHide={() => dirty ? setConfirmDiscard(true) : onClose()} size="xl" centered backdrop="static" className="npc-workflow-modal" backdropClassName="npc-workflow-backdrop">
    <Modal.Header closeButton><div><span className="npc-eyebrow">Campaign character dossier</span><Modal.Title>{initial ? 'Edit NPC' : 'Create NPC'}</Modal.Title></div></Modal.Header>
    <Modal.Body>
      {confirmDiscard ? <Alert variant="warning">Discard your unsaved changes?<div className="npc-inline-actions"><Button onClick={onClose}>Discard Draft</Button><Button variant="outline-secondary" onClick={() => setConfirmDiscard(false)}>Keep Editing</Button></div></Alert> : <>
        {(initial?.module_key || (initial?.source && initial.source !== 'Homebrew')) && <Alert variant="info">Saving creates a linked Homebrew override. The module original and this NPC’s ID are retained.</Alert>}
        <nav className="npc-step-nav" aria-label="NPC creator steps">{steps.map((title, index) => <Button key={title} variant="link" className={step === index ? 'is-active' : ''} aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)}><span>{index + 1}</span>{title}{complete[index] && <b aria-label="completed">✓</b>}</Button>)}</nav>
        <div className="npc-command-bar"><div><Button disabled={busy} onClick={() => generate()}>Smart Fill</Button><Button variant="outline-secondary" disabled={busy} onClick={() => generate(null, true)}>Generate Random NPC</Button><Button variant="link" disabled={!history.length || busy} onClick={() => { const previous = history[history.length - 1]; setDraft(previous.draft); setSchedule(previous.schedule); setLocks(previous.locks); setWarnings(previous.warnings); setHistory(history.slice(0, -1)); }}>Undo generation</Button></div><span><strong>{locks.length}</strong> protected fields</span></div>
        {rerollField && <Alert variant="warning" role="alertdialog" aria-label="Confirm locked field re-roll">Unlock and re-roll {label(rerollField)}? This replaces its current value.<div className="npc-inline-actions"><Button disabled={busy} onClick={() => generate(rerollField)}>Unlock &amp; Re-roll</Button><Button variant="outline-secondary" onClick={() => setRerollField(null)}>Keep Current Value</Button></div></Alert>}
        <div className="npc-creator-layout"><main className="npc-dossier-form">
          <header className="npc-step-heading"><span>Section {step + 1} of {steps.length}</span><h3>{steps[step]}</h3></header>
          {step === 0 && <>
            <section className="npc-catalog-search"><div><h4>Start from a creature</h4><p>Use a catalog stat block as an editable foundation, or build a resident from scratch.</p></div><InputGroup><Form.Control aria-label="Search monster catalog" placeholder="Goblin, guard, dragon…" value={creatureSearch} onChange={event => setCreatureSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); findCreatures(); } }} /><Button disabled={busy} onClick={findCreatures}>Search</Button></InputGroup>
              {catalogCreature && <Alert variant="info">Based on {catalogCreature.name} · {catalogCreature.source}</Alert>}
              {!!creatures.length && <div className="npc-catalog-results">{creatures.map(creature => <Button key={creature.id} variant="outline-secondary" onClick={() => applyCreatureTemplate(creature)}><strong>{creature.name}</strong><span>{creature.source} · CR {creature.challenge || '—'}</span></Button>)}</div>}
            </section>
            <div className="npc-field-grid">{textField('name')}{selectField('gender', withCurrentChoice(options.genders || [], draft.gender), titleCase)}
              <FieldShell fieldKey="creature_subtype" locks={locks} setLocks={setLocks} busy={busy} onReroll={() => locks.includes('creature_subtype') ? setRerollField('creature_subtype') : generate('creature_subtype')}>
                <div className="npc-species-combobox"><Autocomplete freeSolo options={speciesOptions} value={draft.creature_subtype || null} onChange={(event, value) => updateSpecies(value || '')} onInputChange={(event, value, reason) => { if (reason === 'clear') updateSpecies(''); }} renderInput={params => <TextField {...params} inputProps={{ ...params.inputProps, id: 'npc-creature_subtype' }} size="small" />} /></div>
              </FieldShell>
              {selectField('occupation', withCurrentChoice(occupationOptions.map(item => item.key), draft.occupation), value => occupationOptions.find(item => item.key === value)?.label || occupationLabel(value), value => { change('occupation', value); markDomainChanged(); })}
              {occupationUsesClass(draft.occupation) && selectField('character_class', withCurrentChoice(options.classes || [], draft.character_class), value => value, undefined, false)}
              {selectField('size', withCurrentChoice(options.sizes?.length ? options.sizes : SIZES, draft.size), value => value)}
              {selectField('creature_type', withCurrentChoice(options.creature_types?.length ? options.creature_types : CREATURE_TYPES, draft.creature_type), titleCase)}
              {selectField('alignment', withCurrentChoice(options.alignments?.length ? options.alignments : ALIGNMENTS, draft.alignment), titleCase)}
            </div>
            <section className="npc-domain-card" aria-labelledby="npc-occupation-history-heading">
              <div><span className="npc-eyebrow">Life beyond one label</span><h4 id="npc-occupation-history-heading">Additional &amp; former occupations</h4><p>The primary occupation drives the summary. Add concurrent work or preserve career history without changing combat abilities.</p></div>
              {(domains.occupations || []).map((item, index) => !item.is_primary && <div className="npc-domain-row" key={item.id || `occupation-${index}`}>
                <Form.Select aria-label={`Additional occupation ${index + 1}`} value={item.occupation_id || ''} onChange={event => updateDomainRows('occupations', domains.occupations.map((row, rowIndex) => rowIndex === index ? { ...row, occupation_id: Number(event.target.value) } : row))}>
                  <option value="">Choose occupation</option>{occupationDefinitions.map(definition => <option key={definition.id} value={definition.id}>{definition.name}</option>)}
                </Form.Select>
                <Form.Select aria-label={`Occupation status ${index + 1}`} value={item.status || 'current'} onChange={event => updateDomainRows('occupations', domains.occupations.map((row, rowIndex) => rowIndex === index ? { ...row, status: event.target.value } : row))}><option value="current">Current</option><option value="former">Former</option><option value="inactive">Inactive</option></Form.Select>
                <Form.Control aria-label={`Occupation notes ${index + 1}`} placeholder="History notes" value={item.notes || ''} onChange={event => updateDomainRows('occupations', domains.occupations.map((row, rowIndex) => rowIndex === index ? { ...row, notes: event.target.value } : row))} />
                <Button variant="outline-danger" aria-label={`Remove additional occupation ${index + 1}`} onClick={() => updateDomainRows('occupations', domains.occupations.filter((row, rowIndex) => rowIndex !== index))}>Remove</Button>
              </div>)}
              <div className="npc-inline-actions"><Button variant="outline-secondary" disabled={!occupationDefinitions.length} onClick={() => updateDomainRows('occupations', [...domains.occupations, { occupation_id: occupationDefinitions[0]?.id || '', status: 'former', is_primary: false, notes: '' }])}>Add occupation</Button><InputGroup className="npc-custom-occupation"><Form.Control aria-label="Custom occupation name" placeholder="Custom occupation" value={customOccupation} onChange={event => setCustomOccupation(event.target.value)} /><Button variant="outline-secondary" disabled={!customOccupation.trim() || busy} onClick={async () => { setBusy(true); setError(''); try { const created = await createOccupationDefinition(customOccupation); setCustomOccupation(''); if (created) { change('occupation', created.key); markDomainChanged(); } } catch (requestError) { setError(requestError.response?.data?.message || 'Could not create that occupation.'); } finally { setBusy(false); } }}>Create &amp; select</Button></InputGroup></div>
            </section>
            <section className="npc-birth-card" aria-labelledby="npc-birth-heading">
              <div><span className="npc-eyebrow">Historical timeline</span><h4 id="npc-birth-heading">Birth date</h4><p>Optional. Partial dates use the end of the selected season or month when calculating age.</p></div>
              <div className="npc-birth-grid">
                <Form.Group><Form.Label htmlFor="npc-birth-year">Year</Form.Label><Form.Control id="npc-birth-year" type="number" value={draft.birth_year ?? ''} onChange={event => change('birth_year', event.target.value)} /></Form.Group>
                <Form.Group><Form.Label htmlFor="npc-birth-season">Season</Form.Label><Form.Select id="npc-birth-season" value={draft.birth_season || ''} disabled={draft.birth_month_index !== '' && draft.birth_month_index !== null} onChange={event => change('birth_season', event.target.value)}><option value="">Choose season</option>{(catalog.seasons || []).map(season => <option key={season.name}>{season.name}</option>)}</Form.Select></Form.Group>
                <Form.Group><Form.Label htmlFor="npc-birth-month">Month</Form.Label><Form.Select id="npc-birth-month" value={draft.birth_month_index ?? ''} onChange={event => { const month = event.target.value === '' ? '' : Number(event.target.value); setDraft(current => ({ ...current, birth_month_index: month, birth_day: '', birth_season: month === '' ? current.birth_season : derivedSeason(catalog, month, null) })); markChanged(); }}><option value="">Season only</option>{(catalog.months || []).map((month, index) => <option key={month.name} value={index}>{month.name}</option>)}</Form.Select></Form.Group>
                <Form.Group><Form.Label htmlFor="npc-birth-day">Day</Form.Label><Form.Control id="npc-birth-day" type="number" min="1" disabled={draft.birth_month_index === '' || draft.birth_month_index === null} value={draft.birth_day ?? ''} onChange={event => { const day = event.target.value === '' ? '' : Number(event.target.value); setDraft(current => ({ ...current, birth_day: day, birth_season: derivedSeason(catalog, current.birth_month_index, day) })); markChanged(); }} /></Form.Group>
              </div>
              {(draft.birth_year || draft.birth_season || draft.birth_month_index !== '') && <Button variant="link" size="sm" onClick={() => { setDraft(current => ({ ...current, birth_year: '', birth_season: '', birth_month_index: '', birth_day: '' })); markChanged(); }}>Clear birth date</Button>}
            </section>
            <section className="npc-artwork-card"><div><span className="npc-eyebrow">Portrait &amp; token</span><h4>Give the table a face</h4><p>Upload once, then frame a separate map token without changing the portrait.</p></div>
              <Form.Label className="npc-upload-drop">Choose portrait image<Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files[0]; if (!file) return; if (media.preview) URL.revokeObjectURL(media.preview); setMedia(current => ({ ...current, file, preview: URL.createObjectURL(file), portraitAsset: null, tokenAsset: null })); markChanged(); }} /></Form.Label>
              {media.preview && <><NpcImageFramer crop={media.crop} onChange={crop => { setMedia(current => ({...current,crop})); markChanged(); }} renderImage={style => <img src={media.preview} alt="Token crop preview" style={style} draggable={false} />} /><Form.Check label="Create a map token from this portrait" checked={media.createToken} onChange={event => setMedia(current => ({ ...current, createToken: event.target.checked }))} /></>}
            </section>
          </>}
          {step === 1 && <><div className="npc-method-picker" role="group" aria-label="Ability score method">{[['manual', 'Manual'], ['standard', 'Standard Array'], ['point', 'Point Buy'], ['roll', '4d6 Roll']].map(([key, text]) => <Button key={key} variant={abilityMethod === key ? 'primary' : 'outline-secondary'} onClick={() => changeAbilityMethod(key)}>{text}</Button>)}</div>{abilityMethod === 'point' && <div className={`npc-point-budget ${pointBuyRemaining(abilityDrafts.point) < 0 ? 'is-invalid' : ''}`}><strong>{pointBuyRemaining(abilityDrafts.point)}</strong><span>points remaining</span></div>}{abilityMethod === 'roll' && <Button className="npc-roll-abilities" variant="outline-secondary" onClick={rollAbilities}>Roll all six scores</Button>}<div className="npc-ability-editor">{ABILITIES.map(ability => <Form.Group key={ability}><Form.Label htmlFor={`npc-${ability}`}>{label(ability)} <span>{abilityModifier(draft[ability]) >= 0 ? '+' : ''}{abilityModifier(draft[ability])}</span></Form.Label>{abilityMethod === 'standard' ? <Form.Select id={`npc-${ability}`} value={abilityDrafts.standard[ability]} onChange={event => updateAbility(ability, event.target.value)}><option value="">Choose</option>{standardArrayOptions(abilityDrafts.standard, ability).map(score => <option key={score}>{score}</option>)}</Form.Select> : abilityMethod === 'point' ? <Form.Select id={`npc-${ability}`} value={abilityDrafts.point[ability]} onChange={event => updateAbility(ability, event.target.value)}>{pointBuyOptions(abilityDrafts.point, ability).map(score => <option key={score} value={score}>{score} · {POINT_COSTS[score]} pts</option>)}</Form.Select> : <Form.Control id={`npc-${ability}`} type="number" min="1" max="30" value={draft[ability] ?? ''} onChange={event => updateAbility(ability, event.target.value)} />}</Form.Group>)}</div></>}
          {step === 2 && <>
            <section className="npc-domain-card npc-combat-profile" aria-labelledby="npc-combat-profile-heading"><div><span className="npc-eyebrow">Independent from occupation</span><h4 id="npc-combat-profile-heading">Combat profile</h4><p>Choose how this NPC’s mechanics are authored. Changing modes keeps the old profile as an alternate.</p></div>
              {!domains.combat_profile && initial && <Alert variant="info">This NPC is using its compatible legacy stat block. Choose a mode only when you want to normalize its combat source.</Alert>}
              <div className="npc-mode-picker" role="group" aria-label="Combat profile authoring mode">{[['template','NPC Template'],['class','Classes & Levels'],['custom','Custom Stat Block'],['none','No Combat Profile']].map(([mode, text]) => <Button key={mode} variant={domains.combat_profile?.authoring_mode === mode ? 'primary' : 'outline-secondary'} onClick={() => requestCombatMode(mode)}>{text}</Button>)}</div>
              {pendingCombatMode && <Alert variant="warning" role="alertdialog">Switch to {occupationLabel(pendingCombatMode)}? The current combat profile will remain available as an inactive alternate.<div className="npc-inline-actions"><Button onClick={confirmCombatMode}>Keep old &amp; switch</Button><Button variant="outline-secondary" onClick={() => setPendingCombatMode('')}>Cancel</Button></div></Alert>}
              {domains.combat_profile?.authoring_mode === 'template' && <div className="npc-source-summary"><strong>{catalogCreature?.name || domains.combat_profile.resolved?.source?.name || 'Choose a creature from the Identity catalog search'}</strong><span>Canonical template remains unchanged; campaign edits are stored as overrides.</span></div>}
              {domains.combat_profile?.authoring_mode === 'class' && <div className="npc-class-progressions">
                {(domains.combat_profile.class_progression || []).map((entry, index) => <div className="npc-domain-row npc-class-row" key={entry.id || `class-${index}`}><Form.Select aria-label={`Class ${index + 1}`} value={entry.class_name || ''} onChange={event => updateCombatProfile({ class_progression: domains.combat_profile.class_progression.map((row, rowIndex) => rowIndex === index ? { ...row, class_name: event.target.value } : row) })}><option value="">Choose class</option>{withCurrentChoice(options.classes || [], entry.class_name).map(name => <option key={name}>{name}</option>)}</Form.Select><Form.Control aria-label={`Level ${index + 1}`} type="number" min="1" max="20" value={entry.level || 1} onChange={event => updateCombatProfile({ class_progression: domains.combat_profile.class_progression.map((row, rowIndex) => rowIndex === index ? { ...row, level: Number(event.target.value) } : row) })} /><Form.Control aria-label={`Subclass ${index + 1}`} placeholder="Subclass (optional)" value={entry.subclass_name || ''} onChange={event => updateCombatProfile({ class_progression: domains.combat_profile.class_progression.map((row, rowIndex) => rowIndex === index ? { ...row, subclass_name: event.target.value } : row) })} /><Form.Control aria-label={`Class feats and choices ${index + 1}`} placeholder="Feats / choices, separated by commas" value={(entry.choices?.feats || []).join(', ')} onChange={event => updateCombatProfile({ class_progression: domains.combat_profile.class_progression.map((row, rowIndex) => rowIndex === index ? { ...row, choices: { ...(row.choices || {}), feats: event.target.value.split(',').map(value => value.trim()).filter(Boolean) } } : row) })} /><Button variant="outline-danger" onClick={() => updateCombatProfile({ class_progression: domains.combat_profile.class_progression.filter((row, rowIndex) => rowIndex !== index) })}>Remove</Button></div>)}
                <div className="npc-inline-actions"><Button variant="outline-secondary" onClick={() => updateCombatProfile({ class_progression: [...(domains.combat_profile.class_progression || []), { class_name: options.classes?.[0] || '', level: 1, subclass_name: '', choices: {} }] })}>Add class</Button><span>Character level: <strong>{(domains.combat_profile.class_progression || []).reduce((sum, item) => sum + Number(item.level || 0), 0)}</strong></span></div>
              </div>}
              {['class','custom'].includes(domains.combat_profile?.authoring_mode) && <div className="npc-spellcasting-config"><h5>Spellcasting configuration</h5><p>Optional and explicit. Caster level is never converted into character-class levels.</p><div className="npc-field-grid"><Form.Group><Form.Label htmlFor="npc-spellcasting-ability">Spellcasting ability</Form.Label><Form.Select id="npc-spellcasting-ability" value={domains.combat_profile.spellcasting?.ability || ''} onChange={event => updateCombatProfile({ spellcasting: { ...(domains.combat_profile.spellcasting || {}), ability: event.target.value } })}><option value="">None / not specified</option>{ABILITIES.map(ability => <option key={ability} value={ability}>{titleCase(ability)}</option>)}</Form.Select></Form.Group><Form.Group><Form.Label htmlFor="npc-caster-level">Explicit caster level</Form.Label><Form.Control id="npc-caster-level" type="number" min="1" max="30" value={domains.combat_profile.spellcasting?.caster_level || ''} onChange={event => updateCombatProfile({ spellcasting: { ...(domains.combat_profile.spellcasting || {}), caster_level: event.target.value === '' ? null : Number(event.target.value) } })} /></Form.Group></div></div>}
              {domains.combat_profile?.authoring_mode === 'none' && <p className="npc-source-summary">Identity, occupations, roles, schedules, artwork, and simulation remain available without combat mechanics.</p>}
            </section>
            {(!domains.combat_profile || domains.combat_profile.authoring_mode === 'custom') && <><div className="npc-field-grid">{textField('ac')}{textField('hp')}{textField('speed')}{textField('challenge')}</div><div className="npc-combat-columns"><ProficiencyEditor title="Skills" catalog={SKILLS} value={skillState} scores={scoreValues} challenge={draft.challenge} onChange={updateProficiency('skills', setSkillState)} /><ProficiencyEditor title="Saving Throws" catalog={SAVING_THROWS} value={saveState} scores={scoreValues} challenge={draft.challenge} onChange={updateProficiency('saving_throws', setSaveState)} /></div><Autocomplete multiple freeSolo options={options.languages || []} value={languages} onChange={(event, next) => { const normalized = normalizeTags(next, options.languages); setLanguages(normalized); change('languages', normalized.join(', ')); }} renderTags={(selected, getTagProps) => selected.map((name, index) => { const tagProps = getTagProps({ index }); delete tagProps.key; return <Chip key={name} label={name} size="small" {...tagProps} />; })} renderInput={params => <TextField {...params} label="Languages" size="small" helperText="Type to search, then press Enter to add a custom language." />} /><div className="npc-field-grid">{textField('senses')}{textField('immunities')}{textField('resistance')}{textField('actions')}</div></>}
          </>}
          {step === 3 && <div className="npc-character-fields">{textField('description')}{textField('traits')}
            <section className="npc-domain-card"><div><span className="npc-eyebrow">Specific responsibilities</span><h4>Roles &amp; organizations</h4><p>Roles may be paid work, civic responsibility, or leadership. They do not grant class levels.</p></div>{(domains.roles || []).map((role, index) => <div className="npc-domain-row npc-role-row" key={role.id || `role-${index}`}><Form.Control aria-label={`Role title ${index + 1}`} placeholder="Position / title" value={role.position_title || ''} onChange={event => updateDomainRows('roles', domains.roles.map((row, rowIndex) => rowIndex === index ? { ...row, position_title: event.target.value } : row))} /><Form.Select aria-label={`Role occupation ${index + 1}`} value={role.occupation_id || ''} onChange={event => updateDomainRows('roles', domains.roles.map((row, rowIndex) => rowIndex === index ? { ...row, occupation_id: Number(event.target.value) || null } : row))}><option value="">No occupation link</option>{occupationDefinitions.map(definition => <option key={definition.id} value={definition.id}>{definition.name}</option>)}</Form.Select><Form.Control aria-label={`Role organization ${index + 1}`} placeholder="Organization or employer (optional)" value={role.organization_name || ''} onChange={event => updateDomainRows('roles', domains.roles.map((row, rowIndex) => rowIndex === index ? { ...row, organization_name: event.target.value } : row))} /><Form.Select aria-label={`Role workplace ${index + 1}`} value={(catalog.locations || []).find(location => JSON.stringify(location.resolved) === JSON.stringify(role.workplace?.resolved))?.id || ''} onChange={event => { const location = catalog.locations.find(item => item.id === event.target.value); updateDomainRows('roles', domains.roles.map((row, rowIndex) => rowIndex === index ? { ...row, workplace_location_id: location?.resolved?.settlement_id || null, workplace: location ? { resolved: location.resolved, label: location.label, capabilities: location.capabilities || [] } : {} } : row)); }}><option value="">Flexible / no fixed workplace</option>{(catalog.locations || []).map(location => <option key={location.id} value={location.id}>{location.label}</option>)}</Form.Select><Form.Control aria-label={`Role priority ${index + 1}`} type="number" min="0" value={role.priority ?? 0} onChange={event => updateDomainRows('roles', domains.roles.map((row, rowIndex) => rowIndex === index ? { ...row, priority: Number(event.target.value) } : row))} /><Form.Control className="npc-role-responsibilities" aria-label={`Role responsibilities ${index + 1}`} placeholder="Responsibilities, separated by commas" value={(role.responsibilities || []).join(', ')} onChange={event => updateDomainRows('roles', domains.roles.map((row, rowIndex) => rowIndex === index ? { ...row, responsibilities: event.target.value.split(',').map(value => value.trim()).filter(Boolean) } : row))} /><Button variant="outline-danger" onClick={() => updateDomainRows('roles', domains.roles.filter((row, rowIndex) => rowIndex !== index))}>Remove</Button></div>)}<Button variant="outline-secondary" onClick={() => updateDomainRows('roles', [...domains.roles, { position_title: '', occupation_id: '', organization_name: '', responsibilities: [], workplace: {}, status: 'active', priority: 0 }])}>Add role</Button></section>
            <section className="npc-domain-card"><div><span className="npc-eyebrow">Standing &amp; authority</span><h4>Social positions</h4><p>Record status such as Noble, Guildmaster, or Religious Leader independently from occupation.</p></div>{(domains.social_positions || []).map((position, index) => <div className="npc-domain-row" key={position.id || `social-${index}`}><Form.Control aria-label={`Social position ${index + 1}`} placeholder="Position" value={position.name || ''} onChange={event => updateDomainRows('social_positions', domains.social_positions.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} /><Form.Control aria-label={`Social category ${index + 1}`} placeholder="Category (optional)" value={position.category || ''} onChange={event => updateDomainRows('social_positions', domains.social_positions.map((row, rowIndex) => rowIndex === index ? { ...row, category: event.target.value } : row))} /><Button variant="outline-danger" onClick={() => updateDomainRows('social_positions', domains.social_positions.filter((row, rowIndex) => rowIndex !== index))}>Remove</Button></div>)}<Button variant="outline-secondary" onClick={() => updateDomainRows('social_positions', [...domains.social_positions, { name: '', category: '', status: 'active', is_primary: false }])}>Add social position</Button></section>
          </div>}
          <div hidden={step !== 4}><NpcScheduleEditor onError={setScheduleError} value={schedule} onChange={value => { setSchedule(value); markChanged(); }} onGenerate={generateScheduleFromDomains} npc={initial || savedNpc} occupation={draft.occupation} locations={catalog.locations} clock={catalog} warnings={warnings.filter(warning => warning.includes('mapping'))} /></div>
          {step === 5 && <><section className="npc-review-card"><h4>Ready for the campaign</h4><p>{incomplete.length ? `Complete required fields: ${incomplete.map(label).join(', ')}` : 'Required character fields are complete.'}</p>{domainIssues.map(issue => <Alert variant="warning" key={issue}>{issue}</Alert>)}<dl>{[...NPC_FIELDS.filter(key => key !== 'character_class' || occupationUsesClass(draft.occupation)), ...NPC_BIRTH_FIELDS].map(key => <React.Fragment key={key}><dt>{label(key)}</dt><dd>{draft[key] === '' || draft[key] === null || draft[key] === undefined ? '—' : String(draft[key])}</dd></React.Fragment>)}</dl></section><section className="npc-map-handoff"><div><span className="npc-eyebrow">Optional next step</span><h4>Place this NPC on a settlement map</h4><p>Save the dossier, then click the exact position in Settlement Manager.</p></div><Form.Select aria-label="Settlement for map placement" value={placementSettlementId} onChange={event => setPlacementSettlementId(event.target.value)}><option value="">Choose a settlement</option>{catalog.settlements.map(settlement => <option key={settlement.id} value={settlement.id}>{settlement.name}</option>)}</Form.Select></section></>}
        </main><aside className="npc-live-card" aria-label="NPC card preview"><div className="npc-card-art">{media.preview ? <img src={media.preview} alt="Portrait preview" /> : (initial?.id || savedNpc?.id) ? <NpcIdentity npcId={initial?.id || savedNpc?.id} name={draft.name} headers={headers} portrait /> : <span>{(draft.name || 'NPC').slice(0, 1)}</span>}</div><span className="npc-eyebrow">Live dossier</span><h3>{draft.name || 'Unnamed NPC'}</h3><p className="npc-card-role">{draft.creature_subtype || 'Choose species'}{draft.occupation ? ` · ${titleCase(draft.occupation)}` : ''}{occupationUsesClass(draft.occupation) && draft.character_class ? ` · ${draft.character_class}` : ''}</p><p>{draft.size || '—'} {draft.creature_type || 'creature'} · {titleCase(draft.alignment) || '—'}</p><div className="npc-combat-strip"><span>AC <strong>{draft.ac || '—'}</strong></span><span>HP <strong>{draft.hp || '—'}</strong></span><span>SPD <strong>{draft.speed || '—'}</strong></span><span>CR <strong>{draft.challenge || '—'}</strong></span></div><div className="npc-ability-preview">{ABILITIES.map(key => <span key={key}><small>{key.slice(0, 3).toUpperCase()}</small><strong>{draft[key] || '—'}</strong><em>{draft[key] ? `${abilityModifier(draft[key]) >= 0 ? '+' : ''}${abilityModifier(draft[key])}` : '—'}</em></span>)}</div><p className="npc-card-description">{draft.description || 'Character notes and visual details will appear here as the dossier takes shape.'}</p><footer>{schedule ? `${schedule.rules?.length || 0} scheduled activities` : 'Schedule optional'}</footer></aside></div>
        {warnings.map((warning, index) => <Alert variant="warning" key={index}>{warning}</Alert>)}{scheduleError && <Alert variant="warning" role="alert">{scheduleError}</Alert>}{error && <Alert variant="danger" role="alert">{error}</Alert>}
      </>}
    </Modal.Body><Modal.Footer><Button variant="outline-secondary" onClick={() => dirty ? setConfirmDiscard(true) : onClose()}>Cancel</Button><Button variant="outline-secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>{step < steps.length - 1 ? <Button onClick={() => setStep(step + 1)}>Next</Button> : <><Button variant="outline-primary" disabled={busy || incomplete.length > 0 || domainIssues.length > 0 || !!scheduleError} onClick={() => save(false)}>{busy ? 'Saving…' : 'Save NPC'}</Button><Button disabled={busy || incomplete.length > 0 || domainIssues.length > 0 || !!scheduleError || !placementSettlementId} onClick={() => save(true)}>{busy ? 'Saving…' : 'Save & Place on Map'}</Button></>}</Modal.Footer>
  </Modal>;
}
