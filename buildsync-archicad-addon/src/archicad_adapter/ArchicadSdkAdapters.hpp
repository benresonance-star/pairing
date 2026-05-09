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
};

class ArchicadElementExistenceChecker final : public ElementExistenceChecker {
public:
    bool exists(const std::string& elementGuid) const override;
};

class ArchicadHighlightController final : public HighlightController {
public:
    bool selectElements(const std::vector<std::string>& elementGuids) override;
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
