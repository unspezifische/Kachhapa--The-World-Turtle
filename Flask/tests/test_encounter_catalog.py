import unittest
from unittest.mock import patch

import encounter_catalog
from encounter_catalog import available_presets, roll_preset


class EncounterCatalogTest(unittest.TestCase):
    def test_system_tables_are_source_scoped(self):
        presets = available_presets({'XGE'})
        self.assertTrue(any(item['name'] == 'Arctic' for item in presets))
        self.assertTrue(all(item['source'] == 'XGE' for item in presets))

    def test_installed_adventure_tables_include_icewind_dale_wilderness_encounters(self):
        presets = available_presets({'IDRotF'})
        self.assertTrue(any(item['name'] == 'Random Wilderness Encounters' for item in presets))
        self.assertTrue(all(item['source'] == 'IDRotF' for item in presets))

    def test_a_random_result_can_become_creature_participants(self):
        preset = next(item for item in available_presets({'XGE'}) if item['name'] == 'Arctic')
        table = next(item for item in encounter_catalog._tables() if item['id'] == preset['id'])
        creature_row = next(row for row in table['entries'] if '{@creature' in str(row.get('result')))
        with patch.object(encounter_catalog, 'choice', return_value=creature_row):
            found = roll_preset(preset['id'], lambda name, source: {
                'id': 1, 'name': name, 'hp': '7', 'ac': '13', 'dexterity': 12, 'challenge': '1/4'
            })
        self.assertIsNotNone(found)
        self.assertEqual(found['source'], 'XGE')
        self.assertTrue(all(participant['quantity'] >= 1 for participant in found['participants']))


if __name__ == '__main__':
    unittest.main()
