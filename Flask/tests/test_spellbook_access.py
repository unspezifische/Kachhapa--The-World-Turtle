import json
import unittest
from types import SimpleNamespace

from spellbook_access import character_level, spell_eligibility


def character(class_name='Fighter', xp=0, feats=None):
    return SimpleNamespace(Class=class_name, ExperiencePoints=xp, Feats=json.dumps(feats or []))


def spell(name='Fireball', level='3', classes='Sorcerer,Wizard', school='Evocation', ritual=False, attacks=None):
    return SimpleNamespace(name=name, level=level, classes=classes, school=school,
                           ritual=ritual, spell_attacks=attacks or [])


class SpellbookAccessTest(unittest.TestCase):
    def test_class_and_character_level_must_both_allow_the_spell(self):
        novice = spell_eligibility(character('Wizard', 0), spell())
        adept = spell_eligibility(character('Wizard', 6500), spell())

        self.assertFalse(novice['eligible'])
        self.assertIn('current spell level', novice['reason'])
        self.assertTrue(adept['eligible'])
        self.assertEqual(adept['source'], 'class')

    def test_common_spell_granting_feats_are_recognized(self):
        touched = character(feats=[{'name': 'Fey Touched'}])
        exact_grant = character(feats=[{'name': 'A Custom Boon', 'description': 'You learn Fireball.'}])

        self.assertTrue(spell_eligibility(touched, spell('Charm Person', '1', 'Bard', 'Enchantment'))['eligible'])
        self.assertTrue(spell_eligibility(exact_grant, spell())['eligible'])

    def test_unrelated_characters_cannot_learn_the_spell(self):
        result = spell_eligibility(character('Fighter'), spell())
        self.assertFalse(result['eligible'])
        self.assertEqual(result['reason'], 'This spell is a mystery to you')

    def test_character_level_comes_from_saved_experience(self):
        self.assertEqual(character_level(character(xp=2700)), 4)


if __name__ == '__main__':
    unittest.main()
