/**
 * Snippet for Cursor’s integrated terminal on Windows (PowerShell).
 * Uses npm.cmd so strict execution policies do not block npm.ps1.
 * Edit Set-Location if the clone is not under Desktop\Pairing.
 */
export const COMPANION_START_POWERSHELL_SCRIPT = [
  "# Repository root = folder that contains package.json",
  "Set-Location $HOME\\Desktop\\Pairing",
  "npm.cmd run archicad:companion"
].join("\n");

export const COMPANION_OFFLINE_QUERY = "companion_offline";
