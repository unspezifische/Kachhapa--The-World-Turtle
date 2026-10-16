"""Exercise simulation composition without importing the Flask runtime."""
import ast
from pathlib import Path
from types import SimpleNamespace as NS
import unittest

from settlement_lighting import generated_lighting_routes
from settlement_simulation import calculate_lamplighter_state


class Query:
    def __init__(self, values): self.values = values
    def filter_by(self, **kwargs): return self
    def order_by(self, *args): return self
    def first(self): return self.values[0] if self.values else None
    def all(self): return self.values


class LightingPayloadTest(unittest.TestCase):
    def test_generated_and_legacy_routes_have_settlement_ownership(self):
        tree = ast.parse((Path(__file__).parents[1] / 'app.py').read_text())
        function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'get_settlement_simulation_state')
        road = dict(id='main', road_class='street', points=[dict(x=0,y=0),dict(x=1000,y=0)])
        settlements = [NS(id=3,is_primary=True,roads=[road],environment={}),NS(id=4,is_primary=False,roads=[road],environment={})]
        legacy_route = NS(id=12,name='Legacy',evening_start_minute=1080,morning_start_minute=300,minutes_per_stop=8)
        lamp = NS(id=99,name='Legacy lamp',x=0,y=0,elevation=0,route_order=0,lit=True,fuel_remaining=100)
        scope = {
            'Calendar': NS(query=Query([NS(current_year=1492,current_month_index=0,current_day=3,current_hour=0,current_minute=0)])),
            'LamplighterRoute': NS(query=Query([legacy_route]),id=None),
            'StreetLamp': NS(query=Query([lamp]),route_order=None),
            'WorldAtlasLocation': NS(query=Query(settlements),id=None),
            'get_months': lambda _: [{'name':'Hammer'}],
            'get_current_moon_states': lambda _: [],
            'calculate_lamplighter_state': calculate_lamplighter_state,
            'generated_lighting_routes': generated_lighting_routes,
        }
        exec(compile(ast.Module(body=[function],type_ignores=[]),'app.py','exec'),scope)
        payload = scope['get_settlement_simulation_state'](7,persist=False)
        self.assertEqual(payload['routes'][0]['id'],12)
        self.assertEqual(payload['routes'][0]['settlement_id'],3)
        self.assertEqual({r['settlement_id'] for r in payload['routes']},{3,4})
        self.assertEqual(payload['time']['month_name'],'Hammer')
        self.assertTrue(all(l['lit'] for r in payload['routes'] for l in r['lamps']))


if __name__ == '__main__': unittest.main()
