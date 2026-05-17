#pragma once

#include "core/Assembly.hpp"
#include "core/AssemblyGraph.hpp"

#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

namespace buildsync {

class AssemblyRegistry {
public:
    bool createAssembly(const Assembly& assembly);
    bool deleteAssembly(const std::string& assemblyUuid);
    bool updateAssembly(const Assembly& assembly);
    bool addMembers(const std::string& assemblyUuid, const std::vector<AssemblyMember>& members);
    bool removeMembers(const std::string& assemblyUuid, const std::vector<std::string>& elementGuids);
    bool renameAssembly(const std::string& assemblyUuid, const std::string& assemblyId, const std::string& name);
    bool incrementVersion(const std::string& assemblyUuid);
    bool addChildWrapper(const std::string& parentUuid, const std::string& childUuid, const std::string& relationshipType = "contains");
    bool removeChildWrapper(const std::string& parentUuid, const std::string& childUuid);
    bool upsertComponent(const WrapperComponent& component);
    bool removeComponent(const std::string& componentId);
    bool createInstance(const WrapperInstance& instance, const std::vector<WrapperInstanceMember>& members);
    bool updateInstance(const WrapperInstance& instance);
    bool deleteInstance(const std::string& instanceUuid);
    bool markInstanceNeedsRepair(const std::string& instanceUuid, bool needsRepair);
    bool replaceSourceMemberElement(const std::string& assemblyUuid, const std::string& componentId, const std::string& elementGuid);
    bool replaceInstanceMemberElement(const std::string& instanceUuid, const std::string& componentId, const std::string& elementGuid);
    bool upsertPlacementBinding(const PlacementBinding& binding);
    bool removePlacementBinding(const std::string& placementId, const std::string& componentId);
    bool replacePlacementBindingElement(const std::string& placementId, const std::string& componentId, const std::string& elementGuid);

    std::optional<Assembly> getAssemblyByUuid(const std::string& assemblyUuid) const;
    std::optional<Assembly> getAssemblyByElementGuid(const std::string& elementGuid) const;
    std::optional<WrapperComponent> getComponent(const std::string& componentId) const;
    std::optional<WrapperComponent> getComponentBySourceElementGuid(const std::string& elementGuid) const;
    std::optional<WrapperInstance> getInstance(const std::string& instanceUuid) const;
    std::optional<WrapperInstance> getInstanceByMemberElementGuid(const std::string& elementGuid) const;
    std::optional<PlacementBinding> getPlacementBinding(const std::string& placementId, const std::string& componentId) const;
    std::optional<PlacementBinding> getPlacementBindingByElementGuid(const std::string& elementGuid) const;
    std::vector<Assembly> listAssemblies() const;
    std::vector<WrapperComponent> listComponents(const std::string& sourceAssemblyUuid) const;
    std::vector<WrapperInstance> listInstances(const std::string& sourceAssemblyUuid) const;
    std::vector<WrapperInstanceMember> listInstanceMembers(const std::string& instanceUuid) const;
    std::vector<WrapperComponent> listAllComponents() const;
    std::vector<WrapperInstance> listAllInstances() const;
    std::vector<WrapperInstanceMember> listAllInstanceMembers() const;
    std::vector<PlacementBinding> listPlacementBindings() const;
    std::vector<PlacementBinding> listPlacementBindings(const std::string& placementId) const;
    std::optional<std::string> getParentWrapper(const std::string& childUuid) const;
    std::vector<Assembly> listChildWrappers(const std::string& parentUuid) const;
    std::vector<Assembly> listDescendantWrappers(const std::string& rootUuid) const;
    std::vector<AssemblyMember> resolveEffectiveMembers(const std::string& rootUuid) const;
    std::vector<AssemblyRelationship> listRelationships() const;
    bool containsAssembly(const std::string& assemblyUuid) const;
    static std::string sourcePlacementIdFor(const std::string& assemblyUuid);
    void clear();

private:
    static std::string placementBindingKey(const std::string& placementId, const std::string& componentId);

    std::unordered_map<std::string, Assembly> assembliesByUuid_;
    std::unordered_map<std::string, std::string> assemblyUuidByElementGuid_;
    std::unordered_map<std::string, WrapperComponent> componentsById_;
    std::unordered_map<std::string, std::string> componentIdBySourceElementGuid_;
    std::unordered_map<std::string, WrapperInstance> instancesByUuid_;
    std::unordered_map<std::string, std::vector<WrapperInstanceMember>> instanceMembersByInstanceUuid_;
    std::unordered_map<std::string, std::string> instanceUuidByMemberElementGuid_;
    std::unordered_map<std::string, PlacementBinding> placementBindingsByKey_;
    std::unordered_map<std::string, std::string> placementBindingKeyByElementGuid_;
    AssemblyGraph graph_;
    std::unordered_map<std::string, AssemblyRelationship> relationshipsByChildUuid_;
};

} // namespace buildsync
