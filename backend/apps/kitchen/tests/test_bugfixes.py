"""
Tests for the three fixes discussed: diff-based recipe/plan sync (instead of
delete-and-recreate) and the row lock on BatchProduction.complete().

Drop this in as apps/kitchen/tests/test_bugfixes.py (create the tests/
package with an __init__.py, or fold it into your existing tests.py).

Note: BatchCompleteRaceConditionTests uses TransactionTestCase with real
threads to exercise the select_for_update() lock across two DB connections.
This requires Postgres (your default) — SQLite will deadlock/serialize
differently and isn't a reliable test of this behavior.
"""
import threading
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.kitchen.models import (
    BatchProduction,
    CookingStep,
    Ingredient,
    IngredientDeduction,
    KitchenStock,
    ProductionPlan,
    ProductionPlanItem,
    Recipe,
    RecipeIngredient,
)
from apps.kitchen.serializers import ProductionPlanSerializer, RecipeSerializer

User = get_user_model()


class RecipeDiffSyncTests(TestCase):
    """RecipeSerializer.update() should edit rows in place, not delete and
    recreate every ingredient/step on every save."""

    def setUp(self):
        self.flour = Ingredient.objects.create(name="Flour", default_unit="kg", unit_cost=Decimal("2.00"))
        self.sugar = Ingredient.objects.create(name="Sugar", default_unit="kg", unit_cost=Decimal("3.00"))
        self.recipe = Recipe.objects.create(
            name="Pancakes", category="Breakfast", yield_qty=Decimal("10"), yield_unit="pcs",
        )
        self.ri = RecipeIngredient.objects.create(recipe=self.recipe, ingredient=self.flour, qty=Decimal("1.000"))
        self.step1 = CookingStep.objects.create(recipe=self.recipe, step_number=1, title="Mix")
        self.step2 = CookingStep.objects.create(recipe=self.recipe, step_number=2, title="Cook")

    def _base_payload(self, ingredients, steps):
        return {
            "name": self.recipe.name,
            "category": self.recipe.category,
            "yield_qty": self.recipe.yield_qty,
            "yield_unit": self.recipe.yield_unit,
            "ingredients": ingredients,
            "steps": steps,
        }

    def test_update_existing_ingredient_keeps_same_row(self):
        payload = self._base_payload(
            ingredients=[{"id": self.ri.id, "ingredient": self.flour.id, "qty": "2.500", "is_optional": False}],
            steps=[
                {"id": self.step1.id, "step_number": 1, "title": "Mix"},
                {"id": self.step2.id, "step_number": 2, "title": "Cook"},
            ],
        )
        serializer = RecipeSerializer(instance=self.recipe, data=payload)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        self.ri.refresh_from_db()
        self.assertEqual(self.ri.qty, Decimal("2.500"))
        self.assertEqual(RecipeIngredient.objects.filter(recipe=self.recipe).count(), 1)

    def test_ingredient_dropped_from_payload_is_deleted(self):
        second = RecipeIngredient.objects.create(recipe=self.recipe, ingredient=self.sugar, qty=Decimal("0.500"))
        payload = self._base_payload(
            ingredients=[{"id": self.ri.id, "ingredient": self.flour.id, "qty": "1.000", "is_optional": False}],
            steps=[
                {"id": self.step1.id, "step_number": 1, "title": "Mix"},
                {"id": self.step2.id, "step_number": 2, "title": "Cook"},
            ],
        )
        serializer = RecipeSerializer(instance=self.recipe, data=payload)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        self.assertFalse(RecipeIngredient.objects.filter(pk=second.pk).exists())
        self.assertTrue(RecipeIngredient.objects.filter(pk=self.ri.pk).exists())

    def test_new_ingredient_without_id_is_created(self):
        payload = self._base_payload(
            ingredients=[
                {"id": self.ri.id, "ingredient": self.flour.id, "qty": "1.000", "is_optional": False},
                {"ingredient": self.sugar.id, "qty": "0.250", "is_optional": True},
            ],
            steps=[
                {"id": self.step1.id, "step_number": 1, "title": "Mix"},
                {"id": self.step2.id, "step_number": 2, "title": "Cook"},
            ],
        )
        serializer = RecipeSerializer(instance=self.recipe, data=payload)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        self.assertEqual(RecipeIngredient.objects.filter(recipe=self.recipe).count(), 2)
        self.assertTrue(RecipeIngredient.objects.filter(recipe=self.recipe, ingredient=self.sugar).exists())

    def test_step_reorder_swap_does_not_violate_unique_together(self):
        # Pre-fix, saving these two in a naive loop would hit
        # unique_together=("recipe", "step_number") mid-loop.
        payload = self._base_payload(
            ingredients=[{"id": self.ri.id, "ingredient": self.flour.id, "qty": "1.000", "is_optional": False}],
            steps=[
                {"id": self.step1.id, "step_number": 2, "title": "Mix"},
                {"id": self.step2.id, "step_number": 1, "title": "Cook"},
            ],
        )
        serializer = RecipeSerializer(instance=self.recipe, data=payload)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        self.step1.refresh_from_db()
        self.step2.refresh_from_db()
        self.assertEqual(self.step1.step_number, 2)
        self.assertEqual(self.step2.step_number, 1)


class ProductionPlanItemProtectionTests(TestCase):
    """ProductionPlanSerializer.update() must refuse to drop or rescale a
    plan item that already has a BatchProduction — deleting it would
    cascade-delete production history."""

    def setUp(self):
        self.user = User.objects.create_user(username="chef", password="pw-12345!")
        self.ingredient = Ingredient.objects.create(name="Rice", default_unit="kg", unit_cost=Decimal("1.00"))
        self.recipe = Recipe.objects.create(name="Jollof", category="Main", yield_qty=Decimal("10"), yield_unit="plates")
        RecipeIngredient.objects.create(recipe=self.recipe, ingredient=self.ingredient, qty=Decimal("1.000"))
        KitchenStock.objects.create(ingredient=self.ingredient, qty_on_hand=Decimal("100.000"))
        self.plan = ProductionPlan.objects.create(
            service_date="2026-07-10",
            service_period=ProductionPlan.ServicePeriod.LUNCH,
            created_by=self.user,
        )
        self.item = ProductionPlanItem.objects.create(
            plan=self.plan, recipe=self.recipe, planned_qty=Decimal("10"), unit="plates",
        )
        self.batch = BatchProduction.objects.create(
            plan_item=self.item, batch_code="BP-TEST-0001", planned_qty=Decimal("10"),
        )

    def test_removing_item_with_batch_is_rejected(self):
        payload = {
            "service_date": self.plan.service_date,
            "service_period": self.plan.service_period,
            "items": [],  # dropping the only item, which already has a batch
        }
        serializer = ProductionPlanSerializer(instance=self.plan, data=payload)
        serializer.is_valid(raise_exception=True)
        with self.assertRaises(ValidationError):
            serializer.save()
        self.assertTrue(ProductionPlanItem.objects.filter(pk=self.item.pk).exists())

    def test_changing_qty_on_item_with_batch_is_rejected(self):
        payload = {
            "service_date": self.plan.service_date,
            "service_period": self.plan.service_period,
            "items": [
                {"id": self.item.id, "recipe": self.recipe.id, "planned_qty": "20.00", "unit": "plates"},
            ],
        }
        serializer = ProductionPlanSerializer(instance=self.plan, data=payload)
        serializer.is_valid(raise_exception=True)
        with self.assertRaises(ValidationError):
            serializer.save()

    def test_editing_scheduled_time_on_item_with_batch_is_allowed(self):
        # Re-scheduling doesn't touch recipe/qty, so it should go through.
        payload = {
            "service_date": self.plan.service_date,
            "service_period": self.plan.service_period,
            "items": [
                {
                    "id": self.item.id,
                    "recipe": self.recipe.id,
                    "planned_qty": self.item.planned_qty,
                    "unit": self.item.unit,
                    "scheduled_time": "18:30:00",
                },
            ],
        }
        serializer = ProductionPlanSerializer(instance=self.plan, data=payload)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        self.item.refresh_from_db()
        self.assertEqual(str(self.item.scheduled_time), "18:30:00")


class BatchCompleteRaceConditionTests(TransactionTestCase):
    """Two near-simultaneous completes on the same batch must not both
    succeed and double-deduct stock."""

    def setUp(self):
        self.user = User.objects.create_user(username="chef2", password="pw-12345!")
        self.ingredient = Ingredient.objects.create(name="Chicken", default_unit="kg", unit_cost=Decimal("5.00"))
        self.recipe = Recipe.objects.create(name="Grilled Chicken", category="Main", yield_qty=Decimal("1"), yield_unit="kg")
        RecipeIngredient.objects.create(recipe=self.recipe, ingredient=self.ingredient, qty=Decimal("1.000"))
        KitchenStock.objects.create(ingredient=self.ingredient, qty_on_hand=Decimal("5.000"))
        self.plan = ProductionPlan.objects.create(
            service_date="2026-07-10",
            service_period=ProductionPlan.ServicePeriod.DINNER,
            created_by=self.user,
        )
        self.item = ProductionPlanItem.objects.create(
            plan=self.plan, recipe=self.recipe, planned_qty=Decimal("5"), unit="kg",
        )
        self.batch = BatchProduction.objects.create(
            plan_item=self.item, batch_code="BP-TEST-0002", planned_qty=Decimal("5"),
        )

    def test_concurrent_complete_only_deducts_stock_once(self):
        url = f"/api/kitchen/batches/{self.batch.id}/complete/"
        payload = {"actual_qty": "5.00", "quality_check": "PASSED"}
        results = {}

        def call(idx):
            client = APIClient()
            client.force_authenticate(user=self.user)
            response = client.post(url, payload, format="json")
            results[idx] = response.status_code

        t1 = threading.Thread(target=call, args=(1,))
        t2 = threading.Thread(target=call, args=(2,))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # The lock on BatchProduction makes this deterministic: whichever
        # request gets there first completes the batch; the other blocks
        # until the first commits, then sees status=COMPLETE and bails
        # with a 400 rather than deducting stock a second time.
        self.assertEqual(sorted(results.values()), [200, 400])

        stock = KitchenStock.objects.get(ingredient=self.ingredient)
        self.assertEqual(stock.qty_on_hand, Decimal("0.000"))
        self.assertEqual(IngredientDeduction.objects.filter(batch=self.batch).count(), 1)