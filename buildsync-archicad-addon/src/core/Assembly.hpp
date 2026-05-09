#pragma once

#include "core/AssemblyMember.hpp"

#include <string>
#include <vector>

namespace buildsync {

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
};

} // namespace buildsync
