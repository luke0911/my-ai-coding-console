/**
 * Electron preload script.
 * Exposes safe IPC methods to the renderer (frontend) via contextBridge.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  selectFolder: () => ipcRenderer.invoke("dialog:selectFolder"),
  selectDataFile: () => ipcRenderer.invoke("dialog:selectDataFile"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  // Backend management
  getBackendPort: () => ipcRenderer.invoke("app:getBackendPort"),
  restartBackend: () => ipcRenderer.invoke("app:restartBackend"),
  // Claude auth
  openClaudeLogin: () => ipcRenderer.invoke("auth:openClaudeLogin"),
  checkClaudeSession: () => ipcRenderer.invoke("auth:checkClaudeSession"),
  clearClaudeSession: () => ipcRenderer.invoke("auth:clearClaudeSession"),
});
