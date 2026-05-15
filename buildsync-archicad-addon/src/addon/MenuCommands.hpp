#pragma once

#include "archicad_adapter/ArchicadTypes.hpp"
#include "archicad_adapter/RegistryStorage.hpp"
#include "core/AssemblyRegistry.hpp"
#include "core/AssemblyValidator.hpp"
#include "core/NamingRules.hpp"
#include "sync/PythonListenerClient.hpp"
#include "sync/SyncQueue.hpp"

#include <functional>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

namespace buildsync {

struct CreateAssemblyRequest {
    std::string name;
    std::string type;
    std::string zone;
    std::string level;
    std::string trade;
    std::string taskId;
};

struct CommandResult {
    bool ok{false};
    std::string message;
    ValidationResult validation;
};

struct AssemblyUpdateRequest {
    std::string assemblyId;
    std::string name;
    std::string type;
    std::string zone;
    std::string level;
    std::string trade;
    std::string taskId;
    std::string status;
};

struct CreateWrapperInstanceRequest {
    std::string sourceAssemblyUuid;
    std::string name;
    PlanPlacement placement;
};

class AssemblyCommandService {
public:
    using UuidFactory = std::function<std::string()>;

    AssemblyCommandService(
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
        InstanceElementOperator* instanceOperator = nullptr);

    std::vector<Assembly> listWrappers() const;
    std::vector<WrapperInstance> listWrapperInstances(const std::string& sourceAssemblyUuid) const;
    std::vector<WrapperInstanceMember> listWrapperInstanceMembers(const std::string& instanceUuid) const;
    std::optional<Assembly> getWrapper(const std::string& assemblyUuid) const;
    std::optional<WrapperInstance> getWrapperInstance(const std::string& instanceUuid) const;
    std::vector<ElementMetadata> listWrapperMemberMetadata(const std::string& assemblyUuid) const;
    std::vector<Assembly> listChildWrappers(const std::string& assemblyUuid) const;
    std::vector<AssemblyMember> resolveEffectiveMembers(const std::string& assemblyUuid) const;
    CommandResult updateWrapper(const std::string& assemblyUuid, const AssemblyUpdateRequest& request);
    CommandResult deleteWrapper(const std::string& assemblyUuid);
    CommandResult selectWrapperMembers(const std::string& assemblyUuid);
    CommandResult selectWrapperBranchMembers(const std::string& assemblyUuid);
    CommandResult selectWrapperMember(const std::string& assemblyUuid, const std::string& elementGuid);
    CommandResult addChildWrapper(const std::string& parentAssemblyUuid, const std::string& childAssemblyUuid);
    CommandResult addSelectedWrapperAsChild(const std::string& parentAssemblyUuid);
    CommandResult removeChildWrapper(const std::string& parentAssemblyUuid, const std::string& childAssemblyUuid);
    CommandResult addSelectionToAssembly(const std::string& assemblyUuid);
    CommandResult createAssemblyFromSelection(const CreateAssemblyRequest& request);
    CommandResult selectAssemblyMembers();
    CommandResult addSelectionToAssembly();
    CommandResult removeSelectionFromAssembly();
    CommandResult setWrapperCustomProperty(const std::string& assemblyUuid, const std::string& key, const std::string& value);
    CommandResult removeWrapperCustomProperty(const std::string& assemblyUuid, const std::string& key);
    CommandResult createInstanceFromSelectedWrapper(const PlanPlacement& placement);
    CommandResult placeWrapperInstance(const CreateWrapperInstanceRequest& request);
    CommandResult placeMirroredWrapperInstance(const CreateWrapperInstanceRequest& request);
    CommandResult selectWrapperInstance(const std::string& instanceUuid);
    CommandResult selectSelectedElementInstance();
    CommandResult enterWrapperEditMode();
    CommandResult applyWrapperEdit();
    CommandResult cancelWrapperEdit();
    CommandResult convertSelectedInstanceToStandaloneWrapper(const std::string& name);
    CommandResult breakApartSelectedInstance();
    CommandResult repairSelectedInstance();
    CommandResult repairRegistry();
    CommandResult validateSelectedAssembly();
    CommandResult syncWithPythonListener();
    CommandResult debugSelection();
    CommandResult debugRegistry();
    CommandResult debugBuildSyncProperties();

private:
    AssemblyMember memberFromSelection(const SelectedElement& selected, const std::string& assemblyUuid) const;
    BuildSyncProperties propertiesFor(const Assembly& assembly, const AssemblyMember& member) const;
    BuildSyncProperties instancePropertiesFor(
        const Assembly& source,
        const WrapperInstance& instance,
        const WrapperInstanceMember& member) const;
    bool stampAssemblyProperties(const Assembly& assembly);
    bool stampInstanceProperties(const Assembly& source, const WrapperInstance& instance);
    CommandResult ensureComponentsForAssembly(const Assembly& assembly);
    CommandResult pruneMissingSourceMembers(const std::string& assemblyUuid, int* removedCount = nullptr);
    int countMissingInstanceMembers(const std::string& sourceAssemblyUuid) const;
    int countInstancesNeedingRepair(const std::string& sourceAssemblyUuid) const;
    std::optional<WrapperInstance> selectedInstance() const;
    void enqueueEvent(const std::string& eventType, const std::string& payloadJson);

    SelectionReader& selectionReader_;
    ElementPropertyWriter& propertyWriter_;
    ElementExistenceChecker& existenceChecker_;
    ElementMetadataReader& metadataReader_;
    HighlightController& highlightController_;
    RegistryStorage& registryStorage_;
    PythonListenerClient& listenerClient_;
    AssemblyRegistry& registry_;
    NamingRules& namingRules_;
    SyncQueue& syncQueue_;
    std::string projectId_;
    UuidFactory uuidFactory_;
    InstanceElementOperator* instanceOperator_;
    std::optional<WrapperEditSession> activeEditSession_;
    std::unordered_map<std::string, ElementSnapshot> activeBaselineByElementGuid_;
    std::unordered_map<std::string, std::string> activeComponentByElementGuid_;
};

} // namespace buildsync
