import unittest
from types import SimpleNamespace
from unittest.mock import patch

import app as app_module


class QueryResult:
    def __init__(self, first=None, all_values=None):
        self._first = first
        self._all = all_values or []

    def filter_by(self, **_kwargs):
        return self

    def order_by(self, *_args):
        return self

    def first(self):
        return self._first

    def get(self, _key):
        return self._first

    def all(self):
        return self._all

    def update(self, *_args, **_kwargs):
        return 0


class RecordingSession:
    def __init__(self):
        self.deleted = []
        self.commits = 0

    def delete(self, value):
        self.deleted.append(value)

    def flush(self):
        pass

    def add(self, _value):
        pass

    def commit(self):
        self.commits += 1


class WorldAtlasTest(unittest.TestCase):
    def setUp(self):
        self.campaign = SimpleNamespace(id=12, dm_id=7, owner_id=7)
        self.user = SimpleNamespace(id=7, username='dm')
        self.location = app_module.WorldAtlasLocation(
            id=3,
            campaign_id=12,
            name='Pinewater Crossing',
            map_key='pinewater',
            settlement_type='town',
            status='active',
            atlas_x=0.25,
            atlas_y=0.75,
            terrain_strokes=[],
            roads=[],
            buildings=[],
            reference_layers=[],
        )

    def endpoint_patches(self, session):
        return (
            patch.object(app_module.Campaign, 'query', QueryResult(first=self.campaign)),
            patch.object(app_module.WorldAtlasLocation, 'query', QueryResult(first=self.location)),
            patch.object(app_module.User, 'query', QueryResult(first=self.user)),
            patch.object(app_module, 'get_jwt_identity', return_value='dm'),
            patch.object(app_module.db, 'session', session),
            patch.object(app_module.socketio, 'emit'),
        )

    def test_atlas_record_reports_placement_and_lifecycle(self):
        payload = self.location.atlas_dict()
        self.assertTrue(payload['placed'])
        self.assertEqual(payload['settlement_type'], 'town')
        self.assertEqual(payload['status'], 'active')

    def test_destroyed_settlement_is_retained_and_timestamped(self):
        session = RecordingSession()
        patches = self.endpoint_patches(session)
        with app_module.app.test_request_context(
            '/api/world-atlas/12/settlements/3', method='PATCH', json={'status': 'destroyed'}
        ), patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
            response, status = app_module.edit_world_atlas_settlement.__wrapped__(12, 3)

        self.assertEqual(status, 200)
        self.assertEqual(response.get_json()['status'], 'destroyed')
        self.assertIsNotNone(self.location.destroyed_at)
        self.assertEqual(session.deleted, [])
        self.assertEqual(session.commits, 1)

    def test_permanent_delete_requires_explicit_mistake_reason(self):
        session = RecordingSession()
        patches = self.endpoint_patches(session)
        with app_module.app.test_request_context(
            '/api/world-atlas/12/settlements/3', method='DELETE'
        ), patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
            response, status = app_module.edit_world_atlas_settlement.__wrapped__(12, 3)

        self.assertEqual(status, 400)
        self.assertIn('reason=mistake', response.get_json()['message'])
        self.assertEqual(session.deleted, [])
        self.assertEqual(session.commits, 0)


if __name__ == '__main__':
    unittest.main()
