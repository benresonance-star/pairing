#include "addon/NativeRuntimeFactory.hpp"

#include "archicad_adapter/ArchicadSdkAdapters.hpp"
#include "archicad_adapter/FileRegistryStorage.hpp"
#include "core/AssemblyRegistry.hpp"
#include "core/NamingRules.hpp"
#include "sync/SyncQueue.hpp"

#include <filesystem>
#include <string>

namespace buildsync {
namespace {

std::string nextUuid()
{
    static int counter = 0;
    ++counter;
    return "buildsync-native-" + std::to_string(counter);
}

std::filesystem::path defaultRegistryPath()
{
    return std::filesystem::temp_directory_path() / "buildsync-assembly-registry.txt";
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
    static ArchicadSelectionReader selectionReader;
    static ArchicadElementPropertyWriter propertyWriter;
    static ArchicadElementExistenceChecker existenceChecker;
    static ArchicadElementMetadataReader metadataReader;
    static ArchicadHighlightController highlightController;
    static FileRegistryStorage registryStorage(defaultRegistryPath());
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
        "local-archicad-project",
        nextUuid);
    static NativeRuntime runtime(commandService, defaultCreateAssemblyRequest);
    return runtime;
}

} // namespace buildsync
