# BuildSync Archicad Add-on

This folder contains the native-side BuildSync Assembly Wrapper foundation.

## Current Status

The default CMake build compiles the SDK-free core and tests:

```powershell
cmake -S buildsync-archicad-addon -B buildsync-archicad-addon/build -G "Visual Studio 18 2026" -A x64
cmake --build buildsync-archicad-addon/build --config Debug
ctest --test-dir buildsync-archicad-addon/build -C Debug --output-on-failure
```

The optional Archicad module target is scaffolded but not yet a complete loadable add-on. It needs the Graphisoft SDK resource files and concrete adapter implementations before it can be loaded in Archicad.

## Optional SDK Target

```powershell
cmake -S buildsync-archicad-addon -B buildsync-archicad-addon/build-sdk `
  -G "Visual Studio 18 2026" -A x64 `
  -DBUILDSYNC_BUILD_ARCHICAD_ADDON=ON `
  -DARCHICAD_SDK_ROOT="C:\Path\To\Archicad\API Development Kit"
```

Next native tasks:

1. Add Archicad resource files for the BuildSync menu strings.
2. Replace the SDK shell report messages with calls into `AssemblyCommandService`.
3. Implement SDK-backed `SelectionReader`, `ElementPropertyWriter`, `ElementExistenceChecker`, `HighlightController`, and `RegistryStorage`.
4. Package the generated `.apx` according to the target Archicad version.
