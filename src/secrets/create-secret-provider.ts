import { EnvSecretProvider } from "./providers/env-secret-provider.ts";
import { LocalVaultSecretProvider } from "./providers/local-vault-secret-provider.ts";
import type { SecretProvider } from "./secret-provider.ts";

export function createSecretProvider(config: {
  mode: "env" | "local-vault" | "os-keychain";
  rootDir?: string;
  password?: string;
}): SecretProvider {
  switch (config.mode) {
    case "env":
      return new EnvSecretProvider();
    case "local-vault":
      if (!config.rootDir || !config.password) {
        throw new Error("local-vault requires rootDir and password.");
      }
      return new LocalVaultSecretProvider({
        rootDir: config.rootDir,
        password: config.password
      });
    case "os-keychain":
      throw new Error("os-keychain provider is not implemented.");
  }
}
