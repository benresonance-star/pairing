#pragma once

#include "archicad_adapter/RegistryStorage.hpp"

#include <filesystem>

namespace buildsync {

class FileRegistryStorage : public RegistryStorage {
public:
    explicit FileRegistryStorage(std::filesystem::path registryPath);

    bool load(AssemblyRegistry& registry) override;
    bool save(const AssemblyRegistry& registry) override;

    const std::filesystem::path& registryPath() const;

private:
    std::filesystem::path registryPath_;
};

} // namespace buildsync
