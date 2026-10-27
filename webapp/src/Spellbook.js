import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import './Spellbook.css';

const EMPTY_FILTERS = {
  classes: [], levels: [], schools: [], casting_times: [], sources: [],
  damage_types: [], conditions: [], saving_throws: [], spell_attacks: [],
};

const SCHOOL_MARKS = {
  Abjuration: 'Aegis', Conjuration: 'Gate', Divination: 'Eye', Enchantment: 'Charm',
  Evocation: 'Flame', Illusion: 'Veil', Necromancy: 'Skull', Transmutation: 'Change',
};

function levelName(level) {
  return Number(level) === 0 ? 'Cantrip' : `Level ${level}`;
}

function SelectFilter({ label, name, value, values, onChange, format = (item) => item }) {
  return (
    <label className="spell-filter">
      <span>{label}</span>
      <select aria-label={label} name={name} value={value} onChange={onChange}>
        <option value="">All {label.toLowerCase()}</option>
        {values.map((item) => <option key={item} value={item}>{format(item)}</option>)}
      </select>
    </label>
  );
}

function SpellDetail({ spell, onClose, onAdd, addStatus }) {
  if (!spell) return null;
  const isAdded = Boolean(spell.in_spellbook);
  const canAdd = Boolean(spell.eligibility?.eligible) && !isAdded && addStatus !== 'saving';
  const buttonLabel = isAdded
    ? 'Already in your spellbook'
    : spell.eligibility?.eligible
      ? addStatus === 'saving' ? 'Inscribing spell…' : 'Add to Spell Book'
      : spell.eligibility?.reason || 'This spell is unavailable to you';
  return (
    <div className="spell-detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <article className="spell-detail" role="dialog" aria-modal="true" aria-labelledby="spell-detail-title">
        <button className="spell-detail-close" onClick={onClose} aria-label="Close spell details"><CloseIcon /></button>
        <div className="spell-detail-sigil" aria-hidden="true">✦</div>
        <p className="spell-detail-kicker">{levelName(spell.level)} · {spell.school}</p>
        <h2 id="spell-detail-title">{spell.name}</h2>
        <p className="spell-detail-source">{spell.source}{spell.page ? ` · p. ${spell.page}` : ''}</p>
        <div className="spell-detail-add">
          <button type="button" onClick={() => onAdd(spell)} disabled={!canAdd}>{buttonLabel}</button>
          {spell.eligibility?.eligible && !isAdded && <span>{spell.eligibility.reason}</span>}
          {addStatus === 'error' && <span className="spell-detail-add-error" role="alert">The spell could not be added. Try again.</span>}
          {addStatus === 'added' && <span role="status">The spell is now prepared on your character sheet.</span>}
        </div>
        <dl className="spell-detail-facts">
          <div><dt>Casting time</dt><dd>{spell.casting_time}</dd></div>
          <div><dt>Range</dt><dd>{spell.range}</dd></div>
          <div><dt>Components</dt><dd>{spell.components.join(', ')}</dd></div>
          <div><dt>Duration</dt><dd>{spell.duration}</dd></div>
        </dl>
        <div className="spell-detail-tags">
          {spell.ritual && <span>Ritual</span>}
          {spell.concentration && <span>Concentration</span>}
          {spell.damage_types.map((item) => <span key={`damage-${item}`}>{item} damage</span>)}
          {spell.conditions.map((item) => <span key={`condition-${item}`}>{item}</span>)}
          {spell.saving_throws.map((item) => <span key={`save-${item}`}>{item} save</span>)}
        </div>
        <div className="spell-detail-copy">
          {spell.description.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
        {spell.classes.length > 0 && <p className="spell-detail-classes"><strong>Classes</strong> {spell.classes.join(' · ')}</p>}
      </article>
    </div>
  );
}

export default function Spellbook({ headers }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [query, setQuery] = useState({ q: '', class: '', level: '', school: '', casting_time: '', damage_type: '', condition: '', saving_throw: '', spell_attack: '', source: '', ritual: '', concentration: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [spells, setSpells] = useState([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('loading');
  const [addStatus, setAddStatus] = useState('idle');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery((current) => ({ ...current, q: search.trim() }));
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    const params = { page, page_size: 50 };
    Object.entries(query).forEach(([key, value]) => { if (value !== '') params[key] = value; });
    setStatus('loading');
    axios.get('/api/spell-catalog', { headers, params }).then((response) => {
      if (!active) return;
      setSpells(response.data.spells || []);
      setFilters({ ...EMPTY_FILTERS, ...(response.data.filters || {}) });
      setTotal(response.data.total || 0);
      setStatus('ready');
    }).catch((error) => {
      if (!active) return;
      console.error('Unable to load spell catalog:', error);
      setStatus('error');
    });
    return () => { active = false; };
  }, [headers, page, query]);

  const activeFilterCount = useMemo(() => Object.values(query).filter(Boolean).length, [query]);
  const pageCount = Math.max(1, Math.ceil(total / 50));
  const updateFilter = (event) => {
    const { name, value } = event.target;
    setQuery((current) => ({ ...current, [name]: value }));
    setPage(1);
  };
  const reset = () => {
    setSearch('');
    setQuery({ q: '', class: '', level: '', school: '', casting_time: '', damage_type: '', condition: '', saving_throw: '', spell_attack: '', source: '', ritual: '', concentration: '' });
    setPage(1);
  };
  const openSpell = (spell) => {
    setAddStatus('idle');
    setSelected(spell);
  };
  const addSpell = async (spell) => {
    if (!spell?.eligibility?.eligible || spell.in_spellbook) return;
    setAddStatus('saving');
    try {
      await axios.post(`/api/spellbook/spells/${spell.id}`, {}, { headers });
      const updated = { ...spell, in_spellbook: true };
      setSpells((current) => current.map((item) => item.id === spell.id ? updated : item));
      setSelected(updated);
      setAddStatus('added');
    } catch (error) {
      console.error('Unable to add spell to spellbook:', error);
      setAddStatus('error');
    }
  };

  return (
    <main className="spellbook-page">
      <header className="spellbook-hero">
        <div className="spellbook-title-mark"><AutoFixHighIcon /></div>
        <div>
          <p className="spellbook-eyebrow">The campaign arcanum</p>
          <h1>Spellbook</h1>
          <p>Search the collected formulae by tradition, discipline, and effect.</p>
        </div>
        <div className="spellbook-count"><strong>{total.toLocaleString()}</strong><span>matching spells</span></div>
      </header>

      <div className="spellbook-workspace">
        <aside className="spellbook-filters" aria-label="Spell filters">
          <div className="spellbook-filter-heading"><div><span>Refine</span><strong>The index</strong></div>{activeFilterCount > 0 && <button onClick={reset}><RestartAltIcon /> Reset</button>}</div>
          <SelectFilter label="Classes" name="class" value={query.class} values={filters.classes} onChange={updateFilter} />
          <SelectFilter label="Levels" name="level" value={query.level} values={filters.levels} onChange={updateFilter} format={levelName} />
          <SelectFilter label="Schools" name="school" value={query.school} values={filters.schools} onChange={updateFilter} />
          <SelectFilter label="Casting times" name="casting_time" value={query.casting_time} values={filters.casting_times} onChange={updateFilter} />
          <SelectFilter label="Damage types" name="damage_type" value={query.damage_type} values={filters.damage_types} onChange={updateFilter} />
          <SelectFilter label="Conditions" name="condition" value={query.condition} values={filters.conditions} onChange={updateFilter} />
          <SelectFilter label="Saving throws" name="saving_throw" value={query.saving_throw} values={filters.saving_throws} onChange={updateFilter} />
          <SelectFilter label="Attack types" name="spell_attack" value={query.spell_attack} values={filters.spell_attacks} onChange={updateFilter} format={(value) => value === 'R' ? 'Ranged' : value === 'M' ? 'Melee' : value} />
          <SelectFilter label="Sources" name="source" value={query.source} values={filters.sources} onChange={updateFilter} />
          <div className="spellbook-toggles">
            <label><input type="checkbox" checked={query.ritual === 'true'} onChange={(event) => updateFilter({ target: { name: 'ritual', value: event.target.checked ? 'true' : '' } })} /> Ritual</label>
            <label><input type="checkbox" checked={query.concentration === 'true'} onChange={(event) => updateFilter({ target: { name: 'concentration', value: event.target.checked ? 'true' : '' } })} /> Concentration</label>
          </div>
        </aside>

        <section className="spellbook-results">
          <label className="spellbook-search"><SearchIcon /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search spell names and descriptions…" aria-label="Search spells" /></label>
          {status === 'loading' && <div className="spellbook-state"><i />Consulting the arcanum…</div>}
          {status === 'error' && <div className="spellbook-state spellbook-error">The spell index could not be opened.</div>}
          {status === 'ready' && spells.length === 0 && <div className="spellbook-state">No spells answer those conditions.</div>}
          {status === 'ready' && spells.length > 0 && <div className="spellbook-grid">
            {spells.map((spell) => <button className="spell-card" key={spell.id} onClick={() => openSpell(spell)}>
              <span className="spell-card-level">{Number(spell.level) === 0 ? 'C' : spell.level}</span>
              <span className="spell-card-copy">
                <span className="spell-card-school">{SCHOOL_MARKS[spell.school] || spell.school} · {spell.source}</span>
                <strong>{spell.name}</strong>
                <span className="spell-card-meta">{spell.casting_time} · {spell.range}</span>
                <span className="spell-card-tags">
                  {spell.concentration && <em>Concentration</em>}{spell.ritual && <em>Ritual</em>}
                  {spell.damage_types.slice(0, 2).map((item) => <em key={item}>{item}</em>)}
                </span>
              </span>
              <span className="spell-card-chevron" aria-hidden="true">›</span>
            </button>)}
          </div>}
          {status === 'ready' && pageCount > 1 && <nav className="spellbook-pagination" aria-label="Spell pages">
            <button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <span>Page {page} of {pageCount}</span>
            <button disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
          </nav>}
        </section>
      </div>
      <SpellDetail spell={selected} onClose={() => setSelected(null)} onAdd={addSpell} addStatus={addStatus} />
    </main>
  );
}
