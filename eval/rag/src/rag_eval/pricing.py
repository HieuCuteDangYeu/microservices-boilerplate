"""Version-controlled Cloudflare pricing catalog loader."""

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CATALOG = ROOT / "config/cloudflare-pricing-v1.json"


def load_pricing(path: Path = DEFAULT_CATALOG) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))
