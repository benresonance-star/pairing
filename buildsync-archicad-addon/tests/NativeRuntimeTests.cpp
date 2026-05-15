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
    std::string diagnostic{"ok"};
    bool ensureBuildSyncProperties() override { return true; }
    bool writeAssemblyProperties(const std::string& elementGuid, const BuildSyncProperties& props) override
    {
        properties[elementGuid] = props;
        diagnostic = "wrote";
        return true;
    }
    bool clearAssemblyProperties(const std::string& elementGuid) override
    {
        properties.erase(elementGuid);
        return true;
    }
    std::string describeBuildSyncProperties(const std::string& elementGuid) const override
    {
        const auto found = properties.find(elementGuid);
        if (found == properties.end()) {
            return "BS_* properties=missing";
        }
        return "BS_AssemblyID=\"" + found->second.assemblyId + "\"";
    }
    std::string lastDiagnostic() const override { return diagnostic; }
};

class FakeExistenceChecker : public ElementExistenceChecker {
public:
    std::unordered_set<std::string> live;
    bool exists(const std::string& elementGuid) const override { return live.count(elementGuid) > 0; }
};

class FakeMetadataReader : public ElementMetadataReader {
public:
    ElementMetadata readElementMetadata(const std::string& elementGuid) const override
    {
        return {elementGuid, "", "", "", "missing"};
    }
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
    assembly.customProperties = {{"FireRating", "60|min"}, {"Finish", "Oak"}};
    assert(registry.createAssembly(assembly));

    FileRegistryStorage storage(registryPath);
    assert(storage.save(registry));

    AssemblyRegistry loaded;
    assert(storage.load(loaded));
    const auto loadedAssembly = loaded.getAssemblyByUuid("uuid-with-special");
    assert(loadedAssembly);
    assert(loadedAssembly->name == "Kitchen | Island");
    assert(loadedAssembly->members.front().role == "Bench|top");
    assert(loadedAssembly->customProperties.size() == 2);
    assert(loadedAssembly->customProperties.front().value == "60|min");

    AssemblyRegistry emptyRegistry;
    Assembly emptyAssembly = assembly;
    emptyAssembly.assemblyUuid = "uuid-empty";
    emptyAssembly.members = {};
    assert(emptyRegistry.createAssembly(emptyAssembly));
    assert(storage.save(emptyRegistry));
    AssemblyRegistry loadedEmpty;
    assert(storage.load(loadedEmpty));
    assert(loadedEmpty.listAssemblies().empty());

    AssemblyRegistry treeRegistry;
    Assembly emptyParent = emptyAssembly;
    emptyParent.assemblyUuid = "uuid-parent-empty";
    emptyParent.assemblyId = "KIT-002";
    Assembly childAssembly = assembly;
    childAssembly.assemblyUuid = "uuid-child-with-member";
    childAssembly.assemblyId = "JN-014";
    childAssembly.members = {{"uuid-child-with-member", "GUID-010", "Object", "Plant", "active", ""}};
    assert(treeRegistry.createAssembly(emptyParent));
    assert(treeRegistry.createAssembly(childAssembly));
    assert(treeRegistry.addChildWrapper("uuid-parent-empty", "uuid-child-with-member"));
    assert(storage.save(treeRegistry));
    AssemblyRegistry loadedTree;
    assert(storage.load(loadedTree));
    assert(loadedTree.getAssemblyByUuid("uuid-parent-empty"));
    assert(loadedTree.listChildWrappers("uuid-parent-empty").size() == 1);
    assert(loadedTree.resolveEffectiveMembers("uuid-parent-empty").size() == 1);

    FakeSelectionReader selection;
    selection.selection = {{"GUID-002", "Wall"}};
    FakePropertyWriter properties;
    FakeExistenceChecker existence;
    existence.live = {"GUID-002"};
    FakeMetadataReader metadata;
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
        metadata,
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
    assert(properties.properties["GUID-002"].assemblyId == "L02-A204-J01");
    assert(commandResultReport(created).find("BuildSync:") == 0);
    assert(runtime.handleMenuCommand(DebugSelectionCommandId).message.find("GUID-002") != std::string::npos);
    assert(runtime.handleMenuCommand(DebugRegistryCommandId).message.find("L02-A204-J01") != std::string::npos);
    assert(runtime.handleMenuCommand(DebugBuildSyncPropertiesCommandId).message.find("BS_AssemblyID=\"L02-A204-J01\"") != std::string::npos);
    assert(!runtime.handleMenuCommand(999).ok);

    std::filesystem::remove(registryPath);
    return 0;
}
