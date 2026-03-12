/**
 * Shared tool definitions and executors for the OpenAI SDK client.
 *
 * Provides file and command tools that map OpenAI function calls
 * to real filesystem/shell operations and emit eventBus events.
 */

import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { exec } from "child_process";
import { v4 as uuid } from "uuid";
import { eventBus } from "./event-bus.js";

// ─── Tool definitions for OpenAI function calling ─────────────────

export const OPENAI_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read the contents of a file at the given path",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative path to the file" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Write content to a file, creating it if it doesn't exist",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative path to the file" },
          content: { type: "string", description: "The full content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "edit_file",
      description: "Edit a file by replacing an exact string match with new content",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative path to the file" },
          old_string: { type: "string", description: "The exact string to find and replace" },
          new_string: { type: "string", description: "The replacement string" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_command",
      description: "Execute a shell command and return its output",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to execute" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_files",
      description: "List files in a directory, optionally matching a glob pattern",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path to list" },
          pattern: { type: "string", description: "Optional glob pattern filter (e.g. '*.ts')" },
        },
        required: ["path"],
      },
    },
  },
];

// ─── Tool executors ───────────────────────────────────────────────

export async function executeRead(
  sessionId: string,
  filePath: string,
  cwd: string
): Promise<string> {
  const absPath = path.resolve(cwd, filePath);
  try {
    const content = await fs.readFile(absPath, "utf-8");
    const lineCount = content.split("\n").length;

    eventBus.emit({
      type: "file:read",
      sessionId,
      timestamp: Date.now(),
      filePath: absPath,
      content: content.slice(0, 5000),
      lineCount,
    });

    return content;
  } catch (err: any) {
    return `Error reading file: ${err.message}`;
  }
}

export async function executeWrite(
  sessionId: string,
  filePath: string,
  content: string,
  cwd: string
): Promise<string> {
  const absPath = path.resolve(cwd, filePath);
  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, "utf-8");

    eventBus.emit({
      type: "file:write",
      sessionId,
      timestamp: Date.now(),
      filePath: absPath,
      content,
    });

    return `File written: ${absPath}`;
  } catch (err: any) {
    return `Error writing file: ${err.message}`;
  }
}

export async function executeEdit(
  sessionId: string,
  filePath: string,
  oldString: string,
  newString: string,
  cwd: string
): Promise<string> {
  const absPath = path.resolve(cwd, filePath);
  try {
    const content = await fs.readFile(absPath, "utf-8");
    if (!content.includes(oldString)) {
      return `Error: old_string not found in ${absPath}`;
    }
    const updated = content.replace(oldString, newString);
    await fs.writeFile(absPath, updated, "utf-8");

    eventBus.emit({
      type: "file:edit",
      sessionId,
      timestamp: Date.now(),
      filePath: absPath,
      oldString,
      newString,
    });

    return `File edited: ${absPath}`;
  } catch (err: any) {
    return `Error editing file: ${err.message}`;
  }
}

export async function executeBash(
  sessionId: string,
  command: string,
  cwd: string
): Promise<string> {
  const cmdId = uuid();

  eventBus.emit({
    type: "command:execute",
    sessionId,
    timestamp: Date.now(),
    command,
    commandId: cmdId,
  });

  const startTime = Date.now();

  return new Promise<string>((resolve) => {
    exec(command, { cwd, timeout: 120_000, maxBuffer: 1024 * 1024 * 5 }, (err, stdout, stderr) => {
      const output = stdout + (stderr ? `\n[stderr]\n${stderr}` : "");
      const exitCode = err ? (err as any).code ?? 1 : 0;
      const duration = Date.now() - startTime;

      if (output) {
        eventBus.emit({
          type: "command:output",
          sessionId,
          timestamp: Date.now(),
          commandId: cmdId,
          output,
          stream: "stdout",
        });
      }

      eventBus.emit({
        type: "command:complete",
        sessionId,
        timestamp: Date.now(),
        commandId: cmdId,
        exitCode,
        durationMs: duration,
      });

      resolve(output || (err ? `Command failed with exit code ${exitCode}` : "(no output)"));
    });
  });
}

export async function executeListFiles(
  filePath: string,
  cwd: string,
  pattern?: string
): Promise<string> {
  const absPath = path.resolve(cwd, filePath);
  try {
    const entries = await fs.readdir(absPath, { withFileTypes: true });
    let names = entries.map((e) =>
      e.isDirectory() ? `${e.name}/` : e.name
    );
    if (pattern) {
      const regex = new RegExp(
        "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
      );
      names = names.filter((n) => regex.test(n.replace(/\/$/, "")));
    }
    return names.join("\n") || "(empty directory)";
  } catch (err: any) {
    return `Error listing files: ${err.message}`;
  }
}

// ─── Dispatch a tool call by name ─────────────────────────────────

export async function executeTool(
  sessionId: string,
  toolName: string,
  args: Record<string, any>,
  cwd: string
): Promise<string> {
  switch (toolName) {
    case "read_file":
      return executeRead(sessionId, args.path, cwd);
    case "write_file":
      return executeWrite(sessionId, args.path, args.content, cwd);
    case "edit_file":
      return executeEdit(sessionId, args.path, args.old_string, args.new_string, cwd);
    case "run_command":
      return executeBash(sessionId, args.command, cwd);
    case "list_files":
      return executeListFiles(args.path, cwd, args.pattern);
    default:
      return `Unknown tool: ${toolName}`;
  }
}
