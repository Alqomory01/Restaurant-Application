from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


class Organization(models.Model):
    """Stub for future multi-tenancy. Mise ERP is planned as a multi-tenant
    SaaS product (monthly plan) plus a one-time-deployment enterprise plan —
    see the project's business-model notes. Nothing is scoped to this yet;
    it exists now, cheaply, so that models created between now and when
    real tenant isolation gets built don't need an expensive retrofit to
    add an organization_id to every table once real customer data exists.
    """

    class Plan(models.TextChoices):
        MONTHLY = "MONTHLY", "Monthly subscription"
        ONE_TIME_DEPLOYMENT = "ONE_TIME_DEPLOYMENT", "One-time deployment"

    name = models.CharField(max_length=120)
    plan = models.CharField(max_length=20, choices=Plan.choices, default=Plan.MONTHLY)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Branch(models.Model):
    """Stub for future multi-branch support. Not yet used to scope queries."""

    organization = models.ForeignKey(
        Organization, null=True, blank=True, on_delete=models.SET_NULL, related_name="branches"
    )
    name = models.CharField(max_length=120)

    def __str__(self):
        return self.name


class User(AbstractUser):
    class Role(models.TextChoices):
        HEAD_CHEF = "HEAD_CHEF", "Head Chef"
        KITCHEN_STAFF = "KITCHEN_STAFF", "Kitchen Staff"
        MANAGER = "MANAGER", "Manager"
        STORE_KEEPER = "STORE_KEEPER", "Store Keeper"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.KITCHEN_STAFF)
    branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL, related_name="users")

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"


class AuditLog(models.Model):
    """Append-only record of who did what. Lives here rather than in the
    kitchen app because every future module (FoodOps, DineFlow) needs the
    same "who completed/approved/deleted this" answer, not just kitchen."""

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="audit_entries"
    )
    action = models.CharField(max_length=30)
    model_name = models.CharField(max_length=60)
    object_id = models.CharField(max_length=40)
    object_repr = models.CharField(max_length=255)
    detail = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["model_name", "object_id"])]

    def __str__(self):
        return f"{self.actor}: {self.action} {self.model_name} {self.object_repr}"
