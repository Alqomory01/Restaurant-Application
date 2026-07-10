from datetime import datetime, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
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

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        """Copy this plan's items onto other dates as new DRAFT plans — a
        lightweight "plan the week" template, not a synced/linked copy:
        each generated plan is independently editable afterward. Staff
        assignment isn't copied (a different day likely means different
        people); a target date that already has a plan for this service
        period is skipped rather than overwritten or duplicated."""
        plan = self.get_object()
        raw_dates = request.data.get("dates")
        if not raw_dates:
            return Response({"detail": "Provide at least one target date."}, status=status.HTTP_400_BAD_REQUEST)

        items = list(plan.items.select_related("recipe"))
        created = []
        skipped = []

        with transaction.atomic():
            for raw_date in raw_dates:
                target_date = parse_date(raw_date)
                if not target_date:
                    continue
                if ProductionPlan.objects.filter(
                    service_date=target_date, service_period=plan.service_period
                ).exists():
                    skipped.append(raw_date)
                    continue

                new_plan = ProductionPlan.objects.create(
                    service_date=target_date,
                    service_period=plan.service_period,
                    created_by=request.user,
                )
                ProductionPlanItem.objects.bulk_create(
                    ProductionPlanItem(
                        plan=new_plan,
                        recipe=item.recipe,
                        planned_qty=item.planned_qty,
                        unit=item.unit,
                        scheduled_time=item.scheduled_time,
                    )
                    for item in items
                )
                log_action(request.user, "DUPLICATED", new_plan, detail=f"From {plan}")
                created.append(new_plan)

        return Response(
            {
                "created": ProductionPlanSerializer(created, many=True).data,
                "skipped_dates": skipped,
            },
            status=status.HTTP_201_CREATED,
        )


class ProductionPlanItemViewSet(viewsets.ModelViewSet):
    queryset = ProductionPlanItem.objects.select_related("recipe", "assigned_to", "batch")
    serializer_class = ProductionPlanItemSerializer

    def perform_create(self, serializer):
        item = serializer.save()
        log_action(self.request.user, "ADDED_ITEM", item, detail=f"{item.recipe.name} x{item.planned_qty}{item.unit}")

    def perform_update(self, serializer):
        # Editing an item that already has a batch (in progress or complete)
        # would silently desync planned_qty from what was actually started —
        # only a still-pending item is safe to change.
        if serializer.instance.status != ProductionPlanItem.Status.PENDING:
            raise ValidationError("Only pending items can be edited — this one is already in progress or complete.")
        item = serializer.save()
        log_action(self.request.user, "UPDATED_ITEM", item, detail=f"{item.recipe.name} x{item.planned_qty}{item.unit}")

    def perform_destroy(self, instance):
        # Deleting an item with a batch would cascade-delete that
        # BatchProduction (and its IngredientDeduction rows), silently
        # erasing real production/cost history.
        if instance.status != ProductionPlanItem.Status.PENDING:
            raise ValidationError("Only pending items can be removed — this one is already in progress or complete.")
        log_action(self.request.user, "REMOVED_ITEM", instance, detail=f"{instance.recipe.name}")
        instance.delete()

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

        serializer = BatchCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            # Re-fetch and hold the lock for the entire operation, not just
            # the status check. Releasing it in between (e.g. by ending this
            # atomic block early) reopens the same race it's meant to
            # close: two concurrent `complete` calls could both read
            # status=IN_PROGRESS before either writes, and both proceed to
            # deduct stock — the batch gets completed twice over.
            batch = BatchProduction.objects.select_for_update().get(pk=batch.pk)
            if batch.status == BatchProduction.Status.COMPLETE:
                return Response({"detail": "Batch already complete."}, status=status.HTTP_400_BAD_REQUEST)

            recipe = batch.plan_item.recipe
            scale = data["actual_qty"] / recipe.yield_qty

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


def _day_batches_and_efficiency(date):
    batches = BatchProduction.objects.filter(
        plan_item__plan__service_date=date, status=BatchProduction.Status.COMPLETE
    )
    planned_sum = batches.aggregate(s=Sum("planned_qty"))["s"] or Decimal("0")
    actual_sum = batches.aggregate(s=Sum("actual_qty"))["s"] or Decimal("0")
    efficiency = round((actual_sum / planned_sum * 100), 1) if planned_sum else None
    return batches, efficiency


def _day_food_cost_pct(date, batches):
    deductions = IngredientDeduction.objects.filter(
        batch__plan_item__plan__service_date=date
    ).select_related("batch__plan_item__recipe")
    actual_cost_total = sum((d.actual_qty * d.unit_cost_at_time for d in deductions), Decimal("0"))
    revenue_total = sum(
        (b.actual_qty * b.plan_item.recipe.selling_price for b in batches.select_related("plan_item__recipe")),
        Decimal("0"),
    )
    return round(actual_cost_total / revenue_total * 100, 1) if revenue_total else None


class DashboardView(APIView):
    def get(self, request):
        today = timezone.localdate()
        yesterday = today - timedelta(days=1)
        items_today = ProductionPlanItem.objects.filter(plan__service_date=today)
        total = items_today.count()
        complete = items_today.filter(status=ProductionPlanItem.Status.COMPLETE).count()

        batches_today, efficiency = _day_batches_and_efficiency(today)
        batches_yesterday, efficiency_yesterday = _day_batches_and_efficiency(yesterday)

        shortfall_count = StockRequest.objects.filter(status=StockRequest.Status.PENDING).count()
        wastage_today = WastageLog.objects.filter(logged_at__date=today)
        wastage_yesterday_count = WastageLog.objects.filter(logged_at__date=yesterday).count()

        payload = {
            "batches_today_total": total,
            "batches_today_complete": complete,
            "production_efficiency_pct": efficiency,
            # "Yesterday" comparisons are real historical figures (not
            # projected/fabricated) — they let the dashboard show a trend
            # arrow instead of a bare snapshot number.
            "production_efficiency_pct_yesterday": efficiency_yesterday,
            "ingredient_shortfall_count": shortfall_count,
            "wastage_today_count": wastage_today.count(),
            "wastage_yesterday_count": wastage_yesterday_count,
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
            payload["actual_food_cost_pct"] = _day_food_cost_pct(today, batches_today)
            payload["actual_food_cost_pct_yesterday"] = _day_food_cost_pct(yesterday, batches_yesterday)

        return Response(payload)


class ReportsView(APIView):
    """Batch efficiency, wastage, and staff-output rollups over a date range.

    Sell-through can't be computed yet — there's no POS/DineFlow module to
    say what actually sold — so "utilization" (produced minus wasted, as a
    % of produced) stands in as the honest proxy until that data exists.
    Money figures (wastage value, per-staff wastage value) are Manager-only,
    same visibility rule as costing and wastage elsewhere in the module.
    """

    permission_classes = [IsHeadChefOrManager]

    def get(self, request):
        today = timezone.localdate()
        date_from = parse_date(request.query_params.get("date_from", "")) or today
        date_to = parse_date(request.query_params.get("date_to", "")) or today
        if date_to < date_from:
            date_from, date_to = date_to, date_from

        is_manager = request.user.role == request.user.Role.MANAGER or request.user.is_superuser

        batches = list(
            BatchProduction.objects.filter(
                status=BatchProduction.Status.COMPLETE,
                completed_at__date__gte=date_from,
                completed_at__date__lte=date_to,
            ).select_related("plan_item__recipe", "produced_by")
        )
        wastage = list(
            WastageLog.objects.filter(
                logged_at__date__gte=date_from, logged_at__date__lte=date_to
            ).select_related("batch__plan_item__recipe", "logged_by")
        )

        by_recipe = {}
        for b in batches:
            recipe = b.plan_item.recipe
            row = by_recipe.setdefault(
                recipe.id,
                {"recipe_id": recipe.id, "recipe_name": recipe.name, "batches_count": 0,
                 "planned_qty": Decimal("0"), "actual_qty": Decimal("0")},
            )
            row["batches_count"] += 1
            row["planned_qty"] += b.planned_qty
            row["actual_qty"] += b.actual_qty or Decimal("0")

        wasted_qty_by_recipe, wasted_value_by_recipe = {}, {}
        for w in wastage:
            if w.batch_id and w.batch and w.batch.plan_item_id:
                recipe_id = w.batch.plan_item.recipe_id
                value = w.qty * w.unit_cost_at_time
                wasted_qty_by_recipe[recipe_id] = wasted_qty_by_recipe.get(recipe_id, Decimal("0")) + w.qty
                wasted_value_by_recipe[recipe_id] = wasted_value_by_recipe.get(recipe_id, Decimal("0")) + value

        batch_efficiency = []
        for recipe_id, row in by_recipe.items():
            wasted_qty = wasted_qty_by_recipe.get(recipe_id, Decimal("0"))
            entry = {
                "recipe_id": row["recipe_id"],
                "recipe_name": row["recipe_name"],
                "batches_count": row["batches_count"],
                "planned_qty": row["planned_qty"],
                "actual_qty": row["actual_qty"],
                "production_efficiency_pct": (
                    round(row["actual_qty"] / row["planned_qty"] * 100, 1) if row["planned_qty"] else None
                ),
                "wasted_qty": wasted_qty,
                "utilization_pct": (
                    round((row["actual_qty"] - wasted_qty) / row["actual_qty"] * 100, 1)
                    if row["actual_qty"] else None
                ),
            }
            if is_manager:
                entry["wasted_value"] = round(wasted_value_by_recipe.get(recipe_id, Decimal("0")), 2)
            batch_efficiency.append(entry)
        batch_efficiency.sort(key=lambda r: r["recipe_name"])

        by_reason = {}
        total_count, total_value = 0, Decimal("0")
        for w in wastage:
            value = w.qty * w.unit_cost_at_time
            total_count += 1
            total_value += value
            bucket = by_reason.setdefault(w.reason, {"reason": w.reason, "count": 0, "value": Decimal("0")})
            bucket["count"] += 1
            bucket["value"] += value

        by_reason_list = sorted(by_reason.values(), key=lambda r: r["count"], reverse=True)
        for r in by_reason_list:
            r["value"] = round(r["value"], 2) if is_manager else None
            if not is_manager:
                del r["value"]

        wastage_summary = {"total_count": total_count, "by_reason": by_reason_list}
        if is_manager:
            wastage_summary["total_value"] = round(total_value, 2)

        by_staff = {}
        for b in batches:
            if not b.produced_by_id:
                continue
            entry = by_staff.setdefault(
                b.produced_by_id,
                {"user_id": b.produced_by_id, "name": _display_name(b.produced_by),
                 "batches_completed": 0, "wastage_logged": 0, "wastage_value": Decimal("0")},
            )
            entry["batches_completed"] += 1
        for w in wastage:
            if not w.logged_by_id:
                continue
            entry = by_staff.setdefault(
                w.logged_by_id,
                {"user_id": w.logged_by_id, "name": _display_name(w.logged_by),
                 "batches_completed": 0, "wastage_logged": 0, "wastage_value": Decimal("0")},
            )
            entry["wastage_logged"] += 1
            entry["wastage_value"] += w.qty * w.unit_cost_at_time

        staff_output = sorted(by_staff.values(), key=lambda s: s["batches_completed"], reverse=True)
        for s in staff_output:
            if is_manager:
                s["wastage_value"] = round(s["wastage_value"], 2)
            else:
                del s["wastage_value"]

        return Response(
            {
                "date_from": date_from,
                "date_to": date_to,
                "batch_efficiency": batch_efficiency,
                "wastage_summary": wastage_summary,
                "staff_output": staff_output,
            }
        )


def _display_name(user):
    full = f"{user.first_name} {user.last_name}".strip()
    return full or user.username
