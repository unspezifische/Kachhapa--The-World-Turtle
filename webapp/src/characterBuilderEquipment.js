const normalizedKey = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_|_$/g, '');

const findKey = (object, names) => {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return undefined;
  const accepted = new Set(names.map(normalizedKey));
  const entry = Object.entries(object).find(([key]) => accepted.has(normalizedKey(key)));
  return entry?.[1];
};

const pluralizeItem = (name, quantity) => {
  if (quantity === 1 || !name) return name;
  if (/\b(arrows|bolts|clothes|armor|supplies|tools|weapons|javelins|handaxes)$/i.test(name)) return name;
  return `${name}${name.endsWith('s') ? '' : 's'}`;
};

export const equipmentChoiceLabel = (choice) => {
  if (choice === null || choice === undefined) return '';
  if (typeof choice === 'string' || typeof choice === 'number') return String(choice);
  if (Array.isArray(choice)) return choice.map(equipmentChoiceLabel).filter(Boolean).join(' and ');

  const quantity = Number(choice.quantity ?? choice.count ?? 1);
  const reference = choice.equipment || choice.of || choice.item || choice.reference;
  const referenceName = typeof reference === 'string'
    ? reference
    : reference?.name || reference?.item_name || reference?.index;
  if (referenceName) {
    return quantity > 1 ? `${quantity} ${pluralizeItem(referenceName, quantity)}` : referenceName;
  }

  const nestedChoice = choice.choice || choice.options || choice.items;
  if (nestedChoice) return equipmentChoiceLabel(nestedChoice);
  return choice.name || choice.label || choice.description || choice.desc || '';
};

const optionArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value.options)) return value.options;
  if (Array.isArray(value.from)) return value.from;
  if (Array.isArray(value.from?.options)) return value.from.options;
  if (Array.isArray(value.from?.items)) return value.from.items;
  return Object.keys(value).every((key) => /^\d+$/.test(key)) ? Object.values(value) : [];
};

const rawEquipmentOptions = (classDetails) => {
  const equipmentBlock = findKey(classDetails, ['starter_equipment', 'starting_equipment']);
  const nestedOptions = findKey(equipmentBlock, ['options', 'choices', 'starting_equipment_options']);
  const topLevelOptions = findKey(classDetails, ['starting_equipment_options', 'starter_equipment_options']);
  return optionArray(nestedOptions || topLevelOptions || equipmentBlock);
};

export const normalizeStartingEquipment = (classDetails) => rawEquipmentOptions(classDetails)
  .map((rawOption, index) => {
    if (typeof rawOption === 'string') {
      return {
        id: `equipment-${index}`,
        description: rawOption,
        choices: [rawOption],
        requiresSelection: false,
      };
    }

    const choiceSource = findKey(rawOption, ['choices', 'options', 'from', 'items']);
    const choices = optionArray(choiceSource)
      .map(equipmentChoiceLabel)
      .filter(Boolean);
    const description = rawOption.description || rawOption.desc || rawOption.label ||
      (choices.length === 1 ? choices[0] : `Choose starting equipment ${index + 1}`);
    const explicitSelection = rawOption.requires_selection ?? rawOption.requiresSelection;
    const chooseCount = Number(rawOption.choose ?? 0);

    return {
      id: rawOption.id || `equipment-${index}`,
      description,
      choices,
      requiresSelection: explicitSelection === undefined
        ? chooseCount > 0 || choices.length > 1
        : Boolean(explicitSelection),
    };
  })
  .filter((option) => option.choices.length > 0 || option.description);

export const backgroundEquipment = (backgroundDetails) => {
  const equipment = findKey(backgroundDetails, ['equipment', 'starting_equipment', 'starter_equipment']);
  if (!equipment) return [];
  const values = Array.isArray(equipment)
    ? equipment
    : (typeof equipment === 'object' ? Object.values(equipment) : [equipment]);
  return values.map(equipmentChoiceLabel).filter(Boolean);
};

export const selectedEquipmentList = (options, selections, fixedBackgroundEquipment = []) => [
  ...options.flatMap((option, index) => (
    option.requiresSelection
      ? [selections[index]]
      : option.choices
  )),
  ...fixedBackgroundEquipment,
].filter(Boolean);

