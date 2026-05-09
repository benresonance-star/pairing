#include "archicad_adapter/ArchicadSdkAdapters.hpp"

#include "APIEnvir.h"
#include "ACAPinc.h"

#include <utility>

namespace buildsync {
namespace {

std::string apiGuidToStdString(const API_Guid& guid)
{
    return APIGuidToString(guid).ToCStr().Get();
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
    if (ACAPI_Element_GetHeader(&header, 0) != NoError) {
        return "Unknown";
    }
    return elementTypeName(header.type.typeID);
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
    ACAPI_WriteReport("BuildSync: Archicad property adapter is linked; property creation is next.", false);
    return false;
}

bool ArchicadElementPropertyWriter::writeAssemblyProperties(const std::string&, const BuildSyncProperties&)
{
    ACAPI_WriteReport("BuildSync: Archicad property write adapter is linked; BS_* writes are next.", false);
    return false;
}

bool ArchicadElementPropertyWriter::clearAssemblyProperties(const std::string&)
{
    ACAPI_WriteReport("BuildSync: Archicad property clear adapter is linked; BS_* clears are next.", false);
    return false;
}

bool ArchicadElementExistenceChecker::exists(const std::string&) const
{
    ACAPI_WriteReport("BuildSync: Archicad existence adapter is linked; GUID lookup is next.", false);
    return false;
}

bool ArchicadHighlightController::selectElements(const std::vector<std::string>&)
{
    ACAPI_WriteReport("BuildSync: Archicad highlight adapter is linked; element selection is next.", false);
    return false;
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
