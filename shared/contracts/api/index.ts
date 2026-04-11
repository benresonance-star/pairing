import vocabularies from "../enums/vocabularies.json";

export const vocab = vocabularies;

export type ObjectRefType = (typeof vocab.objectRefTypes)[number];
export type ScenarioStatus = (typeof vocab.scenarioStatuses)[number];
export type ChangeSetStatus = (typeof vocab.changeSetStatuses)[number];
export type SyncDirection = (typeof vocab.syncDirections)[number];
export type SyncRunStatus = (typeof vocab.syncRunStatuses)[number];
export type ConstructionState = (typeof vocab.constructionStates)[number];
export type UnitValue = (typeof vocab.unitValues)[number];
export type LinearActivityType = (typeof vocab.linearActivityTypes)[number];
export type LinearAxisOrientation = (typeof vocab.linearAxisOrientations)[number];
export type LinearDisplayLayer = (typeof vocab.linearDisplayLayers)[number];
export type LinearLocationReferenceModel = (typeof vocab.linearLocationReferenceModels)[number];

export type ModelObjectRecord = {
  project_id: string;
  archicad_guid: string;
  object_type: string;
  classification?: string | null;
  storey?: string | null;
  zone_key?: string | null;
  hotlink_key?: string | null;
  name?: string | null;
  quantity_json?: Record<string, number | string | null> | null;
  archicad_snapshot_json?: Record<string, unknown> | null;
};

export type ZoneRecord = {
  project_id: string;
  zone_key: string;
  zone_name?: string | null;
  storey?: string | null;
  archicad_guid?: string | null;
  area?: number | null;
  metadata_json?: Record<string, unknown> | null;
};

export type ChangeSetItemRecord = {
  change_set_id: string;
  object_ref_type: ObjectRefType;
  object_ref_id: string;
  field_name: string;
  old_value_json?: unknown;
  new_value_json: unknown;
};

export type SyncRunSummary = {
  direction: SyncDirection;
  status: SyncRunStatus;
  objects_read: number;
  objects_written: number;
  warnings: string[];
  errors: string[];
};

export type LocationAxis = {
  project_id: string;
  name: string;
  description?: string | null;
  units_label?: string | null;
  location_reference_model: LinearLocationReferenceModel;
  orientation_default: LinearAxisOrientation;
  locations_json: Array<{
    id: string;
    label: string;
    order: number;
    start_station?: number | null;
    finish_station?: number | null;
  }>;
};

export type LinearScheduleView = {
  project_id: string;
  scenario_id?: string | null;
  location_axis_id: string;
  name: string;
  description?: string | null;
  time_axis_start: string;
  time_axis_finish: string;
  data_date?: string | null;
  orientation: LinearAxisOrientation;
};

export type LinearScheduleActivity = {
  project_id: string;
  scenario_id?: string | null;
  linear_schedule_view_id: string;
  object_ref_type?: ObjectRefType | null;
  object_ref_id?: string | null;
  package_id?: string | null;
  workfront?: string | null;
  activity_name: string;
  activity_type: LinearActivityType;
  display_layer: LinearDisplayLayer;
  color_key?: string | null;
  start_date: string;
  finish_date: string;
  location_ref?: string | null;
  start_location_ref?: string | null;
  finish_location_ref?: string | null;
  sequence_group?: string | null;
  sequence_order?: number | null;
  metadata_json?: Record<string, unknown> | null;
};

export type LinearProgressPoint = {
  project_id: string;
  linear_schedule_activity_id: string;
  progress_date: string;
  location_ref: string;
  note?: string | null;
};
