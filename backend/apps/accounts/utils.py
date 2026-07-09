from .models import AuditLog


def log_action(actor, action, obj, detail=""):
    """Record a state-changing action. Called at the point of mutation, not
    reconstructed after the fact — see the kitchen module review for why
    "who did this and when" needs to be answerable, not just inferable."""
    AuditLog.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        model_name=obj.__class__.__name__,
        object_id=str(obj.pk),
        object_repr=str(obj)[:255],
        detail=detail,
    )
