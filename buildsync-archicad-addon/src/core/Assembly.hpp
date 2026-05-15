#pragma once

#include "core/AssemblyMember.hpp"

#include <string>
#include <vector>

namespace buildsync {

struct AssemblyProperty {
    std::string key;
    std::string value;
};

struct AssemblyRelationship {
    std::string parentAssemblyUuid;
    std::string childAssemblyUuid;
    std::string relationshipType{"contains"};
    int sortOrder{0};
    std::string status{"active"};
};

struct Assembly {
    std::string assemblyUuid;
    std::string assemblyId;
    std::string name;
    std::string type;
    std::string zone;
    std::string level;
    std::string trade;
    std::string taskId;
    int version{1};
    std::string status{"active"};
    std::string createdAt;
    std::string updatedAt;
    std::vector<AssemblyMember> members;
    std::vector<AssemblyProperty> customProperties;
};

} // namespace buildsync
