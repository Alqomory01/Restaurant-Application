from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AuditLogView,
    BatchProductionViewSet,
    CostingSummaryView,
    CostingView,
    DashboardView,
    IngredientViewSet,
    KitchenStockViewSet,
    ProductionPlanItemViewSet,
    ProductionPlanViewSet,
    RecipeViewSet,
    ReportsView,
    StockRequestViewSet,
    WastageLogViewSet,
)

router = DefaultRouter()
router.register("recipes", RecipeViewSet, basename="recipe")
router.register("ingredients", IngredientViewSet, basename="ingredient")
router.register("stock", KitchenStockViewSet, basename="kitchen-stock")
router.register("plans", ProductionPlanViewSet, basename="production-plan")
router.register("plan-items", ProductionPlanItemViewSet, basename="production-plan-item")
router.register("batches", BatchProductionViewSet, basename="batch-production")
router.register("stock-requests", StockRequestViewSet, basename="stock-request")
router.register("wastage", WastageLogViewSet, basename="wastage-log")

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="kitchen-dashboard"),
    path("reports/", ReportsView.as_view(), name="kitchen-reports"),
    path("activity/", AuditLogView.as_view(), name="kitchen-activity"),
    path("costing/summary/", CostingSummaryView.as_view(), name="kitchen-costing-summary"),
    path("costing/", CostingView.as_view(), name="kitchen-costing"),
    path("", include(router.urls)),
]
