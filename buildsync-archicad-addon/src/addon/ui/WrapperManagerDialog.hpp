#pragma once

#include "addon/NativeRuntime.hpp"

namespace buildsync {

void ShowWrapperManagerDialog(NativeRuntime& runtime);
void DestroyWrapperManagerDialog();
int RegisterWrapperManagerPalette();

} // namespace buildsync
