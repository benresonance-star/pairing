/** Normalizes empty input to null; rejects paths that are not safe in-app links. */
export function parseOverviewTaskLinkPath(raw: string | null | undefined): string | null {
  if (raw == null) {
    return null;
  }
  const trimmed = String(raw).trim();
  if (!trimmed) {
    return null;
  }
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    throw new Error("Link path must be an internal path starting with /");
  }
  if (/^[a-zA-Z][\w+.-]*:/.test(trimmed)) {
    throw new Error("Link path cannot use an external URL scheme");
  }
  return trimmed;
}
