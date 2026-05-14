#include "addon/ResourceIds.hpp"
#include "addon/NativeRuntimeFactory.hpp"
#include "addon/ui/WrapperManagerDialog.hpp"

// This file is the SDK-facing shell for the native Archicad module. It is built
// only when BUILDSYNC_BUILD_ARCHICAD_ADDON=ON and ARCHICAD_SDK_ROOT points at a
// local Graphisoft C++ SDK installation.

#include "APIEnvir.h"
#include "ACAPinc.h"

#include <exception>
#include <sstream>
#include <string>

namespace {

void ShowCommandResult(const buildsync::CommandResult& result)
{
    const std::string report = buildsync::commandResultReport(result);
    ACAPI_WriteReport(report.c_str(), true);
}

bool RequiresUndoableCommand(short menuItemIndex)
{
    switch (menuItemIndex) {
        case buildsync::CreateAssemblyCommandId:
        case buildsync::AddSelectionToAssemblyCommandId:
        case buildsync::RemoveSelectionFromAssemblyCommandId:
            return true;
        default:
            return false;
    }
}

std::string ErrorCodeString(GSErrCode error)
{
    std::ostringstream out;
    out << error;
    return out.str();
}

GSErrCode MenuCommandHandler(const API_MenuParams* menuParams)
{
    if (menuParams == nullptr) {
        return NoError;
    }

    try {
        buildsync::CommandResult result{false, "BuildSync command did not run.", {}};
        const short menuItemIndex = menuParams->menuItemRef.itemIndex;
        if (menuItemIndex == buildsync::ManageWrappersCommandId) {
            buildsync::ShowWrapperManagerDialog(buildsync::buildSyncRuntime());
            return NoError;
        } else if (RequiresUndoableCommand(menuItemIndex)) {
            const GSErrCode error = ACAPI_CallUndoableCommand("BuildSync Assembly Wrapper", [&]() -> GSErrCode {
                try {
                    result = buildsync::buildSyncRuntime().handleMenuCommand(menuItemIndex);
                } catch (const std::exception& exception) {
                    result = {false, std::string("BuildSync command failed: ") + exception.what(), {}};
                } catch (...) {
                    result = {false, "BuildSync command failed with an unknown error.", {}};
                }
                return result.ok ? NoError : Error;
            });
            if (error != NoError && result.message == "BuildSync command did not run.") {
                result = {false, "BuildSync command was rejected by Archicad. error=" + ErrorCodeString(error), {}};
            }
        } else {
            result = buildsync::buildSyncRuntime().handleMenuCommand(menuItemIndex);
        }
        ShowCommandResult(result);
    } catch (const std::exception& error) {
        const std::string message = std::string("BuildSync command failed: ") + error.what();
        ACAPI_WriteReport(message.c_str(), true);
    } catch (...) {
        const std::string message = "BuildSync command failed with an unknown error.";
        ACAPI_WriteReport(message.c_str(), true);
    }

    return NoError;
}

} // namespace

API_AddonType CheckEnvironment(API_EnvirParams* envir)
{
    RSGetIndString(&envir->addOnInfo.name, buildsync::AddOnInfoResourceId, 1, ACAPI_GetOwnResModule());
    RSGetIndString(&envir->addOnInfo.description, buildsync::AddOnInfoResourceId, 2, ACAPI_GetOwnResModule());
    return APIAddon_Normal;
}

GSErrCode RegisterInterface(void)
{
    return ACAPI_MenuItem_RegisterMenu(
        buildsync::BuildSyncMenuResourceId,
        buildsync::BuildSyncPromptResourceId,
        MenuCode_UserDef,
        MenuFlag_Default);
}

GSErrCode Initialize(void)
{
    GSErrCode err = ACAPI_MenuItem_InstallMenuHandler(buildsync::BuildSyncMenuResourceId, MenuCommandHandler);
    if (err != NoError) {
        return err;
    }
    return buildsync::RegisterWrapperManagerPalette();
}

GSErrCode FreeData(void)
{
    buildsync::DestroyWrapperManagerDialog();
    return NoError;
}
