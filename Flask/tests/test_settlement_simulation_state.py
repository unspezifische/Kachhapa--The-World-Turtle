import unittest
from types import SimpleNamespace
from unittest.mock import patch

import app as app_module


class SettlementSimulationDateTest(unittest.TestCase):
    def setUp(self):
        self.context = app_module.app.app_context()
        self.context.push()

    def tearDown(self):
        self.context.pop()

    def test_month_name_follows_calendar_date_across_month_boundary(self):
        calendar = SimpleNamespace(
            current_year=1492,
            current_month_index=1,
            current_day=30,
            current_hour=23,
            current_minute=50,
            format_element=SimpleNamespace(data={
                'months': [{'name': 'Hammer'}, {'name': 'Alturiak'}, {'name': 'Ches'}],
            }),
        )
        with patch.object(app_module.Calendar, 'query') as calendars, \
             patch.object(app_module.LamplighterRoute, 'query') as routes, \
             patch.object(app_module, 'get_current_moon_states', return_value=[]):
            calendars.filter_by.return_value.first.return_value = calendar
            routes.filter_by.return_value.order_by.return_value.all.return_value = []

            before = app_module.get_settlement_simulation_state(7, persist=False)
            self.assertEqual(before['time']['month_name'], 'Alturiak')
            self.assertEqual(before['time']['day'], 30)

            calendar.current_month_index = 2
            calendar.current_day = 1
            after = app_module.get_settlement_simulation_state(7, persist=False)
            self.assertEqual(after['time']['month_name'], 'Ches')
            self.assertEqual(after['time']['day'], 1)
            self.assertEqual(after['time']['month_index'], 2)
            self.assertEqual(after['routes'], before['routes'])

    def test_missing_calendar_has_no_month_name(self):
        with patch.object(app_module.Calendar, 'query') as calendars, \
             patch.object(app_module.LamplighterRoute, 'query') as routes, \
             patch.object(app_module, 'get_current_moon_states', return_value=[]):
            calendars.filter_by.return_value.first.return_value = None
            routes.filter_by.return_value.order_by.return_value.all.return_value = []
            state = app_module.get_settlement_simulation_state(7, persist=False)

        self.assertIsNone(state['time']['month_name'])


if __name__ == '__main__':
    unittest.main()
