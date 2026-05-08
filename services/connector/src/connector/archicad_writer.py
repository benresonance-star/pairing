from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .archicad_client import ArchicadClientProtocol
from .supabase_client import SupabaseClientProtocol
from .validators import archicad_field_name


class ArchicadWriter:
    def __init__(
        self,
        supabase_client: SupabaseClientProtocol,
        archicad_client: ArchicadClientProtocol,
        *,
        dry_run: bool,
    ) -> None:
        self.supabase_client = supabase_client
        self.archicad_client = archicad_client
        self.dry_run = dry_run

    def apply_change(self, item: dict[str, Any], archicad_guid: str | None) -> None:
        field_name = archicad_field_name(item["field_name"])
        field_value = item["new_value_json"]
        if not self.dry_run:
            if archicad_guid is None:
                raise ValueError("Archicad GUID is required for a live write")
            self.archicad_client.write_property(
                archicad_guid=archicad_guid,
                field_name=field_name,
                field_value=field_value,
            )

        payload = {
            "archicad_guid": archicad_guid,
            "field_name": field_name,
            "field_value": field_value,
            "change_set_id": item["change_set_id"],
            "scenario_id": item.get("scenario_id"),
            "applied_at": datetime.now(tz=timezone.utc).isoformat(),
            "dry_run": self.dry_run,
        }
        self.supabase_client.record_archicad_write(payload)
