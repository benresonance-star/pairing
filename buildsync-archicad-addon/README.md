# BuildSync Archicad Add-on

This folder contains the native-side BuildSync Assembly Wrapper foundation.

## Current Status

The default CMake build compiles the SDK-free core and tests:

```powershell
cmake -S buildsync-archicad-addon -B buildsync-archicad-addon/build -G "Visual Studio 18 2026" -A x64
cmake --build buildsync-archicad-addon/build --config Debug
ctest --test-dir buildsync-archicad-addon/build -C Debug --output-on-failure
```

The optional Archicad module target is scaffolded but not yet a complete loadable add-on. It now routes menu commands into `NativeRuntime`, and the selection adapter uses the Archicad selection API to return selected element GUIDs and element types. Property writing, existence checks, highlighting, dialog metadata, and resource packaging are still pending.

## Optional SDK Target

```powershell
cmake -S buildsync-archicad-addon -B buildsync-archicad-addon/build-sdk `
  -G "Visual Studio 18 2026" -A x64 `
  -DBUILDSYNC_BUILD_ARCHICAD_ADDON=ON `
  -DARCHICAD_SDK_ROOT="C:\Path\To\Archicad\API Development Kit"
```

Next native tasks:

1. Add Archicad resource files for the BuildSync menu strings.
2. Implement SDK-backed `ElementPropertyWriter`, `ElementExistenceChecker`, and `HighlightController`.
3. Replace the temporary default create-assembly request with an Archicad dialog or settings-backed metadata provider.
4. Package the generated `.apx` according to the target Archicad version.
