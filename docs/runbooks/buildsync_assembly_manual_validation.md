# BuildSync Assembly Wrapper Manual Validation

Use this checklist after the native Archicad add-on is built and loaded. The local Python listener should run on `http://127.0.0.1:8765`.

## Prerequisites

1. Load the BuildSync Archicad add-on.
2. Open a model containing at least three editable elements such as slabs, walls, objects, beams, or columns.
3. Confirm the `BuildSync` property group exists or allow the add-on to create it when prompted.
4. Start the listener when testing online sync:

```powershell
python -m uvicorn python_listener.main:app --host 127.0.0.1 --port 8765
```

## Test 1: Create Assembly

1. Select three editable elements in Archicad.
2. Run `BuildSync -> Create Assembly from Selection`.
3. Enter:
   - Type: `Joinery`
   - Name: `Kitchen Island`
   - Zone: `Apartment 204`
   - Level: `L02`
   - Trade: `Joinery`
   - Task ID: `TASK-240`
4. Confirm an assembly ID such as `JN-001` is created.
5. Inspect each member and confirm these properties are stamped:
   - `BS_AssemblyID`
   - `BS_AssemblyUUID`
   - `BS_AssemblyName`
   - `BS_AssemblyType`
   - `BS_AssemblyVersion`
   - `BS_TaskID`
   - `BS_Trade`
   - `BS_Status`

Expected result: the assembly is created locally, the selected elements remain editable, and an `assembly_created` event is queued or sent.

## Test 2: Select Members

1. Deselect everything.
2. Select one member of the new assembly.
3. Run `BuildSync -> Select Assembly Members`.

Expected result: all live members of the assembly are selected. Missing/deleted members are not selected.

## Test 3: Add Member

1. Select one existing member of the assembly and one unassigned element.
2. Run `BuildSync -> Add Selection to Assembly`.
3. Inspect the newly added element.

Expected result: the new element receives matching `BS_*` properties and the assembly version increments.

## Test 4: Remove Member

1. Select one assembly member.
2. Run `BuildSync -> Remove Selection from Assembly`.
3. Inspect the removed element.

Expected result: the element geometry remains in the model, its `BS_*` assembly fields are cleared, and the assembly version increments.

## Test 5: Deleted Member Validation

1. Delete one member using normal Archicad delete behavior.
2. Select another member from the same assembly.
3. Run `BuildSync -> Validate Selected Assembly`.

Expected result: validation reports a `MISSING_MEMBER` warning and does not silently repair or ignore the issue.

## Test 6: Listener Offline Queue

1. Stop the Python listener.
2. Create or update an assembly.

Expected result: the local command succeeds and the user sees `Python listener is offline. Event queued for later sync.`

## Test 7: Listener Online Flush

1. Start the Python listener.
2. Run `BuildSync -> Sync with Python Listener`.
3. Check the listener logs or SQLite database for received events.

Expected result: queued events post in order and are marked sent locally.

## Snapshot/Web Visibility

After assembly properties are stamped, run the existing Archicad snapshot bridge and open `Integrations -> Archicad` in the web app. Snapshot preview rows for assembly members should show the BuildSync assembly ID and name.
