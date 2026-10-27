import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import patch

import app as app_module


class CalendarOrdinalPerformanceTests(unittest.TestCase):
    def test_gregorian_ordinal_uses_constant_time_leap_arithmetic(self):
        calendar = SimpleNamespace(
            epoch_year=1,
            format_element=SimpleNamespace(data={
                'months': [
                    {'name': 'January', 'length': 31},
                    {'name': 'February', 'length': 28, 'leap_length': 29},
                    {'name': 'March', 'length': 31},
                    {'name': 'April', 'length': 30},
                    {'name': 'May', 'length': 31},
                    {'name': 'June', 'length': 30},
                    {'name': 'July', 'length': 31},
                    {'name': 'August', 'length': 31},
                    {'name': 'September', 'length': 30},
                    {'name': 'October', 'length': 31},
                    {'name': 'November', 'length': 30},
                    {'name': 'December', 'length': 31},
                ],
                'leap_rule': {'type': 'gregorian'},
            }),
        )

        with patch.object(app_module, 'is_leap_year', wraps=app_module.is_leap_year) as leap_check:
            ordinal = app_module.date_to_ordinal(calendar, 1487, 2, 17)

        self.assertEqual(ordinal, (date(1487, 3, 17) - date(1, 1, 1)).days)
        self.assertLessEqual(leap_check.call_count, 2)


if __name__ == '__main__':
    unittest.main()
