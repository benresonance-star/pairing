#include "core/AssemblyRegistry.hpp"

#include <algorithm>
#include <utility>

namespace buildsync {

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
    for (const auto& member : found->second.members) {
        assemblyUuidByElementGuid_.erase(member.elementGuid);
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

std::vector<Assembly> AssemblyRegistry::listAssemblies() const
{
    std::vector<Assembly> assemblies;
    assemblies.reserve(assembliesByUuid_.size());
    for (const auto& item : assembliesByUuid_) {
        assemblies.push_back(item.second);
    }
    return assemblies;
}

bool AssemblyRegistry::containsAssembly(const std::string& assemblyUuid) const
{
    return assembliesByUuid_.count(assemblyUuid) > 0;
}

void AssemblyRegistry::clear()
{
    assembliesByUuid_.clear();
    assemblyUuidByElementGuid_.clear();
}

} // namespace buildsync
