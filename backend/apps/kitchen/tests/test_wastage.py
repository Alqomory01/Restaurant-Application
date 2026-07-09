from decimal import Decimal

from rest_framework import status

from apps.kitchen.models import WastageLog

from .base import KitchenTestCase


class WastageLogTests(KitchenTestCase):
    def test_ingredient_wastage_deducts_stock_and_snapshots_cost(self):
        self.client.force_authenticate(self.kitchen_staff)
        res = self.client.post(
            "/api/kitchen/wastage/",
            {"ingredient": self.ingredient.id, "qty": "3", "reason": "SPOILAGE", "notes": "went off"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        self.stock.refresh_from_db()
        self.assertEqual(self.stock.qty_on_hand, Decimal("7"))

        entry = WastageLog.objects.get(ingredient=self.ingredient)
        self.assertEqual(entry.unit_cost_at_time, Decimal("100.00"))

    def test_ingredient_wastage_insufficient_stock_returns_409_and_writes_nothing(self):
        self.client.force_authenticate(self.kitchen_staff)
        res = self.client.post(
            "/api/kitchen/wastage/",
            {"ingredient": self.ingredient.id, "qty": "999", "reason": "SPOILAGE"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.qty_on_hand, Decimal("10"))
        self.assertFalse(WastageLog.objects.exists())

    def test_batch_wastage_does_not_touch_stock(self):
        batch = self.start_batch()
        self.client.force_authenticate(self.head_chef)
        self.client.post(
            f"/api/kitchen/batches/{batch.id}/complete/",
            {"actual_qty": "2", "quality_check": "PASSED"},
            format="json",
        )
        self.stock.refresh_from_db()
        stock_after_batch = self.stock.qty_on_hand  # 8

        res = self.client.post(
            "/api/kitchen/wastage/",
            {"batch": batch.id, "qty": "1", "reason": "OVER_PRODUCTION"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        self.stock.refresh_from_db()
        self.assertEqual(
            self.stock.qty_on_hand, stock_after_batch,
            "finished-batch wastage must not deduct — ingredients were already deducted at batch completion",
        )

    def test_requires_exactly_one_of_ingredient_or_batch(self):
        self.client.force_authenticate(self.manager)
        res = self.client.post("/api/kitchen/wastage/", {"qty": "1", "reason": "OTHER"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        batch = self.start_batch()
        res = self.client.post(
            "/api/kitchen/wastage/",
            {"ingredient": self.ingredient.id, "batch": batch.id, "qty": "1", "reason": "OTHER"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_value_hidden_from_kitchen_staff_but_visible_to_manager(self):
        self.client.force_authenticate(self.manager)
        self.client.post(
            "/api/kitchen/wastage/",
            {"ingredient": self.ingredient.id, "qty": "2", "reason": "SPOILAGE"},
            format="json",
        )

        self.client.force_authenticate(self.kitchen_staff)
        res = self.client.get("/api/kitchen/wastage/")
        self.assertIsNone(res.data[0]["value"])

        self.client.force_authenticate(self.manager)
        res = self.client.get("/api/kitchen/wastage/")
        self.assertEqual(res.data[0]["value"], "200.00")
