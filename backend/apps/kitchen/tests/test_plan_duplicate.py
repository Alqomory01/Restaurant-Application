from decimal import Decimal

from rest_framework import status

from apps.kitchen.models import ProductionPlan

from .base import KitchenTestCase


class ProductionPlanDuplicateTests(KitchenTestCase):
    """The "plan the week" template: copying a plan's items onto other
    dates as new, independently-editable DRAFT plans."""

    def test_duplicate_creates_plans_with_copied_items(self):
        self.client.force_authenticate(self.manager)
        res = self.client.post(
            f"/api/kitchen/plans/{self.plan.id}/duplicate/",
            {"dates": ["2026-01-02", "2026-01-03"]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(res.data["created"]), 2)
        self.assertEqual(res.data["skipped_dates"], [])

        new_plan = ProductionPlan.objects.get(service_date="2026-01-02", service_period="LUNCH")
        self.assertEqual(new_plan.status, ProductionPlan.Status.DRAFT)
        items = list(new_plan.items.all())
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].recipe, self.recipe)
        self.assertEqual(items[0].planned_qty, self.plan_item.planned_qty)
        self.assertIsNone(items[0].assigned_to, "staff assignment is day-specific, not copied")

    def test_duplicate_skips_dates_that_already_have_a_plan_for_the_period(self):
        ProductionPlan.objects.create(
            service_date="2026-01-02", service_period=ProductionPlan.ServicePeriod.LUNCH, created_by=self.manager
        )
        self.client.force_authenticate(self.manager)
        res = self.client.post(
            f"/api/kitchen/plans/{self.plan.id}/duplicate/",
            {"dates": ["2026-01-02", "2026-01-03"]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(res.data["created"]), 1)
        self.assertEqual(res.data["skipped_dates"], ["2026-01-02"])

    def test_duplicate_requires_at_least_one_date(self):
        self.client.force_authenticate(self.manager)
        res = self.client.post(f"/api/kitchen/plans/{self.plan.id}/duplicate/", {"dates": []}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicated_plan_items_are_independent_of_original(self):
        self.client.force_authenticate(self.manager)
        self.client.post(f"/api/kitchen/plans/{self.plan.id}/duplicate/", {"dates": ["2026-01-02"]}, format="json")
        new_plan = ProductionPlan.objects.get(service_date="2026-01-02", service_period="LUNCH")
        new_item = new_plan.items.first()

        new_item.planned_qty = Decimal("99")
        new_item.save()

        self.plan_item.refresh_from_db()
        self.assertNotEqual(self.plan_item.planned_qty, Decimal("99"))
