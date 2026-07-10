from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status

from apps.kitchen.models import BatchProduction, ProductionPlan, ProductionPlanItem

from .base import KitchenTestCase


class DashboardYesterdayComparisonTests(KitchenTestCase):
    """The dashboard's trend arrows depend on real yesterday figures, not
    fabricated ones — these confirm the comparison fields reflect an actual
    batch/wastage completed on the prior calendar day."""

    def _complete_batch_for_date(self, service_date, actual_qty="2"):
        plan = ProductionPlan.objects.create(
            service_date=service_date, service_period=ProductionPlan.ServicePeriod.LUNCH, created_by=self.manager
        )
        plan_item = ProductionPlanItem.objects.create(
            plan=plan, recipe=self.recipe, planned_qty=Decimal("2"), unit="portions"
        )
        batch = BatchProduction.objects.create(
            plan_item=plan_item, batch_code=f"BP-TEST-{service_date}", planned_qty=Decimal("2"), produced_by=self.head_chef
        )
        self.client.force_authenticate(self.head_chef)
        self.client.post(
            f"/api/kitchen/batches/{batch.id}/complete/",
            {"actual_qty": actual_qty, "quality_check": "PASSED"},
            format="json",
        )
        return batch

    def test_dashboard_reports_yesterday_efficiency_and_wastage_counts(self):
        yesterday = timezone.localdate() - timedelta(days=1)
        self._complete_batch_for_date(yesterday, actual_qty="2")  # full efficiency: 2/2 = 100%

        self.client.force_authenticate(self.manager)
        res = self.client.get("/api/kitchen/dashboard/")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["production_efficiency_pct_yesterday"], Decimal("100.0"))
        self.assertEqual(res.data["wastage_yesterday_count"], 0)
        self.assertIn("actual_food_cost_pct_yesterday", res.data)

    def test_dashboard_yesterday_fields_are_none_with_no_prior_activity(self):
        self.client.force_authenticate(self.manager)
        res = self.client.get("/api/kitchen/dashboard/")

        self.assertIsNone(res.data["production_efficiency_pct_yesterday"])
        self.assertEqual(res.data["wastage_yesterday_count"], 0)

    def test_kitchen_staff_does_not_see_food_cost_yesterday(self):
        self.client.force_authenticate(self.kitchen_staff)
        res = self.client.get("/api/kitchen/dashboard/")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn("actual_food_cost_pct_yesterday", res.data)
        self.assertNotIn("actual_food_cost_pct", res.data)
