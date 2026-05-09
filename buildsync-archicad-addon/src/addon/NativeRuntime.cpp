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
        default:
            return {false, "Unsupported BuildSync command.", {}};
    }
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
