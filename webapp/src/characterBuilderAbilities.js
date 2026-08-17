export const ABILITIES = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
];

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const POINT_COSTS = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

export const emptyScores = (value = '') => Object.fromEntries(
  ABILITIES.map((ability) => [ability, value])
);

export const initialAbilityDrafts = () => ({
  dice: emptyScores(''),
  standard: emptyScores(''),
  point: emptyScores(8),
});

export const pointBuyRemaining = (scores) => 27 - ABILITIES.reduce(
  (total, ability) => total + (POINT_COSTS[Number(scores[ability])] ?? 0),
  0
);

export const pointBuyOptions = (scores, ability) => {
  const currentCost = POINT_COSTS[Number(scores[ability])] ?? 0;
  const available = pointBuyRemaining(scores) + currentCost;
  return Object.keys(POINT_COSTS)
    .map(Number)
    .filter((score) => POINT_COSTS[score] <= available);
};

export const standardArrayOptions = (scores, ability) => {
  const current = Number(scores[ability]);
  const usedElsewhere = new Set(
    ABILITIES
      .filter((name) => name !== ability && scores[name] !== '')
      .map((name) => Number(scores[name]))
  );
  return STANDARD_ARRAY.filter((score) => score === current || !usedElsewhere.has(score));
};

export const abilityDraftIsComplete = (method, scores) => {
  if (!['dice', 'standard', 'point'].includes(method)) return false;
  const values = ABILITIES.map((ability) => Number(scores[ability]));
  if (values.some((score) => !Number.isInteger(score))) return false;
  if (method === 'dice') return values.every((score) => score >= 3 && score <= 18);
  if (method === 'standard') {
    return [...values].sort((a, b) => a - b).join(',') ===
      [...STANDARD_ARRAY].sort((a, b) => a - b).join(',');
  }
  return values.every((score) => score >= 8 && score <= 15) && pointBuyRemaining(scores) >= 0;
};

export const rollAbilityScore = (random = Math.random) => {
  const rolls = Array.from({ length: 4 }, () => Math.floor(random() * 6) + 1);
  rolls.sort((a, b) => a - b);
  return rolls.slice(1).reduce((sum, roll) => sum + roll, 0);
};
