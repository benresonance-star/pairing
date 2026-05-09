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
    assert(properties.properties["GUID-001"].assemblyId == "L02-A204-JN-001");
    assert(queue.listPending().size() == 1);

    selection.selection = {{"GUID-001", "Slab"}};
    CommandResult selected = service.selectAssemblyMembers();
    assert(selected.ok);
    assert(highlighter.selected.size() == 2);

    listener.online = true;
    CommandResult synced = service.syncWithPythonListener();
    assert(synced.ok);
    assert(queue.listPending().empty());

    return 0;
}
