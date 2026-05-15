#pragma once

#include "archicad_adapter/ArchicadTypes.hpp"
#include "sync/PythonListenerClient.hpp"

#include <string>
#include <vector>

namespace buildsync {

class ArchicadSelectionReader final : public SelectionReader {
public:
    std::vector<SelectedElement> readSelection() const override;
};

class ArchicadElementPropertyWriter final : public ElementPropertyWriter {
public:
    bool ensureBuildSyncProperties() override;
    bool writeAssemblyProperties(const std::string& elementGuid, const BuildSyncProperties& properties) override;
    bool clearAssemblyProperties(const std::string& elementGuid) override;
    std::string describeBuildSyncProperties(const std::string& elementGuid) const override;
    std::string lastDiagnostic() const override;

private:
    mutable std::string lastDiagnostic_;
};

class ArchicadElementExistenceChecker final : public ElementExistenceChecker {
public:
    bool exists(const std::string& elementGuid) const override;
};

class ArchicadElementMetadataReader final : public ElementMetadataReader {
public:
    ElementMetadata readElementMetadata(const std::string& elementGuid) const override;
};

class ArchicadHighlightController final : public HighlightController {
public:
    bool selectElements(const std::vector<std::string>& elementGuids) override;
};

class ArchicadInstanceElementOperator final : public InstanceElementOperator {
public:
    bool supportsElementType(const std::string& elementType) const override;
    std::vector<std::string> supportedElementTypes() const override;
    std::vector<ElementSnapshot> snapshotElements(const std::vector<SelectedElement>& elements) const override;
    std::vector<ElementDuplicateResult> duplicateElements(
        const std::vector<ElementDuplicateRequest>& requests,
        const PlanPlacement& placement) override;
    bool updateElementFromSnapshot(
        const std::string& elementGuid,
        const ElementSnapshot& snapshot,
        const ElementSnapshot& editedBaseline,
        const ElementSnapshot& targetBaseline,
        std::string* replacementElementGuid = nullptr) override;
    bool deleteElements(const std::vector<std::string>& elementGuids) override;
    std::string groupElements(const std::vector<std::string>& elementGuids) override;
    bool ungroupElements(const std::string& nativeGroupId, const std::vector<std::string>& elementGuids) override;
    std::string lastDiagnostic() const override;

private:
    mutable std::string lastDiagnostic_{"Instance element operations require Archicad SDK implementation."};
};

class LocalPythonListenerClient final : public PythonListenerClient {
public:
    explicit LocalPythonListenerClient(std::string listenerBaseUrl = "http://127.0.0.1:8765");

    bool healthCheck() override;
    bool postEvent(const SyncEvent& event, std::string& errorMessage) override;

private:
    std::string listenerBaseUrl_;
};

} // namespace buildsync
