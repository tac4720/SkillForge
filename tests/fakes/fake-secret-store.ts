import { SecretStoreError, type SecretStore } from "../../src/security/secret-store.js";

export class FakeSecretStore implements SecretStore {
  constructor(private readonly values: Record<string, string>) {}

  async getSecret(ref: string): Promise<string> {
    const value = this.values[ref];
    if (value === undefined) {
      throw new SecretStoreError(ref);
    }

    return value;
  }
}
