from decimal import Decimal

from rest_framework import serializers

from apps.accounts.models import AuditLog, User

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
    WastageLog,
)


class IngredientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ingredient
        fields = ["id", "name", "default_unit", "unit_cost"]


class RecipeIngredientSerializer(serializers.ModelSerializer):
    ingredient_name = serializers.CharField(source="ingredient.name", read_only=True)
    # Read-only and always sourced from the ingredient itself — see the note
    # on RecipeIngredient.qty in models.py for why this isn't a stored field.
    unit = serializers.CharField(source="ingredient.default_unit", read_only=True)

    class Meta:
        model = RecipeIngredient
        fields = ["id", "ingredient", "ingredient_name", "qty", "unit", "is_optional"]


class CookingStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = CookingStep
        fields = ["id", "step_number", "title", "description", "duration_minutes", "temperature_c"]


class RecipeSerializer(serializers.ModelSerializer):
    ingredients = RecipeIngredientSerializer(many=True)
    steps = CookingStepSerializer(many=True)

    class Meta:
        model = Recipe
        fields = [
            "id", "name", "category", "yield_qty", "yield_unit", "prep_time_minutes",
            "selling_price", "target_food_cost_pct", "allergen_info", "status",
            "ingredients", "steps",
        ]

    def create(self, validated_data):
        ingredients_data = validated_data.pop("ingredients")
        steps_data = validated_data.pop("steps")
        recipe = Recipe.objects.create(**validated_data)
        self._sync_ingredients(recipe, ingredients_data)
        self._sync_steps(recipe, steps_data)
        return recipe

    def update(self, instance, validated_data):
        ingredients_data = validated_data.pop("ingredients", None)
        steps_data = validated_data.pop("steps", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if ingredients_data is not None:
            instance.ingredients.all().delete()
            self._sync_ingredients(instance, ingredients_data)
        if steps_data is not None:
            instance.steps.all().delete()
            self._sync_steps(instance, steps_data)
        return instance

    @staticmethod
    def _sync_ingredients(recipe, ingredients_data):
        RecipeIngredient.objects.bulk_create(
            RecipeIngredient(recipe=recipe, **item) for item in ingredients_data
        )

    @staticmethod
    def _sync_steps(recipe, steps_data):
        CookingStep.objects.bulk_create(
            CookingStep(recipe=recipe, **item) for item in steps_data
        )


class KitchenStockSerializer(serializers.ModelSerializer):
    ingredient_name = serializers.CharField(source="ingredient.name", read_only=True)
    unit = serializers.CharField(source="ingredient.default_unit", read_only=True)
    below_threshold = serializers.BooleanField(read_only=True)

    class Meta:
        model = KitchenStock
        fields = [
            "id", "ingredient", "ingredient_name", "qty_on_hand",
            "reorder_threshold", "unit", "below_threshold", "updated_at",
        ]


class ProductionPlanItemSerializer(serializers.ModelSerializer):
    # Optional here on purpose: ProductionPlanSerializer's nested create sets
    # `plan` itself from the parent instance, but the standalone
    # /kitchen/plan-items/ endpoint (adding an item to an existing plan)
    # needs it as a real writable field.
    plan = serializers.PrimaryKeyRelatedField(queryset=ProductionPlan.objects.all(), required=False)
    recipe_name = serializers.CharField(source="recipe.name", read_only=True)
    assigned_to_name = serializers.CharField(source="assigned_to.get_full_name", read_only=True)
    batch_id = serializers.IntegerField(source="batch.id", read_only=True, default=None)
    batch_code = serializers.CharField(source="batch.batch_code", read_only=True, default=None)

    class Meta:
        model = ProductionPlanItem
        fields = [
            "id", "plan", "recipe", "recipe_name", "planned_qty", "unit", "assigned_to",
            "assigned_to_name", "scheduled_time", "status", "batch_id", "batch_code",
        ]
        read_only_fields = ["status"]


class ProductionPlanSerializer(serializers.ModelSerializer):
    items = ProductionPlanItemSerializer(many=True)

    class Meta:
        model = ProductionPlan
        fields = ["id", "service_date", "service_period", "status", "created_by", "created_at", "items"]
        read_only_fields = ["created_by", "status"]

    def create(self, validated_data):
        items_data = validated_data.pop("items")
        plan = ProductionPlan.objects.create(**validated_data)
        ProductionPlanItem.objects.bulk_create(
            ProductionPlanItem(plan=plan, **item) for item in items_data
        )
        return plan

    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            ProductionPlanItem.objects.bulk_create(
                ProductionPlanItem(plan=instance, **item) for item in items_data
            )
        return instance


class IngredientDeductionSerializer(serializers.ModelSerializer):
    ingredient_name = serializers.CharField(source="ingredient.name", read_only=True)

    class Meta:
        model = IngredientDeduction
        fields = ["id", "ingredient", "ingredient_name", "theoretical_qty", "actual_qty", "unit_cost_at_time"]


class BatchProductionSerializer(serializers.ModelSerializer):
    recipe_name = serializers.CharField(source="plan_item.recipe.name", read_only=True)
    deductions = IngredientDeductionSerializer(many=True, read_only=True)

    class Meta:
        model = BatchProduction
        fields = [
            "id", "plan_item", "recipe_name", "batch_code", "planned_qty", "actual_qty",
            "quality_check", "quality_notes", "substitution_notes", "produced_by",
            "started_at", "completed_at", "status", "deductions",
        ]
        read_only_fields = ["batch_code", "planned_qty", "started_at", "completed_at", "status"]


class BatchCompleteSerializer(serializers.Serializer):
    actual_qty = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0"))
    quality_check = serializers.ChoiceField(choices=BatchProduction.QualityCheck.choices)
    quality_notes = serializers.CharField(required=False, allow_blank=True)
    substitution_notes = serializers.CharField(required=False, allow_blank=True)


class StockRequestSerializer(serializers.ModelSerializer):
    ingredient_name = serializers.CharField(source="ingredient.name", read_only=True)
    raised_by_name = serializers.CharField(source="raised_by.get_full_name", read_only=True)

    class Meta:
        model = StockRequest
        fields = [
            "id", "request_code", "ingredient", "ingredient_name", "qty_requested",
            "urgency", "reason", "status", "raised_by", "raised_by_name",
            "raised_at", "resolved_at",
        ]
        read_only_fields = ["request_code", "status", "raised_by", "raised_at", "resolved_at"]


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.get_full_name", read_only=True, default=None)

    class Meta:
        model = AuditLog
        fields = ["id", "actor", "actor_name", "action", "model_name", "object_id", "object_repr", "detail", "created_at"]


class WastageLogSerializer(serializers.ModelSerializer):
    ingredient_name = serializers.CharField(source="ingredient.name", read_only=True, default=None)
    batch_code = serializers.CharField(source="batch.batch_code", read_only=True, default=None)
    recipe_name = serializers.CharField(source="batch.plan_item.recipe.name", read_only=True, default=None)
    unit = serializers.SerializerMethodField()
    logged_by_name = serializers.CharField(source="logged_by.get_full_name", read_only=True, default=None)
    value = serializers.SerializerMethodField()

    class Meta:
        model = WastageLog
        fields = [
            "id", "ingredient", "ingredient_name", "batch", "batch_code", "recipe_name",
            "qty", "unit", "reason", "notes", "value", "logged_by", "logged_by_name", "logged_at",
        ]
        read_only_fields = ["logged_by", "logged_at"]

    def get_unit(self, obj):
        if obj.ingredient:
            return obj.ingredient.default_unit
        if obj.batch:
            return obj.batch.plan_item.recipe.yield_unit
        return ""

    def get_value(self, obj):
        # Cost value is manager/head-chef information, same visibility rule
        # as recipe costing — kitchen staff can log and see what and why,
        # not the naira figure.
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user and (user.role in (User.Role.HEAD_CHEF, User.Role.MANAGER) or user.is_superuser):
            # qty (3dp) * unit_cost_at_time (2dp) multiplies out to 5dp —
            # round to money's 2dp instead of leaking the raw precision.
            value = (obj.qty * obj.unit_cost_at_time).quantize(Decimal("0.01"))
            return str(value)
        return None

    def validate(self, attrs):
        ingredient = attrs.get("ingredient")
        batch = attrs.get("batch")
        if bool(ingredient) == bool(batch):
            raise serializers.ValidationError("Provide exactly one of ingredient or batch, not both.")
        return attrs
