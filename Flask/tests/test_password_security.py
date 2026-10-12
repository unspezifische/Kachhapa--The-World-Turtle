import hashlib
import hmac
import unittest

from password_security import (
    PASSWORD_HASH_METHOD,
    hash_password,
    password_validation_error,
    verify_password,
)


class PasswordSecurityTests(unittest.TestCase):
    def test_new_hashes_use_scrypt(self):
        stored_hash = hash_password('correct horse battery staple')

        self.assertTrue(stored_hash.startswith(f'{PASSWORD_HASH_METHOD}$'))
        self.assertEqual(verify_password(stored_hash, 'correct horse battery staple'), (True, False))
        self.assertEqual(verify_password(stored_hash, 'wrong password'), (False, False))

    def test_legacy_sha256_hash_is_accepted_and_marked_for_rehash(self):
        salt = 'legacy-salt'
        password = 'old password'
        digest = hmac.new(
            salt.encode('utf-8'),
            password.encode('utf-8'),
            hashlib.sha256,
        ).hexdigest()
        stored_hash = f'sha256${salt}${digest}'

        self.assertEqual(verify_password(stored_hash, password), (True, True))
        self.assertEqual(verify_password(stored_hash, 'wrong password'), (False, False))

    def test_malformed_hash_fails_closed(self):
        self.assertEqual(verify_password('sha256$broken', 'password'), (False, False))
        self.assertEqual(verify_password(None, 'password'), (False, False))

    def test_new_passwords_require_eight_characters(self):
        self.assertIsNotNone(password_validation_error('short'))
        self.assertIsNone(password_validation_error('12345678'))


if __name__ == '__main__':
    unittest.main()
