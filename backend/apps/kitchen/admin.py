from django.contrib import admin

from .models import (
    BatchProduction,
    CookingStep,
    Ingredient,
    IngredientDeduction,
    KitchenStock,
    ProductionPlan,
    ProductionPlanItem,
    Recipe,
    RecipeIngredient,
    StockRequest,
)


class RecipeIngredientInline(admin.TabularInline):
    model = RecipeIngredient
    extra = 1


class CookingStepInline(admin.TabularInline):
    model = CookingStep
    extra = 1


@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "status", "selling_price", "target_food_cost_pct")
    inlines = [RecipeIngredientInline, CookingStepInline]


@admin.register(Ingredient)
class IngredientAdmin(admin.ModelAdmin):
    list_display = ("name", "default_unit", "unit_cost")


@admin.register(KitchenStock)
class KitchenStockAdmin(admin.ModelAdmin):
    list_display = ("ingredient", "qty_on_hand", "reorder_threshold", "unit", "below_threshold")


class ProductionPlanItemInline(admin.TabularInline):
    model = ProductionPlanItem
    extra = 1


@admin.register(ProductionPlan)
class ProductionPlanAdmin(admin.ModelAdmin):
    list_display = ("service_date", "service_period", "status", "created_by")
    inlines = [ProductionPlanItemInline]


@admin.register(BatchProduction)
class BatchProductionAdmin(admin.ModelAdmin):
    list_display = ("batch_code", "plan_item", "planned_qty", "actual_qty", "status", "quality_check")


@admin.register(IngredientDeduction)
class IngredientDeductionAdmin(admin.ModelAdmin):
    list_display = ("batch", "ingredient", "theoretical_qty", "actual_qty")


@admin.register(StockRequest)
class StockRequestAdmin(admin.ModelAdmin):
    list_display = ("request_code", "ingredient", "qty_requested", "urgency", "status", "raised_by")
