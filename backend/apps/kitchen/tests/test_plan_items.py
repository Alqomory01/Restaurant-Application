from decimal import Decimal

from rest_framework import status

from apps.kitchen.models import ProductionPlanItem

from .base import KitchenTestCase


class ProductionPlanItemGuardTests(KitchenTestCase):
    """Adding/editing/removing plan items outside the plan-creation flow —
    the line-check gap here was that ProductionPlanItemViewSet allowed
    unrestricted PATCH/DELETE, including on items with a batch already
    started, which would silently desync or cascade-delete real production
    history."""

    def test_add_item_to_existing_plan(self):
        self.client.force_authenticate(self.manager)
        res = self.client.post(
            "/api/kitchen/plan-items/",
            {"plan": self.plan.id, "recipe": self.recipe.id, "planned_qty": "3", "unit": "portions"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ProductionPlanItem.objects.filter(plan=self.plan).count(), 2)

    def test_edit_pending_item_succeeds(self):
        self.client.force_authenticate(self.manager)
        res = self.client.patch(
            f"/api/kitchen/plan-items/{self.plan_item.id}/", {"planned_qty": "5"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.plan_item.refresh_from_db()
        self.assertEqual(self.plan_item.planned_qty, Decimal("5"))

    def test_remove_pending_item_succeeds(self):
        self.client.force_authenticate(self.manager)
        res = self.client.delete(f"/api/kitchen/plan-items/{self.plan_item.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ProductionPlanItem.objects.filter(id=self.plan_item.id).exists())

    def test_edit_item_with_started_batch_rejected(self):
        self.client.force_authenticate(self.head_chef)
        self.client.post(f"/api/kitchen/plan-items/{self.plan_item.id}/start-batch/")

        res = self.client.patch(
            f"/api/kitchen/plan-items/{self.plan_item.id}/", {"planned_qty": "99"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.plan_item.refresh_from_db()
        self.assertEqual(self.plan_item.planned_qty, Decimal("2"), "must be untouched")

    def test_remove_item_with_started_batch_rejected(self):
        self.client.force_authenticate(self.head_chef)
        self.client.post(f"/api/kitchen/plan-items/{self.plan_item.id}/start-batch/")

        res = self.client.delete(f"/api/kitchen/plan-items/{self.plan_item.id}/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(
            ProductionPlanItem.objects.filter(id=self.plan_item.id).exists(),
            "rejecting the delete must not cascade-delete the item or its batch",
        )
