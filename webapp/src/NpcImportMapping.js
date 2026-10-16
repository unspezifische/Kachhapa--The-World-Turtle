import React, { useEffect, useState } from 'react';
import { Form } from 'react-bootstrap';
import axios from 'axios';
export default function NpcImportMapping({ headers, value, onChange, index }) {
  const [search, setSearch] = useState(''), [options, setOptions] = useState([]);
  useEffect(() => {
    if (!search.trim()) { setOptions([]); return; }
    let active = true;
    const timer = setTimeout(() => axios.get('/api/npcs', { headers, params: { search, limit: 20, sort: 'name' } }).then(({data}) => { if (active) setOptions(Array.isArray(data) ? data : data.items); }).catch(() => { if (active) setOptions([]); }), 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, headers]);
  return <div className="npc-inline-actions"><Form.Control aria-label={`Find NPC for schedule ${index + 1}`} placeholder="Find an NPC by name…" value={search} onChange={event => setSearch(event.target.value)} /><Form.Select aria-label={`Map NPC ${index + 1}`} value={value || ''} onChange={event => onChange(Number(event.target.value) || undefined)}><option value="">Use the schedule’s module identity</option>{value && !options.some(npc => npc.id === value) && <option value={value}>Selected campaign NPC #{value}</option>}{options.map(npc => <option key={npc.id} value={npc.id}>{npc.name} · {npc.source} · #{npc.id}</option>)}</Form.Select></div>;
}
