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
    std::string sourceAssemblyUuid;
    std::string instanceUuid;
    std::string componentId;
    std::string placementId;
    std::string isSourcePlacement;
    std::string isInstance;
    std::string isMirror;
    std::string sourceIsCountable;
    std::string instanceNeedsRepair;
    std::string localOverridesAllowed;
    std::string instanceRole;
};

struct ElementSnapshot {
    std::string elementGuid;
    std::string elementType;
    std::string snapshotJson;
    double coordinateOriginX{0.0};
    double coordinateOriginY{0.0};
    double coordinateRotationDegrees{0.0};
    bool coordinateFrameValid{false};
    double frameOriginX{0.0};
    double frameOriginY{0.0};
    double frameRotationDegrees{0.0};
    bool frameValid{false};
    std::string topologySignature;
    std::vector<double> polygonCoords;
    double polygonFrameOriginX{0.0};
    double polygonFrameOriginY{0.0};
    double polygonFrameRotationDegrees{0.0};
    bool polygonFrameValid{false};
    double boundsCenterX{0.0};
    double boundsCenterY{0.0};
    double boundsCenterZ{0.0};
    bool boundsValid{false};
    std::vector<double> localPolygonCoords;
    std::string diagnosticContext;
};

struct SlabCandidate {
    ElementSnapshot snapshot;
    BuildSyncProperties buildSyncProperties;
    bool hasBuildSyncProperties{false};
};

struct ElementDuplicateRequest {
    std::string sourceElementGuid;
    std::string componentId;
    std::string elementType;
    std::string role;
};

struct ElementDuplicateResult {
    std::string sourceElementGuid;
    std::string componentId;
    std::string elementGuid;
    std::string elementType;
    std::string role;
};

struct PlanPlacement {
    double originX{0.0};
    double originY{0.0};
    double rotationDegrees{0.0};
    bool mirrored{false};
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

class InstanceElementOperator {
public:
    virtual ~InstanceElementOperator() = default;
    virtual bool supportsElementType(const std::string& elementType) const = 0;
    virtual std::vector<std::string> supportedElementTypes() const = 0;
    virtual std::vector<ElementSnapshot> snapshotElements(const std::vector<SelectedElement>& elements) const = 0;
    virtual std::vector<ElementDuplicateResult> duplicateElements(
        const std::vector<ElementDuplicateRequest>& requests,
        const PlanPlacement& placement) = 0;
    virtual bool updateElementFromSnapshot(
        const std::string& elementGuid,
        const ElementSnapshot& snapshot,
        const ElementSnapshot& editedBaseline,
        const ElementSnapshot& targetBaseline,
        std::string* replacementElementGuid = nullptr) = 0;
    virtual BuildSyncProperties readBuildSyncProperties(const std::string& elementGuid, bool* hasProperties = nullptr) const = 0;
    virtual std::vector<SlabCandidate> findSlabCandidatesNear(double centerX, double centerY, double maxDistance) const = 0;
    virtual std::vector<SlabCandidate> findBuildSyncSlabCandidates(const std::string& sourceAssemblyUuid) const = 0;
    virtual bool deleteElements(const std::vector<std::string>& elementGuids) = 0;
    virtual std::string groupElements(const std::vector<std::string>& elementGuids) = 0;
    virtual bool ungroupElements(const std::string& nativeGroupId, const std::vector<std::string>& elementGuids) = 0;
    virtual std::string lastDiagnostic() const = 0;
};

} // namespace buildsync
