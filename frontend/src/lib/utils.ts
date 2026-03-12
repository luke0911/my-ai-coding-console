/** Format cost in USD */
export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

/** Format a timestamp to HH:MM:SS */
export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
}

/** Format duration in ms to human readable */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/** Truncate a file path for display */
export function truncatePath(filePath: string, maxLen = 40): string {
  if (filePath.length <= maxLen) return filePath;
  const parts = filePath.split("/");
  if (parts.length <= 2) return filePath;
  return `.../${parts.slice(-2).join("/")}`;
}

/** Get file extension from path */
export function getFileExtension(filePath: string): string {
  const parts = filePath.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

/** Map file extension to Monaco language */
export function extToLanguage(ext: string): string {
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    py: "python",
    rs: "rust",
    go: "go",
    css: "css",
    html: "html",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sh: "shell",
    bash: "shell",
  };
  return map[ext] ?? "plaintext";
}
