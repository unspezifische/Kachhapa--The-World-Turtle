import unittest
from types import SimpleNamespace
from unittest.mock import patch

from flask_jwt_extended import create_access_token

import app as app_module


class SpatialApiTests(unittest.TestCase):
    def setUp(self):
        self.previous_testing = app_module.app.config.get('TESTING')
        app_module.app.config['TESTING'] = True
        self.context = app_module.app.app_context()
        self.context.push()
        self.client = app_module.app.test_client()
        self.headers = {'Authorization': f"Bearer {create_access_token(identity='dm')}"}
        self.campaign = SimpleNamespace(id=7, dm_id=11, owner_id=12)
        self.user = SimpleNamespace(id=11, username='dm')
        self.patchers = []

    def tearDown(self):
        for patcher in reversed(self.patchers):
            patcher.stop()
        self.context.pop()
        app_module.app.config['TESTING'] = self.previous_testing

    def authorization(self, user=None):
        campaign_patch = patch.object(app_module.Campaign, 'query')
        user_patch = patch.object(app_module.User, 'query')
        campaign_query = campaign_patch.start()
        user_query = user_patch.start()
        self.patchers.extend((campaign_patch, user_patch))
        campaign_query.get.return_value = self.campaign
        user_query.filter_by.return_value.first.return_value = self.user if user is None else user

    def test_space_creation_uses_campaign_scope_and_requires_dm(self):
        self.authorization()
        space = SimpleNamespace(id='space')
        with patch.object(app_module, 'create_space', return_value=space) as create, \
             patch.object(app_module, 'space_dict', return_value={'id': 'space'}), \
             patch.object(app_module.db.session, 'commit'):
            response = self.client.post('/api/campaigns/7/spatial-spaces', json={'name': 'Library'}, headers=self.headers)
        self.assertEqual(response.status_code, 201)
        create.assert_called_once_with(7, {'name': 'Library'})
        self.assertEqual(self.client.post('/api/campaigns/7/spatial-spaces', json={'name': 'No token'}).status_code, 401)

    def test_non_dm_and_cross_campaign_resources_are_hidden(self):
        self.authorization(SimpleNamespace(id=99, username='player'))
        response = self.client.get('/api/campaigns/7/spatial-spaces', headers=self.headers)
        self.assertEqual(response.status_code, 403)

    def test_validation_conflict_and_missing_resource_statuses(self):
        self.authorization()
        with patch.object(app_module, 'create_space', side_effect=app_module.SpatialValidationError('bad space')), \
             patch.object(app_module.db.session, 'rollback'):
            response = self.client.post('/api/campaigns/7/spatial-spaces', json={}, headers=self.headers)
        self.assertEqual((response.status_code, response.json['message']), (400, 'bad space'))
        with patch.object(app_module.SpatialSpace, 'query') as query:
            query.filter_by.return_value.first.return_value = None
            response = self.client.get('/api/campaigns/7/spatial-spaces/foreign-space', headers=self.headers)
        self.assertEqual(response.status_code, 404)

    def test_graph_contract_and_required_filters(self):
        self.authorization()
        expected = {'spaces': [], 'endpoints': [], 'connections': []}
        with patch.object(app_module, 'spatial_graph', return_value=expected) as graph, \
             patch.object(app_module.db.session, 'commit'):
            response = self.client.get(
                '/api/campaigns/7/spatial-graph?settlement_id=10&building_id=tower', headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, expected)
        graph.assert_called_once_with(7, 10, 'tower')
        response = self.client.get('/api/campaigns/7/spatial-graph?building_id=tower', headers=self.headers)
        self.assertEqual(response.status_code, 400)


if __name__ == '__main__':
    unittest.main()
