import unittest

from travel_planning import estimate_travel_options


class TravelPlanningTest(unittest.TestCase):
    def test_city_trip_returns_land_modes_and_blocks_sailing(self):
        origin = {'map_key': 'waterdeep', 'x': 0, 'y': 0, 'road_access': True, 'water_access': False}
        destination = {'map_key': 'waterdeep', 'x': 5280, 'y': 0, 'road_access': True, 'water_access': False}
        result = estimate_travel_options(origin, destination, party_size=4)
        modes = {option['mode']: option for option in result['options']}
        self.assertEqual(result['direct_distance_miles'], 1)
        self.assertTrue(modes['walking']['available'])
        self.assertTrue(modes['carriage']['available'])
        self.assertFalse(modes['sailing']['available'])
        self.assertGreater(modes['carriage']['cost_cp'], 0)

    def test_port_to_port_allows_sailing(self):
        origin = {'map_key': 'coast', 'x': 0, 'y': 0, 'water_access': True}
        destination = {'map_key': 'coast', 'x': 10560, 'y': 0, 'water_access': True}
        sailing = next(option for option in estimate_travel_options(origin, destination)['options'] if option['mode'] == 'sailing')
        self.assertTrue(sailing['available'])
        self.assertEqual(sailing['cost_cp'], 21)

    def test_intercity_trip_accepts_explicit_route_distance(self):
        origin = {'map_key': 'waterdeep', 'x': 0, 'y': 0}
        destination = {'map_key': 'neverwinter', 'x': 0, 'y': 0}
        result = estimate_travel_options(origin, destination, route_distance_miles=350)
        self.assertEqual(result['direct_distance_miles'], 350)


if __name__ == '__main__':
    unittest.main()
