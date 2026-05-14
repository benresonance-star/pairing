#include "archicad_adapter/ArchicadSdkAdapters.hpp"

#include "APIEnvir.h"
#include "ACAPinc.h"
#include "APIdefs_Properties.h"

#include <array>
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

std::array<std::pair<const char*, std::string BuildSyncProperties::*>, 10> buildSyncPropertyFields()
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
