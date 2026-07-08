from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Branch, User


@admin.register(User)
class MiseUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Mise ERP", {"fields": ("role", "branch")}),)
    list_display = ("username", "email", "role", "branch", "is_staff")


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("id", "name")
