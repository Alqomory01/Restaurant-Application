from django.db import transaction

from .models import CodeSequence


def next_code(prefix, width=4):
    """Atomically generate the next sequential code like BP-0001 / KSR-0047.

    Locks a dedicated counter row for the prefix rather than reading the max
    existing code and guessing the next one — the latter races when two
    requests generate a code in the same instant.
    """
    with transaction.atomic():
        seq, _ = CodeSequence.objects.select_for_update().get_or_create(prefix=prefix)
        seq.last_value += 1
        seq.save(update_fields=["last_value"])
        return f"{prefix}-{str(seq.last_value).zfill(width)}"
