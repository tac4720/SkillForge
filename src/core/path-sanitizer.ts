import path from "node:path";

export type PathSanitizationErrorCode =
  | "invalid_path"
  | "path_traversal"
  | "absolute_path_escape"
  | "symlink_escape";

export class PathSanitizationError extends Error {
  readonly code: PathSanitizationErrorCode;

  constructor(code: PathSanitizationErrorCode, message: string) {
    super(message);
    this.name = "PathSanitizationError";
    this.code = code;
  }
}

export interface SanitizePathOptions {
  baseDir: string;
  inputPath: string;
  realpath?: (candidatePath: string) => string;
}

function isWithin(baseDir: string, candidatePath: string): boolean {
  const relative = path.relative(baseDir, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function sanitizePath(options: SanitizePathOptions): string {
  const { baseDir, inputPath, realpath } = options;

  if (inputPath.length === 0 || inputPath.includes("\0")) {
    throw new PathSanitizationError("invalid_path", "Path must be a non-empty string without null bytes.");
  }

  const base = path.resolve(baseDir);
  const requested = path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(base, inputPath);

  if (!isWithin(base, requested)) {
    const code: PathSanitizationErrorCode = path.isAbsolute(inputPath)
      ? "absolute_path_escape"
      : "path_traversal";
    throw new PathSanitizationError(code, `Path escapes base directory: ${inputPath}`);
  }

  const resolved = realpath ? path.resolve(realpath(requested)) : requested;
  if (!isWithin(base, resolved)) {
    throw new PathSanitizationError("symlink_escape", `Resolved path escapes base directory: ${inputPath}`);
  }

  return resolved;
}

export function isPathWithinBase(baseDir: string, candidatePath: string): boolean {
  return isWithin(path.resolve(baseDir), path.resolve(candidatePath));
}
