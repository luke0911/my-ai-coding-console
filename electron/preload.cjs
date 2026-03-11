/**
 * Electron preload script.
 * Exposes safe IPC methods to the renderer (frontend) via contextBridge.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  selectFolder: () => ipcRenderer.invoke("dialog:selectFolder"),
  getAppVersion: () => ipcRenderer.invoke("app:getVersion"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  // Claude auth
  openClaudeLogin: () => ipcRenderer.invoke("auth:openClaudeLogin"),
  checkClaudeSession: () => ipcRenderer.invoke("auth:checkClaudeSession"),
  clearClaudeSession: () => ipcRenderer.invoke("auth:clearClaudeSession"),
});
