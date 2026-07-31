/** Pure Grok Build update-check contract shared by the UI and parser tests. */
export interface KernelUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  channel?: string;
  /** The bundled binary is source-locked; a newer upstream build needs a new gorkX build. */
  runtimeUpdatesDisabled?: boolean;
  error?: string | null;
  raw?: string;
}

/** Parse the JSON emitted by `grok update --check --json` without trusting log prefixes. */
export function parseKernelUpdateOutput(out: string, exitCode: number | null): KernelUpdateInfo {
  // The updater may prefix its JSON with a colored warning when a channel
  // endpoint is unreachable. Parse the final object without trusting any
  // human-readable log text as a version value.
  const clean = out.replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, '');
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  let payload: Record<string, unknown> | null = null;
  if (start >= 0 && end > start) {
    try {
      const parsed: unknown = JSON.parse(clean.slice(start, end + 1));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      }
    } catch {
      payload = null;
    }
  }
  const text = (key: string): string | null => {
    const value = payload?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };
  const currentVersion = text('currentVersion') || '—';
  const latestVersion = text('latestVersion') || currentVersion;
  const updateAvailable = payload?.updateAvailable === true;
  const channel = text('channel') || 'stable';
  const error = text('error') || (exitCode === 0 ? null : out || 'cannot check kernel updates');
  return {
    currentVersion,
    latestVersion,
    updateAvailable,
    channel,
    runtimeUpdatesDisabled: true,
    error,
    raw: payload ? JSON.stringify(payload) : out,
  };
}
