import unittest
from pathlib import Path

from fiveetools_catalog import catalog_rows


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
        self.assertTrue(any(row['source'] == 'WDH' and row['content'].get('adventureData') for row in adventures))


if __name__ == '__main__':
    unittest.main()
