import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { NativePackageExporter } from "../../src/exporters/native-package.js";
import { makeTempDir } from "../helpers/fixtures.js";

describe("native-package integration", () => {
  const exporter = new NativePackageExporter();
  const skillPackage = {
    metadata: {
      name: "invoice-download",
      version: "0.1.0",
      license: "Apache-2.0"
    },
    tests: [
      {
        id: "happy-path",
        input: {
          invoice_month: "2026-03"
        }
      }
    ],
    ir: {
      steps: [{ type: "browser.navigate" }]
    }
  };

  it("NPKG-001 roundtrips native package export and import", async () => {
    const outDir = await makeTempDir("skillforge-native-roundtrip-");

    await exporter.writeToDirectory(skillPackage, outDir);
    const imported = await exporter.importPackageFromDirectory(outDir);

    expect(imported).toEqual(skillPackage);
  });

  it("NPKG-002 retains metadata version and license", async () => {
    const outDir = await makeTempDir("skillforge-native-metadata-");

    await exporter.writeToDirectory(skillPackage, outDir);
    const imported = await exporter.importPackageFromDirectory(outDir);

    expect(imported.metadata.version).toBe("0.1.0");
    expect(imported.metadata.license).toBe("Apache-2.0");
  });

  it("NPKG-003 bundles tests", async () => {
    const outDir = await makeTempDir("skillforge-native-tests-");

    await exporter.writeToDirectory(skillPackage, outDir);

    await expect(fs.stat(path.join(outDir, "tests", "happy-path.json"))).resolves.toBeTruthy();
  });

  it("NPKG-004 bundles the original IR", async () => {
    const outDir = await makeTempDir("skillforge-native-ir-");

    await exporter.writeToDirectory(skillPackage, outDir);

    const ir = await fs.readFile(path.join(outDir, "skill.ir.json"), "utf8");
    expect(ir).toContain("browser.navigate");
  });
});
