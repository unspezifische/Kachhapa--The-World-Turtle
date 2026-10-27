import {
  SKILLS, SAVING_THROWS, abilityDraftsFromNpc, abilityModifier, challengeNumber, normalizeTags,
  parseProficiencies, proficiencyBonus, serializeProficiencies, speciesDefaults,
} from './npcEditorRules';

test('normalizes and de-duplicates language tags while preserving catalog spelling', () => {
  expect(normalizeTags([' common ', 'deep speech', 'COMMON', "thieves' cant"], ['Common', 'Deep Speech']))
    .toEqual(['Common', 'Deep Speech', "Thieves' Cant"]);
});

test('calculates proficiency from challenge and allows an explicit override', () => {
  expect(challengeNumber('1/4 (50 XP)')).toBe(.25);
  expect(proficiencyBonus('9')).toBe(4);
  expect(abilityModifier(14)).toBe(2);
  const parsed = parseProficiencies('Stealth +6, one artisan tool', SKILLS);
  expect(parsed.custom).toEqual(['one artisan tool']);
  expect(serializeProficiencies(parsed.selected, parsed.custom, { dexterity: 14 }, '1/4'))
    .toBe('Stealth +6, one artisan tool');
  expect(serializeProficiencies([{ name: 'Wisdom', ability: 'wisdom', override: null }], [], { wisdom: 12 }, '5', SAVING_THROWS))
    .toBe('Wisdom +4');
});

test('derives species senses, size, speed, languages, and creature type', () => {
  expect(speciesDefaults({ darkvision: 60, size: ['S'], speed: { walk: 25 }, languageProficiencies: [{ common: true, goblin: true }] }, 14))
    .toEqual({ senses: 'darkvision 60 ft., passive Perception 12', size: 'Small', speed: 25, languages: ['Common', 'Goblin'], creatureType: 'humanoid' });
  expect(speciesDefaults({ creatureTypes: ['Fey'] }).creatureType).toBe('fey');
});

test('restores a persisted point-buy draft without using it as every method draft', () => {
  const npc = {strength:15,dexterity:14,constitution:13,intelligence:12,wisdom:10,charisma:8};
  expect(abilityDraftsFromNpc(npc, 'point').point).toEqual(npc);
  expect(abilityDraftsFromNpc(npc, 'manual').point).toEqual({strength:8,dexterity:8,constitution:8,intelligence:8,wisdom:8,charisma:8});
});
