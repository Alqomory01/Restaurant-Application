from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import AuditLog, User


class AuthFlowTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("chef", password="correct-horse", role=User.Role.HEAD_CHEF)

    def test_login_success_returns_access_token_and_sets_refresh_cookie(self):
        res = self.client.post(
            "/api/auth/login", {"username": "chef", "password": "correct-horse"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access", res.data)
        self.assertEqual(res.data["user"]["username"], "chef")
        self.assertIn("refresh_token", res.cookies)
        self.assertTrue(res.cookies["refresh_token"]["httponly"])

    def test_login_wrong_password_rejected(self):
        res = self.client.post("/api/auth/login", {"username": "chef", "password": "wrong"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn("refresh_token", res.cookies)

    def test_refresh_without_cookie_rejected(self):
        res = self.client.post("/api/auth/refresh")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_with_valid_cookie_issues_new_access_token(self):
        login_res = self.client.post(
            "/api/auth/login", {"username": "chef", "password": "correct-horse"}, format="json"
        )
        old_access = login_res.data["access"]

        refresh_res = self.client.post("/api/auth/refresh")
        self.assertEqual(refresh_res.status_code, status.HTTP_200_OK)
        self.assertIn("access", refresh_res.data)
        self.assertNotEqual(refresh_res.data["access"], old_access)

    def test_logout_blacklists_the_refresh_token(self):
        login_res = self.client.post(
            "/api/auth/login", {"username": "chef", "password": "correct-horse"}, format="json"
        )
        access = login_res.data["access"]
        old_refresh_value = self.client.cookies["refresh_token"].value

        logout_res = self.client.post(
            "/api/auth/logout", HTTP_AUTHORIZATION=f"Bearer {access}"
        )
        self.assertEqual(logout_res.status_code, status.HTTP_204_NO_CONTENT)

        # Re-attach the now-blacklisted refresh token by hand and confirm
        # it's genuinely dead, not just cleared client-side.
        self.client.cookies["refresh_token"] = old_refresh_value
        replay_res = self.client.post("/api/auth/refresh")
        self.assertEqual(replay_res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_requires_authentication(self):
        res = self.client.get("/api/auth/me")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_current_user(self):
        login_res = self.client.post(
            "/api/auth/login", {"username": "chef", "password": "correct-horse"}, format="json"
        )
        access = login_res.data["access"]
        res = self.client.get("/api/auth/me", HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["username"], "chef")
        self.assertEqual(res.data["role"], "HEAD_CHEF")


class AuditLogTests(APITestCase):
    def test_log_action_records_actor_and_object(self):
        from apps.accounts.utils import log_action

        user = User.objects.create_user("mgr", password="pw", role=User.Role.MANAGER)
        target = User.objects.create_user("someone", password="pw")

        log_action(user, "TESTED", target, detail="just checking")

        entry = AuditLog.objects.get()
        self.assertEqual(entry.actor, user)
        self.assertEqual(entry.action, "TESTED")
        self.assertEqual(entry.model_name, "User")
        self.assertEqual(entry.object_id, str(target.pk))
        self.assertEqual(entry.detail, "just checking")

    def test_log_action_handles_unauthenticated_actor(self):
        from django.contrib.auth.models import AnonymousUser

        from apps.accounts.utils import log_action

        target = User.objects.create_user("someone", password="pw")
        log_action(AnonymousUser(), "TESTED", target)

        entry = AuditLog.objects.get()
        self.assertIsNone(entry.actor)
