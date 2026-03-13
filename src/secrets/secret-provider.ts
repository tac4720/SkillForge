export class SecretProviderError extends Error {
  readonly code = "secret_unavailable";

  constructor(message = "Secret is unavailable.") {
    super(message);
    this.name = "SecretProviderError";
  }
}

export interface SecretProvider {
  get(ref: string): Promise<string>;
  set?(ref: string, value: string): Promise<void>;
  has?(ref: string): Promise<boolean>;
}
