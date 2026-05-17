# Product IA Refinement

## Purpose

Record the refined product information architecture for the Construction Feasibility Control Plane.

The app should be organized around the decisions and handoffs in a unified development and design/construction delivery workflow, not around raw data tables.

## Operating Areas

## Sites

Sites are the opportunity pipeline.

They hold site-specific context:

- sites to explore, sites being explored, active opportunities, and archived opportunities
- site resources, reports, links, and evidence
- local planning intelligence and constraints
- site-specific knowledge that should not become reusable Base Data
- scenario options attached to the site

## Scenarios

Scenarios are design/development options for a site.

Scenario pages should carry the option evidence:

- yield and configuration
- scenario-level feasibility summary
- cost assumptions and cost evidence
- sales/revenue assumptions
- planning fit
- programme and schedule implication
- Project Network review status
- operational overlays and controlled model change context

## Feasibility

Feasibility is the comparison board, not the main data-entry home.

Scenario pages answer: Does this option work?

The Feasibility board answers: Which option or site should we back?

## Project Network

Project Network is an active human and agentic review layer.

It should not be treated as a passive repository. It should support inquiries, review threads, work products, recommendations, dissent, unresolved assumptions, and scenario-linked review evidence.

Reusable knowledge packs may feed the Project Network, but the product value is the review activity and judgment.

## Base Data

Base Data is reusable reference material that powers decisions.

It can hold:

- base costs and rate libraries
- planning rules and reusable regulatory references
- standard assumptions
- controlled vocabularies
- benchmark or reference knowledge

Site-specific knowledge stays on the site. Scenario-specific review stays on the scenario or in Project Network linked to that scenario.

## Archicad Connect

Archicad Connect governs the relationship with Archicad.

Primary order:

1. Archicad Sync
2. Inventory
3. Model Change Approvals

Inventory means synced Archicad-linked project records: objects, zones, packages, and current CCP metadata.

Model Change Approvals means governed CCP metadata updates intended for Archicad write-back through the connector.

Archicad Sync means companion/connector controls, inbound refresh, outbound write-back, and bridge/sync evidence.

## Implementation Rule

Keep route paths stable until the language has proven itself in use. Prefer label, heading, copy, and cross-link changes before route renames, schema changes, or major UI refactors.
