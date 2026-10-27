import json
import io
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import fitz
from flask_jwt_extended import create_access_token

import app as app_module
from timeline_export_service import build_timeline_json, build_timeline_markdown, build_timeline_pdf
from timeline_import_service import parse_timeline_json, parse_timeline_markdown


EVENTS = [{
    'id': 1, 'name': 'The Long Peace', 'date_label': '1474-1475 DR',
    'description': 'A fragile accord.', 'color': '#c8873a',
    'year': 1474, 'season': None, 'month_index': None, 'day': None,
    'end_year': 1475, 'end_season': None, 'end_month_index': None, 'end_day': None,
    'is_player_visible': False,
    'characters': [{'id': 7, 'name': 'Mira', 'label': 'Age 30-31'}],
}]


class TimelineExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        data = json.loads((Path(__file__).parents[1] / 'Harptos.json').read_text())
        cls.calendar = SimpleNamespace(
            id=9, name='Sword Coast Calendar', campaign_id=5, format_slug='harptos',
            format_element=SimpleNamespace(data=data), get_format_data=lambda: data,
        )

    def test_markdown_contains_event_description_and_character_age(self):
        content = build_timeline_markdown('Sword Coast Calendar', EVENTS)
        self.assertIn('# Sword Coast Calendar - Historical Timeline', content)
        self.assertIn('## The Long Peace', content)
        self.assertIn('A fragile accord.', content)
        self.assertIn('- Mira: Age 30-31', content)

    def test_json_and_markdown_round_trip_losslessly(self):
        json_events = parse_timeline_json(build_timeline_json('Sword Coast Calendar', 'harptos', EVENTS).encode())
        markdown_events = parse_timeline_markdown(build_timeline_markdown('Sword Coast Calendar', EVENTS).encode(), self.calendar)
        for imported in (json_events[0], markdown_events[0]):
            self.assertEqual(imported['name'], 'The Long Peace')
            self.assertEqual((imported['year'], imported['end_year']), (1474, 1475))
            self.assertEqual(imported['character_names'], ['Mira'])
            self.assertFalse(imported['is_player_visible'])
        with self.assertRaisesRegex(ValueError, 'cannot be imported'):
            parse_timeline_json(build_timeline_json('Sword Coast Calendar', 'harptos', EVENTS).encode(), 'gregorian')

    def test_plain_markdown_import_recognizes_export_date_structure(self):
        content = b'''# Old Campaign History\n\n## The Founding\n\n**Date:** Autumn, Year 1460\n\nThe city was founded.\n\n**Characters:**\n\n- Mira: Age 12\n'''
        imported = parse_timeline_markdown(content, self.calendar)
        self.assertEqual(imported[0]['name'], 'The Founding')
        self.assertEqual((imported[0]['year'], imported[0]['season']), (1460, 'Autumn'))
        self.assertEqual(imported[0]['character_names'], ['Mira'])

    def test_pdf_orientation_matches_requested_timeline_layout(self):
        portrait = fitz.open(stream=build_timeline_pdf('Sword Coast Calendar', EVENTS, 'portrait').getvalue(), filetype='pdf')
        landscape = fitz.open(stream=build_timeline_pdf('Sword Coast Calendar', EVENTS, 'landscape').getvalue(), filetype='pdf')
        self.assertLess(portrait[0].rect.width, portrait[0].rect.height)
        self.assertGreater(landscape[0].rect.width, landscape[0].rect.height)
        for document in (portrait, landscape):
            text = ''.join(page.get_text() for page in document)
            self.assertIn('The Long Peace', text)
            self.assertIn('Mira (Age 30-31)', text)

    def test_player_markdown_export_excludes_private_events(self):
        class Query:
            def __init__(self, rows): self.rows = rows
            def filter_by(self, **values):
                rows = self.rows
                if 'campaign_id' in values: rows = [row for row in rows if row.campaign_id == values['campaign_id']]
                if 'calendar_id' in values: rows = [row for row in rows if row.calendar_id == values['calendar_id']]
                if 'is_player_visible' in values: rows = [row for row in rows if row.is_player_visible == values['is_player_visible']]
                return Query(rows)
            def all(self): return self.rows
            def first(self): return self.rows[0] if self.rows else None

        def event(event_id, name, visible):
            row = SimpleNamespace(
                id=event_id, calendar_id=9, name=name, description=None, color=None,
                start_year=1491, season='Summer', start_month_index=None, start_day=None,
                end_year=None, end_season=None, end_month_index=None, end_day=None,
                start_hour=None, start_minute=None, is_player_visible=visible, characters=[],
            )
            row.to_dict = lambda row=row: {
                'id': row.id, 'calendar_id': 9, 'name': row.name, 'description': None, 'color': None,
                'year': 1491, 'season': 'Summer', 'month_index': None, 'day': None,
                'end_year': None, 'end_season': None, 'end_month_index': None, 'end_day': None,
                'hour': None, 'minute': None, 'is_player_visible': visible, 'npc_ids': [],
            }
            return row

        with app_module.app.app_context():
            token = create_access_token(identity='player')
            with patch.object(app_module, 'dashboard_campaign_context', return_value=(SimpleNamespace(id=2), None, False, None)), \
                 patch.object(app_module.Calendar, 'query', Query([self.calendar])), \
                 patch.object(app_module.CalendarEvent, 'query', Query([
                     event(1, 'Shared History', True), event(2, 'DM Secret', False),
                 ])):
                response = app_module.app.test_client().get(
                    '/api/calendar/5/timeline/export?format=markdown',
                    headers={'Authorization': f'Bearer {token}'},
                )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, 'text/markdown')
        self.assertIn('Shared History', response.get_data(as_text=True))
        self.assertNotIn('DM Secret', response.get_data(as_text=True))
        self.assertEqual(response.headers['Cache-Control'], 'private, no-store')

    def test_dm_previews_then_commits_additive_json_import(self):
        class Query:
            def __init__(self, rows): self.rows = rows
            def filter_by(self, **values):
                return Query([row for row in self.rows if all(getattr(row, key, None) == value for key, value in values.items())])
            def all(self): return self.rows
            def first(self): return self.rows[0] if self.rows else None

        existing = SimpleNamespace(
            id=1, calendar_id=9, name='Existing Event', start_year=1490, season='Summer',
            start_month_index=None, start_day=None, end_year=None, end_season=None,
            end_month_index=None, end_day=None,
        )
        document = build_timeline_json('Sword Coast Calendar', 'harptos', [
            {**EVENTS[0], 'name': 'Imported Event'},
            {'name': 'Existing Event', 'description': None, 'color': None, 'is_player_visible': False,
             'year': 1490, 'season': 'Summer', 'month_index': None, 'day': None,
             'end_year': None, 'end_season': None, 'end_month_index': None, 'end_day': None,
             'characters': [], 'date_label': 'Summer, Year 1490'},
        ]).encode()
        with app_module.app.app_context():
            token = create_access_token(identity='dm')
            client = app_module.app.test_client()
            patches = (
                patch.object(app_module, 'dashboard_campaign_context', return_value=(SimpleNamespace(id=2), None, True, None)),
                patch.object(app_module.Calendar, 'query', Query([self.calendar])),
                patch.object(app_module.CalendarEvent, 'query', Query([existing])),
                patch.object(app_module.NPC, 'query', Query([])),
                patch.object(app_module.db.session, 'add'),
                patch.object(app_module.db.session, 'commit'),
                patch.object(app_module, 'emit_calendar_updated'),
            )
            with patches[0], patches[1], patches[2], patches[3], patches[4] as add, patches[5] as commit, patches[6] as emit:
                preview = client.post('/api/calendar/5/timeline/import', data={
                    'file': (io.BytesIO(document), 'timeline.json'), 'commit': 'false',
                }, headers={'Authorization': f'Bearer {token}'}, content_type='multipart/form-data')
                saved = client.post('/api/calendar/5/timeline/import', data={
                    'file': (io.BytesIO(document), 'timeline.json'), 'commit': 'true',
                }, headers={'Authorization': f'Bearer {token}'}, content_type='multipart/form-data')
        self.assertEqual(preview.status_code, 200, preview.json)
        self.assertEqual(preview.json['summary'], {'detected': 2, 'duplicates': 1, 'invalid': 0, 'ready': 1, 'warnings': 1})
        self.assertEqual(saved.status_code, 201, saved.json)
        self.assertEqual(saved.json['imported'], 1)
        self.assertEqual(add.call_count, 1)
        self.assertEqual(add.call_args.args[0].name, 'Imported Event')
        commit.assert_called_once()
        emit.assert_called_once()

    def test_player_cannot_import_timeline_files(self):
        with app_module.app.app_context():
            token = create_access_token(identity='player')
            with patch.object(app_module, 'dashboard_campaign_context', return_value=(SimpleNamespace(id=3), None, False, None)):
                response = app_module.app.test_client().post('/api/calendar/5/timeline/import', data={
                    'file': (io.BytesIO(b'{"events": []}'), 'timeline.json'),
                }, headers={'Authorization': f'Bearer {token}'}, content_type='multipart/form-data')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json['message'], 'Only the campaign DM can import timeline events.')


if __name__ == '__main__':
    unittest.main()
