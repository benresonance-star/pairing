#include "addon/NativeRuntime.hpp"
#include "addon/ResourceIds.hpp"
#include "archicad_adapter/FileRegistryStorage.hpp"

#include <algorithm>
#include <cassert>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <unordered_map>
#include <unordered_set>

using namespace buildsync;

std::string geometryTracePathFromMessage(const std::string& message)
{
    const std::string marker = "Geometry trace: ";
    const auto offset = message.find(marker);
    if (offset == std::string::npos) {
        return "";
    }
    return message.substr(offset + marker.size());
}

std::string readTextFile(const std::string& path)
{
    std::ifstream input(path);
    std::ostringstream contents;
    contents << input.rdbuf();
    return contents.str();
}

class FakeSelectionReader : public SelectionReader {
public:
    std::vector<SelectedElement> selection;
    std::vector<SelectedElement> readSelection() const override { return selection; }
};

class FakePropertyWriter : public ElementPropertyWriter {
public:
    std::unordered_map<std::string, BuildSyncProperties> properties;
    std::string diagnostic{"ok"};
    bool ensureBuildSyncProperties() override { return true; }
    bool writeAssemblyProperties(const std::string& elementGuid, const BuildSyncProperties& props) override
    {
        properties[elementGuid] = props;
        diagnostic = "wrote";
        return true;
    }
    bool clearAssemblyProperties(const std::string& elementGuid) override
    {
        properties.erase(elementGuid);
        return true;
    }
    std::string describeBuildSyncProperties(const std::string& elementGuid) const override
    {
        const auto found = properties.find(elementGuid);
        if (found == properties.end()) {
            return "BS_* properties=missing";
        }
        return "BS_AssemblyID=\"" + found->second.assemblyId + "\"";
    }
    std::string lastDiagnostic() const override { return diagnostic; }
};

class FakeExistenceChecker : public ElementExistenceChecker {
public:
    std::unordered_set<std::string> live;
    bool exists(const std::string& elementGuid) const override { return live.count(elementGuid) > 0; }
};

class FakeMetadataReader : public ElementMetadataReader {
public:
    ElementMetadata readElementMetadata(const std::string& elementGuid) const override
    {
        return {elementGuid, "", "", "", "missing"};
    }
};

class FakeHighlightController : public HighlightController {
public:
    std::vector<std::string> selected;
    bool selectElements(const std::vector<std::string>& elementGuids) override
    {
        selected = elementGuids;
        return true;
    }
};

class FakeListenerClient : public PythonListenerClient {
public:
    bool healthCheck() override { return true; }
    bool postEvent(const SyncEvent&, std::string&) override { return true; }
};

class FakeInstanceElementOperator : public InstanceElementOperator {
public:
    std::unordered_map<std::string, ElementSnapshot> snapshots;
    std::unordered_map<std::string, ElementSnapshot> targetBaselinesByElementGuid;
    std::vector<std::string> deleted;
    std::vector<std::string> grouped;
    std::vector<std::string> updatedTargets;
    bool replaceSlabsOnUpdate{false};
    bool failSlabReplacementCleanup{false};
    bool failDeleteElements{false};
    std::unordered_set<std::string>* liveElements{nullptr};
    std::unordered_map<std::string, BuildSyncProperties> buildSyncProperties;
    const std::unordered_map<std::string, BuildSyncProperties>* writtenProperties{nullptr};
    std::string forcedReplacementGuid;
    std::string diagnostic{"ok"};
    int nextGuid{0};

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
        std::vector<ElementSnapshot> out;
        for (const auto& element : elements) {
            const auto seeded = snapshots.find(element.elementGuid);
            if (seeded != snapshots.end()) {
                out.push_back(seeded->second);
                continue;
            }
            ElementSnapshot snapshot{
                element.elementGuid,
                element.elementType,
                "{\"guid\":\"" + element.elementGuid + "\"}",
                0.0,
                0.0,
                0.0,
                true,
                0.0,
                0.0,
                0.0,
                true,
                "fake-topology",
            };
            out.push_back(snapshot);
        }
        return out;
    }

    std::vector<ElementDuplicateResult> duplicateElements(
        const std::vector<ElementDuplicateRequest>& requests,
        const PlanPlacement&) override
    {
        std::vector<ElementDuplicateResult> out;
        for (const auto& request : requests) {
            out.push_back({request.sourceElementGuid, request.componentId, "INSTANCE-GUID-" + std::to_string(++nextGuid), request.elementType, request.role});
        }
        return out;
    }

    static ElementSnapshot snapshotInTargetFrame(const std::string& guid, const ElementSnapshot& snapshot, const ElementSnapshot& targetBaseline)
    {
        ElementSnapshot applied = snapshot;
        applied.elementGuid = guid;
        if (snapshot.localPolygonCoords.empty() || !targetBaseline.coordinateFrameValid) {
            return applied;
        }
        const double radians = targetBaseline.coordinateRotationDegrees * 3.14159265358979323846 / 180.0;
        applied.polygonCoords.clear();
        applied.polygonCoords.reserve(snapshot.localPolygonCoords.size());
        if (snapshot.localPolygonCoords.size() >= 2) {
            applied.polygonCoords.push_back(snapshot.localPolygonCoords[0]);
            applied.polygonCoords.push_back(snapshot.localPolygonCoords[1]);
        }
        bool hasPoint = false;
        double minX = 0.0;
        double maxX = 0.0;
        double minY = 0.0;
        double maxY = 0.0;
        for (std::size_t index = 2; index < snapshot.localPolygonCoords.size(); index += 2) {
            const double localX = snapshot.localPolygonCoords[index];
            const double localY = snapshot.localPolygonCoords[index + 1];
            const double worldX = targetBaseline.coordinateOriginX + std::cos(radians) * localX - std::sin(radians) * localY;
            const double worldY = targetBaseline.coordinateOriginY + std::sin(radians) * localX + std::cos(radians) * localY;
            applied.polygonCoords.push_back(worldX);
            applied.polygonCoords.push_back(worldY);
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
        if (hasPoint) {
            applied.boundsCenterX = (minX + maxX) / 2.0;
            applied.boundsCenterY = (minY + maxY) / 2.0;
            applied.boundsValid = true;
            applied.coordinateOriginX = targetBaseline.coordinateOriginX;
            applied.coordinateOriginY = targetBaseline.coordinateOriginY;
            applied.coordinateRotationDegrees = targetBaseline.coordinateRotationDegrees;
            applied.coordinateFrameValid = true;
            applied.frameOriginX = targetBaseline.coordinateOriginX;
            applied.frameOriginY = targetBaseline.coordinateOriginY;
            applied.frameRotationDegrees = targetBaseline.coordinateRotationDegrees;
            applied.frameValid = true;
            applied.polygonFrameOriginX = targetBaseline.coordinateOriginX;
            applied.polygonFrameOriginY = targetBaseline.coordinateOriginY;
            applied.polygonFrameRotationDegrees = targetBaseline.coordinateRotationDegrees;
            applied.polygonFrameValid = true;
        }
        return applied;
    }

    bool updateElementFromSnapshot(const std::string& elementGuid, const ElementSnapshot& snapshot, const ElementSnapshot&, const ElementSnapshot& targetBaseline, std::string* replacementElementGuid = nullptr) override
    {
        updatedTargets.push_back(elementGuid);
        targetBaselinesByElementGuid[elementGuid] = targetBaseline;
        if (replaceSlabsOnUpdate && snapshot.elementType == "Slab") {
            if (failSlabReplacementCleanup) {
                diagnostic = "Slab replacement left an overlapping stale original and cleanup failed.";
                return false;
            }
            const std::string replacementGuid = forcedReplacementGuid.empty()
                ? elementGuid + "-REPLACED"
                : forcedReplacementGuid;
            ElementSnapshot replacement = snapshotInTargetFrame(replacementGuid, snapshot, targetBaseline);
            snapshots.erase(elementGuid);
            snapshots[replacementGuid] = replacement;
            if (liveElements != nullptr) {
                liveElements->erase(elementGuid);
                liveElements->insert(replacementGuid);
            }
            if (replacementElementGuid != nullptr) {
                *replacementElementGuid = replacementGuid;
            }
            diagnostic = "Applied slab replacement.";
            return true;
        }
        snapshots[elementGuid] = snapshotInTargetFrame(elementGuid, snapshot, targetBaseline);
        return true;
    }

    BuildSyncProperties readBuildSyncProperties(const std::string& elementGuid, bool* hasProperties = nullptr) const override
    {
        const auto found = buildSyncProperties.find(elementGuid);
        if (found != buildSyncProperties.end()) {
            if (hasProperties != nullptr) {
                *hasProperties = true;
            }
            return found->second;
        }
        if (writtenProperties != nullptr) {
            const auto written = writtenProperties->find(elementGuid);
            if (written != writtenProperties->end()) {
                if (hasProperties != nullptr) {
                    *hasProperties = true;
                }
                return written->second;
            }
        }
        if (hasProperties != nullptr) {
            *hasProperties = false;
        }
        return {};
    }

    std::vector<SlabCandidate> findSlabCandidatesNear(double centerX, double centerY, double maxDistance) const override
    {
        std::vector<SlabCandidate> candidates;
        const double maxDistanceSquared = maxDistance * maxDistance;
        for (const auto& entry : snapshots) {
            const auto& snapshot = entry.second;
            if (snapshot.elementType != "Slab" || !snapshot.boundsValid) {
                continue;
            }
            const double dx = snapshot.boundsCenterX - centerX;
            const double dy = snapshot.boundsCenterY - centerY;
            if ((dx * dx + dy * dy) > maxDistanceSquared) {
                continue;
            }
            bool hasProperties = false;
            BuildSyncProperties props = readBuildSyncProperties(snapshot.elementGuid, &hasProperties);
            candidates.push_back({snapshot, props, hasProperties});
        }
        return candidates;
    }

    std::vector<SlabCandidate> findBuildSyncSlabCandidates(const std::string& sourceAssemblyUuid) const override
    {
        std::vector<SlabCandidate> candidates;
        for (const auto& entry : snapshots) {
            const auto& snapshot = entry.second;
            if (snapshot.elementType != "Slab") {
                continue;
            }
            bool hasProperties = false;
            BuildSyncProperties props = readBuildSyncProperties(snapshot.elementGuid, &hasProperties);
            if (!hasProperties || props.sourceAssemblyUuid != sourceAssemblyUuid) {
                continue;
            }
            candidates.push_back({snapshot, props, true});
        }
        return candidates;
    }

    bool deleteElements(const std::vector<std::string>& elementGuids) override
    {
        if (failDeleteElements) {
            diagnostic = "delete failed";
            return false;
        }
        deleted.insert(deleted.end(), elementGuids.begin(), elementGuids.end());
        if (liveElements != nullptr) {
            for (const auto& elementGuid : elementGuids) {
                liveElements->erase(elementGuid);
            }
        }
        return true;
    }

    std::string groupElements(const std::vector<std::string>& elementGuids) override
    {
        grouped = elementGuids;
        return "GROUP-1";
    }

    bool ungroupElements(const std::string&, const std::vector<std::string>&) override { return true; }
    std::string lastDiagnostic() const override { return diagnostic; }
};

int main()
{
    const auto registryPath = std::filesystem::temp_directory_path() / "buildsync-native-runtime-test.registry";
    std::filesystem::remove(registryPath);

    AssemblyRegistry registry;
    Assembly assembly;
    assembly.assemblyUuid = "uuid-with-special";
    assembly.assemblyId = "JN-014";
    assembly.name = "Kitchen | Island";
    assembly.type = "Joinery";
    assembly.zone = "Apartment 204";
    assembly.level = "L02";
    assembly.trade = "Joinery";
    assembly.taskId = "TASK-240";
    assembly.version = 3;
    assembly.members = {{"uuid-with-special", "GUID-001", "Slab", "Bench|top", "active", "now"}};
    assembly.customProperties = {{"FireRating", "60|min"}, {"Finish", "Oak"}};
    assert(registry.createAssembly(assembly));

    FileRegistryStorage storage(registryPath);
    assert(storage.save(registry));

    AssemblyRegistry loaded;
    assert(storage.load(loaded));
    const auto loadedAssembly = loaded.getAssemblyByUuid("uuid-with-special");
    assert(loadedAssembly);
    assert(loadedAssembly->name == "Kitchen | Island");
    assert(loadedAssembly->members.front().role == "Bench|top");
    assert(loadedAssembly->customProperties.size() == 2);
    assert(loadedAssembly->customProperties.front().value == "60|min");

    AssemblyRegistry emptyRegistry;
    Assembly emptyAssembly = assembly;
    emptyAssembly.assemblyUuid = "uuid-empty";
    emptyAssembly.members = {};
    assert(emptyRegistry.createAssembly(emptyAssembly));
    assert(storage.save(emptyRegistry));
    AssemblyRegistry loadedEmpty;
    assert(storage.load(loadedEmpty));
    assert(loadedEmpty.listAssemblies().empty());

    AssemblyRegistry treeRegistry;
    Assembly emptyParent = emptyAssembly;
    emptyParent.assemblyUuid = "uuid-parent-empty";
    emptyParent.assemblyId = "KIT-002";
    Assembly childAssembly = assembly;
    childAssembly.assemblyUuid = "uuid-child-with-member";
    childAssembly.assemblyId = "JN-014";
    childAssembly.members = {{"uuid-child-with-member", "GUID-010", "Object", "Plant", "active", ""}};
    assert(treeRegistry.createAssembly(emptyParent));
    assert(treeRegistry.createAssembly(childAssembly));
    assert(treeRegistry.addChildWrapper("uuid-parent-empty", "uuid-child-with-member"));
    assert(storage.save(treeRegistry));
    AssemblyRegistry loadedTree;
    assert(storage.load(loadedTree));
    assert(loadedTree.getAssemblyByUuid("uuid-parent-empty"));
    assert(loadedTree.listChildWrappers("uuid-parent-empty").size() == 1);
    assert(loadedTree.resolveEffectiveMembers("uuid-parent-empty").size() == 1);

    FakeSelectionReader selection;
    selection.selection = {{"GUID-002", "Wall"}};
    FakePropertyWriter properties;
    FakeExistenceChecker existence;
    existence.live = {"GUID-002"};
    FakeMetadataReader metadata;
    FakeHighlightController highlighter;
    FakeListenerClient listener;
    FakeInstanceElementOperator instanceOperator;
    instanceOperator.liveElements = &existence.live;
    instanceOperator.writtenProperties = &properties.properties;
    AssemblyRegistry runtimeRegistry;
    NamingRules naming;
    SyncQueue queue;
    int uuid = 0;

    AssemblyCommandService commands(
        selection,
        properties,
        existence,
        metadata,
        highlighter,
        storage,
        listener,
        runtimeRegistry,
        naming,
        queue,
        "local-project",
        [&]() { return "runtime-uuid-" + std::to_string(++uuid); },
        &instanceOperator);
    NativeRuntime runtime(commands, [] {
        return CreateAssemblyRequest{"Runtime Assembly", "Joinery", "A204", "L02", "Joinery", "TASK-240"};
    });

    const CommandResult created = runtime.handleMenuCommand(CreateAssemblyCommandId);
    assert(created.ok);
    assert(properties.properties["GUID-002"].assemblyId == "L02-A204-J01");
    assert(commandResultReport(created).find("BuildSync:") == 0);
    assert(runtime.handleMenuCommand(DebugSelectionCommandId).message.find("GUID-002") != std::string::npos);
    assert(runtime.handleMenuCommand(DebugRegistryCommandId).message.find("L02-A204-J01") != std::string::npos);
    assert(runtime.handleMenuCommand(DebugBuildSyncPropertiesCommandId).message.find("BS_AssemblyID=\"L02-A204-J01\"") != std::string::npos);

    const auto sourceAssembly = runtimeRegistry.getAssemblyByElementGuid("GUID-002");
    assert(sourceAssembly);
    const CommandResult placed = commands.placeWrapperInstance({sourceAssembly->assemblyUuid, "Runtime Instance", {10.0, 20.0, 90.0, false}});
    assert(placed.ok);
    const auto instances = commands.listWrapperInstances(sourceAssembly->assemblyUuid);
    assert(instances.size() == 1);
    assert(instances.front().sourceIsCountable);
    assert(!instances.front().localOverridesAllowed);
    const auto instanceMembers = commands.listWrapperInstanceMembers(instances.front().instanceUuid);
    assert(instanceMembers.size() == 1);
    existence.live.insert(instanceMembers.front().elementGuid);
    assert(properties.properties[instanceMembers.front().elementGuid].isInstance == "true");
    assert(properties.properties[instanceMembers.front().elementGuid].localOverridesAllowed == "false");

    selection.selection = {{instanceMembers.front().elementGuid, instanceMembers.front().elementType}};
    assert(commands.selectSelectedElementInstance().ok);
    assert(highlighter.selected.size() == 1);
    assert(commands.convertSelectedInstanceToStandaloneWrapper("Standalone Runtime Instance").ok);
    assert(runtimeRegistry.getInstance(instances.front().instanceUuid) == std::nullopt);

    AssemblyRegistry slabRegistry;
    FakeSelectionReader slabSelection;
    FakePropertyWriter slabProperties;
    FakeExistenceChecker slabExistence;
    FakeMetadataReader slabMetadata;
    FakeHighlightController slabHighlighter;
    FakeInstanceElementOperator slabOperator;
    slabOperator.liveElements = &slabExistence.live;
    slabOperator.writtenProperties = &slabProperties.properties;
    SyncQueue slabQueue;
    int slabUuid = 0;
    Assembly slabAssembly;
    slabAssembly.assemblyUuid = "slab-assembly";
    slabAssembly.assemblyId = "SLAB-001";
    slabAssembly.name = "Slab Assembly";
    slabAssembly.type = "Test";
    slabAssembly.members = {{"slab-assembly", "SLAB-SOURCE", "Slab", "Top", "active", ""}};
    const bool slabAssemblyCreated = slabRegistry.createAssembly(slabAssembly);
    assert(slabAssemblyCreated);
    if (!slabAssemblyCreated) {
        return 1;
    }
    slabExistence.live = {"SLAB-SOURCE"};

    auto makeSlabSnapshot = [](const std::string& guid, double offsetX, double width) {
        ElementSnapshot snapshot;
        snapshot.elementGuid = guid;
        snapshot.elementType = "Slab";
        snapshot.snapshotJson = "{}";
        snapshot.coordinateOriginX = offsetX + width / 2.0;
        snapshot.coordinateOriginY = 5.0;
        snapshot.coordinateRotationDegrees = 0.0;
        snapshot.coordinateFrameValid = true;
        snapshot.frameOriginX = offsetX + width / 2.0;
        snapshot.frameOriginY = 5.0;
        snapshot.frameRotationDegrees = 0.0;
        snapshot.frameValid = true;
        snapshot.topologySignature = "slab-five-point";
        snapshot.polygonCoords = {
            0.0, 0.0,
            offsetX, 0.0,
            offsetX + width, 0.0,
            offsetX + width, 10.0,
            offsetX, 10.0,
            offsetX, 0.0,
        };
        snapshot.polygonFrameOriginX = offsetX + width / 2.0;
        snapshot.polygonFrameOriginY = 5.0;
        snapshot.polygonFrameRotationDegrees = 0.0;
        snapshot.polygonFrameValid = true;
        snapshot.boundsCenterX = offsetX + width / 2.0;
        snapshot.boundsCenterY = 5.0;
        snapshot.boundsCenterZ = 0.0;
        snapshot.boundsValid = true;
        return snapshot;
    };
    auto makeSlabSnapshotWithHole = [&](const std::string& guid, double offsetX, double width) {
        ElementSnapshot snapshot = makeSlabSnapshot(guid, offsetX, width);
        snapshot.topologySignature = "slab-hole-topology";
        snapshot.polygonCoords = {
            0.0, 0.0,
            offsetX, 0.0,
            offsetX + width, 0.0,
            offsetX + width, 10.0,
            offsetX, 10.0,
            offsetX, 0.0,
            offsetX + 2.0, 2.0,
            offsetX + 4.0, 2.0,
            offsetX + 4.0, 4.0,
            offsetX + 2.0, 4.0,
            offsetX + 2.0, 2.0,
        };
        return snapshot;
    };
    auto makeRotatedSlabSnapshot = [](const std::string& guid, double centerX, double centerY, double width, double height, double rotationDegrees) {
        ElementSnapshot snapshot;
        snapshot.elementGuid = guid;
        snapshot.elementType = "Slab";
        snapshot.snapshotJson = "{}";
        snapshot.coordinateOriginX = centerX;
        snapshot.coordinateOriginY = centerY;
        snapshot.coordinateRotationDegrees = rotationDegrees;
        snapshot.coordinateFrameValid = true;
        snapshot.frameOriginX = centerX;
        snapshot.frameOriginY = centerY;
        snapshot.frameRotationDegrees = rotationDegrees;
        snapshot.frameValid = true;
        snapshot.topologySignature = "slab-rotated";
        snapshot.polygonFrameOriginX = centerX;
        snapshot.polygonFrameOriginY = centerY;
        snapshot.polygonFrameRotationDegrees = rotationDegrees;
        snapshot.polygonFrameValid = true;
        snapshot.boundsCenterX = centerX;
        snapshot.boundsCenterY = centerY;
        snapshot.boundsCenterZ = 0.0;
        snapshot.boundsValid = true;
        const double radians = rotationDegrees * 3.14159265358979323846 / 180.0;
        const auto addPoint = [&](std::vector<double>& coords, double localX, double localY) {
            coords.push_back(centerX + std::cos(radians) * localX - std::sin(radians) * localY);
            coords.push_back(centerY + std::sin(radians) * localX + std::cos(radians) * localY);
        };
        snapshot.polygonCoords = {0.0, 0.0};
        addPoint(snapshot.polygonCoords, -width / 2.0, -height / 2.0);
        addPoint(snapshot.polygonCoords, width / 2.0, -height / 2.0);
        addPoint(snapshot.polygonCoords, width / 2.0, height / 2.0);
        addPoint(snapshot.polygonCoords, -width / 2.0, height / 2.0);
        addPoint(snapshot.polygonCoords, -width / 2.0, -height / 2.0);
        return snapshot;
    };

    slabOperator.snapshots["SLAB-SOURCE"] = makeSlabSnapshot("SLAB-SOURCE", 0.0, 10.0);
    FileRegistryStorage slabStorage(std::filesystem::temp_directory_path() / "buildsync-native-runtime-slab-test.registry");
    AssemblyCommandService slabCommands(
        slabSelection,
        slabProperties,
        slabExistence,
        slabMetadata,
        slabHighlighter,
        slabStorage,
        listener,
        slabRegistry,
        naming,
        slabQueue,
        "local-project",
        [&]() { return "slab-runtime-uuid-" + std::to_string(++slabUuid); },
        &slabOperator);

    const CommandResult slabPlaced = slabCommands.placeWrapperInstance({"slab-assembly", "Slab Instance", {100.0, 0.0, 0.0, false}});
    assert(slabPlaced.ok);
    if (!slabPlaced.ok) {
        return 1;
    }
    const auto slabInstances = slabCommands.listWrapperInstances("slab-assembly");
    assert(slabInstances.size() == 1);
    if (slabInstances.size() != 1) {
        return 1;
    }
    const auto slabInstanceMembers = slabCommands.listWrapperInstanceMembers(slabInstances.front().instanceUuid);
    assert(slabInstanceMembers.size() == 1);
    if (slabInstanceMembers.size() != 1) {
        return 1;
    }
    slabExistence.live.insert(slabInstanceMembers.front().elementGuid);
    // Simulate the user moving the instance in Archicad after it was created.
    slabOperator.snapshots[slabInstanceMembers.front().elementGuid] = makeSlabSnapshot(slabInstanceMembers.front().elementGuid, 150.0, 10.0);
    slabOperator.replaceSlabsOnUpdate = true;

    slabSelection.selection = {{"SLAB-SOURCE", "Slab"}};
    const CommandResult slabEditMode = slabCommands.enterWrapperEditMode();
    assert(slabEditMode.ok);
    if (!slabEditMode.ok) {
        return 1;
    }
    const std::string slabTracePath = geometryTracePathFromMessage(slabEditMode.message);
    assert(!slabTracePath.empty());
    assert(std::filesystem::exists(slabTracePath));
    slabOperator.snapshots["SLAB-SOURCE"] = makeSlabSnapshotWithHole("SLAB-SOURCE", 0.0, 20.0);
    slabExistence.live.insert(slabInstanceMembers.front().elementGuid + "-REPLACED");
    const CommandResult slabApply = slabCommands.applyWrapperEdit();
    assert(slabApply.ok);
    if (!slabApply.ok) {
        return 1;
    }
    assert(slabApply.message.find(slabTracePath) != std::string::npos);
    const std::string slabTrace = readTextFile(slabTracePath);
    assert(slabTrace.find("## pre-enter-edit") != std::string::npos);
    assert(slabTrace.find("## enter-edit-baseline/reconciliation") != std::string::npos);
    assert(slabTrace.find("## apply-selection/raw-snapshots") != std::string::npos);
    assert(slabTrace.find("## apply-target-baseline/instance") != std::string::npos);
    assert(slabTrace.find("## post-apply-registry/pre-save") != std::string::npos);
    assert(slabTrace.find("instanceFrame") != std::string::npos);
    assert(slabTrace.find("origin=(155.000000,5.000000)") != std::string::npos);
    assert(slabTrace.find("polygonCoords") != std::string::npos);
    assert(slabTrace.find("localPolygonCoords") != std::string::npos);
    assert(slabApply.message.find("Edited slab targets skipped=1") != std::string::npos);
    assert(std::find(slabOperator.updatedTargets.begin(), slabOperator.updatedTargets.end(), "SLAB-SOURCE") == slabOperator.updatedTargets.end());
    const std::string replacedInstanceGuid = slabInstanceMembers.front().elementGuid + "-REPLACED";
    assert(std::find(slabOperator.updatedTargets.begin(), slabOperator.updatedTargets.end(), slabInstanceMembers.front().elementGuid) != slabOperator.updatedTargets.end());
    assert(slabOperator.snapshots.count("SLAB-SOURCE") == 1);
    assert(slabOperator.snapshots.count("SLAB-SOURCE-REPLACED") == 0);
    assert(slabRegistry.getInstanceByMemberElementGuid(replacedInstanceGuid).has_value());
    assert(slabOperator.targetBaselinesByElementGuid.at(slabInstanceMembers.front().elementGuid).coordinateOriginX == 155.0);
    assert(slabOperator.targetBaselinesByElementGuid.at(slabInstanceMembers.front().elementGuid).boundsCenterX == 155.0);
    const auto updatedInstance = slabOperator.snapshots.at(replacedInstanceGuid);
    assert(updatedInstance.localPolygonCoords.size() == updatedInstance.polygonCoords.size());
    assert(updatedInstance.localPolygonCoords[2] == -10.0);
    assert(updatedInstance.localPolygonCoords[4] == 10.0);
    assert(updatedInstance.boundsCenterX == 155.0);
    assert(updatedInstance.topologySignature == "slab-hole-topology");
    const auto persistedMovedInstance = slabRegistry.getInstanceByMemberElementGuid(replacedInstanceGuid);
    assert(persistedMovedInstance->liveFrame.valid);
    assert(persistedMovedInstance->liveFrame.originX == 155.0);
    const auto persistedMovedBinding = slabRegistry.getPlacementBinding(persistedMovedInstance->instanceUuid, slabInstanceMembers.front().componentId);
    assert(persistedMovedBinding);
    assert(persistedMovedBinding->elementGuid == replacedInstanceGuid);
    assert(persistedMovedBinding->lastBoundsValid);
    assert(persistedMovedBinding->lastBoundsCenterX == 155.0);

    slabSelection.selection = {{replacedInstanceGuid, "Slab"}};
    const CommandResult secondEditAfterMovedApply = slabCommands.enterWrapperEditMode();
    assert(secondEditAfterMovedApply.ok);
    if (!secondEditAfterMovedApply.ok) {
        return 1;
    }
    const CommandResult cancelSecondEdit = slabCommands.cancelWrapperEdit();
    assert(cancelSecondEdit.ok);
    if (!cancelSecondEdit.ok) {
        return 1;
    }

    slabOperator.replaceSlabsOnUpdate = false;
    slabOperator.snapshots[replacedInstanceGuid] = makeRotatedSlabSnapshot(replacedInstanceGuid, 155.0, 5.0, 20.0, 10.0, 30.0);
    slabSelection.selection = {{"SLAB-SOURCE", "Slab"}};
    const CommandResult inPlaceSecondEditMode = slabCommands.enterWrapperEditMode();
    assert(inPlaceSecondEditMode.ok);
    if (!inPlaceSecondEditMode.ok) {
        return 1;
    }
    slabOperator.snapshots["SLAB-SOURCE"] = makeSlabSnapshotWithHole("SLAB-SOURCE", 0.0, 30.0);
    const CommandResult inPlaceSecondApply = slabCommands.applyWrapperEdit();
    assert(inPlaceSecondApply.ok);
    if (!inPlaceSecondApply.ok) {
        return 1;
    }
    assert(slabOperator.targetBaselinesByElementGuid.at(replacedInstanceGuid).coordinateOriginX == 155.0);
    assert(slabOperator.targetBaselinesByElementGuid.at(replacedInstanceGuid).coordinateRotationDegrees == 30.0);
    assert(slabOperator.snapshots.at(replacedInstanceGuid).boundsCenterX == 155.0);
    assert(slabOperator.snapshots.at(replacedInstanceGuid).coordinateRotationDegrees == 30.0);
    assert(slabRegistry.getInstanceByMemberElementGuid(replacedInstanceGuid).has_value());

    auto buildSyncIdentity = [](const std::string& sourceAssemblyUuid, const std::string& placementId, const std::string& componentId) {
        BuildSyncProperties props;
        props.sourceAssemblyUuid = sourceAssemblyUuid;
        props.placementId = placementId;
        props.componentId = componentId;
        if (placementId == AssemblyRegistry::sourcePlacementIdFor(sourceAssemblyUuid)) {
            props.isSourcePlacement = "true";
            props.isInstance = "false";
        } else {
            props.instanceUuid = placementId;
            props.isSourcePlacement = "false";
            props.isInstance = "true";
        }
        return props;
    };

    AssemblyRegistry sourceOrphanRegistry;
    Assembly sourceOrphanAssembly = slabAssembly;
    sourceOrphanAssembly.assemblyUuid = "slab-source-orphan-cleanup";
    sourceOrphanAssembly.members = {{"slab-source-orphan-cleanup", "SLAB-SOURCE-ORPHAN", "Slab", "Top", "active", ""}};
    const bool sourceOrphanAssemblyCreated = sourceOrphanRegistry.createAssembly(sourceOrphanAssembly);
    assert(sourceOrphanAssemblyCreated);
    if (!sourceOrphanAssemblyCreated) {
        return 1;
    }
    FakeSelectionReader sourceOrphanSelection;
    FakePropertyWriter sourceOrphanProperties;
    FakeExistenceChecker sourceOrphanExistence;
    sourceOrphanExistence.live = {"SLAB-SOURCE-ORPHAN"};
    FakeInstanceElementOperator sourceOrphanOperator;
    sourceOrphanOperator.liveElements = &sourceOrphanExistence.live;
    sourceOrphanOperator.writtenProperties = &sourceOrphanProperties.properties;
    sourceOrphanOperator.snapshots["SLAB-SOURCE-ORPHAN"] = makeSlabSnapshot("SLAB-SOURCE-ORPHAN", 0.0, 10.0);
    SyncQueue sourceOrphanQueue;
    int sourceOrphanUuid = 0;
    AssemblyCommandService sourceOrphanCommands(
        sourceOrphanSelection,
        sourceOrphanProperties,
        sourceOrphanExistence,
        slabMetadata,
        slabHighlighter,
        slabStorage,
        listener,
        sourceOrphanRegistry,
        naming,
        sourceOrphanQueue,
        "local-project",
        [&]() { return "source-orphan-runtime-uuid-" + std::to_string(++sourceOrphanUuid); },
        &sourceOrphanOperator);
    const CommandResult sourceOrphanPlaced = sourceOrphanCommands.placeWrapperInstance({"slab-source-orphan-cleanup", "Source Orphan Instance", {100.0, 0.0, 0.0, false}});
    assert(sourceOrphanPlaced.ok);
    const auto sourceOrphanInstances = sourceOrphanCommands.listWrapperInstances("slab-source-orphan-cleanup");
    const auto sourceOrphanMembers = sourceOrphanCommands.listWrapperInstanceMembers(sourceOrphanInstances.front().instanceUuid);
    sourceOrphanExistence.live.insert(sourceOrphanMembers.front().elementGuid);
    sourceOrphanOperator.snapshots[sourceOrphanMembers.front().elementGuid] = makeSlabSnapshot(sourceOrphanMembers.front().elementGuid, 100.0, 10.0);
    const std::string sourceOrphanComponentId = sourceOrphanRegistry.getComponentBySourceElementGuid("SLAB-SOURCE-ORPHAN")->componentId;
    sourceOrphanSelection.selection = {{"SLAB-SOURCE-ORPHAN", "Slab"}};
    const CommandResult sourceOrphanEditMode = sourceOrphanCommands.enterWrapperEditMode();
    assert(sourceOrphanEditMode.ok);
    if (!sourceOrphanEditMode.ok) {
        return 1;
    }
    sourceOrphanOperator.snapshots["SLAB-SOURCE-ORPHAN"] = makeSlabSnapshotWithHole("SLAB-SOURCE-ORPHAN", 0.0, 20.0);
    sourceOrphanOperator.snapshots["SLAB-SOURCE-ORPHAN-STALE"] = makeSlabSnapshotWithHole("SLAB-SOURCE-ORPHAN-STALE", 0.0, 20.0);
    sourceOrphanExistence.live.insert("SLAB-SOURCE-ORPHAN-STALE");
    sourceOrphanOperator.buildSyncProperties["SLAB-SOURCE-ORPHAN-STALE"] = buildSyncIdentity(
        "slab-source-orphan-cleanup",
        AssemblyRegistry::sourcePlacementIdFor("slab-source-orphan-cleanup"),
        sourceOrphanComponentId);
    const CommandResult sourceOrphanApply = sourceOrphanCommands.applyWrapperEdit();
    assert(sourceOrphanApply.ok);
    if (!sourceOrphanApply.ok) {
        return 1;
    }
    assert(std::find(sourceOrphanOperator.deleted.begin(), sourceOrphanOperator.deleted.end(), "SLAB-SOURCE-ORPHAN-STALE") != sourceOrphanOperator.deleted.end());
    assert(!sourceOrphanExistence.exists("SLAB-SOURCE-ORPHAN-STALE"));

    AssemblyRegistry instanceOrphanRegistry;
    Assembly instanceOrphanAssembly = slabAssembly;
    instanceOrphanAssembly.assemblyUuid = "slab-instance-orphan-cleanup";
    instanceOrphanAssembly.members = {{"slab-instance-orphan-cleanup", "SLAB-INSTANCE-ORPHAN-SOURCE", "Slab", "Top", "active", ""}};
    const bool instanceOrphanAssemblyCreated = instanceOrphanRegistry.createAssembly(instanceOrphanAssembly);
    assert(instanceOrphanAssemblyCreated);
    if (!instanceOrphanAssemblyCreated) {
        return 1;
    }
    FakeSelectionReader instanceOrphanSelection;
    FakePropertyWriter instanceOrphanProperties;
    FakeExistenceChecker instanceOrphanExistence;
    instanceOrphanExistence.live = {"SLAB-INSTANCE-ORPHAN-SOURCE"};
    FakeInstanceElementOperator instanceOrphanOperator;
    instanceOrphanOperator.liveElements = &instanceOrphanExistence.live;
    instanceOrphanOperator.writtenProperties = &instanceOrphanProperties.properties;
    instanceOrphanOperator.snapshots["SLAB-INSTANCE-ORPHAN-SOURCE"] = makeSlabSnapshot("SLAB-INSTANCE-ORPHAN-SOURCE", 0.0, 10.0);
    SyncQueue instanceOrphanQueue;
    int instanceOrphanUuid = 0;
    AssemblyCommandService instanceOrphanCommands(
        instanceOrphanSelection,
        instanceOrphanProperties,
        instanceOrphanExistence,
        slabMetadata,
        slabHighlighter,
        slabStorage,
        listener,
        instanceOrphanRegistry,
        naming,
        instanceOrphanQueue,
        "local-project",
        [&]() { return "instance-orphan-runtime-uuid-" + std::to_string(++instanceOrphanUuid); },
        &instanceOrphanOperator);
    const CommandResult instanceOrphanPlaced = instanceOrphanCommands.placeWrapperInstance({"slab-instance-orphan-cleanup", "Instance Orphan Instance", {100.0, 0.0, 0.0, false}});
    assert(instanceOrphanPlaced.ok);
    if (!instanceOrphanPlaced.ok) {
        return 1;
    }
    const auto instanceOrphanInstances = instanceOrphanCommands.listWrapperInstances("slab-instance-orphan-cleanup");
    const auto instanceOrphanMembers = instanceOrphanCommands.listWrapperInstanceMembers(instanceOrphanInstances.front().instanceUuid);
    const std::string instanceOrphanGuid = instanceOrphanMembers.front().elementGuid;
    const std::string instanceOrphanComponentId = instanceOrphanMembers.front().componentId;
    instanceOrphanExistence.live.insert(instanceOrphanGuid);
    instanceOrphanOperator.snapshots[instanceOrphanGuid] = makeSlabSnapshot(instanceOrphanGuid, 100.0, 10.0);
    instanceOrphanSelection.selection = {{instanceOrphanGuid, "Slab"}};
    const CommandResult instanceOrphanEditMode = instanceOrphanCommands.enterWrapperEditMode();
    assert(instanceOrphanEditMode.ok);
    if (!instanceOrphanEditMode.ok) {
        return 1;
    }
    instanceOrphanOperator.snapshots[instanceOrphanGuid] = makeSlabSnapshotWithHole(instanceOrphanGuid, 100.0, 20.0);
    instanceOrphanOperator.snapshots["SLAB-INSTANCE-ORPHAN-STALE"] = makeSlabSnapshotWithHole("SLAB-INSTANCE-ORPHAN-STALE", 100.0, 20.0);
    instanceOrphanExistence.live.insert("SLAB-INSTANCE-ORPHAN-STALE");
    instanceOrphanOperator.buildSyncProperties["SLAB-INSTANCE-ORPHAN-STALE"] = buildSyncIdentity(
        "slab-instance-orphan-cleanup",
        instanceOrphanInstances.front().instanceUuid,
        instanceOrphanComponentId);
    const CommandResult instanceOrphanApply = instanceOrphanCommands.applyWrapperEdit();
    assert(instanceOrphanApply.ok);
    if (!instanceOrphanApply.ok) {
        return 1;
    }
    assert(std::find(instanceOrphanOperator.deleted.begin(), instanceOrphanOperator.deleted.end(), "SLAB-INSTANCE-ORPHAN-STALE") != instanceOrphanOperator.deleted.end());
    assert(!instanceOrphanExistence.exists("SLAB-INSTANCE-ORPHAN-STALE"));

    AssemblyRegistry ambiguousOrphanRegistry;
    Assembly ambiguousOrphanAssembly = slabAssembly;
    ambiguousOrphanAssembly.assemblyUuid = "slab-ambiguous-orphan-cleanup";
    ambiguousOrphanAssembly.members = {
        {"slab-ambiguous-orphan-cleanup", "SLAB-AMBIGUOUS-SOURCE", "Slab", "Top", "active", ""},
        {"slab-ambiguous-orphan-cleanup", "SLAB-BOUND-OTHER-COMPONENT", "Slab", "Other", "active", ""},
    };
    const bool ambiguousOrphanAssemblyCreated = ambiguousOrphanRegistry.createAssembly(ambiguousOrphanAssembly);
    assert(ambiguousOrphanAssemblyCreated);
    if (!ambiguousOrphanAssemblyCreated) {
        return 1;
    }
    FakeSelectionReader ambiguousOrphanSelection;
    FakePropertyWriter ambiguousOrphanProperties;
    FakeExistenceChecker ambiguousOrphanExistence;
    ambiguousOrphanExistence.live = {"SLAB-AMBIGUOUS-SOURCE"};
    FakeInstanceElementOperator ambiguousOrphanOperator;
    ambiguousOrphanOperator.liveElements = &ambiguousOrphanExistence.live;
    ambiguousOrphanOperator.writtenProperties = &ambiguousOrphanProperties.properties;
    ambiguousOrphanOperator.snapshots["SLAB-AMBIGUOUS-SOURCE"] = makeSlabSnapshot("SLAB-AMBIGUOUS-SOURCE", 0.0, 10.0);
    ambiguousOrphanExistence.live.insert("SLAB-BOUND-OTHER-COMPONENT");
    ambiguousOrphanOperator.snapshots["SLAB-BOUND-OTHER-COMPONENT"] = makeSlabSnapshot("SLAB-BOUND-OTHER-COMPONENT", 0.0, 10.0);
    SyncQueue ambiguousOrphanQueue;
    int ambiguousOrphanUuid = 0;
    AssemblyCommandService ambiguousOrphanCommands(
        ambiguousOrphanSelection,
        ambiguousOrphanProperties,
        ambiguousOrphanExistence,
        slabMetadata,
        slabHighlighter,
        slabStorage,
        listener,
        ambiguousOrphanRegistry,
        naming,
        ambiguousOrphanQueue,
        "local-project",
        [&]() { return "ambiguous-orphan-runtime-uuid-" + std::to_string(++ambiguousOrphanUuid); },
        &ambiguousOrphanOperator);
    const CommandResult ambiguousOrphanPlaced = ambiguousOrphanCommands.placeWrapperInstance({"slab-ambiguous-orphan-cleanup", "Ambiguous Orphan Instance", {100.0, 0.0, 0.0, false}});
    assert(ambiguousOrphanPlaced.ok);
    if (!ambiguousOrphanPlaced.ok) {
        return 1;
    }
    const auto ambiguousComponentId = ambiguousOrphanRegistry.getComponentBySourceElementGuid("SLAB-AMBIGUOUS-SOURCE")->componentId;
    const auto boundOtherComponentId = ambiguousOrphanRegistry.getComponentBySourceElementGuid("SLAB-BOUND-OTHER-COMPONENT")->componentId;
    ambiguousOrphanSelection.selection = {{"SLAB-AMBIGUOUS-SOURCE", "Slab"}};
    const CommandResult ambiguousOrphanEditMode = ambiguousOrphanCommands.enterWrapperEditMode();
    assert(ambiguousOrphanEditMode.ok);
    if (!ambiguousOrphanEditMode.ok) {
        return 1;
    }
    ambiguousOrphanOperator.snapshots["SLAB-AMBIGUOUS-SOURCE"] = makeSlabSnapshotWithHole("SLAB-AMBIGUOUS-SOURCE", 0.0, 20.0);
    ambiguousOrphanOperator.snapshots["SLAB-AMBIGUOUS-CANDIDATE"] = makeSlabSnapshotWithHole("SLAB-AMBIGUOUS-CANDIDATE", 0.0, 20.0);
    ambiguousOrphanExistence.live.insert("SLAB-AMBIGUOUS-CANDIDATE");
    ambiguousOrphanOperator.buildSyncProperties["SLAB-AMBIGUOUS-CANDIDATE"] = buildSyncIdentity(
        "slab-ambiguous-orphan-cleanup",
        AssemblyRegistry::sourcePlacementIdFor("slab-ambiguous-orphan-cleanup"),
        "OTHER-COMPONENT");
    ambiguousOrphanOperator.snapshots["SLAB-PARTIAL-IDENTITY-CANDIDATE"] = makeSlabSnapshot("SLAB-PARTIAL-IDENTITY-CANDIDATE", 0.0, 10.0);
    ambiguousOrphanExistence.live.insert("SLAB-PARTIAL-IDENTITY-CANDIDATE");
    ambiguousOrphanOperator.buildSyncProperties["SLAB-PARTIAL-IDENTITY-CANDIDATE"].sourceAssemblyUuid = "slab-ambiguous-orphan-cleanup";
    ambiguousOrphanOperator.buildSyncProperties["SLAB-PARTIAL-IDENTITY-CANDIDATE"].placementId =
        AssemblyRegistry::sourcePlacementIdFor("slab-ambiguous-orphan-cleanup");
    ambiguousOrphanOperator.buildSyncProperties["SLAB-BOUND-OTHER-COMPONENT"] = buildSyncIdentity(
        "slab-ambiguous-orphan-cleanup",
        AssemblyRegistry::sourcePlacementIdFor("slab-ambiguous-orphan-cleanup"),
        boundOtherComponentId);
    const CommandResult ambiguousOrphanApply = ambiguousOrphanCommands.applyWrapperEdit();
    assert(ambiguousOrphanApply.ok);
    if (!ambiguousOrphanApply.ok) {
        return 1;
    }
    assert(std::find(ambiguousOrphanOperator.deleted.begin(), ambiguousOrphanOperator.deleted.end(), "SLAB-AMBIGUOUS-CANDIDATE") != ambiguousOrphanOperator.deleted.end());
    assert(!ambiguousOrphanExistence.exists("SLAB-AMBIGUOUS-CANDIDATE"));
    assert(std::find(ambiguousOrphanOperator.deleted.begin(), ambiguousOrphanOperator.deleted.end(), "SLAB-PARTIAL-IDENTITY-CANDIDATE") != ambiguousOrphanOperator.deleted.end());
    assert(!ambiguousOrphanExistence.exists("SLAB-PARTIAL-IDENTITY-CANDIDATE"));
    assert(std::find(ambiguousOrphanOperator.deleted.begin(), ambiguousOrphanOperator.deleted.end(), "SLAB-BOUND-OTHER-COMPONENT") == ambiguousOrphanOperator.deleted.end());
    assert(ambiguousOrphanExistence.exists("SLAB-BOUND-OTHER-COMPONENT"));

    AssemblyRegistry changedGuidRegistry;
    Assembly changedGuidAssembly = slabAssembly;
    changedGuidAssembly.assemblyUuid = "slab-source-guid-changed";
    changedGuidAssembly.members = {{"slab-source-guid-changed", "SLAB-CHANGED-SOURCE-OLD", "Slab", "Top", "active", ""}};
    const bool changedGuidAssemblyCreated = changedGuidRegistry.createAssembly(changedGuidAssembly);
    assert(changedGuidAssemblyCreated);
    if (!changedGuidAssemblyCreated) {
        return 1;
    }
    FakeSelectionReader changedGuidSelection;
    FakePropertyWriter changedGuidProperties;
    FakeExistenceChecker changedGuidExistence;
    changedGuidExistence.live = {"SLAB-CHANGED-SOURCE-OLD", "SLAB-CHANGED-SOURCE-NEW"};
    FakeInstanceElementOperator changedGuidOperator;
    changedGuidOperator.liveElements = &changedGuidExistence.live;
    changedGuidOperator.writtenProperties = &changedGuidProperties.properties;
    changedGuidOperator.snapshots["SLAB-CHANGED-SOURCE-OLD"] = makeSlabSnapshot("SLAB-CHANGED-SOURCE-OLD", 0.0, 10.0);
    SyncQueue changedGuidQueue;
    int changedGuidUuid = 0;
    AssemblyCommandService changedGuidCommands(
        changedGuidSelection,
        changedGuidProperties,
        changedGuidExistence,
        slabMetadata,
        slabHighlighter,
        slabStorage,
        listener,
        changedGuidRegistry,
        naming,
        changedGuidQueue,
        "local-project",
        [&]() { return "changed-guid-runtime-uuid-" + std::to_string(++changedGuidUuid); },
        &changedGuidOperator);
    const CommandResult changedGuidPlaced = changedGuidCommands.placeWrapperInstance({"slab-source-guid-changed", "Changed Source Guid Instance", {100.0, 0.0, 0.0, false}});
    assert(changedGuidPlaced.ok);
    if (!changedGuidPlaced.ok) {
        return 1;
    }
    const auto changedGuidInstances = changedGuidCommands.listWrapperInstances("slab-source-guid-changed");
    assert(changedGuidInstances.size() == 1);
    if (changedGuidInstances.size() != 1) {
        return 1;
    }
    const auto changedGuidMembers = changedGuidCommands.listWrapperInstanceMembers(changedGuidInstances.front().instanceUuid);
    assert(changedGuidMembers.size() == 1);
    if (changedGuidMembers.size() != 1) {
        return 1;
    }
    changedGuidExistence.live.insert(changedGuidMembers.front().elementGuid);
    changedGuidOperator.snapshots[changedGuidMembers.front().elementGuid] = makeSlabSnapshot(changedGuidMembers.front().elementGuid, 100.0, 10.0);
    changedGuidSelection.selection = {{"SLAB-CHANGED-SOURCE-OLD", "Slab"}};
    const CommandResult changedGuidEditMode = changedGuidCommands.enterWrapperEditMode();
    assert(changedGuidEditMode.ok);
    if (!changedGuidEditMode.ok) {
        return 1;
    }
    changedGuidSelection.selection = {{"SLAB-CHANGED-SOURCE-NEW", "Slab"}};
    changedGuidOperator.snapshots["SLAB-CHANGED-SOURCE-NEW"] = makeSlabSnapshotWithHole("SLAB-CHANGED-SOURCE-NEW", 0.0, 20.0);
    changedGuidOperator.replaceSlabsOnUpdate = true;
    changedGuidExistence.live.insert(changedGuidMembers.front().elementGuid + "-REPLACED");
    const CommandResult changedGuidApply = changedGuidCommands.applyWrapperEdit();
    assert(changedGuidApply.ok);
    if (!changedGuidApply.ok) {
        return 1;
    }
    assert(std::find(changedGuidOperator.updatedTargets.begin(), changedGuidOperator.updatedTargets.end(), "SLAB-CHANGED-SOURCE-OLD") == changedGuidOperator.updatedTargets.end());
    assert(std::find(changedGuidOperator.updatedTargets.begin(), changedGuidOperator.updatedTargets.end(), "SLAB-CHANGED-SOURCE-NEW") == changedGuidOperator.updatedTargets.end());
    assert(std::find(changedGuidOperator.deleted.begin(), changedGuidOperator.deleted.end(), "SLAB-CHANGED-SOURCE-OLD") != changedGuidOperator.deleted.end());
    assert(changedGuidRegistry.getAssemblyByElementGuid("SLAB-CHANGED-SOURCE-NEW").has_value());
    assert(!changedGuidRegistry.getAssemblyByElementGuid("SLAB-CHANGED-SOURCE-OLD").has_value());
    assert(changedGuidRegistry.getInstanceByMemberElementGuid(changedGuidMembers.front().elementGuid + "-REPLACED").has_value());

    AssemblyRegistry changedInstanceGuidRegistry;
    Assembly changedInstanceGuidAssembly = slabAssembly;
    changedInstanceGuidAssembly.assemblyUuid = "slab-instance-guid-changed";
    changedInstanceGuidAssembly.members = {{"slab-instance-guid-changed", "SLAB-INSTANCE-CHANGE-SOURCE", "Slab", "Top", "active", ""}};
    const bool changedInstanceGuidAssemblyCreated = changedInstanceGuidRegistry.createAssembly(changedInstanceGuidAssembly);
    assert(changedInstanceGuidAssemblyCreated);
    if (!changedInstanceGuidAssemblyCreated) {
        return 1;
    }
    FakeSelectionReader changedInstanceGuidSelection;
    FakePropertyWriter changedInstanceGuidProperties;
    FakeExistenceChecker changedInstanceGuidExistence;
    changedInstanceGuidExistence.live = {"SLAB-INSTANCE-CHANGE-SOURCE"};
    FakeInstanceElementOperator changedInstanceGuidOperator;
    changedInstanceGuidOperator.liveElements = &changedInstanceGuidExistence.live;
    changedInstanceGuidOperator.writtenProperties = &changedInstanceGuidProperties.properties;
    changedInstanceGuidOperator.snapshots["SLAB-INSTANCE-CHANGE-SOURCE"] = makeSlabSnapshot("SLAB-INSTANCE-CHANGE-SOURCE", 0.0, 10.0);
    SyncQueue changedInstanceGuidQueue;
    int changedInstanceGuidUuid = 0;
    AssemblyCommandService changedInstanceGuidCommands(
        changedInstanceGuidSelection,
        changedInstanceGuidProperties,
        changedInstanceGuidExistence,
        slabMetadata,
        slabHighlighter,
        slabStorage,
        listener,
        changedInstanceGuidRegistry,
        naming,
        changedInstanceGuidQueue,
        "local-project",
        [&]() { return "changed-instance-guid-runtime-uuid-" + std::to_string(++changedInstanceGuidUuid); },
        &changedInstanceGuidOperator);
    const CommandResult changedInstanceGuidPlaced = changedInstanceGuidCommands.placeWrapperInstance({"slab-instance-guid-changed", "Changed Instance Guid Instance", {100.0, 0.0, 0.0, false}});
    assert(changedInstanceGuidPlaced.ok);
    if (!changedInstanceGuidPlaced.ok) {
        return 1;
    }
    const auto changedInstanceGuidInstances = changedInstanceGuidCommands.listWrapperInstances("slab-instance-guid-changed");
    assert(changedInstanceGuidInstances.size() == 1);
    if (changedInstanceGuidInstances.size() != 1) {
        return 1;
    }
    const auto changedInstanceGuidMembers = changedInstanceGuidCommands.listWrapperInstanceMembers(changedInstanceGuidInstances.front().instanceUuid);
    assert(changedInstanceGuidMembers.size() == 1);
    if (changedInstanceGuidMembers.size() != 1) {
        return 1;
    }
    const std::string changedInstanceOldGuid = changedInstanceGuidMembers.front().elementGuid;
    const std::string changedInstanceNewGuid = "SLAB-INSTANCE-CHANGE-NEW";
    changedInstanceGuidExistence.live.insert(changedInstanceOldGuid);
    changedInstanceGuidExistence.live.insert(changedInstanceNewGuid);
    changedInstanceGuidOperator.snapshots[changedInstanceOldGuid] = makeSlabSnapshot(changedInstanceOldGuid, 100.0, 10.0);
    changedInstanceGuidSelection.selection = {{changedInstanceOldGuid, "Slab"}};
    const CommandResult changedInstanceGuidEditMode = changedInstanceGuidCommands.enterWrapperEditMode();
    assert(changedInstanceGuidEditMode.ok);
    if (!changedInstanceGuidEditMode.ok) {
        return 1;
    }
    changedInstanceGuidSelection.selection = {{changedInstanceNewGuid, "Slab"}};
    changedInstanceGuidOperator.snapshots[changedInstanceNewGuid] = makeSlabSnapshotWithHole(changedInstanceNewGuid, 100.0, 20.0);
    const CommandResult changedInstanceGuidApply = changedInstanceGuidCommands.applyWrapperEdit();
    assert(changedInstanceGuidApply.ok);
    if (!changedInstanceGuidApply.ok) {
        return 1;
    }
    assert(std::find(changedInstanceGuidOperator.updatedTargets.begin(), changedInstanceGuidOperator.updatedTargets.end(), changedInstanceOldGuid) == changedInstanceGuidOperator.updatedTargets.end());
    assert(std::find(changedInstanceGuidOperator.deleted.begin(), changedInstanceGuidOperator.deleted.end(), changedInstanceOldGuid) != changedInstanceGuidOperator.deleted.end());
    assert(changedInstanceGuidRegistry.getInstanceByMemberElementGuid(changedInstanceNewGuid).has_value());
    assert(!changedInstanceGuidRegistry.getInstanceByMemberElementGuid(changedInstanceOldGuid).has_value());

    AssemblyRegistry cleanupRefusalRegistry;
    Assembly cleanupRefusalAssembly = slabAssembly;
    cleanupRefusalAssembly.assemblyUuid = "slab-edited-cleanup-refusal";
    cleanupRefusalAssembly.members = {{"slab-edited-cleanup-refusal", "SLAB-CLEANUP-REFUSAL-OLD", "Slab", "Top", "active", ""}};
    const bool cleanupRefusalAssemblyCreated = cleanupRefusalRegistry.createAssembly(cleanupRefusalAssembly);
    assert(cleanupRefusalAssemblyCreated);
    if (!cleanupRefusalAssemblyCreated) {
        return 1;
    }
    FakeSelectionReader cleanupRefusalSelection;
    FakePropertyWriter cleanupRefusalProperties;
    FakeExistenceChecker cleanupRefusalExistence;
    cleanupRefusalExistence.live = {"SLAB-CLEANUP-REFUSAL-OLD", "SLAB-CLEANUP-REFUSAL-NEW"};
    FakeInstanceElementOperator cleanupRefusalOperator;
    cleanupRefusalOperator.liveElements = &cleanupRefusalExistence.live;
    cleanupRefusalOperator.writtenProperties = &cleanupRefusalProperties.properties;
    cleanupRefusalOperator.snapshots["SLAB-CLEANUP-REFUSAL-OLD"] = makeSlabSnapshot("SLAB-CLEANUP-REFUSAL-OLD", 0.0, 10.0);
    SyncQueue cleanupRefusalQueue;
    int cleanupRefusalUuid = 0;
    AssemblyCommandService cleanupRefusalCommands(
        cleanupRefusalSelection,
        cleanupRefusalProperties,
        cleanupRefusalExistence,
        slabMetadata,
        slabHighlighter,
        slabStorage,
        listener,
        cleanupRefusalRegistry,
        naming,
        cleanupRefusalQueue,
        "local-project",
        [&]() { return "cleanup-refusal-runtime-uuid-" + std::to_string(++cleanupRefusalUuid); },
        &cleanupRefusalOperator);
    const CommandResult cleanupRefusalPlaced = cleanupRefusalCommands.placeWrapperInstance({"slab-edited-cleanup-refusal", "Cleanup Refusal Instance", {100.0, 0.0, 0.0, false}});
    assert(cleanupRefusalPlaced.ok);
    if (!cleanupRefusalPlaced.ok) {
        return 1;
    }
    const auto cleanupRefusalInstances = cleanupRefusalCommands.listWrapperInstances("slab-edited-cleanup-refusal");
    assert(cleanupRefusalInstances.size() == 1);
    if (cleanupRefusalInstances.size() != 1) {
        return 1;
    }
    const auto cleanupRefusalMembers = cleanupRefusalCommands.listWrapperInstanceMembers(cleanupRefusalInstances.front().instanceUuid);
    assert(cleanupRefusalMembers.size() == 1);
    if (cleanupRefusalMembers.size() != 1) {
        return 1;
    }
    cleanupRefusalExistence.live.insert(cleanupRefusalMembers.front().elementGuid);
    cleanupRefusalOperator.snapshots[cleanupRefusalMembers.front().elementGuid] = makeSlabSnapshot(cleanupRefusalMembers.front().elementGuid, 100.0, 10.0);
    cleanupRefusalSelection.selection = {{"SLAB-CLEANUP-REFUSAL-OLD", "Slab"}};
    const CommandResult cleanupRefusalEditMode = cleanupRefusalCommands.enterWrapperEditMode();
    assert(cleanupRefusalEditMode.ok);
    if (!cleanupRefusalEditMode.ok) {
        return 1;
    }
    cleanupRefusalSelection.selection = {{"SLAB-CLEANUP-REFUSAL-NEW", "Slab"}};
    cleanupRefusalOperator.snapshots["SLAB-CLEANUP-REFUSAL-NEW"] = makeSlabSnapshotWithHole("SLAB-CLEANUP-REFUSAL-NEW", 0.0, 20.0);
    cleanupRefusalOperator.failDeleteElements = true;
    const CommandResult cleanupRefusalApply = cleanupRefusalCommands.applyWrapperEdit();
    assert(!cleanupRefusalApply.ok);
    if (cleanupRefusalApply.ok) {
        return 1;
    }
    assert(cleanupRefusalApply.message.find("stale old GUID") != std::string::npos);

    AssemblyRegistry cleanupFailRegistry;
    Assembly cleanupFailAssembly = slabAssembly;
    cleanupFailAssembly.assemblyUuid = "slab-cleanup-fail";
    cleanupFailAssembly.members = {{"slab-cleanup-fail", "SLAB-CLEANUP-SOURCE", "Slab", "Top", "active", ""}};
    const bool cleanupFailAssemblyCreated = cleanupFailRegistry.createAssembly(cleanupFailAssembly);
    assert(cleanupFailAssemblyCreated);
    if (!cleanupFailAssemblyCreated) {
        return 1;
    }
    FakeSelectionReader cleanupFailSelection;
    FakePropertyWriter cleanupFailProperties;
    FakeExistenceChecker cleanupFailExistence;
    cleanupFailExistence.live = {"SLAB-CLEANUP-SOURCE"};
    FakeInstanceElementOperator cleanupFailOperator;
    cleanupFailOperator.liveElements = &cleanupFailExistence.live;
    cleanupFailOperator.writtenProperties = &cleanupFailProperties.properties;
    cleanupFailOperator.snapshots["SLAB-CLEANUP-SOURCE"] = makeSlabSnapshot("SLAB-CLEANUP-SOURCE", 0.0, 10.0);
    SyncQueue cleanupFailQueue;
    int cleanupFailUuid = 0;
    AssemblyCommandService cleanupFailCommands(
        cleanupFailSelection,
        cleanupFailProperties,
        cleanupFailExistence,
        slabMetadata,
        slabHighlighter,
        slabStorage,
        listener,
        cleanupFailRegistry,
        naming,
        cleanupFailQueue,
        "local-project",
        [&]() { return "cleanup-fail-runtime-uuid-" + std::to_string(++cleanupFailUuid); },
        &cleanupFailOperator);
    const CommandResult cleanupFailPlaced = cleanupFailCommands.placeWrapperInstance({"slab-cleanup-fail", "Cleanup Fail Instance", {100.0, 0.0, 0.0, false}});
    assert(cleanupFailPlaced.ok);
    if (!cleanupFailPlaced.ok) {
        return 1;
    }
    const auto cleanupFailInstances = cleanupFailCommands.listWrapperInstances("slab-cleanup-fail");
    assert(cleanupFailInstances.size() == 1);
    if (cleanupFailInstances.size() != 1) {
        return 1;
    }
    const auto cleanupFailMembers = cleanupFailCommands.listWrapperInstanceMembers(cleanupFailInstances.front().instanceUuid);
    assert(cleanupFailMembers.size() == 1);
    if (cleanupFailMembers.size() != 1) {
        return 1;
    }
    cleanupFailExistence.live.insert(cleanupFailMembers.front().elementGuid);
    cleanupFailOperator.snapshots[cleanupFailMembers.front().elementGuid] = makeSlabSnapshot(cleanupFailMembers.front().elementGuid, 100.0, 10.0);
    cleanupFailSelection.selection = {{"SLAB-CLEANUP-SOURCE", "Slab"}};
    const CommandResult cleanupFailEditMode = cleanupFailCommands.enterWrapperEditMode();
    assert(cleanupFailEditMode.ok);
    if (!cleanupFailEditMode.ok) {
        return 1;
    }
    cleanupFailOperator.snapshots["SLAB-CLEANUP-SOURCE"] = makeSlabSnapshotWithHole("SLAB-CLEANUP-SOURCE", 0.0, 20.0);
    cleanupFailOperator.replaceSlabsOnUpdate = true;
    cleanupFailOperator.failSlabReplacementCleanup = true;
    const CommandResult cleanupFailApply = cleanupFailCommands.applyWrapperEdit();
    assert(!cleanupFailApply.ok);
    if (cleanupFailApply.ok) {
        return 1;
    }
    assert(std::find(cleanupFailOperator.updatedTargets.begin(), cleanupFailOperator.updatedTargets.end(), "SLAB-CLEANUP-SOURCE") == cleanupFailOperator.updatedTargets.end());
    assert(cleanupFailApply.message.find("overlapping stale original") != std::string::npos);
    assert(!cleanupFailRegistry.getInstanceByMemberElementGuid(cleanupFailMembers.front().elementGuid + "-REPLACED").has_value());

    AssemblyRegistry rebindFailRegistry;
    Assembly rebindFailAssembly = slabAssembly;
    rebindFailAssembly.assemblyUuid = "slab-rebind-fail";
    rebindFailAssembly.members = {{"slab-rebind-fail", "SLAB-REBIND-SOURCE", "Slab", "Top", "active", ""}};
    const bool rebindFailAssemblyCreated = rebindFailRegistry.createAssembly(rebindFailAssembly);
    assert(rebindFailAssemblyCreated);
    if (!rebindFailAssemblyCreated) {
        return 1;
    }
    FakeSelectionReader rebindFailSelection;
    FakePropertyWriter rebindFailProperties;
    FakeExistenceChecker rebindFailExistence;
    rebindFailExistence.live = {"SLAB-REBIND-SOURCE"};
    FakeInstanceElementOperator rebindFailOperator;
    rebindFailOperator.liveElements = &rebindFailExistence.live;
    rebindFailOperator.writtenProperties = &rebindFailProperties.properties;
    rebindFailOperator.snapshots["SLAB-REBIND-SOURCE"] = makeSlabSnapshot("SLAB-REBIND-SOURCE", 0.0, 10.0);
    SyncQueue rebindFailQueue;
    int rebindFailUuid = 0;
    AssemblyCommandService rebindFailCommands(
        rebindFailSelection,
        rebindFailProperties,
        rebindFailExistence,
        slabMetadata,
        slabHighlighter,
        slabStorage,
        listener,
        rebindFailRegistry,
        naming,
        rebindFailQueue,
        "local-project",
        [&]() { return "rebind-fail-runtime-uuid-" + std::to_string(++rebindFailUuid); },
        &rebindFailOperator);
    assert(rebindFailCommands.placeWrapperInstance({"slab-rebind-fail", "Rebind Fail Instance A", {100.0, 0.0, 0.0, false}}).ok);
    assert(rebindFailCommands.placeWrapperInstance({"slab-rebind-fail", "Rebind Fail Instance B", {200.0, 0.0, 0.0, false}}).ok);
    const auto rebindFailInstances = rebindFailCommands.listWrapperInstances("slab-rebind-fail");
    assert(rebindFailInstances.size() == 2);
    if (rebindFailInstances.size() != 2) {
        return 1;
    }
    for (std::size_t index = 0; index < rebindFailInstances.size(); ++index) {
        const auto members = rebindFailCommands.listWrapperInstanceMembers(rebindFailInstances[index].instanceUuid);
        assert(members.size() == 1);
        if (members.size() != 1) {
            return 1;
        }
        const double offset = index == 0 ? 100.0 : 200.0;
        rebindFailExistence.live.insert(members.front().elementGuid);
        rebindFailOperator.snapshots[members.front().elementGuid] = makeSlabSnapshot(members.front().elementGuid, offset, 10.0);
    }
    rebindFailSelection.selection = {{"SLAB-REBIND-SOURCE", "Slab"}};
    const CommandResult rebindFailEditMode = rebindFailCommands.enterWrapperEditMode();
    assert(rebindFailEditMode.ok);
    if (!rebindFailEditMode.ok) {
        return 1;
    }
    rebindFailOperator.snapshots["SLAB-REBIND-SOURCE"] = makeSlabSnapshotWithHole("SLAB-REBIND-SOURCE", 0.0, 20.0);
    rebindFailOperator.replaceSlabsOnUpdate = true;
    rebindFailOperator.forcedReplacementGuid = "SLAB-SHARED-REPLACEMENT";
    const CommandResult rebindFailApply = rebindFailCommands.applyWrapperEdit();
    assert(!rebindFailApply.ok);
    if (rebindFailApply.ok) {
        return 1;
    }
    assert(rebindFailApply.message.find("registry rebinding failed") != std::string::npos);
    assert(std::find(rebindFailOperator.updatedTargets.begin(), rebindFailOperator.updatedTargets.end(), "SLAB-REBIND-SOURCE") == rebindFailOperator.updatedTargets.end());

    AssemblyRegistry sourceRebindRegistry;
    Assembly sourceRebindAssembly = slabAssembly;
    sourceRebindAssembly.assemblyUuid = "slab-source-rebind";
    sourceRebindAssembly.members = {{"slab-source-rebind", "SLAB-SOURCE-REBIND", "Slab", "Top", "active", ""}};
    const bool sourceRebindAssemblyCreated = sourceRebindRegistry.createAssembly(sourceRebindAssembly);
    assert(sourceRebindAssemblyCreated);
    if (!sourceRebindAssemblyCreated) {
        return 1;
    }
    FakeSelectionReader sourceRebindSelection;
    FakePropertyWriter sourceRebindProperties;
    FakeExistenceChecker sourceRebindExistence;
    sourceRebindExistence.live = {"SLAB-SOURCE-REBIND"};
    FakeInstanceElementOperator sourceRebindOperator;
    sourceRebindOperator.liveElements = &sourceRebindExistence.live;
    sourceRebindOperator.writtenProperties = &sourceRebindProperties.properties;
    sourceRebindOperator.snapshots["SLAB-SOURCE-REBIND"] = makeSlabSnapshot("SLAB-SOURCE-REBIND", 0.0, 10.0);
    SyncQueue sourceRebindQueue;
    int sourceRebindUuid = 0;
    AssemblyCommandService sourceRebindCommands(
        sourceRebindSelection,
        sourceRebindProperties,
        sourceRebindExistence,
        slabMetadata,
        slabHighlighter,
        slabStorage,
        listener,
        sourceRebindRegistry,
        naming,
        sourceRebindQueue,
        "local-project",
        [&]() { return "source-rebind-runtime-uuid-" + std::to_string(++sourceRebindUuid); },
        &sourceRebindOperator);
    const CommandResult sourceRebindPlaced = sourceRebindCommands.placeWrapperInstance({"slab-source-rebind", "Edit Instance", {100.0, 0.0, 0.0, false}});
    assert(sourceRebindPlaced.ok);
    if (!sourceRebindPlaced.ok) {
        return 1;
    }
    const auto sourceRebindInstances = sourceRebindCommands.listWrapperInstances("slab-source-rebind");
    if (sourceRebindInstances.size() != 1) {
        return 1;
    }
    const auto sourceRebindMembers = sourceRebindCommands.listWrapperInstanceMembers(sourceRebindInstances.front().instanceUuid);
    if (sourceRebindMembers.size() != 1) {
        return 1;
    }
    sourceRebindExistence.live.insert(sourceRebindMembers.front().elementGuid);
    sourceRebindOperator.snapshots[sourceRebindMembers.front().elementGuid] = makeSlabSnapshot(sourceRebindMembers.front().elementGuid, 150.0, 10.0);
    sourceRebindSelection.selection = {{sourceRebindMembers.front().elementGuid, "Slab"}};
    const CommandResult sourceRebindEditMode = sourceRebindCommands.enterWrapperEditMode();
    assert(sourceRebindEditMode.ok);
    if (!sourceRebindEditMode.ok) {
        return 1;
    }
    sourceRebindOperator.snapshots[sourceRebindMembers.front().elementGuid] = makeSlabSnapshotWithHole(sourceRebindMembers.front().elementGuid, 150.0, 20.0);
    sourceRebindOperator.replaceSlabsOnUpdate = true;
    const CommandResult sourceRebindApply = sourceRebindCommands.applyWrapperEdit();
    assert(sourceRebindApply.ok);
    if (!sourceRebindApply.ok) {
        return 1;
    }
    assert(std::find(
        sourceRebindOperator.updatedTargets.begin(),
        sourceRebindOperator.updatedTargets.end(),
        sourceRebindMembers.front().elementGuid) == sourceRebindOperator.updatedTargets.end());
    assert(std::find(
        sourceRebindOperator.updatedTargets.begin(),
        sourceRebindOperator.updatedTargets.end(),
        "SLAB-SOURCE-REBIND") != sourceRebindOperator.updatedTargets.end());
    assert(sourceRebindRegistry.getAssemblyByElementGuid("SLAB-SOURCE-REBIND-REPLACED").has_value());
    assert(sourceRebindOperator.targetBaselinesByElementGuid.at("SLAB-SOURCE-REBIND").coordinateOriginX == 5.0);
    assert(sourceRebindOperator.snapshots.at("SLAB-SOURCE-REBIND-REPLACED").boundsCenterX == 5.0);
    const auto movedEditedInstanceAfterApply = sourceRebindRegistry.getInstanceByMemberElementGuid(sourceRebindMembers.front().elementGuid);
    assert(movedEditedInstanceAfterApply);
    assert(movedEditedInstanceAfterApply->liveFrame.valid);
    assert(movedEditedInstanceAfterApply->liveFrame.originX == 160.0);

    AssemblyRegistry corruptedRegistry;
    Assembly corruptedAssembly = slabAssembly;
    corruptedAssembly.assemblyUuid = "slab-corrupted";
    corruptedAssembly.members = {{"slab-corrupted", "SLAB-CORRUPTED-SOURCE", "Slab", "Top", "active", ""}};
    const bool corruptedAssemblyCreated = corruptedRegistry.createAssembly(corruptedAssembly);
    assert(corruptedAssemblyCreated);
    if (!corruptedAssemblyCreated) {
        return 1;
    }
    FakeSelectionReader corruptedSelection;
    FakePropertyWriter corruptedProperties;
    FakeExistenceChecker corruptedExistence;
    corruptedExistence.live = {"SLAB-CORRUPTED-SOURCE"};
    FakeInstanceElementOperator corruptedOperator;
    corruptedOperator.liveElements = &corruptedExistence.live;
    corruptedOperator.writtenProperties = &corruptedProperties.properties;
    corruptedOperator.snapshots["SLAB-CORRUPTED-SOURCE"] = makeSlabSnapshot("SLAB-CORRUPTED-SOURCE", 0.0, 10.0);
    SyncQueue corruptedQueue;
    int corruptedUuid = 0;
    AssemblyCommandService corruptedCommands(
        corruptedSelection,
        corruptedProperties,
        corruptedExistence,
        slabMetadata,
        slabHighlighter,
        slabStorage,
        listener,
        corruptedRegistry,
        naming,
        corruptedQueue,
        "local-project",
        [&]() { return "corrupted-runtime-uuid-" + std::to_string(++corruptedUuid); },
        &corruptedOperator);
    const CommandResult corruptedPlaced = corruptedCommands.placeWrapperInstance({"slab-corrupted", "Corrupted Instance", {100.0, 0.0, 0.0, false}});
    assert(corruptedPlaced.ok);
    if (!corruptedPlaced.ok) {
        return 1;
    }
    const auto corruptedInstances = corruptedCommands.listWrapperInstances("slab-corrupted");
    if (corruptedInstances.size() != 1) {
        return 1;
    }
    const auto corruptedMembers = corruptedCommands.listWrapperInstanceMembers(corruptedInstances.front().instanceUuid);
    if (corruptedMembers.size() != 1) {
        return 1;
    }
    corruptedOperator.snapshots["SLAB-CORRUPTED-SOURCE"] = makeSlabSnapshot("SLAB-CORRUPTED-SOURCE", 100.0, 10.0);
    corruptedExistence.live.insert(corruptedMembers.front().elementGuid);
    corruptedOperator.snapshots[corruptedMembers.front().elementGuid] = makeSlabSnapshot(corruptedMembers.front().elementGuid, 100.0, 10.0);
    corruptedSelection.selection = {{"SLAB-CORRUPTED-SOURCE", "Slab"}};
    const CommandResult corruptedEditMode = corruptedCommands.enterWrapperEditMode();
    assert(!corruptedEditMode.ok);
    if (corruptedEditMode.ok) {
        return 1;
    }
    assert(corruptedEditMode.message.find("placement appears corrupted") != std::string::npos);
    const std::string corruptedTracePath = geometryTracePathFromMessage(corruptedEditMode.message);
    assert(!corruptedTracePath.empty());
    assert(std::filesystem::exists(corruptedTracePath));
    const std::string corruptedTrace = readTextFile(corruptedTracePath);
    assert(corruptedTrace.find("WARNING target-frame-matches-source-frame") != std::string::npos);

    assert(!runtime.handleMenuCommand(999).ok);

    std::filesystem::remove(registryPath);
    std::filesystem::remove(std::filesystem::temp_directory_path() / "buildsync-native-runtime-slab-test.registry");
    return 0;
}
