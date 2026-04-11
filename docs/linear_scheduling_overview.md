# Linear Scheduling Overview

## Purpose

This document explains how the MVP approaches linear scheduling as a read-only communication tool before introducing editing behavior.

The terminology and visual goals are informed by the attached linear scheduling reference material:

- one-page readability
- explicit time and location axes
- activity-type-aware rendering
- baseline, planned, actual, and remaining overlays
- construction sequencing visibility for non-schedulers

## What The First Milestone Includes

- a project-scoped location axis
- a named read-only schedule view
- an optional stage-flow diagram defined as explicit schedule-view metadata
- plotted activities with one of four types:
  - `linear`
  - `bar`
  - `block`
  - `milestone`
- optional actual progress points
- filtering by scenario, workfront, package, or activity type
- multi-package filtering through checkbox selection in the web UI
- linked highlighting across the flow view, time-location chart, Gantt, and detail panel

## What The First Milestone Does Not Include

- drag-and-drop editing
- dependency editing
- productivity-rate calculations
- automatic conflict resolution
- geometry-derived stationing extraction

## Metadata Linkage

The schedule view remains linked to the existing data model through:

- project and scenario
- object references where applicable
- `package_id`
- `workfront`
- `sequence_group`
- `sequence_order`
- planned and actual dates
- construction state
- schedule-view `flow_diagram` metadata for high-level nodes and edges
- activity `metadata_json.stage_key` values for stage-to-activity highlighting

## Location Axis Strategy

The first milestone supports location-axis definitions managed in the external system, for example:

- storey sequence
- stationing
- named segments

This avoids taking on geometry extraction while still allowing a meaningful time-location view.

## Current Demo Shape

The current demo seed expresses the linear-scheduling milestone as a townhouse development scenario with:

- townhouse-lot locations rather than storey rooms
- baseline and recovery scenarios
- staged package/workfront progression
- a stage-flow panel above the Gantt to explain high-level handoffs

This demo narrative is illustrative only. The underlying implementation remains project-scoped rather than townhouse-specific.
