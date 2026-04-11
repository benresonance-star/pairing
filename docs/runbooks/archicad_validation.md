# Archicad Validation

## Goal

Confirm that approved CCP values are visible and usable inside Archicad after connector write-back.

## Steps

1. Open a model with the `CCP_Operational` property group configured.
2. Apply an approved `CCP_PackageID` update through the outbound connector flow.
3. Inspect the target object properties in Archicad.
4. Verify schedules can display the updated value.
5. Verify a Graphic Override rule can react to the updated value.

## Expected outcomes

- `CCP_PackageID` matches the approved change
- the property remains schedule-friendly
- Archicad display behavior reacts to the synced value without geometry changes
