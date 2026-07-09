from decimal import Decimal

from rest_framework import status

from .base import KitchenTestCase


class ReportsTests(KitchenTestCase):
    def _complete_batch(self, actual_qty="2"):
        batch = self.start_batch()
        self.client.force_authenticate(self.head_chef)
        self.client.post(
            f"/api/kitchen/batches/{batch.id}/complete/",
            {"actual_qty": actual_qty, "quality_check": "PASSED"},
            format="json",
        )
        return batch

    def test_forbidden_for_kitchen_staff(self):
        self.client.force_authenticate(self.kitchen_staff)
        res = self.client.get("/api/kitchen/reports/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_batch_efficiency_and_utilization(self):
        batch = self._complete_batch(actual_qty="2")
        self.client.force_authenticate(self.manager)
        self.client.post(
            "/api/kitchen/wastage/",
            {"batch": batch.id, "qty": "0.5", "reason": "OVER_PRODUCTION"},
            format="json",
        )

        res = self.client.get("/api/kitchen/reports/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        row = next(r for r in res.data["batch_efficiency"] if r["recipe_id"] == self.recipe.id)
        self.assertEqual(row["batches_count"], 1)
        self.assertEqual(row["planned_qty"], Decimal("2"))
        self.assertEqual(row["actual_qty"], Decimal("2"))
        self.assertEqual(row["production_efficiency_pct"], Decimal("100.0"))
        self.assertEqual(row["wasted_qty"], Decimal("0.5"))
        # utilization = (2 - 0.5) / 2 * 100 = 75%
        self.assertEqual(row["utilization_pct"], Decimal("75.0"))
        self.assertIn("wasted_value", row, "manager should see wastage cost figures")

    def test_head_chef_sees_no_money_figures(self):
        batch = self._complete_batch()
        self.client.force_authenticate(self.head_chef)
        self.client.post(
            "/api/kitchen/wastage/",
            {"batch": batch.id, "qty": "0.5", "reason": "OVER_PRODUCTION"},
            format="json",
        )

        res = self.client.get("/api/kitchen/reports/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        for row in res.data["batch_efficiency"]:
            self.assertNotIn("wasted_value", row)
        self.assertNotIn("total_value", res.data["wastage_summary"])
        for r in res.data["wastage_summary"]["by_reason"]:
            self.assertNotIn("value", r)
        for s in res.data["staff_output"]:
            self.assertNotIn("wastage_value", s)

    def test_wastage_summary_by_reason_and_staff_output(self):
        self._complete_batch()
        self.client.force_authenticate(self.kitchen_staff)
        self.client.post(
            "/api/kitchen/wastage/",
            {"ingredient": self.ingredient.id, "qty": "1", "reason": "SPOILAGE"},
            format="json",
        )

        self.client.force_authenticate(self.manager)
        res = self.client.get("/api/kitchen/reports/")
        self.assertEqual(res.data["wastage_summary"]["total_count"], 1)
        self.assertEqual(res.data["wastage_summary"]["total_value"], Decimal("100.00"))
        reason_row = res.data["wastage_summary"]["by_reason"][0]
        self.assertEqual(reason_row["reason"], "SPOILAGE")
        self.assertEqual(reason_row["count"], 1)

        staff = {s["user_id"]: s for s in res.data["staff_output"]}
        self.assertEqual(staff[self.head_chef.id]["batches_completed"], 1)
        self.assertEqual(staff[self.kitchen_staff.id]["wastage_logged"], 1)
        self.assertEqual(staff[self.kitchen_staff.id]["wastage_value"], Decimal("100.00"))

    def test_date_range_filters_out_of_range_activity(self):
        self._complete_batch()
        self.client.force_authenticate(self.manager)
        res = self.client.get("/api/kitchen/reports/?date_from=2020-01-01&date_to=2020-01-02")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["batch_efficiency"], [])
        self.assertEqual(res.data["wastage_summary"]["total_count"], 0)
        self.assertEqual(res.data["staff_output"], [])
