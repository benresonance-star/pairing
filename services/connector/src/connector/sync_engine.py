from __future__ import annotations

from .archicad_client import DemoArchicadClient
from .archicad_reader import ArchicadReader
from .archicad_writer import ArchicadWriter
from .config import ConnectorConfig
from .logger import log_event
from .models import OperationalStateRecord, SyncRunSummary
from .schema_mapper import build_operational_state_id, map_element, map_zone
from .state_store import StateStore
from .supabase_client import DemoSupabaseClient
from .validators import validate_outbound_item


class SyncEngine:
    def __init__(self, config: ConnectorConfig) -> None:
        self.config = config
        self.supabase_client = DemoSupabaseClient(
            seed_state_path=config.seed_state_path,
            runtime_state_path=config.runtime_state_path,
        )
        self.archicad_client = DemoArchicadClient(config.sample_snapshot_path)
        self.reader = ArchicadReader(self.archicad_client)
        self.writer = ArchicadWriter(self.supabase_client, dry_run=config.dry_run)
        self.state_store = StateStore(config.connector_state_path)

    def seed_runtime(self) -> None:
        self.supabase_client.seed_runtime_state()

    def reset_runtime(self) -> None:
        self.supabase_client.reset_runtime_state()

    def run_inbound(self) -> SyncRunSummary:
        run_id = self.supabase_client.create_sync_run(
            project_id=self.config.project_id,
            direction="archicad_to_supabase",
        )
        payload = self.reader.read_zones_and_elements()
        zones = [map_zone(self.config.project_id, item) for item in payload["zones"]]
        model_objects = [map_element(self.config.project_id, item) for item in payload["elements"]]

        self.supabase_client.upsert_zones(zones)
        self.supabase_client.upsert_model_objects(model_objects)

        baseline_scenario_id = self.supabase_client.baseline_scenario_id()
        operational_state = []
        for raw_zone, zone in zip(payload["zones"], zones, strict=True):
            operational_state.append(
                OperationalStateRecord(
                    id=build_operational_state_id(baseline_scenario_id, "zone", zone.id),
                    project_id=self.config.project_id,
                    scenario_id=baseline_scenario_id,
                    object_ref_type="zone",
                    object_ref_id=zone.id,
                    package_id=raw_zone.get("ccp_operational", {}).get("package_id"),
                    construction_state=raw_zone.get("ccp_operational", {}).get("construction_state"),
                    updated_by="connector-inbound",
                )
            )
        for raw_element, element in zip(payload["elements"], model_objects, strict=True):
            operational_state.append(
                OperationalStateRecord(
                    id=build_operational_state_id(baseline_scenario_id, "model_object", element.id),
                    project_id=self.config.project_id,
                    scenario_id=baseline_scenario_id,
                    object_ref_type="model_object",
                    object_ref_id=element.id,
                    package_id=raw_element.get("ccp_operational", {}).get("package_id"),
                    construction_state=raw_element.get("ccp_operational", {}).get("construction_state"),
                    updated_by="connector-inbound",
                )
            )
        self.supabase_client.ensure_operational_state(operational_state)

        summary = SyncRunSummary(
            direction="archicad_to_supabase",
            status="completed",
            objects_read=len(zones) + len(model_objects),
            objects_written=len(zones) + len(model_objects),
        )
        self.supabase_client.finalize_sync_run(run_id, summary)
        self.supabase_client.create_audit_event(
            project_id=self.config.project_id,
            event_type="inbound_sync_completed",
            payload_json=summary.to_dict(),
        )
        self.state_store.mark_run(direction="archicad_to_supabase", run_id=run_id)
        log_event("info", "Inbound sync complete", run_id=run_id, summary=summary.to_dict())
        return summary

    def run_outbound(self) -> SyncRunSummary:
        queued_change_sets = self.supabase_client.fetch_queued_change_sets()
        aggregate = SyncRunSummary(
            direction="supabase_to_archicad",
            status="completed",
            objects_read=0,
            objects_written=0,
        )
        work_packages = self.supabase_client.get_work_packages()
        last_run_id = ""

        for change_set in queued_change_sets:
            last_run_id = self.supabase_client.create_sync_run(
                project_id=self.config.project_id,
                direction="supabase_to_archicad",
            )
            summary = SyncRunSummary(
                direction="supabase_to_archicad",
                status="completed",
                objects_read=len(change_set["items"]),
                objects_written=0,
            )
            errors: list[str] = []

            if not change_set["items"]:
                errors.append("queued change set contains no items")

            for item in change_set["items"]:
                validation_error = validate_outbound_item(item, work_packages)
                if validation_error is not None:
                    errors.append(validation_error)
                    continue
                archicad_guid = self.supabase_client.get_record_guid(
                    item["object_ref_type"], item["object_ref_id"]
                )
                if archicad_guid is None:
                    errors.append(
                        f"missing target Archicad GUID for {item['object_ref_type']}:{item['object_ref_id']}"
                    )
                    continue
                try:
                    self.writer.apply_change(item, archicad_guid)
                    self.supabase_client.apply_change_set_item(item)
                    summary.objects_written += 1
                except Exception as error:  # noqa: BLE001
                    errors.append(str(error))

            if errors:
                summary.status = "completed_with_errors"
                summary.errors.extend(errors)
                self.supabase_client.update_change_set_status(
                    change_set["id"], "sync_failed", errors=errors
                )
            else:
                self.supabase_client.update_change_set_status(change_set["id"], "synced")

            self.supabase_client.finalize_sync_run(last_run_id, summary)
            self.supabase_client.create_audit_event(
                project_id=self.config.project_id,
                event_type="outbound_sync_completed",
                payload_json={"change_set_id": change_set["id"], **summary.to_dict()},
            )

            aggregate.objects_read += summary.objects_read
            aggregate.objects_written += summary.objects_written
            aggregate.errors.extend(summary.errors)

        if aggregate.errors:
            aggregate.status = "completed_with_errors"

        if last_run_id:
            self.state_store.mark_run(direction="supabase_to_archicad", run_id=last_run_id)
        log_event("info", "Outbound sync complete", summary=aggregate.to_dict())
        return aggregate
