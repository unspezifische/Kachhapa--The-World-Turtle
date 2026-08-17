import unittest

from settlement_generation import generate_settlement


class SettlementGenerationTest(unittest.TestCase):
    def test_generation_is_reproducible_and_editor_native(self):
        config = {
            'name': 'Oakharbor', 'settlement_type': 'town', 'population': 2400,
            'seed': 'oak-42', 'government': 'guild_oligarchy',
            'environment': {'biome': 'coastal', 'coastal': True, 'river': True, 'resources': ['fish', 'timber']},
            'race_distribution': [{'name': 'Human', 'percentage': 70}, {'name': 'Dwarf', 'percentage': 30}],
            'factions': ['Harbor Guild'],
        }
        first = generate_settlement(config)
        second = generate_settlement(config)
        self.assertEqual(first['roads'], second['roads'])
        self.assertEqual(first['buildings'], second['buildings'])
        self.assertTrue(all(len(road['points']) >= 2 for road in first['roads']))
        self.assertTrue(all(building['rooms'] for building in first['buildings']))
        self.assertEqual({body['water_type'] for body in first['water_bodies']}, {'river', 'ocean'})
        self.assertEqual(first['generation_config']['government'], 'guild_oligarchy')

    def test_race_percentages_are_normalized(self):
        result = generate_settlement({'race_distribution': [{'name': 'Elf', 'percentage': 2}, {'name': 'Human', 'percentage': 3}]})
        self.assertEqual(sum(item['percentage'] for item in result['generation_config']['race_distribution']), 100)


if __name__ == '__main__':
    unittest.main()
