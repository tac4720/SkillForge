import fs from "node:fs/promises";
import path from "node:path";

import type { FileSystem } from "./file-system.ts";

export class NodeFileSystem implements FileSystem {
  async writeFile(filePath: string, contents: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents, "utf8");
  }

  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, "utf8");
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async move(fromPath: string, toPath: string): Promise<void> {
    await fs.mkdir(path.dirname(toPath), { recursive: true });
    await fs.rename(fromPath, toPath);
  }

  async realpath(filePath: string): Promise<string> {
    return fs.realpath(filePath);
  }
}
