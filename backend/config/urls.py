from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(request):
    """Unauthenticated liveness check — the frontend polls this to tell
    "browser has no network" apart from "network is up but our API is down"."""
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/kitchen/", include("apps.kitchen.urls")),
]
