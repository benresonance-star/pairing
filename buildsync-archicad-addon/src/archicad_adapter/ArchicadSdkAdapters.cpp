#include "archicad_adapter/ArchicadSdkAdapters.hpp"

#include "APIEnvir.h"
#include "ACAPinc.h"
#include "APIdefs_Properties.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <sstream>
#include <utility>

namespace buildsync {
namespace {

std::string errorCodeString(GSErrCode error)
{
    std::ostringstream out;
    out << error;
    return out.str();
}

std::string apiGuidToStdString(const API_Guid& guid)
{
    return APIGuidToString(guid).ToCStr().Get();
}

API_Guid apiGuidFromStdString(const std::string& guid)
{
    return APIGuidFromString(guid.c_str());
}

std::string elementTypeName(API_ElemTypeID typeId)
{
    switch (typeId) {
        case API_WallID:
            return "Wall";
        case API_SlabID:
            return "Slab";
        case API_RoofID:
            return "Roof";
        case API_WindowID:
            return "Window";
        case API_DoorID:
            return "Door";
        case API_ColumnID:
            return "Column";
        case API_BeamID:
            return "Beam";
        case API_ObjectID:
            return "Object";
        case API_MorphID:
            return "Morph";
        case API_MeshID:
            return "Mesh";
        case API_ZoneID:
            return "Zone";
        default:
            return "Unknown";
    }
}

std::string selectedElementTypeName(const API_Guid& guid)
{
    API_Elem_Head header = {};
    header.guid = guid;
    if (ACAPI_Element_GetHeader(&header) != NoError) {
        return "Unknown";
    }
    return elementTypeName(header.type.typeID);
}

bool elementHeaderToNeig(const API_Elem_Head& header, API_Neig& neig)
{
    neig = {};
    neig.guid = header.guid;
    switch (header.type.typeID) {
        case API_WallID:
            neig.neigID = APINeig_Wall;
            neig.inIndex = 1;
            return true;
        case API_SlabID:
            neig.neigID = APINeig_Ceil;
            neig.inIndex = 1;
            return true;
        case API_RoofID:
            neig.neigID = APINeig_Roof;
            neig.inIndex = 1;
            return true;
        case API_WindowID:
            neig.neigID = APINeig_WindHole;
            neig.inIndex = 0;
            return true;
        case API_DoorID:
            neig.neigID = APINeig_DoorHole;
            neig.inIndex = 0;
            return true;
        case API_ColumnID:
            neig.neigID = APINeig_Colu;
            neig.inIndex = 0;
            return true;
        case API_BeamID:
            neig.neigID = APINeig_Beam;
            neig.inIndex = 1;
            return true;
        case API_ObjectID:
            neig.neigID = APINeig_Symb;
            neig.inIndex = 1;
            return true;
        case API_MorphID:
            neig.neigID = APINeig_Morph;
            neig.inIndex = 1;
            return true;
        case API_MeshID:
            neig.neigID = APINeig_Mesh;
            neig.inIndex = 1;
            return true;
        case API_ZoneID:
            neig.neigID = APINeig_Room;
            neig.inIndex = 1;
            return true;
        default:
            return false;
    }
}

GS::Array<API_Guid> apiGuidArrayFromStrings(const std::vector<std::string>& elementGuids)
{
    GS::Array<API_Guid> guids;
    for (const auto& elementGuid : elementGuids) {
        guids.Push(apiGuidFromStdString(elementGuid));
    }
    return guids;
}

GS::Array<API_Neig> neigsFromGuids(const std::vector<std::string>& elementGuids)
{
    GS::Array<API_Neig> neigs;
    for (const auto& elementGuid : elementGuids) {
        API_Elem_Head header = {};
        header.guid = apiGuidFromStdString(elementGuid);
        if (ACAPI_Element_GetHeader(&header) != NoError) {
            continue;
        }
        API_Neig neig = {};
        if (elementHeaderToNeig(header, neig)) {
            neigs.Push(neig);
        }
    }
    return neigs;
}

bool editElements(const std::vector<std::string>& elementGuids, const API_EditPars& pars, std::string& diagnostic)
{
    GS::Array<API_Neig> neigs = neigsFromGuids(elementGuids);
    if (neigs.IsEmpty()) {
        diagnostic = "No editable Archicad neighbours could be built for instance members.";
        return false;
    }
    GSErrCode error = ACAPI_Element_Edit(&neigs, pars);
    if (error != NoError) {
        diagnostic = "Archicad element edit failed. error=" + errorCodeString(error);
        return false;
    }
    return true;
}

bool elementBoundsCenter(const API_Elem_Head& header, double& centerX, double& centerY, double& centerZ)
{
    API_Elem_Head boundsHeader = header;
    API_Box3D bounds = {};
    if (ACAPI_Element_CalcBounds(&boundsHeader, &bounds) != NoError) {
        return false;
    }
    centerX = (bounds.xMin + bounds.xMax) / 2.0;
    centerY = (bounds.yMin + bounds.yMax) / 2.0;
    centerZ = (bounds.zMin + bounds.zMax) / 2.0;
    return true;
}

bool elementBoundsCenter(const std::string& elementGuid, double& centerX, double& centerY, double& centerZ)
{
    API_Elem_Head header = {};
    header.guid = apiGuidFromStdString(elementGuid);
    if (ACAPI_Element_GetHeader(&header) != NoError) {
        return false;
    }
    return elementBoundsCenter(header, centerX, centerY, centerZ);
}

bool deleteElementByGuid(const std::string& elementGuid, std::string& diagnostic)
{
    GS::Array<API_Guid> guids;
    guids.Push(apiGuidFromStdString(elementGuid));
    const GSErrCode error = ACAPI_Element_Delete(guids);
    if (error != NoError) {
        diagnostic = "ACAPI_Element_Delete failed for " + elementGuid + ". error=" + errorCodeString(error);
        return false;
    }
    API_Elem_Head header = {};
    header.guid = apiGuidFromStdString(elementGuid);
    if (ACAPI_Element_GetHeader(&header) == NoError) {
        diagnostic = "ACAPI_Element_Delete returned success but stale element still exists: " + elementGuid;
        return false;
    }
    return true;
}

bool cleanupValidatedStaleOriginalSlab(
    const std::string& originalTargetGuid,
    double targetBoundsBeforeX,
    double targetBoundsBeforeY,
    bool targetBoundsBeforeValid,
    std::string& diagnostic)
{
    API_Elem_Head originalHeader = {};
    originalHeader.guid = apiGuidFromStdString(originalTargetGuid);
    const GSErrCode headerError = ACAPI_Element_GetHeader(&originalHeader);
    if (headerError != NoError) {
        diagnostic = "original slab no longer exists after replacement.";
        return true;
    }
    if (originalHeader.type.typeID != API_SlabID) {
        diagnostic = "cleanup refused because original target still exists but is not a slab: " + originalTargetGuid;
        return false;
    }
    if (targetBoundsBeforeValid) {
        double currentX = 0.0;
        double currentY = 0.0;
        double currentZ = 0.0;
        if (!elementBoundsCenter(originalHeader, currentX, currentY, currentZ)) {
            diagnostic = "cleanup refused because stale original slab bounds could not be read: " + originalTargetGuid;
            return false;
        }
        const double dx = currentX - targetBoundsBeforeX;
        const double dy = currentY - targetBoundsBeforeY;
        if ((dx * dx + dy * dy) > 1.0e-6) {
            diagnostic = "cleanup refused because original slab no longer matches pre-change bounds. original=" +
                originalTargetGuid + " before=(" + std::to_string(targetBoundsBeforeX) + "," + std::to_string(targetBoundsBeforeY) +
                ") current=(" + std::to_string(currentX) + "," + std::to_string(currentY) + ")";
            return false;
        }
    }
    std::string deleteDiagnostic;
    if (!deleteElementByGuid(originalTargetGuid, deleteDiagnostic)) {
        diagnostic = "cleanup failed: " + deleteDiagnostic;
        return false;
    }
    diagnostic = "replacement cleaned: stale original slab deleted " + originalTargetGuid;
    return true;
}

bool dragElementByDelta(const std::string& elementGuid, double deltaX, double deltaY, std::string& diagnostic)
{
    if (std::abs(deltaX) < 1.0e-6 && std::abs(deltaY) < 1.0e-6) {
        return true;
    }
    API_EditPars drag = {};
    drag.typeID = APIEdit_Drag;
    drag.withDelete = false;
    drag.begC = {0.0, 0.0, 0.0};
    drag.endC = {deltaX, deltaY, 0.0};
    return editElements({elementGuid}, drag, diagnostic);
}

std::string pointString(double x, double y)
{
    std::ostringstream out;
    out << "(" << x << "," << y << ")";
    return out.str();
}

bool applyPlanPlacement(const std::vector<std::string>& elementGuids, const PlanPlacement& placement, std::string& diagnostic)
{
    if (placement.mirrored) {
        API_EditPars mirror = {};
        mirror.typeID = APIEdit_Mirror;
        mirror.withDelete = false;
        mirror.origC = {placement.originX, placement.originY};
        mirror.begC = {placement.originX, placement.originY, 0.0};
        mirror.endC = {placement.originX + std::cos(placement.rotationDegrees * 3.14159265358979323846 / 180.0),
                       placement.originY + std::sin(placement.rotationDegrees * 3.14159265358979323846 / 180.0),
                       0.0};
        mirror.endC2 = {placement.originX, placement.originY + 1.0, 0.0};
        if (!editElements(elementGuids, mirror, diagnostic)) {
            return false;
        }
    }
    if (placement.rotationDegrees != 0.0) {
        const double radians = placement.rotationDegrees * 3.14159265358979323846 / 180.0;
        API_EditPars rotate = {};
        rotate.typeID = APIEdit_Rotate;
        rotate.withDelete = false;
        rotate.origC = {placement.originX, placement.originY};
        rotate.begC = {placement.originX + 1.0, placement.originY, 0.0};
        rotate.endC = {placement.originX + std::cos(radians), placement.originY + std::sin(radians), 0.0};
        if (!editElements(elementGuids, rotate, diagnostic)) {
            return false;
        }
    }
    if (placement.originX != 0.0 || placement.originY != 0.0) {
        API_EditPars drag = {};
        drag.typeID = APIEdit_Drag;
        drag.withDelete = false;
        drag.begC = {0.0, 0.0, 0.0};
        drag.endC = {placement.originX, placement.originY, 0.0};
        if (!editElements(elementGuids, drag, diagnostic)) {
            return false;
        }
    }
    return true;
}

bool memoCoordCentroid(const API_ElementMemo& memo, API_Coord& centroid)
{
    centroid = {};
    if (memo.coords == nullptr || *memo.coords == nullptr) {
        return false;
    }
    const auto coordCount = BMGetHandleSize(reinterpret_cast<GSHandle>(memo.coords)) / sizeof(API_Coord);
    if (coordCount <= 1) {
        return false;
    }
    double sumX = 0.0;
    double sumY = 0.0;
    std::size_t used = 0;
    for (std::size_t index = 1; index < coordCount; ++index) {
        sumX += (*memo.coords)[index].x;
        sumY += (*memo.coords)[index].y;
        ++used;
    }
    if (used == 0) {
        return false;
    }
    centroid.x = sumX / static_cast<double>(used);
    centroid.y = sumY / static_cast<double>(used);
    return true;
}

bool memoAnchorCoord(const API_ElementMemo& memo, API_Coord& anchor)
{
    anchor = {};
    if (memo.coords == nullptr || *memo.coords == nullptr) {
        return false;
    }
    const auto coordCount = BMGetHandleSize(reinterpret_cast<GSHandle>(memo.coords)) / sizeof(API_Coord);
    if (coordCount <= 1) {
        return false;
    }
    anchor = (*memo.coords)[1];
    return true;
}

UInt64 polygonChangeMemoMask(const API_Elem_Head& header)
{
    API_Neig neig = {};
    if (!elementHeaderToNeig(header, neig)) {
        return APIMemoMask_Polygon;
    }
    switch (neig.neigID) {
        case APINeig_Ceil:
        case APINeig_CeilOn:
            return APIMemoMask_Polygon | APIMemoMask_EdgeTrims | APIMemoMask_SideMaterials;
        case APINeig_Roof:
        case APINeig_RoofOn:
            return APIMemoMask_Polygon | APIMemoMask_EdgeTrims | APIMemoMask_SideMaterials | APIMemoMask_RoofEdgeTypes;
        default:
            return APIMemoMask_Polygon;
    }
}

API_ElementMemo polygonChangeMemo(API_ElementMemo& memo)
{
    API_ElementMemo tmpMemo = {};
    tmpMemo.coords = memo.coords;
    tmpMemo.pends = memo.pends;
    tmpMemo.parcs = memo.parcs;
    tmpMemo.vertexIDs = memo.vertexIDs;
    tmpMemo.edgeIDs = memo.edgeIDs;
    tmpMemo.edgeTrims = memo.edgeTrims;
    tmpMemo.contourIDs = memo.contourIDs;
    tmpMemo.meshPolyZ = memo.meshPolyZ;
    tmpMemo.sideMaterials = memo.sideMaterials;
    tmpMemo.roofEdgeTypes = memo.roofEdgeTypes;
    return tmpMemo;
}

Int32 memoCoordCount(const API_ElementMemo& memo)
{
    if (memo.coords == nullptr) {
        return 0;
    }
    return static_cast<Int32>(BMhGetSize(reinterpret_cast<GSHandle>(memo.coords)) / Sizeof32(API_Coord)) - 1;
}

Int32 memoSubPolyCount(const API_ElementMemo& memo)
{
    if (memo.pends == nullptr) {
        return 0;
    }
    return static_cast<Int32>(BMhGetSize(reinterpret_cast<GSHandle>(memo.pends)) / Sizeof32(Int32)) - 1;
}

Int32 memoArcCount(const API_ElementMemo& memo)
{
    if (memo.parcs == nullptr) {
        return 0;
    }
    return static_cast<Int32>(BMhGetSize(reinterpret_cast<GSHandle>(memo.parcs)) / Sizeof32(API_PolyArc));
}

GSErrCode changeSlabPolygonWithReplacement(API_Element& targetElement, API_ElementMemo& polygonMemo)
{
    targetElement.slab.poly.nCoords = memoCoordCount(polygonMemo);
    targetElement.slab.poly.nSubPolys = memoSubPolyCount(polygonMemo);
    targetElement.slab.poly.nArcs = memoArcCount(polygonMemo);

    API_Element mask = {};
    ACAPI_ELEMENT_MASK_CLEAR(mask);
    ACAPI_ELEMENT_MASK_SET(mask, API_SlabType, poly);

    API_ElementMemo tmpMemo = polygonChangeMemo(polygonMemo);
    return ACAPI_Element_Change(
        &targetElement,
        &mask,
        &tmpMemo,
        APIMemoMask_Polygon | APIMemoMask_SideMaterials | APIMemoMask_EdgeTrims,
        true);
}

GSErrCode changeSlabPolygonInPlace(const API_Elem_Head& targetHeader, API_ElementMemo& polygonMemo)
{
    API_ElementMemo tmpMemo = polygonChangeMemo(polygonMemo);
    API_Guid targetGuid = targetHeader.guid;
    return ACAPI_Element_ChangeMemo(
        targetGuid,
        APIMemoMask_Polygon | APIMemoMask_SideMaterials | APIMemoMask_EdgeTrims,
        &tmpMemo);
}

void translateMemoCoords(API_ElementMemo& memo, double deltaX, double deltaY)
{
    if (memo.coords == nullptr || *memo.coords == nullptr) {
        return;
    }
    const auto coordCount = BMGetHandleSize(reinterpret_cast<GSHandle>(memo.coords)) / sizeof(API_Coord);
    for (std::size_t index = 1; index < coordCount; ++index) {
        (*memo.coords)[index].x += deltaX;
        (*memo.coords)[index].y += deltaY;
    }
}

double radiansToDegrees(double radians)
{
    return radians * 180.0 / 3.14159265358979323846;
}

double degreesToRadians(double degrees)
{
    return degrees * 3.14159265358979323846 / 180.0;
}

double effectiveFrameOriginX(const ElementSnapshot& snapshot)
{
    return snapshot.coordinateFrameValid ? snapshot.coordinateOriginX : snapshot.frameOriginX;
}

double effectiveFrameOriginY(const ElementSnapshot& snapshot)
{
    return snapshot.coordinateFrameValid ? snapshot.coordinateOriginY : snapshot.frameOriginY;
}

double effectiveFrameRotationDegrees(const ElementSnapshot& snapshot)
{
    return snapshot.coordinateFrameValid ? snapshot.coordinateRotationDegrees : snapshot.frameRotationDegrees;
}

bool effectiveFrameValid(const ElementSnapshot& snapshot)
{
    return snapshot.coordinateFrameValid || snapshot.frameValid;
}

std::string frameString(const ElementSnapshot& snapshot)
{
    std::ostringstream out;
    out << "frame=(" << effectiveFrameOriginX(snapshot) << "," << effectiveFrameOriginY(snapshot)
        << "," << effectiveFrameRotationDegrees(snapshot) << ") valid=" << (effectiveFrameValid(snapshot) ? "true" : "false");
    return out.str();
}

std::string coordSampleString(const std::vector<double>& coords, std::size_t maxPoints = 5)
{
    std::ostringstream out;
    out << "[";
    const std::size_t pointCount = coords.size() / 2;
    for (std::size_t index = 0; index < pointCount && index < maxPoints; ++index) {
        if (index > 0) {
            out << ",";
        }
        out << "(" << coords[index * 2] << "," << coords[index * 2 + 1] << ")";
    }
    if (pointCount > maxPoints) {
        out << ",...";
    }
    out << "]";
    return out.str();
}

API_Coord transformCoordBetweenFrames(const API_Coord& coord, const ElementSnapshot& fromFrame, const ElementSnapshot& toFrame)
{
    if (!effectiveFrameValid(fromFrame) || !effectiveFrameValid(toFrame)) {
        return coord;
    }
    const double fromRadians = degreesToRadians(effectiveFrameRotationDegrees(fromFrame));
    const double toRadians = degreesToRadians(effectiveFrameRotationDegrees(toFrame));
    const double dx = coord.x - effectiveFrameOriginX(fromFrame);
    const double dy = coord.y - effectiveFrameOriginY(fromFrame);
    const double localX = std::cos(fromRadians) * dx + std::sin(fromRadians) * dy;
    const double localY = -std::sin(fromRadians) * dx + std::cos(fromRadians) * dy;
    return {
        effectiveFrameOriginX(toFrame) + std::cos(toRadians) * localX - std::sin(toRadians) * localY,
        effectiveFrameOriginY(toFrame) + std::sin(toRadians) * localX + std::cos(toRadians) * localY,
    };
}

API_Coord worldToLocalCoord(double x, double y, double originX, double originY, double rotationDegrees)
{
    const double radians = degreesToRadians(rotationDegrees);
    const double dx = x - originX;
    const double dy = y - originY;
    return {
        std::cos(radians) * dx + std::sin(radians) * dy,
        -std::sin(radians) * dx + std::cos(radians) * dy,
    };
}

API_Coord localToWorldCoord(double x, double y, double originX, double originY, double rotationDegrees)
{
    const double radians = degreesToRadians(rotationDegrees);
    return {
        originX + std::cos(radians) * x - std::sin(radians) * y,
        originY + std::sin(radians) * x + std::cos(radians) * y,
    };
}

void transformMemoCoords(API_ElementMemo& memo, const ElementSnapshot& fromFrame, const ElementSnapshot& toFrame)
{
    if (!effectiveFrameValid(fromFrame) || !effectiveFrameValid(toFrame) || memo.coords == nullptr || *memo.coords == nullptr) {
        return;
    }
    const auto coordCount = BMGetHandleSize(reinterpret_cast<GSHandle>(memo.coords)) / sizeof(API_Coord);
    for (std::size_t index = 1; index < coordCount; ++index) {
        (*memo.coords)[index] = transformCoordBetweenFrames((*memo.coords)[index], fromFrame, toFrame);
    }
}

std::vector<double> memoPolygonCoords(const API_ElementMemo& memo)
{
    std::vector<double> coords;
    if (memo.coords == nullptr || *memo.coords == nullptr) {
        return coords;
    }
    const auto coordCount = BMGetHandleSize(reinterpret_cast<GSHandle>(memo.coords)) / sizeof(API_Coord);
    coords.reserve(coordCount * 2);
    for (std::size_t index = 0; index < coordCount; ++index) {
        coords.push_back((*memo.coords)[index].x);
        coords.push_back((*memo.coords)[index].y);
    }
    return coords;
}

bool applyPolygonVertexDeltas(
    API_ElementMemo& memo,
    const ElementSnapshot& editedSnapshot,
    const ElementSnapshot& editedBaseline,
    const ElementSnapshot& targetBaseline)
{
    if (memo.coords == nullptr || *memo.coords == nullptr ||
        editedSnapshot.polygonCoords.empty() ||
        editedBaseline.polygonCoords.empty() ||
        targetBaseline.polygonCoords.empty() ||
        editedSnapshot.polygonCoords.size() != editedBaseline.polygonCoords.size() ||
        editedSnapshot.polygonCoords.size() != targetBaseline.polygonCoords.size()) {
        return false;
    }

    const auto coordCount = BMGetHandleSize(reinterpret_cast<GSHandle>(memo.coords)) / sizeof(API_Coord);
    if (editedSnapshot.polygonCoords.size() != coordCount * 2) {
        return false;
    }

    if (!effectiveFrameValid(editedBaseline) || !effectiveFrameValid(targetBaseline)) {
        return false;
    }
    const double rotationDelta = degreesToRadians(
        effectiveFrameRotationDegrees(targetBaseline) - effectiveFrameRotationDegrees(editedBaseline));
    const double cosDelta = std::cos(rotationDelta);
    const double sinDelta = std::sin(rotationDelta);
    for (std::size_t index = 1; index < coordCount; ++index) {
        const std::size_t offset = index * 2;
        const double deltaX = editedSnapshot.polygonCoords[offset] - editedBaseline.polygonCoords[offset];
        const double deltaY = editedSnapshot.polygonCoords[offset + 1] - editedBaseline.polygonCoords[offset + 1];
        (*memo.coords)[index].x = targetBaseline.polygonCoords[offset] + cosDelta * deltaX - sinDelta * deltaY;
        (*memo.coords)[index].y = targetBaseline.polygonCoords[offset + 1] + sinDelta * deltaX + cosDelta * deltaY;
    }
    return true;
}

bool transformMemoCoordsThroughPolygonFrames(
    API_ElementMemo& memo,
    const ElementSnapshot& editedBaseline,
    const ElementSnapshot& targetBaseline)
{
    if ((!editedBaseline.coordinateFrameValid && !editedBaseline.polygonFrameValid) ||
        (!targetBaseline.coordinateFrameValid && !targetBaseline.polygonFrameValid) ||
        memo.coords == nullptr || *memo.coords == nullptr) {
        return false;
    }

    const auto coordCount = BMGetHandleSize(reinterpret_cast<GSHandle>(memo.coords)) / sizeof(API_Coord);
    for (std::size_t index = 1; index < coordCount; ++index) {
        const API_Coord local = worldToLocalCoord(
            (*memo.coords)[index].x,
            (*memo.coords)[index].y,
            editedBaseline.coordinateFrameValid ? editedBaseline.coordinateOriginX : editedBaseline.polygonFrameOriginX,
            editedBaseline.coordinateFrameValid ? editedBaseline.coordinateOriginY : editedBaseline.polygonFrameOriginY,
            editedBaseline.coordinateFrameValid ? editedBaseline.coordinateRotationDegrees : editedBaseline.polygonFrameRotationDegrees);
        (*memo.coords)[index] = localToWorldCoord(
            local.x,
            local.y,
            targetBaseline.coordinateFrameValid ? targetBaseline.coordinateOriginX : targetBaseline.polygonFrameOriginX,
            targetBaseline.coordinateFrameValid ? targetBaseline.coordinateOriginY : targetBaseline.polygonFrameOriginY,
            targetBaseline.coordinateFrameValid ? targetBaseline.coordinateRotationDegrees : targetBaseline.polygonFrameRotationDegrees);
    }
    return true;
}

bool applyLocalPolygonCoordsToMemo(API_ElementMemo& memo, const ElementSnapshot& targetBaseline, const std::vector<double>& localPolygonCoords)
{
    if (!effectiveFrameValid(targetBaseline) || memo.coords == nullptr || *memo.coords == nullptr) {
        return false;
    }
    const auto coordCount = BMGetHandleSize(reinterpret_cast<GSHandle>(memo.coords)) / sizeof(API_Coord);
    if (localPolygonCoords.size() != coordCount * 2) {
        return false;
    }
    for (std::size_t index = 1; index < coordCount; ++index) {
        (*memo.coords)[index] = localToWorldCoord(
            localPolygonCoords[index * 2],
            localPolygonCoords[index * 2 + 1],
            effectiveFrameOriginX(targetBaseline),
            effectiveFrameOriginY(targetBaseline),
            effectiveFrameRotationDegrees(targetBaseline));
    }
    return true;
}

bool memoBoundsCenter(const API_ElementMemo& memo, double& centerX, double& centerY)
{
    if (memo.coords == nullptr || *memo.coords == nullptr) {
        return false;
    }
    const auto coordCount = BMGetHandleSize(reinterpret_cast<GSHandle>(memo.coords)) / sizeof(API_Coord);
    if (coordCount <= 1) {
        return false;
    }
    double minX = (*memo.coords)[1].x;
    double maxX = (*memo.coords)[1].x;
    double minY = (*memo.coords)[1].y;
    double maxY = (*memo.coords)[1].y;
    for (std::size_t index = 2; index < coordCount; ++index) {
        minX = std::min(minX, (*memo.coords)[index].x);
        maxX = std::max(maxX, (*memo.coords)[index].x);
        minY = std::min(minY, (*memo.coords)[index].y);
        maxY = std::max(maxY, (*memo.coords)[index].y);
    }
    centerX = (minX + maxX) / 2.0;
    centerY = (minY + maxY) / 2.0;
    return true;
}

void copyElementSettingsInTargetFrame(
    const API_Element& sourceElement,
    API_Element& targetElement,
    const ElementSnapshot& editedBaseline,
    const ElementSnapshot& targetBaseline)
{
    const API_Guid targetGuid = targetElement.header.guid;
    switch (sourceElement.header.type.typeID) {
        case API_WallID: {
            targetElement.wall = sourceElement.wall;
            targetElement.header.guid = targetGuid;
            targetElement.wall.begC = transformCoordBetweenFrames(sourceElement.wall.begC, editedBaseline, targetBaseline);
            targetElement.wall.endC = transformCoordBetweenFrames(sourceElement.wall.endC, editedBaseline, targetBaseline);
            break;
        }
        case API_BeamID: {
            targetElement.beam = sourceElement.beam;
            targetElement.header.guid = targetGuid;
            targetElement.beam.begC = transformCoordBetweenFrames(sourceElement.beam.begC, editedBaseline, targetBaseline);
            targetElement.beam.endC = transformCoordBetweenFrames(sourceElement.beam.endC, editedBaseline, targetBaseline);
            break;
        }
        case API_ColumnID: {
            targetElement.column = sourceElement.column;
            targetElement.header.guid = targetGuid;
            targetElement.column.origoPos = transformCoordBetweenFrames(sourceElement.column.origoPos, editedBaseline, targetBaseline);
            if (effectiveFrameValid(editedBaseline) && effectiveFrameValid(targetBaseline)) {
                targetElement.column.axisRotationAngle += degreesToRadians(
                    effectiveFrameRotationDegrees(targetBaseline) - effectiveFrameRotationDegrees(editedBaseline));
            }
            break;
        }
        case API_ObjectID: {
            targetElement.object = sourceElement.object;
            targetElement.header.guid = targetGuid;
            targetElement.object.pos = transformCoordBetweenFrames(sourceElement.object.pos, editedBaseline, targetBaseline);
            if (effectiveFrameValid(editedBaseline) && effectiveFrameValid(targetBaseline)) {
                targetElement.object.angle += degreesToRadians(
                    effectiveFrameRotationDegrees(targetBaseline) - effectiveFrameRotationDegrees(editedBaseline));
            }
            break;
        }
        default:
            targetElement.header.guid = targetGuid;
            break;
    }
}

std::string memoTopologySignature(const API_ElementMemo& memo)
{
    const auto coordCount = memo.coords == nullptr ? 0 : BMGetHandleSize(reinterpret_cast<GSHandle>(memo.coords)) / sizeof(API_Coord);
    const auto pendCount = memo.pends == nullptr ? 0 : BMGetHandleSize(reinterpret_cast<GSHandle>(memo.pends)) / sizeof(Int32);
    const auto arcCount = memo.parcs == nullptr ? 0 : BMGetHandleSize(reinterpret_cast<GSHandle>(memo.parcs)) / sizeof(API_PolyArc);
    std::ostringstream out;
    out << "coords=" << coordCount << ";pends=" << pendCount << ";arcs=" << arcCount;
    return out.str();
}

bool memoFrame(const API_ElementMemo& memo, double& originX, double& originY, double& rotationDegrees)
{
    if (memo.coords == nullptr || *memo.coords == nullptr) {
        return false;
    }
    const auto coordCount = BMGetHandleSize(reinterpret_cast<GSHandle>(memo.coords)) / sizeof(API_Coord);
    if (coordCount <= 1) {
        return false;
    }

    double minX = (*memo.coords)[1].x;
    double maxX = (*memo.coords)[1].x;
    double minY = (*memo.coords)[1].y;
    double maxY = (*memo.coords)[1].y;
    double bestLengthSquared = -1.0;
    API_Coord bestA = (*memo.coords)[1];
    API_Coord bestB = (*memo.coords)[1];
    for (std::size_t index = 1; index < coordCount; ++index) {
        const API_Coord current = (*memo.coords)[index];
        minX = std::min(minX, current.x);
        maxX = std::max(maxX, current.x);
        minY = std::min(minY, current.y);
        maxY = std::max(maxY, current.y);
        if (index + 1 < coordCount) {
            const API_Coord next = (*memo.coords)[index + 1];
            const double dx = next.x - current.x;
            const double dy = next.y - current.y;
            const double lengthSquared = dx * dx + dy * dy;
            if (lengthSquared > bestLengthSquared) {
                bestLengthSquared = lengthSquared;
                bestA = current;
                bestB = next;
            }
        }
    }
    originX = (minX + maxX) / 2.0;
    originY = (minY + maxY) / 2.0;
    rotationDegrees = bestLengthSquared > 0.0 ? radiansToDegrees(std::atan2(bestB.y - bestA.y, bestB.x - bestA.x)) : 0.0;
    return true;
}

bool elementFrame(const API_Element& element, const API_ElementMemo* memo, double& originX, double& originY, double& rotationDegrees)
{
    if (memo != nullptr && memoFrame(*memo, originX, originY, rotationDegrees)) {
        return true;
    }
    switch (element.header.type.typeID) {
        case API_WallID:
            originX = (element.wall.begC.x + element.wall.endC.x) / 2.0;
            originY = (element.wall.begC.y + element.wall.endC.y) / 2.0;
            rotationDegrees = radiansToDegrees(std::atan2(element.wall.endC.y - element.wall.begC.y, element.wall.endC.x - element.wall.begC.x));
            return true;
        case API_BeamID:
            originX = (element.beam.begC.x + element.beam.endC.x) / 2.0;
            originY = (element.beam.begC.y + element.beam.endC.y) / 2.0;
            rotationDegrees = radiansToDegrees(std::atan2(element.beam.endC.y - element.beam.begC.y, element.beam.endC.x - element.beam.begC.x));
            return true;
        case API_ColumnID:
            originX = element.column.origoPos.x;
            originY = element.column.origoPos.y;
            rotationDegrees = radiansToDegrees(element.column.axisRotationAngle);
            return true;
        case API_ObjectID:
            originX = element.object.pos.x;
            originY = element.object.pos.y;
            rotationDegrees = radiansToDegrees(element.object.angle);
            return true;
        default:
            return false;
    }
}

std::array<std::pair<const char*, std::string BuildSyncProperties::*>, 21> buildSyncPropertyFields()
{
    return {{
        {"BS_AssemblyID", &BuildSyncProperties::assemblyId},
        {"BS_AssemblyUUID", &BuildSyncProperties::assemblyUuid},
        {"BS_AssemblyName", &BuildSyncProperties::assemblyName},
        {"BS_AssemblyType", &BuildSyncProperties::assemblyType},
        {"BS_AssemblyRole", &BuildSyncProperties::assemblyRole},
        {"BS_AssemblyVersion", &BuildSyncProperties::assemblyVersion},
        {"BS_TaskID", &BuildSyncProperties::taskId},
        {"BS_Trade", &BuildSyncProperties::trade},
        {"BS_Status", &BuildSyncProperties::status},
        {"BS_CustomProperties", &BuildSyncProperties::customProperties},
        {"BS_SourceAssemblyUUID", &BuildSyncProperties::sourceAssemblyUuid},
        {"BS_InstanceUUID", &BuildSyncProperties::instanceUuid},
        {"BS_ComponentID", &BuildSyncProperties::componentId},
        {"BS_PlacementID", &BuildSyncProperties::placementId},
        {"BS_IsSourcePlacement", &BuildSyncProperties::isSourcePlacement},
        {"BS_IsInstance", &BuildSyncProperties::isInstance},
        {"BS_IsMirror", &BuildSyncProperties::isMirror},
        {"BS_SourceIsCountable", &BuildSyncProperties::sourceIsCountable},
        {"BS_InstanceNeedsRepair", &BuildSyncProperties::instanceNeedsRepair},
        {"BS_LocalOverridesAllowed", &BuildSyncProperties::localOverridesAllowed},
        {"BS_InstanceRole", &BuildSyncProperties::instanceRole},
    }};
}

GSErrCode getBuildSyncPropertyGroup(API_PropertyGroup& outGroup)
{
    static API_PropertyGroup buildSyncGroup;
    if (buildSyncGroup.guid != APINULLGuid && ACAPI_Property_GetPropertyGroup(buildSyncGroup) == NoError) {
        outGroup = buildSyncGroup;
        return NoError;
    }

    GS::Array<API_PropertyGroup> groups;
    GSErrCode error = ACAPI_Property_GetPropertyGroups(groups);
    if (error != NoError) {
        return error;
    }

    const GS::UniString groupName("BuildSync");
    for (const API_PropertyGroup& group : groups) {
        if (group.name == groupName) {
            outGroup = buildSyncGroup = group;
            return NoError;
        }
    }

    buildSyncGroup = {};
    buildSyncGroup.guid = APINULLGuid;
    buildSyncGroup.name = groupName;
    buildSyncGroup.description = "BuildSync assembly wrapper metadata.";
    error = ACAPI_Property_CreatePropertyGroup(buildSyncGroup);
    if (error == NoError) {
        outGroup = buildSyncGroup;
    }
    return error;
}

API_PropertyDefinition stringPropertyDefinition(const API_PropertyGroup& group, const char* propertyName)
{
    API_PropertyDefinition definition;
    definition.guid = APINULLGuid;
    definition.groupGuid = group.guid;
    definition.name = propertyName;
    definition.description = "BuildSync assembly wrapper field.";
    definition.collectionType = API_PropertySingleCollectionType;
    definition.valueType = API_PropertyStringValueType;
    definition.measureType = API_PropertyDefaultMeasureType;
    definition.defaultValue.basicValue.singleVariant.variant.type = API_PropertyStringValueType;
    definition.defaultValue.basicValue.singleVariant.variant.uniStringValue = "";
    return definition;
}

GSErrCode getOrCreateStringPropertyDefinition(const API_PropertyGroup& group, const char* propertyName, API_PropertyDefinition& outDefinition)
{
    GS::Array<API_PropertyDefinition> definitions;
    GSErrCode error = ACAPI_Property_GetPropertyDefinitions(group.guid, definitions);
    if (error != NoError) {
        return error;
    }

    const GS::UniString name(propertyName);
    for (const API_PropertyDefinition& definition : definitions) {
        if (definition.name == name) {
            outDefinition = definition;
            return NoError;
        }
    }

    outDefinition = stringPropertyDefinition(group, propertyName);
    return ACAPI_Property_CreatePropertyDefinition(outDefinition);
}

GSErrCode makeDefinitionAvailableForElement(API_PropertyDefinition& definition, const API_Guid& elementGuid)
{
    GS::Array<GS::Pair<API_Guid, API_Guid>> classificationPairs;
    GSErrCode error = ACAPI_Element_GetClassificationItems(elementGuid, classificationPairs);
    if (error != NoError) {
        return error;
    }
    if (classificationPairs.IsEmpty()) {
        return APIERR_BADPARS;
    }

    bool changed = false;
    for (const auto& pair : classificationPairs) {
        if (!definition.availability.Contains(pair.second)) {
            definition.availability.Push(pair.second);
            changed = true;
        }
    }

    if (changed) {
        error = ACAPI_Property_ChangePropertyDefinition(definition);
    }
    return error;
}

bool writeStringProperty(const API_Guid& elementGuid, const char* propertyName, const std::string& value, std::string& diagnostic)
{
    API_PropertyGroup group;
    GSErrCode error = getBuildSyncPropertyGroup(group);
    if (error != NoError) {
        diagnostic = std::string("Could not find or create BuildSync property group. error=") + errorCodeString(error);
        return false;
    }

    API_PropertyDefinition definition;
    error = getOrCreateStringPropertyDefinition(group, propertyName, definition);
    if (error != NoError) {
        diagnostic = std::string("Could not find or create property definition ") + propertyName + ". error=" + errorCodeString(error);
        return false;
    }
    error = makeDefinitionAvailableForElement(definition, elementGuid);
    if (error != NoError) {
        diagnostic = std::string("Could not make property definition ") + propertyName + " available for selected element classifications. error=" + errorCodeString(error);
        return false;
    }

    API_Property property;
    property.definition = definition;
    property.status = API_Property_HasValue;
    property.isDefault = false;
    property.value.singleVariant.variant.type = API_PropertyStringValueType;
    property.value.singleVariant.variant.uniStringValue = GS::UniString(value.c_str());
    if (!ACAPI_Property_IsValidValue(property.value, property.definition)) {
        diagnostic = std::string("Property value is invalid for ") + propertyName + ".";
        return false;
    }
    error = ACAPI_Element_SetProperty(elementGuid, property);
    if (error != NoError) {
        diagnostic = std::string("Could not write property ") + propertyName + " to selected element. error=" + errorCodeString(error);
        return false;
    }
    diagnostic = std::string("Wrote property ") + propertyName + ".";
    return true;
}

std::string describeStringProperty(const API_Guid& elementGuid, const char* propertyName)
{
    API_PropertyGroup group;
    if (getBuildSyncPropertyGroup(group) != NoError) {
        return std::string(propertyName) + "=missing-group";
    }

    API_PropertyDefinition definition;
    if (getOrCreateStringPropertyDefinition(group, propertyName, definition) != NoError) {
        return std::string(propertyName) + "=missing-definition";
    }

    if (!ACAPI_Element_IsPropertyDefinitionAvailable(elementGuid, definition.guid)) {
        return std::string(propertyName) + "=not-available";
    }

    API_Property property;
    const GSErrCode error = ACAPI_Element_GetPropertyValue(elementGuid, definition.guid, property);
    if (error != NoError || property.status != API_Property_HasValue) {
        return std::string(propertyName) + "=not-readable";
    }

    GS::UniString value;
    if (ACAPI_Property_GetPropertyValueString(property, &value) != NoError) {
        return std::string(propertyName) + "=value-conversion-failed";
    }
    return std::string(propertyName) + "=\"" + value.ToCStr().Get() + "\"";
}

bool readStringProperty(const API_Guid& elementGuid, const char* propertyName, std::string& outValue)
{
    API_PropertyGroup group;
    if (getBuildSyncPropertyGroup(group) != NoError) {
        return false;
    }

    API_PropertyDefinition definition;
    if (getOrCreateStringPropertyDefinition(group, propertyName, definition) != NoError) {
        return false;
    }

    if (!ACAPI_Element_IsPropertyDefinitionAvailable(elementGuid, definition.guid)) {
        return false;
    }

    API_Property property;
    const GSErrCode error = ACAPI_Element_GetPropertyValue(elementGuid, definition.guid, property);
    if (error != NoError || property.status != API_Property_HasValue) {
        return false;
    }

    GS::UniString value;
    if (ACAPI_Property_GetPropertyValueString(property, &value) != NoError) {
        return false;
    }
    outValue = value.ToCStr().Get();
    return true;
}

BuildSyncProperties readBuildSyncPropertiesForElement(const API_Guid& elementGuid, bool* hasProperties)
{
    BuildSyncProperties properties;
    bool any = false;
    for (const auto& field : buildSyncPropertyFields()) {
        std::string value;
        if (readStringProperty(elementGuid, field.first, value)) {
            properties.*(field.second) = value;
            any = true;
        }
    }
    if (hasProperties != nullptr) {
        *hasProperties = any;
    }
    return properties;
}

} // namespace

std::vector<SelectedElement> ArchicadSelectionReader::readSelection() const
{
    API_SelectionInfo selectionInfo = {};
    GS::Array<API_Neig> selectionNeigs;
    const GSErrCode err = ACAPI_Selection_Get(&selectionInfo, &selectionNeigs, true);
    if (err == APIERR_NOSEL) {
        return {};
    }
    if (err != NoError) {
        ACAPI_WriteReport("BuildSync: failed to read Archicad selection.", false);
        return {};
    }

    std::vector<SelectedElement> selected;
    selected.reserve(selectionNeigs.GetSize());
    for (const API_Neig& neig : selectionNeigs) {
        selected.push_back({
            apiGuidToStdString(neig.guid),
            selectedElementTypeName(neig.guid),
        });
    }
    return selected;
}

bool ArchicadElementPropertyWriter::ensureBuildSyncProperties()
{
    API_PropertyGroup group;
    GSErrCode error = getBuildSyncPropertyGroup(group);
    if (error != NoError) {
        lastDiagnostic_ = std::string("Could not find or create BuildSync property group. error=") + errorCodeString(error);
        ACAPI_WriteReport(("BuildSync: " + lastDiagnostic_).c_str(), false);
        return false;
    }
    for (const auto& field : buildSyncPropertyFields()) {
        API_PropertyDefinition definition;
        error = getOrCreateStringPropertyDefinition(group, field.first, definition);
        if (error != NoError) {
            lastDiagnostic_ = std::string("Could not find or create property definition ") + field.first + ". error=" + errorCodeString(error);
            ACAPI_WriteReport(("BuildSync: " + lastDiagnostic_).c_str(), false);
            return false;
        }
    }
    lastDiagnostic_ = "BuildSync property group and BS_* definitions are available.";
    return true;
}

bool ArchicadElementPropertyWriter::writeAssemblyProperties(const std::string& elementGuid, const BuildSyncProperties& properties)
{
    const API_Guid apiGuid = apiGuidFromStdString(elementGuid);
    bool ok = true;
    for (const auto& field : buildSyncPropertyFields()) {
        std::string diagnostic;
        if (!writeStringProperty(apiGuid, field.first, properties.*(field.second), diagnostic)) {
            lastDiagnostic_ = diagnostic;
            ok = false;
            break;
        }
        lastDiagnostic_ = diagnostic;
    }
    if (!ok) {
        ACAPI_WriteReport(("BuildSync: " + lastDiagnostic_).c_str(), false);
    } else {
        lastDiagnostic_ = "Wrote all BS_* properties to selected element.";
    }
    return ok;
}

bool ArchicadElementPropertyWriter::clearAssemblyProperties(const std::string& elementGuid)
{
    const API_Guid apiGuid = apiGuidFromStdString(elementGuid);
    bool ok = true;
    for (const auto& field : buildSyncPropertyFields()) {
        std::string diagnostic;
        if (!writeStringProperty(apiGuid, field.first, "", diagnostic)) {
            lastDiagnostic_ = diagnostic;
            ok = false;
            break;
        }
        lastDiagnostic_ = diagnostic;
    }
    if (ok) {
        lastDiagnostic_ = "Cleared all BS_* properties from selected element.";
    }
    return ok;
}

std::string ArchicadElementPropertyWriter::describeBuildSyncProperties(const std::string& elementGuid) const
{
    const API_Guid apiGuid = apiGuidFromStdString(elementGuid);
    std::ostringstream report;
    bool first = true;
    for (const auto& field : buildSyncPropertyFields()) {
        if (!first) {
            report << "; ";
        }
        first = false;
        report << describeStringProperty(apiGuid, field.first);
    }
    return report.str();
}

std::string ArchicadElementPropertyWriter::lastDiagnostic() const
{
    return lastDiagnostic_;
}

bool ArchicadElementExistenceChecker::exists(const std::string& elementGuid) const
{
    API_Elem_Head header = {};
    header.guid = apiGuidFromStdString(elementGuid);
    return ACAPI_Element_GetHeader(&header) == NoError;
}

ElementMetadata ArchicadElementMetadataReader::readElementMetadata(const std::string& elementGuid) const
{
    ElementMetadata metadata;
    metadata.elementGuid = elementGuid;

    const API_Guid apiGuid = apiGuidFromStdString(elementGuid);
    API_Elem_Head header = {};
    header.guid = apiGuid;
    if (ACAPI_Element_GetHeader(&header) != NoError) {
        metadata.status = "missing";
        return metadata;
    }

    metadata.elementType = elementTypeName(header.type.typeID);
    metadata.status = "active";

    GS::UniString elementInfoString;
    if (ACAPI_Element_GetElementInfoString(&apiGuid, &elementInfoString) == NoError) {
        metadata.elementId = elementInfoString.ToCStr().Get();
    }

    API_Attribute layerAttribute = {};
    GS::UniString layerName;
    layerAttribute.header.typeID = API_LayerID;
    layerAttribute.header.index = header.layer;
    layerAttribute.header.uniStringNamePtr = &layerName;
    if (ACAPI_Attribute_Get(&layerAttribute) == NoError) {
        metadata.layerName = layerName.IsEmpty() ? layerAttribute.header.name : layerName.ToCStr().Get();
    }

    return metadata;
}

bool ArchicadHighlightController::selectElements(const std::vector<std::string>& elementGuids)
{
    GS::Array<API_Neig> neigs;
    for (const std::string& elementGuid : elementGuids) {
        API_Elem_Head header = {};
        header.guid = apiGuidFromStdString(elementGuid);
        if (ACAPI_Element_GetHeader(&header) != NoError) {
            continue;
        }
        API_Neig neig = {};
        if (elementHeaderToNeig(header, neig)) {
            neigs.Push(neig);
        }
    }
    if (neigs.IsEmpty()) {
        return false;
    }
    ACAPI_Selection_DeselectAll();
    return ACAPI_Selection_Select(neigs, true) == NoError;
}

bool ArchicadInstanceElementOperator::supportsElementType(const std::string& elementType) const
{
    return elementType == "Wall" || elementType == "Slab" || elementType == "Column" ||
           elementType == "Beam" || elementType == "Roof" || elementType == "Object";
}

std::vector<std::string> ArchicadInstanceElementOperator::supportedElementTypes() const
{
    return {"Wall", "Slab", "Column", "Beam", "Roof", "Object"};
}

std::vector<ElementSnapshot> ArchicadInstanceElementOperator::snapshotElements(const std::vector<SelectedElement>& elements) const
{
    std::vector<ElementSnapshot> snapshots;
    snapshots.reserve(elements.size());
    for (const auto& element : elements) {
        API_Element apiElement = {};
        apiElement.header.guid = apiGuidFromStdString(element.elementGuid);
        if (ACAPI_Element_Get(&apiElement) != NoError) {
            lastDiagnostic_ = "Could not read Archicad element for snapshot: " + element.elementGuid;
            continue;
        }
        const std::string liveElementType = elementTypeName(apiElement.header.type.typeID);
        if (!supportsElementType(liveElementType)) {
            lastDiagnostic_ = "Unsupported element type for wrapper instancing: " + liveElementType;
            continue;
        }
        API_ElementMemo memo = {};
        const bool hasMemo = apiElement.header.hasMemo && ACAPI_Element_GetMemo(apiElement.header.guid, &memo) == NoError;
        double originX = 0.0;
        double originY = 0.0;
        double rotationDegrees = 0.0;
        const bool frameValid = elementFrame(apiElement, hasMemo ? &memo : nullptr, originX, originY, rotationDegrees);
        double polygonFrameOriginX = 0.0;
        double polygonFrameOriginY = 0.0;
        double polygonFrameRotationDegrees = 0.0;
        const bool polygonFrameValid = hasMemo && memoFrame(memo, polygonFrameOriginX, polygonFrameOriginY, polygonFrameRotationDegrees);
        double boundsCenterX = 0.0;
        double boundsCenterY = 0.0;
        double boundsCenterZ = 0.0;
        const bool boundsValid = elementBoundsCenter(apiElement.header, boundsCenterX, boundsCenterY, boundsCenterZ);
        const std::string snapshotJson =
            std::string("{\"guid\":\"") + element.elementGuid + "\",\"type\":\"" + liveElementType +
            "\",\"hasMemo\":" + (apiElement.header.hasMemo ? "true" : "false") + "}";
        snapshots.push_back({
            element.elementGuid,
            liveElementType,
            snapshotJson,
            originX,
            originY,
            rotationDegrees,
            frameValid,
            originX,
            originY,
            rotationDegrees,
            frameValid,
            hasMemo ? memoTopologySignature(memo) : "",
            hasMemo ? memoPolygonCoords(memo) : std::vector<double>{},
            polygonFrameOriginX,
            polygonFrameOriginY,
            polygonFrameRotationDegrees,
            polygonFrameValid,
            boundsCenterX,
            boundsCenterY,
            boundsCenterZ,
            boundsValid,
        });
        if (hasMemo) {
            ACAPI_DisposeElemMemoHdls(&memo);
        }
    }
    if (snapshots.size() == elements.size()) {
        lastDiagnostic_ = "Element snapshot metadata captured. Full normalized memo serialization remains the next SDK step.";
    }
    return snapshots;
}

std::vector<ElementDuplicateResult> ArchicadInstanceElementOperator::duplicateElements(
    const std::vector<ElementDuplicateRequest>& requests,
    const PlanPlacement& placement)
{
    std::vector<ElementDuplicateResult> results;
    std::vector<std::string> createdGuids;
    for (const auto& request : requests) {
        if (!supportsElementType(request.elementType)) {
            lastDiagnostic_ = "Unsupported element type for wrapper instancing: " + request.elementType;
            return {};
        }

        API_Element element = {};
        element.header.guid = apiGuidFromStdString(request.sourceElementGuid);
        GSErrCode error = ACAPI_Element_Get(&element);
        if (error != NoError) {
            lastDiagnostic_ = "Could not read source element for duplication. sourceGuid=" +
                request.sourceElementGuid + " component=" + request.componentId +
                " type=" + request.elementType + " error=" + errorCodeString(error);
            return {};
        }

        API_ElementMemo memo = {};
        const bool hadMemo = element.header.hasMemo;
        if (hadMemo) {
            error = ACAPI_Element_GetMemo(element.header.guid, &memo);
            if (error != NoError) {
                lastDiagnostic_ = "Could not read source element memo for duplication. sourceGuid=" +
                    request.sourceElementGuid + " component=" + request.componentId +
                    " type=" + request.elementType + " error=" + errorCodeString(error);
                return {};
            }
        }

        element.header.guid = APINULLGuid;
        error = ACAPI_Element_Create(&element, hadMemo ? &memo : nullptr);
        if (hadMemo) {
            ACAPI_DisposeElemMemoHdls(&memo);
        }
        if (error != NoError) {
            lastDiagnostic_ = "Could not create duplicated instance element. sourceGuid=" +
                request.sourceElementGuid + " component=" + request.componentId +
                " type=" + request.elementType + " error=" + errorCodeString(error);
            return {};
        }

        const std::string newGuid = apiGuidToStdString(element.header.guid);
        createdGuids.push_back(newGuid);
        results.push_back({request.sourceElementGuid, request.componentId, newGuid, request.elementType, request.role});
    }

    if (!createdGuids.empty() && !applyPlanPlacement(createdGuids, placement, lastDiagnostic_)) {
        ACAPI_Element_Delete(apiGuidArrayFromStrings(createdGuids));
        return {};
    }
    lastDiagnostic_ = "Duplicated and transformed instance elements.";
    return results;
}

bool ArchicadInstanceElementOperator::updateElementFromSnapshot(
    const std::string& elementGuid,
    const ElementSnapshot& snapshot,
    const ElementSnapshot& editedBaseline,
    const ElementSnapshot& targetBaseline,
    std::string* replacementElementGuid)
{
    API_Element sourceElement = {};
    sourceElement.header.guid = apiGuidFromStdString(snapshot.elementGuid);
    GSErrCode error = ACAPI_Element_Get(&sourceElement);
    if (error != NoError) {
        lastDiagnostic_ = "Could not read edited component element for propagation. error=" + errorCodeString(error);
        return false;
    }

    API_Elem_Head targetHeader = {};
    targetHeader.guid = apiGuidFromStdString(elementGuid);
    error = ACAPI_Element_GetHeader(&targetHeader);
    const bool targetExists = error == NoError;
    if (!targetExists) {
        lastDiagnostic_ = "Target instance element is missing and needs repair before shared edit propagation.";
        return false;
    }
    if (targetExists && targetHeader.type.typeID != sourceElement.header.type.typeID) {
        lastDiagnostic_ = "Cannot propagate edit because source and target component element types differ.";
        return false;
    }

    API_Element targetElement = {};
    if (targetExists) {
        targetElement.header.guid = targetHeader.guid;
        error = ACAPI_Element_Get(&targetElement);
        if (error != NoError) {
            lastDiagnostic_ = "Could not read target instance element for propagation. error=" + errorCodeString(error);
            return false;
        }
    }

    API_ElementMemo sourceMemo = {};
    API_ElementMemo targetMemo = {};
    const bool hasMemo = sourceElement.header.hasMemo;
    const bool isSlabLocalDefinitionUpdate =
        hasMemo && targetHeader.type.typeID == API_SlabID && !snapshot.localPolygonCoords.empty();
    std::string placementCorrectionDiagnostic;
    std::string slabDiagnostic;
    std::string replacementDiagnostic;
    std::string staleOriginalCleanupDiagnostic;
    std::string updatedElementGuid = elementGuid;
    double generatedBoundsCenterX = 0.0;
    double generatedBoundsCenterY = 0.0;
    bool generatedBoundsValid = false;
    double targetBoundsBeforeX = 0.0;
    double targetBoundsBeforeY = 0.0;
    double targetBoundsBeforeZ = 0.0;
    const bool targetBoundsBeforeValid = elementBoundsCenter(elementGuid, targetBoundsBeforeX, targetBoundsBeforeY, targetBoundsBeforeZ);
    if (hasMemo) {
        error = ACAPI_Element_GetMemo(sourceElement.header.guid, &sourceMemo);
        if (error != NoError) {
            lastDiagnostic_ = "Could not read edited component memo for propagation. error=" + errorCodeString(error);
            return false;
        }
    }

    if (targetExists && hasMemo && targetHeader.hasMemo) {
        error = ACAPI_Element_GetMemo(targetHeader.guid, &targetMemo);
        if (error != NoError) {
            ACAPI_DisposeElemMemoHdls(&sourceMemo);
            lastDiagnostic_ = "Could not read target instance memo for relative polygon propagation. error=" + errorCodeString(error);
            return false;
        }
        const std::string currentTopology = memoTopologySignature(targetMemo);
        if (!targetBaseline.topologySignature.empty() && currentTopology != targetBaseline.topologySignature) {
            ACAPI_DisposeElemMemoHdls(&targetMemo);
            ACAPI_DisposeElemMemoHdls(&sourceMemo);
            lastDiagnostic_ = "Target instance was reshaped outside the active edit session and needs repair.";
            return false;
        }
        if (isSlabLocalDefinitionUpdate) {
            if (!applyLocalPolygonCoordsToMemo(sourceMemo, targetBaseline, snapshot.localPolygonCoords)) {
                ACAPI_DisposeElemMemoHdls(&targetMemo);
                ACAPI_DisposeElemMemoHdls(&sourceMemo);
                lastDiagnostic_ = "Could not regenerate slab polygon from local definition coordinates. edited=" +
                    frameString(editedBaseline) + " target=" + frameString(targetBaseline) +
                    " localSample=" + coordSampleString(snapshot.localPolygonCoords);
                return false;
            }
            generatedBoundsValid = memoBoundsCenter(sourceMemo, generatedBoundsCenterX, generatedBoundsCenterY);
            if (generatedBoundsValid && targetBaseline.boundsValid) {
                const double preApplyCorrectionX = targetBaseline.boundsCenterX - generatedBoundsCenterX;
                const double preApplyCorrectionY = targetBaseline.boundsCenterY - generatedBoundsCenterY;
                if ((preApplyCorrectionX * preApplyCorrectionX + preApplyCorrectionY * preApplyCorrectionY) > 1.0e-10) {
                    translateMemoCoords(sourceMemo, preApplyCorrectionX, preApplyCorrectionY);
                    generatedBoundsCenterX += preApplyCorrectionX;
                    generatedBoundsCenterY += preApplyCorrectionY;
                }
            }
            slabDiagnostic = "slabLocalDefinition edited=" + frameString(editedBaseline) +
                " target=" + frameString(targetBaseline) +
                " worldBefore=" + coordSampleString(snapshot.polygonCoords) +
                " local=" + coordSampleString(snapshot.localPolygonCoords) +
                " generated=" + coordSampleString(memoPolygonCoords(sourceMemo));
        } else if (!transformMemoCoordsThroughPolygonFrames(sourceMemo, editedBaseline, targetBaseline)) {
            ACAPI_DisposeElemMemoHdls(&targetMemo);
            ACAPI_DisposeElemMemoHdls(&sourceMemo);
            lastDiagnostic_ = "Could not apply polygon edit because source or target coordinate frame is invalid.";
            return false;
        }
        ACAPI_DisposeElemMemoHdls(&targetMemo);
    }

    if (targetExists) {
        if (hasMemo && (targetHeader.type.typeID == API_SlabID || targetHeader.type.typeID == API_RoofID || targetHeader.type.typeID == API_WallID)) {
            API_ElementMemo tmpMemo = polygonChangeMemo(sourceMemo);
            if (isSlabLocalDefinitionUpdate && generatedBoundsValid && editedBaseline.boundsValid &&
                effectiveFrameValid(editedBaseline) && effectiveFrameValid(targetBaseline)) {
                const double frameDx = effectiveFrameOriginX(targetBaseline) - effectiveFrameOriginX(editedBaseline);
                const double frameDy = effectiveFrameOriginY(targetBaseline) - effectiveFrameOriginY(editedBaseline);
                const double generatedDx = generatedBoundsCenterX - editedBaseline.boundsCenterX;
                const double generatedDy = generatedBoundsCenterY - editedBaseline.boundsCenterY;
                if ((frameDx * frameDx + frameDy * frameDy) > 1.0e-8 &&
                    (generatedDx * generatedDx + generatedDy * generatedDy) < 1.0e-8) {
                    ACAPI_DisposeElemMemoHdls(&sourceMemo);
                    lastDiagnostic_ = "Refused slab propagation because generated target bounds overlap the edited/source placement. " +
                        slabDiagnostic + " generatedBounds=" + pointString(generatedBoundsCenterX, generatedBoundsCenterY) +
                        " editedBounds=" + pointString(editedBaseline.boundsCenterX, editedBaseline.boundsCenterY);
                    return false;
                }
            }
            if (targetHeader.type.typeID == API_SlabID) {
                const std::string originalTargetGuid = apiGuidToStdString(targetElement.header.guid);
                error = changeSlabPolygonInPlace(targetHeader, sourceMemo);
                updatedElementGuid = apiGuidToStdString(targetElement.header.guid);
                replacementDiagnostic = " slabChange=ACAPI_Element_ChangeMemo in-place originalGuid=" +
                    originalTargetGuid + " returnedGuid=" + updatedElementGuid +
                    " targetBoundsBefore=" + pointString(targetBoundsBeforeX, targetBoundsBeforeY);
                if (error != NoError) {
                    replacementDiagnostic += " inPlaceError=" + errorCodeString(error);
                    error = changeSlabPolygonWithReplacement(targetElement, sourceMemo);
                    updatedElementGuid = apiGuidToStdString(targetElement.header.guid);
                }
                API_Elem_Head originalAfterChange = {};
                originalAfterChange.guid = apiGuidFromStdString(originalTargetGuid);
                API_Elem_Head returnedAfterChange = {};
                returnedAfterChange.guid = apiGuidFromStdString(updatedElementGuid);
                const bool originalExistsAfterChange = ACAPI_Element_GetHeader(&originalAfterChange) == NoError;
                const bool returnedExistsAfterChange = ACAPI_Element_GetHeader(&returnedAfterChange) == NoError;
                replacementDiagnostic += " fallbackSlabChange=" + std::string(error == NoError && updatedElementGuid != originalTargetGuid ? "ACAPI_Element_Change withdel=true" : "none") +
                    " originalGuid=" +
                    originalTargetGuid + " returnedGuid=" + updatedElementGuid +
                    " originalExistsAfter=" + std::string(originalExistsAfterChange ? "true" : "false") +
                    " returnedExistsAfter=" + std::string(returnedExistsAfterChange ? "true" : "false") +
                    " targetBoundsBefore=" + pointString(targetBoundsBeforeX, targetBoundsBeforeY);
                if (error == NoError && updatedElementGuid == originalTargetGuid) {
                    staleOriginalCleanupDiagnostic = "changed slab in place: returned GUID unchanged.";
                }
            } else {
                error = ACAPI_Element_ChangeMemo(targetHeader.guid, polygonChangeMemoMask(targetHeader), &tmpMemo);
            }
            if (error == NoError) {
                double targetBoundsAfterX = 0.0;
                double targetBoundsAfterY = 0.0;
                double targetBoundsAfterZ = 0.0;
                if (!elementBoundsCenter(updatedElementGuid, targetBoundsAfterX, targetBoundsAfterY, targetBoundsAfterZ)) {
                    ACAPI_DisposeElemMemoHdls(&sourceMemo);
                    lastDiagnostic_ = "Could not read target bounds after polygon propagation.";
                    return false;
                }
                double expectedX = targetBoundsBeforeX;
                double expectedY = targetBoundsBeforeY;
                if (isSlabLocalDefinitionUpdate && generatedBoundsValid) {
                    expectedX = generatedBoundsCenterX;
                    expectedY = generatedBoundsCenterY;
                } else if (targetBoundsBeforeValid && snapshot.boundsValid && editedBaseline.boundsValid) {
                    expectedX = targetBoundsBeforeX + (snapshot.boundsCenterX - editedBaseline.boundsCenterX);
                    expectedY = targetBoundsBeforeY + (snapshot.boundsCenterY - editedBaseline.boundsCenterY);
                }
                const double correctionX = expectedX - targetBoundsAfterX;
                const double correctionY = expectedY - targetBoundsAfterY;
                const double correctionDistanceSquared = correctionX * correctionX + correctionY * correctionY;
                if (correctionDistanceSquared > 1.0e-10) {
                    if (targetHeader.type.typeID == API_SlabID) {
                        translateMemoCoords(sourceMemo, correctionX, correctionY);
                        API_Elem_Head correctedHeader = {};
                        correctedHeader.guid = apiGuidFromStdString(updatedElementGuid);
                        const GSErrCode correctionMemoError = changeSlabPolygonInPlace(correctedHeader, sourceMemo);
                        if (correctionMemoError != NoError) {
                            ACAPI_DisposeElemMemoHdls(&sourceMemo);
                            lastDiagnostic_ = "Polygon propagation snapped away from expected bounds and memo correction failed. expected=" +
                                pointString(expectedX, expectedY) + " actual=" + pointString(targetBoundsAfterX, targetBoundsAfterY) +
                                " memoCorrection=" + pointString(correctionX, correctionY) +
                                " error=" + errorCodeString(correctionMemoError) +
                                (slabDiagnostic.empty() ? "" : " " + slabDiagnostic) + replacementDiagnostic;
                            return false;
                        }
                        double verifiedX = 0.0;
                        double verifiedY = 0.0;
                        double verifiedZ = 0.0;
                        if (!elementBoundsCenter(updatedElementGuid, verifiedX, verifiedY, verifiedZ)) {
                            ACAPI_DisposeElemMemoHdls(&sourceMemo);
                            lastDiagnostic_ = "Polygon propagation memo correction completed but final bounds could not be read. expected=" +
                                pointString(expectedX, expectedY) + " beforeCorrection=" + pointString(targetBoundsAfterX, targetBoundsAfterY) +
                                " memoCorrection=" + pointString(correctionX, correctionY);
                            return false;
                        }
                        const double verifiedDx = expectedX - verifiedX;
                        const double verifiedDy = expectedY - verifiedY;
                        if ((verifiedDx * verifiedDx + verifiedDy * verifiedDy) > 1.0e-8) {
                            ACAPI_DisposeElemMemoHdls(&sourceMemo);
                            lastDiagnostic_ = "Polygon propagation memo correction did not leave target at expected bounds. expected=" +
                                pointString(expectedX, expectedY) + " beforeCorrection=" + pointString(targetBoundsAfterX, targetBoundsAfterY) +
                                " final=" + pointString(verifiedX, verifiedY) +
                                " memoCorrection=" + pointString(correctionX, correctionY) +
                                (slabDiagnostic.empty() ? "" : " " + slabDiagnostic) + replacementDiagnostic;
                            return false;
                        }
                        lastDiagnostic_ = "Applied polygon memo and corrected slab placement with second memo pass. expected=" +
                            pointString(expectedX, expectedY) + " actual=" + pointString(targetBoundsAfterX, targetBoundsAfterY) +
                            " final=" + pointString(verifiedX, verifiedY) +
                            " memoCorrection=" + pointString(correctionX, correctionY) +
                            (slabDiagnostic.empty() ? "" : " " + slabDiagnostic) + replacementDiagnostic;
                        placementCorrectionDiagnostic = lastDiagnostic_;
                    } else {
                        std::string dragDiagnostic;
                        if (!dragElementByDelta(updatedElementGuid, correctionX, correctionY, dragDiagnostic)) {
                        ACAPI_DisposeElemMemoHdls(&sourceMemo);
                        lastDiagnostic_ = "Polygon propagation snapped away from expected bounds and correction drag failed. expected=" +
                            pointString(expectedX, expectedY) + " actual=" + pointString(targetBoundsAfterX, targetBoundsAfterY) +
                            " correction=" + pointString(correctionX, correctionY) + " " + dragDiagnostic;
                        return false;
                        }
                        double verifiedX = 0.0;
                        double verifiedY = 0.0;
                        double verifiedZ = 0.0;
                        if (!elementBoundsCenter(updatedElementGuid, verifiedX, verifiedY, verifiedZ)) {
                        ACAPI_DisposeElemMemoHdls(&sourceMemo);
                        lastDiagnostic_ = "Polygon propagation correction drag completed but final bounds could not be read. expected=" +
                            pointString(expectedX, expectedY) + " beforeCorrection=" + pointString(targetBoundsAfterX, targetBoundsAfterY) +
                            " correction=" + pointString(correctionX, correctionY);
                        return false;
                        }
                        const double verifiedDx = expectedX - verifiedX;
                        const double verifiedDy = expectedY - verifiedY;
                        if ((verifiedDx * verifiedDx + verifiedDy * verifiedDy) > 1.0e-8) {
                        ACAPI_DisposeElemMemoHdls(&sourceMemo);
                        lastDiagnostic_ = "Polygon propagation correction drag did not leave target at expected bounds. expected=" +
                            pointString(expectedX, expectedY) + " beforeCorrection=" + pointString(targetBoundsAfterX, targetBoundsAfterY) +
                            " final=" + pointString(verifiedX, verifiedY) +
                            " correction=" + pointString(correctionX, correctionY) +
                            (slabDiagnostic.empty() ? "" : " " + slabDiagnostic) + replacementDiagnostic;
                        return false;
                        }
                        lastDiagnostic_ = "Applied polygon memo and corrected bounds placement. expected=" +
                        pointString(expectedX, expectedY) + " actual=" + pointString(targetBoundsAfterX, targetBoundsAfterY) +
                        " final=" + pointString(verifiedX, verifiedY) +
                        " correction=" + pointString(correctionX, correctionY) +
                        (slabDiagnostic.empty() ? "" : " " + slabDiagnostic) + replacementDiagnostic;
                        placementCorrectionDiagnostic = lastDiagnostic_;
                    }
                } else if (!slabDiagnostic.empty()) {
                    placementCorrectionDiagnostic = "Applied slab local-definition polygon. before=" +
                        pointString(targetBoundsBeforeX, targetBoundsBeforeY) + " expected=" + pointString(expectedX, expectedY) +
                        " after=" + pointString(targetBoundsAfterX, targetBoundsAfterY) + " " + slabDiagnostic + replacementDiagnostic;
                } else if (!replacementDiagnostic.empty()) {
                    placementCorrectionDiagnostic = "Applied slab polygon replacement." + replacementDiagnostic;
                }
                if (targetHeader.type.typeID == API_SlabID && updatedElementGuid != elementGuid) {
                    std::string cleanupDiagnostic;
                    if (!cleanupValidatedStaleOriginalSlab(
                        elementGuid,
                        targetBoundsBeforeX,
                        targetBoundsBeforeY,
                        targetBoundsBeforeValid,
                        cleanupDiagnostic)) {
                        ACAPI_DisposeElemMemoHdls(&sourceMemo);
                        lastDiagnostic_ = "Slab replacement left an overlapping stale original and cleanup failed. " +
                            cleanupDiagnostic + replacementDiagnostic;
                        return false;
                    }
                    staleOriginalCleanupDiagnostic = cleanupDiagnostic;
                    if (!placementCorrectionDiagnostic.empty()) {
                        placementCorrectionDiagnostic += " " + staleOriginalCleanupDiagnostic;
                    } else {
                        placementCorrectionDiagnostic = staleOriginalCleanupDiagnostic + replacementDiagnostic;
                    }
                }
            }
        } else {
            copyElementSettingsInTargetFrame(sourceElement, targetElement, editedBaseline, targetBaseline);
            // Keep withdel=false here for non-polygon settings copies: earlier testing showed true can delete
            // instance members before the registry has replacement semantics for every supported element type.
            error = ACAPI_Element_Change(&targetElement, nullptr, hasMemo ? &sourceMemo : nullptr, hasMemo ? APIMemoMask_All : 0, false);
        }
    }
    if (hasMemo) {
        ACAPI_DisposeElemMemoHdls(&sourceMemo);
    }
    if (error != NoError) {
        lastDiagnostic_ = targetExists
            ? "Could not apply edited component geometry to target instance. error=" + errorCodeString(error)
            : "Could not recreate missing target instance element. error=" + errorCodeString(error);
        return false;
    }

    const std::string updatedGuid = targetExists ? updatedElementGuid : apiGuidToStdString(sourceElement.header.guid);
    if (replacementElementGuid != nullptr && updatedGuid != elementGuid) {
        *replacementElementGuid = updatedGuid;
    }

    if (!placementCorrectionDiagnostic.empty()) {
        lastDiagnostic_ = placementCorrectionDiagnostic;
    } else {
        lastDiagnostic_ = targetExists
            ? "Updated target instance element from edited component snapshot."
            : "Recreated missing target instance element from edited component snapshot.";
    }
    return true;
}

BuildSyncProperties ArchicadInstanceElementOperator::readBuildSyncProperties(const std::string& elementGuid, bool* hasProperties) const
{
    return readBuildSyncPropertiesForElement(apiGuidFromStdString(elementGuid), hasProperties);
}

std::vector<SlabCandidate> ArchicadInstanceElementOperator::findSlabCandidatesNear(double centerX, double centerY, double maxDistance) const
{
    GS::Array<API_Guid> slabGuids;
    const GSErrCode error = ACAPI_Element_GetElemList(API_SlabID, &slabGuids);
    if (error != NoError) {
        lastDiagnostic_ = "Could not enumerate slabs for duplicate reconciliation. error=" + errorCodeString(error);
        return {};
    }

    std::vector<SelectedElement> selected;
    selected.reserve(slabGuids.GetSize());
    for (const API_Guid& guid : slabGuids) {
        selected.push_back({apiGuidToStdString(guid), "Slab"});
    }

    std::vector<SlabCandidate> candidates;
    const double maxDistanceSquared = maxDistance * maxDistance;
    for (const auto& snapshot : snapshotElements(selected)) {
        if (!snapshot.boundsValid) {
            continue;
        }
        const double dx = snapshot.boundsCenterX - centerX;
        const double dy = snapshot.boundsCenterY - centerY;
        if ((dx * dx + dy * dy) > maxDistanceSquared) {
            continue;
        }
        bool hasProperties = false;
        BuildSyncProperties properties = readBuildSyncProperties(snapshot.elementGuid, &hasProperties);
        candidates.push_back({snapshot, properties, hasProperties});
    }
    lastDiagnostic_ = "Enumerated nearby slab candidates for duplicate reconciliation.";
    return candidates;
}

std::vector<SlabCandidate> ArchicadInstanceElementOperator::findBuildSyncSlabCandidates(const std::string& sourceAssemblyUuid) const
{
    GS::Array<API_Guid> slabGuids;
    const GSErrCode error = ACAPI_Element_GetElemList(API_SlabID, &slabGuids);
    if (error != NoError) {
        lastDiagnostic_ = "Could not enumerate slabs for BuildSync-owned duplicate reconciliation. error=" + errorCodeString(error);
        return {};
    }

    std::vector<SelectedElement> selected;
    selected.reserve(slabGuids.GetSize());
    for (const API_Guid& guid : slabGuids) {
        selected.push_back({apiGuidToStdString(guid), "Slab"});
    }

    std::vector<SlabCandidate> candidates;
    for (const auto& snapshot : snapshotElements(selected)) {
        bool hasProperties = false;
        BuildSyncProperties properties = readBuildSyncProperties(snapshot.elementGuid, &hasProperties);
        if (!hasProperties || properties.sourceAssemblyUuid != sourceAssemblyUuid) {
            continue;
        }
        candidates.push_back({snapshot, properties, true});
    }
    lastDiagnostic_ = "Enumerated BuildSync-owned slab candidates for duplicate reconciliation.";
    return candidates;
}

bool ArchicadInstanceElementOperator::deleteElements(const std::vector<std::string>& elementGuids)
{
    if (elementGuids.empty()) {
        lastDiagnostic_ = "No elements requested for deletion.";
        return true;
    }
    const GSErrCode error = ACAPI_Element_Delete(apiGuidArrayFromStrings(elementGuids));
    if (error != NoError) {
        lastDiagnostic_ = "Could not delete instance elements. error=" + errorCodeString(error);
        return false;
    }
    lastDiagnostic_ = "Deleted instance elements.";
    return true;
}

std::string ArchicadInstanceElementOperator::groupElements(const std::vector<std::string>& elementGuids)
{
    GS::Array<API_Guid> guids = apiGuidArrayFromStrings(elementGuids);
    API_Guid groupGuid = APINULLGuid;
    const GSErrCode error = ACAPI_Grouping_CreateGroup(guids, &groupGuid);
    if (error != NoError) {
        lastDiagnostic_ = "Could not create native Archicad group for instance. error=" + errorCodeString(error);
        return "";
    }
    lastDiagnostic_ = "Created native Archicad group for instance.";
    return apiGuidToStdString(groupGuid);
}

bool ArchicadInstanceElementOperator::ungroupElements(const std::string&, const std::vector<std::string>& elementGuids)
{
    GS::Array<API_Guid> guids = apiGuidArrayFromStrings(elementGuids);
    const GSErrCode error = ACAPI_Grouping_Tool(guids, APITool_Ungroup, nullptr);
    if (error != NoError) {
        lastDiagnostic_ = "Could not ungroup native Archicad instance group. error=" + errorCodeString(error);
        return false;
    }
    lastDiagnostic_ = "Ungrouped native Archicad instance group.";
    return true;
}

std::string ArchicadInstanceElementOperator::lastDiagnostic() const
{
    return lastDiagnostic_;
}

LocalPythonListenerClient::LocalPythonListenerClient(std::string listenerBaseUrl)
    : listenerBaseUrl_(std::move(listenerBaseUrl))
{
}

bool LocalPythonListenerClient::healthCheck()
{
    ACAPI_WriteReport("BuildSync: Python listener client is linked; native HTTP health check is next.", false);
    return false;
}

bool LocalPythonListenerClient::postEvent(const SyncEvent&, std::string& errorMessage)
{
    errorMessage = "Native HTTP event posting is not implemented yet.";
    ACAPI_WriteReport("BuildSync: Python listener client is linked; native HTTP event post is next.", false);
    return false;
}

} // namespace buildsync
