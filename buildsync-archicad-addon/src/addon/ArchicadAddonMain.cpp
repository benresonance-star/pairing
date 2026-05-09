#include "addon/ResourceIds.hpp"
#include "addon/NativeRuntimeFactory.hpp"

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

    const auto result = buildsync::buildSyncRuntime().handleMenuCommand(menuParams->menuItemRef.itemIndex);
    ACAPI_WriteReport(buildsync::commandResultReport(result).c_str(), false);

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
