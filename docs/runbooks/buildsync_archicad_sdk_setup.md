# BuildSync Archicad SDK Setup

This runbook covers setup work that can happen before the Archicad C++ API Development Kit files are available, and the checks to run after the SDK is installed.

## Current Native Build

The SDK-free core can be built and tested now:

```powershell
npm run buildsync:native:test
```

This runs:

```powershell
cmake --preset vs2026-x64
cmake --build --preset debug
cmake --build buildsync-archicad-addon/build --config Debug --target RUN_TESTS
```

## Expected SDK Layout

Download and extract the Archicad API Development Kit that matches the target Archicad version. Set:

```powershell
$env:ARCHICAD_SDK_ROOT = "C:\Path\To\Archicad API Development Kit"
```

The smoke script expects:

```text
%ARCHICAD_SDK_ROOT%\Support\Inc\ACAPinc.h
%ARCHICAD_SDK_ROOT%\Support\Inc\APIEnvir.h
```

## SDK Build Check

After setting `ARCHICAD_SDK_ROOT`, run:

```powershell
npm run buildsync:native:sdk
```

That builds the normal native tests first, then configures the optional SDK target:

```powershell
cmake --preset vs2026-x64-sdk
cmake --build --preset sdk-debug
```

## Readiness Gates

The `.apx` target is not considered usable in Archicad until these are complete:

1. SDK resource files are added for add-on metadata and BuildSync menu strings.
2. `ArchicadSelectionReader` compiles against the installed SDK.
3. `ArchicadElementPropertyWriter` creates, writes, and clears `BuildSync/BS_*` properties.
4. `ArchicadElementExistenceChecker` validates stored member GUIDs against the open model.
5. `ArchicadHighlightController` selects/highlights all live assembly members.
6. Manual validation in `docs/runbooks/buildsync_assembly_manual_validation.md` passes in Archicad.

## Useful Commands

```powershell
npm run buildsync:native:test
npm run buildsync:native:sdk
python -m pytest services/connector/tests python_listener/tests
```
