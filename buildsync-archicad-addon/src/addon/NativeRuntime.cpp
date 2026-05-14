#include "addon/NativeRuntime.hpp"

#include "addon/ResourceIds.hpp"

#include <sstream>
#include <utility>

namespace buildsync {

NativeRuntime::NativeRuntime(
    AssemblyCommandService& commandService,
    CreateAssemblyRequestProvider createAssemblyRequestProvider)
    : commandService_(commandService)
    , createAssemblyRequestProvider_(std::move(createAssemblyRequestProvider))
{
}

CommandResult NativeRuntime::handleMenuCommand(short commandId)
{
    switch (commandId) {
        case CreateAssemblyCommandId:
            return commandService_.createAssemblyFromSelection(createAssemblyRequestProvider_());
        case SelectAssemblyMembersCommandId:
            return commandService_.selectAssemblyMembers();
        case AddSelectionToAssemblyCommandId:
            return commandService_.addSelectionToAssembly();
        case RemoveSelectionFromAssemblyCommandId:
            return commandService_.removeSelectionFromAssembly();
        case ValidateSelectedAssemblyCommandId:
            return commandService_.validateSelectedAssembly();
        case SyncWithPythonListenerCommandId:
            return commandService_.syncWithPythonListener();
        case DebugSelectionCommandId:
            return commandService_.debugSelection();
        case DebugRegistryCommandId:
            return commandService_.debugRegistry();
        case DebugBuildSyncPropertiesCommandId:
            return commandService_.debugBuildSyncProperties();
        default:
            return {false, "Unsupported BuildSync command.", {}};
    }
}

AssemblyCommandService& NativeRuntime::commandService()
{
    return commandService_;
}

std::string commandResultReport(const CommandResult& result)
{
    std::ostringstream out;
    out << (result.ok ? "BuildSync: " : "BuildSync warning: ") << result.message;
    if (!result.validation.issues.empty()) {
        out << " Validation status=" << result.validation.status << ", issues=" << result.validation.issues.size() << ".";
    }
    return out.str();
}

} // namespace buildsync
