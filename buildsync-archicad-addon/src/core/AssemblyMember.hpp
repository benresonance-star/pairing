#pragma once

#include <string>

namespace buildsync {

struct AssemblyMember {
    std::string assemblyUuid;
    std::string elementGuid;
    std::string elementType;
    std::string role;
    std::string status{"active"};
    std::string addedAt;
};

} // namespace buildsync
