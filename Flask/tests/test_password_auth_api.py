import hashlib
import hmac
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from flask_jwt_extended import create_access_token

import app as app_module
from password_security import hash_password


def legacy_sha256_hash(password, salt='legacy-salt'):
    digest = hmac.new(
        salt.encode('utf-8'),
        password.encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()
    return f'sha256${salt}${digest}'


class PasswordAuthApiTests(unittest.TestCase):
    def setUp(self):
        self.previous_testing = app_module.app.config.get('TESTING')
        app_module.app.config['TESTING'] = True
        self.app_context = app_module.app.app_context()
        self.app_context.push()
        self.client = app_module.app.test_client()

    def tearDown(self):
        self.app_context.pop()
        app_module.app.config['TESTING'] = self.previous_testing

    def test_login_rehashes_a_valid_legacy_password(self):
        user = SimpleNamespace(
            id=7,
            username='alice',
            password=legacy_sha256_hash('old password'),
            is_online=False,
        )

        with patch.object(app_module.User, 'query') as query, \
             patch.object(app_module.db.session, 'commit') as commit:
            query.filter_by.return_value.first.return_value = user
            response = self.client.post('/api/login', json={
                'username': 'Alice',
                'password': 'old password',
            })

        self.assertEqual(response.status_code, 200)
        self.assertTrue(user.password.startswith('scrypt:32768:8:1$'))
        self.assertTrue(user.is_online)
        commit.assert_called_once()

    def test_login_rehashes_a_short_legacy_password_without_enforcing_new_policy(self):
        user = SimpleNamespace(
            id=8,
            username='legacy-user',
            password=legacy_sha256_hash('1234'),
            is_online=False,
        )

        with patch.object(app_module.User, 'query') as query, \
             patch.object(app_module.db.session, 'commit') as commit:
            query.filter_by.return_value.first.return_value = user
            response = self.client.post('/api/login', json={
                'username': 'legacy-user',
                'password': '1234',
            })

        self.assertEqual(response.status_code, 200)
        self.assertTrue(user.password.startswith('scrypt:32768:8:1$'))
        commit.assert_called_once()

    def test_password_change_requires_the_current_password(self):
        user = SimpleNamespace(
            id=7,
            username='alice',
            password=hash_password('current password'),
        )
        token = create_access_token(identity='alice')

        with patch.object(app_module.User, 'query') as query, \
             patch.object(app_module.db.session, 'commit') as commit:
            query.filter_by.return_value.first.return_value = user
            response = self.client.patch(
                '/api/profile/password',
                json={
                    'current_password': 'incorrect password',
                    'new_password': 'a new secure password',
                },
                headers={'Authorization': f'Bearer {token}'},
            )

        self.assertEqual(response.status_code, 401)
        commit.assert_not_called()

    def test_password_change_stores_a_new_scrypt_hash(self):
        user = SimpleNamespace(
            id=7,
            username='alice',
            password=hash_password('current password'),
        )
        token = create_access_token(identity='alice')

        with patch.object(app_module.User, 'query') as query, \
             patch.object(app_module.db.session, 'commit') as commit:
            query.filter_by.return_value.first.return_value = user
            response = self.client.patch(
                '/api/profile/password',
                json={
                    'current_password': 'current password',
                    'new_password': 'a new secure password',
                },
                headers={'Authorization': f'Bearer {token}'},
            )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(user.password.startswith('scrypt:32768:8:1$'))
        commit.assert_called_once()


if __name__ == '__main__':
    unittest.main()
