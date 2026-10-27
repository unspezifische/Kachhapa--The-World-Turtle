import unittest
from pathlib import Path

from fiveetools_catalog import catalog_rows, creature_fluff_text, spell_rows


class FiveetoolsCatalogTest(unittest.TestCase):
    def test_adventure_creatures_are_scoped_and_source_data_is_preserved(self):
        data_dir = Path(__file__).resolve().parents[2] / '5etools-src' / 'data'
        creatures, adventures = catalog_rows(data_dir)
        by_source = {(row['source'], row['name']): row for row in creatures}

        self.assertEqual(len(adventures), 101)
        self.assertGreater(len(creatures), 4000)
        self.assertFalse(by_source['MM', 'Aarakocra']['is_adventure'])
        self.assertTrue(by_source['WDH', 'Ahmaergo']['is_adventure'])
        self.assertTrue(by_source['WDH', 'Ahmaergo']['is_named'])
        self.assertEqual(by_source['MM', 'Aarakocra']['challenge'], '1/4')
        self.assertIn('Howling Gyre', creature_fluff_text(by_source['MM', 'Aarakocra']['data']))
        self.assertEqual(by_source['MM', 'Aarakocra']['data']['fluff']['source'], 'MM')
        self.assertTrue(any(row['source'] == 'WDH' and row['content'].get('adventureData') for row in adventures))

    def test_spells_include_filter_fields_and_preserve_source_data(self):
        data_dir = Path(__file__).resolve().parents[2] / '5etools-src' / 'data'
        spells = spell_rows(data_dir)
        by_source = {(row['source'], row['name']): row for row in spells}

        self.assertEqual(len(spells), 969)
        acid_splash = by_source['PHB', 'Acid Splash']
        self.assertEqual(acid_splash['level'], '0')
        self.assertEqual(acid_splash['school'], 'Conjuration')
        self.assertIn('Wizard', acid_splash['classes'])
        self.assertEqual(acid_splash['damage_types'], ['acid'])
        self.assertIn('1d6', acid_splash['description'])
        self.assertEqual(acid_splash['data']['source'], 'PHB')
        self.assertTrue(any(spell['ritual'] for spell in spells))
        self.assertTrue(any(spell['concentration'] for spell in spells))


if __name__ == '__main__':
    unittest.main()
