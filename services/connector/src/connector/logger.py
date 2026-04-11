from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any


def log_event(level: str, message: str, **context: Any) -> None:
    payload = {
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "level": level,
        "message": message,
        **context,
    }
    print(json.dumps(payload, sort_keys=True))
