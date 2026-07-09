from datetime import datetime
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    BatchProduction,
    Ingredient,
    IngredientDeduction,
    KitchenStock,
    ProductionPlan,
    ProductionPlanItem,
    Recipe,
    StockRequest,
    WastageLog,
)
from apps.accounts.models import AuditLog
from apps.accounts.utils import log_action

from .permissions import IsHeadChefOrManager, IsManager
from .serializers import (
    AuditLogSerializer,
    BatchCompleteSerializer,
    BatchProductionSerializer,
    IngredientSerializer,
    KitchenStockSerializer,
    ProductionPlanItemSerializer,
    ProductionPlanSerializer,
    RecipeSerializer,
    StockRequestSerializer,
    WastageLogSerializer,
)
from .utils import next_code


class IngredientViewSet(viewsets.ModelViewSet):
    queryset = Ingredient.objects.all()
    serializer_class = IngredientSerializer


class RecipeViewSet(viewsets.ModelViewSet):
    queryset = Recipe.objects.prefetch_related("ingredients__ingredient", "steps")
    serializer_class = RecipeSerializer

    def perform_create(self, serializer):
        recipe = serializer.save()
        log_action(self.request.user, "CREATED", recipe)

    def perform_update(self, serializer):
        recipe = serializer.save()
        log_action(self.request.user, "UPDATED", recipe)

    def perform_destroy(self, instance):
        log_action(self.request.user, "DELETED", instance)
        instance.delete()


class KitchenStockViewSet(viewsets.ModelViewSet):
    queryset = KitchenStock.objects.select_related("ingredient")
    serializer_class = KitchenStockSerializer


class ProductionPlanViewSet(viewsets.ModelViewSet):
    queryset = ProductionPlan.objects.prefetch_related("items__recipe", "items__assigned_to", "items__batch")
    serializer_class = ProductionPlanSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        plan = self.get_object()
        created_requests = []
        now = timezone.now()

        required_by_ingredient = {}
        for item in plan.items.select_related("recipe").prefetch_related("recipe__ingredients__ingredient"):
            for ri in item.recipe.ingredients.all():
                scale = item.planned_qty / item.recipe.yield_qty
                needed = scale * ri.qty
                entry = required_by_ingredient.setdefault(
                    ri.ingredient_id, {"ingredient": ri.ingredient, "qty": Decimal("0"), "earliest": item.scheduled_time}
                )
                entry["qty"] += needed
                if item.scheduled_time and (entry["earliest"] is None or item.scheduled_time < entry["earliest"]):
                    entry["earliest"] = item.scheduled_time

        for ingredient_id, data in required_by_ingredient.items():
            stock, _ = KitchenStock.objects.get_or_create(ingredient_id=ingredient_id)
            shortfall = data["qty"] - stock.qty_on_hand
            if shortfall <= 0:
                continue

            urgency = StockRequest.Urgency.NORMAL
            if data["earliest"]:
                scheduled_dt = timezone.make_aware(datetime.combine(plan.service_date, data["earliest"]))
                minutes_away = (scheduled_dt - now).total_seconds() / 60
                if minutes_away <= 60:
                    urgency = StockRequest.Urgency.URGENT
                elif minutes_away <= 180:
                    urgency = StockRequest.Urgency.HIGH

            req = StockRequest.objects.create(
                request_code=next_code("KSR"),
                ingredient=data["ingredient"],
                qty_requested=shortfall,
                urgency=urgency,
                reason=f"Production plan {plan.service_date} {plan.service_period} shortfall",
                raised_by=request.user,
            )
            log_action(request.user, "AUTO_RAISED", req, detail=f"From plan submission ({plan})")
            created_requests.append(req)

        plan.status = ProductionPlan.Status.SUBMITTED
        plan.save(update_fields=["status"])
        log_action(
            request.user, "SUBMITTED", plan,
            detail=f"{len(created_requests)} stock request(s) auto-created" if created_requests else "",
        )

        return Response(
            {
                "plan": ProductionPlanSerializer(plan).data,
                "stock_requests_created": StockRequestSerializer(created_requests, many=True).data,
            }
        )


class ProductionPlanItemViewSet(viewsets.ModelViewSet):
    queryset = ProductionPlanItem.objects.select_related("recipe", "assigned_to", "batch")
    serializer_class = ProductionPlanItemSerializer

    @action(detail=True, methods=["post"], url_path="start-batch")
    def start_batch(self, request, pk=None):
        item = self.get_object()
        if hasattr(item, "batch"):
            return Response({"detail": "Batch already started for this item."}, status=status.HTTP_400_BAD_REQUEST)

        batch = BatchProduction.objects.create(
            plan_item=item,
            batch_code=next_code("BP"),
            planned_qty=item.planned_qty,
            produced_by=request.user,
        )
        item.status = ProductionPlanItem.Status.IN_PROGRESS
        item.save(update_fields=["status"])
        log_action(request.user, "STARTED", batch, detail=f"Planned {batch.planned_qty}")
        return Response(BatchProductionSerializer(batch).data, status=status.HTTP_201_CREATED)


class BatchProductionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = BatchProduction.objects.select_related("plan_item__recipe").prefetch_related("deductions__ingredient")
    serializer_class = BatchProductionSerializer

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        batch = self.get_object()
        if batch.status == BatchProduction.Status.COMPLETE:
            return Response({"detail": "Batch already complete."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = BatchCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        recipe = batch.plan_item.recipe
        scale = data["actual_qty"] / recipe.yield_qty

        with transaction.atomic():
            # Lock every ingredient's stock row up front and check there's enough
            # before writing anything. A kitchen can't cook with ingredients it
            # doesn't have — completing the batch anyway just hides the shortage
            # behind a confusing negative number instead of surfacing it.
            planned_deductions = []
            shortfalls = []
            for ri in recipe.ingredients.select_related("ingredient"):
                deduct_qty = scale * ri.qty
                stock, _ = KitchenStock.objects.select_for_update().get_or_create(ingredient=ri.ingredient)
                if stock.qty_on_hand < deduct_qty:
                    shortfalls.append(
                        f"{ri.ingredient.name}: need {deduct_qty}{ri.ingredient.default_unit}, "
                        f"have {stock.qty_on_hand}{ri.ingredient.default_unit}"
                    )
                planned_deductions.append((ri, stock, deduct_qty))

            if shortfalls:
                return Response(
                    {
                        "detail": "Not enough kitchen stock to complete this batch. Raise a stock request first.",
                        "shortfalls": shortfalls,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            for ri, stock, deduct_qty in planned_deductions:
                IngredientDeduction.objects.create(
                    batch=batch,
                    ingredient=ri.ingredient,
                    theoretical_qty=ri.qty,
                    actual_qty=deduct_qty,
                    unit_cost_at_time=ri.ingredient.unit_cost,
                )
                stock.qty_on_hand = stock.qty_on_hand - deduct_qty
                stock.save(update_fields=["qty_on_hand", "updated_at"])

            batch.actual_qty = data["actual_qty"]
            batch.quality_check = data["quality_check"]
            batch.quality_notes = data.get("quality_notes", "")
            batch.substitution_notes = data.get("substitution_notes", "")
            batch.completed_at = timezone.now()
            batch.status = BatchProduction.Status.COMPLETE
            batch.save()

            batch.plan_item.status = ProductionPlanItem.Status.COMPLETE
            batch.plan_item.save(update_fields=["status"])

            log_action(
                request.user, "COMPLETED", batch,
                detail=f"Actual {batch.actual_qty}, quality {batch.quality_check}",
            )

        return Response(BatchProductionSerializer(batch).data)


class StockRequestViewSet(viewsets.ModelViewSet):
    queryset = StockRequest.objects.select_related("ingredient", "raised_by")
    serializer_class = StockRequestSerializer

    def perform_create(self, serializer):
        stock_request = serializer.save(
            request_code=next_code("KSR"),
            raised_by=self.request.user,
        )
        log_action(self.request.user, "RAISED", stock_request, detail=stock_request.reason)

    @action(detail=True, methods=["post"], url_path="mark-fulfilled")
    def mark_fulfilled(self, request, pk=None):
        stock_request = self.get_object()
        stock_request.status = StockRequest.Status.FULFILLED
        stock_request.resolved_at = timezone.now()
        stock_request.save(update_fields=["status", "resolved_at"])

        stock, _ = KitchenStock.objects.get_or_create(ingredient=stock_request.ingredient)
        stock.qty_on_hand += stock_request.qty_requested
        stock.save(update_fields=["qty_on_hand", "updated_at"])
        log_action(request.user, "FULFILLED", stock_request, detail=f"+{stock_request.qty_requested}")

        return Response(StockRequestSerializer(stock_request).data)


class AuditLogView(APIView):
    """Most recent activity across the kitchen module. Head Chef and Manager
    only — this is "who did this" accountability data, not a KDS concern."""

    permission_classes = [IsHeadChefOrManager]

    def get(self, request):
        entries = AuditLog.objects.select_related("actor")[:100]
        return Response(AuditLogSerializer(entries, many=True).data)


def _compute_recipe_costing(recipe):
    theoretical_cost = sum((ri.qty * ri.ingredient.unit_cost for ri in recipe.ingredients.all()), Decimal("0"))
    theoretical_cost_per_unit = theoretical_cost / recipe.yield_qty if recipe.yield_qty else Decimal("0")
    theoretical_fc_pct = (
        (theoretical_cost_per_unit / recipe.selling_price * 100) if recipe.selling_price else None
    )

    completed_batches = BatchProduction.objects.filter(
        plan_item__recipe=recipe, status=BatchProduction.Status.COMPLETE
    )
    actual_cost_total = Decimal("0")
    actual_qty_total = Decimal("0")
    for batch in completed_batches.prefetch_related("deductions"):
        for d in batch.deductions.all():
            actual_cost_total += d.actual_qty * d.unit_cost_at_time
        actual_qty_total += batch.actual_qty or Decimal("0")

    actual_cost_per_unit = (actual_cost_total / actual_qty_total) if actual_qty_total else None
    actual_fc_pct = (
        (actual_cost_per_unit / recipe.selling_price * 100)
        if actual_cost_per_unit is not None and recipe.selling_price
        else None
    )

    return {
        "recipe_id": recipe.id,
        "recipe_name": recipe.name,
        "theoretical_cost_per_unit": round(theoretical_cost_per_unit, 2),
        "actual_cost_per_unit": round(actual_cost_per_unit, 2) if actual_cost_per_unit is not None else None,
        "theoretical_food_cost_pct": round(theoretical_fc_pct, 1) if theoretical_fc_pct is not None else None,
        "actual_food_cost_pct": round(actual_fc_pct, 1) if actual_fc_pct is not None else None,
        "target_food_cost_pct": recipe.target_food_cost_pct,
    }


def _costing_status(row):
    if row["actual_food_cost_pct"] is None or row["target_food_cost_pct"] is None:
        return "no_data"
    actual = Decimal(str(row["actual_food_cost_pct"]))
    target = Decimal(str(row["target_food_cost_pct"]))
    if actual > target + 2:
        return "over_target"
    if actual > target:
        return "watch"
    return "on_target"


class WastageLogViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "head", "options"]  # append-only, like the audit log
    queryset = WastageLog.objects.select_related(
        "ingredient", "batch__plan_item__recipe", "logged_by"
    )
    serializer_class = WastageLogSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ingredient = serializer.validated_data.get("ingredient")
        batch = serializer.validated_data.get("batch")
        qty = serializer.validated_data["qty"]

        with transaction.atomic():
            if ingredient:
                stock, _ = KitchenStock.objects.select_for_update().get_or_create(ingredient=ingredient)
                if stock.qty_on_hand < qty:
                    return Response(
                        {
                            "detail": f"Not enough {ingredient.name} in stock to log this wastage.",
                            "shortfalls": [
                                f"{ingredient.name}: need {qty}{ingredient.default_unit}, "
                                f"have {stock.qty_on_hand}{ingredient.default_unit}"
                            ],
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                stock.qty_on_hand -= qty
                stock.save(update_fields=["qty_on_hand", "updated_at"])
                unit_cost = ingredient.unit_cost
            else:
                row = _compute_recipe_costing(batch.plan_item.recipe)
                unit_cost = (
                    row["actual_cost_per_unit"]
                    if row["actual_cost_per_unit"] is not None
                    else row["theoretical_cost_per_unit"]
                )

            entry = serializer.save(logged_by=request.user, unit_cost_at_time=unit_cost)
            log_action(request.user, "LOGGED_WASTAGE", entry, detail=f"{qty} {entry.reason}")

        return Response(self.get_serializer(entry).data, status=status.HTTP_201_CREATED)


class CostingView(APIView):
    permission_classes = [IsManager]

    def get(self, request):
        recipes = Recipe.objects.prefetch_related("ingredients__ingredient")
        return Response([_compute_recipe_costing(r) for r in recipes])


class CostingSummaryView(APIView):
    """Head Chef gets a trend signal per recipe — no cost figures or margins,
    just whether it's running over target — so portioning can be corrected on
    the line instead of discovered later in a Manager-only report."""

    permission_classes = [IsHeadChefOrManager]

    def get(self, request):
        recipes = Recipe.objects.prefetch_related("ingredients__ingredient")
        results = []
        for recipe in recipes:
            row = _compute_recipe_costing(recipe)
            results.append(
                {
                    "recipe_id": row["recipe_id"],
                    "recipe_name": row["recipe_name"],
                    "status": _costing_status(row),
                }
            )
        return Response(results)


class DashboardView(APIView):
    def get(self, request):
        today = timezone.localdate()
        items_today = ProductionPlanItem.objects.filter(plan__service_date=today)
        total = items_today.count()
        complete = items_today.filter(status=ProductionPlanItem.Status.COMPLETE).count()

        batches_today = BatchProduction.objects.filter(
            plan_item__plan__service_date=today, status=BatchProduction.Status.COMPLETE
        )
        planned_sum = batches_today.aggregate(s=Sum("planned_qty"))["s"] or Decimal("0")
        actual_sum = batches_today.aggregate(s=Sum("actual_qty"))["s"] or Decimal("0")
        efficiency = round((actual_sum / planned_sum * 100), 1) if planned_sum else None

        shortfall_count = StockRequest.objects.filter(status=StockRequest.Status.PENDING).count()
        wastage_today = WastageLog.objects.filter(logged_at__date=today)

        payload = {
            "batches_today_total": total,
            "batches_today_complete": complete,
            "production_efficiency_pct": efficiency,
            "ingredient_shortfall_count": shortfall_count,
            "wastage_today_count": wastage_today.count(),
        }

        is_manager_or_head_chef = (
            request.user.role in (request.user.Role.MANAGER, request.user.Role.HEAD_CHEF)
            or request.user.is_superuser
        )
        if is_manager_or_head_chef:
            payload["wastage_today_value"] = sum(
                (w.qty * w.unit_cost_at_time for w in wastage_today), Decimal("0")
            )

        is_manager = request.user.role == request.user.Role.MANAGER or request.user.is_superuser
        if is_manager:
            deductions_today = IngredientDeduction.objects.filter(
                batch__plan_item__plan__service_date=today
            ).select_related("batch__plan_item__recipe")
            actual_cost_total = sum((d.actual_qty * d.unit_cost_at_time for d in deductions_today), Decimal("0"))
            revenue_total = sum(
                (b.actual_qty * b.plan_item.recipe.selling_price for b in batches_today.select_related("plan_item__recipe")),
                Decimal("0"),
            )
            payload["actual_food_cost_pct"] = (
                round(actual_cost_total / revenue_total * 100, 1) if revenue_total else None
            )

        return Response(payload)
