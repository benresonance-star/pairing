#include "addon/MenuCommands.hpp"

#include "sync/JsonSerializer.hpp"

#include <algorithm>
#include <unordered_map>
#include <unordered_set>
#include <utility>

namespace buildsync {

AssemblyCommandService::AssemblyCommandService(
    SelectionReader& selectionReader,
    ElementPropertyWriter& propertyWriter,
    ElementExistenceChecker& existenceChecker,
    HighlightController& highlightController,
    RegistryStorage& registryStorage,
    PythonListenerClient& listenerClient,
    AssemblyRegistry& registry,
    NamingRules& namingRules,
    SyncQueue& syncQueue,
    std::string projectId,
    UuidFactory uuidFactory)
    : selectionReader_(selectionReader)
    , propertyWriter_(propertyWriter)
    , existenceChecker_(existenceChecker)
    , highlightController_(highlightController)
    , registryStorage_(registryStorage)
    , listenerClient_(listenerClient)
    , registry_(registry)
    , namingRules_(namingRules)
    , syncQueue_(syncQueue)
    , projectId_(std::move(projectId))
    , uuidFactory_(std::move(uuidFactory))
{
}

CommandResult AssemblyCommandService::createAssemblyFromSelection(const CreateAssemblyRequest& request)
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select one or more Archicad elements first.", {}};
    }
    if (!propertyWriter_.ensureBuildSyncProperties()) {
        return {false, "BuildSync properties are missing. Create them now?", {}};
    }

    Assembly assembly;
    assembly.assemblyUuid = uuidFactory_();
    assembly.assemblyId = namingRules_.generateAssemblyId(request.type, request.level, request.zone);
    assembly.name = request.name;
    assembly.type = request.type;
    assembly.zone = request.zone;
    assembly.level = request.level;
    assembly.trade = request.trade;
    assembly.taskId = request.taskId;
    for (const auto& selected : selection) {
        assembly.members.push_back(memberFromSelection(selected, assembly.assemblyUuid));
    }

    if (!registry_.createAssembly(assembly)) {
        return {false, "Assembly could not be created because the selection overlaps an existing assembly.", {}};
    }
    stampAssemblyProperties(assembly);
    registryStorage_.save(registry_);
    enqueueEvent("assembly_created", JsonSerializer::assemblyCreated(projectId_, assembly));
    return {true, "Assembly created locally.", {}};
}

CommandResult AssemblyCommandService::selectAssemblyMembers()
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select one BuildSync assembly member first.", {}};
    }
    const auto assembly = registry_.getAssemblyByElementGuid(selection.front().elementGuid);
    if (!assembly) {
        return {false, "Selected element is not part of a BuildSync assembly.", {}};
    }

    std::vector<std::string> liveGuids;
    for (const auto& member : assembly->members) {
        if (existenceChecker_.exists(member.elementGuid)) {
            liveGuids.push_back(member.elementGuid);
        }
    }
    highlightController_.selectElements(liveGuids);
    return {true, "Assembly members selected.", {}};
}

CommandResult AssemblyCommandService::addSelectionToAssembly()
{
    const auto selection = selectionReader_.readSelection();
    std::string assemblyUuid;
    std::vector<AssemblyMember> toAdd;
    for (const auto& selected : selection) {
        auto assembly = registry_.getAssemblyByElementGuid(selected.elementGuid);
        if (assembly) {
            assemblyUuid = assembly->assemblyUuid;
        } else {
            toAdd.push_back(memberFromSelection(selected, ""));
        }
    }
    if (assemblyUuid.empty()) {
        return {false, "Selection must include one existing assembly member.", {}};
    }
    if (!registry_.addMembers(assemblyUuid, toAdd) || !registry_.incrementVersion(assemblyUuid)) {
        return {false, "Selection contains multiple assemblies. Choose one target assembly.", {}};
    }
    const auto assembly = registry_.getAssemblyByUuid(assemblyUuid);
    if (assembly) {
        stampAssemblyProperties(*assembly);
        registryStorage_.save(registry_);
        enqueueEvent("assembly_updated", JsonSerializer::assemblyUpdated(projectId_, *assembly, toAdd, {}));
    }
    return {true, "Selection added to assembly.", {}};
}

CommandResult AssemblyCommandService::removeSelectionFromAssembly()
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select one or more assembly members first.", {}};
    }
    const auto assembly = registry_.getAssemblyByElementGuid(selection.front().elementGuid);
    if (!assembly) {
        return {false, "Selected element is not part of a BuildSync assembly.", {}};
    }
    std::vector<std::string> removeGuids;
    std::vector<AssemblyMember> removed;
    for (const auto& selected : selection) {
        removeGuids.push_back(selected.elementGuid);
        removed.push_back(memberFromSelection(selected, assembly->assemblyUuid));
        propertyWriter_.clearAssemblyProperties(selected.elementGuid);
    }
    registry_.removeMembers(assembly->assemblyUuid, removeGuids);
    registry_.incrementVersion(assembly->assemblyUuid);
    const auto updated = registry_.getAssemblyByUuid(assembly->assemblyUuid);
    registryStorage_.save(registry_);
    if (updated) {
        enqueueEvent("assembly_updated", JsonSerializer::assemblyUpdated(projectId_, *updated, {}, removed));
    }
    return {true, "Selection removed from assembly.", {}};
}

CommandResult AssemblyCommandService::validateSelectedAssembly()
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select one BuildSync assembly member first.", {}};
    }
    const auto assembly = registry_.getAssemblyByElementGuid(selection.front().elementGuid);
    if (!assembly) {
        return {false, "Selected element is not part of a BuildSync assembly.", {}};
    }
    std::unordered_set<std::string> live;
    std::unordered_map<std::string, ElementAssemblyProperties> properties;
    for (const auto& member : assembly->members) {
        if (existenceChecker_.exists(member.elementGuid)) {
            live.insert(member.elementGuid);
            properties[member.elementGuid] = {
                assembly->assemblyUuid,
                assembly->assemblyId,
                assembly->name,
                assembly->type,
                member.role,
                std::to_string(assembly->version),
                assembly->taskId,
                assembly->trade,
                assembly->status,
            };
        }
    }
    ValidationResult result = AssemblyValidator::validateAssembly(*assembly, live, properties);
    enqueueEvent("assembly_validated", JsonSerializer::assemblyValidated(projectId_, *assembly, result));
    return {true, "Assembly validated.", result};
}

CommandResult AssemblyCommandService::syncWithPythonListener()
{
    SyncQueueFlusher flusher(listenerClient_);
    if (!flusher.flush(syncQueue_)) {
        return {false, "Python listener is offline. Event queued for later sync.", {}};
    }
    return {true, "Pending BuildSync events synced.", {}};
}

AssemblyMember AssemblyCommandService::memberFromSelection(const SelectedElement& selected, const std::string& assemblyUuid) const
{
    return {assemblyUuid, selected.elementGuid, selected.elementType, "", "active", ""};
}

BuildSyncProperties AssemblyCommandService::propertiesFor(const Assembly& assembly, const AssemblyMember& member) const
{
    return {
        assembly.assemblyId,
        assembly.assemblyUuid,
        assembly.name,
        assembly.type,
        member.role,
        std::to_string(assembly.version),
        assembly.taskId,
        assembly.trade,
        assembly.status,
    };
}

bool AssemblyCommandService::stampAssemblyProperties(const Assembly& assembly)
{
    bool ok = true;
    for (const auto& member : assembly.members) {
        ok = propertyWriter_.writeAssemblyProperties(member.elementGuid, propertiesFor(assembly, member)) && ok;
    }
    return ok;
}

void AssemblyCommandService::enqueueEvent(const std::string& eventType, const std::string& payloadJson)
{
    syncQueue_.enqueue({uuidFactory_(), eventType, "", payloadJson, "pending", 0, ""});
}

} // namespace buildsync
