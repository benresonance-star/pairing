#pragma once

#include "core/Assembly.hpp"
#include "core/AssemblyRegistry.hpp"

#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace buildsync {

struct ElementAssemblyProperties {
    std::string assemblyUuid;
    std::string assemblyId;
    std::string assemblyName;
    std::string assemblyType;
    std::string assemblyRole;
    std::string assemblyVersion;
    std::string taskId;
    std::string trade;
    std::string status;
};

struct ValidationIssue {
    std::string code;
    std::string severity;
    std::string message;
    std::string assemblyUuid;
    std::string elementGuid;
};

struct ValidationResult {
    std::string status{"ok"};
    std::vector<ValidationIssue> issues;
};

class AssemblyValidator {
public:
    static ValidationResult validateAssembly(
        const Assembly& assembly,
        const std::unordered_set<std::string>& liveElementGuids,
        const std::unordered_map<std::string, ElementAssemblyProperties>& propertiesByElementGuid);

    static ValidationResult validateAllAssemblies(
        const AssemblyRegistry& registry,
        const std::unordered_set<std::string>& liveElementGuids,
        const std::unordered_map<std::string, ElementAssemblyProperties>& propertiesByElementGuid);

private:
    static void addIssue(ValidationResult& result, ValidationIssue issue);
    static void finalizeStatus(ValidationResult& result);
};

} // namespace buildsync
