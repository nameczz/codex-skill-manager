import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DirectoryPickerResult =
  | {
      canceled: true;
    }
  | {
      canceled: false;
      path: string;
    };

export type DirectoryPicker = (title?: string) => Promise<DirectoryPickerResult>;

export const selectDirectory: DirectoryPicker = async (title = "Choose a folder") => {
  if (process.platform !== "darwin") {
    const error = new Error("Directory picker is only supported on macOS for now. Paste a path instead.");
    (error as Error & { statusCode: number }).statusCode = 501;
    throw error;
  }

  const script = `POSIX path of (choose folder with prompt ${toAppleScriptString(title)})`;

  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    const selectedPath = stripTrailingSlash(stdout.trim());

    if (!selectedPath) {
      return { canceled: true };
    }

    return {
      canceled: false,
      path: selectedPath
    };
  } catch (err) {
    if (isCanceledSelection(err)) {
      return { canceled: true };
    }

    const message = err instanceof Error ? err.message : String(err);
    const stderr = typeof (err as { stderr?: unknown }).stderr === "string" ? (err as { stderr: string }).stderr.trim() : "";
    const error = new Error(`Unable to open directory picker: ${stderr || message}`);
    (error as Error & { statusCode: number }).statusCode = 500;
    throw error;
  }
};

function toAppleScriptString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function stripTrailingSlash(value: string): string {
  if (value.length > 1 && value.endsWith("/")) {
    return value.slice(0, -1);
  }

  return value;
}

function isCanceledSelection(err: unknown): boolean {
  const details = [
    err instanceof Error ? err.message : "",
    typeof (err as { stderr?: unknown }).stderr === "string" ? (err as { stderr: string }).stderr : ""
  ].join("\n");

  return details.includes("User canceled") || details.includes("(-128)");
}
