#include "core/AssemblyValidator.hpp"

#include <unordered_map>
#include <utility>

namespace buildsync {

ValidationResult AssemblyValidator::validateAssembly(
    const Assembly& assembly,
    const std::unordered_set<std::string>& liveElementGuids,
    const std::unordered_map<std::string, ElementAssemblyProperties>& propertiesByElementGuid)
{
    ValidationResult result;
    if (assembly.members.empty()) {
        addIssue(result, {"EMPTY_ASSEMBLY", "error", "Assembly has no registered members.", assembly.assemblyUuid, ""});
    }

    int liveMembers = 0;
    for (const auto& member : assembly.members) {
        if (liveElementGuids.count(member.elementGuid) == 0) {
            addIssue(result, {"MISSING_MEMBER", "warning", "Stored member no longer exists.", assembly.assemblyUuid, member.elementGuid});
            continue;
        }
        ++liveMembers;
        const auto prop = propertiesByElementGuid.find(member.elementGuid);
        if (prop == propertiesByElementGuid.end() || prop->second.assemblyUuid != assembly.assemblyUuid || prop->second.assemblyId != assembly.assemblyId) {
            addIssue(result, {"PROPERTY_MISMATCH", "warning", "Element BuildSync properties do not match registry.", assembly.assemblyUuid, member.elementGuid});
        }
    }

    if (assembly.members.size() > 0 && liveMembers == 0) {
        addIssue(result, {"EMPTY_ASSEMBLY", "error", "Assembly has zero live members.", assembly.assemblyUuid, ""});
    }

    finalizeStatus(result);
    return result;
}

ValidationResult AssemblyValidator::validateAllAssemblies(
    const AssemblyRegistry& registry,
    const std::unordered_set<std::string>& liveElementGuids,
    const std::unordered_map<std::string, ElementAssemblyProperties>& propertiesByElementGuid)
{
    ValidationResult result;
    std::unordered_map<std::string, int> propertyCountByAssemblyUuid;

    for (const auto& assembly : registry.listAssemblies()) {
        ValidationResult assemblyResult = validateAssembly(assembly, liveElementGuids, propertiesByElementGuid);
        for (const auto& issue : assemblyResult.issues) {
            addIssue(result, issue);
        }
    }

    for (const auto& [elementGuid, props] : propertiesByElementGuid) {
        if (props.assemblyUuid.empty()) {
            continue;
        }
        ++propertyCountByAssemblyUuid[props.assemblyUuid];
        if (!registry.containsAssembly(props.assemblyUuid)) {
            addIssue(result, {"ORPHANED_ELEMENT", "warning", "Element has BuildSync assembly properties but no registry record.", props.assemblyUuid, elementGuid});
            continue;
        }
        auto registered = registry.getAssemblyByElementGuid(elementGuid);
        if (!registered || registered->assemblyUuid != props.assemblyUuid) {
            addIssue(result, {"DUPLICATE_ASSEMBLY_UUID", "error", "Live element claims an assembly UUID outside the registered member set.", props.assemblyUuid, elementGuid});
        }
    }

    finalizeStatus(result);
    return result;
}

void AssemblyValidator::addIssue(ValidationResult& result, ValidationIssue issue)
{
    result.issues.push_back(std::move(issue));
}

void AssemblyValidator::finalizeStatus(ValidationResult& result)
{
    result.status = "ok";
    for (const auto& issue : result.issues) {
        if (issue.severity == "error") {
            result.status = "error";
            return;
        }
        if (issue.severity == "warning") {
            result.status = "warning";
        }
    }
}

} // namespace buildsync
