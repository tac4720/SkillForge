import { describe, expect, it } from "vitest";

import { createSecretProvider } from "../../src/secrets/create-secret-provider.js";
import { SecretProviderError } from "../../src/secrets/secret-provider.js";
import { makeTempDir } from "../helpers/fixtures.js";

describe("secret-provider contract", () => {
  it("SECPROV-001 get existing secret", async () => {
    const rootDir = await makeTempDir("skillforge-secrets-contract-");
    const provider = createSecretProvider({ mode: "local-vault", rootDir, password: "test-pass" });

    await provider.set!("vendor_login", "super-secret");

    await expect(provider.get("vendor_login")).resolves.toBe("super-secret");
  });

  it("SECPROV-002 missing secret returns deterministic error", async () => {
    const rootDir = await makeTempDir("skillforge-secrets-contract-");
    const provider = createSecretProvider({ mode: "local-vault", rootDir, password: "test-pass" });

    await expect(provider.get("missing")).rejects.toBeInstanceOf(SecretProviderError);
  });

  it("SECPROV-003 stored value is returned exactly", async () => {
    const rootDir = await makeTempDir("skillforge-secrets-contract-");
    const provider = createSecretProvider({ mode: "local-vault", rootDir, password: "test-pass" });

    await provider.set!("vendor_login", "super-secret-value");

    expect(await provider.get("vendor_login")).toBe("super-secret-value");
  });

  it("SECPROV-004 provider does not expose raw storage path in error", async () => {
    const rootDir = await makeTempDir("skillforge-secrets-contract-");
    const provider = createSecretProvider({ mode: "local-vault", rootDir, password: "test-pass" });

    await expect(provider.get("missing")).rejects.not.toThrow(rootDir);
  });
});
