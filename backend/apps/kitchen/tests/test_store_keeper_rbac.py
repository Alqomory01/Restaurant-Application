from rest_framework import status

from .base import KitchenTestCase


class StoreKeeperKitchenAccessTests(KitchenTestCase):
    """Store Keeper is a Store-module role — it should have no more access
    to Kitchen's manager-gated data than an unrelated outsider would.
    Confirms adding the role didn't accidentally fall through any of the
    `is_superuser` bypasses every permission check has."""

    def test_store_keeper_forbidden_from_costing(self):
        self.client.force_authenticate(self.store_keeper)
        res = self.client.get("/api/kitchen/costing/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_store_keeper_forbidden_from_costing_summary(self):
        self.client.force_authenticate(self.store_keeper)
        res = self.client.get("/api/kitchen/costing/summary/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_store_keeper_forbidden_from_reports(self):
        self.client.force_authenticate(self.store_keeper)
        res = self.client.get("/api/kitchen/reports/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_store_keeper_forbidden_from_activity_log(self):
        self.client.force_authenticate(self.store_keeper)
        res = self.client.get("/api/kitchen/activity/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_store_keeper_is_not_superuser_or_staff(self):
        self.assertFalse(self.store_keeper.is_superuser)
        self.assertFalse(self.store_keeper.is_staff)

    def test_store_keeper_does_not_see_wastage_cost_value(self):
        self.client.force_authenticate(self.store_keeper)
        res = self.client.post(
            "/api/kitchen/wastage/",
            {"ingredient": self.ingredient.id, "qty": "1", "reason": "SPOILAGE"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(res.data["value"])
