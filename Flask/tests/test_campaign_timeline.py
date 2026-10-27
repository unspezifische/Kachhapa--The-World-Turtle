import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from flask_jwt_extended import create_access_token

import app as app_module
from timeline_service import age_at_event, age_during_event, date_label, date_range_label, normalize_partial_date, season_for_date


class CampaignTimelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        data = json.loads((Path(__file__).parents[1] / 'Harptos.json').read_text())
        cls.calendar = SimpleNamespace(
            id=9, name='Campaign Calendar', campaign_id=5, epoch_year=1, format_slug='harptos',
            format_element=SimpleNamespace(data=data),
            get_format_data=lambda: data,
        )

    def test_harptos_intercalary_dates_are_real_calendar_days(self):
        self.assertEqual(app_module.days_in_month(self.calendar, 1491, 0), 31)  # Midwinter
        self.assertEqual(app_module.days_in_month(self.calendar, 1491, 6), 31)  # Midsummer
        self.assertEqual(app_module.days_in_month(self.calendar, 1492, 6), 32)  # Shieldmeet
        self.assertEqual(
            app_module.date_to_ordinal(self.calendar, 1492, 0, 1) - app_module.date_to_ordinal(self.calendar, 1491, 0, 1),
            365,
        )
        self.assertEqual(
            app_module.date_to_ordinal(self.calendar, 1493, 0, 1) - app_module.date_to_ordinal(self.calendar, 1492, 0, 1),
            366,
        )

    def test_highharvestide_begins_autumn_and_months_derive_seasons(self):
        self.assertEqual(season_for_date(self.calendar, 1491, 8, 30, app_module.is_leap_year), 'Summer')
        self.assertEqual(season_for_date(self.calendar, 1491, 8, 31, app_module.is_leap_year), 'Autumn')
        normalized = normalize_partial_date(self.calendar, {'year': 1491, 'month_index': 8, 'day': 31}, app_module.is_leap_year, app_module.days_in_month)
        self.assertEqual(normalized['season'], 'Autumn')
        self.assertEqual(date_label(self.calendar, normalized, app_module.is_leap_year), 'Highharvestide, Year 1491')

    def test_partial_dates_use_period_end_for_age(self):
        born_in_autumn = {'year': 1460, 'season': 'Autumn', 'month_index': None, 'day': None}
        summer_event = {'year': 1491, 'season': 'Summer', 'month_index': None, 'day': None}
        result = age_at_event(self.calendar, born_in_autumn, summer_event, app_module.is_leap_year, app_module.base_month_days, app_module.date_to_ordinal)
        self.assertEqual(result, {'age': 30, 'status': 'age', 'label': 'Age 30'})
        before_birth = age_at_event(self.calendar, born_in_autumn, {'year': 1459, 'season': 'Autumn', 'month_index': None, 'day': None}, app_module.is_leap_year, app_module.base_month_days, app_module.date_to_ordinal)
        self.assertEqual(before_birth['label'], 'Not born yet')
        unknown = age_at_event(self.calendar, {'year': None}, summer_event, app_module.is_leap_year, app_module.base_month_days, app_module.date_to_ordinal)
        self.assertEqual(unknown['label'], 'Age unknown')

    def test_event_validation_accepts_all_three_precisions(self):
        for values, precision in [
            ({'year': 1491, 'season': 'Spring'}, (None, None)),
            ({'year': 1491, 'month_index': 4, 'season': 'Winter'}, (4, None)),
            ({'year': 1491, 'month_index': 6, 'day': 31}, (6, 31)),
        ]:
            normalized = normalize_partial_date(self.calendar, values, app_module.is_leap_year, app_module.days_in_month)
            self.assertEqual((normalized['month_index'], normalized['day']), precision)
        with self.assertRaisesRegex(ValueError, 'month before choosing a day'):
            normalize_partial_date(self.calendar, {'year': 1491, 'season': 'Summer', 'day': 4}, app_module.is_leap_year, app_module.days_in_month)

    def test_year_ranges_format_validate_and_report_age_ranges(self):
        start = normalize_partial_date(
            self.calendar, {'year': 1474}, app_module.is_leap_year,
            app_module.days_in_month, allow_year_only=True,
        )
        end = normalize_partial_date(
            self.calendar, {'year': 1475}, app_module.is_leap_year,
            app_module.days_in_month, allow_year_only=True,
        )
        self.assertEqual(date_range_label(self.calendar, start, end, app_module.is_leap_year), '1474–1475 DR')
        gregorian = SimpleNamespace(format_slug='gregorian', get_format_data=lambda: {'slug': 'gregorian'})
        self.assertEqual(date_range_label(gregorian, start, end, app_module.is_leap_year), 'Years 1474–1475')
        age = age_during_event(
            self.calendar,
            {'year': 1454, 'season': 'Autumn', 'month_index': None, 'day': None},
            start, end, app_module.is_leap_year, app_module.base_month_days, app_module.date_to_ordinal,
        )
        self.assertEqual(age['label'], 'Age 20–21')

    def test_event_range_validation_rejects_reversed_endpoints(self):
        with app_module.app.app_context():
            start, end, name, _, _, _ = app_module.validate_calendar_event_document(self.calendar, {
                'name': 'The Border War', 'year': 1474, 'season': None,
                'end_year': 1475, 'end_season': None, 'npc_ids': [],
            })
            self.assertEqual((start['year'], end['year'], name), (1474, 1475, 'The Border War'))
            with self.assertRaisesRegex(ValueError, 'end must be on or after the start'):
                app_module.validate_calendar_event_document(self.calendar, {
                    'name': 'Reversed War', 'year': 1475, 'season': None,
                    'end_year': 1474, 'end_season': None, 'npc_ids': [],
                })

    def test_player_timeline_filters_private_events_and_birth_details(self):
        class Query:
            def __init__(self, rows): self.rows = rows
            def filter_by(self, **values):
                rows = self.rows
                if 'is_player_visible' in values: rows = [row for row in rows if row.is_player_visible == values['is_player_visible']]
                return Query(rows)
            def all(self): return self.rows
            def first(self): return self.rows[0] if self.rows else None

        def event(event_id, visible):
            row = SimpleNamespace(id=event_id, calendar_id=9, name=f'Event {event_id}', description=None, color=None,
                start_year=1491, season='Summer', start_month_index=None, start_day=None, start_hour=None, start_minute=None,
                end_year=None, end_season=None, end_month_index=None, end_day=None,
                is_player_visible=visible, characters=[])
            row.to_dict = lambda row=row: {'id': row.id, 'calendar_id': 9, 'name': row.name, 'description': None, 'color': None,
                'year': 1491, 'season': 'Summer', 'month_index': None, 'day': None, 'hour': None, 'minute': None,
                'end_year': None, 'end_season': None, 'end_month_index': None, 'end_day': None,
                'is_player_visible': row.is_player_visible, 'npc_ids': []}
            return row

        with app_module.app.app_context():
            token = create_access_token(identity='player')
            with patch.object(app_module, 'dashboard_campaign_context', return_value=(SimpleNamespace(id=2), None, False, None)), \
                 patch.object(app_module.Calendar, 'query', Query([self.calendar])), \
                 patch.object(app_module.CalendarEvent, 'query', Query([event(1, True), event(2, False)])):
                response = app_module.app.test_client().get('/api/calendar/5/timeline', headers={'Authorization': f'Bearer {token}'})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual([item['id'] for item in response.json['events']], [1])
        self.assertNotIn('npcs', response.json)
        self.assertFalse(response.json['can_edit'])


if __name__ == '__main__':
    unittest.main()
