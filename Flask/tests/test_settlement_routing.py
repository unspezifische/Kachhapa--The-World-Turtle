import unittest
from math import pi
from types import SimpleNamespace
from unittest.mock import patch

import settlement_routing
from settlement_routing import (RouteError, plan_route, plan_route_options,
                                sample_road_centerline, settlement_exterior_destinations)


def road(identifier, points, road_class='street', segments=None):
    return {'id': identifier, 'road_class': road_class, 'points': points, 'segments': segments or []}


class SettlementRoutingTests(unittest.TestCase):
    def test_sampling_matches_renderer_endpoints_and_curves(self):
        path = sample_road_centerline(road('curve', [{'x': 0, 'y': 0}, {'x': 50, 'y': 80}, {'x': 100, 'y': 0}]))
        self.assertEqual((path[0]['x'], path[0]['y']), (0, 0))
        self.assertEqual((path[-1]['x'], path[-1]['y']), (100, 0))
        self.assertGreater(max(point['y'] for point in path), 75)

    def test_visual_crossing_connects_unless_grade_separated(self):
        roads = [road('horizontal', [{'x': 0, 'y': 0}, {'x': 100, 'y': 0}]),
                 road('vertical', [{'x': 50, 'y': -50}, {'x': 50, 'y': 50}])]
        route = plan_route(roads, {'x': 0, 'y': 0}, {'x': 50, 'y': 50}, 'walking')
        self.assertEqual(route['source_road_ids'], ['horizontal', 'vertical'])
        roads[1]['segments'] = [{'crossing': 'grade_separated'}]
        with self.assertRaises(RouteError):
            plan_route(roads, {'x': 0, 'y': 0}, {'x': 50, 'y': 50}, 'walking')

    def test_modes_closures_direction_and_speed_choose_fastest(self):
        roads = [road('slow', [{'x': 0, 'y': 0}, {'x': 100, 'y': 0}], segments=[{'speed_multiplier': .25}]),
                 road('up', [{'x': 0, 'y': 0}, {'x': 0, 'y': 60}]),
                 road('across', [{'x': 0, 'y': 60}, {'x': 100, 'y': 0}])]
        route = plan_route(roads, {'x': 0, 'y': 0}, {'x': 100, 'y': 0}, 'walking')
        self.assertEqual(route['source_road_ids'], ['up', 'across'])
        self.assertTrue(route['alternatives'])
        roads[2]['segments'] = [{'status': 'closed'}]
        self.assertEqual(plan_route(roads, {'x': 0, 'y': 0}, {'x': 100, 'y': 0}, 'walking')['source_road_ids'], ['slow'])
        roads[0]['segments'] = [{'direction': 'forward', 'allowed_modes': ['walking']}]
        with self.assertRaises(RouteError):
            plan_route([roads[0]], {'x': 100, 'y': 0}, {'x': 0, 'y': 0}, 'walking')
        self.assertFalse(plan_route_options([roads[0]], {'x': 0, 'y': 0}, {'x': 100, 'y': 0})['options'][2]['available'])

    def test_endpoint_projections_split_the_same_one_way_span(self):
        roads = [road('one-way', [{'x':0,'y':0},{'x':100,'y':0}],
                      segments=[{'direction':'forward'}])]
        route = plan_route(roads, {'x':20,'y':10}, {'x':80,'y':10}, 'walking')
        self.assertAlmostEqual(route['distance_feet'],80,places=2)  # 10 + 60 + 10 access
        with self.assertRaises(RouteError):
            plan_route(roads, {'x':80,'y':10}, {'x':20,'y':10}, 'walking')

    def test_access_limit_and_exterior_destination_override(self):
        roads = [road('main', [{'x': 0, 'y': 0}, {'x': 500, 'y': 0}])]
        settlement = SimpleNamespace(id=7, map_key='town', roads=roads, properties=[], buildings=[{
            'id': 'inn', 'name': 'Inn', 'x': 100, 'y': 100, 'width_feet': 40, 'depth_feet': 20,
        }])
        [destination] = settlement_exterior_destinations(settlement)
        self.assertEqual(destination['key'], '7:structure:inn')
        self.assertEqual(destination['access_status'], 'connected')
        settlement.buildings[0]['travel_access_points'] = [{'id': 'front', 'x': 100, 'y': 300}]
        [destination] = settlement_exterior_destinations(settlement)
        self.assertEqual(destination['access_source'], 'manual')
        self.assertEqual(destination['access_status'], 'disconnected')
        with self.assertRaises(RouteError):
            plan_route(roads, {'x': 0, 'y': 300}, {'x': 100, 'y': 300}, 'walking')

    def test_exterior_destinations_sample_each_road_once(self):
        roads = [road('main', [{'x': 0, 'y': 0}, {'x': 500, 'y': 0}]),
                 road('side', [{'x': 250, 'y': 0}, {'x': 250, 'y': 500}])]
        buildings = [{'id': str(index), 'x': index * 50, 'y': 100,
                      'width_feet': 40, 'depth_feet': 30} for index in range(3)]
        settlement = SimpleNamespace(id=7, map_key='town', roads=roads,
                                     properties=[], buildings=buildings)
        with patch.object(settlement_routing, 'sample_road_centerline',
                          wraps=sample_road_centerline) as sample:
            destinations = settlement_exterior_destinations(settlement)
        self.assertEqual(len(destinations), len(buildings))
        self.assertEqual(sample.call_count, len(roads))

    def test_waterdeep_scale_destination_lookup_prunes_distant_roads(self):
        roads = [road(f'road-{index}', [{'x': index * 2000, 'y': y * 100}
                                        for y in range(8)]) for index in range(168)]
        buildings = [{'id': f'building-{index}', 'x': index * 10, 'y': 100,
                      'width_feet': 40, 'depth_feet': 30} for index in range(6)]
        settlement = SimpleNamespace(id=7, map_key='waterdeep', roads=roads,
                                     properties=[], buildings=buildings)
        with patch.object(settlement_routing, 'sample_road_centerline',
                          wraps=sample_road_centerline) as sample, \
                patch.object(settlement_routing, '_project',
                             wraps=settlement_routing._project) as project:
            destinations = settlement_exterior_destinations(settlement)
        self.assertEqual(len(destinations), 6)
        self.assertEqual(sample.call_count, 168)
        self.assertLess(project.call_count, 20000)

    def test_rotated_local_and_legacy_world_footprints_remain_compatible(self):
        roads = [road('main', [{'x': -500, 'y': 0}, {'x': 500, 'y': 0}])]
        local = {'id':'local','name':'Local','x':100,'y':100,'rotation':pi / 2,'coordinate_space':'local',
                 'levels':[{'level_number':0,'corners':[{'x':-10,'y':-20},{'x':10,'y':-20},{'x':10,'y':20},{'x':-10,'y':20}]}]}
        legacy = {'id':'legacy','name':'Legacy','x':900,'y':900,'rotation':pi / 2,
                  'levels':[{'level_number':0,'corners':[{'x':180,'y':80},{'x':220,'y':80},{'x':220,'y':120},{'x':180,'y':120}]}]}
        settlement = SimpleNamespace(id=7,map_key='town',roads=roads,properties=[],buildings=[local,legacy])
        destinations = {item['id']:item for item in settlement_exterior_destinations(settlement)}
        self.assertAlmostEqual(destinations['local']['y'],90)
        self.assertAlmostEqual(destinations['legacy']['y'],80)

    def test_exterior_door_and_property_gate_take_priority_over_inference(self):
        roads = [road('main', [{'x': 0, 'y': -500}, {'x': 0, 'y': 500}])]
        building = {'id':'hall','name':'Hall','coordinate_space':'local','x':100,'y':100,
                    'levels':[{'level_number':0,
                      'corners':[{'x':-20,'y':-20},{'x':20,'y':-20},{'x':20,'y':20},{'x':-20,'y':20}],
                      'outline':[{'id':'east','start':{'x':20,'y':-20},'end':{'x':20,'y':20}}],
                      'openings':[{'id':'front','wall_id':'east','kind':'door','distance_from_start':20}]}]}
        parcel = {'id':'estate','name':'Estate','structure_ids':[], 'boundary':{
          'vertices':[{'x':200,'y':50},{'x':300,'y':50},{'x':300,'y':150},{'x':200,'y':150}],
          'segments':[{'id':'south','openings':[{'id':'gate','offsetAlongSegment':70,'width':10}]},{'id':'east'},{'id':'north'},{'id':'west'}]}}
        settlement = SimpleNamespace(id=7,map_key='town',roads=roads,properties=[parcel],buildings=[building])
        destinations = {item['id']:item for item in settlement_exterior_destinations(settlement)}
        self.assertEqual((destinations['hall']['x'],destinations['hall']['y']),(120,100))
        self.assertEqual((destinations['estate']['x'],destinations['estate']['y']),(275,50))
        self.assertEqual(destinations['hall']['access_source'],'opening')
        self.assertEqual(destinations['estate']['access_source'],'opening')


if __name__ == '__main__':
    unittest.main()
