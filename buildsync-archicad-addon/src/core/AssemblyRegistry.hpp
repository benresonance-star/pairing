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

    std::optional<Assembly> getAssemblyByUuid(const std::string& assemblyUuid) const;
    std::optional<Assembly> getAssemblyByElementGuid(const std::string& elementGuid) const;
    std::vector<Assembly> listAssemblies() const;
    std::optional<std::string> getParentWrapper(const std::string& childUuid) const;
    std::vector<Assembly> listChildWrappers(const std::string& parentUuid) const;
    std::vector<Assembly> listDescendantWrappers(const std::string& rootUuid) const;
    std::vector<AssemblyMember> resolveEffectiveMembers(const std::string& rootUuid) const;
    std::vector<AssemblyRelationship> listRelationships() const;
    bool containsAssembly(const std::string& assemblyUuid) const;
    void clear();

private:
    std::unordered_map<std::string, Assembly> assembliesByUuid_;
    std::unordered_map<std::string, std::string> assemblyUuidByElementGuid_;
    AssemblyGraph graph_;
    std::unordered_map<std::string, AssemblyRelationship> relationshipsByChildUuid_;
};

} // namespace buildsync
