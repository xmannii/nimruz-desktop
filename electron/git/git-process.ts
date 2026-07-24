import { execFile } from "node:child_process";

const DEFAULT_MAX_BUFFER = 4 * 1024 * 1024;

export type GitResult = {
  stdout: string;
  stderr: string;
};

/**
 * Run Git without a shell. Keeping argument boundaries intact is important:
 * repository paths, branch names, and pathspecs can contain spaces and must
 * never be interpolated into a command string.
 */
export function runGit(
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    maxBuffer?: number;
  }
): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr || stdout || error.message).trim();
          reject(new Error(detail || "Git command failed."));
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      }
    );
  });
}

export async function gitOutput(
  args: string[],
  options: Parameters<typeof runGit>[1]
): Promise<string> {
  return (await runGit(args, options)).stdout.trim();
}
