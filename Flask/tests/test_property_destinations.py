import unittest

from property_destinations import settlement_destinations, destination_key


class PropertyDestinationsTests(unittest.TestCase):
    def test_sleep_room_keeps_stable_hierarchy_and_rejects_visitor(self):
        buildings = [{'id': 'house', 'x': 10, 'y': 20, 'elevation': 6, 'levels': [{
            'id': 'upper', 'elevation_feet': 10, 'rooms': [{
                'id': 'bedroom', 'name': 'Bedroom', 'access_policy': 'residents',
                'activity_capabilities': ['sleep', 'rest'],
                'region': [{'x': 0, 'y': 0}, {'x': 4, 'y': 0}, {'x': 4, 'y': 4}, {'x': 0, 'y': 4}],
            }],
        }]}]
        properties = [{'id': 'estate', 'structure_ids': ['house']}]
        self.assertEqual(settlement_destinations(buildings, properties, 'sleep'), [])
        [bedroom] = settlement_destinations(buildings, properties, 'sleep', {'resident': True})
        self.assertEqual(bedroom['id'], 'bedroom')
        self.assertEqual(bedroom['property_id'], 'estate')
        self.assertEqual(bedroom['relative_elevation_feet'], 16)
        self.assertEqual(bedroom['point'], {'x': 12, 'y': 22})

    def test_unwalkable_pond_is_not_a_destination(self):
        properties = [{'id': 'p', 'outdoor_areas': [{
            'id': 'pond', 'walkable': False, 'activity_capabilities': ['rest'],
            'polygon': [{'x': 0, 'y': 0}, {'x': 4, 'y': 0}, {'x': 0, 'y': 4}],
        }]}]
        self.assertEqual(settlement_destinations([], properties, 'rest'), [])

    def test_legacy_room_names_do_not_break_destination_queries(self):
        buildings = [{'id': 'old-house', 'levels': [{'id': 'ground', 'rooms': ['Kitchen']}]}]
        self.assertEqual(settlement_destinations(buildings, [], 'rest'), [])

    def test_reservations_count_and_void_targets_are_not_walkable(self):
        room = {'id': 'r', 'activity_capabilities': ['rest'], 'occupancy_limit': 1,
                'region': [{'x': 0, 'y': 0}, {'x': 10, 'y': 0}, {'x': 10, 'y': 10}, {'x': 0, 'y': 10}]}
        building = {'id': 'b', 'levels': [{'id': 'g', 'rooms': [room], 'floor_voids': [
            {'points': [{'x': 4, 'y': 4}, {'x': 6, 'y': 4}, {'x': 6, 'y': 6}, {'x': 4, 'y': 6}]}]}]}
        [target] = settlement_destinations([building], [], 'rest')
        self.assertFalse(4 < target['point']['x'] < 6 and 4 < target['point']['y'] < 6)
        self.assertEqual(settlement_destinations([building], [], 'rest', reservations=[{'destination_key': destination_key(target)}]), [])


if __name__ == '__main__':
    unittest.main()
