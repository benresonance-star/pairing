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

class NullInstanceElementOperator final : public InstanceElementOperator {
public:
    bool supportsElementType(const std::string& elementType) const override
    {
        return elementType == "Wall" || elementType == "Slab" || elementType == "Column" ||
               elementType == "Beam" || elementType == "Roof" || elementType == "Object";
    }

    std::vector<std::string> supportedElementTypes() const override
    {
        return {"Wall", "Slab", "Column", "Beam", "Roof", "Object"};
    }

    std::vector<ElementSnapshot> snapshotElements(const std::vector<SelectedElement>& elements) const override
    {
        std::vector<ElementSnapshot> snapshots;
        for (const auto& element : elements) {
            snapshots.push_back({element.elementGuid, element.elementType, "{}"});
        }
        return snapshots;
    }

    std::vector<ElementDuplicateResult> duplicateElements(
        const std::vector<ElementDuplicateRequest>&,
        const PlanPlacement&) override
    {
        diagnostic_ = "Archicad instance element operator is not available.";
        return {};
    }

    bool updateElementFromSnapshot(const std::string&, const ElementSnapshot&, const ElementSnapshot&, const ElementSnapshot&, std::string* = nullptr) override
    {
        diagnostic_ = "Archicad instance element operator is not available.";
        return false;
    }

    bool deleteElements(const std::vector<std::string>&) override
    {
        diagnostic_ = "Archicad instance element operator is not available.";
        return false;
    }

    std::string groupElements(const std::vector<std::string>&) override
    {
        diagnostic_ = "Archicad instance element operator is not available.";
        return "";
    }

    bool ungroupElements(const std::string&, const std::vector<std::string>&) override
    {
        diagnostic_ = "Archicad instance element operator is not available.";
        return false;
    }

    std::string lastDiagnostic() const override { return diagnostic_; }

private:
    std::string diagnostic_{"Archicad instance element operator is not available."};
};

InstanceElementOperator& nullInstanceOperator()
{
    static NullInstanceElementOperator nullOperator;
    return nullOperator;
}

struct RuntimeCoordinateFrame {
    double originX{0.0};
    double originY{0.0};
    double rotationDegrees{0.0};
    bool valid{false};
};

RuntimeCoordinateFrame coordinateFrameFromSnapshots(const std::vector<ElementSnapshot>& snapshots)
{
    RuntimeCoordinateFrame frame;
    double sumX = 0.0;
    double sumY = 0.0;
    std::size_t count = 0;
    for (const auto& snapshot : snapshots) {
        if (snapshot.boundsValid) {
            sumX += snapshot.boundsCenterX;
            sumY += snapshot.boundsCenterY;
            if (!frame.valid && snapshot.frameValid) {
                frame.rotationDegrees = snapshot.frameRotationDegrees;
            }
            frame.valid = true;
            ++count;
            continue;
        }
        if (!snapshot.frameValid) {
            continue;
        }
        sumX += snapshot.frameOriginX;
        sumY += snapshot.frameOriginY;
        if (!frame.valid) {
            frame.rotationDegrees = snapshot.frameRotationDegrees;
        }
        frame.valid = true;
        ++count;
    }
    if (!frame.valid || count == 0) {
        return {};
    }
    frame.originX = sumX / static_cast<double>(count);
    frame.originY = sumY / static_cast<double>(count);
    return frame;
}

double squaredDistance(const RuntimeCoordinateFrame& first, const RuntimeCoordinateFrame& second)
{
    const double dx = first.originX - second.originX;
    const double dy = first.originY - second.originY;
    return dx * dx + dy * dy;
}

bool hasStoredPlacementOffset(const WrapperInstance& instance)
{
    return instance.transform.originX != 0.0 ||
        instance.transform.originY != 0.0 ||
        instance.transform.rotationDegrees != 0.0 ||
        instance.transform.mirrored;
}

RuntimeCoordinateFrame coordinateFrameFromStoredPlacement(
    const RuntimeCoordinateFrame& sourceFrame,
    const WrapperInstance& instance)
{
    if (!sourceFrame.valid || !hasStoredPlacementOffset(instance)) {
        return {};
    }
    return {
        sourceFrame.originX + instance.transform.originX,
        sourceFrame.originY + instance.transform.originY,
        sourceFrame.rotationDegrees + instance.transform.rotationDegrees,
        true,
    };
}

void applyCoordinateFrame(ElementSnapshot& snapshot, const RuntimeCoordinateFrame& frame)
{
    if (!frame.valid) {
        return;
    }
    snapshot.coordinateOriginX = frame.originX;
    snapshot.coordinateOriginY = frame.originY;
    snapshot.coordinateRotationDegrees = frame.rotationDegrees;
    snapshot.coordinateFrameValid = true;
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
    UuidFactory uuidFactory,
    InstanceElementOperator* instanceOperator)
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
    , instanceOperator_(instanceOperator == nullptr ? &nullInstanceOperator() : instanceOperator)
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

std::vector<WrapperInstance> AssemblyCommandService::listWrapperInstances(const std::string& sourceAssemblyUuid) const
{
    return registry_.listInstances(sourceAssemblyUuid);
}

std::vector<WrapperInstanceMember> AssemblyCommandService::listWrapperInstanceMembers(const std::string& instanceUuid) const
{
    return registry_.listInstanceMembers(instanceUuid);
}

std::optional<WrapperInstance> AssemblyCommandService::getWrapperInstance(const std::string& instanceUuid) const
{
    return registry_.getInstance(instanceUuid);
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

CommandResult AssemblyCommandService::createInstanceFromSelectedWrapper(const PlanPlacement& placement)
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select one source wrapper member first.", {}};
    }
    const auto source = registry_.getAssemblyByElementGuid(selection.front().elementGuid);
    if (!source) {
        return {false, "Selected element is not part of a BuildSync source wrapper.", {}};
    }
    return placeWrapperInstance({source->assemblyUuid, source->name + " Instance", placement});
}

CommandResult AssemblyCommandService::placeMirroredWrapperInstance(const CreateWrapperInstanceRequest& request)
{
    CreateWrapperInstanceRequest mirrored = request;
    mirrored.placement.mirrored = true;
    return placeWrapperInstance(mirrored);
}

CommandResult AssemblyCommandService::placeWrapperInstance(const CreateWrapperInstanceRequest& request)
{
    auto source = registry_.getAssemblyByUuid(request.sourceAssemblyUuid);
    if (!source) {
        return {false, "Source wrapper was not found.", {}};
    }
    int removedMissingSourceMembers = 0;
    CommandResult health = pruneMissingSourceMembers(source->assemblyUuid, &removedMissingSourceMembers);
    if (!health.ok) {
        return health;
    }
    source = registry_.getAssemblyByUuid(request.sourceAssemblyUuid);
    if (!source) {
        return {false, "Source wrapper was removed because it had no live members to instance.", {}};
    }
    if (source->members.empty()) {
        return {false, "Source wrapper has no live members to instance. Missing source members removed=" +
            std::to_string(removedMissingSourceMembers) + ".", {}};
    }
    for (const auto& member : source->members) {
        if (!instanceOperator_->supportsElementType(member.elementType)) {
            return {false, "Unsupported element type for wrapper instancing: " + member.elementType + ".", {}};
        }
    }
    CommandResult components = ensureComponentsForAssembly(*source);
    if (!components.ok) {
        return components;
    }

    std::vector<ElementDuplicateRequest> duplicateRequests;
    for (const auto& component : registry_.listComponents(source->assemblyUuid)) {
        if (component.status != "active") {
            continue;
        }
        duplicateRequests.push_back({component.sourceElementGuid, component.componentId, component.elementType, component.role});
    }
    const auto duplicateResults = instanceOperator_->duplicateElements(duplicateRequests, request.placement);
    if (duplicateResults.size() != duplicateRequests.size()) {
        std::ostringstream detail;
        detail << "Instance placement failed while duplicating source elements: " << instanceOperator_->lastDiagnostic();
        for (const auto& duplicateRequest : duplicateRequests) {
            if (!existenceChecker_.exists(duplicateRequest.sourceElementGuid)) {
                detail << " failedSourceGuid=" << duplicateRequest.sourceElementGuid
                       << " component=" << duplicateRequest.componentId
                       << " type=" << duplicateRequest.elementType;
                break;
            }
        }
        return {false, detail.str(), {}};
    }

    WrapperInstance instance;
    instance.instanceUuid = uuidFactory_();
    instance.sourceAssemblyUuid = source->assemblyUuid;
    instance.name = request.name.empty() ? source->name + " Instance" : request.name;
    instance.transform = {request.placement.originX, request.placement.originY, request.placement.rotationDegrees, request.placement.mirrored};
    instance.sourceFrame = {0.0, 0.0, 0.0, true};
    instance.liveFrame = {request.placement.originX, request.placement.originY, request.placement.rotationDegrees, true};
    instance.isMirrored = request.placement.mirrored;
    instance.sourceIsCountable = true;
    instance.localOverridesAllowed = false;
    instance.status = "active";

    std::vector<std::string> instanceGuids;
    std::vector<WrapperInstanceMember> instanceMembers;
    for (const auto& duplicated : duplicateResults) {
        instanceGuids.push_back(duplicated.elementGuid);
        instanceMembers.push_back({
            instance.instanceUuid,
            duplicated.componentId,
            duplicated.elementGuid,
            duplicated.elementType,
            duplicated.role,
            "active",
        });
    }
    instance.nativeGroupId = instanceOperator_->groupElements(instanceGuids);
    if (!registry_.createInstance(instance, instanceMembers)) {
        std::ostringstream detail;
        detail << "Instance registry record could not be created. source=" << instance.sourceAssemblyUuid
               << " instance=" << instance.instanceUuid
               << " components=" << duplicateRequests.size()
               << " duplicated=" << duplicateResults.size()
               << " members=" << instanceMembers.size();
        if (!instanceMembers.empty()) {
            detail << " firstMemberGuid=" << instanceMembers.front().elementGuid
                   << " firstComponent=" << instanceMembers.front().componentId;
        }
        return {false, detail.str(), {}};
    }
    if (!stampInstanceProperties(*source, instance)) {
        registry_.deleteInstance(instance.instanceUuid);
        return {false, "Instance was created but BuildSync properties could not be written: " + propertyWriter_.lastDiagnostic(), {}};
    }
    registryStorage_.save(registry_);
    return {true, "Wrapper instance " + instance.name + " placed.", {}};
}

CommandResult AssemblyCommandService::selectWrapperInstance(const std::string& instanceUuid)
{
    const auto instance = registry_.getInstance(instanceUuid);
    if (!instance) {
        return {false, "Wrapper instance was not found.", {}};
    }
    std::vector<std::string> liveGuids;
    for (const auto& member : registry_.listInstanceMembers(instanceUuid)) {
        if (existenceChecker_.exists(member.elementGuid)) {
            liveGuids.push_back(member.elementGuid);
        }
    }
    if (liveGuids.empty()) {
        return {false, "Wrapper instance has no live Archicad members to select.", {}};
    }
    if (!highlightController_.selectElements(liveGuids)) {
        return {false, "Wrapper instance members could not be selected in Archicad.", {}};
    }
    return {true, "Wrapper instance selected.", {}};
}

CommandResult AssemblyCommandService::selectSelectedElementInstance()
{
    const auto instance = selectedInstance();
    if (!instance) {
        return {false, "Selected element is not part of a BuildSync wrapper instance.", {}};
    }
    return selectWrapperInstance(instance->instanceUuid);
}

CommandResult AssemblyCommandService::enterWrapperEditMode()
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select one source or instance member before entering edit mode.", {}};
    }

    std::string sourceAssemblyUuid;
    std::string instanceUuid;
    if (const auto instance = registry_.getInstanceByMemberElementGuid(selection.front().elementGuid)) {
        sourceAssemblyUuid = instance->sourceAssemblyUuid;
        instanceUuid = instance->instanceUuid;
    } else if (const auto source = registry_.getAssemblyByElementGuid(selection.front().elementGuid)) {
        sourceAssemblyUuid = source->assemblyUuid;
    } else {
        return {false, "Selected element is not part of a BuildSync source wrapper or instance.", {}};
    }

    const auto source = registry_.getAssemblyByUuid(sourceAssemblyUuid);
    if (!source) {
        return {false, "Source wrapper for edit mode was not found.", {}};
    }
    int removedMissingSourceMembers = 0;
    CommandResult health = pruneMissingSourceMembers(sourceAssemblyUuid, &removedMissingSourceMembers);
    if (!health.ok) {
        return health;
    }
    if (removedMissingSourceMembers > 0) {
        return {false, "Source wrapper had missing members removed=" + std::to_string(removedMissingSourceMembers) +
            ". Re-enter edit mode with the repaired wrapper.", {}};
    }
    const CommandResult componentsReady = ensureComponentsForAssembly(*source);
    if (!componentsReady.ok) {
        return componentsReady;
    }
    if (!instanceUuid.empty()) {
        const auto editTargetInstance = registry_.getInstance(instanceUuid);
        if (!editTargetInstance) {
            return {false, "Selected instance is no longer registered.", {}};
        }
        if (editTargetInstance->needsRepair) {
            return {false, "Selected instance is marked as needing repair. Run Repair Instance before entering edit mode.", {}};
        }
    }
    activeBaselineByElementGuid_.clear();
    activeComponentByElementGuid_.clear();
    WrapperEditSession session{uuidFactory_(), sourceAssemblyUuid, instanceUuid, source->version, "active", {}};

    std::vector<SelectedElement> baselineElements;
    std::unordered_map<std::string, std::string> baselineInstanceByElementGuid;
    std::unordered_set<std::string> staleInstanceUuids;
    std::unordered_set<std::string> selectedElementGuids;
    for (const auto& selected : selection) {
        selectedElementGuids.insert(selected.elementGuid);
    }
    for (const auto& member : source->members) {
        const auto component = registry_.getComponentBySourceElementGuid(member.elementGuid);
        if (!component) {
            continue;
        }
        if (!existenceChecker_.exists(member.elementGuid)) {
            activeBaselineByElementGuid_.clear();
            activeComponentByElementGuid_.clear();
            return {false, "Source wrapper member is missing and cannot be used for shared edit propagation: " +
                member.elementGuid + " [" + member.elementType + "].", {}};
        }
        baselineElements.push_back({member.elementGuid, member.elementType});
        activeComponentByElementGuid_[member.elementGuid] = component->componentId;
    }
    for (const auto& instance : registry_.listInstances(sourceAssemblyUuid)) {
        if (instance.needsRepair) {
            continue;
        }
        for (const auto& member : registry_.listInstanceMembers(instance.instanceUuid)) {
            if (!existenceChecker_.exists(member.elementGuid)) {
                registry_.markInstanceNeedsRepair(instance.instanceUuid, true);
                staleInstanceUuids.insert(instance.instanceUuid);
                continue;
            }
            baselineElements.push_back({member.elementGuid, member.elementType});
            baselineInstanceByElementGuid[member.elementGuid] = instance.instanceUuid;
            activeComponentByElementGuid_[member.elementGuid] = member.componentId;
        }
    }
    auto baselineSnapshots = instanceOperator_->snapshotElements(baselineElements);
    std::vector<ElementSnapshot> sourcePlacementSnapshots;
    std::unordered_map<std::string, std::vector<ElementSnapshot>> instancePlacementSnapshots;
    for (const auto& snapshot : baselineSnapshots) {
        const auto instanceForElement = baselineInstanceByElementGuid.find(snapshot.elementGuid);
        if (instanceForElement == baselineInstanceByElementGuid.end()) {
            sourcePlacementSnapshots.push_back(snapshot);
        } else {
            instancePlacementSnapshots[instanceForElement->second].push_back(snapshot);
        }
    }
    const RuntimeCoordinateFrame sourcePlacementFrame = coordinateFrameFromSnapshots(sourcePlacementSnapshots);
    std::unordered_map<std::string, RuntimeCoordinateFrame> instancePlacementFrames;
    for (const auto& [placementInstanceUuid, placementSnapshots] : instancePlacementSnapshots) {
        instancePlacementFrames[placementInstanceUuid] = coordinateFrameFromSnapshots(placementSnapshots);
        if (auto placementInstance = registry_.getInstance(placementInstanceUuid)) {
            const RuntimeCoordinateFrame storedFrame = coordinateFrameFromStoredPlacement(sourcePlacementFrame, *placementInstance);
            if (storedFrame.valid && (!instancePlacementFrames[placementInstanceUuid].valid ||
                squaredDistance(instancePlacementFrames[placementInstanceUuid], sourcePlacementFrame) <
                    squaredDistance(storedFrame, sourcePlacementFrame) * 0.25)) {
                instancePlacementFrames[placementInstanceUuid] = storedFrame;
            }
            placementInstance->sourceFrame = {
                sourcePlacementFrame.originX,
                sourcePlacementFrame.originY,
                sourcePlacementFrame.rotationDegrees,
                sourcePlacementFrame.valid,
            };
            placementInstance->liveFrame = {
                instancePlacementFrames[placementInstanceUuid].originX,
                instancePlacementFrames[placementInstanceUuid].originY,
                instancePlacementFrames[placementInstanceUuid].rotationDegrees,
                instancePlacementFrames[placementInstanceUuid].valid,
            };
            registry_.updateInstance(*placementInstance);
        }
    }
    for (auto snapshot : baselineSnapshots) {
        const auto instanceForElement = baselineInstanceByElementGuid.find(snapshot.elementGuid);
        if (instanceForElement == baselineInstanceByElementGuid.end()) {
            applyCoordinateFrame(snapshot, sourcePlacementFrame);
        } else {
            applyCoordinateFrame(snapshot, instancePlacementFrames[instanceForElement->second]);
        }
        activeBaselineByElementGuid_[snapshot.elementGuid] = snapshot;
        const auto component = activeComponentByElementGuid_.find(snapshot.elementGuid);
        session.baselines.push_back({
            component == activeComponentByElementGuid_.end() ? "" : component->second,
            snapshot.elementGuid,
            registry_.getInstanceByMemberElementGuid(snapshot.elementGuid).has_value()
                ? registry_.getInstanceByMemberElementGuid(snapshot.elementGuid)->instanceUuid
                : "",
            {
                snapshot.coordinateOriginX,
                snapshot.coordinateOriginY,
                snapshot.coordinateRotationDegrees,
                snapshot.coordinateFrameValid,
            },
            snapshot.snapshotJson,
        });
    }
    if (activeBaselineByElementGuid_.size() != baselineElements.size()) {
        std::ostringstream missing;
        bool first = true;
        for (const auto& element : baselineElements) {
            if (activeBaselineByElementGuid_.count(element.elementGuid) > 0) {
                continue;
            }
            if (selectedElementGuids.count(element.elementGuid) > 0) {
                missing << (first ? "" : ", ") << element.elementGuid << " [" << element.elementType << "]";
                first = false;
                continue;
            }
            const auto failedInstance = baselineInstanceByElementGuid.find(element.elementGuid);
            if (failedInstance != baselineInstanceByElementGuid.end()) {
                registry_.markInstanceNeedsRepair(failedInstance->second, true);
                staleInstanceUuids.insert(failedInstance->second);
                continue;
            }
            missing << (first ? "" : ", ") << element.elementGuid << " [" << element.elementType << "]";
            first = false;
        }
        if (!missing.str().empty()) {
            activeBaselineByElementGuid_.clear();
            activeComponentByElementGuid_.clear();
            return {false, "Wrapper edit mode could not capture baseline geometry for source/edit target members: " +
                missing.str() + ". " + instanceOperator_->lastDiagnostic(), {}};
        }
        std::vector<WrapperEditBaseline> retainedBaselines;
        for (const auto& baseline : session.baselines) {
            if (activeBaselineByElementGuid_.count(baseline.elementGuid) > 0) {
                retainedBaselines.push_back(baseline);
            }
        }
        session.baselines = retainedBaselines;
    }
    if (!staleInstanceUuids.empty()) {
        for (const auto& repairedInstance : registry_.listInstances(sourceAssemblyUuid)) {
            if (staleInstanceUuids.count(repairedInstance.instanceUuid) > 0) {
                stampInstanceProperties(*source, repairedInstance);
            }
        }
    }
    registryStorage_.save(registry_);
    activeEditSession_ = session;
    return {true, "Wrapper edit mode started. Applying edits will update the physical source wrapper and every linked instance.", {}};
}

CommandResult AssemblyCommandService::applyWrapperEdit()
{
    if (!activeEditSession_) {
        return {false, "No active wrapper edit session.", {}};
    }
    auto source = registry_.getAssemblyByUuid(activeEditSession_->sourceAssemblyUuid);
    if (!source) {
        activeEditSession_.reset();
        return {false, "Source wrapper for edit session was not found.", {}};
    }
    int removedMissingSourceMembers = 0;
    CommandResult health = pruneMissingSourceMembers(source->assemblyUuid, &removedMissingSourceMembers);
    if (!health.ok) {
        activeEditSession_.reset();
        return health;
    }
    if (removedMissingSourceMembers > 0) {
        activeEditSession_.reset();
        return {false, "Source wrapper had missing members removed=" + std::to_string(removedMissingSourceMembers) +
            ". The active edit session was cancelled; re-enter edit mode with the repaired wrapper.", {}};
    }
    if (source->version != activeEditSession_->baselineAssemblyVersion) {
        return {false, "Wrapper edit session is stale because another edit changed the source wrapper.", {}};
    }
    if (activeBaselineByElementGuid_.empty()) {
        return {false, "Wrapper edit session has no baseline geometry. Re-enter edit mode before applying.", {}};
    }
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select the edited source or instance members before applying wrapper edit.", {}};
    }

    auto snapshots = instanceOperator_->snapshotElements(selection);
    for (auto& snapshot : snapshots) {
        const auto baseline = activeBaselineByElementGuid_.find(snapshot.elementGuid);
        if (baseline == activeBaselineByElementGuid_.end()) {
            continue;
        }
        snapshot.coordinateOriginX = baseline->second.coordinateOriginX;
        snapshot.coordinateOriginY = baseline->second.coordinateOriginY;
        snapshot.coordinateRotationDegrees = baseline->second.coordinateRotationDegrees;
        snapshot.coordinateFrameValid = baseline->second.coordinateFrameValid;
    }
    std::unordered_map<std::string, ElementSnapshot> snapshotsByComponentId;
    std::unordered_map<std::string, ElementSnapshot> editedBaselinesByComponentId;
    for (const auto& snapshot : snapshots) {
        if (const auto sourceComponent = registry_.getComponentBySourceElementGuid(snapshot.elementGuid)) {
            snapshotsByComponentId[sourceComponent->componentId] = snapshot;
            const auto baseline = activeBaselineByElementGuid_.find(snapshot.elementGuid);
            if (baseline != activeBaselineByElementGuid_.end()) {
                editedBaselinesByComponentId[sourceComponent->componentId] = baseline->second;
            }
            WrapperComponent updated = *sourceComponent;
            updated.snapshotJson = snapshot.snapshotJson;
            registry_.upsertComponent(updated);
        } else if (const auto editedInstance = registry_.getInstanceByMemberElementGuid(snapshot.elementGuid)) {
            for (const auto& member : registry_.listInstanceMembers(editedInstance->instanceUuid)) {
                if (member.elementGuid == snapshot.elementGuid) {
                    snapshotsByComponentId[member.componentId] = snapshot;
                    const auto baseline = activeBaselineByElementGuid_.find(snapshot.elementGuid);
                    if (baseline != activeBaselineByElementGuid_.end()) {
                        editedBaselinesByComponentId[member.componentId] = baseline->second;
                    }
                    if (auto component = registry_.getComponent(member.componentId)) {
                        component->snapshotJson = snapshot.snapshotJson;
                        registry_.upsertComponent(*component);
                    }
                    break;
                }
            }
        }
    }
    if (snapshotsByComponentId.empty()) {
        return {false, "No edited members could be matched to source components. Use the apply review to classify add/delete/replace changes.", {}};
    }
    if (editedBaselinesByComponentId.size() != snapshotsByComponentId.size()) {
        return {false, "Edited members do not have baseline geometry. Re-enter edit mode before applying.", {}};
    }

    bool failed = false;
    std::string failureMessage;
    for (const auto& sourceMember : source->members) {
        const auto component = registry_.getComponentBySourceElementGuid(sourceMember.elementGuid);
        if (!component) {
            continue;
        }
        const auto snapshot = snapshotsByComponentId.find(component->componentId);
        if (snapshot == snapshotsByComponentId.end()) {
            continue;
        }
        if (snapshot->second.elementGuid == sourceMember.elementGuid) {
            continue;
        }
        const auto editedBaseline = editedBaselinesByComponentId.find(component->componentId);
        const auto targetBaseline = activeBaselineByElementGuid_.find(sourceMember.elementGuid);
        if (editedBaseline == editedBaselinesByComponentId.end() || targetBaseline == activeBaselineByElementGuid_.end()) {
            return {false, "Source wrapper target is missing baseline geometry. Re-enter edit mode before applying.", {}};
        }
        std::string replacementElementGuid;
        if (!instanceOperator_->updateElementFromSnapshot(sourceMember.elementGuid, snapshot->second, editedBaseline->second, targetBaseline->second, &replacementElementGuid)) {
            failed = true;
            failureMessage = "Source placement update failed for component " + component->componentId + " element " +
                sourceMember.elementGuid + ": " + instanceOperator_->lastDiagnostic();
            break;
        }
    }
    for (const auto& instance : registry_.listInstances(source->assemblyUuid)) {
        if (failed) {
            break;
        }
        if (instance.instanceUuid == activeEditSession_->instanceUuid) {
            continue;
        }
        if (instance.needsRepair) {
            continue;
        }
        for (const auto& member : registry_.listInstanceMembers(instance.instanceUuid)) {
            const auto snapshot = snapshotsByComponentId.find(member.componentId);
            if (snapshot == snapshotsByComponentId.end()) {
                continue;
            }
            const auto editedBaseline = editedBaselinesByComponentId.find(member.componentId);
            const auto targetBaseline = activeBaselineByElementGuid_.find(member.elementGuid);
            if (editedBaseline == editedBaselinesByComponentId.end() || targetBaseline == activeBaselineByElementGuid_.end()) {
                registry_.markInstanceNeedsRepair(instance.instanceUuid, true);
                failed = true;
                failureMessage = "Instance " + instance.instanceUuid + " member " + member.elementGuid +
                    " is missing baseline geometry. Re-enter edit mode before applying.";
                break;
            }
            std::string replacementElementGuid;
            if (!instanceOperator_->updateElementFromSnapshot(member.elementGuid, snapshot->second, editedBaseline->second, targetBaseline->second, &replacementElementGuid)) {
                registry_.markInstanceNeedsRepair(instance.instanceUuid, true);
                failed = true;
                failureMessage = "Instance " + instance.instanceUuid + " member " + member.elementGuid +
                    " failed for component " + member.componentId + ": " + instanceOperator_->lastDiagnostic();
                break;
            }
            if (!replacementElementGuid.empty() && replacementElementGuid != member.elementGuid) {
                registry_.replaceInstanceMemberElement(instance.instanceUuid, member.componentId, replacementElementGuid);
            }
        }
        if (failed) {
            break;
        }
    }

    registry_.incrementVersion(source->assemblyUuid);
    source = registry_.getAssemblyByUuid(source->assemblyUuid);
    if (source) {
        stampAssemblyProperties(*source);
        for (const auto& instance : registry_.listInstances(source->assemblyUuid)) {
            stampInstanceProperties(*source, instance);
        }
    }
    registryStorage_.save(registry_);
    activeEditSession_.reset();
    activeBaselineByElementGuid_.clear();
    activeComponentByElementGuid_.clear();
    if (failed) {
        return {false, "Wrapper edit partially failed. " + failureMessage, {}};
    }
    return {true, "Wrapper edit applied to source and linked instances.", {}};
}

CommandResult AssemblyCommandService::cancelWrapperEdit()
{
    if (!activeEditSession_) {
        return {false, "No active wrapper edit session.", {}};
    }
    activeEditSession_.reset();
    activeBaselineByElementGuid_.clear();
    activeComponentByElementGuid_.clear();
    return {true, "Wrapper edit mode cancelled.", {}};
}

CommandResult AssemblyCommandService::convertSelectedInstanceToStandaloneWrapper(const std::string& name)
{
    const auto instance = selectedInstance();
    if (!instance) {
        return {false, "Select one instance member to convert.", {}};
    }
    const auto source = registry_.getAssemblyByUuid(instance->sourceAssemblyUuid);
    if (!source) {
        return {false, "Source wrapper for instance was not found.", {}};
    }

    Assembly standalone = *source;
    standalone.assemblyUuid = uuidFactory_();
    standalone.assemblyId = namingRules_.generateAssemblyId(source->type, source->level, source->zone);
    standalone.name = name.empty() ? instance->name : name;
    standalone.version = 1;
    standalone.members.clear();
    for (const auto& member : registry_.listInstanceMembers(instance->instanceUuid)) {
        standalone.members.push_back({standalone.assemblyUuid, member.elementGuid, member.elementType, member.role, "active", ""});
    }
    if (!registry_.createAssembly(standalone)) {
        return {false, "Standalone wrapper could not be created.", {}};
    }
    registry_.deleteInstance(instance->instanceUuid);
    if (!stampAssemblyProperties(standalone)) {
        return {false, "Standalone wrapper was created but BuildSync properties could not be restamped: " + propertyWriter_.lastDiagnostic(), {}};
    }
    registryStorage_.save(registry_);
    return {true, "Instance converted to standalone wrapper " + standalone.assemblyId + ".", {}};
}

CommandResult AssemblyCommandService::breakApartSelectedInstance()
{
    const auto instance = selectedInstance();
    if (!instance) {
        return {false, "Select one instance member to break apart.", {}};
    }
    std::vector<std::string> elementGuids;
    for (const auto& member : registry_.listInstanceMembers(instance->instanceUuid)) {
        elementGuids.push_back(member.elementGuid);
        propertyWriter_.clearAssemblyProperties(member.elementGuid);
    }
    instanceOperator_->ungroupElements(instance->nativeGroupId, elementGuids);
    registry_.deleteInstance(instance->instanceUuid);
    registryStorage_.save(registry_);
    highlightController_.selectElements(elementGuids);
    return {true, "Instance broken apart into unbound Archicad elements.", {}};
}

CommandResult AssemblyCommandService::repairSelectedInstance()
{
    const auto instance = selectedInstance();
    if (!instance) {
        return {false, "Select one instance member to repair.", {}};
    }
    std::vector<std::string> liveGuids;
    for (const auto& member : registry_.listInstanceMembers(instance->instanceUuid)) {
        if (existenceChecker_.exists(member.elementGuid)) {
            liveGuids.push_back(member.elementGuid);
        }
    }
    WrapperInstance repaired = *instance;
    repaired.nativeGroupId = instanceOperator_->groupElements(liveGuids);
    repaired.needsRepair = false;
    registry_.updateInstance(repaired);
    if (const auto source = registry_.getAssemblyByUuid(repaired.sourceAssemblyUuid)) {
        stampInstanceProperties(*source, repaired);
    }
    registryStorage_.save(registry_);
    return {true, "Instance repair complete.", {}};
}

CommandResult AssemblyCommandService::repairRegistry()
{
    int removedWrappers = 0;
    int removedMembers = 0;
    int missingInstanceMembersDetected = 0;
    int needsRepairInstances = 0;
    for (const auto& member : registry_.listAllInstanceMembers()) {
        if (!existenceChecker_.exists(member.elementGuid)) {
            ++missingInstanceMembersDetected;
        }
    }
    for (const auto& instance : registry_.listAllInstances()) {
        if (instance.needsRepair) {
            ++needsRepairInstances;
        }
    }
    for (const auto& assembly : registry_.listAssemblies()) {
        std::vector<std::string> missingMembers;
        for (const auto& member : assembly.members) {
            if (!existenceChecker_.exists(member.elementGuid)) {
                missingMembers.push_back(member.elementGuid);
            }
        }
        if (!missingMembers.empty()) {
            registry_.removeMembers(assembly.assemblyUuid, missingMembers);
            registry_.incrementVersion(assembly.assemblyUuid);
            removedMembers += static_cast<int>(missingMembers.size());
        }

        const auto updated = registry_.getAssemblyByUuid(assembly.assemblyUuid);
        if (!updated) {
            continue;
        }
        const bool participatesInTree =
            registry_.getParentWrapper(updated->assemblyUuid).has_value() ||
            !registry_.listChildWrappers(updated->assemblyUuid).empty();
        if (updated->members.empty() && !participatesInTree) {
            registry_.deleteAssembly(updated->assemblyUuid);
            ++removedWrappers;
        } else if (!missingMembers.empty()) {
            stampAssemblyProperties(*updated);
        }
    }
    registryStorage_.save(registry_);
    return {true, "Registry repair complete. Missing wrapper members removed=" + std::to_string(removedMembers) +
        ". Missing instance members detected=" + std::to_string(missingInstanceMembersDetected) +
        ". Instances needing repair=" + std::to_string(needsRepairInstances) +
        ". Empty wrappers removed=" + std::to_string(removedWrappers) + ".", {}};
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
        assembly.assemblyUuid,
        "",
        registry_.getComponentBySourceElementGuid(member.elementGuid).has_value()
            ? registry_.getComponentBySourceElementGuid(member.elementGuid)->componentId
            : "",
        "false",
        "false",
        "true",
        "false",
        "false",
        member.role,
    };
}

BuildSyncProperties AssemblyCommandService::instancePropertiesFor(
    const Assembly& source,
    const WrapperInstance& instance,
    const WrapperInstanceMember& member) const
{
    return {
        source.assemblyId,
        source.assemblyUuid,
        source.name,
        source.type,
        member.role,
        std::to_string(source.version),
        source.taskId,
        source.trade,
        instance.status,
        customPropertiesJson(source.customProperties),
        source.assemblyUuid,
        instance.instanceUuid,
        member.componentId,
        "true",
        instance.isMirrored ? "true" : "false",
        instance.sourceIsCountable ? "true" : "false",
        instance.needsRepair ? "true" : "false",
        instance.localOverridesAllowed ? "true" : "false",
        member.role,
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

bool AssemblyCommandService::stampInstanceProperties(const Assembly& source, const WrapperInstance& instance)
{
    bool ok = true;
    for (const auto& member : registry_.listInstanceMembers(instance.instanceUuid)) {
        ok = propertyWriter_.writeAssemblyProperties(member.elementGuid, instancePropertiesFor(source, instance, member)) && ok;
    }
    return ok;
}

CommandResult AssemblyCommandService::ensureComponentsForAssembly(const Assembly& assembly)
{
    std::vector<SelectedElement> snapshotRequests;
    int sortOrder = 0;
    for (const auto& member : assembly.members) {
        if (!instanceOperator_->supportsElementType(member.elementType)) {
            return {false, "Unsupported element type for wrapper instancing: " + member.elementType + ".", {}};
        }
        if (!registry_.getComponentBySourceElementGuid(member.elementGuid)) {
            snapshotRequests.push_back({member.elementGuid, member.elementType});
        }
    }

    std::unordered_map<std::string, ElementSnapshot> snapshotsByGuid;
    for (const auto& snapshot : instanceOperator_->snapshotElements(snapshotRequests)) {
        snapshotsByGuid[snapshot.elementGuid] = snapshot;
    }

    for (const auto& member : assembly.members) {
        if (registry_.getComponentBySourceElementGuid(member.elementGuid)) {
            ++sortOrder;
            continue;
        }
        const auto snapshot = snapshotsByGuid.find(member.elementGuid);
        WrapperComponent component;
        component.componentId = uuidFactory_();
        component.sourceAssemblyUuid = assembly.assemblyUuid;
        component.sourceElementGuid = member.elementGuid;
        component.elementType = member.elementType;
        component.role = member.role;
        component.sortOrder = sortOrder++;
        component.snapshotJson = snapshot == snapshotsByGuid.end() ? "{}" : snapshot->second.snapshotJson;
        if (snapshot != snapshotsByGuid.end() && snapshot->second.frameValid) {
            component.localFrame = {
                snapshot->second.frameOriginX,
                snapshot->second.frameOriginY,
                snapshot->second.frameRotationDegrees,
                true,
            };
        }
        component.status = "active";
        if (!registry_.upsertComponent(component)) {
            return {false, "Wrapper component could not be registered for element " + member.elementGuid + ".", {}};
        }
    }
    return {true, "Wrapper components are ready.", {}};
}

CommandResult AssemblyCommandService::pruneMissingSourceMembers(const std::string& assemblyUuid, int* removedCount)
{
    if (removedCount != nullptr) {
        *removedCount = 0;
    }
    const auto assembly = registry_.getAssemblyByUuid(assemblyUuid);
    if (!assembly) {
        return {false, "Source wrapper was not found during health check.", {}};
    }

    std::vector<std::string> missingMembers;
    for (const auto& member : assembly->members) {
        if (!existenceChecker_.exists(member.elementGuid)) {
            missingMembers.push_back(member.elementGuid);
        }
    }
    if (missingMembers.empty()) {
        return {true, "Source wrapper health check passed.", {}};
    }

    registry_.removeMembers(assemblyUuid, missingMembers);
    registry_.incrementVersion(assemblyUuid);
    if (removedCount != nullptr) {
        *removedCount = static_cast<int>(missingMembers.size());
    }
    if (const auto updated = registry_.getAssemblyByUuid(assemblyUuid)) {
        stampAssemblyProperties(*updated);
    }
    registryStorage_.save(registry_);
    return {true, "Source wrapper health check removed missing source members=" +
        std::to_string(missingMembers.size()) + ".", {}};
}

int AssemblyCommandService::countMissingInstanceMembers(const std::string& sourceAssemblyUuid) const
{
    int missing = 0;
    for (const auto& instance : registry_.listInstances(sourceAssemblyUuid)) {
        for (const auto& member : registry_.listInstanceMembers(instance.instanceUuid)) {
            if (!existenceChecker_.exists(member.elementGuid)) {
                ++missing;
            }
        }
    }
    return missing;
}

int AssemblyCommandService::countInstancesNeedingRepair(const std::string& sourceAssemblyUuid) const
{
    int needsRepair = 0;
    for (const auto& instance : registry_.listInstances(sourceAssemblyUuid)) {
        if (instance.needsRepair) {
            ++needsRepair;
        }
    }
    return needsRepair;
}

std::optional<WrapperInstance> AssemblyCommandService::selectedInstance() const
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return std::nullopt;
    }
    return registry_.getInstanceByMemberElementGuid(selection.front().elementGuid);
}

void AssemblyCommandService::enqueueEvent(const std::string& eventType, const std::string& payloadJson)
{
    syncQueue_.enqueue({uuidFactory_(), eventType, "", payloadJson, "pending", 0, ""});
}

} // namespace buildsync
