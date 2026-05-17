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

struct PlanTransform {
    double originX{0.0};
    double originY{0.0};
    double rotationDegrees{0.0};
    bool mirrored{false};
};

struct CoordinateSpaceFrame {
    double originX{0.0};
    double originY{0.0};
    double rotationDegrees{0.0};
    bool valid{false};
};

struct WrapperComponent {
    std::string componentId;
    std::string sourceAssemblyUuid;
    std::string sourceElementGuid;
    std::string elementType;
    std::string role;
    int sortOrder{0};
    CoordinateSpaceFrame localFrame;
    std::vector<double> localPolygonCoords;
    std::string snapshotJson;
    std::string status{"active"};
};

struct WrapperInstance {
    std::string instanceUuid;
    std::string sourceAssemblyUuid;
    std::string name;
    PlanTransform transform;
    CoordinateSpaceFrame sourceFrame;
    CoordinateSpaceFrame liveFrame;
    bool isMirrored{false};
    bool sourceIsCountable{true};
    bool localOverridesAllowed{false};
    bool needsRepair{false};
    std::string status{"active"};
    std::string nativeGroupId;
    std::string createdAt;
    std::string updatedAt;
};

struct WrapperInstanceMember {
    std::string instanceUuid;
    std::string componentId;
    std::string elementGuid;
    std::string elementType;
    std::string role;
    std::string status{"active"};
};

struct WrapperPlacement {
    std::string placementId;
    std::string sourceAssemblyUuid;
    std::string kind{"instance"};
    CoordinateSpaceFrame liveFrame;
    std::string status{"active"};
};

struct PlacementBinding {
    std::string placementId;
    std::string componentId;
    std::string elementGuid;
    std::string elementType;
    double lastBoundsCenterX{0.0};
    double lastBoundsCenterY{0.0};
    bool lastBoundsValid{false};
    std::string health{"unknown"};
};

struct WrapperEditBaseline {
    std::string componentId;
    std::string elementGuid;
    std::string instanceUuid;
    CoordinateSpaceFrame liveFrame;
    std::string snapshotJson;
};

struct WrapperEditSession {
    std::string sessionUuid;
    std::string sourceAssemblyUuid;
    std::string instanceUuid;
    int baselineAssemblyVersion{0};
    std::string status{"active"};
    std::vector<WrapperEditBaseline> baselines;
    CoordinateSpaceFrame sourcePlacementFrame;
    std::string editPlacementId;
    std::string editPlacementKind{"source"};
    CoordinateSpaceFrame editPlacementFrame;
};

} // namespace buildsync
