#!/bin/sh
set -e

echo "Waiting for database..."
python - <<'PYEOF'
import os
import sys
import time

import psycopg

for attempt in range(30):
    try:
        psycopg.connect(
            dbname=os.environ.get("POSTGRES_DB", "mise_erp"),
            user=os.environ.get("POSTGRES_USER", "mise"),
            password=os.environ.get("POSTGRES_PASSWORD", "mise"),
            host=os.environ.get("POSTGRES_HOST", "db"),
            port=os.environ.get("POSTGRES_PORT", "5432"),
        ).close()
        sys.exit(0)
    except psycopg.OperationalError:
        time.sleep(1)
else:
    sys.exit(1)
PYEOF

python manage.py migrate --noinput
python manage.py seed_kitchen_demo
exec python manage.py runserver 0.0.0.0:8000
