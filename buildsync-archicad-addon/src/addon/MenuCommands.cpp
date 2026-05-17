#include "addon/MenuCommands.hpp"

#include "archicad_adapter/FileRegistryStorage.hpp"
#include "sync/JsonSerializer.hpp"

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <cmath>
#include <limits>
#include <sstream>
#include <unordered_map>
#include <unordered_set>
#include <utility>

namespace buildsync {
namespace {

std::string escapeJsonString(const std::string& value)
{
    std::ostringstream out;
    for (char ch : value) {
        if (ch == '\\' || ch == '"') {
            out << '\\';
        }
        if (ch == '\n') {
            out << "\\n";
        } else if (ch != '\r') {
            out << ch;
        }
    }
    return out.str();
}

std::string joinStrings(const std::vector<std::string>& values)
{
    std::ostringstream out;
    for (std::size_t index = 0; index < values.size(); ++index) {
        if (index > 0) {
            out << ",";
        }
        out << values[index];
    }
    return out.str();
}

std::string joinSet(const std::unordered_set<std::string>& values)
{
    std::vector<std::string> sorted(values.begin(), values.end());
    std::sort(sorted.begin(), sorted.end());
    return joinStrings(sorted);
}

bool geometryTraceEnabled()
{
    const char* value = std::getenv("BUILDSYNC_GEOMETRY_TRACE");
    if (value == nullptr) {
        return true;
    }
    const std::string text = value;
    return text != "0" && text != "false" && text != "FALSE" && text != "off" && text != "OFF";
}

std::string timestampForTraceFile()
{
    const auto now = std::chrono::system_clock::now();
    const auto time = std::chrono::system_clock::to_time_t(now);
    std::tm localTime = {};
#if defined(_WIN32)
    localtime_s(&localTime, &time);
#else
    localtime_r(&time, &localTime);
#endif
    std::ostringstream out;
    out << std::put_time(&localTime, "%Y%m%d_%H%M%S");
    return out.str();
}

std::string sanitizeFilePart(std::string value)
{
    for (char& ch : value) {
        const bool safe = (ch >= 'a' && ch <= 'z') ||
            (ch >= 'A' && ch <= 'Z') ||
            (ch >= '0' && ch <= '9') ||
            ch == '-' ||
            ch == '_';
        if (!safe) {
            ch = '_';
        }
    }
    return value.empty() ? "unknown" : value;
}

std::filesystem::path geometryTraceDirectory(RegistryStorage& storage)
{
    if (const auto fileStorage = dynamic_cast<FileRegistryStorage*>(&storage)) {
        const auto parent = fileStorage->registryPath().parent_path();
        if (!parent.empty()) {
            return parent / "debug-logs" / "geometry";
        }
    }
    return std::filesystem::current_path() / "debug-logs" / "geometry";
}

std::string geometryTracePathForSession(
    RegistryStorage& storage,
    const std::string& sourceAssemblyUuid,
    const std::string& sessionUuid)
{
    if (!geometryTraceEnabled()) {
        return "";
    }
    try {
        const auto directory = geometryTraceDirectory(storage);
        std::filesystem::create_directories(directory);
        return (directory / ("buildsync_geometry_trace_" + timestampForTraceFile() + "_" +
            sanitizeFilePart(sourceAssemblyUuid) + "_" + sanitizeFilePart(sessionUuid) + ".log")).string();
    } catch (...) {
        return "";
    }
}

void appendGeometryTrace(const std::string& tracePath, const std::string& section, const std::string& body)
{
    if (tracePath.empty()) {
        return;
    }
    try {
        std::ofstream output(tracePath, std::ios::app);
        if (!output) {
            return;
        }
        output << "\n## " << section << "\n";
        output << body;
        if (!body.empty() && body.back() != '\n') {
            output << "\n";
        }
    } catch (...) {
    }
}

std::string tracePathMessage(const std::string& tracePath)
{
    return tracePath.empty() ? "" : " Geometry trace: " + tracePath;
}

std::string formatDouble(double value)
{
    std::ostringstream out;
    out << std::fixed << std::setprecision(6) << value;
    return out.str();
}

std::string customPropertiesJson(const std::vector<AssemblyProperty>& properties)
{
    std::ostringstream out;
    out << "{";
    bool first = true;
    for (const auto& property : properties) {
        if (property.key.empty()) {
            continue;
        }
        if (!first) {
            out << ",";
        }
        first = false;
        out << "\"" << escapeJsonString(property.key) << "\":\"" << escapeJsonString(property.value) << "\"";
    }
    out << "}";
    return out.str();
}

bool isReservedPropertyKey(const std::string& key)
{
    return key.rfind("BS_", 0) == 0 || key.rfind("bs_", 0) == 0;
}

class NullInstanceElementOperator final : public InstanceElementOperator {
public:
    bool supportsElementType(const std::string& elementType) const override
    {
        return elementType == "Wall" || elementType == "Slab" || elementType == "Column" ||
               elementType == "Beam" || elementType == "Roof" || elementType == "Object";
    }

    std::vector<std::string> supportedElementTypes() const override
    {
        return {"Wall", "Slab", "Column", "Beam", "Roof", "Object"};
    }

    std::vector<ElementSnapshot> snapshotElements(const std::vector<SelectedElement>& elements) const override
    {
        std::vector<ElementSnapshot> snapshots;
        for (const auto& element : elements) {
            snapshots.push_back({element.elementGuid, element.elementType, "{}"});
        }
        return snapshots;
    }

    std::vector<ElementDuplicateResult> duplicateElements(
        const std::vector<ElementDuplicateRequest>&,
        const PlanPlacement&) override
    {
        diagnostic_ = "Archicad instance element operator is not available.";
        return {};
    }

    bool updateElementFromSnapshot(const std::string&, const ElementSnapshot&, const ElementSnapshot&, const ElementSnapshot&, std::string* = nullptr) override
    {
        diagnostic_ = "Archicad instance element operator is not available.";
        return false;
    }

    BuildSyncProperties readBuildSyncProperties(const std::string&, bool* hasProperties = nullptr) const override
    {
        if (hasProperties != nullptr) {
            *hasProperties = false;
        }
        return {};
    }

    std::vector<SlabCandidate> findSlabCandidatesNear(double, double, double) const override
    {
        return {};
    }

    std::vector<SlabCandidate> findBuildSyncSlabCandidates(const std::string&) const override
    {
        return {};
    }

    bool deleteElements(const std::vector<std::string>&) override
    {
        diagnostic_ = "Archicad instance element operator is not available.";
        return false;
    }

    std::string groupElements(const std::vector<std::string>&) override
    {
        diagnostic_ = "Archicad instance element operator is not available.";
        return "";
    }

    bool ungroupElements(const std::string&, const std::vector<std::string>&) override
    {
        diagnostic_ = "Archicad instance element operator is not available.";
        return false;
    }

    std::string lastDiagnostic() const override { return diagnostic_; }

private:
    std::string diagnostic_{"Archicad instance element operator is not available."};
};

InstanceElementOperator& nullInstanceOperator()
{
    static NullInstanceElementOperator nullOperator;
    return nullOperator;
}

struct RuntimeCoordinateFrame {
    double originX{0.0};
    double originY{0.0};
    double rotationDegrees{0.0};
    bool valid{false};
};

struct EditedSlabRecord {
    std::string placementId;
    std::string componentId;
    std::string selectedGuid;
    ElementSnapshot selectedSnapshot;
    ElementSnapshot baselineSnapshot;
};

struct EditedPlacementRecord {
    std::string placementId;
    std::string componentId;
    std::string elementGuid;
    std::string elementType;
};

std::string placementComponentKey(const std::string& placementId, const std::string& componentId)
{
    return placementId + "\x1f" + componentId;
}

RuntimeCoordinateFrame runtimeFrameFromStoredFrame(const CoordinateSpaceFrame& frame)
{
    return {frame.originX, frame.originY, frame.rotationDegrees, frame.valid};
}

RuntimeCoordinateFrame coordinateFrameFromSnapshots(const std::vector<ElementSnapshot>& snapshots)
{
    RuntimeCoordinateFrame frame;
    double sumX = 0.0;
    double sumY = 0.0;
    std::size_t count = 0;
    for (const auto& snapshot : snapshots) {
        if (snapshot.boundsValid) {
            sumX += snapshot.boundsCenterX;
            sumY += snapshot.boundsCenterY;
            if (!frame.valid && snapshot.frameValid) {
                frame.rotationDegrees = snapshot.frameRotationDegrees;
            }
            frame.valid = true;
            ++count;
            continue;
        }
        if (!snapshot.frameValid) {
            continue;
        }
        sumX += snapshot.frameOriginX;
        sumY += snapshot.frameOriginY;
        if (!frame.valid) {
            frame.rotationDegrees = snapshot.frameRotationDegrees;
        }
        frame.valid = true;
        ++count;
    }
    if (!frame.valid || count == 0) {
        return {};
    }
    frame.originX = sumX / static_cast<double>(count);
    frame.originY = sumY / static_cast<double>(count);
    return frame;
}

struct PlacementReconciliation {
    RuntimeCoordinateFrame sourceFrame;
    std::unordered_map<std::string, RuntimeCoordinateFrame> instanceFrames;
    std::unordered_map<std::string, ElementSnapshot> snapshotsByElementGuid;
};

void upsertBindingSnapshot(
    AssemblyRegistry& registry,
    const std::string& placementId,
    const std::string& componentId,
    const std::string& elementGuid,
    const std::string& elementType,
    const std::string& health,
    const std::optional<ElementSnapshot>& snapshot)
{
    PlacementBinding binding{
        placementId,
        componentId,
        elementGuid,
        elementType,
        0.0,
        0.0,
        false,
        health.empty() ? "active" : health,
    };
    if (const auto existing = registry.getPlacementBinding(placementId, componentId)) {
        binding = *existing;
        binding.elementGuid = elementGuid;
        binding.elementType = elementType;
        binding.health = health.empty() ? existing->health : health;
    }
    if (snapshot && snapshot->boundsValid) {
        binding.lastBoundsCenterX = snapshot->boundsCenterX;
        binding.lastBoundsCenterY = snapshot->boundsCenterY;
        binding.lastBoundsValid = true;
    }
    registry.upsertPlacementBinding(binding);
}

PlacementReconciliation reconcilePlacementFramesForAssembly(
    AssemblyRegistry& registry,
    InstanceElementOperator& instanceOperator,
    const ElementExistenceChecker& existenceChecker,
    const std::string& sourceAssemblyUuid)
{
    PlacementReconciliation reconciliation;
    const auto source = registry.getAssemblyByUuid(sourceAssemblyUuid);
    if (!source) {
        return reconciliation;
    }

    std::vector<SelectedElement> sourceMembers;
    for (const auto& member : source->members) {
        if (existenceChecker.exists(member.elementGuid)) {
            sourceMembers.push_back({member.elementGuid, member.elementType});
        }
    }
    const auto sourceSnapshots = instanceOperator.snapshotElements(sourceMembers);
    for (const auto& snapshot : sourceSnapshots) {
        reconciliation.snapshotsByElementGuid[snapshot.elementGuid] = snapshot;
    }
    reconciliation.sourceFrame = coordinateFrameFromSnapshots(sourceSnapshots);
    const std::string sourcePlacementId = AssemblyRegistry::sourcePlacementIdFor(sourceAssemblyUuid);
    for (const auto& member : source->members) {
        const auto component = registry.getComponentBySourceElementGuid(member.elementGuid);
        if (!component) {
            continue;
        }
        const auto snapshot = reconciliation.snapshotsByElementGuid.find(member.elementGuid);
        upsertBindingSnapshot(
            registry,
            sourcePlacementId,
            component->componentId,
            member.elementGuid,
            member.elementType,
            component->status.empty() ? member.status : component->status,
            snapshot == reconciliation.snapshotsByElementGuid.end()
                ? std::optional<ElementSnapshot>{}
                : std::optional<ElementSnapshot>{snapshot->second});
    }

    for (const auto& instance : registry.listInstances(sourceAssemblyUuid)) {
        if (instance.needsRepair) {
            continue;
        }
        std::vector<SelectedElement> liveMembers;
        for (const auto& member : registry.listInstanceMembers(instance.instanceUuid)) {
            if (existenceChecker.exists(member.elementGuid)) {
                liveMembers.push_back({member.elementGuid, member.elementType});
            }
        }
        if (liveMembers.empty()) {
            continue;
        }

        const auto instanceSnapshots = instanceOperator.snapshotElements(liveMembers);
        for (const auto& snapshot : instanceSnapshots) {
            reconciliation.snapshotsByElementGuid[snapshot.elementGuid] = snapshot;
        }
        RuntimeCoordinateFrame liveFrame = coordinateFrameFromSnapshots(instanceSnapshots);
        if (!liveFrame.valid) {
            continue;
        }

        WrapperInstance refreshed = instance;
        if (reconciliation.sourceFrame.valid) {
            refreshed.sourceFrame = {
                reconciliation.sourceFrame.originX,
                reconciliation.sourceFrame.originY,
                reconciliation.sourceFrame.rotationDegrees,
                true,
            };
            refreshed.transform.originX = liveFrame.originX - reconciliation.sourceFrame.originX;
            refreshed.transform.originY = liveFrame.originY - reconciliation.sourceFrame.originY;
            refreshed.transform.rotationDegrees = liveFrame.rotationDegrees - reconciliation.sourceFrame.rotationDegrees;
            refreshed.transform.mirrored = instance.transform.mirrored;
            refreshed.isMirrored = instance.transform.mirrored;
        }
        refreshed.liveFrame = {liveFrame.originX, liveFrame.originY, liveFrame.rotationDegrees, true};
        registry.updateInstance(refreshed);
        reconciliation.instanceFrames[instance.instanceUuid] = liveFrame;

        for (const auto& member : registry.listInstanceMembers(instance.instanceUuid)) {
            const auto snapshot = reconciliation.snapshotsByElementGuid.find(member.elementGuid);
            upsertBindingSnapshot(
                registry,
                instance.instanceUuid,
                member.componentId,
                member.elementGuid,
                member.elementType,
                member.status,
                snapshot == reconciliation.snapshotsByElementGuid.end()
                    ? std::optional<ElementSnapshot>{}
                    : std::optional<ElementSnapshot>{snapshot->second});
        }
    }
    return reconciliation;
}

std::unordered_map<std::string, RuntimeCoordinateFrame> refreshInstanceLiveFramesForAssembly(
    AssemblyRegistry& registry,
    InstanceElementOperator& instanceOperator,
    const ElementExistenceChecker& existenceChecker,
    const std::string& sourceAssemblyUuid)
{
    return reconcilePlacementFramesForAssembly(
        registry,
        instanceOperator,
        existenceChecker,
        sourceAssemblyUuid).instanceFrames;
}

std::string frameSummary(const RuntimeCoordinateFrame& frame)
{
    if (!frame.valid) {
        return "(invalid)";
    }
    std::ostringstream out;
    out << "(" << frame.originX << "," << frame.originY << "," << frame.rotationDegrees << ")";
    return out.str();
}

std::string traceFrameSummary(const RuntimeCoordinateFrame& frame)
{
    if (!frame.valid) {
        return "valid=false";
    }
    return "valid=true origin=(" + formatDouble(frame.originX) + "," + formatDouble(frame.originY) +
        ") rotation=" + formatDouble(frame.rotationDegrees);
}

std::string traceStoredFrameSummary(const CoordinateSpaceFrame& frame)
{
    return traceFrameSummary(runtimeFrameFromStoredFrame(frame));
}

std::string tracePlanTransformSummary(const PlanTransform& transform)
{
    return "origin=(" + formatDouble(transform.originX) + "," + formatDouble(transform.originY) +
        ") rotation=" + formatDouble(transform.rotationDegrees) +
        " mirrored=" + std::string(transform.mirrored ? "true" : "false");
}

std::string traceCoords(const std::vector<double>& coords)
{
    std::ostringstream out;
    out << "[" << coords.size() << "]=";
    if (coords.empty()) {
        out << "[]";
        return out.str();
    }
    out << "[";
    for (std::size_t index = 0; index + 1 < coords.size(); index += 2) {
        if (index > 0) {
            out << ",";
        }
        out << "(" << formatDouble(coords[index]) << "," << formatDouble(coords[index + 1]) << ")";
    }
    if (coords.size() % 2 != 0) {
        out << ",<odd:" << formatDouble(coords.back()) << ">";
    }
    out << "]";
    return out.str();
}

std::string traceSnapshotSummary(const ElementSnapshot& snapshot)
{
    std::ostringstream out;
    out << "guid=" << snapshot.elementGuid
        << " type=" << snapshot.elementType
        << " topology=" << snapshot.topologySignature << "\n";
    out << "  bounds valid=" << (snapshot.boundsValid ? "true" : "false")
        << " center=(" << formatDouble(snapshot.boundsCenterX) << "," << formatDouble(snapshot.boundsCenterY) <<
        "," << formatDouble(snapshot.boundsCenterZ) << ")\n";
    out << "  coordinateFrame valid=" << (snapshot.coordinateFrameValid ? "true" : "false")
        << " origin=(" << formatDouble(snapshot.coordinateOriginX) << "," << formatDouble(snapshot.coordinateOriginY) <<
        ") rotation=" << formatDouble(snapshot.coordinateRotationDegrees) << "\n";
    out << "  elementFrame valid=" << (snapshot.frameValid ? "true" : "false")
        << " origin=(" << formatDouble(snapshot.frameOriginX) << "," << formatDouble(snapshot.frameOriginY) <<
        ") rotation=" << formatDouble(snapshot.frameRotationDegrees) << "\n";
    out << "  polygonFrame valid=" << (snapshot.polygonFrameValid ? "true" : "false")
        << " origin=(" << formatDouble(snapshot.polygonFrameOriginX) << "," << formatDouble(snapshot.polygonFrameOriginY) <<
        ") rotation=" << formatDouble(snapshot.polygonFrameRotationDegrees) << "\n";
    out << "  polygonCoords " << traceCoords(snapshot.polygonCoords) << "\n";
    out << "  localPolygonCoords " << traceCoords(snapshot.localPolygonCoords) << "\n";
    return out.str();
}

std::string traceSnapshotList(
    const std::string& label,
    const std::vector<ElementSnapshot>& snapshots,
    const std::unordered_map<std::string, std::string>& componentByElementGuid,
    const std::unordered_map<std::string, std::string>& instanceByElementGuid)
{
    std::ostringstream out;
    out << label << " count=" << snapshots.size() << "\n";
    for (const auto& snapshot : snapshots) {
        const auto component = componentByElementGuid.find(snapshot.elementGuid);
        const auto instance = instanceByElementGuid.find(snapshot.elementGuid);
        out << "- placement=" << (instance == instanceByElementGuid.end() ? "source" : instance->second)
            << " component=" << (component == componentByElementGuid.end() ? "" : component->second) << "\n";
        out << traceSnapshotSummary(snapshot);
    }
    return out.str();
}

std::string traceRegistryState(const AssemblyRegistry& registry, const std::string& sourceAssemblyUuid)
{
    std::ostringstream out;
    const auto source = registry.getAssemblyByUuid(sourceAssemblyUuid);
    out << "registry source=" << sourceAssemblyUuid << "\n";
    if (source) {
        out << "sourceMembers count=" << source->members.size() << "\n";
        for (const auto& member : source->members) {
            const auto component = registry.getComponentBySourceElementGuid(member.elementGuid);
            const auto binding = component
                ? registry.getPlacementBinding(AssemblyRegistry::sourcePlacementIdFor(sourceAssemblyUuid), component->componentId)
                : std::optional<PlacementBinding>{};
            out << "- source guid=" << member.elementGuid
                << " type=" << member.elementType
                << " component=" << (component ? component->componentId : "")
                << " bindingGuid=" << (binding ? binding->elementGuid : "")
                << " bindingBoundsValid=" << (binding && binding->lastBoundsValid ? "true" : "false");
            if (binding && binding->lastBoundsValid) {
                out << " bindingBounds=(" << formatDouble(binding->lastBoundsCenterX) << "," <<
                    formatDouble(binding->lastBoundsCenterY) << ")";
            }
            out << "\n";
        }
    }
    for (const auto& instance : registry.listInstances(sourceAssemblyUuid)) {
        out << "instance uuid=" << instance.instanceUuid
            << " needsRepair=" << (instance.needsRepair ? "true" : "false")
            << " transform=" << tracePlanTransformSummary(instance.transform)
            << " sourceFrame=" << traceStoredFrameSummary(instance.sourceFrame)
            << " liveFrame=" << traceStoredFrameSummary(instance.liveFrame) << "\n";
        for (const auto& member : registry.listInstanceMembers(instance.instanceUuid)) {
            const auto binding = registry.getPlacementBinding(instance.instanceUuid, member.componentId);
            out << "  - member guid=" << member.elementGuid
                << " component=" << member.componentId
                << " type=" << member.elementType
                << " bindingGuid=" << (binding ? binding->elementGuid : "")
                << " bindingBoundsValid=" << (binding && binding->lastBoundsValid ? "true" : "false");
            if (binding && binding->lastBoundsValid) {
                out << " bindingBounds=(" << formatDouble(binding->lastBoundsCenterX) << "," <<
                    formatDouble(binding->lastBoundsCenterY) << ")";
            }
            out << "\n";
        }
    }
    return out.str();
}

std::string traceReconciliationSummary(const PlacementReconciliation& reconciliation)
{
    std::ostringstream out;
    out << "sourceFrame " << traceFrameSummary(reconciliation.sourceFrame) << "\n";
    for (const auto& [instanceUuid, frame] : reconciliation.instanceFrames) {
        out << "instanceFrame " << instanceUuid << " " << traceFrameSummary(frame);
        const double dx = reconciliation.sourceFrame.originX - frame.originX;
        const double dy = reconciliation.sourceFrame.originY - frame.originY;
        if (reconciliation.sourceFrame.valid && frame.valid && (dx * dx + dy * dy) <= 1.0e-6) {
            out << " WARNING target-frame-matches-source-frame";
        }
        out << "\n";
    }
    return out.str();
}

double squaredDistance(const RuntimeCoordinateFrame& first, const RuntimeCoordinateFrame& second)
{
    const double dx = first.originX - second.originX;
    const double dy = first.originY - second.originY;
    return dx * dx + dy * dy;
}

double squaredDistanceToFrame(double x, double y, const RuntimeCoordinateFrame& frame)
{
    if (!frame.valid) {
        return std::numeric_limits<double>::max();
    }
    const double dx = x - frame.originX;
    const double dy = y - frame.originY;
    return dx * dx + dy * dy;
}

double squaredDistanceToBounds(const RuntimeCoordinateFrame& frame, const ElementSnapshot& snapshot)
{
    if (!snapshot.boundsValid) {
        return std::numeric_limits<double>::max();
    }
    return squaredDistanceToFrame(snapshot.boundsCenterX, snapshot.boundsCenterY, frame);
}

bool hasStoredPlacementOffset(const WrapperInstance& instance)
{
    return instance.transform.originX != 0.0 ||
        instance.transform.originY != 0.0 ||
        instance.transform.rotationDegrees != 0.0 ||
        instance.transform.mirrored;
}

RuntimeCoordinateFrame coordinateFrameFromStoredPlacement(
    const RuntimeCoordinateFrame& sourceFrame,
    const WrapperInstance& instance)
{
    if (!sourceFrame.valid || !hasStoredPlacementOffset(instance)) {
        return {};
    }
    return {
        sourceFrame.originX + instance.transform.originX,
        sourceFrame.originY + instance.transform.originY,
        sourceFrame.rotationDegrees + instance.transform.rotationDegrees,
        true,
    };
}

RuntimeCoordinateFrame persistedSourceFrameForAssembly(const AssemblyRegistry& registry, const std::string& sourceAssemblyUuid)
{
    for (const auto& instance : registry.listInstances(sourceAssemblyUuid)) {
        if (instance.sourceFrame.valid) {
            return runtimeFrameFromStoredFrame(instance.sourceFrame);
        }
    }
    return {};
}

bool isZeroSourceFramePlaceholder(const RuntimeCoordinateFrame& frame)
{
    return frame.valid &&
        std::abs(frame.originX) <= 1.0e-8 &&
        std::abs(frame.originY) <= 1.0e-8 &&
        std::abs(frame.rotationDegrees) <= 1.0e-8;
}

void applyCoordinateFrame(ElementSnapshot& snapshot, const RuntimeCoordinateFrame& frame)
{
    if (!frame.valid) {
        return;
    }
    snapshot.coordinateOriginX = frame.originX;
    snapshot.coordinateOriginY = frame.originY;
    snapshot.coordinateRotationDegrees = frame.rotationDegrees;
    snapshot.coordinateFrameValid = true;
}

ElementSnapshot withCoordinateFrame(ElementSnapshot snapshot, const RuntimeCoordinateFrame& frame)
{
    applyCoordinateFrame(snapshot, frame);
    return snapshot;
}

std::vector<double> localPolygonCoordsForFrame(const std::vector<double>& worldCoords, const RuntimeCoordinateFrame& frame)
{
    std::vector<double> localCoords;
    if (!frame.valid || worldCoords.size() % 2 != 0) {
        return localCoords;
    }
    const double radians = frame.rotationDegrees * 3.14159265358979323846 / 180.0;
    localCoords.reserve(worldCoords.size());
    if (worldCoords.size() >= 2) {
        localCoords.push_back(worldCoords[0]);
        localCoords.push_back(worldCoords[1]);
    }
    for (std::size_t index = 2; index < worldCoords.size(); index += 2) {
        const double dx = worldCoords[index] - frame.originX;
        const double dy = worldCoords[index + 1] - frame.originY;
        localCoords.push_back(std::cos(radians) * dx + std::sin(radians) * dy);
        localCoords.push_back(-std::sin(radians) * dx + std::cos(radians) * dy);
    }
    return localCoords;
}

bool localPolygonBoundsForFrame(
    const std::vector<double>& localCoords,
    const RuntimeCoordinateFrame& frame,
    double& centerX,
    double& centerY)
{
    if (!frame.valid || localCoords.size() < 4 || localCoords.size() % 2 != 0) {
        return false;
    }
    const double radians = frame.rotationDegrees * 3.14159265358979323846 / 180.0;
    bool hasPoint = false;
    double minX = 0.0;
    double maxX = 0.0;
    double minY = 0.0;
    double maxY = 0.0;
    for (std::size_t index = 2; index < localCoords.size(); index += 2) {
        const double worldX = frame.originX + std::cos(radians) * localCoords[index] - std::sin(radians) * localCoords[index + 1];
        const double worldY = frame.originY + std::sin(radians) * localCoords[index] + std::cos(radians) * localCoords[index + 1];
        if (!hasPoint) {
            minX = maxX = worldX;
            minY = maxY = worldY;
            hasPoint = true;
        } else {
            minX = std::min(minX, worldX);
            maxX = std::max(maxX, worldX);
            minY = std::min(minY, worldY);
            maxY = std::max(maxY, worldY);
        }
    }
    if (!hasPoint) {
        return false;
    }
    centerX = (minX + maxX) / 2.0;
    centerY = (minY + maxY) / 2.0;
    return true;
}

double localPolygonBoundsTolerance(const std::vector<double>& localCoords)
{
    if (localCoords.size() < 4 || localCoords.size() % 2 != 0) {
        return 2.0;
    }
    bool hasPoint = false;
    double minX = 0.0;
    double maxX = 0.0;
    double minY = 0.0;
    double maxY = 0.0;
    for (std::size_t index = 2; index < localCoords.size(); index += 2) {
        const double localX = localCoords[index];
        const double localY = localCoords[index + 1];
        if (!hasPoint) {
            minX = maxX = localX;
            minY = maxY = localY;
            hasPoint = true;
        } else {
            minX = std::min(minX, localX);
            maxX = std::max(maxX, localX);
            minY = std::min(minY, localY);
            maxY = std::max(maxY, localY);
        }
    }
    if (!hasPoint) {
        return 2.0;
    }
    const double width = maxX - minX;
    const double height = maxY - minY;
    const double diagonal = std::sqrt(width * width + height * height);
    return std::max(2.0, diagonal * 0.5);
}

RuntimeCoordinateFrame runtimeFrameFromSnapshot(const ElementSnapshot& snapshot)
{
    if (!snapshot.coordinateFrameValid) {
        return {};
    }
    return {
        snapshot.coordinateOriginX,
        snapshot.coordinateOriginY,
        snapshot.coordinateRotationDegrees,
        true,
    };
}

RuntimeCoordinateFrame localDefinitionFrameFromSnapshot(const ElementSnapshot& snapshot)
{
    if (snapshot.elementType == "Slab" && snapshot.polygonFrameValid) {
        return {
            snapshot.polygonFrameOriginX,
            snapshot.polygonFrameOriginY,
            snapshot.polygonFrameRotationDegrees,
            true,
        };
    }
    return runtimeFrameFromSnapshot(snapshot);
}

ElementSnapshot withLocalDefinitionFrame(ElementSnapshot snapshot)
{
    applyCoordinateFrame(snapshot, localDefinitionFrameFromSnapshot(snapshot));
    return snapshot;
}

bool generatedSlabBoundsAreSafeForTarget(
    const ElementSnapshot& snapshot,
    const ElementSnapshot& editedBaseline,
    const ElementSnapshot& targetBaseline,
    const std::string& placementKind,
    const std::string& targetGuid,
    std::string& diagnostic)
{
    if (snapshot.elementType != "Slab" || snapshot.localPolygonCoords.empty()) {
        return true;
    }
    const RuntimeCoordinateFrame targetFrame = runtimeFrameFromSnapshot(targetBaseline);
    double generatedX = 0.0;
    double generatedY = 0.0;
    if (!localPolygonBoundsForFrame(snapshot.localPolygonCoords, targetFrame, generatedX, generatedY)) {
        diagnostic = "Could not compute generated slab bounds for target " + targetGuid + ".";
        return false;
    }
    if (!targetBaseline.boundsValid || !editedBaseline.boundsValid) {
        return true;
    }

    const double targetDx = generatedX - targetBaseline.boundsCenterX;
    const double targetDy = generatedY - targetBaseline.boundsCenterY;
    const double editedDx = generatedX - editedBaseline.boundsCenterX;
    const double editedDy = generatedY - editedBaseline.boundsCenterY;
    const double targetDistance = targetDx * targetDx + targetDy * targetDy;
    const double editedDistance = editedDx * editedDx + editedDy * editedDy;
    const double placementDistance =
        (targetBaseline.boundsCenterX - editedBaseline.boundsCenterX) * (targetBaseline.boundsCenterX - editedBaseline.boundsCenterX) +
        (targetBaseline.boundsCenterY - editedBaseline.boundsCenterY) * (targetBaseline.boundsCenterY - editedBaseline.boundsCenterY);
    if (placementDistance > 1.0e-8 && editedDistance < targetDistance * 0.25) {
        diagnostic = "Refused slab target " + targetGuid + " because generated bounds are closer to the edited placement than the " +
            placementKind + " target. generated=(" + std::to_string(generatedX) + "," + std::to_string(generatedY) +
            ") targetBounds=(" + std::to_string(targetBaseline.boundsCenterX) + "," + std::to_string(targetBaseline.boundsCenterY) +
            ") editedBounds=(" + std::to_string(editedBaseline.boundsCenterX) + "," + std::to_string(editedBaseline.boundsCenterY) +
            ") targetFrame=" + frameSummary(targetFrame);
        return false;
    }
    return true;
}

bool snapshotBoundsMatch(const ElementSnapshot& snapshot, const ElementSnapshot& baseline)
{
    if (!snapshot.boundsValid || !baseline.boundsValid) {
        return false;
    }
    const double dx = snapshot.boundsCenterX - baseline.boundsCenterX;
    const double dy = snapshot.boundsCenterY - baseline.boundsCenterY;
    return (dx * dx + dy * dy) <= 1.0e-6;
}

bool topologyOrBoundsChanged(const ElementSnapshot& current, const ElementSnapshot& baseline)
{
    if (!current.topologySignature.empty() && !baseline.topologySignature.empty() &&
        current.topologySignature != baseline.topologySignature) {
        return true;
    }
    return !snapshotBoundsMatch(current, baseline);
}

std::string candidateSummary(const SlabCandidate& candidate)
{
    std::ostringstream out;
    out << candidate.snapshot.elementGuid
        << " bounds=(" << candidate.snapshot.boundsCenterX << "," << candidate.snapshot.boundsCenterY << ")"
        << " topology=" << candidate.snapshot.topologySignature;
    if (candidate.hasBuildSyncProperties) {
        out << " placement=" << candidate.buildSyncProperties.placementId
            << " component=" << candidate.buildSyncProperties.componentId
            << " source=" << candidate.buildSyncProperties.sourceAssemblyUuid;
    } else {
        out << " metadata=missing";
    }
    return out.str();
}

bool hasUsableBuildSyncIdentity(const BuildSyncProperties& properties)
{
    return !properties.sourceAssemblyUuid.empty() &&
        !properties.placementId.empty() &&
        !properties.componentId.empty();
}

bool buildSyncIdentityMatches(
    const BuildSyncProperties& properties,
    const std::string& sourceAssemblyUuid,
    const std::string& placementId,
    const std::string& componentId)
{
    return properties.sourceAssemblyUuid == sourceAssemblyUuid &&
        properties.placementId == placementId &&
        properties.componentId == componentId;
}

} // namespace

AssemblyCommandService::AssemblyCommandService(
    SelectionReader& selectionReader,
    ElementPropertyWriter& propertyWriter,
    ElementExistenceChecker& existenceChecker,
    ElementMetadataReader& metadataReader,
    HighlightController& highlightController,
    RegistryStorage& registryStorage,
    PythonListenerClient& listenerClient,
    AssemblyRegistry& registry,
    NamingRules& namingRules,
    SyncQueue& syncQueue,
    std::string projectId,
    UuidFactory uuidFactory,
    InstanceElementOperator* instanceOperator)
    : selectionReader_(selectionReader)
    , propertyWriter_(propertyWriter)
    , existenceChecker_(existenceChecker)
    , metadataReader_(metadataReader)
    , highlightController_(highlightController)
    , registryStorage_(registryStorage)
    , listenerClient_(listenerClient)
    , registry_(registry)
    , namingRules_(namingRules)
    , syncQueue_(syncQueue)
    , projectId_(std::move(projectId))
    , uuidFactory_(std::move(uuidFactory))
    , instanceOperator_(instanceOperator == nullptr ? &nullInstanceOperator() : instanceOperator)
{
}

std::vector<Assembly> AssemblyCommandService::listWrappers() const
{
    return registry_.listAssemblies();
}

std::optional<Assembly> AssemblyCommandService::getWrapper(const std::string& assemblyUuid) const
{
    return registry_.getAssemblyByUuid(assemblyUuid);
}

std::vector<WrapperInstance> AssemblyCommandService::listWrapperInstances(const std::string& sourceAssemblyUuid) const
{
    return registry_.listInstances(sourceAssemblyUuid);
}

std::vector<WrapperInstanceMember> AssemblyCommandService::listWrapperInstanceMembers(const std::string& instanceUuid) const
{
    return registry_.listInstanceMembers(instanceUuid);
}

std::optional<WrapperInstance> AssemblyCommandService::getWrapperInstance(const std::string& instanceUuid) const
{
    return registry_.getInstance(instanceUuid);
}

std::vector<ElementMetadata> AssemblyCommandService::listWrapperMemberMetadata(const std::string& assemblyUuid) const
{
    const auto assembly = registry_.getAssemblyByUuid(assemblyUuid);
    if (!assembly) {
        return {};
    }

    std::vector<ElementMetadata> rows;
    rows.reserve(assembly->members.size());
    for (const auto& member : assembly->members) {
        ElementMetadata metadata = metadataReader_.readElementMetadata(member.elementGuid);
        metadata.elementGuid = member.elementGuid;
        if (metadata.elementType.empty()) {
            metadata.elementType = member.elementType;
        }
        if (metadata.status.empty()) {
            metadata.status = member.status;
        }
        rows.push_back(metadata);
    }
    return rows;
}

std::vector<Assembly> AssemblyCommandService::listChildWrappers(const std::string& assemblyUuid) const
{
    return registry_.listChildWrappers(assemblyUuid);
}

std::vector<AssemblyMember> AssemblyCommandService::resolveEffectiveMembers(const std::string& assemblyUuid) const
{
    return registry_.resolveEffectiveMembers(assemblyUuid);
}

CommandResult AssemblyCommandService::updateWrapper(const std::string& assemblyUuid, const AssemblyUpdateRequest& request)
{
    auto assembly = registry_.getAssemblyByUuid(assemblyUuid);
    if (!assembly) {
        return {false, "Wrapper was not found.", {}};
    }
    if (request.assemblyId.empty() || request.name.empty()) {
        return {false, "Wrapper ID and name are required.", {}};
    }

    assembly->assemblyId = request.assemblyId;
    assembly->name = request.name;
    assembly->type = request.type;
    assembly->zone = request.zone;
    assembly->level = request.level;
    assembly->trade = request.trade;
    assembly->taskId = request.taskId;
    assembly->status = request.status.empty() ? "active" : request.status;
    ++assembly->version;

    if (!registry_.updateAssembly(*assembly)) {
        return {false, "Wrapper could not be updated.", {}};
    }
    if (!stampAssemblyProperties(*assembly)) {
        return {false, "Wrapper was updated but BuildSync properties could not be restamped: " + propertyWriter_.lastDiagnostic(), {}};
    }
    registryStorage_.save(registry_);
    enqueueEvent("assembly_updated", JsonSerializer::assemblyUpdated(projectId_, *assembly, {}, {}));
    return {true, "Wrapper " + assembly->assemblyId + " updated.", {}};
}

CommandResult AssemblyCommandService::deleteWrapper(const std::string& assemblyUuid)
{
    auto assembly = registry_.getAssemblyByUuid(assemblyUuid);
    if (!assembly) {
        return {false, "Wrapper was not found.", {}};
    }
    for (const auto& member : assembly->members) {
        propertyWriter_.clearAssemblyProperties(member.elementGuid);
    }
    registry_.deleteAssembly(assemblyUuid);
    registryStorage_.save(registry_);
    enqueueEvent("assembly_updated", JsonSerializer::assemblyUpdated(projectId_, *assembly, {}, assembly->members));
    return {true, "Wrapper " + assembly->assemblyId + " deleted.", {}};
}

CommandResult AssemblyCommandService::selectWrapperMembers(const std::string& assemblyUuid)
{
    const auto assembly = registry_.getAssemblyByUuid(assemblyUuid);
    if (!assembly) {
        return {false, "Wrapper was not found.", {}};
    }

    std::vector<std::string> liveGuids;
    for (const auto& member : assembly->members) {
        if (existenceChecker_.exists(member.elementGuid)) {
            liveGuids.push_back(member.elementGuid);
        }
    }
    if (liveGuids.empty()) {
        return {false, "Wrapper has no live Archicad members to select.", {}};
    }
    highlightController_.selectElements(liveGuids);
    return {true, "Wrapper members selected.", {}};
}

CommandResult AssemblyCommandService::selectWrapperBranchMembers(const std::string& assemblyUuid)
{
    if (!registry_.containsAssembly(assemblyUuid)) {
        return {false, "Wrapper was not found.", {}};
    }

    std::vector<std::string> liveGuids;
    for (const auto& member : registry_.resolveEffectiveMembers(assemblyUuid)) {
        if (existenceChecker_.exists(member.elementGuid)) {
            liveGuids.push_back(member.elementGuid);
        }
    }
    if (liveGuids.empty()) {
        return {false, "Wrapper branch has no live Archicad members to select.", {}};
    }
    if (!highlightController_.selectElements(liveGuids)) {
        return {false, "Wrapper branch members could not be selected in Archicad.", {}};
    }
    return {true, "Wrapper branch members selected.", {}};
}

CommandResult AssemblyCommandService::selectWrapperMember(const std::string& assemblyUuid, const std::string& elementGuid)
{
    const auto assembly = registry_.getAssemblyByUuid(assemblyUuid);
    if (!assembly) {
        return {false, "Wrapper was not found.", {}};
    }
    const auto member = std::find_if(assembly->members.begin(), assembly->members.end(), [&](const AssemblyMember& item) {
        return item.elementGuid == elementGuid;
    });
    if (member == assembly->members.end()) {
        return {false, "Element is not a member of the selected wrapper.", {}};
    }
    if (!existenceChecker_.exists(elementGuid)) {
        return {false, "Wrapper member is missing in Archicad.", {}};
    }
    if (!highlightController_.selectElements({elementGuid})) {
        return {false, "Wrapper member could not be selected in Archicad.", {}};
    }
    return {true, "Wrapper member selected.", {}};
}

CommandResult AssemblyCommandService::addChildWrapper(const std::string& parentAssemblyUuid, const std::string& childAssemblyUuid)
{
    const auto parent = registry_.getAssemblyByUuid(parentAssemblyUuid);
    const auto child = registry_.getAssemblyByUuid(childAssemblyUuid);
    if (!parent || !child) {
        return {false, "Parent and child wrappers must both exist.", {}};
    }
    if (parentAssemblyUuid == childAssemblyUuid) {
        return {false, "A wrapper cannot contain itself.", {}};
    }
    const auto existingParent = registry_.getParentWrapper(childAssemblyUuid);
    if (existingParent && *existingParent != parentAssemblyUuid) {
        return {false, "Child wrapper already belongs to another parent wrapper.", {}};
    }
    if (!registry_.addChildWrapper(parentAssemblyUuid, childAssemblyUuid)) {
        return {false, "Child wrapper could not be added. Check for circular nesting.", {}};
    }
    registry_.incrementVersion(parentAssemblyUuid);
    registryStorage_.save(registry_);
    enqueueEvent(
        "assembly_relationship_updated",
        JsonSerializer::assemblyRelationshipUpdated(
            projectId_,
            {parentAssemblyUuid, childAssemblyUuid, "contains", 0, "active"},
            registry_.listRelationships()));
    return {true, "Child wrapper added to parent wrapper.", {}};
}

CommandResult AssemblyCommandService::addSelectedWrapperAsChild(const std::string& parentAssemblyUuid)
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select one member of the child wrapper first.", {}};
    }
    const auto child = registry_.getAssemblyByElementGuid(selection.front().elementGuid);
    if (!child) {
        return {false, "Selected element is not part of a BuildSync wrapper.", {}};
    }
    return addChildWrapper(parentAssemblyUuid, child->assemblyUuid);
}

CommandResult AssemblyCommandService::removeChildWrapper(const std::string& parentAssemblyUuid, const std::string& childAssemblyUuid)
{
    const auto parent = registry_.getAssemblyByUuid(parentAssemblyUuid);
    const auto child = registry_.getAssemblyByUuid(childAssemblyUuid);
    if (!parent || !child) {
        return {false, "Parent and child wrappers must both exist.", {}};
    }
    const auto existingParent = registry_.getParentWrapper(childAssemblyUuid);
    if (!existingParent || *existingParent != parentAssemblyUuid) {
        return {false, "Child wrapper is not nested under the selected parent.", {}};
    }
    registry_.removeChildWrapper(parentAssemblyUuid, childAssemblyUuid);
    registry_.incrementVersion(parentAssemblyUuid);
    registryStorage_.save(registry_);
    enqueueEvent(
        "assembly_relationship_updated",
        JsonSerializer::assemblyRelationshipUpdated(
            projectId_,
            {parentAssemblyUuid, childAssemblyUuid, "contains", 0, "removed"},
            registry_.listRelationships()));
    return {true, "Child wrapper removed from parent wrapper.", {}};
}

CommandResult AssemblyCommandService::addSelectionToAssembly(const std::string& assemblyUuid)
{
    const auto target = registry_.getAssemblyByUuid(assemblyUuid);
    if (!target) {
        return {false, "Target wrapper was not found.", {}};
    }

    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select one or more Archicad elements first.", {}};
    }

    std::vector<AssemblyMember> toAdd;
    for (const auto& selected : selection) {
        const auto existing = registry_.getAssemblyByElementGuid(selected.elementGuid);
        if (existing && existing->assemblyUuid != assemblyUuid) {
            return {false, "Selection contains elements from another wrapper.", {}};
        }
        if (!existing) {
            toAdd.push_back(memberFromSelection(selected, assemblyUuid));
        }
    }
    if (toAdd.empty()) {
        return {false, "Selection does not contain new elements for this wrapper.", {}};
    }

    if (!registry_.addMembers(assemblyUuid, toAdd) || !registry_.incrementVersion(assemblyUuid)) {
        return {false, "Selection could not be added to wrapper.", {}};
    }
    const auto updated = registry_.getAssemblyByUuid(assemblyUuid);
    if (!updated || !stampAssemblyProperties(*updated)) {
        return {false, "Wrapper was updated but BuildSync properties could not be written: " + propertyWriter_.lastDiagnostic(), {}};
    }
    registryStorage_.save(registry_);
    enqueueEvent("assembly_updated", JsonSerializer::assemblyUpdated(projectId_, *updated, toAdd, {}));
    return {true, "Selection added to wrapper.", {}};
}

CommandResult AssemblyCommandService::createAssemblyFromSelection(const CreateAssemblyRequest& request)
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select one or more Archicad elements first.", {}};
    }
    if (!propertyWriter_.ensureBuildSyncProperties()) {
        return {false, "BuildSync property setup failed: " + propertyWriter_.lastDiagnostic(), {}};
    }

    Assembly assembly;
    assembly.assemblyUuid = uuidFactory_();
    assembly.assemblyId = namingRules_.generateAssemblyId(request.type, request.level, request.zone);
    assembly.name = request.name;
    assembly.type = request.type;
    assembly.zone = request.zone;
    assembly.level = request.level;
    assembly.trade = request.trade;
    assembly.taskId = request.taskId;
    for (const auto& selected : selection) {
        assembly.members.push_back(memberFromSelection(selected, assembly.assemblyUuid));
    }

    if (!registry_.createAssembly(assembly)) {
        return {false, "Assembly could not be created because the selection overlaps an existing assembly.", {}};
    }
    if (!stampAssemblyProperties(assembly)) {
        registry_.deleteAssembly(assembly.assemblyUuid);
        return {false, "Assembly was created in memory but BuildSync properties could not be written: " + propertyWriter_.lastDiagnostic(), {}};
    }
    registryStorage_.save(registry_);
    enqueueEvent("assembly_created", JsonSerializer::assemblyCreated(projectId_, assembly));
    return {true, "Assembly " + assembly.assemblyId + " created locally.", {}};
}

CommandResult AssemblyCommandService::selectAssemblyMembers()
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select one BuildSync assembly member first.", {}};
    }
    const auto assembly = registry_.getAssemblyByElementGuid(selection.front().elementGuid);
    if (!assembly) {
        return {false, "Selected element is not part of a BuildSync assembly.", {}};
    }

    std::vector<std::string> liveGuids;
    for (const auto& member : assembly->members) {
        if (existenceChecker_.exists(member.elementGuid)) {
            liveGuids.push_back(member.elementGuid);
        }
    }
    highlightController_.selectElements(liveGuids);
    return {true, "Assembly members selected.", {}};
}

CommandResult AssemblyCommandService::addSelectionToAssembly()
{
    const auto selection = selectionReader_.readSelection();
    std::string assemblyUuid;
    std::vector<AssemblyMember> toAdd;
    for (const auto& selected : selection) {
        auto assembly = registry_.getAssemblyByElementGuid(selected.elementGuid);
        if (assembly) {
            assemblyUuid = assembly->assemblyUuid;
        } else {
            toAdd.push_back(memberFromSelection(selected, ""));
        }
    }
    if (assemblyUuid.empty()) {
        return {false, "Selection must include one existing assembly member.", {}};
    }
    if (!registry_.addMembers(assemblyUuid, toAdd) || !registry_.incrementVersion(assemblyUuid)) {
        return {false, "Selection contains multiple assemblies. Choose one target assembly.", {}};
    }
    const auto assembly = registry_.getAssemblyByUuid(assemblyUuid);
    if (assembly) {
        stampAssemblyProperties(*assembly);
        registryStorage_.save(registry_);
        enqueueEvent("assembly_updated", JsonSerializer::assemblyUpdated(projectId_, *assembly, toAdd, {}));
    }
    return {true, "Selection added to assembly.", {}};
}

CommandResult AssemblyCommandService::removeSelectionFromAssembly()
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select one or more assembly members first.", {}};
    }
    const auto assembly = registry_.getAssemblyByElementGuid(selection.front().elementGuid);
    if (!assembly) {
        return {false, "Selected element is not part of a BuildSync assembly.", {}};
    }
    std::vector<std::string> removeGuids;
    std::vector<AssemblyMember> removed;
    for (const auto& selected : selection) {
        removeGuids.push_back(selected.elementGuid);
        removed.push_back(memberFromSelection(selected, assembly->assemblyUuid));
        propertyWriter_.clearAssemblyProperties(selected.elementGuid);
    }
    registry_.removeMembers(assembly->assemblyUuid, removeGuids);
    registry_.incrementVersion(assembly->assemblyUuid);
    const auto updated = registry_.getAssemblyByUuid(assembly->assemblyUuid);
    if (updated && updated->members.empty()) {
        registry_.deleteAssembly(assembly->assemblyUuid);
        registryStorage_.save(registry_);
        enqueueEvent("assembly_updated", JsonSerializer::assemblyUpdated(projectId_, *updated, {}, removed));
        return {true, "Assembly removed because it has no remaining members.", {}};
    }
    registryStorage_.save(registry_);
    if (updated) {
        enqueueEvent("assembly_updated", JsonSerializer::assemblyUpdated(projectId_, *updated, {}, removed));
    }
    return {true, "Selection removed from assembly.", {}};
}

CommandResult AssemblyCommandService::setWrapperCustomProperty(const std::string& assemblyUuid, const std::string& key, const std::string& value)
{
    if (key.empty()) {
        return {false, "Custom property key is required.", {}};
    }
    if (isReservedPropertyKey(key)) {
        return {false, "Custom property keys cannot use the reserved BS_* prefix.", {}};
    }

    auto assembly = registry_.getAssemblyByUuid(assemblyUuid);
    if (!assembly) {
        return {false, "Wrapper was not found.", {}};
    }

    bool updated = false;
    for (auto& property : assembly->customProperties) {
        if (property.key == key) {
            property.value = value;
            updated = true;
            break;
        }
    }
    if (!updated) {
        assembly->customProperties.push_back({key, value});
    }
    ++assembly->version;

    if (!registry_.updateAssembly(*assembly)) {
        return {false, "Custom property could not be saved.", {}};
    }
    if (!stampAssemblyProperties(*assembly)) {
        return {false, "Custom property was saved but BuildSync properties could not be restamped: " + propertyWriter_.lastDiagnostic(), {}};
    }
    registryStorage_.save(registry_);
    enqueueEvent("assembly_updated", JsonSerializer::assemblyUpdated(projectId_, *assembly, {}, {}));
    return {true, "Custom property saved.", {}};
}

CommandResult AssemblyCommandService::removeWrapperCustomProperty(const std::string& assemblyUuid, const std::string& key)
{
    auto assembly = registry_.getAssemblyByUuid(assemblyUuid);
    if (!assembly) {
        return {false, "Wrapper was not found.", {}};
    }
    const auto oldSize = assembly->customProperties.size();
    assembly->customProperties.erase(
        std::remove_if(assembly->customProperties.begin(), assembly->customProperties.end(), [&](const AssemblyProperty& property) {
            return property.key == key;
        }),
        assembly->customProperties.end());
    if (assembly->customProperties.size() == oldSize) {
        return {false, "Custom property was not found.", {}};
    }
    ++assembly->version;

    if (!registry_.updateAssembly(*assembly)) {
        return {false, "Custom property could not be removed.", {}};
    }
    if (!stampAssemblyProperties(*assembly)) {
        return {false, "Custom property was removed but BuildSync properties could not be restamped: " + propertyWriter_.lastDiagnostic(), {}};
    }
    registryStorage_.save(registry_);
    enqueueEvent("assembly_updated", JsonSerializer::assemblyUpdated(projectId_, *assembly, {}, {}));
    return {true, "Custom property removed.", {}};
}

CommandResult AssemblyCommandService::createInstanceFromSelectedWrapper(const PlanPlacement& placement)
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select one source wrapper member first.", {}};
    }
    const auto source = registry_.getAssemblyByElementGuid(selection.front().elementGuid);
    if (!source) {
        return {false, "Selected element is not part of a BuildSync source wrapper.", {}};
    }
    return placeWrapperInstance({source->assemblyUuid, source->name + " Instance", placement});
}

CommandResult AssemblyCommandService::placeMirroredWrapperInstance(const CreateWrapperInstanceRequest& request)
{
    CreateWrapperInstanceRequest mirrored = request;
    mirrored.placement.mirrored = true;
    return placeWrapperInstance(mirrored);
}

CommandResult AssemblyCommandService::placeWrapperInstance(const CreateWrapperInstanceRequest& request)
{
    auto source = registry_.getAssemblyByUuid(request.sourceAssemblyUuid);
    if (!source) {
        return {false, "Source wrapper was not found.", {}};
    }
    int removedMissingSourceMembers = 0;
    CommandResult health = pruneMissingSourceMembers(source->assemblyUuid, &removedMissingSourceMembers);
    if (!health.ok) {
        return health;
    }
    source = registry_.getAssemblyByUuid(request.sourceAssemblyUuid);
    if (!source) {
        return {false, "Source wrapper was removed because it had no live members to instance.", {}};
    }
    if (source->members.empty()) {
        return {false, "Source wrapper has no live members to instance. Missing source members removed=" +
            std::to_string(removedMissingSourceMembers) + ".", {}};
    }
    for (const auto& member : source->members) {
        if (!instanceOperator_->supportsElementType(member.elementType)) {
            return {false, "Unsupported element type for wrapper instancing: " + member.elementType + ".", {}};
        }
    }
    CommandResult components = ensureComponentsForAssembly(*source);
    if (!components.ok) {
        return components;
    }

    std::vector<ElementDuplicateRequest> duplicateRequests;
    for (const auto& component : registry_.listComponents(source->assemblyUuid)) {
        if (component.status != "active") {
            continue;
        }
        duplicateRequests.push_back({component.sourceElementGuid, component.componentId, component.elementType, component.role});
    }
    std::vector<SelectedElement> sourceElementsForFrame;
    sourceElementsForFrame.reserve(duplicateRequests.size());
    for (const auto& duplicateRequest : duplicateRequests) {
        sourceElementsForFrame.push_back({duplicateRequest.sourceElementGuid, duplicateRequest.elementType});
    }
    const RuntimeCoordinateFrame sourceFrame = coordinateFrameFromSnapshots(instanceOperator_->snapshotElements(sourceElementsForFrame));
    const auto duplicateResults = instanceOperator_->duplicateElements(duplicateRequests, request.placement);
    if (duplicateResults.size() != duplicateRequests.size()) {
        std::ostringstream detail;
        detail << "Instance placement failed while duplicating source elements: " << instanceOperator_->lastDiagnostic();
        for (const auto& duplicateRequest : duplicateRequests) {
            if (!existenceChecker_.exists(duplicateRequest.sourceElementGuid)) {
                detail << " failedSourceGuid=" << duplicateRequest.sourceElementGuid
                       << " component=" << duplicateRequest.componentId
                       << " type=" << duplicateRequest.elementType;
                break;
            }
        }
        return {false, detail.str(), {}};
    }

    WrapperInstance instance;
    instance.instanceUuid = uuidFactory_();
    instance.sourceAssemblyUuid = source->assemblyUuid;
    instance.name = request.name.empty() ? source->name + " Instance" : request.name;
    instance.transform = {request.placement.originX, request.placement.originY, request.placement.rotationDegrees, request.placement.mirrored};
    instance.sourceFrame = {sourceFrame.originX, sourceFrame.originY, sourceFrame.rotationDegrees, sourceFrame.valid};
    const RuntimeCoordinateFrame placedFrame = coordinateFrameFromStoredPlacement(sourceFrame, instance);
    instance.liveFrame = placedFrame.valid
        ? CoordinateSpaceFrame{placedFrame.originX, placedFrame.originY, placedFrame.rotationDegrees, true}
        : CoordinateSpaceFrame{request.placement.originX, request.placement.originY, request.placement.rotationDegrees, true};
    instance.isMirrored = request.placement.mirrored;
    instance.sourceIsCountable = true;
    instance.localOverridesAllowed = false;
    instance.status = "active";

    std::vector<std::string> instanceGuids;
    std::vector<WrapperInstanceMember> instanceMembers;
    for (const auto& duplicated : duplicateResults) {
        instanceGuids.push_back(duplicated.elementGuid);
        instanceMembers.push_back({
            instance.instanceUuid,
            duplicated.componentId,
            duplicated.elementGuid,
            duplicated.elementType,
            duplicated.role,
            "active",
        });
    }
    instance.nativeGroupId = instanceOperator_->groupElements(instanceGuids);
    if (!registry_.createInstance(instance, instanceMembers)) {
        std::ostringstream detail;
        detail << "Instance registry record could not be created. source=" << instance.sourceAssemblyUuid
               << " instance=" << instance.instanceUuid
               << " components=" << duplicateRequests.size()
               << " duplicated=" << duplicateResults.size()
               << " members=" << instanceMembers.size();
        if (!instanceMembers.empty()) {
            detail << " firstMemberGuid=" << instanceMembers.front().elementGuid
                   << " firstComponent=" << instanceMembers.front().componentId;
        }
        return {false, detail.str(), {}};
    }
    if (!stampInstanceProperties(*source, instance)) {
        registry_.deleteInstance(instance.instanceUuid);
        return {false, "Instance was created but BuildSync properties could not be written: " + propertyWriter_.lastDiagnostic(), {}};
    }
    registryStorage_.save(registry_);
    return {true, "Wrapper instance " + instance.name + " placed.", {}};
}

CommandResult AssemblyCommandService::selectWrapperInstance(const std::string& instanceUuid)
{
    const auto instance = registry_.getInstance(instanceUuid);
    if (!instance) {
        return {false, "Wrapper instance was not found.", {}};
    }
    std::vector<std::string> liveGuids;
    for (const auto& member : registry_.listInstanceMembers(instanceUuid)) {
        if (existenceChecker_.exists(member.elementGuid)) {
            liveGuids.push_back(member.elementGuid);
        }
    }
    if (liveGuids.empty()) {
        return {false, "Wrapper instance has no live Archicad members to select.", {}};
    }
    if (!highlightController_.selectElements(liveGuids)) {
        return {false, "Wrapper instance members could not be selected in Archicad.", {}};
    }
    return {true, "Wrapper instance selected.", {}};
}

CommandResult AssemblyCommandService::selectSelectedElementInstance()
{
    const auto instance = selectedInstance();
    if (!instance) {
        return {false, "Selected element is not part of a BuildSync wrapper instance.", {}};
    }
    return selectWrapperInstance(instance->instanceUuid);
}

CommandResult AssemblyCommandService::enterWrapperEditMode()
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select one source or instance member before entering edit mode.", {}};
    }

    std::string sourceAssemblyUuid;
    std::string instanceUuid;
    if (const auto instance = registry_.getInstanceByMemberElementGuid(selection.front().elementGuid)) {
        sourceAssemblyUuid = instance->sourceAssemblyUuid;
        instanceUuid = instance->instanceUuid;
    } else if (const auto source = registry_.getAssemblyByElementGuid(selection.front().elementGuid)) {
        sourceAssemblyUuid = source->assemblyUuid;
    } else {
        return {false, "Selected element is not part of a BuildSync source wrapper or instance.", {}};
    }

    auto source = registry_.getAssemblyByUuid(sourceAssemblyUuid);
    if (!source) {
        return {false, "Source wrapper for edit mode was not found.", {}};
    }
    int removedMissingSourceMembers = 0;
    CommandResult health = pruneMissingSourceMembers(sourceAssemblyUuid, &removedMissingSourceMembers);
    if (!health.ok) {
        return health;
    }
    if (removedMissingSourceMembers > 0) {
        return {false, "Source wrapper had missing members removed=" + std::to_string(removedMissingSourceMembers) +
            ". Re-enter edit mode with the repaired wrapper.", {}};
    }
    const CommandResult componentsReady = ensureComponentsForAssembly(*source);
    if (!componentsReady.ok) {
        return componentsReady;
    }
    const CommandResult bindingsReady = validateRelationshipBindingsForEdit(sourceAssemblyUuid);
    if (!bindingsReady.ok) {
        return bindingsReady;
    }
    const auto reboundSource = registry_.getAssemblyByUuid(sourceAssemblyUuid);
    if (!reboundSource) {
        return {false, "Source wrapper for edit mode was not found after relationship validation.", {}};
    }
    source = reboundSource;
    if (!instanceUuid.empty()) {
        const auto editTargetInstance = registry_.getInstance(instanceUuid);
        if (!editTargetInstance) {
            return {false, "Selected instance is no longer registered.", {}};
        }
        if (editTargetInstance->needsRepair) {
            return {false, "Selected instance is marked as needing repair. Run Repair Instance before entering edit mode.", {}};
        }
    }
    activeBaselineByElementGuid_.clear();
    activeComponentByElementGuid_.clear();
    WrapperEditSession session{uuidFactory_(), sourceAssemblyUuid, instanceUuid, source->version, "active", {}};
    activeGeometryTracePath_ = geometryTracePathForSession(registryStorage_, sourceAssemblyUuid, session.sessionUuid);
    {
        std::ostringstream trace;
        trace << "# BuildSync Geometry Trace\n";
        trace << "sessionUuid=" << session.sessionUuid << "\n";
        trace << "sourceAssemblyUuid=" << sourceAssemblyUuid << "\n";
        trace << "sourceVersion=" << source->version << "\n";
        trace << "editInstanceUuid=" << instanceUuid << "\n";
        trace << "selectedElements=";
        bool firstSelected = true;
        for (const auto& selected : selection) {
            if (!firstSelected) {
                trace << ",";
            }
            firstSelected = false;
            trace << selected.elementGuid << "[" << selected.elementType << "]";
        }
        trace << "\n";
        trace << "\n# Summary\n";
        trace << "Summary is updated by subsequent sections. Look for WARNING lines where an instance target frame matches the source/edit frame.\n";
        trace << "\n" << traceRegistryState(registry_, sourceAssemblyUuid);
        appendGeometryTrace(activeGeometryTracePath_, "pre-enter-edit", trace.str());
    }

    std::vector<SelectedElement> baselineElements;
    std::unordered_map<std::string, std::string> baselineInstanceByElementGuid;
    std::unordered_set<std::string> staleInstanceUuids;
    std::unordered_set<std::string> selectedElementGuids;
    for (const auto& selected : selection) {
        selectedElementGuids.insert(selected.elementGuid);
    }
    for (const auto& member : source->members) {
        const auto component = registry_.getComponentBySourceElementGuid(member.elementGuid);
        if (!component) {
            continue;
        }
        if (!existenceChecker_.exists(member.elementGuid)) {
            activeBaselineByElementGuid_.clear();
            activeComponentByElementGuid_.clear();
            return {false, "Source wrapper member is missing and cannot be used for shared edit propagation: " +
                member.elementGuid + " [" + member.elementType + "].", {}};
        }
        baselineElements.push_back({member.elementGuid, member.elementType});
        activeComponentByElementGuid_[member.elementGuid] = component->componentId;
    }
    for (const auto& instance : registry_.listInstances(sourceAssemblyUuid)) {
        if (instance.needsRepair) {
            continue;
        }
        for (const auto& member : registry_.listInstanceMembers(instance.instanceUuid)) {
            if (!existenceChecker_.exists(member.elementGuid)) {
                registry_.markInstanceNeedsRepair(instance.instanceUuid, true);
                staleInstanceUuids.insert(instance.instanceUuid);
                continue;
            }
            baselineElements.push_back({member.elementGuid, member.elementType});
            baselineInstanceByElementGuid[member.elementGuid] = instance.instanceUuid;
            activeComponentByElementGuid_[member.elementGuid] = member.componentId;
        }
    }
    auto baselineSnapshots = instanceOperator_->snapshotElements(baselineElements);
    appendGeometryTrace(
        activeGeometryTracePath_,
        "enter-edit-baseline/raw-snapshots",
        traceSnapshotList(
            "baselineRawSnapshots",
            baselineSnapshots,
            activeComponentByElementGuid_,
            baselineInstanceByElementGuid));
    std::vector<ElementSnapshot> sourcePlacementSnapshots;
    std::unordered_map<std::string, std::vector<ElementSnapshot>> instancePlacementSnapshots;
    for (const auto& snapshot : baselineSnapshots) {
        const auto instanceForElement = baselineInstanceByElementGuid.find(snapshot.elementGuid);
        if (instanceForElement == baselineInstanceByElementGuid.end()) {
            sourcePlacementSnapshots.push_back(snapshot);
        } else {
            instancePlacementSnapshots[instanceForElement->second].push_back(snapshot);
        }
    }
    const RuntimeCoordinateFrame sourcePlacementFrame = coordinateFrameFromSnapshots(sourcePlacementSnapshots);
    std::unordered_map<std::string, RuntimeCoordinateFrame> instancePlacementFrames;
    for (const auto& [placementInstanceUuid, placementSnapshots] : instancePlacementSnapshots) {
        instancePlacementFrames[placementInstanceUuid] = coordinateFrameFromSnapshots(placementSnapshots);
    }
    std::unordered_map<std::string, bool> hadStoredPlacementOffset;
    for (const auto& instance : registry_.listInstances(sourceAssemblyUuid)) {
        hadStoredPlacementOffset[instance.instanceUuid] = hasStoredPlacementOffset(instance);
    }
    const auto placementReconciliation = reconcilePlacementFramesForAssembly(
        registry_,
        *instanceOperator_,
        existenceChecker_,
        sourceAssemblyUuid);
    appendGeometryTrace(
        activeGeometryTracePath_,
        "enter-edit-baseline/reconciliation",
        traceReconciliationSummary(placementReconciliation) + "\n" +
            traceSnapshotList(
                "reconciledSnapshots",
                [&]() {
                    std::vector<ElementSnapshot> values;
                    values.reserve(placementReconciliation.snapshotsByElementGuid.size());
                    for (const auto& [_, snapshot] : placementReconciliation.snapshotsByElementGuid) {
                        values.push_back(snapshot);
                    }
                    return values;
                }(),
                activeComponentByElementGuid_,
                baselineInstanceByElementGuid) +
            "\n" + traceRegistryState(registry_, sourceAssemblyUuid));
    for (const auto& [placementInstanceUuid, refreshedFrame] : placementReconciliation.instanceFrames) {
        if (refreshedFrame.valid) {
            instancePlacementFrames[placementInstanceUuid] = refreshedFrame;
        }
    }
    const auto classificationFrameForInstance = [&](const std::string& placementInstanceUuid, const RuntimeCoordinateFrame& observedFrame) {
        if (observedFrame.valid) {
            return observedFrame;
        }
        if (placementReconciliation.sourceFrame.valid) {
            if (const auto placementInstance = registry_.getInstance(placementInstanceUuid)) {
                const RuntimeCoordinateFrame storedFrame = coordinateFrameFromStoredPlacement(placementReconciliation.sourceFrame, *placementInstance);
                if (storedFrame.valid) {
                    return storedFrame;
                }
            }
        }
        return observedFrame;
    };
    RuntimeCoordinateFrame sourceFrameForApply = placementReconciliation.sourceFrame.valid
        ? placementReconciliation.sourceFrame
        : sourcePlacementFrame;
    if (!sourceFrameForApply.valid) {
        sourceFrameForApply = persistedSourceFrameForAssembly(registry_, sourceAssemblyUuid);
    }
    for (const auto& [placementInstanceUuid, observedFrame] : instancePlacementFrames) {
        if (auto placementInstance = registry_.getInstance(placementInstanceUuid)) {
            const RuntimeCoordinateFrame storedFrame = coordinateFrameFromStoredPlacement(sourceFrameForApply, *placementInstance);
            RuntimeCoordinateFrame liveFrame = observedFrame.valid ? observedFrame : storedFrame;
            instancePlacementFrames[placementInstanceUuid] = liveFrame;
            if (sourceFrameForApply.valid) {
                placementInstance->sourceFrame = {
                    sourceFrameForApply.originX,
                    sourceFrameForApply.originY,
                    sourceFrameForApply.rotationDegrees,
                    sourceFrameForApply.valid,
                };
            }
            placementInstance->liveFrame = {
                liveFrame.originX,
                liveFrame.originY,
                liveFrame.rotationDegrees,
                liveFrame.valid,
            };
            registry_.updateInstance(*placementInstance);
        }
    }
    if (sourceFrameForApply.valid && !instancePlacementFrames.empty()) {
        for (const auto& [placementInstanceUuid, frame] : instancePlacementFrames) {
            const auto placementInstance = registry_.getInstance(placementInstanceUuid);
            const auto hadOffset = hadStoredPlacementOffset.find(placementInstanceUuid);
            if (!placementInstance || !frame.valid || hadOffset == hadStoredPlacementOffset.end() || !hadOffset->second) {
                continue;
            }
            if (squaredDistance(sourceFrameForApply, frame) <= 1.0e-6) {
                activeBaselineByElementGuid_.clear();
                activeComponentByElementGuid_.clear();
                return {false, "Source wrapper placement appears corrupted before edit mode. Source frame overlaps instance " +
                    placementInstanceUuid + " even though the instance has a stored placement offset. sourceFrame=" +
                    frameSummary(sourceFrameForApply) + " instanceFrame=" + frameSummary(frame) + "." +
                    tracePathMessage(activeGeometryTracePath_), {}};
            }
        }
        for (const auto& snapshot : sourcePlacementSnapshots) {
            if (!snapshot.boundsValid) {
                continue;
            }
            const double sourceDistance = squaredDistanceToBounds(sourceFrameForApply, snapshot);
            std::string nearestInstanceUuid;
            double nearestInstanceDistance = std::numeric_limits<double>::max();
            for (const auto& [placementInstanceUuid, frame] : instancePlacementFrames) {
                const RuntimeCoordinateFrame classificationFrame = classificationFrameForInstance(placementInstanceUuid, frame);
                const double distance = squaredDistanceToBounds(classificationFrame, snapshot);
                if (distance < nearestInstanceDistance) {
                    nearestInstanceDistance = distance;
                    nearestInstanceUuid = placementInstanceUuid;
                }
            }
            if (!nearestInstanceUuid.empty() && nearestInstanceDistance + 1.0e-8 < sourceDistance * 0.25) {
                activeBaselineByElementGuid_.clear();
                activeComponentByElementGuid_.clear();
                return {false, "Source wrapper placement appears corrupted before edit mode. Source member " +
                    snapshot.elementGuid + " [" + snapshot.elementType + "] is closer to instance " + nearestInstanceUuid +
                    " than to the persisted source frame. sourceFrame=" + frameSummary(sourceFrameForApply) +
                    " sourceMemberBounds=(" + std::to_string(snapshot.boundsCenterX) + "," + std::to_string(snapshot.boundsCenterY) + ")." +
                    tracePathMessage(activeGeometryTracePath_), {}};
            }
        }
    }
    RuntimeCoordinateFrame editPlacementFrame = sourceFrameForApply;
    std::string editPlacementId = AssemblyRegistry::sourcePlacementIdFor(sourceAssemblyUuid);
    std::string editPlacementKind = "source";
    if (!instanceUuid.empty()) {
        editPlacementId = instanceUuid;
        editPlacementKind = "instance";
        const auto editFrame = instancePlacementFrames.find(instanceUuid);
        if (editFrame != instancePlacementFrames.end()) {
            editPlacementFrame = editFrame->second;
        }
    }
    session.sourcePlacementFrame = {
        sourceFrameForApply.originX,
        sourceFrameForApply.originY,
        sourceFrameForApply.rotationDegrees,
        sourceFrameForApply.valid,
    };
    session.editPlacementId = editPlacementId;
    session.editPlacementKind = editPlacementKind;
    session.editPlacementFrame = {
        editPlacementFrame.originX,
        editPlacementFrame.originY,
        editPlacementFrame.rotationDegrees,
        editPlacementFrame.valid,
    };
    for (auto snapshot : baselineSnapshots) {
        const auto instanceForElement = baselineInstanceByElementGuid.find(snapshot.elementGuid);
        if (instanceForElement == baselineInstanceByElementGuid.end()) {
            applyCoordinateFrame(snapshot, sourceFrameForApply);
        } else {
            applyCoordinateFrame(snapshot, instancePlacementFrames[instanceForElement->second]);
        }
        snapshot.localPolygonCoords = localPolygonCoordsForFrame(snapshot.polygonCoords, runtimeFrameFromSnapshot(snapshot));
        activeBaselineByElementGuid_[snapshot.elementGuid] = snapshot;
        const auto component = activeComponentByElementGuid_.find(snapshot.elementGuid);
        session.baselines.push_back({
            component == activeComponentByElementGuid_.end() ? "" : component->second,
            snapshot.elementGuid,
            registry_.getInstanceByMemberElementGuid(snapshot.elementGuid).has_value()
                ? registry_.getInstanceByMemberElementGuid(snapshot.elementGuid)->instanceUuid
                : "",
            {
                snapshot.coordinateOriginX,
                snapshot.coordinateOriginY,
                snapshot.coordinateRotationDegrees,
                snapshot.coordinateFrameValid,
            },
            snapshot.snapshotJson,
        });
    }
    appendGeometryTrace(
        activeGeometryTracePath_,
        "enter-edit-baseline/applied-coordinate-frames",
        traceSnapshotList(
            "activeBaselines",
            [&]() {
                std::vector<ElementSnapshot> values;
                values.reserve(activeBaselineByElementGuid_.size());
                for (const auto& [_, snapshot] : activeBaselineByElementGuid_) {
                    values.push_back(snapshot);
                }
                return values;
            }(),
            activeComponentByElementGuid_,
            baselineInstanceByElementGuid));
    if (activeBaselineByElementGuid_.size() != baselineElements.size()) {
        std::ostringstream missing;
        bool first = true;
        for (const auto& element : baselineElements) {
            if (activeBaselineByElementGuid_.count(element.elementGuid) > 0) {
                continue;
            }
            if (selectedElementGuids.count(element.elementGuid) > 0) {
                missing << (first ? "" : ", ") << element.elementGuid << " [" << element.elementType << "]";
                first = false;
                continue;
            }
            const auto failedInstance = baselineInstanceByElementGuid.find(element.elementGuid);
            if (failedInstance != baselineInstanceByElementGuid.end()) {
                registry_.markInstanceNeedsRepair(failedInstance->second, true);
                staleInstanceUuids.insert(failedInstance->second);
                continue;
            }
            missing << (first ? "" : ", ") << element.elementGuid << " [" << element.elementType << "]";
            first = false;
        }
        if (!missing.str().empty()) {
            activeBaselineByElementGuid_.clear();
            activeComponentByElementGuid_.clear();
            return {false, "Wrapper edit mode could not capture baseline geometry for source/edit target members: " +
                missing.str() + ". " + instanceOperator_->lastDiagnostic(), {}};
        }
        std::vector<WrapperEditBaseline> retainedBaselines;
        for (const auto& baseline : session.baselines) {
            if (activeBaselineByElementGuid_.count(baseline.elementGuid) > 0) {
                retainedBaselines.push_back(baseline);
            }
        }
        session.baselines = retainedBaselines;
    }
    if (!staleInstanceUuids.empty()) {
        for (const auto& repairedInstance : registry_.listInstances(sourceAssemblyUuid)) {
            if (staleInstanceUuids.count(repairedInstance.instanceUuid) > 0) {
                stampInstanceProperties(*source, repairedInstance);
            }
        }
    }
    registryStorage_.save(registry_);
    activeEditSession_ = session;
    return {true, "Wrapper edit mode started. Applying edits will update the physical source wrapper and every linked instance." +
        tracePathMessage(activeGeometryTracePath_), {}};
}

CommandResult AssemblyCommandService::applyWrapperEdit()
{
    if (!activeEditSession_) {
        return {false, "No active wrapper edit session.", {}};
    }
    auto source = registry_.getAssemblyByUuid(activeEditSession_->sourceAssemblyUuid);
    if (!source) {
        activeEditSession_.reset();
        return {false, "Source wrapper for edit session was not found.", {}};
    }
    int removedMissingSourceMembers = 0;
    CommandResult health = pruneMissingSourceMembers(source->assemblyUuid, &removedMissingSourceMembers);
    if (!health.ok) {
        activeEditSession_.reset();
        return health;
    }
    if (removedMissingSourceMembers > 0) {
        activeEditSession_.reset();
        return {false, "Source wrapper had missing members removed=" + std::to_string(removedMissingSourceMembers) +
            ". The active edit session was cancelled; re-enter edit mode with the repaired wrapper.", {}};
    }
    if (source->version != activeEditSession_->baselineAssemblyVersion) {
        return {false, "Wrapper edit session is stale because another edit changed the source wrapper.", {}};
    }
    if (activeBaselineByElementGuid_.empty()) {
        return {false, "Wrapper edit session has no baseline geometry. Re-enter edit mode before applying.", {}};
    }
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select the edited source or instance members before applying wrapper edit.", {}};
    }
    std::unordered_map<std::string, std::string> selectedInstanceByElementGuid;
    for (const auto& selected : selection) {
        if (const auto selectedInstance = registry_.getInstanceByMemberElementGuid(selected.elementGuid)) {
            selectedInstanceByElementGuid[selected.elementGuid] = selectedInstance->instanceUuid;
        }
    }
    std::unordered_set<std::string> editedElementGuids;
    for (const auto& selected : selection) {
        editedElementGuids.insert(selected.elementGuid);
    }

    auto snapshots = instanceOperator_->snapshotElements(selection);
    appendGeometryTrace(
        activeGeometryTracePath_,
        "apply-selection/raw-snapshots",
        traceSnapshotList(
            "editedSelectionRaw",
            snapshots,
            activeComponentByElementGuid_,
            selectedInstanceByElementGuid));
    for (auto& snapshot : snapshots) {
        const auto baseline = activeBaselineByElementGuid_.find(snapshot.elementGuid);
        if (baseline == activeBaselineByElementGuid_.end()) {
            continue;
        }
        snapshot.coordinateOriginX = baseline->second.coordinateOriginX;
        snapshot.coordinateOriginY = baseline->second.coordinateOriginY;
        snapshot.coordinateRotationDegrees = baseline->second.coordinateRotationDegrees;
        snapshot.coordinateFrameValid = baseline->second.coordinateFrameValid;
        snapshot.localPolygonCoords = localPolygonCoordsForFrame(snapshot.polygonCoords, localDefinitionFrameFromSnapshot(snapshot));
    }
    appendGeometryTrace(
        activeGeometryTracePath_,
        "apply-selection/rebased-snapshots",
        traceSnapshotList(
            "editedSelectionRebased",
            snapshots,
            activeComponentByElementGuid_,
            selectedInstanceByElementGuid));
    std::unordered_map<std::string, ElementSnapshot> snapshotsByComponentId;
    std::unordered_map<std::string, ElementSnapshot> editedBaselinesByComponentId;
    std::unordered_set<std::string> editedSourceSlabComponentIds;
    std::vector<std::string> slabApplyDiagnostics;
    std::vector<std::string> addedElementCandidates;
    std::vector<std::string> cleanedEditedTargetGuids;
    std::vector<std::string> ignoredUnregisteredDuplicateGuids;
    std::vector<EditedSlabRecord> editedSlabRecords;
    std::vector<EditedPlacementRecord> editedPlacementRecords;
    bool sourceMembersReboundDuringSnapshotMatch = false;
    bool instanceMembersReboundDuringSnapshotMatch = false;
    const auto cleanupEditedTargetOldGuid = [&](const std::string& oldGuid, const std::string& newGuid, const std::string& componentId, const std::string& placementId, std::string& diagnostic) {
        if (oldGuid.empty() || oldGuid == newGuid || !existenceChecker_.exists(oldGuid)) {
            return true;
        }
        const auto baseline = activeBaselineByElementGuid_.find(oldGuid);
        if (baseline == activeBaselineByElementGuid_.end()) {
            diagnostic = "Edited target " + placementId + "/" + componentId +
                " rebound to " + newGuid + " but stale old GUID " + oldGuid +
                " has no baseline for safe cleanup.";
            return false;
        }
        if (baseline->second.elementType != "Slab") {
            diagnostic = "Edited target " + placementId + "/" + componentId +
                " rebound to " + newGuid + " but stale old GUID " + oldGuid +
                " is not a slab in the edit baseline.";
            return false;
        }
        const auto staleSnapshots = instanceOperator_->snapshotElements({{oldGuid, "Slab"}});
        if (staleSnapshots.empty() || staleSnapshots.front().elementType != "Slab" ||
            !snapshotBoundsMatch(staleSnapshots.front(), baseline->second)) {
            diagnostic = "Edited target " + placementId + "/" + componentId +
                " rebound to " + newGuid + " but stale old GUID " + oldGuid +
                " could not be validated against pre-edit slab bounds.";
            return false;
        }
        if (!instanceOperator_->deleteElements({oldGuid})) {
            diagnostic = "Edited target " + placementId + "/" + componentId +
                " rebound to " + newGuid + " but stale old GUID " + oldGuid +
                " could not be deleted: " + instanceOperator_->lastDiagnostic();
            return false;
        }
        if (existenceChecker_.exists(oldGuid)) {
            diagnostic = "Edited target " + placementId + "/" + componentId +
                " rebound to " + newGuid + " but stale old GUID " + oldGuid +
                " still exists after deletion.";
            return false;
        }
        cleanedEditedTargetGuids.push_back(oldGuid);
        slabApplyDiagnostics.push_back("cleanedEditedTargetOldGuid=" + oldGuid +
            " replacement=" + newGuid +
            " placement=" + placementId +
            " component=" + componentId);
        return true;
    };
    for (const auto& snapshot : snapshots) {
        if (const auto sourceComponent = registry_.getComponentBySourceElementGuid(snapshot.elementGuid)) {
            snapshotsByComponentId[sourceComponent->componentId] = snapshot;
            editedPlacementRecords.push_back({
                AssemblyRegistry::sourcePlacementIdFor(source->assemblyUuid),
                sourceComponent->componentId,
                snapshot.elementGuid,
                snapshot.elementType,
            });
            if (snapshot.elementType == "Slab") {
                editedSourceSlabComponentIds.insert(sourceComponent->componentId);
                slabApplyDiagnostics.push_back("selectedSourceSlab=" + snapshot.elementGuid +
                    " component=" + sourceComponent->componentId);
            }
            const auto baseline = activeBaselineByElementGuid_.find(snapshot.elementGuid);
            if (baseline != activeBaselineByElementGuid_.end()) {
                editedBaselinesByComponentId[sourceComponent->componentId] = baseline->second;
                if (snapshot.elementType == "Slab") {
                    editedSlabRecords.push_back({
                        AssemblyRegistry::sourcePlacementIdFor(source->assemblyUuid),
                        sourceComponent->componentId,
                        snapshot.elementGuid,
                        snapshot,
                        baseline->second,
                    });
                }
            }
            WrapperComponent updated = *sourceComponent;
            updated.snapshotJson = snapshot.snapshotJson;
            updated.localPolygonCoords = snapshot.localPolygonCoords;
            registry_.upsertComponent(updated);
        } else if (const auto editedInstance = registry_.getInstanceByMemberElementGuid(snapshot.elementGuid)) {
            for (const auto& member : registry_.listInstanceMembers(editedInstance->instanceUuid)) {
                if (member.elementGuid == snapshot.elementGuid) {
                    snapshotsByComponentId[member.componentId] = snapshot;
                    editedPlacementRecords.push_back({
                        editedInstance->instanceUuid,
                        member.componentId,
                        snapshot.elementGuid,
                        snapshot.elementType,
                    });
                    if (snapshot.elementType == "Slab") {
                        slabApplyDiagnostics.push_back("selectedInstanceSlab=" + snapshot.elementGuid +
                            " instance=" + editedInstance->instanceUuid +
                            " component=" + member.componentId);
                    }
                    const auto baseline = activeBaselineByElementGuid_.find(snapshot.elementGuid);
                    if (baseline != activeBaselineByElementGuid_.end()) {
                        editedBaselinesByComponentId[member.componentId] = baseline->second;
                        if (snapshot.elementType == "Slab") {
                            editedSlabRecords.push_back({
                                editedInstance->instanceUuid,
                                member.componentId,
                                snapshot.elementGuid,
                                snapshot,
                                baseline->second,
                            });
                        }
                    }
                    if (auto component = registry_.getComponent(member.componentId)) {
                        component->snapshotJson = snapshot.snapshotJson;
                        component->localPolygonCoords = snapshot.localPolygonCoords;
                        registry_.upsertComponent(*component);
                    }
                    break;
                }
            }
        } else if (snapshot.elementType == "Slab" && activeEditSession_->instanceUuid.empty()) {
            std::string bestComponentId;
            std::string bestSourceGuid;
            ElementSnapshot bestBaseline;
            int candidateCount = 0;
            double bestDistance = std::numeric_limits<double>::max();
            double secondBestDistance = std::numeric_limits<double>::max();
            for (const auto& baseline : activeEditSession_->baselines) {
                if (!baseline.instanceUuid.empty() || baseline.componentId.empty()) {
                    continue;
                }
                const auto component = registry_.getComponent(baseline.componentId);
                if (!component || component->sourceAssemblyUuid != source->assemblyUuid || component->elementType != "Slab") {
                    continue;
                }
                const auto baselineSnapshot = activeBaselineByElementGuid_.find(baseline.elementGuid);
                if (baselineSnapshot == activeBaselineByElementGuid_.end()) {
                    continue;
                }
                ++candidateCount;
                double distance = 0.0;
                if (snapshot.boundsValid && baselineSnapshot->second.boundsValid) {
                    const double dx = snapshot.boundsCenterX - baselineSnapshot->second.boundsCenterX;
                    const double dy = snapshot.boundsCenterY - baselineSnapshot->second.boundsCenterY;
                    distance = dx * dx + dy * dy;
                }
                if (distance < bestDistance) {
                    secondBestDistance = bestDistance;
                    bestDistance = distance;
                    bestComponentId = baseline.componentId;
                    bestSourceGuid = component->sourceElementGuid;
                    bestBaseline = baselineSnapshot->second;
                } else if (distance < secondBestDistance) {
                    secondBestDistance = distance;
                }
            }
            const bool unambiguousSingleSourceSlab = candidateCount == 1;
            const bool unambiguousNearestSourceSlab =
                snapshot.boundsValid && candidateCount > 1 && bestDistance + 1.0e-8 < secondBestDistance * 0.25;
            if (!bestComponentId.empty() && (unambiguousSingleSourceSlab || unambiguousNearestSourceSlab)) {
                ElementSnapshot rebasedSnapshot = snapshot;
                rebasedSnapshot.coordinateOriginX = bestBaseline.coordinateOriginX;
                rebasedSnapshot.coordinateOriginY = bestBaseline.coordinateOriginY;
                rebasedSnapshot.coordinateRotationDegrees = bestBaseline.coordinateRotationDegrees;
                rebasedSnapshot.coordinateFrameValid = bestBaseline.coordinateFrameValid;
                rebasedSnapshot.localPolygonCoords =
                    localPolygonCoordsForFrame(rebasedSnapshot.polygonCoords, localDefinitionFrameFromSnapshot(rebasedSnapshot));
                snapshotsByComponentId[bestComponentId] = rebasedSnapshot;
                editedBaselinesByComponentId[bestComponentId] = bestBaseline;
                editedSlabRecords.push_back({
                    AssemblyRegistry::sourcePlacementIdFor(source->assemblyUuid),
                    bestComponentId,
                    snapshot.elementGuid,
                    rebasedSnapshot,
                    bestBaseline,
                });
                editedPlacementRecords.push_back({
                    AssemblyRegistry::sourcePlacementIdFor(source->assemblyUuid),
                    bestComponentId,
                    snapshot.elementGuid,
                    snapshot.elementType,
                });
                editedSourceSlabComponentIds.insert(bestComponentId);
                slabApplyDiagnostics.push_back("selectedSourceSlabGuidChanged=" + snapshot.elementGuid +
                    " previousSource=" + bestSourceGuid +
                    " component=" + bestComponentId);
                if (snapshot.elementGuid != bestSourceGuid) {
                    if (!registry_.replaceSourceMemberElement(source->assemblyUuid, bestComponentId, snapshot.elementGuid)) {
                        return {false, "Edited source slab " + snapshot.elementGuid +
                            " matched component " + bestComponentId +
                            " but source registry rebinding failed from " + bestSourceGuid + ".", {}};
                    }
                    std::string cleanupDiagnostic;
                    if (!cleanupEditedTargetOldGuid(
                        bestSourceGuid,
                        snapshot.elementGuid,
                        bestComponentId,
                        AssemblyRegistry::sourcePlacementIdFor(source->assemblyUuid),
                        cleanupDiagnostic)) {
                        return {false, cleanupDiagnostic, {}};
                    }
                    sourceMembersReboundDuringSnapshotMatch = true;
                }
                if (auto component = registry_.getComponent(bestComponentId)) {
                    component->sourceElementGuid = snapshot.elementGuid;
                    component->snapshotJson = rebasedSnapshot.snapshotJson;
                    component->localPolygonCoords = rebasedSnapshot.localPolygonCoords;
                    registry_.upsertComponent(*component);
                }
            } else {
                addedElementCandidates.push_back(snapshot.elementGuid + " [" + snapshot.elementType + "]");
            }
        } else if (snapshot.elementType == "Slab" && !activeEditSession_->instanceUuid.empty()) {
            std::string bestComponentId;
            std::string bestInstanceGuid;
            ElementSnapshot bestBaseline;
            int candidateCount = 0;
            double bestDistance = std::numeric_limits<double>::max();
            double secondBestDistance = std::numeric_limits<double>::max();
            for (const auto& baseline : activeEditSession_->baselines) {
                if (baseline.instanceUuid != activeEditSession_->instanceUuid || baseline.componentId.empty()) {
                    continue;
                }
                const auto component = registry_.getComponent(baseline.componentId);
                if (!component || component->sourceAssemblyUuid != source->assemblyUuid || component->elementType != "Slab") {
                    continue;
                }
                const auto baselineSnapshot = activeBaselineByElementGuid_.find(baseline.elementGuid);
                if (baselineSnapshot == activeBaselineByElementGuid_.end()) {
                    continue;
                }
                ++candidateCount;
                double distance = 0.0;
                if (snapshot.boundsValid && baselineSnapshot->second.boundsValid) {
                    const double dx = snapshot.boundsCenterX - baselineSnapshot->second.boundsCenterX;
                    const double dy = snapshot.boundsCenterY - baselineSnapshot->second.boundsCenterY;
                    distance = dx * dx + dy * dy;
                }
                if (distance < bestDistance) {
                    secondBestDistance = bestDistance;
                    bestDistance = distance;
                    bestComponentId = baseline.componentId;
                    bestInstanceGuid = baseline.elementGuid;
                    bestBaseline = baselineSnapshot->second;
                } else if (distance < secondBestDistance) {
                    secondBestDistance = distance;
                }
            }
            const bool unambiguousSingleInstanceSlab = candidateCount == 1;
            const bool unambiguousNearestInstanceSlab =
                snapshot.boundsValid && candidateCount > 1 && bestDistance + 1.0e-8 < secondBestDistance * 0.25;
            if (!bestComponentId.empty() && (unambiguousSingleInstanceSlab || unambiguousNearestInstanceSlab)) {
                ElementSnapshot rebasedSnapshot = snapshot;
                rebasedSnapshot.coordinateOriginX = bestBaseline.coordinateOriginX;
                rebasedSnapshot.coordinateOriginY = bestBaseline.coordinateOriginY;
                rebasedSnapshot.coordinateRotationDegrees = bestBaseline.coordinateRotationDegrees;
                rebasedSnapshot.coordinateFrameValid = bestBaseline.coordinateFrameValid;
                rebasedSnapshot.localPolygonCoords =
                    localPolygonCoordsForFrame(rebasedSnapshot.polygonCoords, localDefinitionFrameFromSnapshot(rebasedSnapshot));
                snapshotsByComponentId[bestComponentId] = rebasedSnapshot;
                editedBaselinesByComponentId[bestComponentId] = bestBaseline;
                editedSlabRecords.push_back({
                    activeEditSession_->instanceUuid,
                    bestComponentId,
                    snapshot.elementGuid,
                    rebasedSnapshot,
                    bestBaseline,
                });
                editedPlacementRecords.push_back({
                    activeEditSession_->instanceUuid,
                    bestComponentId,
                    snapshot.elementGuid,
                    snapshot.elementType,
                });
                slabApplyDiagnostics.push_back("selectedInstanceSlabGuidChanged=" + snapshot.elementGuid +
                    " previousInstanceMember=" + bestInstanceGuid +
                    " instance=" + activeEditSession_->instanceUuid +
                    " component=" + bestComponentId);
                if (snapshot.elementGuid != bestInstanceGuid) {
                    if (!registry_.replaceInstanceMemberElement(activeEditSession_->instanceUuid, bestComponentId, snapshot.elementGuid)) {
                        registry_.markInstanceNeedsRepair(activeEditSession_->instanceUuid, true);
                        return {false, "Edited instance slab " + snapshot.elementGuid +
                            " matched component " + bestComponentId +
                            " but instance registry rebinding failed from " + bestInstanceGuid + ".", {}};
                    }
                    std::string cleanupDiagnostic;
                    if (!cleanupEditedTargetOldGuid(
                        bestInstanceGuid,
                        snapshot.elementGuid,
                        bestComponentId,
                        activeEditSession_->instanceUuid,
                        cleanupDiagnostic)) {
                        registry_.markInstanceNeedsRepair(activeEditSession_->instanceUuid, true);
                        return {false, cleanupDiagnostic, {}};
                    }
                    instanceMembersReboundDuringSnapshotMatch = true;
                }
                if (auto component = registry_.getComponent(bestComponentId)) {
                    component->snapshotJson = rebasedSnapshot.snapshotJson;
                    component->localPolygonCoords = rebasedSnapshot.localPolygonCoords;
                    registry_.upsertComponent(*component);
                }
            } else {
                addedElementCandidates.push_back(snapshot.elementGuid + " [" + snapshot.elementType + "]");
            }
        } else {
            bool duplicateOfMatchedEditedSlab = false;
            if (snapshot.elementType == "Slab" && snapshot.boundsValid) {
                for (const auto& editedSlab : editedSlabRecords) {
                    if (!editedSlab.selectedSnapshot.boundsValid ||
                        !snapshotBoundsMatch(snapshot, editedSlab.selectedSnapshot)) {
                        continue;
                    }
                    const bool topologyMatches = snapshot.topologySignature.empty() ||
                        editedSlab.selectedSnapshot.topologySignature.empty() ||
                        snapshot.topologySignature == editedSlab.selectedSnapshot.topologySignature;
                    if (topologyMatches) {
                        duplicateOfMatchedEditedSlab = true;
                        break;
                    }
                }
            }
            if (duplicateOfMatchedEditedSlab) {
                if (!instanceOperator_->deleteElements({snapshot.elementGuid})) {
                    return {false, "Unregistered duplicate slab " + snapshot.elementGuid +
                        " matched an edited wrapper slab but could not be deleted before propagation: " +
                        instanceOperator_->lastDiagnostic() + tracePathMessage(activeGeometryTracePath_), {}};
                }
                if (existenceChecker_.exists(snapshot.elementGuid)) {
                    return {false, "Unregistered duplicate slab " + snapshot.elementGuid +
                        " matched an edited wrapper slab but still exists after cleanup." +
                        tracePathMessage(activeGeometryTracePath_), {}};
                }
                cleanedEditedTargetGuids.push_back(snapshot.elementGuid);
                ignoredUnregisteredDuplicateGuids.push_back(snapshot.elementGuid);
                slabApplyDiagnostics.push_back("cleanedUnregisteredDuplicateSelection=" + snapshot.elementGuid);
                appendGeometryTrace(
                    activeGeometryTracePath_,
                    "apply-selection/cleaned-unregistered-duplicate",
                    "guid=" + snapshot.elementGuid + "\n" + traceSnapshotSummary(snapshot));
            } else {
                addedElementCandidates.push_back(snapshot.elementGuid + " [" + snapshot.elementType + "]");
            }
        }
    }
    if (sourceMembersReboundDuringSnapshotMatch) {
        source = registry_.getAssemblyByUuid(source->assemblyUuid);
        if (!source) {
            return {false, "Source wrapper was not found after edited source slab registry rebinding.", {}};
        }
    }
    if (instanceMembersReboundDuringSnapshotMatch && !activeEditSession_->instanceUuid.empty()) {
        const auto reboundInstance = registry_.getInstance(activeEditSession_->instanceUuid);
        if (!reboundInstance) {
            return {false, "Edited instance was not found after member registry rebinding.", {}};
        }
    }
    if (snapshotsByComponentId.empty()) {
        return {false, "No edited members could be matched to source components. Use the apply review to classify add/delete/replace changes.", {}};
    }
    if (!addedElementCandidates.empty()) {
        return {false, "Edited working set contains added elements that were classified but cannot be propagated until add/delete edit deltas are enabled: " +
            joinStrings(addedElementCandidates) + "." + tracePathMessage(activeGeometryTracePath_), {}};
    }
    if (editedBaselinesByComponentId.size() != snapshotsByComponentId.size()) {
        return {false, "Edited members do not have baseline geometry. Re-enter edit mode before applying.", {}};
    }

    auto applyReconciliation = reconcilePlacementFramesForAssembly(
        registry_,
        *instanceOperator_,
        existenceChecker_,
        source->assemblyUuid);

    std::unordered_set<std::string> protectedEditedPlacementComponents;
    for (const auto& editedPlacement : editedPlacementRecords) {
        protectedEditedPlacementComponents.insert(placementComponentKey(editedPlacement.placementId, editedPlacement.componentId));
        slabApplyDiagnostics.push_back("protectedEditedPlacementIdentity=" + editedPlacement.placementId +
            " component=" + editedPlacement.componentId +
            " guid=" + editedPlacement.elementGuid +
            " type=" + editedPlacement.elementType);
    }
    for (const auto& editedSlab : editedSlabRecords) {
        protectedEditedPlacementComponents.insert(placementComponentKey(editedSlab.placementId, editedSlab.componentId));
        slabApplyDiagnostics.push_back("protectedEditedPlacement=" + editedSlab.placementId +
            " component=" + editedSlab.componentId +
            " selected=" + editedSlab.selectedGuid);
    }

    const auto resetActiveEditSession = [&]() {
        activeEditSession_.reset();
        activeBaselineByElementGuid_.clear();
        activeComponentByElementGuid_.clear();
    };

    const auto cleanupEditedPlacementDuplicates = [&](const std::string& phase) -> std::optional<std::string> {
        for (const auto& editedSlab : editedSlabRecords) {
            if (!editedSlab.selectedSnapshot.boundsValid && !editedSlab.baselineSnapshot.boundsValid) {
                continue;
            }

            std::vector<SlabCandidate> candidates;
            std::unordered_set<std::string> seenCandidateGuids;
            std::unordered_set<std::string> nearbyCandidateGuids;
            const auto addCandidates = [&](const std::vector<SlabCandidate>& found, bool isNearby) {
                for (const auto& candidate : found) {
                    if (isNearby) {
                        nearbyCandidateGuids.insert(candidate.snapshot.elementGuid);
                    }
                    if (seenCandidateGuids.insert(candidate.snapshot.elementGuid).second) {
                        candidates.push_back(candidate);
                    }
                }
            };
            if (editedSlab.selectedSnapshot.boundsValid) {
                addCandidates(instanceOperator_->findSlabCandidatesNear(
                    editedSlab.selectedSnapshot.boundsCenterX,
                    editedSlab.selectedSnapshot.boundsCenterY,
                    1.0), true);
            }
            if (editedSlab.baselineSnapshot.boundsValid) {
                addCandidates(instanceOperator_->findSlabCandidatesNear(
                    editedSlab.baselineSnapshot.boundsCenterX,
                    editedSlab.baselineSnapshot.boundsCenterY,
                    1.0), true);
            }
            addCandidates(instanceOperator_->findBuildSyncSlabCandidates(source->assemblyUuid), false);

            std::string authoritativeGuid = editedSlab.selectedGuid;
            if (const auto binding = registry_.getPlacementBinding(editedSlab.placementId, editedSlab.componentId)) {
                if (!binding->elementGuid.empty()) {
                    authoritativeGuid = binding->elementGuid;
                }
            }
            if (!existenceChecker_.exists(authoritativeGuid) && existenceChecker_.exists(editedSlab.selectedGuid)) {
                authoritativeGuid = editedSlab.selectedGuid;
            }

            std::vector<SlabCandidate> provenStale;
            std::vector<SlabCandidate> legacyFallback;
            std::vector<std::string> ambiguous;
            std::vector<std::string> kept;
            for (const auto& candidate : candidates) {
                const bool candidateIsAuthoritative = candidate.snapshot.elementGuid == authoritativeGuid;
                const bool candidateIsNearby = nearbyCandidateGuids.count(candidate.snapshot.elementGuid) > 0;
                const bool hasUsableIdentity = candidate.hasBuildSyncProperties &&
                    hasUsableBuildSyncIdentity(candidate.buildSyncProperties);
                const bool sameSourceIdentity = candidate.hasBuildSyncProperties &&
                    candidate.buildSyncProperties.sourceAssemblyUuid == source->assemblyUuid;
                const bool metadataMatches = hasUsableIdentity &&
                    buildSyncIdentityMatches(
                        candidate.buildSyncProperties,
                        source->assemblyUuid,
                        editedSlab.placementId,
                        editedSlab.componentId);
                const bool baselineMatches = snapshotBoundsMatch(candidate.snapshot, editedSlab.baselineSnapshot) &&
                    (editedSlab.baselineSnapshot.topologySignature.empty() ||
                        candidate.snapshot.topologySignature == editedSlab.baselineSnapshot.topologySignature);
                if (candidateIsAuthoritative) {
                    kept.push_back("authoritative-registry-bound:" + candidateSummary(candidate));
                    continue;
                }
                if (metadataMatches) {
                    provenStale.push_back(candidate);
                    continue;
                }
                if (sameSourceIdentity && candidateIsNearby) {
                    const auto candidateBinding = registry_.getPlacementBindingByElementGuid(candidate.snapshot.elementGuid);
                    if (candidateBinding) {
                        kept.push_back("same-source-nearby-bound-other-component:" + candidateSummary(candidate));
                    } else {
                        provenStale.push_back(candidate);
                    }
                    continue;
                }
                if (hasUsableIdentity) {
                    kept.push_back("different-buildsync-identity:" + candidateSummary(candidate));
                    continue;
                }
                if (candidate.hasBuildSyncProperties) {
                    kept.push_back("partial-buildsync-identity:" + candidateSummary(candidate));
                    continue;
                }
                if (candidateIsNearby && baselineMatches) {
                    legacyFallback.push_back(candidate);
                }
            }

            if (!legacyFallback.empty()) {
                if (legacyFallback.size() == 1) {
                    provenStale.push_back(legacyFallback.front());
                } else {
                    for (const auto& candidate : legacyFallback) {
                        ambiguous.push_back("legacy-baseline-match:" + candidateSummary(candidate));
                    }
                }
            }

            if (!ambiguous.empty()) {
                return "Edited slab duplicate cleanup refused ambiguous candidates during " + phase +
                    " for " + editedSlab.placementId + "/" + editedSlab.componentId +
                    " authoritative=" + authoritativeGuid +
                    ": " + joinStrings(ambiguous) +
                    " kept=" + joinStrings(kept) + ".";
            }

            for (const auto& stale : provenStale) {
                if (!instanceOperator_->deleteElements({stale.snapshot.elementGuid})) {
                    return "Edited slab duplicate cleanup failed deleting " + stale.snapshot.elementGuid +
                        " during " + phase + ": " + instanceOperator_->lastDiagnostic();
                }
                if (existenceChecker_.exists(stale.snapshot.elementGuid)) {
                    return "Edited slab duplicate cleanup deleted " + stale.snapshot.elementGuid +
                        " during " + phase + " but it still exists.";
                }
                slabApplyDiagnostics.push_back("cleanedEditedPlacementOrphan=" + stale.snapshot.elementGuid +
                    " placement=" + editedSlab.placementId +
                    " component=" + editedSlab.componentId +
                    " authoritative=" + authoritativeGuid +
                    " phase=" + phase);
            }
        }
        return std::nullopt;
    };

    bool failed = false;
    std::string failureMessage;
    int skippedEditedSlabTargets = 0;
    for (const auto& sourceMember : source->members) {
        const auto component = registry_.getComponentBySourceElementGuid(sourceMember.elementGuid);
        if (!component) {
            continue;
        }
        const auto snapshot = snapshotsByComponentId.find(component->componentId);
        if (snapshot == snapshotsByComponentId.end()) {
            continue;
        }
        const bool protectedSourcePlacement =
            protectedEditedPlacementComponents.count(
                placementComponentKey(AssemblyRegistry::sourcePlacementIdFor(source->assemblyUuid), component->componentId)) > 0;
        if (editedElementGuids.count(sourceMember.elementGuid) > 0 || protectedSourcePlacement) {
            ++skippedEditedSlabTargets;
            slabApplyDiagnostics.push_back("skippedEditedSourcePlacement=" + sourceMember.elementGuid +
                " component=" + component->componentId +
                " type=" + sourceMember.elementType);
            continue;
        }
        const auto editedBaseline = editedBaselinesByComponentId.find(component->componentId);
        const auto targetBaseline = activeBaselineByElementGuid_.find(sourceMember.elementGuid);
        if (editedBaseline == editedBaselinesByComponentId.end() || targetBaseline == activeBaselineByElementGuid_.end()) {
            return {false, "Source wrapper target is missing baseline geometry. Re-enter edit mode before applying.", {}};
        }
        ElementSnapshot sourceTargetBaseline = targetBaseline->second;
        bool sourceTargetReconciled = false;
        if (!protectedSourcePlacement) {
            const auto reconciledSnapshot = applyReconciliation.snapshotsByElementGuid.find(sourceMember.elementGuid);
            if (reconciledSnapshot != applyReconciliation.snapshotsByElementGuid.end()) {
                sourceTargetBaseline = reconciledSnapshot->second;
                if (applyReconciliation.sourceFrame.valid) {
                    applyCoordinateFrame(sourceTargetBaseline, applyReconciliation.sourceFrame);
                }
                activeBaselineByElementGuid_[sourceMember.elementGuid] = sourceTargetBaseline;
                sourceTargetReconciled = true;
            }
        }
        if (!sourceTargetReconciled && activeEditSession_->sourcePlacementFrame.valid) {
            sourceTargetBaseline = withCoordinateFrame(sourceTargetBaseline, runtimeFrameFromStoredFrame(activeEditSession_->sourcePlacementFrame));
        }
        ElementSnapshot sourceEditedBaseline = editedBaseline->second;
        if (snapshot->second.elementType == "Slab") {
            sourceEditedBaseline = withLocalDefinitionFrame(sourceEditedBaseline);
            sourceTargetBaseline = withLocalDefinitionFrame(sourceTargetBaseline);
        }
        std::string placementDiagnostic;
        if (!generatedSlabBoundsAreSafeForTarget(snapshot->second, sourceEditedBaseline, sourceTargetBaseline, "source", sourceMember.elementGuid, placementDiagnostic)) {
            slabApplyDiagnostics.push_back("sourcePlacementFrameDiagnostic=" + placementDiagnostic);
        }
        {
            std::ostringstream trace;
            trace << "targetPlacement=source\n";
            trace << "targetGuid=" << sourceMember.elementGuid << " component=" << component->componentId << "\n";
            trace << "editedSnapshot\n" << traceSnapshotSummary(snapshot->second);
            trace << "editedBaseline\n" << traceSnapshotSummary(sourceEditedBaseline);
            trace << "targetBaseline\n" << traceSnapshotSummary(sourceTargetBaseline);
            if (!placementDiagnostic.empty()) {
                trace << "placementDiagnostic=" << placementDiagnostic << "\n";
            }
            appendGeometryTrace(activeGeometryTracePath_, "apply-target-baseline/source", trace.str());
        }
        std::string replacementElementGuid;
        if (!instanceOperator_->updateElementFromSnapshot(sourceMember.elementGuid, snapshot->second, sourceEditedBaseline, sourceTargetBaseline, &replacementElementGuid)) {
            failed = true;
            failureMessage = "Source placement update failed for component " + component->componentId + " element " +
                sourceMember.elementGuid + ": " + instanceOperator_->lastDiagnostic();
            break;
        }
        if (!replacementElementGuid.empty() && replacementElementGuid != sourceMember.elementGuid) {
            if (!registry_.replaceSourceMemberElement(source->assemblyUuid, component->componentId, replacementElementGuid)) {
                failed = true;
                failureMessage = "Source placement update returned replacement GUID " + replacementElementGuid +
                    " but registry rebinding failed for component " + component->componentId + ".";
                break;
            }
            slabApplyDiagnostics.push_back("reboundSourcePlacement=" + sourceMember.elementGuid +
                " replacement=" + replacementElementGuid +
                " component=" + component->componentId);
        }
        {
            std::ostringstream trace;
            trace << "targetPlacement=source\n";
            trace << "targetGuid=" << sourceMember.elementGuid << " replacementGuid=" << replacementElementGuid << "\n";
            trace << "lastDiagnostic=" << instanceOperator_->lastDiagnostic() << "\n";
            if (!replacementElementGuid.empty()) {
                trace << "replacementExists=" << (existenceChecker_.exists(replacementElementGuid) ? "true" : "false") << "\n";
            }
            trace << "originalExists=" << (existenceChecker_.exists(sourceMember.elementGuid) ? "true" : "false") << "\n";
            appendGeometryTrace(activeGeometryTracePath_, "apply-result/source", trace.str());
        }
    }
    for (const auto& instance : registry_.listInstances(source->assemblyUuid)) {
        if (failed) {
            break;
        }
        if (instance.needsRepair) {
            continue;
        }
        for (const auto& member : registry_.listInstanceMembers(instance.instanceUuid)) {
            const auto snapshot = snapshotsByComponentId.find(member.componentId);
            if (snapshot == snapshotsByComponentId.end()) {
                continue;
            }
            const bool protectedInstancePlacement =
                protectedEditedPlacementComponents.count(placementComponentKey(instance.instanceUuid, member.componentId)) > 0;
            if (editedElementGuids.count(member.elementGuid) > 0 || protectedInstancePlacement) {
                ++skippedEditedSlabTargets;
                slabApplyDiagnostics.push_back("skippedEditedInstancePlacement=" + member.elementGuid +
                    " instance=" + instance.instanceUuid +
                    " component=" + member.componentId +
                    " type=" + member.elementType);
                continue;
            }
            const auto editedBaseline = editedBaselinesByComponentId.find(member.componentId);
            const auto targetBaseline = activeBaselineByElementGuid_.find(member.elementGuid);
            if (editedBaseline == editedBaselinesByComponentId.end() || targetBaseline == activeBaselineByElementGuid_.end()) {
                registry_.markInstanceNeedsRepair(instance.instanceUuid, true);
                failed = true;
                failureMessage = "Instance " + instance.instanceUuid + " member " + member.elementGuid +
                    " is missing baseline geometry. Re-enter edit mode before applying.";
                break;
            }
            ElementSnapshot instanceEditedBaseline = editedBaseline->second;
            ElementSnapshot instanceTargetBaseline = targetBaseline->second;
            const bool isEditedPlacement = instance.instanceUuid == activeEditSession_->editPlacementId;
            if (!isEditedPlacement) {
                const auto reconciledSnapshot = applyReconciliation.snapshotsByElementGuid.find(member.elementGuid);
                if (reconciledSnapshot != applyReconciliation.snapshotsByElementGuid.end()) {
                    instanceTargetBaseline = reconciledSnapshot->second;
                    if (const auto refreshedFrame = applyReconciliation.instanceFrames.find(instance.instanceUuid);
                        refreshedFrame != applyReconciliation.instanceFrames.end() && refreshedFrame->second.valid) {
                        applyCoordinateFrame(instanceTargetBaseline, refreshedFrame->second);
                    }
                    activeBaselineByElementGuid_[member.elementGuid] = instanceTargetBaseline;
                } else if (const auto refreshedFrame = applyReconciliation.instanceFrames.find(instance.instanceUuid);
                    refreshedFrame != applyReconciliation.instanceFrames.end() && refreshedFrame->second.valid) {
                    applyCoordinateFrame(instanceTargetBaseline, refreshedFrame->second);
                }
            }
            if (snapshot->second.elementType == "Slab") {
                instanceEditedBaseline = withLocalDefinitionFrame(instanceEditedBaseline);
                instanceTargetBaseline = withLocalDefinitionFrame(instanceTargetBaseline);
            }
            std::string placementDiagnostic;
            if (!generatedSlabBoundsAreSafeForTarget(snapshot->second, instanceEditedBaseline, instanceTargetBaseline, "instance", member.elementGuid, placementDiagnostic)) {
                slabApplyDiagnostics.push_back("instancePlacementFrameDiagnostic=" + placementDiagnostic);
            }
            {
                std::ostringstream trace;
                trace << "targetPlacement=instance\n";
                trace << "instanceUuid=" << instance.instanceUuid
                    << " targetGuid=" << member.elementGuid
                    << " component=" << member.componentId
                    << " isEditedPlacement=" << (isEditedPlacement ? "true" : "false") << "\n";
                trace << "editedSnapshot\n" << traceSnapshotSummary(snapshot->second);
                trace << "editedBaseline\n" << traceSnapshotSummary(instanceEditedBaseline);
                trace << "targetBaseline\n" << traceSnapshotSummary(instanceTargetBaseline);
                if (!placementDiagnostic.empty()) {
                    trace << "placementDiagnostic=" << placementDiagnostic << "\n";
                }
                appendGeometryTrace(activeGeometryTracePath_, "apply-target-baseline/instance", trace.str());
            }
            std::string replacementElementGuid;
            if (!instanceOperator_->updateElementFromSnapshot(member.elementGuid, snapshot->second, instanceEditedBaseline, instanceTargetBaseline, &replacementElementGuid)) {
                registry_.markInstanceNeedsRepair(instance.instanceUuid, true);
                failed = true;
                failureMessage = "Instance " + instance.instanceUuid + " member " + member.elementGuid +
                    " failed for component " + member.componentId + ": " + instanceOperator_->lastDiagnostic();
                break;
            }
            if (!replacementElementGuid.empty() && replacementElementGuid != member.elementGuid) {
                if (!registry_.replaceInstanceMemberElement(instance.instanceUuid, member.componentId, replacementElementGuid)) {
                    registry_.markInstanceNeedsRepair(instance.instanceUuid, true);
                    failed = true;
                    failureMessage = "Instance " + instance.instanceUuid + " member " + member.elementGuid +
                        " returned replacement GUID " + replacementElementGuid +
                        " but registry rebinding failed for component " + member.componentId +
                        ". selectedGuids=" + joinSet(editedElementGuids) +
                        " diagnostics=" + joinStrings(slabApplyDiagnostics);
                    break;
                }
                if (member.elementType == "Slab") {
                    slabApplyDiagnostics.push_back("reboundInstanceSlab=" + member.elementGuid +
                        " replacement=" + replacementElementGuid +
                        " instance=" + instance.instanceUuid +
                        " component=" + member.componentId);
                }
            }
            {
                std::ostringstream trace;
                trace << "targetPlacement=instance\n";
                trace << "instanceUuid=" << instance.instanceUuid
                    << " targetGuid=" << member.elementGuid
                    << " replacementGuid=" << replacementElementGuid
                    << " component=" << member.componentId << "\n";
                trace << "lastDiagnostic=" << instanceOperator_->lastDiagnostic() << "\n";
                if (!replacementElementGuid.empty()) {
                    trace << "replacementExists=" << (existenceChecker_.exists(replacementElementGuid) ? "true" : "false") << "\n";
                }
                trace << "originalExists=" << (existenceChecker_.exists(member.elementGuid) ? "true" : "false") << "\n";
                appendGeometryTrace(activeGeometryTracePath_, "apply-result/instance", trace.str());
            }
        }
        if (failed) {
            break;
        }
    }

    if (failed) {
        resetActiveEditSession();
        return {false, "Wrapper edit partially failed. " + failureMessage, {}};
    }

    applyReconciliation = reconcilePlacementFramesForAssembly(
        registry_,
        *instanceOperator_,
        existenceChecker_,
        source->assemblyUuid);
    appendGeometryTrace(
        activeGeometryTracePath_,
        "post-apply-registry/reconciliation",
        traceReconciliationSummary(applyReconciliation) + "\n" + traceRegistryState(registry_, source->assemblyUuid));
    registry_.incrementVersion(source->assemblyUuid);
    source = registry_.getAssemblyByUuid(source->assemblyUuid);
    if (source) {
        bool stamped = true;
        std::string stampFailure;
        if (!stampAssemblyProperties(*source)) {
            stamped = false;
            stampFailure = "source placement restamp failed: " + propertyWriter_.lastDiagnostic();
        }
        for (const auto& instance : registry_.listInstances(source->assemblyUuid)) {
            if (!stampInstanceProperties(*source, instance)) {
                if (stampFailure.empty()) {
                    stampFailure = "instance " + instance.instanceUuid + " restamp failed: " + propertyWriter_.lastDiagnostic();
                }
                stamped = false;
            }
        }
        if (!stamped) {
            const std::string failedTracePath = activeGeometryTracePath_;
            appendGeometryTrace(
                failedTracePath,
                "post-apply-registry/restamp-failed",
                "stampFailure=" + stampFailure + "\n" + traceRegistryState(registry_, source->assemblyUuid));
            resetActiveEditSession();
            return {false, "Wrapper edit applied but BuildSync properties could not be restamped before duplicate cleanup: " +
                stampFailure + tracePathMessage(failedTracePath), {}};
        }
        if (const auto cleanupFailure = cleanupEditedPlacementDuplicates("post-restamp")) {
            resetActiveEditSession();
            return {false, *cleanupFailure, {}};
        }
        const CommandResult invariant = validatePlacementBindingInvariants(source->assemblyUuid);
        if (!invariant.ok) {
            const std::string failedTracePath = activeGeometryTracePath_;
            appendGeometryTrace(
                failedTracePath,
                "post-apply-registry/validation-failed",
                "validationMessage=" + invariant.message + "\n" + traceRegistryState(registry_, source->assemblyUuid));
            resetActiveEditSession();
            return {false, "Wrapper edit applied but relationship validation failed before save. " + invariant.message +
                tracePathMessage(failedTracePath), {}};
        }
        const std::string sourcePlacementId = AssemblyRegistry::sourcePlacementIdFor(source->assemblyUuid);
        for (const auto& component : registry_.listComponents(source->assemblyUuid)) {
            if (component.status != "active") {
                continue;
            }
            const auto sourceBinding = registry_.getPlacementBinding(sourcePlacementId, component.componentId);
            if (!sourceBinding || !sourceBinding->lastBoundsValid) {
                resetActiveEditSession();
                return {false, "Wrapper edit applied but source binding is not ready for a second edit. component=" +
                    component.componentId + ".", {}};
            }
            const auto reboundComponent = registry_.getComponentBySourceElementGuid(sourceBinding->elementGuid);
            if (!reboundComponent || reboundComponent->componentId != component.componentId) {
                resetActiveEditSession();
                return {false, "Wrapper edit applied but source binding does not map back to its component before save. component=" +
                    component.componentId + " guid=" + sourceBinding->elementGuid + ".", {}};
            }
            for (const auto& instance : registry_.listInstances(source->assemblyUuid)) {
                if (instance.needsRepair) {
                    continue;
                }
                const auto instanceBinding = registry_.getPlacementBinding(instance.instanceUuid, component.componentId);
                if (!instanceBinding || !instanceBinding->lastBoundsValid) {
                    resetActiveEditSession();
                    return {false, "Wrapper edit applied but instance binding is not ready for a second edit. instance=" +
                        instance.instanceUuid + " component=" + component.componentId + ".", {}};
                }
                const auto reboundInstance = registry_.getInstanceByMemberElementGuid(instanceBinding->elementGuid);
                if (!reboundInstance || reboundInstance->instanceUuid != instance.instanceUuid) {
                    resetActiveEditSession();
                    return {false, "Wrapper edit applied but instance binding does not map back before save. instance=" +
                        instance.instanceUuid + " component=" + component.componentId + " guid=" + instanceBinding->elementGuid + ".", {}};
                }
            }
        }
    }
    appendGeometryTrace(
        activeGeometryTracePath_,
        "post-apply-registry/pre-save",
        "slabApplyDiagnostics=" + joinStrings(slabApplyDiagnostics) + "\n" +
            (source ? traceRegistryState(registry_, source->assemblyUuid) : std::string("sourceMissing=true\n")));
    registryStorage_.save(registry_);
    const std::string completedTracePath = activeGeometryTracePath_;
    activeEditSession_.reset();
    activeGeometryTracePath_.clear();
    activeBaselineByElementGuid_.clear();
    activeComponentByElementGuid_.clear();
    if (skippedEditedSlabTargets > 0) {
        return {true, "Wrapper edit applied to source and linked instances. Edited slab targets skipped=" +
            std::to_string(skippedEditedSlabTargets) + "." + tracePathMessage(completedTracePath), {}};
    }
    return {true, "Wrapper edit applied to source and linked instances." + tracePathMessage(completedTracePath), {}};
}

CommandResult AssemblyCommandService::cancelWrapperEdit()
{
    if (!activeEditSession_) {
        return {false, "No active wrapper edit session.", {}};
    }
    activeEditSession_.reset();
    activeGeometryTracePath_.clear();
    activeBaselineByElementGuid_.clear();
    activeComponentByElementGuid_.clear();
    return {true, "Wrapper edit mode cancelled.", {}};
}

CommandResult AssemblyCommandService::convertSelectedInstanceToStandaloneWrapper(const std::string& name)
{
    const auto instance = selectedInstance();
    if (!instance) {
        return {false, "Select one instance member to convert.", {}};
    }
    const auto source = registry_.getAssemblyByUuid(instance->sourceAssemblyUuid);
    if (!source) {
        return {false, "Source wrapper for instance was not found.", {}};
    }

    Assembly standalone = *source;
    standalone.assemblyUuid = uuidFactory_();
    standalone.assemblyId = namingRules_.generateAssemblyId(source->type, source->level, source->zone);
    standalone.name = name.empty() ? instance->name : name;
    standalone.version = 1;
    standalone.members.clear();
    for (const auto& member : registry_.listInstanceMembers(instance->instanceUuid)) {
        standalone.members.push_back({standalone.assemblyUuid, member.elementGuid, member.elementType, member.role, "active", ""});
    }
    if (!registry_.createAssembly(standalone)) {
        return {false, "Standalone wrapper could not be created.", {}};
    }
    registry_.deleteInstance(instance->instanceUuid);
    if (!stampAssemblyProperties(standalone)) {
        return {false, "Standalone wrapper was created but BuildSync properties could not be restamped: " + propertyWriter_.lastDiagnostic(), {}};
    }
    registryStorage_.save(registry_);
    return {true, "Instance converted to standalone wrapper " + standalone.assemblyId + ".", {}};
}

CommandResult AssemblyCommandService::breakApartSelectedInstance()
{
    const auto instance = selectedInstance();
    if (!instance) {
        return {false, "Select one instance member to break apart.", {}};
    }
    std::vector<std::string> elementGuids;
    for (const auto& member : registry_.listInstanceMembers(instance->instanceUuid)) {
        elementGuids.push_back(member.elementGuid);
        propertyWriter_.clearAssemblyProperties(member.elementGuid);
    }
    instanceOperator_->ungroupElements(instance->nativeGroupId, elementGuids);
    registry_.deleteInstance(instance->instanceUuid);
    registryStorage_.save(registry_);
    highlightController_.selectElements(elementGuids);
    return {true, "Instance broken apart into unbound Archicad elements.", {}};
}

CommandResult AssemblyCommandService::repairSelectedInstance()
{
    const auto instance = selectedInstance();
    if (!instance) {
        return {false, "Select one instance member to repair.", {}};
    }
    std::vector<std::string> liveGuids;
    for (const auto& member : registry_.listInstanceMembers(instance->instanceUuid)) {
        if (existenceChecker_.exists(member.elementGuid)) {
            liveGuids.push_back(member.elementGuid);
        }
    }
    WrapperInstance repaired = *instance;
    repaired.nativeGroupId = instanceOperator_->groupElements(liveGuids);
    repaired.needsRepair = false;
    registry_.updateInstance(repaired);
    if (const auto source = registry_.getAssemblyByUuid(repaired.sourceAssemblyUuid)) {
        stampInstanceProperties(*source, repaired);
    }
    registryStorage_.save(registry_);
    return {true, "Instance repair complete.", {}};
}

CommandResult AssemblyCommandService::repairRegistry()
{
    int removedWrappers = 0;
    int removedMembers = 0;
    int missingInstanceMembersDetected = 0;
    int needsRepairInstances = 0;
    int sourceFramesRepaired = 0;
    for (const auto& member : registry_.listAllInstanceMembers()) {
        if (!existenceChecker_.exists(member.elementGuid)) {
            ++missingInstanceMembersDetected;
        }
    }
    for (const auto& instance : registry_.listAllInstances()) {
        if (instance.needsRepair) {
            ++needsRepairInstances;
        }
    }
    for (const auto& assembly : registry_.listAssemblies()) {
        std::vector<std::string> missingMembers;
        for (const auto& member : assembly.members) {
            if (!existenceChecker_.exists(member.elementGuid)) {
                missingMembers.push_back(member.elementGuid);
            }
        }
        if (!missingMembers.empty()) {
            registry_.removeMembers(assembly.assemblyUuid, missingMembers);
            registry_.incrementVersion(assembly.assemblyUuid);
            removedMembers += static_cast<int>(missingMembers.size());
        }

        const auto updated = registry_.getAssemblyByUuid(assembly.assemblyUuid);
        if (!updated) {
            continue;
        }
        const bool participatesInTree =
            registry_.getParentWrapper(updated->assemblyUuid).has_value() ||
            !registry_.listChildWrappers(updated->assemblyUuid).empty();
        if (updated->members.empty() && !participatesInTree) {
            registry_.deleteAssembly(updated->assemblyUuid);
            ++removedWrappers;
        } else if (!missingMembers.empty()) {
            stampAssemblyProperties(*updated);
        }
    }
    for (const auto& assembly : registry_.listAssemblies()) {
        const auto instances = registry_.listInstances(assembly.assemblyUuid);
        if (instances.empty()) {
            continue;
        }
        std::vector<SelectedElement> sourceElements;
        for (const auto& member : assembly.members) {
            if (existenceChecker_.exists(member.elementGuid)) {
                sourceElements.push_back({member.elementGuid, member.elementType});
            }
        }
        const RuntimeCoordinateFrame observedSourceFrame = coordinateFrameFromSnapshots(instanceOperator_->snapshotElements(sourceElements));
        if (!observedSourceFrame.valid) {
            continue;
        }
        for (const auto& instance : instances) {
            if (!isZeroSourceFramePlaceholder(runtimeFrameFromStoredFrame(instance.sourceFrame)) ||
                squaredDistance(runtimeFrameFromStoredFrame(instance.sourceFrame), observedSourceFrame) <= 1.0e-6) {
                continue;
            }
            WrapperInstance repaired = instance;
            repaired.sourceFrame = {
                observedSourceFrame.originX,
                observedSourceFrame.originY,
                observedSourceFrame.rotationDegrees,
                observedSourceFrame.valid,
            };
            const RuntimeCoordinateFrame liveFrame = coordinateFrameFromStoredPlacement(observedSourceFrame, repaired);
            if (liveFrame.valid) {
                repaired.liveFrame = {liveFrame.originX, liveFrame.originY, liveFrame.rotationDegrees, true};
            }
            registry_.updateInstance(repaired);
            if (const auto source = registry_.getAssemblyByUuid(repaired.sourceAssemblyUuid)) {
                stampInstanceProperties(*source, repaired);
            }
            ++sourceFramesRepaired;
        }
    }
    registryStorage_.save(registry_);
    return {true, "Registry repair complete. Missing wrapper members removed=" + std::to_string(removedMembers) +
        ". Missing instance members detected=" + std::to_string(missingInstanceMembersDetected) +
        ". Instances needing repair=" + std::to_string(needsRepairInstances) +
        ". Empty wrappers removed=" + std::to_string(removedWrappers) +
        ". Source frames repaired=" + std::to_string(sourceFramesRepaired) + ".", {}};
}

CommandResult AssemblyCommandService::validateSelectedAssembly()
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Select one BuildSync assembly member first.", {}};
    }
    const auto assembly = registry_.getAssemblyByElementGuid(selection.front().elementGuid);
    if (!assembly) {
        return {false, "Selected element is not part of a BuildSync assembly.", {}};
    }
    std::unordered_set<std::string> live;
    std::unordered_map<std::string, ElementAssemblyProperties> properties;
    for (const auto& member : assembly->members) {
        if (existenceChecker_.exists(member.elementGuid)) {
            live.insert(member.elementGuid);
            properties[member.elementGuid] = {
                assembly->assemblyUuid,
                assembly->assemblyId,
                assembly->name,
                assembly->type,
                member.role,
                std::to_string(assembly->version),
                assembly->taskId,
                assembly->trade,
                assembly->status,
            };
        }
    }
    ValidationResult result = AssemblyValidator::validateAssembly(*assembly, live, properties);
    enqueueEvent("assembly_validated", JsonSerializer::assemblyValidated(projectId_, *assembly, result));
    return {true, "Assembly validated.", result};
}

CommandResult AssemblyCommandService::syncWithPythonListener()
{
    SyncQueueFlusher flusher(listenerClient_);
    if (!flusher.flush(syncQueue_)) {
        return {false, "Python listener is offline. Event queued for later sync.", {}};
    }
    return {true, "Pending BuildSync events synced.", {}};
}

CommandResult AssemblyCommandService::debugSelection()
{
    const auto selection = selectionReader_.readSelection();
    std::ostringstream report;
    report << "Debug Selection: selected elements=" << selection.size();
    for (const auto& selected : selection) {
        report << "\n- " << selected.elementGuid << " [" << selected.elementType << "]";
    }
    return {true, report.str(), {}};
}

CommandResult AssemblyCommandService::debugRegistry()
{
    const auto assemblies = registry_.listAssemblies();
    std::ostringstream report;
    report << "Debug Registry: wrappers=" << assemblies.size();
    for (const auto& assembly : assemblies) {
        report << "\n- " << assembly.assemblyId << " " << assembly.name << " [" << assembly.type << "]"
               << " uuid=" << assembly.assemblyUuid << " members=" << assembly.members.size()
               << " version=" << assembly.version;
        for (const auto& member : assembly.members) {
            report << "\n  - " << member.elementGuid << " [" << member.elementType << "] status=" << member.status;
        }
    }
    return {true, report.str(), {}};
}

CommandResult AssemblyCommandService::debugBuildSyncProperties()
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return {false, "Debug BuildSync Properties: select one or more Archicad elements first.", {}};
    }

    std::ostringstream report;
    report << "Debug BuildSync Properties: selected elements=" << selection.size();
    for (const auto& selected : selection) {
        report << "\n- " << selected.elementGuid << " [" << selected.elementType << "]";
        const auto assembly = registry_.getAssemblyByElementGuid(selected.elementGuid);
        if (assembly) {
            report << " registry=" << assembly->assemblyId;
        } else {
            report << " registry=unassigned";
        }
        report << "\n  " << propertyWriter_.describeBuildSyncProperties(selected.elementGuid);
    }
    return {true, report.str(), {}};
}

AssemblyMember AssemblyCommandService::memberFromSelection(const SelectedElement& selected, const std::string& assemblyUuid) const
{
    return {assemblyUuid, selected.elementGuid, selected.elementType, "", "active", ""};
}

BuildSyncProperties AssemblyCommandService::propertiesFor(const Assembly& assembly, const AssemblyMember& member) const
{
    return {
        assembly.assemblyId,
        assembly.assemblyUuid,
        assembly.name,
        assembly.type,
        member.role,
        std::to_string(assembly.version),
        assembly.taskId,
        assembly.trade,
        assembly.status,
        customPropertiesJson(assembly.customProperties),
        assembly.assemblyUuid,
        "",
        registry_.getComponentBySourceElementGuid(member.elementGuid).has_value()
            ? registry_.getComponentBySourceElementGuid(member.elementGuid)->componentId
            : "",
        AssemblyRegistry::sourcePlacementIdFor(assembly.assemblyUuid),
        "true",
        "false",
        "false",
        "true",
        "false",
        "false",
        member.role,
    };
}

BuildSyncProperties AssemblyCommandService::instancePropertiesFor(
    const Assembly& source,
    const WrapperInstance& instance,
    const WrapperInstanceMember& member) const
{
    return {
        source.assemblyId,
        source.assemblyUuid,
        source.name,
        source.type,
        member.role,
        std::to_string(source.version),
        source.taskId,
        source.trade,
        instance.status,
        customPropertiesJson(source.customProperties),
        source.assemblyUuid,
        instance.instanceUuid,
        member.componentId,
        instance.instanceUuid,
        "false",
        "true",
        instance.isMirrored ? "true" : "false",
        instance.sourceIsCountable ? "true" : "false",
        instance.needsRepair ? "true" : "false",
        instance.localOverridesAllowed ? "true" : "false",
        member.role,
    };
}

bool AssemblyCommandService::stampAssemblyProperties(const Assembly& assembly)
{
    bool ok = true;
    for (const auto& member : assembly.members) {
        ok = propertyWriter_.writeAssemblyProperties(member.elementGuid, propertiesFor(assembly, member)) && ok;
    }
    return ok;
}

bool AssemblyCommandService::stampInstanceProperties(const Assembly& source, const WrapperInstance& instance)
{
    bool ok = true;
    for (const auto& member : registry_.listInstanceMembers(instance.instanceUuid)) {
        ok = propertyWriter_.writeAssemblyProperties(member.elementGuid, instancePropertiesFor(source, instance, member)) && ok;
    }
    return ok;
}

CommandResult AssemblyCommandService::ensureComponentsForAssembly(const Assembly& assembly)
{
    std::vector<SelectedElement> snapshotRequests;
    int sortOrder = 0;
    for (const auto& member : assembly.members) {
        if (!instanceOperator_->supportsElementType(member.elementType)) {
            return {false, "Unsupported element type for wrapper instancing: " + member.elementType + ".", {}};
        }
        if (!registry_.getComponentBySourceElementGuid(member.elementGuid)) {
            snapshotRequests.push_back({member.elementGuid, member.elementType});
        }
    }

    std::unordered_map<std::string, ElementSnapshot> snapshotsByGuid;
    for (const auto& snapshot : instanceOperator_->snapshotElements(snapshotRequests)) {
        snapshotsByGuid[snapshot.elementGuid] = snapshot;
    }

    for (const auto& member : assembly.members) {
        if (registry_.getComponentBySourceElementGuid(member.elementGuid)) {
            ++sortOrder;
            continue;
        }
        const auto snapshot = snapshotsByGuid.find(member.elementGuid);
        WrapperComponent component;
        component.componentId = uuidFactory_();
        component.sourceAssemblyUuid = assembly.assemblyUuid;
        component.sourceElementGuid = member.elementGuid;
        component.elementType = member.elementType;
        component.role = member.role;
        component.sortOrder = sortOrder++;
        component.snapshotJson = snapshot == snapshotsByGuid.end() ? "{}" : snapshot->second.snapshotJson;
        if (snapshot != snapshotsByGuid.end() && snapshot->second.frameValid) {
            component.localFrame = {
                snapshot->second.frameOriginX,
                snapshot->second.frameOriginY,
                snapshot->second.frameRotationDegrees,
                true,
            };
        }
        if (snapshot != snapshotsByGuid.end()) {
            RuntimeCoordinateFrame componentFrame{
                component.localFrame.originX,
                component.localFrame.originY,
                component.localFrame.rotationDegrees,
                component.localFrame.valid,
            };
            component.localPolygonCoords = localPolygonCoordsForFrame(snapshot->second.polygonCoords, componentFrame);
        }
        component.status = "active";
        if (!registry_.upsertComponent(component)) {
            return {false, "Wrapper component could not be registered for element " + member.elementGuid + ".", {}};
        }
    }
    return {true, "Wrapper components are ready.", {}};
}

CommandResult AssemblyCommandService::validateRelationshipBindingsForEdit(const std::string& sourceAssemblyUuid)
{
    auto source = registry_.getAssemblyByUuid(sourceAssemblyUuid);
    if (!source) {
        return {false, "Source wrapper was not found during relationship validation.", {}};
    }

    const std::string sourcePlacementId = AssemblyRegistry::sourcePlacementIdFor(sourceAssemblyUuid);
    for (const auto& component : registry_.listComponents(sourceAssemblyUuid)) {
        if (component.status != "active") {
            continue;
        }
        const auto binding = registry_.getPlacementBinding(sourcePlacementId, component.componentId);
        if (!binding) {
            registry_.upsertPlacementBinding({
                sourcePlacementId,
                component.componentId,
                component.sourceElementGuid,
                component.elementType,
                0.0,
                0.0,
                false,
                "active",
            });
            continue;
        }
        if (binding->elementGuid == component.sourceElementGuid) {
            continue;
        }
        if (existenceChecker_.exists(binding->elementGuid)) {
            if (!registry_.replaceSourceMemberElement(sourceAssemblyUuid, component.componentId, binding->elementGuid)) {
                return {false, "Source binding " + binding->placementId + "/" + component.componentId +
                    " points to " + binding->elementGuid + " but source member rebinding failed.", {}};
            }
            continue;
        }
        if (!existenceChecker_.exists(component.sourceElementGuid)) {
            return {false, "Source binding " + binding->placementId + "/" + component.componentId +
                " is stale and no live source element could be recovered. Run Repair Registry before edit mode.", {}};
        }
        registry_.replacePlacementBindingElement(sourcePlacementId, component.componentId, component.sourceElementGuid);
    }

    for (const auto& instance : registry_.listInstances(sourceAssemblyUuid)) {
        if (instance.needsRepair) {
            continue;
        }
        for (const auto& member : registry_.listInstanceMembers(instance.instanceUuid)) {
            const auto binding = registry_.getPlacementBinding(instance.instanceUuid, member.componentId);
            if (!binding) {
                registry_.upsertPlacementBinding({
                    instance.instanceUuid,
                    member.componentId,
                    member.elementGuid,
                    member.elementType,
                    0.0,
                    0.0,
                    false,
                    member.status.empty() ? "active" : member.status,
                });
                continue;
            }
            if (binding->elementGuid == member.elementGuid) {
                continue;
            }
            if (existenceChecker_.exists(binding->elementGuid)) {
                if (!registry_.replaceInstanceMemberElement(instance.instanceUuid, member.componentId, binding->elementGuid)) {
                    registry_.markInstanceNeedsRepair(instance.instanceUuid, true);
                    return {false, "Instance binding " + binding->placementId + "/" + member.componentId +
                        " points to " + binding->elementGuid + " but member rebinding failed.", {}};
                }
                continue;
            }
            if (!existenceChecker_.exists(member.elementGuid)) {
                registry_.markInstanceNeedsRepair(instance.instanceUuid, true);
                return {false, "Instance binding " + instance.instanceUuid + "/" + member.componentId +
                    " is stale and no live member could be recovered. Run Repair Instance before edit mode.", {}};
            }
            registry_.replacePlacementBindingElement(instance.instanceUuid, member.componentId, member.elementGuid);
        }
    }

    registryStorage_.save(registry_);
    return {true, "Wrapper relationship bindings are ready.", {}};
}

CommandResult AssemblyCommandService::validatePlacementBindingInvariants(const std::string& sourceAssemblyUuid) const
{
    const auto source = registry_.getAssemblyByUuid(sourceAssemblyUuid);
    if (!source) {
        return {false, "Source wrapper was not found during binding invariant check.", {}};
    }
    const std::string sourcePlacementId = AssemblyRegistry::sourcePlacementIdFor(sourceAssemblyUuid);
    RuntimeCoordinateFrame sourceFrame = activeEditSession_ && activeEditSession_->sourcePlacementFrame.valid
        ? runtimeFrameFromStoredFrame(activeEditSession_->sourcePlacementFrame)
        : persistedSourceFrameForAssembly(registry_, sourceAssemblyUuid);
    std::vector<std::string> frameDiagnostics;
    const auto validateBindingIdentity = [&](const PlacementBinding& binding, const WrapperComponent& component, const std::string& label) -> std::optional<std::string> {
        bool hasProperties = false;
        const BuildSyncProperties properties = instanceOperator_->readBuildSyncProperties(binding.elementGuid, &hasProperties);
        if (!hasProperties || !hasUsableBuildSyncIdentity(properties)) {
            return label + " identity mismatch for placement=" + binding.placementId +
                " component=" + component.componentId +
                " guid=" + binding.elementGuid +
                " type=" + component.elementType +
                ": BuildSync metadata is missing or incomplete. Run repair for this wrapper placement.";
        }
        if (!buildSyncIdentityMatches(properties, sourceAssemblyUuid, binding.placementId, component.componentId)) {
            return label + " identity mismatch for placement=" + binding.placementId +
                " component=" + component.componentId +
                " guid=" + binding.elementGuid +
                " type=" + component.elementType +
                ": metadata source=" + properties.sourceAssemblyUuid +
                " placement=" + properties.placementId +
                " component=" + properties.componentId +
                ". Expected source=" + sourceAssemblyUuid +
                " placement=" + binding.placementId +
                " component=" + component.componentId + ".";
        }
        if (binding.placementId == sourcePlacementId) {
            if (properties.isSourcePlacement != "true" || properties.isInstance == "true") {
                return label + " identity mismatch for source placement=" + binding.placementId +
                    " component=" + component.componentId +
                    " guid=" + binding.elementGuid +
                    ": metadata role isSourcePlacement=" + properties.isSourcePlacement +
                    " isInstance=" + properties.isInstance + ".";
            }
        } else if (properties.isInstance != "true" || properties.instanceUuid != binding.placementId) {
            return label + " identity mismatch for instance placement=" + binding.placementId +
                " component=" + component.componentId +
                " guid=" + binding.elementGuid +
                ": metadata instanceUuid=" + properties.instanceUuid +
                " isInstance=" + properties.isInstance + ".";
        }
        return std::nullopt;
    };
    const auto validateBindingFrame = [&](const PlacementBinding& binding, const WrapperComponent& component, const RuntimeCoordinateFrame& frame, const std::string& label) -> std::optional<std::string> {
        if (!frame.valid || component.elementType == "Slab" || component.localPolygonCoords.empty()) {
            return std::nullopt;
        }
        double expectedX = 0.0;
        double expectedY = 0.0;
        if (!localPolygonBoundsForFrame(component.localPolygonCoords, frame, expectedX, expectedY)) {
            return std::nullopt;
        }
        const auto snapshots = instanceOperator_->snapshotElements({{binding.elementGuid, component.elementType}});
        if (snapshots.empty() || !snapshots.front().boundsValid) {
            return label + " binding " + binding.placementId + "/" + component.componentId +
                " points to GUID " + binding.elementGuid + " but bounds could not be validated.";
        }
        const double dx = snapshots.front().boundsCenterX - expectedX;
        const double dy = snapshots.front().boundsCenterY - expectedY;
        const double tolerance = localPolygonBoundsTolerance(component.localPolygonCoords);
        if ((dx * dx + dy * dy) > tolerance * tolerance) {
            return label + " binding " + binding.placementId + "/" + component.componentId +
                " points to GUID " + binding.elementGuid +
                " outside expected placement frame. expected=(" + std::to_string(expectedX) + "," + std::to_string(expectedY) +
                ") actual=(" + std::to_string(snapshots.front().boundsCenterX) + "," + std::to_string(snapshots.front().boundsCenterY) +
                ") tolerance=" + std::to_string(tolerance) +
                " frame=" + frameSummary(frame) + ".";
        }
        return std::nullopt;
    };
    std::unordered_set<std::string> duplicateIdentityDiagnostics;
    for (const auto& candidate : instanceOperator_->findBuildSyncSlabCandidates(sourceAssemblyUuid)) {
        if (!existenceChecker_.exists(candidate.snapshot.elementGuid)) {
            continue;
        }
        if (!candidate.hasBuildSyncProperties ||
            !hasUsableBuildSyncIdentity(candidate.buildSyncProperties) ||
            candidate.buildSyncProperties.sourceAssemblyUuid != sourceAssemblyUuid) {
            continue;
        }
        const auto binding = registry_.getPlacementBinding(
            candidate.buildSyncProperties.placementId,
            candidate.buildSyncProperties.componentId);
        if (binding && binding->elementGuid != candidate.snapshot.elementGuid) {
            duplicateIdentityDiagnostics.insert(
                "duplicate slab identity placement=" + candidate.buildSyncProperties.placementId +
                " component=" + candidate.buildSyncProperties.componentId +
                " registrySurvivor=" + binding->elementGuid +
                " duplicateGuid=" + candidate.snapshot.elementGuid);
        }
    }
    if (!duplicateIdentityDiagnostics.empty()) {
        return {false, "Duplicate BuildSync-owned placement/component identities found: " +
            joinSet(duplicateIdentityDiagnostics) + ". Repair can safely remove metadata-proven duplicates when a registry survivor exists.", {}};
    }
    for (const auto& component : registry_.listComponents(sourceAssemblyUuid)) {
        if (component.status != "active") {
            continue;
        }
        const auto sourceBinding = registry_.getPlacementBinding(sourcePlacementId, component.componentId);
        if (!sourceBinding) {
            return {false, "Missing source binding for component " + component.componentId + ".", {}};
        }
        if (!existenceChecker_.exists(sourceBinding->elementGuid)) {
            return {false, "Source binding for component " + component.componentId +
                " points to missing GUID " + sourceBinding->elementGuid + ".", {}};
        }
        if (const auto identityError = validateBindingIdentity(*sourceBinding, component, "Source")) {
            return {false, *identityError, {}};
        }
        if (const auto frameError = validateBindingFrame(*sourceBinding, component, sourceFrame, "Source")) {
            frameDiagnostics.push_back(*frameError);
        }
        for (const auto& instance : registry_.listInstances(sourceAssemblyUuid)) {
            if (instance.needsRepair) {
                continue;
            }
            const auto instanceBinding = registry_.getPlacementBinding(instance.instanceUuid, component.componentId);
            if (!instanceBinding) {
                return {false, "Missing instance binding for instance " + instance.instanceUuid +
                    " component " + component.componentId + ".", {}};
            }
            if (!existenceChecker_.exists(instanceBinding->elementGuid)) {
                return {false, "Instance binding for instance " + instance.instanceUuid +
                    " component " + component.componentId + " points to missing GUID " +
                    instanceBinding->elementGuid + ".", {}};
            }
            if (const auto identityError = validateBindingIdentity(*instanceBinding, component, "Instance")) {
                return {false, *identityError, {}};
            }
            RuntimeCoordinateFrame instanceFrame = runtimeFrameFromStoredFrame(instance.liveFrame);
            if (!instanceFrame.valid) {
                instanceFrame = coordinateFrameFromStoredPlacement(sourceFrame, instance);
            }
            if (const auto frameError = validateBindingFrame(*instanceBinding, component, instanceFrame, "Instance")) {
                frameDiagnostics.push_back(*frameError);
            }
        }
    }
    if (!frameDiagnostics.empty()) {
        return {true, "Placement identity bindings are valid. Frame diagnostics were recorded for repair guidance only: " +
            joinStrings(frameDiagnostics), {}};
    }
    return {true, "Placement bindings are valid.", {}};
}

CommandResult AssemblyCommandService::pruneMissingSourceMembers(const std::string& assemblyUuid, int* removedCount)
{
    if (removedCount != nullptr) {
        *removedCount = 0;
    }
    const auto assembly = registry_.getAssemblyByUuid(assemblyUuid);
    if (!assembly) {
        return {false, "Source wrapper was not found during health check.", {}};
    }

    std::vector<std::string> missingMembers;
    for (const auto& member : assembly->members) {
        if (!existenceChecker_.exists(member.elementGuid)) {
            missingMembers.push_back(member.elementGuid);
        }
    }
    if (missingMembers.empty()) {
        return {true, "Source wrapper health check passed.", {}};
    }

    registry_.removeMembers(assemblyUuid, missingMembers);
    registry_.incrementVersion(assemblyUuid);
    if (removedCount != nullptr) {
        *removedCount = static_cast<int>(missingMembers.size());
    }
    if (const auto updated = registry_.getAssemblyByUuid(assemblyUuid)) {
        stampAssemblyProperties(*updated);
    }
    registryStorage_.save(registry_);
    return {true, "Source wrapper health check removed missing source members=" +
        std::to_string(missingMembers.size()) + ".", {}};
}

int AssemblyCommandService::countMissingInstanceMembers(const std::string& sourceAssemblyUuid) const
{
    int missing = 0;
    for (const auto& instance : registry_.listInstances(sourceAssemblyUuid)) {
        for (const auto& member : registry_.listInstanceMembers(instance.instanceUuid)) {
            if (!existenceChecker_.exists(member.elementGuid)) {
                ++missing;
            }
        }
    }
    return missing;
}

int AssemblyCommandService::countInstancesNeedingRepair(const std::string& sourceAssemblyUuid) const
{
    int needsRepair = 0;
    for (const auto& instance : registry_.listInstances(sourceAssemblyUuid)) {
        if (instance.needsRepair) {
            ++needsRepair;
        }
    }
    return needsRepair;
}

std::optional<WrapperInstance> AssemblyCommandService::selectedInstance() const
{
    const auto selection = selectionReader_.readSelection();
    if (selection.empty()) {
        return std::nullopt;
    }
    return registry_.getInstanceByMemberElementGuid(selection.front().elementGuid);
}

void AssemblyCommandService::enqueueEvent(const std::string& eventType, const std::string& payloadJson)
{
    syncQueue_.enqueue({uuidFactory_(), eventType, "", payloadJson, "pending", 0, ""});
}

} // namespace buildsync
