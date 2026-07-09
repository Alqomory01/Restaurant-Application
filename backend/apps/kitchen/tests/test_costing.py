from rest_framework import status

from .base import KitchenTestCase


class CostingPermissionTests(KitchenTestCase):
    def test_full_costing_forbidden_for_kitchen_staff(self):
        self.client.force_authenticate(self.kitchen_staff)
        res = self.client.get("/api/kitchen/costing/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_full_costing_forbidden_for_head_chef(self):
        """Head Chef gets the summary endpoint, not the full figures."""
        self.client.force_authenticate(self.head_chef)
        res = self.client.get("/api/kitchen/costing/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_full_costing_allowed_for_manager(self):
        self.client.force_authenticate(self.manager)
        res = self.client.get("/api/kitchen/costing/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        row = next(r for r in res.data if r["recipe_id"] == self.recipe.id)
        # 1kg @ ₦100/kg over a 2-portion yield = ₦50/portion theoretical cost
        # against a ₦500 selling price = 10% theoretical food cost.
        self.assertEqual(row["theoretical_cost_per_unit"], 50.0)
        self.assertEqual(row["theoretical_food_cost_pct"], 10.0)

    def test_summary_forbidden_for_kitchen_staff(self):
        self.client.force_authenticate(self.kitchen_staff)
        res = self.client.get("/api/kitchen/costing/summary/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_summary_allowed_for_head_chef_with_no_dollar_figures(self):
        self.client.force_authenticate(self.head_chef)
        res = self.client.get("/api/kitchen/costing/summary/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        row = next(r for r in res.data if r["recipe_id"] == self.recipe.id)
        self.assertEqual(set(row.keys()), {"recipe_id", "recipe_name", "status"})
        self.assertEqual(row["status"], "no_data")  # no completed batches yet

    def test_summary_status_over_target_when_actual_cost_exceeds_target(self):
        # Target food cost is 25% on a ₦500 selling price. Bump the
        # ingredient price to ₦300/kg *before* completing so the batch
        # snapshots a cost that pushes actual food cost to 30% — comfortably
        # past the "over_target" threshold (actual > target + 2pp).
        self.ingredient.unit_cost = "300.00"
        self.ingredient.save()
        batch = self.start_batch()
        self.client.force_authenticate(self.head_chef)
        self.client.post(
            f"/api/kitchen/batches/{batch.id}/complete/",
            {"actual_qty": "2", "quality_check": "PASSED"},
            format="json",
        )

        res = self.client.get("/api/kitchen/costing/summary/")
        row = next(r for r in res.data if r["recipe_id"] == self.recipe.id)
        self.assertEqual(row["status"], "over_target")

    def test_summary_status_on_target_for_a_clean_batch(self):
        batch = self.start_batch()
        self.client.force_authenticate(self.head_chef)
        self.client.post(
            f"/api/kitchen/batches/{batch.id}/complete/",
            {"actual_qty": "2", "quality_check": "PASSED"},
            format="json",
        )

        res = self.client.get("/api/kitchen/costing/summary/")
        row = next(r for r in res.data if r["recipe_id"] == self.recipe.id)
        self.assertEqual(row["status"], "on_target")
