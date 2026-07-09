from decimal import Decimal

from rest_framework import status

from apps.kitchen.models import BatchProduction, IngredientDeduction, ProductionPlanItem

from .base import KitchenTestCase


class BatchCompletionTests(KitchenTestCase):
    """The atomic transaction is the correctness-critical core of the whole
    module — these are the tests the line-check review said were missing."""

    def test_complete_batch_success_deducts_stock_and_snapshots_cost(self):
        batch = self.start_batch()
        self.client.force_authenticate(self.head_chef)

        res = self.client.post(
            f"/api/kitchen/batches/{batch.id}/complete/",
            {"actual_qty": "2", "quality_check": "PASSED", "quality_notes": "fine"},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.stock.refresh_from_db()
        # recipe_ingredient.qty=1kg is for the *full* 2-portion yield; a
        # 2-portion batch (scale=1.0) deducts exactly that 1kg, not 2kg.
        self.assertEqual(self.stock.qty_on_hand, Decimal("9"))

        deduction = IngredientDeduction.objects.get(batch=batch)
        self.assertEqual(deduction.actual_qty, Decimal("1"))
        self.assertEqual(deduction.unit_cost_at_time, Decimal("100.00"))

        batch.refresh_from_db()
        self.plan_item.refresh_from_db()
        self.assertEqual(batch.status, BatchProduction.Status.COMPLETE)
        self.assertEqual(self.plan_item.status, ProductionPlanItem.Status.COMPLETE)

    def test_complete_batch_insufficient_stock_returns_409_and_writes_nothing(self):
        # 10kg on hand, this recipe needs 1kg/portion — 50 portions needs 50kg.
        batch = self.start_batch(planned_qty=Decimal("50"))
        self.client.force_authenticate(self.head_chef)

        res = self.client.post(
            f"/api/kitchen/batches/{batch.id}/complete/",
            {"actual_qty": "50", "quality_check": "PASSED"},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("shortfalls", res.data)

        self.stock.refresh_from_db()
        self.assertEqual(self.stock.qty_on_hand, Decimal("10"), "stock must be untouched on rollback")
        self.assertFalse(IngredientDeduction.objects.filter(batch=batch).exists())

        batch.refresh_from_db()
        self.assertEqual(batch.status, BatchProduction.Status.IN_PROGRESS, "batch must not be marked complete")

    def test_complete_batch_twice_rejected(self):
        batch = self.start_batch()
        self.client.force_authenticate(self.head_chef)
        self.client.post(
            f"/api/kitchen/batches/{batch.id}/complete/",
            {"actual_qty": "2", "quality_check": "PASSED"},
            format="json",
        )

        res = self.client.post(
            f"/api/kitchen/batches/{batch.id}/complete/",
            {"actual_qty": "2", "quality_check": "PASSED"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_actual_cost_survives_later_ingredient_price_change(self):
        """Regression test for the cost-drift bug: IngredientDeduction must
        snapshot the price at completion time, not look it up live later."""
        batch = self.start_batch()
        self.client.force_authenticate(self.head_chef)
        self.client.post(
            f"/api/kitchen/batches/{batch.id}/complete/",
            {"actual_qty": "2", "quality_check": "PASSED"},
            format="json",
        )

        self.ingredient.unit_cost = Decimal("999.00")
        self.ingredient.save()

        deduction = IngredientDeduction.objects.get(batch=batch)
        self.assertEqual(deduction.unit_cost_at_time, Decimal("100.00"), "must stay the price at the time of use")
