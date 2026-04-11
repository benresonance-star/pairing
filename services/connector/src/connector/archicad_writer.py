from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .supabase_client import DemoSupabaseClient
from .validators import archicad_field_name


class ArchicadWriter:
    def __init__(self, supabase_client: DemoSupabaseClient, *, dry_run: bool) -> None:
        self.supabase_client = supabase_client
        self.dry_run = dry_run

    def apply_change(self, item: dict[str, Any], archicad_guid: str | None) -> None:
        payload = {
            "archicad_guid": archicad_guid,
            "field_name": archicad_field_name(item["field_name"]),
            "field_value": item["new_value_json"],
            "change_set_id": item["change_set_id"],
            "applied_at": datetime.now(tz=timezone.utc).isoformat(),
            "dry_run": self.dry_run,
        }
        self.supabase_client.record_archicad_write(payload)
