# Scenario Clone Validation

## Goal

Validate that scenario cloning duplicates operational state without duplicating the identity tables.

## Steps

1. Seed a baseline scenario with operational records.
2. Invoke the scenario clone helper.
3. Inspect the cloned scenario records.
4. Compare both scenarios in the web app or runtime state.

## Expected outcomes

- a new scenario row is created
- `operational_state` is copied for the new scenario
- `model_objects`, `zones`, and `hotlink_instances` are not duplicated
