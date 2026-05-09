#include "addon/ResourceIds.hpp"

// This file is the SDK-facing shell for the native Archicad module. It is built
// only when BUILDSYNC_BUILD_ARCHICAD_ADDON=ON and ARCHICAD_SDK_ROOT points at a
// local Graphisoft C++ SDK installation.

#include "APIEnvir.h"
#include "ACAPinc.h"

namespace {

GSErrCode __ACENV_CALL MenuCommandHandler(const API_MenuParams* menuParams)
{
    if (menuParams == nullptr) {
        return NoError;
    }

    switch (menuParams->menuItemRef.itemIndex) {
        case buildsync::CreateAssemblyCommandId:
            ACAPI_WriteReport("BuildSync: Create Assembly command reached SDK shell.", false);
            break;
        case buildsync::SelectAssemblyMembersCommandId:
            ACAPI_WriteReport("BuildSync: Select Assembly Members command reached SDK shell.", false);
            break;
        case buildsync::AddSelectionToAssemblyCommandId:
            ACAPI_WriteReport("BuildSync: Add Selection to Assembly command reached SDK shell.", false);
            break;
        case buildsync::RemoveSelectionFromAssemblyCommandId:
            ACAPI_WriteReport("BuildSync: Remove Selection from Assembly command reached SDK shell.", false);
            break;
        case buildsync::ValidateSelectedAssemblyCommandId:
            ACAPI_WriteReport("BuildSync: Validate Selected Assembly command reached SDK shell.", false);
            break;
        case buildsync::SyncWithPythonListenerCommandId:
            ACAPI_WriteReport("BuildSync: Sync with Python Listener command reached SDK shell.", false);
            break;
        default:
            break;
    }

    return NoError;
}

} // namespace

API_AddonType __ACDLL_CALL CheckEnvironment(API_EnvirParams* envir)
{
    RSGetIndString(&envir->addOnInfo.name, buildsync::AddOnInfoResourceId, 1, ACAPI_GetOwnResModule());
    RSGetIndString(&envir->addOnInfo.description, buildsync::AddOnInfoResourceId, 2, ACAPI_GetOwnResModule());
    return APIAddon_Normal;
}

GSErrCode __ACDLL_CALL RegisterInterface(void)
{
    return ACAPI_MenuItem_RegisterMenu(
        buildsync::BuildSyncMenuResourceId,
        buildsync::BuildSyncPromptResourceId,
        MenuCode_UserDef,
        MenuFlag_Default);
}

GSErrCode __ACDLL_CALL Initialize(void)
{
    return ACAPI_MenuItem_InstallMenuHandler(buildsync::BuildSyncMenuResourceId, MenuCommandHandler);
}

GSErrCode __ACDLL_CALL FreeData(void)
{
    return NoError;
}
