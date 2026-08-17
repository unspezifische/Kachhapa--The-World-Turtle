import {
  abilityDraftIsComplete,
  initialAbilityDrafts,
  pointBuyOptions,
  pointBuyRemaining,
  rollAbilityScore,
  standardArrayOptions,
} from './characterBuilderAbilities';

describe('character builder ability methods', () => {
  test('each generation method starts with independent scores', () => {
    const drafts = initialAbilityDrafts();
    drafts.dice.strength = 17;
    drafts.standard.strength = 15;

    expect(drafts.point.strength).toBe(8);
    expect(drafts.dice.strength).toBe(17);
    expect(drafts.standard.strength).toBe(15);
  });

  test('standard array options exclude values assigned elsewhere but retain the current value', () => {
    const scores = initialAbilityDrafts().standard;
    scores.strength = 15;
    scores.dexterity = 14;

    expect(standardArrayOptions(scores, 'constitution')).not.toContain(15);
    expect(standardArrayOptions(scores, 'strength')).toContain(15);
  });

  test('point buy hides scores that exceed the refundable budget', () => {
    const scores = {
      strength: 15,
      dexterity: 15,
      constitution: 15,
      intelligence: 8,
      wisdom: 8,
      charisma: 8,
    };

    expect(pointBuyRemaining(scores)).toBe(0);
    expect(pointBuyOptions(scores, 'intelligence')).toEqual([8]);
    expect(pointBuyOptions(scores, 'strength')).toContain(15);
  });

  test('validates each method using its own rules', () => {
    expect(abilityDraftIsComplete('standard', {
      strength: 15,
      dexterity: 14,
      constitution: 13,
      intelligence: 12,
      wisdom: 10,
      charisma: 8,
    })).toBe(true);
    expect(abilityDraftIsComplete('point', initialAbilityDrafts().point)).toBe(true);
    expect(abilityDraftIsComplete('dice', {
      strength: 18,
      dexterity: 12,
      constitution: 11,
      intelligence: 10,
      wisdom: 9,
      charisma: 3,
    })).toBe(true);
  });

  test('rolls four dice and drops the lowest', () => {
    const rolls = [0, 0.2, 0.5, 0.99];
    expect(rollAbilityScore(() => rolls.shift())).toBe(12);
  });
});
