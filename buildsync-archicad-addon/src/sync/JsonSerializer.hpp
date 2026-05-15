#pragma once

#include "core/Assembly.hpp"
#include "core/AssemblyValidator.hpp"

#include <string>
#include <vector>

namespace buildsync {

class JsonSerializer {
public:
    static std::string assemblyCreated(const std::string& projectId, const Assembly& assembly);
    static std::string assemblyUpdated(
        const std::string& projectId,
        const Assembly& assembly,
        const std::vector<AssemblyMember>& membersAdded,
        const std::vector<AssemblyMember>& membersRemoved);
    static std::string assemblyValidated(const std::string& projectId, const Assembly& assembly, const ValidationResult& result);
    static std::string assemblyRelationshipUpdated(
        const std::string& projectId,
        const AssemblyRelationship& relationship,
        const std::vector<AssemblyRelationship>& relationshipsCurrent);

private:
    static std::string escape(const std::string& value);
    static std::string memberJson(const AssemblyMember& member);
    static std::string relationshipJson(const AssemblyRelationship& relationship);
    static std::string propertyJson(const AssemblyProperty& property);
    static std::string assemblyJson(const Assembly& assembly);
};

} // namespace buildsync
