from django.contrib.auth.models import AbstractUser
from django.db import models


class Branch(models.Model):
    """Stub for future multi-branch support. Not yet used to scope queries."""

    name = models.CharField(max_length=120)

    def __str__(self):
        return self.name


class User(AbstractUser):
    class Role(models.TextChoices):
        HEAD_CHEF = "HEAD_CHEF", "Head Chef"
        KITCHEN_STAFF = "KITCHEN_STAFF", "Kitchen Staff"
        MANAGER = "MANAGER", "Manager"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.KITCHEN_STAFF)
    branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL, related_name="users")

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"
