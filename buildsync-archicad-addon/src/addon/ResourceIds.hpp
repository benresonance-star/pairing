#pragma once

namespace buildsync {

constexpr short AddOnInfoResourceId = 32000;
constexpr short BuildSyncMenuResourceId = 32500;
constexpr short BuildSyncPromptResourceId = 32600;

constexpr short CreateAssemblyCommandId = 1;
constexpr short SelectAssemblyMembersCommandId = 2;
constexpr short AddSelectionToAssemblyCommandId = 3;
constexpr short RemoveSelectionFromAssemblyCommandId = 4;
constexpr short ValidateSelectedAssemblyCommandId = 5;
constexpr short SyncWithPythonListenerCommandId = 6;
constexpr short DebugSelectionCommandId = 7;
constexpr short DebugRegistryCommandId = 8;
constexpr short DebugBuildSyncPropertiesCommandId = 9;
constexpr short ManageWrappersCommandId = 10;
constexpr short CreateWrapperInstanceCommandId = 11;
constexpr short CreateMirroredWrapperInstanceCommandId = 12;
constexpr short SelectWrapperInstanceCommandId = 13;
constexpr short EnterWrapperEditModeCommandId = 14;
constexpr short ApplyWrapperEditCommandId = 15;
constexpr short CancelWrapperEditCommandId = 16;
constexpr short ConvertInstanceToStandaloneCommandId = 17;
constexpr short BreakApartInstanceCommandId = 18;
constexpr short RepairWrapperInstanceCommandId = 19;

constexpr short WrapperManagerDialogResourceId = 32700;

} // namespace buildsync
