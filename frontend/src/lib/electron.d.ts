/**
 * Electron API exposed via preload script's contextBridge.
 * Only available when running inside Electron (not in browser).
 */
interface ElectronAPI {
  platform: string;
  selectFolder: () => Promise<string | null>;
  selectDataFile: () => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
  // Backend management
  restartBackend: () => Promise<{ success: boolean }>;
  // Claude auth
  openClaudeLogin: () => Promise<{ success: boolean; reason?: string }>;
  checkClaudeSession: () => Promise<{ authenticated: boolean; cookieCount: number }>;
  clearClaudeSession: () => Promise<{ success: boolean }>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
