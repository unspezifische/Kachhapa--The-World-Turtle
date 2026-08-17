import {
  backgroundEquipment,
  equipmentChoiceLabel,
  normalizeStartingEquipment,
  selectedEquipmentList,
} from './characterBuilderEquipment';

describe('character-builder starting equipment', () => {
  test('reads the repository class JSON shape', () => {
    const options = normalizeStartingEquipment({
      starter_equipment: {
        options: [
          { description: 'Choose armor', choices: ['Chain mail', 'Leather armor'], requires_selection: true },
          { description: 'A spellbook', choices: ['Spellbook'], requires_selection: false },
        ],
      },
    });

    expect(options).toEqual([
      expect.objectContaining({ description: 'Choose armor', choices: ['Chain mail', 'Leather armor'], requiresSelection: true }),
      expect.objectContaining({ description: 'A spellbook', choices: ['Spellbook'], requiresSelection: false }),
    ]);
  });

  test('reads starting_equipment_options and formats reference choices', () => {
    const options = normalizeStartingEquipment({
      starting_equipment_options: [{
        desc: 'Choose ammunition',
        choose: 1,
        from: { options: [{ count: 20, of: { name: 'Arrow' } }, { count: 20, of: { name: 'Bolt' } }] },
      }],
    });

    expect(options[0]).toEqual(expect.objectContaining({
      description: 'Choose ammunition',
      choices: ['20 Arrows', '20 Bolts'],
      requiresSelection: true,
    }));
  });

  test('combines selected, fixed, and background equipment', () => {
    const options = normalizeStartingEquipment({ starter_equipment: { options: [
      { choices: ['Rapier', 'Shortsword'], requires_selection: true },
      { choices: ['Spellbook'], requires_selection: false },
    ] } });
    expect(selectedEquipmentList(options, { 0: 'Rapier' }, ['Common clothes'])).toEqual([
      'Rapier', 'Spellbook', 'Common clothes',
    ]);
    expect(backgroundEquipment({ Equipment: { 1: 'Common clothes', 2: '10 gp' } })).toEqual(['Common clothes', '10 gp']);
    expect(equipmentChoiceLabel({ quantity: 2, equipment: { name: 'Dagger' } })).toBe('2 Daggers');
  });
});
