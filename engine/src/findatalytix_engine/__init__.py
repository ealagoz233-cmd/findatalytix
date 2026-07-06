"""findatalytix-engine — FinDatalytix çekirdek finansal motoru.

Dışa açılan kapı (public API). Backend yalnızca buradan import eder:

    from findatalytix_engine import run_gbm, seed_from_prompt
"""

from .simulation import run_gbm, seed_from_prompt

__version__ = "0.1.0"
__all__ = ["run_gbm", "seed_from_prompt"]
