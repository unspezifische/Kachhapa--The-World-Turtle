import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import axios from 'axios';
const initial={event_type:'npc.damage.received',conditions:{},priority:40,probability:1,cooldown_ms:15000,enabled:true,interrupt:false,randomized:false};
export function VoiceRuleForm({ value, onSave, onDelete, onReset }) {
  const [draft,setDraft]=useState(value),[spells,setSpells]=useState([]),[search,setSearch]=useState(''),[error,setError]=useState('');
  useEffect(()=>setDraft(value),[value]);
  const change=(key,value)=>setDraft(current=>({...current,[key]:value}));
  const condition=(key,value)=>setDraft(current=>{const conditions={...current.conditions};if(value==='' || value==null)delete conditions[key];else conditions[key]=value;return {...current,conditions};});
  return <Form onSubmit={event=>{event.preventDefault();onSave(draft);}} className="npc-voice-rule">
    <Form.Label>When<Form.Select value={draft.event_type} onChange={event=>setDraft({...draft,event_type:event.target.value,conditions:{}})}><option value="npc.damage.received">Takes Damage</option><option value="npc.spell.cast">Casts Spell</option></Form.Select></Form.Label>
    {draft.event_type==='npc.damage.received'?<>
      <Form.Label>Minimum damage<Form.Control type="number" min="0" value={draft.conditions.minDamage??''} onChange={event=>condition('minDamage',event.target.value===''?'':Number(event.target.value))} /></Form.Label>
      <Form.Label>Damage type (any if blank)<Form.Control value={draft.conditions.damageType||''} onChange={event=>condition('damageType',event.target.value)} /></Form.Label>
      <Form.Label>Critical hit<Form.Select value={draft.conditions.critical==null?'':String(draft.conditions.critical)} onChange={event=>condition('critical',event.target.value===''?'':event.target.value==='true')}><option value="">Either</option><option value="true">Critical only</option><option value="false">Noncritical only</option></Form.Select></Form.Label>
    </>:<>
      <Form.Label>Spell<Form.Select value={draft.conditions.spellId||''} onChange={event=>condition('spellId',event.target.value)}><option value="">Any spell</option>{draft.conditions.spellId&&!spells.some(spell=>String(spell.id)===String(draft.conditions.spellId))&&<option value={draft.conditions.spellId}>Selected spell #{draft.conditions.spellId}</option>}{spells.map(spell=><option key={spell.id} value={spell.id}>{spell.name} · {spell.source}</option>)}</Form.Select></Form.Label>
      <Form.Label>Find a spell<Form.Control value={search} onChange={event=>setSearch(event.target.value)} /></Form.Label><Button type="button" variant="outline-secondary" onClick={async()=>{try{const data=await value.searchSpells(search);setSpells(Array.isArray(data)?data:data.items||data.spells||[]);setError('');}catch{setError('Could not search spells.');}}}>Search spells</Button>
      <Form.Label>Spell level (any if blank)<Form.Control type="number" min="0" max="9" value={draft.conditions.spellLevel??''} onChange={event=>condition('spellLevel',event.target.value===''?'':Number(event.target.value))} /></Form.Label>
    </>}
    <Form.Label>Priority<Form.Control type="number" min="0" value={draft.priority} onChange={event=>change('priority',Number(event.target.value))} /></Form.Label>
    <Form.Label>Chance (0–1)<Form.Control type="number" min="0" max="1" step="0.05" value={draft.probability} onChange={event=>change('probability',Number(event.target.value))} /></Form.Label>
    <Form.Label>Cooldown (seconds)<Form.Control type="number" min="0" step="0.1" value={draft.cooldown_ms/1000} onChange={event=>change('cooldown_ms',Math.round(Number(event.target.value)*1000))} /></Form.Label>
    <Form.Check label="Automatic rule enabled" checked={draft.enabled} onChange={event=>change('enabled',event.target.checked)} />
    <Form.Check label="May interrupt lower-priority automatic voices" checked={draft.interrupt} onChange={event=>change('interrupt',event.target.checked)} />
    <Form.Check label="Randomize between equally suitable recordings" checked={draft.randomized} onChange={event=>change('randomized',event.target.checked)} />
    {error&&<Alert variant="warning">{error}</Alert>}<Button type="submit">{value.id?'Save trigger':'Add trigger'}</Button>{onDelete&&<Button type="button" variant="outline-danger" onClick={onDelete}>Delete trigger</Button>}{onReset&&<Button type="button" variant="outline-secondary" onClick={onReset}>Reset trigger to module default</Button>}
  </Form>;
}
export default function NpcVoiceTriggerEditor({ line,npc,headers,onChanged }) {
  const [rules,setRules]=useState([]),[adding,setAdding]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const base=`/api/npc-media/npcs/${npc.id}/voices/${line.id}/triggers`;
  const load=useCallback(async()=>{const {data}=await axios.get(base,{headers});setRules(data.triggers || []);},[base,headers]);
  useEffect(()=>{load().catch(()=>setError('Could not load automatic triggers.'));},[load]);
  const run=async operation=>{setBusy(true);setError('');try{await operation();setAdding(false);await onChanged();if(line.module_default!==true)await load();}catch(err){setError(err.response?.data?.message||'Could not save trigger.');}finally{setBusy(false);}};
  const searchSpells=async search=>(await axios.get('/api/spell-catalog',{headers,params:{q:search,page_size:50}})).data;
  const save=(rule,id)=>{const {event_type,conditions,priority,probability,cooldown_ms,enabled,interrupt,randomized}=rule;return run(()=>id?axios.patch(base+'/'+id,{event_type,conditions,priority,probability,cooldown_ms,enabled,interrupt,randomized},{headers}):axios.post(base,{event_type,conditions,priority,probability,cooldown_ms,enabled,interrupt,randomized},{headers}));};
  return <details><summary>Automatic Triggers ({rules.length})</summary>{error&&<Alert variant="danger">{error}</Alert>}<fieldset disabled={busy}>{rules.map(rule=><VoiceRuleForm key={rule.id} value={{...rule,searchSpells}} onSave={draft=>save(draft,rule.id)} onDelete={()=>run(()=>axios.delete(base+'/'+rule.id,{headers}))} onReset={rule.inherited_from?()=>run(()=>axios.delete(base+'/'+rule.id+'?reset=1',{headers})):null} />)}{adding?<VoiceRuleForm value={{...initial,searchSpells}} onSave={draft=>save(draft)} />:<Button onClick={()=>setAdding(true)}>Add automatic trigger</Button>}</fieldset></details>;
}
