#pragma once

#include "core/AssemblyRegistry.hpp"

namespace buildsync {

class RegistryStorage {
public:
    virtual ~RegistryStorage() = default;
    virtual bool load(AssemblyRegistry& registry) = 0;
    virtual bool save(const AssemblyRegistry& registry) = 0;
};

} // namespace buildsync
