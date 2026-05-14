#pragma once

#include <string>
#include <vector>

namespace buildsync {

struct SelectedElement {
    std::string elementGuid;
    std::string elementType;
};

struct ElementMetadata {
    std::string elementGuid;
    std::string elementType;
    std::string elementId;
    std::string layerName;
    std::string status;
};

struct BuildSyncProperties {
    std::string assemblyId;
    std::string assemblyUuid;
    std::string assemblyName;
    std::string assemblyType;
    std::string assemblyRole;
    std::string assemblyVersion;
    std::string taskId;
    std::string trade;
    std::string status;
    std::string customProperties;
};

class SelectionReader {
public:
    virtual ~SelectionReader() = default;
    virtual std::vector<SelectedElement> readSelection() const = 0;
};

class ElementPropertyWriter {
public:
    virtual ~ElementPropertyWriter() = default;
    virtual bool ensureBuildSyncProperties() = 0;
    virtual bool writeAssemblyProperties(const std::string& elementGuid, const BuildSyncProperties& properties) = 0;
    virtual bool clearAssemblyProperties(const std::string& elementGuid) = 0;
    virtual std::string describeBuildSyncProperties(const std::string& elementGuid) const = 0;
    virtual std::string lastDiagnostic() const = 0;
};

class ElementExistenceChecker {
public:
    virtual ~ElementExistenceChecker() = default;
    virtual bool exists(const std::string& elementGuid) const = 0;
};

class ElementMetadataReader {
public:
    virtual ~ElementMetadataReader() = default;
    virtual ElementMetadata readElementMetadata(const std::string& elementGuid) const = 0;
};

class HighlightController {
public:
    virtual ~HighlightController() = default;
    virtual bool selectElements(const std::vector<std::string>& elementGuids) = 0;
};

} // namespace buildsync
