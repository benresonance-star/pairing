#include "addon/MenuCommands.hpp"

#include "sync/JsonSerializer.hpp"

#include <algorithm>
#include <sstream>
#include <unordered_map>
#include <unordered_set>
#include <utility>

namespace buildsync {
namespace {

std::string escapeJsonString(const std::string& value)
{
    std::ostringstream out;
    for (char ch : value) {
        if (ch == '\\' || ch == '"') {
            out << '\\';
        }
        if (ch == '\n') {
            out << "\\n";
        } else if (ch != '\r') {
            out << ch;
        }
    }
    return out.str();
}

std::string customPropertiesJson(const std::vector<AssemblyProperty>& properties)
{
    std::ostringstream out;
    out << "{";
    bool first = true;
    for (const auto& property : properties) {
        if (property.key.empty()) {
            continue;
        }
        if (!first) {
            out << ",";
        }
        first = false;
        out << "\"" << escapeJsonString(property.key) << "\":\"" << escapeJsonString(property.value) << "\"";
    }
    out << "}";
    return out.str();
}

bool isReservedPropertyKey(const std::string& key)
{
    return key.rfind("BS_", 0) == 0 || key.rfind("bs_", 0) == 0;
}

} // namespace

AssemblyCommandService::AssemblyCommandService(
    SelectionReader& selectionReader,
    ElementPropertyWriter& propertyWriter,
    ElementExistenceChecker& existenceChecker,
    ElementMetadataReader& metadataReader,
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
    , metadataReader_(metadataReader)
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

std::vector<Assembly> AssemblyCommandService::listWrappers() const
{
    return registry_.listAssemblies();
}

std::optional<Assembly> AssemblyCommandService::getWrapper(const std::string& assemblyUuid) const
{
    return registry_.getAssemblyByUuid(assemblyUuid);
}

std::vector<ElementMetadata> AssemblyCommandService::listWrapperMemberMetadata(const std::string& assemblyUuid) const
{
    const auto assembly = registry_.getAssemblyByUuid(assemblyUuid);
    if (!assembly) {
        return {};
    }

    std::vector<ElementMetadata> rows;
    rows.reserve(assembly->members.size());
    for (const auto& member : assembly->members) {
        ElementMetadata metadata = metadataReader_.readElementMetadata(member.elementGuid);
        metadata.elementGuid = member.elementGuid;
        if (metadata.elementType.empty()) {
            metadata.elementType = member.elementType;
        }
        if (metadata.status.empty()) {
            metadata.status = member.status;
        }
        rows.push_back(metadata);
    }
    return rows;
}

std::vector<Assembly> AssemblyCommandService::listChildWrappers(const std::string& assemblyUuid) const
{
    return registry_.listChildWrappers(assemblyUuid);
}

std::vector<AssemblyMember> AssemblyCommandService::resolveEffectiveMembers(const std::string& assemblyUuid) const
{
    return registry_.resolveEffectiveMembers(assemblyUuid);
}

CommandResult AssemblyCommandService::updateWrapper(const std::string& assemblyUuid, const AssemblyUpdateRequest& request)
{
    auto assembly = registry_.getAssemblyByUuid(assemblyUuid);
    if (!assembly) {
        return {false, "Wrapper was not found.", {}};
    }
    if (request.assemblyId.empty() || request.name.empty()) {
        return {false, "Wrapper ID and name are required.", {}};
    }

    assembly->assemblyId = request.assemblyId;
    assembly->name = request.name;
    assembly->type = request.type;
    assembly->zone = request.zone;
    assembly->level = request.level;
    assembly->trade = request.trade;
    assembly->taskId = request.taskId;
    assembly->status = request.status.empty() ? "active" : request.status;
    ++assembly->version;

    if (!registry_.updateAssembly(*assembly)) {
        return {false, "Wrapper could not be updated.", {}};
    }
    if (!stampAssemblyProperties(*assembly)) {
        return {false, "Wrapper was updated but BuildSync properties could not be restamped: " + propertyWriter_.lastDiagnostic(), {}};
    }
    registryStorage_.save(registry_);
    enqueueEvent("assembly_updated", JsonSerializer::assemblyUpdated(projectId_, *assembly, {}, {}));
    return {true, "Wrapper " + assembly->assemblyId + " updated.", {}};
}

CommandResult AssemblyCommandService::deleteWrapper(const std::string& assemblyUuid)
{
    auto assembly = registry_.getAssemblyByUuid(assemblyUuid);
    if (!assembly) {
        return {false, "Wrapper was not found.", {}};
    }
    for (const auto& member : assembly->members) {
        propertyWriter_.clearAssemblyProperties(member.elementGuid);
    }
    registry_.deleteAssembly(assemblyUuid);
    registryStorage_.save(registry_);
    enqueueEvent("assembly_updated", JsonSerializer::assemblyUpdated(projectId_, *assembly, {}, assembly->members));
    return {true, "Wrapper " + assembly->assemblyId + " deleted.", {}};
}

CommandResult AssemblyCommandService::selectWrapperMembers(const std::string& assemblyUuid)
{
    const auto assembly = registry_.getAssemblyByUuid(assemblyUuid);
    if (!assembly) {
        return {false, "Wrapper was not found.", {}};
    }

    std::vector<std::string> liveGuids;
    for (const auto& member : assembly->members) {
        if (existenceChecker_.exists(member.elementGuid)) {
            liveGuids.push_back(member.elementGuid);
        }
    }
    if (liveGuids.empty()) {
        return {false, "Wrapper has no live Archicad members to select.", {}};
    }
    highlightController_.selectElements(liveGuids);
    return {true, "Wrapper members selected.", {}};
}

CommandResult AssemblyCommandService::selectWrapperBranchMembers(const std::string& assemblyUuid)
{
    if (!registry_.containsAssembly(assemblyUuid)) {
        return {false, "Wrapper was not found.", {}};
    }

    std::vector<std::string> liveGuids;
    for (const auto& member : registry_.resolveEffectiveMembers(assemblyUuid)) {
        if (existenceChecker_.exists(member.elementGuid)) {
            liveGuids.push_back(member.elementGuid);
        }
    }
    if (liveGuids.empty()) {
        return {false, "Wrapper branch has no live Archicad members to select.", {}};
    }
    if (!highlightController_.selectElements(liveGuids)) {
        return {false, "Wrapper branch members could not be selected in Archicad.", {}};
    }
    return {true, "Wrapper branch members selected.", {}};
}

CommandResult AssemblyCommandService::selectWrapperMember(const std::string& assemblyUuid, const std::string& elementGuid)
{
    const auto assembly = registry_.getAssemblyByUuid(assemblyUuid);
    if (!assembly) {
        return {false, "Wrapper was not found.", {}};
    }
    const auto member = std::find_if(assembly->members.begin(), assembly->members.end(), [&](const AssemblyMember& item) {
        return item.elementGuid == elementGuid;
    });
    if (member == assembly->members.end()) {
        return {false, "Element is not a member of the selected wrapper.", {}};
    }
    if (!existenceChecker_.exists(elementGuid)) {
        return {false, "Wrapper member is missing in Archicad.", {}};
    }
    if (!highlightController_.selectElements({elementGuid})) {
        return {false, "Wrapper member could not be selected in Archicad.", {}};
    }
    return {true, "Wrapper member selected.", {}};
}

CommandResult AssemblyCommandService::addChildWrapper(const std::string& parentAssemblyUuid, const std::string& childAssemblyUuid)
{
    const auto parent = registry_.getAssemblyByUuid(parentAssemblyUuid);
    const auto child = registry_.getAssemblyByUuid(childAssemblyUuid);
    if (!parent || !child) {
        return {false, "Parent and child wrappers must both exist.", {}};
    }
    if (parentAssemblyUuid == childAssemblyUuid) {
        return {false, "A wrapper cannot contain itself.", {}};
    }
    const auto existingParent = registry_.getParentWrapper(childAssemblyUuid);
    if (existingParent && *existingParent != parentAssemblyUuid) {
        return {false, "Child wrapper already belongs to another parent wrapper.", {}};
    }
    if (!registry_.addChildWrapper(parentAssemblyUuid, childAssemblyUuid)) {
        return {false, "Child wrapper could not be added. Check for circular nesting.", {}};
    }
    registry_.incrementVersion(parentAssemblyUuid);
    registryStorage_.save(registry_);
    enqueueEvent(
        "assembly_relationship_updated",
        JsonSerializer::assemblyRelationshipUpdated(
            projectId_,
            {parentAssemblyUuid, childAssemblyUuid, "contains", 0, "active"},
            registry_.listRelationships()));
    return {true, "Child wrapper added to parent wrapper.", {}};
}

CommandResult AssemblyCommandService::addSelectedWrapperAsChild(const std::string& parentAssemblyUuid)
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select one member of the child wrapper first.", {}};
    }
    const auto child = registry_.getAssemblyByElementGuid(selection.front().elementGuid);
    if (!child) {
        return {false, "Selected element is not part of a BuildSync wrapper.", {}};
    }
    return addChildWrapper(parentAssemblyUuid, child->assemblyUuid);
}

CommandResult AssemblyCommandService::removeChildWrapper(const std::string& parentAssemblyUuid, const std::string& childAssemblyUuid)
{
    const auto parent = registry_.getAssemblyByUuid(parentAssemblyUuid);
    const auto child = registry_.getAssemblyByUuid(childAssemblyUuid);
    if (!parent || !child) {
        return {false, "Parent and child wrappers must both exist.", {}};
    }
    const auto existingParent = registry_.getParentWrapper(childAssemblyUuid);
    if (!existingParent || *existingParent != parentAssemblyUuid) {
        return {false, "Child wrapper is not nested under the selected parent.", {}};
    }
    registry_.removeChildWrapper(parentAssemblyUuid, childAssemblyUuid);
    registry_.incrementVersion(parentAssemblyUuid);
    registryStorage_.save(registry_);
    enqueueEvent(
        "assembly_relationship_updated",
        JsonSerializer::assemblyRelationshipUpdated(
            projectId_,
            {parentAssemblyUuid, childAssemblyUuid, "contains", 0, "removed"},
            registry_.listRelationships()));
    return {true, "Child wrapper removed from parent wrapper.", {}};
}

CommandResult AssemblyCommandService::addSelectionToAssembly(const std::string& assemblyUuid)
{
    const auto target = registry_.getAssemblyByUuid(assemblyUuid);
    if (!target) {
        return {false, "Target wrapper was not found.", {}};
    }

    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select one or more Archicad elements first.", {}};
    }

    std::vector<AssemblyMember> toAdd;
    for (const auto& selected : selection) {
        const auto existing = registry_.getAssemblyByElementGuid(selected.elementGuid);
        if (existing && existing->assemblyUuid != assemblyUuid) {
            return {false, "Selection contains elements from another wrapper.", {}};
        }
        if (!existing) {
            toAdd.push_back(memberFromSelection(selected, assemblyUuid));
        }
    }
    if (toAdd.empty()) {
        return {false, "Selection does not contain new elements for this wrapper.", {}};
    }

    if (!registry_.addMembers(assemblyUuid, toAdd) || !registry_.incrementVersion(assemblyUuid)) {
        return {false, "Selection could not be added to wrapper.", {}};
    }
    const auto updated = registry_.getAssemblyByUuid(assemblyUuid);
    if (!updated || !stampAssemblyProperties(*updated)) {
        return {false, "Wrapper was updated but BuildSync properties could not be written: " + propertyWriter_.lastDiagnostic(), {}};
    }
    registryStorage_.save(registry_);
    enqueueEvent("assembly_updated", JsonSerializer::assemblyUpdated(projectId_, *updated, toAdd, {}));
    return {true, "Selection added to wrapper.", {}};
}

CommandResult AssemblyCommandService::createAssemblyFromSelection(const CreateAssemblyRequest& request)
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select one or more Archicad elements first.", {}};
    }
    if (!propertyWriter_.ensureBuildSyncProperties()) {
        return {false, "BuildSync property setup failed: " + propertyWriter_.lastDiagnostic(), {}};
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
    if (!stampAssemblyProperties(assembly)) {
        registry_.deleteAssembly(assembly.assemblyUuid);
        return {false, "Assembly was created in memory but BuildSync properties could not be written: " + propertyWriter_.lastDiagnostic(), {}};
    }
    registryStorage_.save(registry_);
    enqueueEvent("assembly_created", JsonSerializer::assemblyCreated(projectId_, assembly));
    return {true, "Assembly " + assembly.assemblyId + " created locally.", {}};
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
    if (updated && updated->members.empty()) {
        registry_.deleteAssembly(assembly->assemblyUuid);
        registryStorage_.save(registry_);
        enqueueEvent("assembly_updated", JsonSerializer::assemblyUpdated(projectId_, *updated, {}, removed));
        return {true, "Assembly removed because it has no remaining members.", {}};
    }
    registryStorage_.save(registry_);
    if (updated) {
        enqueueEvent("assembly_updated", JsonSerializer::assemblyUpdated(projectId_, *updated, {}, removed));
    }
    return {true, "Selection removed from assembly.", {}};
}

CommandResult AssemblyCommandService::setWrapperCustomProperty(const std::string& assemblyUuid, const std::string& key, const std::string& value)
{
    if (key.empty()) {
        return {false, "Custom property key is required.", {}};
    }
    if (isReservedPropertyKey(key)) {
        return {false, "Custom property keys cannot use the reserved BS_* prefix.", {}};
    }

    auto assembly = registry_.getAssemblyByUuid(assemblyUuid);
    if (!assembly) {
        return {false, "Wrapper was not found.", {}};
    }

    bool updated = false;
    for (auto& property : assembly->customProperties) {
        if (property.key == key) {
            property.value = value;
            updated = true;
            break;
        }
    }
    if (!updated) {
        assembly->customProperties.push_back({key, value});
    }
    ++assembly->version;

    if (!registry_.updateAssembly(*assembly)) {
        return {false, "Custom property could not be saved.", {}};
    }
    if (!stampAssemblyProperties(*assembly)) {
        return {false, "Custom property was saved but BuildSync properties could not be restamped: " + propertyWriter_.lastDiagnostic(), {}};
    }
    registryStorage_.save(registry_);
    enqueueEvent("assembly_updated", JsonSerializer::assemblyUpdated(projectId_, *assembly, {}, {}));
    return {true, "Custom property saved.", {}};
}

CommandResult AssemblyCommandService::removeWrapperCustomProperty(const std::string& assemblyUuid, const std::string& key)
{
    auto assembly = registry_.getAssemblyByUuid(assemblyUuid);
    if (!assembly) {
        return {false, "Wrapper was not found.", {}};
    }
    const auto oldSize = assembly->customProperties.size();
    assembly->customProperties.erase(
        std::remove_if(assembly->customProperties.begin(), assembly->customProperties.end(), [&](const AssemblyProperty& property) {
            return property.key == key;
        }),
        assembly->customProperties.end());
    if (assembly->customProperties.size() == oldSize) {
        return {false, "Custom property was not found.", {}};
    }
    ++assembly->version;

    if (!registry_.updateAssembly(*assembly)) {
        return {false, "Custom property could not be removed.", {}};
    }
    if (!stampAssemblyProperties(*assembly)) {
        return {false, "Custom property was removed but BuildSync properties could not be restamped: " + propertyWriter_.lastDiagnostic(), {}};
    }
    registryStorage_.save(registry_);
    enqueueEvent("assembly_updated", JsonSerializer::assemblyUpdated(projectId_, *assembly, {}, {}));
    return {true, "Custom property removed.", {}};
}

CommandResult AssemblyCommandService::repairRegistry()
{
    int removed = 0;
    for (const auto& assembly : registry_.listAssemblies()) {
        const bool participatesInTree =
            registry_.getParentWrapper(assembly.assemblyUuid).has_value() ||
            !registry_.listChildWrappers(assembly.assemblyUuid).empty();
        if (assembly.members.empty() && !participatesInTree) {
            registry_.deleteAssembly(assembly.assemblyUuid);
            ++removed;
        }
    }
    registryStorage_.save(registry_);
    return {true, "Registry repair complete. Empty wrappers removed=" + std::to_string(removed) + ".", {}};
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

CommandResult AssemblyCommandService::debugSelection()
{
    const auto selection = selectionReader_.readSelection();
    std::ostringstream report;
    report << "Debug Selection: selected elements=" << selection.size();
    for (const auto& selected : selection) {
        report << "\n- " << selected.elementGuid << " [" << selected.elementType << "]";
    }
    return {true, report.str(), {}};
}

CommandResult AssemblyCommandService::debugRegistry()
{
    const auto assemblies = registry_.listAssemblies();
    std::ostringstream report;
    report << "Debug Registry: wrappers=" << assemblies.size();
    for (const auto& assembly : assemblies) {
        report << "\n- " << assembly.assemblyId << " " << assembly.name << " [" << assembly.type << "]"
               << " uuid=" << assembly.assemblyUuid << " members=" << assembly.members.size()
               << " version=" << assembly.version;
        for (const auto& member : assembly.members) {
            report << "\n  - " << member.elementGuid << " [" << member.elementType << "] status=" << member.status;
        }
    }
    return {true, report.str(), {}};
}

CommandResult AssemblyCommandService::debugBuildSyncProperties()
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Debug BuildSync Properties: select one or more Archicad elements first.", {}};
    }

    std::ostringstream report;
    report << "Debug BuildSync Properties: selected elements=" << selection.size();
    for (const auto& selected : selection) {
        report << "\n- " << selected.elementGuid << " [" << selected.elementType << "]";
        const auto assembly = registry_.getAssemblyByElementGuid(selected.elementGuid);
        if (assembly) {
            report << " registry=" << assembly->assemblyId;
        } else {
            report << " registry=unassigned";
        }
        report << "\n  " << propertyWriter_.describeBuildSyncProperties(selected.elementGuid);
    }
    return {true, report.str(), {}};
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
        customPropertiesJson(assembly.customProperties),
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
