#include "addon/NativeRuntime.hpp"
#include "addon/ResourceIds.hpp"
#include "archicad_adapter/FileRegistryStorage.hpp"

#include <cassert>
#include <filesystem>
#include <unordered_map>
#include <unordered_set>

using namespace buildsync;

class FakeSelectionReader : public SelectionReader {
public:
    std::vector<SelectedElement> selection;
    std::vector<SelectedElement> readSelection() const override { return selection; }
};

class FakePropertyWriter : public ElementPropertyWriter {
public:
    std::unordered_map<std::string, BuildSyncProperties> properties;
    bool ensureBuildSyncProperties() override { return true; }
    bool writeAssemblyProperties(const std::string& elementGuid, const BuildSyncProperties& props) override
    {
        properties[elementGuid] = props;
        return true;
    }
    bool clearAssemblyProperties(const std::string& elementGuid) override
    {
        properties.erase(elementGuid);
        return true;
    }
};

class FakeExistenceChecker : public ElementExistenceChecker {
public:
    std::unordered_set<std::string> live;
    bool exists(const std::string& elementGuid) const override { return live.count(elementGuid) > 0; }
};

class FakeHighlightController : public HighlightController {
public:
    std::vector<std::string> selected;
    bool selectElements(const std::vector<std::string>& elementGuids) override
    {
        selected = elementGuids;
        return true;
    }
};

class FakeListenerClient : public PythonListenerClient {
public:
    bool healthCheck() override { return true; }
    bool postEvent(const SyncEvent&, std::string&) override { return true; }
};

int main()
{
    const auto registryPath = std::filesystem::temp_directory_path() / "buildsync-native-runtime-test.registry";
    std::filesystem::remove(registryPath);

    AssemblyRegistry registry;
    Assembly assembly;
    assembly.assemblyUuid = "uuid-with-special";
    assembly.assemblyId = "JN-014";
    assembly.name = "Kitchen | Island";
    assembly.type = "Joinery";
    assembly.zone = "Apartment 204";
    assembly.level = "L02";
    assembly.trade = "Joinery";
    assembly.taskId = "TASK-240";
    assembly.version = 3;
    assembly.members = {{"uuid-with-special", "GUID-001", "Slab", "Bench|top", "active", "now"}};
    assert(registry.createAssembly(assembly));

    FileRegistryStorage storage(registryPath);
    assert(storage.save(registry));

    AssemblyRegistry loaded;
    assert(storage.load(loaded));
    const auto loadedAssembly = loaded.getAssemblyByUuid("uuid-with-special");
    assert(loadedAssembly);
    assert(loadedAssembly->name == "Kitchen | Island");
    assert(loadedAssembly->members.front().role == "Bench|top");

    FakeSelectionReader selection;
    selection.selection = {{"GUID-002", "Wall"}};
    FakePropertyWriter properties;
    FakeExistenceChecker existence;
    existence.live = {"GUID-002"};
    FakeHighlightController highlighter;
    FakeListenerClient listener;
    AssemblyRegistry runtimeRegistry;
    NamingRules naming;
    SyncQueue queue;
    int uuid = 0;

    AssemblyCommandService commands(
        selection,
        properties,
        existence,
        highlighter,
        storage,
        listener,
        runtimeRegistry,
        naming,
        queue,
        "local-project",
        [&]() { return "runtime-uuid-" + std::to_string(++uuid); });
    NativeRuntime runtime(commands, [] {
        return CreateAssemblyRequest{"Runtime Assembly", "Joinery", "A204", "L02", "Joinery", "TASK-240"};
    });

    const CommandResult created = runtime.handleMenuCommand(CreateAssemblyCommandId);
    assert(created.ok);
    assert(properties.properties["GUID-002"].assemblyId == "L02-A204-JN-001");
    assert(commandResultReport(created).find("BuildSync:") == 0);
    assert(!runtime.handleMenuCommand(999).ok);

    std::filesystem::remove(registryPath);
    return 0;
}
