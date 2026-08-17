import unittest
from types import SimpleNamespace

from settlement_simulation import calculate_lamplighter_state


def lamp(lamp_id, order, x):
    return SimpleNamespace(
        id=lamp_id,
        name=f'Lamp {lamp_id}',
        route_order=order,
        x=x,
        y=0,
        elevation=0,
        fuel_remaining=100,
    )


class LamplighterSimulationTest(unittest.TestCase):
    def setUp(self):
        self.route = SimpleNamespace(
            evening_start_minute=18 * 60,
            morning_start_minute=5 * 60,
            minutes_per_stop=10,
        )
        self.lamps = [lamp(1, 0, 0), lamp(2, 1, 10), lamp(3, 2, 20)]

    def test_evening_lamps_turn_on_in_route_order(self):
        state = calculate_lamplighter_state(self.route, self.lamps, 18 * 60 + 15)
        self.assertEqual(state['phase'], 'lighting')
        self.assertEqual([item['lit'] for item in state['lamps']], [True, True, False])
        self.assertEqual(state['position']['x'], 15)
        self.assertEqual(state['next_lamp_id'], 3)

    def test_lamps_remain_on_after_route_until_morning(self):
        state = calculate_lamplighter_state(self.route, self.lamps, 23 * 60)
        self.assertEqual([item['lit'] for item in state['lamps']], [True, True, True])
        self.assertIsNone(state['position'])

    def test_morning_extinguishes_in_reverse_order(self):
        state = calculate_lamplighter_state(self.route, self.lamps, 5 * 60 + 15)
        self.assertEqual(state['phase'], 'extinguishing')
        self.assertEqual([item['lit'] for item in state['lamps']], [True, False, False])
        self.assertEqual(state['position']['x'], 5)


if __name__ == '__main__':
    unittest.main()
