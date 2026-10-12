import io
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from flask_jwt_extended import create_access_token
from PIL import Image

import app as app_module


class DashboardProfileApiTests(unittest.TestCase):
    def setUp(self):
        self.previous_testing = app_module.app.config.get('TESTING')
        app_module.app.config['TESTING'] = True
        self.context = app_module.app.app_context()
        self.context.push()
        self.client = app_module.app.test_client()
        self.headers = {'Authorization': f"Bearer {create_access_token(identity='tester')}"}
        self.user = app_module.User(id=3, username='tester', real_name=None, bio=None)
        self.campaign = SimpleNamespace(id=7, dm_id=9, owner_id=9)

    def tearDown(self):
        self.context.pop()
        app_module.app.config['TESTING'] = self.previous_testing

    def test_profile_fields_are_private_and_editable(self):
        with patch.object(app_module.User, 'query') as query, patch.object(app_module.db.session, 'commit'):
            query.filter_by.return_value.first.return_value = self.user
            response = self.client.patch('/api/profile', json={'real_name': 'Taylor', 'bio': 'I like puzzles.'}, headers=self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['real_name'], 'Taylor')
            self.assertEqual(response.json['bio'], 'I like puzzles.')
            self.user.campaigns = []
            self.assertNotIn('real_name', self.user.to_dict())
            private = self.client.get('/api/profile/photo', headers=self.headers)
            self.assertEqual(private.status_code, 404)
        self.assertEqual(self.client.get('/api/profile').status_code, 401)

    def test_photo_upload_is_normalized_and_requires_owner_token(self):
        source = io.BytesIO()
        Image.new('RGB', (900, 450), '#795c39').save(source, format='PNG')
        source.seek(0)
        with patch.object(app_module.User, 'query') as query, patch.object(app_module.db.session, 'commit'):
            query.filter_by.return_value.first.return_value = self.user
            response = self.client.post('/api/profile/photo', data={'photo': (source, 'portrait.png')}, content_type='multipart/form-data', headers=self.headers)
            self.assertEqual(response.status_code, 200)
            with Image.open(io.BytesIO(self.user.profile_photo)) as saved:
                self.assertEqual(saved.size, (512, 512))
                self.assertEqual(saved.format, 'WEBP')
            self.assertEqual(self.client.get('/api/profile/photo', headers=self.headers).status_code, 200)
        self.assertEqual(self.client.get('/api/profile/photo').status_code, 401)

    def test_gif_profile_photos_are_preserved_with_their_gif_content_type(self):
        source = io.BytesIO()
        Image.new('P', (24, 24), 1).save(source, format='GIF')
        source.seek(0)
        with patch.object(app_module.User, 'query') as query, patch.object(app_module.db.session, 'commit'):
            query.filter_by.return_value.first.return_value = self.user
            response = self.client.post('/api/profile/photo', data={'photo': (source, 'portrait.gif')}, content_type='multipart/form-data', headers=self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertTrue(bytes(self.user.profile_photo).startswith(b'GIF'))
            photo = self.client.get('/api/profile/photo', headers=self.headers)
            self.assertEqual(photo.status_code, 200)
            self.assertEqual(photo.mimetype, 'image/gif')

    def test_password_confirmation_requires_the_current_users_password(self):
        self.user.password = app_module.hash_password('correct-password')
        with patch.object(app_module.User, 'query') as query:
            query.filter_by.return_value.first.return_value = self.user
            response = self.client.post('/api/profile/verify-password', json={'password': 'correct-password'}, headers=self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json['verified'])
            denied = self.client.post('/api/profile/verify-password', json={'password': 'not-it'}, headers=self.headers)
            self.assertEqual(denied.status_code, 401)

    def test_player_notes_are_bound_to_membership_character_and_dm_notes_are_not(self):
        with patch.object(app_module, 'dashboard_campaign_context') as context, \
             patch.object(app_module.db.session, 'add') as add, \
             patch.object(app_module.db.session, 'commit'), \
             patch.object(app_module.QuickNote, 'to_dict', return_value={'id': 1}):
            context.return_value = (self.user, self.campaign, False, 42)
            response = self.client.post('/api/campaigns/7/quick-notes', json={'content': 'Ask about the map'}, headers=self.headers)
            self.assertEqual(response.status_code, 201)
            self.assertEqual(add.call_args.args[0].character_id, 42)
            context.return_value = (self.user, self.campaign, True, None)
            response = self.client.post('/api/campaigns/7/quick-notes', json={'content': 'Prepare an ambush'}, headers=self.headers)
            self.assertEqual(response.status_code, 201)
            self.assertIsNone(add.call_args.args[0].character_id)
            context.return_value = (self.user, self.campaign, False, None)
            response = self.client.post('/api/campaigns/7/quick-notes', json={'content': 'No character'}, headers=self.headers)
            self.assertEqual(response.status_code, 409)

    def test_other_users_cannot_edit_or_delete_a_note(self):
        with patch.object(app_module.User, 'query') as user_query, \
             patch.object(app_module.QuickNote, 'query') as note_query:
            user_query.filter_by.return_value.first.return_value = self.user
            note_query.filter_by.return_value.first.return_value = None
            self.assertEqual(self.client.patch('/api/quick-notes/81', json={'content': 'Changed'}, headers=self.headers).status_code, 404)
            self.assertEqual(self.client.delete('/api/quick-notes/81', headers=self.headers).status_code, 404)
            note_query.filter_by.assert_called_with(id=81, user_id=self.user.id)

    def test_notes_and_landing_preferences_reject_unrelated_campaigns(self):
        with patch.object(app_module, 'dashboard_campaign_context', return_value=(None, None, None, None)):
            self.assertEqual(self.client.get('/api/campaigns/7/quick-notes', headers=self.headers).status_code, 404)
            self.assertEqual(self.client.patch('/api/campaigns/7/landing', json={'landing_path': '/journal'}, headers=self.headers).status_code, 404)

    def test_landing_preferences_enforce_role_and_character_requirements(self):
        with patch.object(app_module, 'dashboard_campaign_context') as context, \
             patch.object(app_module.UserCampaignPreference, 'query') as query, \
             patch.object(app_module.db.session, 'add') as add, \
             patch.object(app_module.db.session, 'commit'):
            query.filter_by.return_value.first.return_value = None
            context.return_value = (self.user, self.campaign, False, None)
            self.assertEqual(self.client.patch('/api/campaigns/7/landing', json={'landing_path': '/journal'}, headers=self.headers).status_code, 409)
            self.assertEqual(self.client.patch('/api/campaigns/7/landing', json={'landing_path': '/dmTools'}, headers=self.headers).status_code, 400)
            context.return_value = (self.user, self.campaign, False, 42)
            response = self.client.patch('/api/campaigns/7/landing', json={'landing_path': '/journal'}, headers=self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(add.call_args.args[0].landing_path, '/journal')
            context.return_value = (self.user, self.campaign, True, None)
            response = self.client.patch('/api/campaigns/7/landing', json={'landing_path': '/dmTools'}, headers=self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(add.call_args.args[0].landing_path, '/dmTools')

    def test_player_calendar_hides_dm_only_events(self):
        calendar = SimpleNamespace(to_dict=lambda: {'configured': True, 'events': [
            {'id': 1, 'name': 'Secret', 'is_player_visible': False},
            {'id': 2, 'name': 'Festival', 'is_player_visible': True},
        ]})
        with patch.object(app_module, 'dashboard_campaign_context', return_value=(self.user, self.campaign, False, 42)), \
             patch.object(app_module.Calendar, 'query') as query:
            query.filter_by.return_value.first.return_value = calendar
            response = self.client.get('/api/calendar/7', headers=self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual([event['name'] for event in response.json['events']], ['Festival'])
        with patch.object(app_module, 'dashboard_campaign_context', return_value=(None, None, None, None)):
            self.assertEqual(self.client.get('/api/calendar/7', headers=self.headers).status_code, 404)

    def test_only_dm_can_create_player_visible_events(self):
        calendar = SimpleNamespace(id=11, campaign_id=7)
        with patch.object(app_module, 'dashboard_campaign_context') as context, \
             patch.object(app_module.Calendar, 'query') as query, \
             patch.object(app_module.db.session, 'add') as add, \
             patch.object(app_module.db.session, 'commit'), \
             patch.object(app_module, 'emit_calendar_updated'), \
             patch.object(app_module.CalendarEvent, 'to_dict', return_value={'is_player_visible': True}):
            query.filter_by.return_value.first.return_value = calendar
            body = {'name': 'Harvest fair', 'year': 2, 'month_index': 3, 'day': 4, 'is_player_visible': True}
            context.return_value = (self.user, self.campaign, False, 42)
            self.assertEqual(self.client.post('/api/calendar/7/events', json=body, headers=self.headers).status_code, 403)
            context.return_value = (self.user, self.campaign, True, None)
            self.assertEqual(self.client.post('/api/calendar/7/events', json=body, headers=self.headers).status_code, 201)
            self.assertTrue(add.call_args.args[0].is_player_visible)


if __name__ == '__main__':
    unittest.main()
