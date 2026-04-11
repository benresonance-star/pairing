from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class DemoArchicadClient:
    def __init__(self, snapshot_path: Path) -> None:
        self.snapshot_path = snapshot_path

    def get_product_info(self) -> dict[str, str]:
        return {
            "product_name": "Archicad Demo Adapter",
            "connection": "fixture",
        }

    def read_snapshot(self) -> dict[str, Any]:
        return json.loads(self.snapshot_path.read_text(encoding="utf-8"))
