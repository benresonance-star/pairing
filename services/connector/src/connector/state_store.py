from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class StateStore:
    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> dict[str, Any]:
        if not self.path.exists():
            return {}
        return json.loads(self.path.read_text(encoding="utf-8"))

    def save(self, payload: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def mark_run(self, *, direction: str, run_id: str) -> None:
        payload = self.load()
        payload[direction] = {
            "run_id": run_id,
            "updated_at": datetime.now(tz=timezone.utc).isoformat(),
        }
        self.save(payload)
