import {
  ABILITIES,
  POINT_COSTS,
  STANDARD_ARRAY,
  emptyScores,
  pointBuyOptions,
  pointBuyRemaining,
  rollAbilityScore,
  standardArrayOptions,
} from './characterBuilderAbilities';

export { ABILITIES, POINT_COSTS, STANDARD_ARRAY, emptyScores, pointBuyOptions, pointBuyRemaining, rollAbilityScore, standardArrayOptions };

export const ALIGNMENTS = [
  'lawful good', 'neutral good', 'chaotic good',
  'lawful neutral', 'neutral', 'chaotic neutral',
  'lawful evil', 'neutral evil', 'chaotic evil',
];

export const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
export const CREATURE_TYPES = [
  'aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey',
  'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead',
];

export const SAVING_THROWS = [
  ['Strength', 'strength'], ['Dexterity', 'dexterity'], ['Constitution', 'constitution'],
  ['Intelligence', 'intelligence'], ['Wisdom', 'wisdom'], ['Charisma', 'charisma'],
];

export const SKILLS = [
  ['Acrobatics', 'dexterity'], ['Animal Handling', 'wisdom'], ['Arcana', 'intelligence'],
  ['Athletics', 'strength'], ['Deception', 'charisma'], ['History', 'intelligence'],
  ['Insight', 'wisdom'], ['Intimidation', 'charisma'], ['Investigation', 'intelligence'],
  ['Medicine', 'wisdom'], ['Nature', 'intelligence'], ['Perception', 'wisdom'],
  ['Performance', 'charisma'], ['Persuasion', 'charisma'], ['Religion', 'intelligence'],
  ['Sleight of Hand', 'dexterity'], ['Stealth', 'dexterity'], ['Survival', 'wisdom'],
];

const signed = value => `${value >= 0 ? '+' : ''}${value}`;
export const abilityModifier = score => Math.floor((Number(score || 10) - 10) / 2);

export function challengeNumber(value) {
  const match = String(value ?? '').trim().match(/^(\d+)(?:\/(\d+))?/);
  if (!match) return 0;
  return Number(match[1]) / Number(match[2] || 1);
}

export function proficiencyBonus(challenge) {
  const cr = challengeNumber(challenge);
  return Math.max(2, Math.min(9, 2 + Math.floor(Math.max(0, cr - 1) / 4)));
}

export function parseProficiencies(value, catalog, scores = null, challenge = null) {
  const known = new Map(catalog.map(([name, ability]) => [name.toLocaleLowerCase(), { name, ability }]));
  const selected = [];
  const custom = [];
  String(value || '').split(',').map(part => part.trim()).filter(Boolean).forEach(part => {
    const match = part.match(/^(.*?)(?:\s+([+-]\d+))?$/);
    const item = known.get((match?.[1] || part).trim().toLocaleLowerCase());
    if (!item) custom.push(part);
    else {
      const stored = match?.[2] == null ? null : Number(match[2]);
      const calculated = scores ? abilityModifier(scores[item.ability]) + proficiencyBonus(challenge) : null;
      selected.push({ ...item, override: stored == null || stored === calculated ? null : stored });
    }
  });
  return { selected, custom };
}

export function serializeProficiencies(selected, custom, scores, challenge) {
  const proficiency = proficiencyBonus(challenge);
  const known = selected.map(item => {
    const calculated = abilityModifier(scores[item.ability]) + proficiency;
    return `${item.name} ${signed(item.override == null ? calculated : Number(item.override))}`;
  });
  return [...known, ...custom].join(', ');
}

export function normalizeTag(value, catalog = []) {
  const clean = String(value || '').trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  const known = catalog.find(item => item.toLocaleLowerCase() === clean.toLocaleLowerCase());
  return known || clean.toLocaleLowerCase().replace(/(^|[\s'-])\p{L}/gu, character => character.toLocaleUpperCase());
}

export function normalizeTags(values, catalog = []) {
  const seen = new Set();
  return values.map(value => normalizeTag(value, catalog)).filter(value => {
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseLanguages(value, catalog = []) {
  return normalizeTags(String(value || '').split(',').map(item => item.trim()), catalog);
}

export function passivePerception(wisdom) {
  return 10 + abilityModifier(wisdom);
}

export function speciesDefaults(details, wisdom = 10) {
  const darkvision = Number(details?.darkvision);
  const senses = [Number.isFinite(darkvision) && darkvision > 0 ? `darkvision ${darkvision} ft.` : null,
    `passive Perception ${passivePerception(wisdom)}`].filter(Boolean).join(', ');
  const sizes = Array.isArray(details?.size) ? details.size : [];
  const sizeNames = { T: 'Tiny', S: 'Small', M: 'Medium', L: 'Large', H: 'Huge', G: 'Gargantuan' };
  const size = sizeNames[sizes[0]] || (typeof details?.size === 'string' ? sizeNames[details.size] || details.size : '');
  const speedValue = typeof details?.speed === 'number' ? details.speed : Number(details?.speed?.walk);
  const languages = [];
  (details?.languageProficiencies || []).forEach(group => Object.entries(group || {}).forEach(([key, enabled]) => {
    if (enabled === true && !['any', 'anyStandard', 'choose', 'other'].includes(key)) languages.push(normalizeTag(key));
  }));
  const rawCreatureType = details?.creatureTypes ?? details?.creatureType ?? details?.creature_type
    ?? details?.['Creature Type'] ?? details?.type;
  const creatureTypeValue = Array.isArray(rawCreatureType) ? rawCreatureType[0]
    : typeof rawCreatureType === 'object' ? rawCreatureType?.type : rawCreatureType;
  const normalizedCreatureType = String(creatureTypeValue || '').trim().toLocaleLowerCase();
  const creatureType = CREATURE_TYPES.includes(normalizedCreatureType) ? normalizedCreatureType : 'humanoid';
  return { senses, size, speed: Number.isFinite(speedValue) ? speedValue : '', languages: normalizeTags(languages), creatureType };
}

export function abilityDraftsFromNpc(npc, selectedMethod = 'manual') {
  const current = Object.fromEntries(ABILITIES.map(ability => [ability, npc?.[ability] ?? '']));
  const pointCandidate = Object.fromEntries(ABILITIES.map(ability => [ability, Number(current[ability])]));
  const validPointCandidate = ABILITIES.every(ability => pointCandidate[ability] >= 8 && pointCandidate[ability] <= 15) && pointBuyRemaining(pointCandidate) >= 0;
  return {
    manual: { ...current },
    standard: [...Object.values(current)].map(Number).sort((a, b) => a - b).join(',') === [...STANDARD_ARRAY].sort((a, b) => a - b).join(',')
      ? { ...current } : Object.fromEntries(ABILITIES.map((ability, index) => [ability, STANDARD_ARRAY[index]])),
    point: selectedMethod === 'point' && validPointCandidate
      ? pointCandidate : Object.fromEntries(ABILITIES.map(ability => [ability, 8])),
    roll: { ...current },
  };
}
