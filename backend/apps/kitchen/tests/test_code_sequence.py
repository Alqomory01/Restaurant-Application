import threading

from django.db import connection
from django.test import TransactionTestCase

from apps.kitchen.utils import next_code


class CodeSequenceTests(TransactionTestCase):
    """TransactionTestCase (not TestCase) because this needs real separate
    DB connections per thread to actually exercise select_for_update — a
    plain TestCase wraps the whole test in one outer transaction, which
    would make every "concurrent" call see the same uncommitted state and
    prove nothing."""

    def test_sequential_codes_increment(self):
        codes = [next_code("BP") for _ in range(5)]
        self.assertEqual(codes, ["BP-0001", "BP-0002", "BP-0003", "BP-0004", "BP-0005"])

    def test_concurrent_calls_never_collide(self):
        results = []
        lock = threading.Lock()

        def worker():
            code = next_code("KSR")
            connection.close()  # each thread needs its own connection
            with lock:
                results.append(code)

        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(results), 10)
        self.assertEqual(len(set(results)), 10, f"expected 10 unique codes, got collisions: {results}")
