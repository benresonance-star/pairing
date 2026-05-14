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

    set(BUILDSYNC_ACAPINC "${ARCHICAD_SDK_ROOT}/Support/Inc/ACAPinc.h")
    set(BUILDSYNC_ACAP_STAT "${ARCHICAD_SDK_ROOT}/Support/Lib/ACAP_STAT.lib")
    set(BUILDSYNC_COMPILE_RESOURCES "${ARCHICAD_SDK_ROOT}/Support/Tools/CompileResources.py")
    if(NOT EXISTS "${BUILDSYNC_ACAPINC}")
        message(FATAL_ERROR "Missing Archicad SDK header: ${BUILDSYNC_ACAPINC}")
    endif()
    if(WIN32 AND NOT EXISTS "${BUILDSYNC_ACAP_STAT}")
        message(FATAL_ERROR "Missing Archicad SDK library: ${BUILDSYNC_ACAP_STAT}")
    endif()
    if(NOT EXISTS "${BUILDSYNC_COMPILE_RESOURCES}")
        message(FATAL_ERROR "Missing Graphisoft resource compiler: ${BUILDSYNC_COMPILE_RESOURCES}")
    endif()

    find_package(Python3 COMPONENTS Interpreter REQUIRED)

    set(BUILDSYNC_RESOURCE_OBJECTS_DIR "${CMAKE_CURRENT_BINARY_DIR}/ResourceObjects")
    file(GLOB BUILDSYNC_RESOURCE_FILES
        "${CMAKE_CURRENT_SOURCE_DIR}/RINT/*.grc"
        "${CMAKE_CURRENT_SOURCE_DIR}/RFIX/*.grc"
        "${CMAKE_CURRENT_SOURCE_DIR}/RFIX.win/*.rc2"
    )
    add_custom_command(
        OUTPUT "${BUILDSYNC_RESOURCE_OBJECTS_DIR}/BuildSyncAssemblyWrapper.res"
               "${BUILDSYNC_RESOURCE_OBJECTS_DIR}/AddOnResources.stamp"
        DEPENDS ${BUILDSYNC_RESOURCE_FILES}
        COMMENT "Compiling BuildSync Archicad resources..."
        COMMAND ${CMAKE_COMMAND} -E make_directory "${BUILDSYNC_RESOURCE_OBJECTS_DIR}"
        COMMAND "${Python3_EXECUTABLE}" "${BUILDSYNC_COMPILE_RESOURCES}" "INT" "${ARCHICAD_SDK_ROOT}" "${CMAKE_CURRENT_SOURCE_DIR}/src" "${CMAKE_CURRENT_SOURCE_DIR}" "${BUILDSYNC_RESOURCE_OBJECTS_DIR}" "${BUILDSYNC_RESOURCE_OBJECTS_DIR}/BuildSyncAssemblyWrapper.res"
        COMMAND ${CMAKE_COMMAND} -E touch "${BUILDSYNC_RESOURCE_OBJECTS_DIR}/AddOnResources.stamp"
    )
    add_custom_target(buildsync_archicad_resources
        DEPENDS "${BUILDSYNC_RESOURCE_OBJECTS_DIR}/AddOnResources.stamp"
        SOURCES ${BUILDSYNC_RESOURCE_FILES}
    )

    file(GLOB BUILDSYNC_MODULE_INCLUDE_DIRS "${ARCHICAD_SDK_ROOT}/Support/Modules/*")
    if(WIN32)
        add_library(buildsync_archicad_addon SHARED
            src/addon/ArchicadAddonMain.cpp
            src/addon/NativeRuntimeFactory.cpp
            src/addon/ui/WrapperManagerDialog.cpp
            src/archicad_adapter/ArchicadSdkAdapters.cpp
        )
    else()
        add_library(buildsync_archicad_addon MODULE
            src/addon/ArchicadAddonMain.cpp
            src/addon/NativeRuntimeFactory.cpp
            src/addon/ui/WrapperManagerDialog.cpp
            src/archicad_adapter/ArchicadSdkAdapters.cpp
        )
    endif()
    add_dependencies(buildsync_archicad_addon buildsync_archicad_resources)
    target_link_libraries(buildsync_archicad_addon PRIVATE buildsync_core)
    if(WIN32)
        foreach(msvc_runtime_target buildsync_core buildsync_core_tests buildsync_sync_tests buildsync_addon_shell_tests buildsync_native_runtime_tests buildsync_archicad_addon)
            set_property(TARGET ${msvc_runtime_target} PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreadedDLL")
        endforeach()
        target_compile_definitions(buildsync_core PUBLIC UNICODE _UNICODE _ITERATOR_DEBUG_LEVEL=0 GS_WIN ACExtension)
        target_compile_definitions(buildsync_archicad_addon PRIVATE UNICODE _UNICODE _ITERATOR_DEBUG_LEVEL=0 GS_WIN ACExtension)
        foreach(test_target buildsync_core_tests buildsync_sync_tests buildsync_addon_shell_tests buildsync_native_runtime_tests)
            target_compile_definitions(${test_target} PRIVATE UNICODE _UNICODE _ITERATOR_DEBUG_LEVEL=0 GS_WIN ACExtension)
        endforeach()
        target_compile_options(buildsync_archicad_addon PRIVATE /W3 /wd4996 /Zc:wchar_t-)
        target_link_libraries(buildsync_archicad_addon PRIVATE "${BUILDSYNC_ACAP_STAT}")
        target_link_options(buildsync_archicad_addon PRIVATE
            "${BUILDSYNC_RESOURCE_OBJECTS_DIR}/BuildSyncAssemblyWrapper.res"
            /export:GetExportedFuncAddrs,@1
            /export:SetImportedFuncAddrs,@2
        )
        foreach(module_dir ${BUILDSYNC_MODULE_INCLUDE_DIRS})
            file(GLOB module_libs "${module_dir}/Win/*.lib")
            target_link_libraries(buildsync_archicad_addon PRIVATE ${module_libs})
        endforeach()
    else()
        target_compile_definitions(buildsync_archicad_addon PRIVATE ACExtension)
    endif()
    target_include_directories(buildsync_archicad_addon PRIVATE
        src
        "${ARCHICAD_SDK_ROOT}/Support/Inc"
        ${BUILDSYNC_MODULE_INCLUDE_DIRS}
    )
    set_target_properties(buildsync_archicad_addon PROPERTIES
        PREFIX ""
        OUTPUT_NAME "BuildSyncAssemblyWrapper"
        SUFFIX ".apx"
    )
endif()
