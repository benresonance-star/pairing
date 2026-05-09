cmake_minimum_required(VERSION 3.16)

project(BuildSyncArchicadAddon LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(buildsync_core
    src/addon/MenuCommands.cpp
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
