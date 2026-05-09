"use client";

import { useCallback, useState } from "react";

import { COMPANION_START_POWERSHELL_SCRIPT } from "../../../lib/companion-start-script";

type Props = {
  lastActionFailed?: boolean;
};

export function CompanionOfflineHelp({ lastActionFailed }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(COMPANION_START_POWERSHELL_SCRIPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable; user can select the pre block.
    }
  }, []);

  return (
    <div className={lastActionFailed ? "notice notice-error" : "notice"}>
      {lastActionFailed ? (
        <p>
          <strong>That request could not reach the desktop companion.</strong> Start it using the
          script below, then retry.
        </p>
      ) : (
        <p>
          <strong>Desktop companion is offline.</strong> In Cursor, open the integrated terminal
          (PowerShell), paste the script below (or use <strong>Copy script</strong>), then click
          Connect here.
        </p>
      )}
      <p className="muted">
        Run from your <strong>repository root</strong> (the folder that contains{" "}
        <code>package.json</code>). Change <code>Set-Location</code> if your clone is not at{" "}
        <code>$HOME\Desktop\Pairing</code>. <code>npm.cmd</code> avoids PowerShell blocking{" "}
        <code>npm.ps1</code> when execution policy is strict.
      </p>
      <div className="inline-actions">
        <button type="button" className="secondary-button" onClick={copy}>
          {copied ? "Copied" : "Copy script"}
        </button>
      </div>
      <pre className="log-box">{COMPANION_START_POWERSHELL_SCRIPT}</pre>
    </div>
  );
}
