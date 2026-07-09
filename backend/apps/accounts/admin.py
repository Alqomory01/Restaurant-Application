from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import AuditLog, Branch, User


@admin.register(User)
class MiseUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Mise ERP", {"fields": ("role", "branch")}),)
    list_display = ("username", "email", "role", "branch", "is_staff")


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("id", "name")


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "actor", "action", "model_name", "object_repr")
    list_filter = ("action", "model_name")
    readonly_fields = [f.name for f in AuditLog._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
