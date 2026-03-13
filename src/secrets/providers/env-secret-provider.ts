import { SecretProviderError, type SecretProvider } from "../secret-provider.ts";

export class EnvSecretProvider implements SecretProvider {
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  async get(ref: string): Promise<string> {
    const value = this.env[ref];
    if (typeof value !== "string") {
      throw new SecretProviderError(`Missing secret ref: ${ref}`);
    }

    return value;
  }

  async has(ref: string): Promise<boolean> {
    return typeof this.env[ref] === "string";
  }
}
