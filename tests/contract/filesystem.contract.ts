import { describe, expect, it } from "vitest";

import { InMemoryFileSystem } from "../fakes/in-memory-filesystem.js";

describe("filesystem contract", () => {
  it("FS-001 supports write and read roundtrips", async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile("/tmp/report.txt", "ok");
    await expect(fs.readFile("/tmp/report.txt")).resolves.toBe("ok");
  });

  it("FS-002 reports exists correctly", async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile("/tmp/report.txt", "ok");
    await expect(fs.exists("/tmp/report.txt")).resolves.toBe(true);
    await expect(fs.exists("/tmp/missing.txt")).resolves.toBe(false);
  });

  it("FS-003 supports move", async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile("/tmp/source.txt", "ok");
    await fs.move("/tmp/source.txt", "/tmp/dest.txt");

    await expect(fs.exists("/tmp/source.txt")).resolves.toBe(false);
    await expect(fs.readFile("/tmp/dest.txt")).resolves.toBe("ok");
  });

  it("FS-004 supports realpath", async () => {
    const fs = new InMemoryFileSystem();
    fs.linkPath("/tmp/link.txt", "/tmp/target.txt");

    await expect(fs.realpath("/tmp/link.txt")).resolves.toBe("/tmp/target.txt");
  });
});
