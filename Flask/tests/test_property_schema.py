import unittest

from property_schema import validate_properties


class PropertySchemaTests(unittest.TestCase):
    def test_legacy_structure_ids_and_empty_parcels(self):
        validate_properties([
            {'id': 'estate', 'structure_ids': ['old-house', 'stable']},
            {'id': 'garden', 'structure_ids': []},
        ], [{'id': 'old-house'}, {'id': 'stable'}])

    def test_missing_and_duplicate_structure_links_fail(self):
        with self.assertRaisesRegex(ValueError, 'missing structure'):
            validate_properties([{'id': 'estate', 'structure_ids': ['unknown']}], [])
        with self.assertRaisesRegex(ValueError, 'multiple properties'):
            validate_properties([
                {'id': 'a', 'structure_ids': ['old-house']},
                {'id': 'b', 'structure_ids': ['old-house']},
            ], [{'id': 'old-house'}])

    def test_boundary_and_outdoor_geometry_fail_safely(self):
        with self.assertRaisesRegex(ValueError, 'invalid coordinate'):
            validate_properties([{'id': 'p', 'boundary': {
                'vertices': [{'x': 0, 'y': 0}, {'x': float('nan'), 'y': 0}, {'x': 0, 'y': 1}],
                'segments': [{'id': 'a'}, {'id': 'b'}, {'id': 'c'}],
            }}], [])

    def test_hosted_opening_fit_and_overlap(self):
        parcel = {'id': 'p', 'boundary': {
            'vertices': [{'x': 0, 'y': 0}, {'x': 20, 'y': 0}, {'x': 20, 'y': 20}, {'x': 0, 'y': 20}],
            'segments': [
                {'id': 'south', 'treatment': 'wall', 'openings': [
                    {'id': 'gate', 'offsetAlongSegment': 4, 'width': 8},
                    {'id': 'door', 'offsetAlongSegment': 12, 'width': 3},
                ]},
                {'id': 'east', 'treatment': 'none'}, {'id': 'north', 'treatment': 'none'},
                {'id': 'west', 'treatment': 'none'},
            ],
        }}
        validate_properties([parcel], [])
        parcel['boundary']['segments'][0]['openings'][1]['offsetAlongSegment'] = 10
        with self.assertRaisesRegex(ValueError, 'overlap'):
            validate_properties([parcel], [])

    def test_self_intersecting_parcel_is_rejected(self):
        vertices = [{'x': 0, 'y': 0}, {'x': 10, 'y': 10}, {'x': 0, 'y': 10}, {'x': 10, 'y': 0}]
        with self.assertRaises(ValueError):
            validate_properties([{'id': 'p', 'boundary': {
                'vertices': vertices, 'segments': [{'id': str(i)} for i in range(4)]
            }}], [])

    def test_touching_edges_and_duplicate_portal_ids_are_rejected(self):
        vertices = [{'x': 0, 'y': 0}, {'x': 10, 'y': 0}, {'x': 10, 'y': 10},
                    {'x': 5, 'y': 0}, {'x': 0, 'y': 10}]
        with self.assertRaisesRegex(ValueError, 'self-intersects'):
            validate_properties([{'id': 'p', 'boundary': {
                'vertices': vertices, 'segments': [{'id': str(i)} for i in range(5)]
            }}], [])
        square = [{'x': 0, 'y': 0}, {'x': 10, 'y': 0},
                  {'x': 10, 'y': 10}, {'x': 0, 'y': 10}]
        segments = [{'id': str(i), 'openings': []} for i in range(4)]
        segments[0]['openings'] = [{'id': 'gate', 'offsetAlongSegment': 1, 'width': 2}]
        segments[1]['openings'] = [{'id': 'gate', 'offsetAlongSegment': 1, 'width': 2}]
        with self.assertRaisesRegex(ValueError, 'unique IDs'):
            validate_properties([{'id': 'p', 'boundary': {
                'vertices': square, 'segments': segments,
            }}], [])

    def test_room_ids_and_portals_are_validated_without_rewriting_legacy_rooms(self):
        buildings = [{'id': 'house', 'rooms': ['Kitchen'], 'levels': [{
            'id': 'ground', 'openings': [{'id': 'door'}], 'rooms': [{
                'id': 'bedroom', 'structure_id': 'house', 'floor_id': 'ground',
                'activity_capabilities': ['sleep'], 'linked_portal_ids': ['door'],
                'region': [{'x': 0, 'y': 0}, {'x': 4, 'y': 0}, {'x': 0, 'y': 4}],
            }],
        }]}]
        validate_properties([{'id': 'home', 'structure_ids': ['house']}], buildings)
        buildings[0]['levels'][0]['rooms'][0]['linked_portal_ids'] = ['missing']
        with self.assertRaisesRegex(ValueError, 'missing portal'):
            validate_properties([{'id': 'home', 'structure_ids': ['house']}], buildings)

    def test_blueprint_room_materials_locks_and_stair_shares_round_trip(self):
        room = {
            'id': 'kitchen', 'structure_id': 'house', 'floor_id': 'ground',
            'floor_material': 'stone', 'boundary_locked': True,
            'region': [{'x': 0, 'y': 0}, {'x': 8, 'y': 0}, {'x': 0, 'y': 8}],
        }
        level = {
            'id': 'ground', 'interior_material': 'plaster', 'rooms': [room],
            'walls': [{'id': 'divider', 'material': 'brick'}],
            'stairs': [{'landing_count': 2, 'flight_shares': [24.5, 24.5, 51]}],
        }
        buildings = [{'id': 'house', 'levels': [level]}]
        validate_properties([{'id': 'home', 'structure_ids': ['house']}], buildings)
        level['stairs'][0]['flight_shares'] = [25, 25, 51]
        with self.assertRaisesRegex(ValueError, 'total 100'):
            validate_properties([{'id': 'home', 'structure_ids': ['house']}], buildings)


if __name__ == '__main__':
    unittest.main()
