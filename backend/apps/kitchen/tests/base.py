from decimal import Decimal

from rest_framework.test import APITestCase

from apps.accounts.models import Branch, User
from apps.kitchen.models import (
    BatchProduction,
    Ingredient,
    KitchenStock,
    ProductionPlan,
    ProductionPlanItem,
    Recipe,
    RecipeIngredient,
)


class KitchenTestCase(APITestCase):
    """Shared fixtures for kitchen-module tests: one recipe that yields 2
    portions per full batch and needs 1kg of the test ingredient to make
    that full 2-portion yield, with 10kg of that ingredient in stock —
    enough for 10 full batches, so tests can dial planned_qty up past that
    to exercise the insufficient-stock path deliberately."""

    def setUp(self):
        branch = Branch.objects.create(name="Test Branch")
        self.manager = User.objects.create_user(
            "manager_t", password="pw", role=User.Role.MANAGER, branch=branch
        )
        self.head_chef = User.objects.create_user(
            "head_chef_t", password="pw", role=User.Role.HEAD_CHEF, branch=branch
        )
        self.kitchen_staff = User.objects.create_user(
            "kitchen_staff_t", password="pw", role=User.Role.KITCHEN_STAFF, branch=branch
        )

        self.ingredient = Ingredient.objects.create(
            name="Test Flour", default_unit="kg", unit_cost=Decimal("100.00")
        )
        self.recipe = Recipe.objects.create(
            name="Test Bread",
            category="Bakery",
            yield_qty=Decimal("2"),
            yield_unit="portions",
            selling_price=Decimal("500.00"),
            target_food_cost_pct=Decimal("25"),
        )
        RecipeIngredient.objects.create(recipe=self.recipe, ingredient=self.ingredient, qty=Decimal("1"))
        self.stock = KitchenStock.objects.create(
            ingredient=self.ingredient, qty_on_hand=Decimal("10"), reorder_threshold=Decimal("2")
        )

        self.plan = ProductionPlan.objects.create(
            service_date="2026-01-01", service_period=ProductionPlan.ServicePeriod.LUNCH, created_by=self.manager
        )
        self.plan_item = ProductionPlanItem.objects.create(
            plan=self.plan, recipe=self.recipe, planned_qty=Decimal("2"), unit="portions"
        )

    def start_batch(self, planned_qty=None):
        return BatchProduction.objects.create(
            plan_item=self.plan_item,
            batch_code="BP-TEST-0001",
            planned_qty=planned_qty or self.plan_item.planned_qty,
            produced_by=self.head_chef,
        )
