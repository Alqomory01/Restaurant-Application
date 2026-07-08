from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    BatchProductionViewSet,
    CostingView,
    DashboardView,
    IngredientViewSet,
    KitchenStockViewSet,
    ProductionPlanItemViewSet,
    ProductionPlanViewSet,
    RecipeViewSet,
    StockRequestViewSet,
)

router = DefaultRouter()
router.register("recipes", RecipeViewSet, basename="recipe")
router.register("ingredients", IngredientViewSet, basename="ingredient")
router.register("stock", KitchenStockViewSet, basename="kitchen-stock")
router.register("plans", ProductionPlanViewSet, basename="production-plan")
router.register("plan-items", ProductionPlanItemViewSet, basename="production-plan-item")
router.register("batches", BatchProductionViewSet, basename="batch-production")
router.register("stock-requests", StockRequestViewSet, basename="stock-request")

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="kitchen-dashboard"),
    path("costing/", CostingView.as_view(), name="kitchen-costing"),
    path("", include(router.urls)),
]
