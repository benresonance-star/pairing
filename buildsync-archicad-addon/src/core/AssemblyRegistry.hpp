#pragma once

#include "core/Assembly.hpp"

#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

namespace buildsync {

class AssemblyRegistry {
public:
    bool createAssembly(const Assembly& assembly);
    bool addMembers(const std::string& assemblyUuid, const std::vector<AssemblyMember>& members);
    bool removeMembers(const std::string& assemblyUuid, const std::vector<std::string>& elementGuids);
    bool renameAssembly(const std::string& assemblyUuid, const std::string& assemblyId, const std::string& name);
    bool incrementVersion(const std::string& assemblyUuid);

    std::optional<Assembly> getAssemblyByUuid(const std::string& assemblyUuid) const;
    std::optional<Assembly> getAssemblyByElementGuid(const std::string& elementGuid) const;
    std::vector<Assembly> listAssemblies() const;
    bool containsAssembly(const std::string& assemblyUuid) const;

private:
    std::unordered_map<std::string, Assembly> assembliesByUuid_;
    std::unordered_map<std::string, std::string> assemblyUuidByElementGuid_;
};

} // namespace buildsync
