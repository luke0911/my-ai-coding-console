/**
 * Electron API exposed via preload script's contextBridge.
 * Only available when running inside Electron (not in browser).
 */
interface ElectronAPI {
  selectFolder: () => Promise<string | null>;
  getAppVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  // Claude auth
  openClaudeLogin: () => Promise<{ success: boolean; reason?: string }>;
  checkClaudeSession: () => Promise<{ authenticated: boolean; cookieCount: number }>;
  clearClaudeSession: () => Promise<{ success: boolean }>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
