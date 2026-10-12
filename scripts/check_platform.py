"""Read-only V7 readiness diagnostic: stdout only, no downloads or execution."""

import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "dashboard"), str(ROOT / "scripts"), str(ROOT)]
import platform_api  # noqa: E402

from src.experiments.h2_evaluation_offline import no_network  # noqa: E402


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    with no_network():
        report = platform_api.overview()
    print(json.dumps(report, ensure_ascii=False, indent=2, default=str))
    if not report["integrity"]["available"] or not (
        report["integrity"].get("data") or {}
    ).get("ok"):
        raise SystemExit(2)


if __name__ == "__main__":
    main()
