#include "addon/NativeRuntimeFactory.hpp"

#include "archicad_adapter/ArchicadSdkAdapters.hpp"
#include "archicad_adapter/FileRegistryStorage.hpp"
#include "core/AssemblyRegistry.hpp"
#include "core/NamingRules.hpp"
#include "sync/SyncQueue.hpp"

#include <filesystem>
#include <cstdlib>
#include <chrono>
#include <string>

namespace buildsync {
namespace {

std::string nextUuid()
{
    static unsigned long long counter = 0;
    ++counter;
    const auto now = std::chrono::high_resolution_clock::now().time_since_epoch().count();
    return "buildsync-native-" + std::to_string(now) + "-" + std::to_string(counter);
}

std::string projectScopedId()
{
    if (const char* value = std::getenv("BUILDSYNC_ARCHICAD_PROJECT_ID")) {
        if (*value != '\0') {
            return value;
        }
    }
    return "local-archicad-project";
}

std::string safePathPart(std::string value)
{
    for (char& ch : value) {
        const bool ok = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_';
        if (!ok) {
            ch = '_';
        }
    }
    return value.empty() ? "local-archicad-project" : value;
}

std::filesystem::path defaultRegistryPath(const std::string& projectId)
{
    return std::filesystem::temp_directory_path() / "buildsync-registries" / (safePathPart(projectId) + ".registry");
}

CreateAssemblyRequest defaultCreateAssemblyRequest()
{
    return {
        "Joinery Wrapper",
        "Joinery",
        "",
        "",
        "Joinery",
        "",
    };
}

} // namespace

NativeRuntime& buildSyncRuntime()
{
    static std::string projectId = projectScopedId();
    static ArchicadSelectionReader selectionReader;
    static ArchicadElementPropertyWriter propertyWriter;
    static ArchicadElementExistenceChecker existenceChecker;
    static ArchicadElementMetadataReader metadataReader;
    static ArchicadHighlightController highlightController;
    static ArchicadInstanceElementOperator instanceOperator;
    static FileRegistryStorage registryStorage(defaultRegistryPath(projectId));
    static LocalPythonListenerClient listenerClient;
    static AssemblyRegistry registry;
    static NamingRules namingRules;
    static SyncQueue syncQueue;
    static bool loaded = registryStorage.load(registry);
    (void)loaded;
    static AssemblyCommandService commandService(
        selectionReader,
        propertyWriter,
        existenceChecker,
        metadataReader,
        highlightController,
        registryStorage,
        listenerClient,
        registry,
        namingRules,
        syncQueue,
        projectId,
        nextUuid,
        &instanceOperator);
    static NativeRuntime runtime(commandService, defaultCreateAssemblyRequest);
    return runtime;
}

} // namespace buildsync
