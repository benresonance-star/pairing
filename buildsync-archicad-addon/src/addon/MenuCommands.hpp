#pragma once

#include "archicad_adapter/ArchicadTypes.hpp"
#include "archicad_adapter/RegistryStorage.hpp"
#include "core/AssemblyRegistry.hpp"
#include "core/AssemblyValidator.hpp"
#include "core/NamingRules.hpp"
#include "sync/PythonListenerClient.hpp"
#include "sync/SyncQueue.hpp"

#include <functional>
#include <string>

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

class AssemblyCommandService {
public:
    using UuidFactory = std::function<std::string()>;

    AssemblyCommandService(
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
        UuidFactory uuidFactory);

    CommandResult createAssemblyFromSelection(const CreateAssemblyRequest& request);
    CommandResult selectAssemblyMembers();
    CommandResult addSelectionToAssembly();
    CommandResult removeSelectionFromAssembly();
    CommandResult validateSelectedAssembly();
    CommandResult syncWithPythonListener();

private:
    AssemblyMember memberFromSelection(const SelectedElement& selected, const std::string& assemblyUuid) const;
    BuildSyncProperties propertiesFor(const Assembly& assembly, const AssemblyMember& member) const;
    bool stampAssemblyProperties(const Assembly& assembly);
    void enqueueEvent(const std::string& eventType, const std::string& payloadJson);

    SelectionReader& selectionReader_;
    ElementPropertyWriter& propertyWriter_;
    ElementExistenceChecker& existenceChecker_;
    HighlightController& highlightController_;
    RegistryStorage& registryStorage_;
    PythonListenerClient& listenerClient_;
    AssemblyRegistry& registry_;
    NamingRules& namingRules_;
    SyncQueue& syncQueue_;
    std::string projectId_;
    UuidFactory uuidFactory_;
};

} // namespace buildsync
