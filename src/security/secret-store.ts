export class SecretStoreError extends Error {
  readonly code = "secret_unavailable";

  constructor(ref: string) {
    super(`Missing secret: ${ref}`);
    this.name = "SecretStoreError";
  }
}

export interface SecretStore {
  getSecret(ref: string): Promise<string>;
}
