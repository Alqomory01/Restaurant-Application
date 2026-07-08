def next_code(model, field_name, prefix, width=4):
    """Generate the next sequential code like BP-0001 / KSR-0047 for a model field."""
    last = model.objects.order_by(f"-{field_name}").first()
    last_value = getattr(last, field_name, None) if last else None
    if last_value and last_value.startswith(f"{prefix}-"):
        try:
            last_num = int(last_value.split("-")[-1])
        except ValueError:
            last_num = model.objects.count()
    else:
        last_num = model.objects.count()
    return f"{prefix}-{str(last_num + 1).zfill(width)}"
