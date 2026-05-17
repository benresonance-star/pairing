#include "core/AssemblyRegistry.hpp"

#include <algorithm>
#include <utility>

namespace buildsync {

std::string AssemblyRegistry::sourcePlacementIdFor(const std::string& assemblyUuid)
{
    return "source:" + assemblyUuid;
}

std::string AssemblyRegistry::placementBindingKey(const std::string& placementId, const std::string& componentId)
{
    return placementId + "|" + componentId;
}

bool AssemblyRegistry::createAssembly(const Assembly& assembly)
{
    if (assembly.assemblyUuid.empty() || assembliesByUuid_.count(assembly.assemblyUuid) > 0) {
        return false;
    }
    for (const auto& member : assembly.members) {
        if (member.elementGuid.empty() || assemblyUuidByElementGuid_.count(member.elementGuid) > 0) {
            return false;
        }
    }

    Assembly stored = assembly;
    for (auto& member : stored.members) {
        member.assemblyUuid = stored.assemblyUuid;
        assemblyUuidByElementGuid_[member.elementGuid] = stored.assemblyUuid;
    }
    assembliesByUuid_[stored.assemblyUuid] = stored;
    return true;
}

bool AssemblyRegistry::deleteAssembly(const std::string& assemblyUuid)
{
    const auto found = assembliesByUuid_.find(assemblyUuid);
    if (found == assembliesByUuid_.end()) {
        return false;
    }
    for (const auto& child : graph_.getChildren(assemblyUuid)) {
        graph_.removeRelationship(assemblyUuid, child);
        relationshipsByChildUuid_.erase(child);
    }
    const auto parent = graph_.getParent(assemblyUuid);
    if (parent) {
        graph_.removeRelationship(*parent, assemblyUuid);
        relationshipsByChildUuid_.erase(assemblyUuid);
    }
    for (const auto& member : found->second.members) {
        assemblyUuidByElementGuid_.erase(member.elementGuid);
        placementBindingKeyByElementGuid_.erase(member.elementGuid);
        const auto component = componentIdBySourceElementGuid_.find(member.elementGuid);
        if (component != componentIdBySourceElementGuid_.end()) {
            placementBindingsByKey_.erase(placementBindingKey(sourcePlacementIdFor(assemblyUuid), component->second));
            componentsById_.erase(component->second);
            componentIdBySourceElementGuid_.erase(component);
        }
    }
    for (const auto& instance : listInstances(assemblyUuid)) {
        deleteInstance(instance.instanceUuid);
    }
    assembliesByUuid_.erase(found);
    return true;
}

bool AssemblyRegistry::updateAssembly(const Assembly& assembly)
{
    auto found = assembliesByUuid_.find(assembly.assemblyUuid);
    if (found == assembliesByUuid_.end()) {
        return false;
    }

    std::unordered_map<std::string, std::string> rebuiltIndex = assemblyUuidByElementGuid_;
    for (const auto& member : found->second.members) {
        rebuiltIndex.erase(member.elementGuid);
    }

    Assembly stored = assembly;
    for (auto& member : stored.members) {
        if (member.elementGuid.empty()) {
            return false;
        }
        const auto existing = rebuiltIndex.find(member.elementGuid);
        if (existing != rebuiltIndex.end() && existing->second != stored.assemblyUuid) {
            return false;
        }
        member.assemblyUuid = stored.assemblyUuid;
        rebuiltIndex[member.elementGuid] = stored.assemblyUuid;
    }

    found->second = stored;
    assemblyUuidByElementGuid_ = std::move(rebuiltIndex);
    return true;
}

bool AssemblyRegistry::addMembers(const std::string& assemblyUuid, const std::vector<AssemblyMember>& members)
{
    auto found = assembliesByUuid_.find(assemblyUuid);
    if (found == assembliesByUuid_.end()) {
        return false;
    }
    for (const auto& member : members) {
        if (member.elementGuid.empty()) {
            return false;
        }
        const auto existing = assemblyUuidByElementGuid_.find(member.elementGuid);
        if (existing != assemblyUuidByElementGuid_.end() && existing->second != assemblyUuid) {
            return false;
        }
    }

    auto& assembly = found->second;
    for (auto member : members) {
        const bool alreadyPresent = std::any_of(assembly.members.begin(), assembly.members.end(), [&](const AssemblyMember& item) {
            return item.elementGuid == member.elementGuid;
        });
        if (alreadyPresent) {
            continue;
        }
        member.assemblyUuid = assemblyUuid;
        assembly.members.push_back(member);
        assemblyUuidByElementGuid_[member.elementGuid] = assemblyUuid;
    }
    return true;
}

bool AssemblyRegistry::removeMembers(const std::string& assemblyUuid, const std::vector<std::string>& elementGuids)
{
    auto found = assembliesByUuid_.find(assemblyUuid);
    if (found == assembliesByUuid_.end()) {
        return false;
    }

    auto& members = found->second.members;
    for (const auto& guid : elementGuids) {
        assemblyUuidByElementGuid_.erase(guid);
        const auto component = componentIdBySourceElementGuid_.find(guid);
        if (component != componentIdBySourceElementGuid_.end()) {
            removeComponent(component->second);
        }
        placementBindingKeyByElementGuid_.erase(guid);
        members.erase(
            std::remove_if(members.begin(), members.end(), [&](const AssemblyMember& member) {
                return member.elementGuid == guid;
            }),
            members.end());
    }
    return true;
}

bool AssemblyRegistry::renameAssembly(const std::string& assemblyUuid, const std::string& assemblyId, const std::string& name)
{
    auto found = assembliesByUuid_.find(assemblyUuid);
    if (found == assembliesByUuid_.end()) {
        return false;
    }
    found->second.assemblyId = assemblyId;
    found->second.name = name;
    return true;
}

bool AssemblyRegistry::incrementVersion(const std::string& assemblyUuid)
{
    auto found = assembliesByUuid_.find(assemblyUuid);
    if (found == assembliesByUuid_.end()) {
        return false;
    }
    ++found->second.version;
    return true;
}

bool AssemblyRegistry::addChildWrapper(const std::string& parentUuid, const std::string& childUuid, const std::string& relationshipType)
{
    if (!containsAssembly(parentUuid) || !containsAssembly(childUuid)) {
        return false;
    }
    if (!graph_.addRelationship(parentUuid, childUuid, relationshipType)) {
        return false;
    }
    relationshipsByChildUuid_[childUuid] = {parentUuid, childUuid, relationshipType.empty() ? "contains" : relationshipType, 0, "active"};
    return true;
}

bool AssemblyRegistry::removeChildWrapper(const std::string& parentUuid, const std::string& childUuid)
{
    graph_.removeRelationship(parentUuid, childUuid);
    relationshipsByChildUuid_.erase(childUuid);
    return true;
}

bool AssemblyRegistry::upsertComponent(const WrapperComponent& component)
{
    if (component.componentId.empty() || component.sourceAssemblyUuid.empty() || !containsAssembly(component.sourceAssemblyUuid)) {
        return false;
    }
    if (!component.sourceElementGuid.empty()) {
        const auto existing = componentIdBySourceElementGuid_.find(component.sourceElementGuid);
        if (existing != componentIdBySourceElementGuid_.end() && existing->second != component.componentId) {
            return false;
        }
    }
    const auto previous = componentsById_.find(component.componentId);
    if (previous != componentsById_.end() && previous->second.sourceElementGuid != component.sourceElementGuid) {
        componentIdBySourceElementGuid_.erase(previous->second.sourceElementGuid);
    }
    componentsById_[component.componentId] = component;
    if (!component.sourceElementGuid.empty()) {
        componentIdBySourceElementGuid_[component.sourceElementGuid] = component.componentId;
        upsertPlacementBinding({
            sourcePlacementIdFor(component.sourceAssemblyUuid),
            component.componentId,
            component.sourceElementGuid,
            component.elementType,
            0.0,
            0.0,
            false,
            component.status.empty() ? "active" : component.status,
        });
    }
    return true;
}

bool AssemblyRegistry::removeComponent(const std::string& componentId)
{
    const auto found = componentsById_.find(componentId);
    if (found == componentsById_.end()) {
        return false;
    }
    componentIdBySourceElementGuid_.erase(found->second.sourceElementGuid);
    removePlacementBinding(sourcePlacementIdFor(found->second.sourceAssemblyUuid), componentId);
    componentsById_.erase(found);
    for (auto& item : instanceMembersByInstanceUuid_) {
        auto& members = item.second;
        members.erase(
            std::remove_if(members.begin(), members.end(), [&](const WrapperInstanceMember& member) {
                if (member.componentId == componentId) {
                    instanceUuidByMemberElementGuid_.erase(member.elementGuid);
                    return true;
                }
                return false;
            }),
            members.end());
    }
    return true;
}

bool AssemblyRegistry::createInstance(const WrapperInstance& instance, const std::vector<WrapperInstanceMember>& members)
{
    if (instance.instanceUuid.empty() || instance.sourceAssemblyUuid.empty() || !containsAssembly(instance.sourceAssemblyUuid) ||
        instancesByUuid_.count(instance.instanceUuid) > 0) {
        return false;
    }
    for (const auto& member : members) {
        if (member.instanceUuid != instance.instanceUuid || member.componentId.empty() || member.elementGuid.empty() ||
            componentsById_.count(member.componentId) == 0 || instanceUuidByMemberElementGuid_.count(member.elementGuid) > 0) {
            return false;
        }
    }
    instancesByUuid_[instance.instanceUuid] = instance;
    instanceMembersByInstanceUuid_[instance.instanceUuid] = members;
    for (const auto& member : members) {
        instanceUuidByMemberElementGuid_[member.elementGuid] = instance.instanceUuid;
        upsertPlacementBinding({
            instance.instanceUuid,
            member.componentId,
            member.elementGuid,
            member.elementType,
            0.0,
            0.0,
            false,
            member.status.empty() ? "active" : member.status,
        });
    }
    return true;
}

bool AssemblyRegistry::updateInstance(const WrapperInstance& instance)
{
    const auto found = instancesByUuid_.find(instance.instanceUuid);
    if (found == instancesByUuid_.end() || !containsAssembly(instance.sourceAssemblyUuid)) {
        return false;
    }
    found->second = instance;
    return true;
}

bool AssemblyRegistry::deleteInstance(const std::string& instanceUuid)
{
    const auto found = instancesByUuid_.find(instanceUuid);
    if (found == instancesByUuid_.end()) {
        return false;
    }
    const auto members = instanceMembersByInstanceUuid_.find(instanceUuid);
    if (members != instanceMembersByInstanceUuid_.end()) {
        for (const auto& member : members->second) {
            instanceUuidByMemberElementGuid_.erase(member.elementGuid);
            placementBindingKeyByElementGuid_.erase(member.elementGuid);
            placementBindingsByKey_.erase(placementBindingKey(instanceUuid, member.componentId));
        }
        instanceMembersByInstanceUuid_.erase(members);
    }
    instancesByUuid_.erase(found);
    return true;
}

bool AssemblyRegistry::markInstanceNeedsRepair(const std::string& instanceUuid, bool needsRepair)
{
    auto found = instancesByUuid_.find(instanceUuid);
    if (found == instancesByUuid_.end()) {
        return false;
    }
    found->second.needsRepair = needsRepair;
    return true;
}

bool AssemblyRegistry::replaceSourceMemberElement(const std::string& assemblyUuid, const std::string& componentId, const std::string& elementGuid)
{
    auto assembly = assembliesByUuid_.find(assemblyUuid);
    auto component = componentsById_.find(componentId);
    if (assembly == assembliesByUuid_.end() || component == componentsById_.end() || elementGuid.empty()) {
        return false;
    }
    if (component->second.sourceAssemblyUuid != assemblyUuid) {
        return false;
    }
    if (assemblyUuidByElementGuid_.count(elementGuid) > 0 || componentIdBySourceElementGuid_.count(elementGuid) > 0) {
        return false;
    }

    const std::string oldGuid = component->second.sourceElementGuid;
    bool replacedMember = false;
    for (auto& member : assembly->second.members) {
        if (member.elementGuid == oldGuid) {
            assemblyUuidByElementGuid_.erase(member.elementGuid);
            member.elementGuid = elementGuid;
            assemblyUuidByElementGuid_[elementGuid] = assemblyUuid;
            replacedMember = true;
            break;
        }
    }
    if (!replacedMember) {
        return false;
    }

    componentIdBySourceElementGuid_.erase(oldGuid);
    component->second.sourceElementGuid = elementGuid;
    componentIdBySourceElementGuid_[elementGuid] = componentId;
    replacePlacementBindingElement(sourcePlacementIdFor(assemblyUuid), componentId, elementGuid);
    return true;
}

bool AssemblyRegistry::replaceInstanceMemberElement(const std::string& instanceUuid, const std::string& componentId, const std::string& elementGuid)
{
    auto found = instanceMembersByInstanceUuid_.find(instanceUuid);
    if (found == instanceMembersByInstanceUuid_.end() || elementGuid.empty()) {
        return false;
    }
    if (instanceUuidByMemberElementGuid_.count(elementGuid) > 0) {
        return false;
    }
    for (auto& member : found->second) {
        if (member.componentId == componentId) {
            instanceUuidByMemberElementGuid_.erase(member.elementGuid);
            member.elementGuid = elementGuid;
            instanceUuidByMemberElementGuid_[elementGuid] = instanceUuid;
            replacePlacementBindingElement(instanceUuid, componentId, elementGuid);
            return true;
        }
    }
    return false;
}

bool AssemblyRegistry::upsertPlacementBinding(const PlacementBinding& binding)
{
    if (binding.placementId.empty() || binding.componentId.empty() || binding.elementGuid.empty()) {
        return false;
    }
    if (componentsById_.count(binding.componentId) == 0) {
        return false;
    }
    const std::string key = placementBindingKey(binding.placementId, binding.componentId);
    const auto existingGuid = placementBindingKeyByElementGuid_.find(binding.elementGuid);
    if (existingGuid != placementBindingKeyByElementGuid_.end() && existingGuid->second != key) {
        return false;
    }
    const auto previous = placementBindingsByKey_.find(key);
    if (previous != placementBindingsByKey_.end() && previous->second.elementGuid != binding.elementGuid) {
        placementBindingKeyByElementGuid_.erase(previous->second.elementGuid);
    }
    placementBindingsByKey_[key] = binding;
    placementBindingKeyByElementGuid_[binding.elementGuid] = key;
    return true;
}

bool AssemblyRegistry::removePlacementBinding(const std::string& placementId, const std::string& componentId)
{
    const std::string key = placementBindingKey(placementId, componentId);
    const auto found = placementBindingsByKey_.find(key);
    if (found == placementBindingsByKey_.end()) {
        return false;
    }
    placementBindingKeyByElementGuid_.erase(found->second.elementGuid);
    placementBindingsByKey_.erase(found);
    return true;
}

bool AssemblyRegistry::replacePlacementBindingElement(const std::string& placementId, const std::string& componentId, const std::string& elementGuid)
{
    if (elementGuid.empty()) {
        return false;
    }
    const std::string key = placementBindingKey(placementId, componentId);
    auto found = placementBindingsByKey_.find(key);
    if (found == placementBindingsByKey_.end()) {
        const auto component = componentsById_.find(componentId);
        if (component == componentsById_.end()) {
            return false;
        }
        return upsertPlacementBinding({placementId, componentId, elementGuid, component->second.elementType, 0.0, 0.0, false, "active"});
    }
    const auto existingGuid = placementBindingKeyByElementGuid_.find(elementGuid);
    if (existingGuid != placementBindingKeyByElementGuid_.end() && existingGuid->second != key) {
        return false;
    }
    placementBindingKeyByElementGuid_.erase(found->second.elementGuid);
    found->second.elementGuid = elementGuid;
    found->second.health = "active";
    placementBindingKeyByElementGuid_[elementGuid] = key;
    return true;
}

std::optional<Assembly> AssemblyRegistry::getAssemblyByUuid(const std::string& assemblyUuid) const
{
    const auto found = assembliesByUuid_.find(assemblyUuid);
    if (found == assembliesByUuid_.end()) {
        return std::nullopt;
    }
    return found->second;
}

std::optional<Assembly> AssemblyRegistry::getAssemblyByElementGuid(const std::string& elementGuid) const
{
    const auto index = assemblyUuidByElementGuid_.find(elementGuid);
    if (index == assemblyUuidByElementGuid_.end()) {
        return std::nullopt;
    }
    return getAssemblyByUuid(index->second);
}

std::optional<WrapperComponent> AssemblyRegistry::getComponent(const std::string& componentId) const
{
    const auto found = componentsById_.find(componentId);
    if (found == componentsById_.end()) {
        return std::nullopt;
    }
    return found->second;
}

std::optional<WrapperComponent> AssemblyRegistry::getComponentBySourceElementGuid(const std::string& elementGuid) const
{
    const auto index = componentIdBySourceElementGuid_.find(elementGuid);
    if (index == componentIdBySourceElementGuid_.end()) {
        return std::nullopt;
    }
    return getComponent(index->second);
}

std::optional<WrapperInstance> AssemblyRegistry::getInstance(const std::string& instanceUuid) const
{
    const auto found = instancesByUuid_.find(instanceUuid);
    if (found == instancesByUuid_.end()) {
        return std::nullopt;
    }
    return found->second;
}

std::optional<WrapperInstance> AssemblyRegistry::getInstanceByMemberElementGuid(const std::string& elementGuid) const
{
    const auto index = instanceUuidByMemberElementGuid_.find(elementGuid);
    if (index == instanceUuidByMemberElementGuid_.end()) {
        return std::nullopt;
    }
    return getInstance(index->second);
}

std::optional<PlacementBinding> AssemblyRegistry::getPlacementBinding(const std::string& placementId, const std::string& componentId) const
{
    const auto found = placementBindingsByKey_.find(placementBindingKey(placementId, componentId));
    if (found == placementBindingsByKey_.end()) {
        return std::nullopt;
    }
    return found->second;
}

std::optional<PlacementBinding> AssemblyRegistry::getPlacementBindingByElementGuid(const std::string& elementGuid) const
{
    const auto index = placementBindingKeyByElementGuid_.find(elementGuid);
    if (index == placementBindingKeyByElementGuid_.end()) {
        return std::nullopt;
    }
    const auto found = placementBindingsByKey_.find(index->second);
    if (found == placementBindingsByKey_.end()) {
        return std::nullopt;
    }
    return found->second;
}

std::vector<Assembly> AssemblyRegistry::listAssemblies() const
{
    std::vector<Assembly> assemblies;
    assemblies.reserve(assembliesByUuid_.size());
    for (const auto& item : assembliesByUuid_) {
        assemblies.push_back(item.second);
    }
    return assemblies;
}

std::vector<WrapperComponent> AssemblyRegistry::listComponents(const std::string& sourceAssemblyUuid) const
{
    std::vector<WrapperComponent> components;
    for (const auto& item : componentsById_) {
        if (item.second.sourceAssemblyUuid == sourceAssemblyUuid) {
            components.push_back(item.second);
        }
    }
    return components;
}

std::vector<WrapperInstance> AssemblyRegistry::listInstances(const std::string& sourceAssemblyUuid) const
{
    std::vector<WrapperInstance> instances;
    for (const auto& item : instancesByUuid_) {
        if (item.second.sourceAssemblyUuid == sourceAssemblyUuid) {
            instances.push_back(item.second);
        }
    }
    return instances;
}

std::vector<WrapperInstanceMember> AssemblyRegistry::listInstanceMembers(const std::string& instanceUuid) const
{
    const auto found = instanceMembersByInstanceUuid_.find(instanceUuid);
    if (found == instanceMembersByInstanceUuid_.end()) {
        return {};
    }
    return found->second;
}

std::vector<WrapperComponent> AssemblyRegistry::listAllComponents() const
{
    std::vector<WrapperComponent> components;
    components.reserve(componentsById_.size());
    for (const auto& item : componentsById_) {
        components.push_back(item.second);
    }
    return components;
}

std::vector<WrapperInstance> AssemblyRegistry::listAllInstances() const
{
    std::vector<WrapperInstance> instances;
    instances.reserve(instancesByUuid_.size());
    for (const auto& item : instancesByUuid_) {
        instances.push_back(item.second);
    }
    return instances;
}

std::vector<WrapperInstanceMember> AssemblyRegistry::listAllInstanceMembers() const
{
    std::vector<WrapperInstanceMember> members;
    for (const auto& item : instanceMembersByInstanceUuid_) {
        members.insert(members.end(), item.second.begin(), item.second.end());
    }
    return members;
}

std::vector<PlacementBinding> AssemblyRegistry::listPlacementBindings() const
{
    std::vector<PlacementBinding> bindings;
    bindings.reserve(placementBindingsByKey_.size());
    for (const auto& item : placementBindingsByKey_) {
        bindings.push_back(item.second);
    }
    return bindings;
}

std::vector<PlacementBinding> AssemblyRegistry::listPlacementBindings(const std::string& placementId) const
{
    std::vector<PlacementBinding> bindings;
    for (const auto& item : placementBindingsByKey_) {
        if (item.second.placementId == placementId) {
            bindings.push_back(item.second);
        }
    }
    return bindings;
}

std::optional<std::string> AssemblyRegistry::getParentWrapper(const std::string& childUuid) const
{
    return graph_.getParent(childUuid);
}

std::vector<Assembly> AssemblyRegistry::listChildWrappers(const std::string& parentUuid) const
{
    std::vector<Assembly> children;
    for (const auto& childUuid : graph_.getChildren(parentUuid)) {
        const auto child = getAssemblyByUuid(childUuid);
        if (child) {
            children.push_back(*child);
        }
    }
    return children;
}

std::vector<Assembly> AssemblyRegistry::listDescendantWrappers(const std::string& rootUuid) const
{
    std::vector<Assembly> descendants;
    for (const auto& childUuid : graph_.getDescendants(rootUuid)) {
        const auto child = getAssemblyByUuid(childUuid);
        if (child) {
            descendants.push_back(*child);
        }
    }
    return descendants;
}

std::vector<AssemblyMember> AssemblyRegistry::resolveEffectiveMembers(const std::string& rootUuid) const
{
    std::vector<AssemblyMember> members;
    const auto root = getAssemblyByUuid(rootUuid);
    if (!root) {
        return members;
    }
    members.insert(members.end(), root->members.begin(), root->members.end());
    for (const auto& child : listDescendantWrappers(rootUuid)) {
        members.insert(members.end(), child.members.begin(), child.members.end());
    }
    return members;
}

std::vector<AssemblyRelationship> AssemblyRegistry::listRelationships() const
{
    std::vector<AssemblyRelationship> relationships;
    relationships.reserve(relationshipsByChildUuid_.size());
    for (const auto& item : relationshipsByChildUuid_) {
        relationships.push_back(item.second);
    }
    return relationships;
}

bool AssemblyRegistry::containsAssembly(const std::string& assemblyUuid) const
{
    return assembliesByUuid_.count(assemblyUuid) > 0;
}

void AssemblyRegistry::clear()
{
    assembliesByUuid_.clear();
    assemblyUuidByElementGuid_.clear();
    componentsById_.clear();
    componentIdBySourceElementGuid_.clear();
    instancesByUuid_.clear();
    instanceMembersByInstanceUuid_.clear();
    instanceUuidByMemberElementGuid_.clear();
    placementBindingsByKey_.clear();
    placementBindingKeyByElementGuid_.clear();
    graph_.clear();
    relationshipsByChildUuid_.clear();
}

} // namespace buildsync
