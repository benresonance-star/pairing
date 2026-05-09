cmake_minimum_required(VERSION 3.16)

project(BuildSyncArchicadAddon LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(BUILDSYNC_BUILD_ARCHICAD_ADDON "Build the Archicad SDK add-on module scaffold" OFF)
set(ARCHICAD_SDK_ROOT "" CACHE PATH "Path to the local Archicad C++ SDK")

add_library(buildsync_core
    src/addon/MenuCommands.cpp
    src/addon/NativeRuntime.cpp
    src/archicad_adapter/FileRegistryStorage.cpp
    src/core/AssemblyRegistry.cpp
    src/core/NamingRules.cpp
    src/core/AssemblyGraph.cpp
    src/core/AssemblyValidator.cpp
    src/sync/JsonSerializer.cpp
    src/sync/PythonListenerClient.cpp
    src/sync/SyncQueue.cpp
)

target_include_directories(buildsync_core PUBLIC src)

enable_testing()

add_executable(buildsync_core_tests tests/CoreTests.cpp)
target_link_libraries(buildsync_core_tests PRIVATE buildsync_core)
add_test(NAME buildsync_core_tests COMMAND buildsync_core_tests)

add_executable(buildsync_sync_tests tests/SyncTests.cpp)
target_link_libraries(buildsync_sync_tests PRIVATE buildsync_core)
add_test(NAME buildsync_sync_tests COMMAND buildsync_sync_tests)

add_executable(buildsync_addon_shell_tests tests/AddonShellTests.cpp)
target_link_libraries(buildsync_addon_shell_tests PRIVATE buildsync_core)
add_test(NAME buildsync_addon_shell_tests COMMAND buildsync_addon_shell_tests)

add_executable(buildsync_native_runtime_tests tests/NativeRuntimeTests.cpp)
target_link_libraries(buildsync_native_runtime_tests PRIVATE buildsync_core)
add_test(NAME buildsync_native_runtime_tests COMMAND buildsync_native_runtime_tests)

if(BUILDSYNC_BUILD_ARCHICAD_ADDON)
    if(NOT ARCHICAD_SDK_ROOT)
        message(FATAL_ERROR "Set ARCHICAD_SDK_ROOT when BUILDSYNC_BUILD_ARCHICAD_ADDON=ON")
    endif()

    add_library(buildsync_archicad_addon MODULE
        src/addon/ArchicadAddonMain.cpp
        src/addon/NativeRuntimeFactory.cpp
        src/archicad_adapter/ArchicadSdkAdapters.cpp
    )
    target_link_libraries(buildsync_archicad_addon PRIVATE buildsync_core)
    target_include_directories(buildsync_archicad_addon PRIVATE
        "${ARCHICAD_SDK_ROOT}/Support/Inc"
        "${ARCHICAD_SDK_ROOT}/Support/Modules"
    )
    set_target_properties(buildsync_archicad_addon PROPERTIES
        PREFIX ""
        OUTPUT_NAME "BuildSyncAssemblyWrapper"
        SUFFIX ".apx"
    )
endif()
