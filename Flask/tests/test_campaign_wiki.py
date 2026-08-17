import unittest
from types import SimpleNamespace
from unittest.mock import patch

import app as app_module


class QueryResult:
    def __init__(self, *, first=None, all=None):
        self._first = first
        self._all = [] if all is None else all

    def filter_by(self, **_kwargs):
        return self

    def filter(self, *_args):
        return self

    def order_by(self, *_args):
        return self

    def first(self):
        return self._first

    def all(self):
        return self._all

    def get_or_404(self, _key):
        return self._first


class RecordingSession:
    def __init__(self):
        self.pages = []

    def add(self, value):
        if isinstance(value, app_module.Campaign):
            value.id = 42
        elif isinstance(value, app_module.Page):
            value.id = len(self.pages) + 1
            value.wiki_id = value.wiki.id
            self.pages.append(value)

    def flush(self):
        pass

    def execute(self, _statement):
        pass

    def commit(self):
        pass


class CampaignWikiSeedingTest(unittest.TestCase):
    def test_created_module_campaign_exposes_seeded_pages_and_main_page(self):
        user = app_module.User(id=7, username='dm')
        module_pages = [
            SimpleNamespace(
                name='Arrival',
                data={'title': 'Arrival', 'content': 'Meet at the gate.'}
            ),
            SimpleNamespace(
                name='Arrival duplicate',
                data={'title': 'Arrival', 'content': 'Duplicate content.'}
            ),
            SimpleNamespace(
                name='Module main',
                data={'title': 'Main Page', 'content': 'Conflicting main.'}
            ),
        ]
        session = RecordingSession()

        with app_module.app.test_request_context(
            '/api/campaigns',
            method='POST',
            json={
                'name': 'API campaign',
                'system': 'D&D 5e',
                'module': 'Starter Module',
            },
        ), patch.object(
            app_module, 'get_jwt_identity', return_value='dm'
        ), patch.object(
            app_module.User, 'query', QueryResult(first=user)
        ), patch.object(
            app_module.GameElement, 'query', QueryResult(all=module_pages)
        ), patch.object(
            app_module.db, 'session', session
        ):
            response, status = app_module.campaigns.__wrapped__()

        self.assertEqual(status, 201)
        self.assertEqual(response.get_json()['id'], 42)
        self.assertEqual(
            [page.title for page in session.pages],
            ['Arrival', 'Main Page'],
        )
        self.assertEqual(
            session.pages[1].content,
            'This campaign is using the Starter Module module.',
        )

        campaign = session.pages[0].wiki
        with app_module.app.app_context(), patch.object(
                app_module.Campaign, 'query', QueryResult(first=campaign)
        ), patch.object(
                app_module.Page, 'query', QueryResult(all=session.pages)
        ):
            api_response = app_module.app.test_client().get(
                '/api/campaigns/42/wiki'
            )

        self.assertEqual(api_response.status_code, 200)
        self.assertEqual(
            [(page['title'], page['content']) for page in api_response.get_json()],
            [
                ('Arrival', 'Meet at the gate.'),
                (
                    'Main Page',
                    'This campaign is using the Starter Module module.',
                ),
            ],
        )


if __name__ == '__main__':
    unittest.main()
