import { describe, expect, it } from "vitest";

import { SecretStoreError } from "../../src/security/secret-store.js";
import { FakeSecretStore } from "../fakes/fake-secret-store.js";

describe("secret-store contract", () => {
  it("SECSTORE-001 reads a secret from a ref", async () => {
    const store = new FakeSecretStore({
      vendor_login: "hunter2"
    });

    await expect(store.getSecret("vendor_login")).resolves.toBe("hunter2");
  });

  it("SECSTORE-002 returns a deterministic error for missing secrets", async () => {
    const store = new FakeSecretStore({});

    await expect(store.getSecret("missing")).rejects.toBeInstanceOf(SecretStoreError);
  });
});
