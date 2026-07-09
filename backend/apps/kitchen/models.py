from django.conf import settings
from django.db import models


class CodeSequence(models.Model):
    """Backs atomic human-readable code generation (BP-0001, KSR-0047, ...).

    A plain "read the max existing code, add one" approach races under
    concurrent requests (two chefs tapping Start Production at once can get
    the same code). Locking this dedicated counter row via select_for_update
    serializes increments safely.
    """

    prefix = models.CharField(max_length=10, unique=True)
    last_value = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"{self.prefix}: {self.last_value}"


class Ingredient(models.Model):
    name = models.CharField(max_length=120, unique=True)
    default_unit = models.CharField(max_length=20)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Recipe(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        DEVELOPMENT = "DEVELOPMENT", "Development"
        DISCONTINUED = "DISCONTINUED", "Discontinued"

    name = models.CharField(max_length=120)
    category = models.CharField(max_length=80)
    yield_qty = models.DecimalField(max_digits=10, decimal_places=2)
    yield_unit = models.CharField(max_length=20)
    prep_time_minutes = models.PositiveIntegerField(default=0)
    selling_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    target_food_cost_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    allergen_info = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class RecipeIngredient(models.Model):
    """qty is always expressed in ingredient.default_unit — there is no
    separate unit field here on purpose. A per-row unit that could drift
    from the ingredient's own unit is exactly what let a recipe silently
    request the wrong scale of an ingredient (e.g. L vs ml)."""

    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="ingredients")
    ingredient = models.ForeignKey(Ingredient, on_delete=models.PROTECT, related_name="recipe_uses")
    qty = models.DecimalField(max_digits=10, decimal_places=3)
    is_optional = models.BooleanField(default=False)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.recipe.name}: {self.qty}{self.ingredient.default_unit} {self.ingredient.name}"


class CookingStep(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="steps")
    step_number = models.PositiveIntegerField()
    title = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    temperature_c = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["recipe_id", "step_number"]
        unique_together = ("recipe", "step_number")

    def __str__(self):
        return f"{self.recipe.name} step {self.step_number}: {self.title}"


class KitchenStock(models.Model):
    """qty_on_hand and reorder_threshold are in ingredient.default_unit —
    see the note on RecipeIngredient; same reasoning applies here."""

    ingredient = models.OneToOneField(Ingredient, on_delete=models.CASCADE, related_name="kitchen_stock")
    qty_on_hand = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    reorder_threshold = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["ingredient__name"]

    def __str__(self):
        return f"{self.ingredient.name}: {self.qty_on_hand}{self.ingredient.default_unit}"

    @property
    def below_threshold(self):
        return self.qty_on_hand < self.reorder_threshold


class ProductionPlan(models.Model):
    class ServicePeriod(models.TextChoices):
        BREAKFAST = "BREAKFAST", "Breakfast"
        LUNCH = "LUNCH", "Lunch"
        DINNER = "DINNER", "Dinner"
        ALL_DAY = "ALL_DAY", "All day"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"

    service_date = models.DateField()
    service_period = models.CharField(max_length=20, choices=ServicePeriod.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="production_plans")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-service_date"]

    def __str__(self):
        return f"{self.service_date} {self.service_period}"


class ProductionPlanItem(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        BLOCKED = "BLOCKED", "Blocked"
        COMPLETE = "COMPLETE", "Complete"

    plan = models.ForeignKey(ProductionPlan, on_delete=models.CASCADE, related_name="items")
    recipe = models.ForeignKey(Recipe, on_delete=models.PROTECT, related_name="plan_items")
    planned_qty = models.DecimalField(max_digits=10, decimal_places=2)
    unit = models.CharField(max_length=20)
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_plan_items")
    scheduled_time = models.TimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

    class Meta:
        ordering = ["scheduled_time"]

    def __str__(self):
        return f"{self.plan}: {self.recipe.name} x{self.planned_qty}{self.unit}"


class BatchProduction(models.Model):
    class QualityCheck(models.TextChoices):
        PASSED = "PASSED", "Passed"
        CONDITIONAL = "CONDITIONAL", "Conditional"
        FAILED = "FAILED", "Failed"

    class Status(models.TextChoices):
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        COMPLETE = "COMPLETE", "Complete"

    plan_item = models.OneToOneField(ProductionPlanItem, on_delete=models.CASCADE, related_name="batch")
    batch_code = models.CharField(max_length=20, unique=True)
    planned_qty = models.DecimalField(max_digits=10, decimal_places=2)
    actual_qty = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    quality_check = models.CharField(max_length=20, choices=QualityCheck.choices, blank=True)
    quality_notes = models.TextField(blank=True)
    substitution_notes = models.TextField(blank=True)
    produced_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="batches_produced")
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IN_PROGRESS)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return self.batch_code


class IngredientDeduction(models.Model):
    """unit_cost_at_time snapshots Ingredient.unit_cost at the moment this
    deduction was written. Without it, actual-cost reports silently
    recalculate every time a supplier price changes, so last month's food
    cost % would drift depending on when you happened to look at it."""

    batch = models.ForeignKey(BatchProduction, on_delete=models.CASCADE, related_name="deductions")
    ingredient = models.ForeignKey(Ingredient, on_delete=models.PROTECT, related_name="deductions")
    theoretical_qty = models.DecimalField(max_digits=10, decimal_places=3)
    actual_qty = models.DecimalField(max_digits=10, decimal_places=3)
    unit_cost_at_time = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    def __str__(self):
        return f"{self.batch.batch_code}: {self.ingredient.name} {self.actual_qty}"


class StockRequest(models.Model):
    class Urgency(models.TextChoices):
        NORMAL = "NORMAL", "Normal"
        HIGH = "HIGH", "High"
        URGENT = "URGENT", "Urgent"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        FULFILLED = "FULFILLED", "Fulfilled"
        CANCELLED = "CANCELLED", "Cancelled"

    request_code = models.CharField(max_length=20, unique=True)
    ingredient = models.ForeignKey(Ingredient, on_delete=models.PROTECT, related_name="stock_requests")
    qty_requested = models.DecimalField(max_digits=10, decimal_places=3)
    urgency = models.CharField(max_length=20, choices=Urgency.choices, default=Urgency.NORMAL)
    reason = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    raised_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="stock_requests_raised")
    raised_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-raised_at"]

    def __str__(self):
        return self.request_code


class WastageLog(models.Model):
    """Two distinct kinds of waste, both logged here but handled differently
    at write time (see WastageLogViewSet):

    - Raw ingredient waste (spoilage, prep trimming, a dropped tray) points
      at `ingredient` and really does deduct from KitchenStock — that
      ingredient is gone, same as if it had gone into a dish.
    - Finished-product / over-production waste points at `batch` instead.
      Its ingredients were already deducted when the batch was completed,
      so logging this does NOT touch KitchenStock again — it only records
      the cost of the wasted portions for reporting.

    Exactly one of ingredient/batch is set — enforced in the serializer.
    """

    class Reason(models.TextChoices):
        OVER_PRODUCTION = "OVER_PRODUCTION", "Over-production"
        PREP_WASTE = "PREP_WASTE", "Prep waste"
        SPOILAGE = "SPOILAGE", "Spoilage"
        DROPPED = "DROPPED", "Dropped / accident"
        OTHER = "OTHER", "Other"

    ingredient = models.ForeignKey(
        Ingredient, null=True, blank=True, on_delete=models.PROTECT, related_name="wastage_entries"
    )
    batch = models.ForeignKey(
        BatchProduction, null=True, blank=True, on_delete=models.SET_NULL, related_name="wastage_entries"
    )
    qty = models.DecimalField(max_digits=10, decimal_places=3)
    reason = models.CharField(max_length=20, choices=Reason.choices)
    notes = models.TextField(blank=True)
    unit_cost_at_time = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    logged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="wastage_logged"
    )
    logged_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-logged_at"]

    def __str__(self):
        target = self.ingredient.name if self.ingredient else (self.batch.batch_code if self.batch else "?")
        return f"Wastage: {self.qty} {target} ({self.reason})"
