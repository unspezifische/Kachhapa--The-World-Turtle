import copy
import unittest
from property_navigation import resolve_rest_route

REGION = [{'x': 0, 'y': 0}, {'x': 4, 'y': 0}, {'x': 4, 'y': 4}, {'x': 0, 'y': 4}]


class RestRouteTests(unittest.TestCase):
    def setUp(self):
        self.building = {'id': 'house', 'x': 20, 'y': 10, 'levels': [
            {'id': 'ground', 'elevation_feet': 0, 'openings': [{'id': 'door', 'kind': 'door', 'state': 'closed', 'width': 3}], 'stairs': [{'id': 'lower', 'total_rise_feet': 10}]},
            {'id': 'middle', 'elevation_feet': 10, 'stairs': [{'id': 'upper', 'total_rise_feet': 10}]},
            {'id': 'top', 'elevation_feet': 20, 'rooms': [{'id': 'bed', 'name': 'Bedroom', 'region': REGION, 'activity_capabilities': ['rest'], 'access_policy': 'residents', 'occupancy_limit': 1}]}]}
        self.parcel = {'id': 'estate', 'structure_ids': ['house'], 'boundary': {'segments': [{'id': 'edge', 'treatment': 'wall', 'openings': [{'id': 'gate', 'opening_kind': 'gate', 'width': 4, 'state': 'open'}]}]}}
        self.actor = {'resident': True, 'can_open_doors': True, 'clearance_width_feet': 2}

    def route(self, reservations=None):
        return resolve_rest_route([self.building], [self.parcel], self.actor, reservations)

    def test_rest_vertical_slice_retains_hierarchy_and_needs_real_arrival(self):
        result = self.route()
        self.assertEqual(result['status'], 'route_request')
        self.assertEqual(result['destination']['floor_id'], 'top')
        self.assertEqual([step['kind'] for step in result['steps']], ['boundary_portal', 'cross_property', 'structure_portal', 'stairs', 'stairs', 'room'])
        self.assertEqual(result['steps'][2]['action'], 'open')
        self.assertEqual(result['path_status'], 'requires_path_planner_or_dm_arrival')
        self.assertEqual(self.route([{'destination_key': result['destination_key']}])['status'], 'no_route')

    def test_locked_gate_or_short_stair_or_narrow_door_blocks_route(self):
        baseline = copy.deepcopy((self.building, self.parcel))
        self.parcel['boundary']['segments'][0]['openings'][0]['state'] = 'locked'
        self.assertEqual(self.route()['status'], 'no_route')
        self.building, self.parcel = copy.deepcopy(baseline)
        self.building['levels'][1]['stairs'][0]['total_rise_feet'] = 5
        self.assertEqual(self.route()['status'], 'no_route')
        self.building, self.parcel = copy.deepcopy(baseline)
        self.building['levels'][0]['openings'][0]['width'] = 1
        self.assertEqual(self.route()['status'], 'no_route')

    def test_permission_and_room_linked_locked_portal(self):
        self.actor['resident'] = False
        self.assertEqual(self.route()['status'], 'no_route')
        self.actor['resident'] = True
        top = self.building['levels'][2]
        top['rooms'][0]['linked_portal_ids'] = ['room-door']
        top['openings'] = [{'id': 'room-door', 'kind': 'door', 'state': 'locked'}]
        self.assertEqual(self.route()['status'], 'no_route')
        top['openings'][0]['state'] = 'open'
        self.assertEqual(self.route()['steps'][-2]['kind'], 'room_portal')

    def test_fallback_to_open_outdoor_destination_when_preferred_gate_locked(self):
        self.parcel['boundary']['segments'][0]['openings'][0]['state'] = 'locked'
        garden = {'id': 'garden-estate', 'outdoor_areas': [{'id': 'garden', 'name': 'Garden', 'polygon': REGION, 'walkable': True, 'activity_capabilities': ['rest']}]}
        result = resolve_rest_route([self.building], [self.parcel, garden], self.actor, preferred_id='bed')
        self.assertEqual(result['destination']['id'], 'garden')

    def test_nearest_candidate_preference_and_capacity_filter(self):
        gardens = [{'id': f'p{index}', 'outdoor_areas': [{'id': f'g{index}', 'polygon': [{'x': p['x'] + index * 100, 'y': p['y']} for p in REGION], 'activity_capabilities': ['rest'] }]} for index in range(2)]
        result = resolve_rest_route([], gardens, {'position': {'x': 110, 'y': 0}})
        self.assertEqual(result['destination']['id'], 'g1')
        self.assertEqual(resolve_rest_route([], gardens, {}, preferred_id='g1')['destination']['id'], 'g1')
        gardens[1]['outdoor_areas'][0]['occupancy_limit'] = 0
        self.assertEqual(resolve_rest_route([], gardens, {}, preferred_id='g1')['destination']['id'], 'g0')
