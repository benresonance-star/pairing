#include "addon/MenuCommands.hpp"

#include <cassert>
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
    bool ensureResult{true};
    bool writeResult{true};
    std::string diagnostic{"ok"};
    bool ensureBuildSyncProperties() override { return ensureResult; }
    bool writeAssemblyProperties(const std::string& elementGuid, const BuildSyncProperties& props) override
    {
        if (!writeResult) {
            diagnostic = "Could not write property BS_AssemblyID to selected element. error=-2";
            return false;
        }
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
        return "BS_AssemblyID=\"" + found->second.assemblyId + "\"; BS_AssemblyName=\"" + found->second.assemblyName + "\"";
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
    std::unordered_map<std::string, ElementMetadata> metadataByGuid;
    ElementMetadata readElementMetadata(const std::string& elementGuid) const override
    {
        const auto found = metadataByGuid.find(elementGuid);
        if (found != metadataByGuid.end()) {
            return found->second;
        }
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

class FakeStorage : public RegistryStorage {
public:
    bool load(AssemblyRegistry&) override { return true; }
    bool save(const AssemblyRegistry&) override
    {
        saved = true;
        return true;
    }
    bool saved{false};
};

class FakeListenerClient : public PythonListenerClient {
public:
    bool online{false};
    bool healthCheck() override { return online; }
    bool postEvent(const SyncEvent&, std::string&) override { return online; }
};

int main()
{
    FakeSelectionReader selection;
    selection.selection = {{"GUID-001", "Slab"}, {"GUID-002", "Wall"}};
    FakePropertyWriter properties;
    FakeExistenceChecker existence;
    existence.live = {"GUID-001", "GUID-002"};
    FakeMetadataReader metadata;
    metadata.metadataByGuid = {
        {"GUID-001", {"GUID-001", "Slab", "SL-001", "Structural", "active"}},
        {"GUID-002", {"GUID-002", "Wall", "", "", "active"}},
    };
    FakeHighlightController highlighter;
    FakeStorage storage;
    FakeListenerClient listener;
    AssemblyRegistry registry;
    NamingRules naming;
    SyncQueue queue;
    int uuid = 0;

    AssemblyCommandService service(
        selection,
        properties,
        existence,
        metadata,
        highlighter,
        storage,
        listener,
        registry,
        naming,
        queue,
        "local-project",
        [&]() { return "uuid-" + std::to_string(++uuid); });

    CommandResult created = service.createAssemblyFromSelection({"Kitchen Island", "Joinery", "A204", "L02", "Joinery", "TASK-240"});
    assert(created.ok);
    assert(properties.properties.size() == 2);
    assert(properties.properties["GUID-001"].assemblyId == "L02-A204-J01");
    assert(created.message == "Assembly L02-A204-J01 created locally.");
    assert(queue.listPending().size() == 1);

    selection.selection = {{"GUID-001", "Slab"}};
    CommandResult selected = service.selectAssemblyMembers();
    assert(selected.ok);
    assert(highlighter.selected.size() == 2);

    const std::string wrapperUuid = service.listWrappers().front().assemblyUuid;
    const auto memberMetadata = service.listWrapperMemberMetadata(wrapperUuid);
    assert(memberMetadata.size() == 2);
    assert(memberMetadata.front().elementGuid == "GUID-001");
    assert(memberMetadata.front().elementId == "SL-001");
    assert(memberMetadata.front().layerName == "Structural");
    assert(memberMetadata.back().elementGuid == "GUID-002");
    assert(memberMetadata.back().elementId.empty());
    assert(memberMetadata.back().layerName.empty());

    highlighter.selected.clear();
    CommandResult selectedSingle = service.selectWrapperMember(wrapperUuid, "GUID-002");
    assert(selectedSingle.ok);
    assert(highlighter.selected.size() == 1);
    assert(highlighter.selected.front() == "GUID-002");

    CommandResult rejectedSingle = service.selectWrapperMember(wrapperUuid, "GUID-404");
    assert(!rejectedSingle.ok);
    assert(highlighter.selected.size() == 1);
    assert(highlighter.selected.front() == "GUID-002");

    CommandResult debugSelection = service.debugSelection();
    assert(debugSelection.ok);
    assert(debugSelection.message.find("selected elements=1") != std::string::npos);
    assert(debugSelection.message.find("GUID-001") != std::string::npos);

    CommandResult debugRegistry = service.debugRegistry();
    assert(debugRegistry.ok);
    assert(debugRegistry.message.find("wrappers=1") != std::string::npos);
    assert(debugRegistry.message.find("L02-A204-J01") != std::string::npos);

    CommandResult debugProperties = service.debugBuildSyncProperties();
    assert(debugProperties.ok);
    assert(debugProperties.message.find("BS_AssemblyID=\"L02-A204-J01\"") != std::string::npos);

    const auto wrappers = service.listWrappers();
    assert(wrappers.size() == 1);
    AssemblyUpdateRequest updateRequest;
    updateRequest.assemblyId = wrappers.front().assemblyId;
    updateRequest.name = "Renamed Kitchen Island";
    updateRequest.type = wrappers.front().type;
    updateRequest.zone = wrappers.front().zone;
    updateRequest.level = wrappers.front().level;
    updateRequest.trade = wrappers.front().trade;
    updateRequest.taskId = wrappers.front().taskId;
    updateRequest.status = "active";
    CommandResult renamed = service.updateWrapper(wrappers.front().assemblyUuid, updateRequest);
    assert(renamed.ok);
    assert(properties.properties["GUID-001"].assemblyName == "Renamed Kitchen Island");

    CommandResult customSet = service.setWrapperCustomProperty(wrappers.front().assemblyUuid, "Finish", "Oak");
    assert(customSet.ok);
    assert(properties.properties["GUID-001"].customProperties.find("\"Finish\":\"Oak\"") != std::string::npos);
    CommandResult customRejected = service.setWrapperCustomProperty(wrappers.front().assemblyUuid, "BS_Invalid", "Nope");
    assert(!customRejected.ok);
    CommandResult customRemoved = service.removeWrapperCustomProperty(wrappers.front().assemblyUuid, "Finish");
    assert(customRemoved.ok);

    selection.selection = {{"GUID-001", "Slab"}, {"GUID-002", "Wall"}};
    CommandResult removedAll = service.removeSelectionFromAssembly();
    assert(removedAll.ok);
    assert(removedAll.message.find("no remaining members") != std::string::npos);
    assert(registry.listAssemblies().empty());
    assert(properties.properties.empty());

    FakePropertyWriter failingProperties;
    failingProperties.ensureResult = false;
    failingProperties.diagnostic = "Could not find or create property definition BS_AssemblyID. error=-1";
    AssemblyRegistry failingRegistry;
    SyncQueue failingQueue;
    AssemblyCommandService failingService(
        selection,
        failingProperties,
        existence,
        metadata,
        highlighter,
        storage,
        listener,
        failingRegistry,
        naming,
        failingQueue,
        "local-project",
        [&]() { return "failing-uuid-" + std::to_string(++uuid); });
    CommandResult failed = failingService.createAssemblyFromSelection({"Kitchen Island", "Joinery", "A204", "L02", "Joinery", "TASK-240"});
    assert(!failed.ok);
    assert(failed.message.find("BuildSync property setup failed") != std::string::npos);
    assert(failed.message.find("BS_AssemblyID") != std::string::npos);

    FakePropertyWriter failingWriteProperties;
    failingWriteProperties.writeResult = false;
    AssemblyRegistry failingWriteRegistry;
    SyncQueue failingWriteQueue;
    AssemblyCommandService failingWriteService(
        selection,
        failingWriteProperties,
        existence,
        metadata,
        highlighter,
        storage,
        listener,
        failingWriteRegistry,
        naming,
        failingWriteQueue,
        "local-project",
        [&]() { return "failing-write-uuid-" + std::to_string(++uuid); });
    CommandResult failedWrite = failingWriteService.createAssemblyFromSelection({"Kitchen Island", "Joinery", "A204", "L02", "Joinery", "TASK-240"});
    assert(!failedWrite.ok);
    assert(failingWriteRegistry.listAssemblies().empty());
    assert(failedWrite.message.find("could not be written") != std::string::npos);

    listener.online = true;
    CommandResult synced = service.syncWithPythonListener();
    assert(synced.ok);
    assert(queue.listPending().empty());

    return 0;
}
