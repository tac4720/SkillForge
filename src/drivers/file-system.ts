export interface FileSystem {
  writeFile(filePath: string, contents: string): Promise<void>;
  readFile(filePath: string): Promise<string>;
  exists(filePath: string): Promise<boolean>;
  move(fromPath: string, toPath: string): Promise<void>;
  realpath(filePath: string): Promise<string>;
}
