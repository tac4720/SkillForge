import path from "node:path";

import type { FileSystem } from "../../src/drivers/file-system.js";

export class InMemoryFileSystem implements FileSystem {
  private readonly files = new Map<string, string>();
  private readonly links = new Map<string, string>();

  linkPath(aliasPath: string, targetPath: string): void {
    this.links.set(path.resolve(aliasPath), path.resolve(targetPath));
  }

  async writeFile(filePath: string, contents: string): Promise<void> {
    this.files.set(path.resolve(filePath), contents);
  }

  async readFile(filePath: string): Promise<string> {
    const resolved = await this.realpath(filePath);
    const contents = this.files.get(resolved);
    if (contents === undefined) {
      throw new Error(`Missing file: ${resolved}`);
    }
    return contents;
  }

  async exists(filePath: string): Promise<boolean> {
    const resolved = await this.realpath(filePath);
    return this.files.has(resolved);
  }

  async move(fromPath: string, toPath: string): Promise<void> {
    const source = await this.realpath(fromPath);
    const contents = this.files.get(source);
    if (contents === undefined) {
      throw new Error(`Missing file: ${source}`);
    }

    const destination = path.resolve(toPath);
    this.files.delete(source);
    this.files.set(destination, contents);
  }

  async realpath(filePath: string): Promise<string> {
    const resolved = path.resolve(filePath);
    return this.links.get(resolved) ?? resolved;
  }
}
