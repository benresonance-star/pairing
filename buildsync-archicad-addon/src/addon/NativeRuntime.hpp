#pragma once

#include "addon/MenuCommands.hpp"

#include <functional>
#include <string>

namespace buildsync {

class NativeRuntime {
public:
    using CreateAssemblyRequestProvider = std::function<CreateAssemblyRequest()>;

    NativeRuntime(
        AssemblyCommandService& commandService,
        CreateAssemblyRequestProvider createAssemblyRequestProvider);

    CommandResult handleMenuCommand(short commandId);
    AssemblyCommandService& commandService();

private:
    AssemblyCommandService& commandService_;
    CreateAssemblyRequestProvider createAssemblyRequestProvider_;
};

std::string commandResultReport(const CommandResult& result);

} // namespace buildsync
