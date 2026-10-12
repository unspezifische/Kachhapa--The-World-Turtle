"""Password hashing, validation, and legacy-hash migration helpers."""

import hashlib
import hmac

from werkzeug.security import check_password_hash, generate_password_hash


PASSWORD_HASH_METHOD = "scrypt:32768:8:1"
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 256


def password_validation_error(password):
    if not isinstance(password, str):
        return "Password is required."
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
    if len(password) > MAX_PASSWORD_LENGTH:
        return f"Password must be no more than {MAX_PASSWORD_LENGTH} characters."
    return None


def hash_password(password):
    """Create a password hash using the application's current KDF."""
    return generate_password_hash(password, method=PASSWORD_HASH_METHOD)


def _check_legacy_sha256(stored_hash, password):
    """Verify Werkzeug's pre-3.0 ``sha256$salt$digest`` format.

    Werkzeug 3 removed support for this deprecated format. Keeping the small
    verifier here lets users migrate at login even after Werkzeug is upgraded.
    """
    try:
        method, salt, expected_digest = stored_hash.split("$", 2)
    except (AttributeError, ValueError):
        return False
    if method != "sha256" or not salt or not expected_digest:
        return False
    actual_digest = hmac.new(
        salt.encode("utf-8"),
        password.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(actual_digest, expected_digest)


def verify_password(stored_hash, password):
    """Return ``(matches, needs_rehash)`` for current and legacy hashes."""
    if not isinstance(stored_hash, str) or not isinstance(password, str):
        return False, False

    method = stored_hash.partition("$")[0]
    if method == "sha256":
        matches = _check_legacy_sha256(stored_hash, password)
        return matches, matches

    try:
        matches = check_password_hash(stored_hash, password)
    except (TypeError, ValueError):
        return False, False

    return matches, matches and method != PASSWORD_HASH_METHOD
