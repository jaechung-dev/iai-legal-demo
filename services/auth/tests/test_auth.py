"""
Smoke tests for services/auth/service.py

No real DB or network calls — psycopg2 is mocked so the module can import cleanly.
"""
import unittest
from unittest.mock import MagicMock, patch

# Patch psycopg2 before any import of the auth service so seed_db() and _db()
# don't try to open a real connection.
_PSYCOPG2_PATCH = patch("psycopg2.connect", side_effect=Exception("no db in tests"))


def _import_service():
    with _PSYCOPG2_PATCH:
        import importlib
        import services.auth.service as svc
        importlib.reload(svc)
        return svc


# ---------------------------------------------------------------------------
# Test: _h() — SHA-256 hex digest helper
# ---------------------------------------------------------------------------

class TestHashHelper(unittest.TestCase):
    def setUp(self):
        self.svc = _import_service()

    def test_returns_64_char_hex_string(self):
        result = self.svc._h("password")
        self.assertIsInstance(result, str)
        self.assertEqual(len(result), 64)
        # Confirm it is hex
        int(result, 16)

    def test_deterministic(self):
        self.assertEqual(self.svc._h("same"), self.svc._h("same"))

    def test_collision_resistance(self):
        self.assertNotEqual(self.svc._h("a"), self.svc._h("b"))

    def test_empty_string_still_returns_64_chars(self):
        result = self.svc._h("")
        self.assertEqual(len(result), 64)

    def test_known_sha256_value(self):
        # sha256("abc") = ba7816bf8f01cfea414140de5dae2ec73b00361bbef0469fa72a67747c
        #                   864fbc  (64 chars)
        import hashlib
        expected = hashlib.sha256(b"abc").hexdigest()
        self.assertEqual(self.svc._h("abc"), expected)


# ---------------------------------------------------------------------------
# Test: router has the expected routes
# ---------------------------------------------------------------------------

class TestRouterRoutes(unittest.TestCase):
    def setUp(self):
        self.svc = _import_service()

    def _route_paths(self):
        return {route.path for route in self.svc.router.routes}

    def test_register_route_exists(self):
        self.assertIn("/auth/register", self._route_paths())

    def test_login_route_exists(self):
        self.assertIn("/auth/login", self._route_paths())

    def test_refresh_route_exists(self):
        self.assertIn("/auth/refresh", self._route_paths())

    def test_logout_route_exists(self):
        self.assertIn("/auth/logout", self._route_paths())

    def test_me_route_exists(self):
        self.assertIn("/auth/me", self._route_paths())


# ---------------------------------------------------------------------------
# Test: _hash_password / _verify_password round-trip
# ---------------------------------------------------------------------------

class TestPasswordHashing(unittest.TestCase):
    def setUp(self):
        self.svc = _import_service()

    def test_hash_and_verify_succeeds(self):
        salt = "randomsalt16char"
        pw   = "SecurePass123!"
        h    = self.svc._hash_password(pw, salt)
        self.assertTrue(self.svc._verify_password(pw, salt, h))

    def test_wrong_password_fails_verify(self):
        salt = "randomsalt16char"
        h    = self.svc._hash_password("correct", salt)
        self.assertFalse(self.svc._verify_password("wrong", salt, h))

    def test_wrong_salt_fails_verify(self):
        h = self.svc._hash_password("password", "salt1")
        self.assertFalse(self.svc._verify_password("password", "salt2", h))


if __name__ == "__main__":
    unittest.main()
