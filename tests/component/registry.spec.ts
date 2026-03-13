import { describe, expect, it } from "vitest";

import { LocalRegistry } from "../../src/registry/local-registry.js";
import { fixtureSkillPath } from "../helpers/fixtures.js";

describe("registry", () => {
  it("REG-001 supports install list and remove", () => {
    const registry = new LocalRegistry();
    registry.install({
      name: "invoice-download",
      version: "0.1.0",
      permissions: { browser: { domains: { allow: ["https://portal.vendor.example"] } } },
      content: "skill: invoice-download"
    });

    expect(registry.list()).toHaveLength(1);
    registry.remove("invoice-download");
    expect(registry.list()).toHaveLength(0);
  });

  it("REG-002 supports enable and disable", () => {
    const registry = new LocalRegistry();
    registry.install({
      name: "invoice-download",
      version: "0.1.0",
      permissions: {},
      content: "skill: invoice-download"
    });

    registry.enable("invoice-download", "0.1.0");
    expect(registry.list()[0]?.enabled).toBe(true);
    registry.disable("invoice-download");
    expect(registry.list()[0]?.enabled).toBe(false);
  });

  it("REG-003 supports version pinning", () => {
    const registry = new LocalRegistry();
    registry.install({ name: "invoice-download", version: "0.1.0", permissions: {}, content: "v1" });
    registry.install({ name: "invoice-download", version: "0.2.0", permissions: {}, content: "v2" });

    registry.pinVersion("invoice-download", "0.1.0");
    expect(registry.get("invoice-download")?.version).toBe("0.1.0");
  });

  it("REG-004 supports rollback", () => {
    const registry = new LocalRegistry();
    registry.install({ name: "invoice-download", version: "0.1.0", permissions: {}, content: "v1" });
    registry.install({ name: "invoice-download", version: "0.2.0", permissions: {}, content: "v2" });

    registry.pinVersion("invoice-download", "0.2.0");
    registry.pinVersion("invoice-download", "0.1.0");
    registry.rollback("invoice-download");

    expect(registry.get("invoice-download")?.version).toBe("0.2.0");
  });

  it("REG-005 detects corrupted packages", () => {
    const registry = new LocalRegistry();
    registry.install({
      name: "invoice-download",
      version: "0.1.0",
      permissions: {},
      content: "expected",
      checksum: "not-the-real-checksum"
    });

    expect(registry.verify("invoice-download", "0.1.0")).toBe(false);
  });

  it("REG-006 builds permission diff display data", () => {
    const registry = new LocalRegistry();
    const diff = registry.diffPermissions(
      { browser: { domains: { allow: ["https://portal.vendor.example"] } } },
      {
        browser: {
          domains: {
            allow: ["https://portal.vendor.example", "https://api.vendor.example"]
          }
        },
        shell: { allow: ["ls"] }
      }
    );

    expect(diff).toEqual([
      "browser.domains.allow +https://api.vendor.example",
      "shell.allow +ls"
    ]);
  });

  it("REG-007 installs a skill package from disk", async () => {
    const registry = new LocalRegistry();

    const pkg = await registry.installFromSkillFile(fixtureSkillPath("invoice-download", "skill.ir.json"));

    expect(pkg.name).toBe("invoice-download");
    expect(pkg.version).toBe("0.1.0");
    expect(registry.verify("invoice-download", "0.1.0")).toBe(true);
    expect(registry.get("invoice-download")).toMatchObject({
      name: "invoice-download",
      version: "0.1.0"
    });
  });
});
