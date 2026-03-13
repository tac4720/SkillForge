import fs from "node:fs/promises";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

import { SecretProviderError, type SecretProvider } from "../secret-provider.ts";

interface VaultEntry {
  iv: string;
  tag: string;
  ciphertext: string;
}

interface VaultDocument {
  version: 1;
  salt: string;
  entries: Record<string, VaultEntry>;
}

export class LocalVaultSecretProvider implements SecretProvider {
  private readonly rootDir: string;
  private readonly password: string;

  constructor(options: { rootDir: string; password: string }) {
    this.rootDir = options.rootDir;
    this.password = options.password;
  }

  async get(ref: string): Promise<string> {
    const vault = await this.readVault();
    const entry = vault.entries[ref];
    if (!entry) {
      throw new SecretProviderError(`Missing secret ref: ${ref}`);
    }

    try {
      return decryptValue(entry, deriveKey(this.password, vault.salt));
    } catch {
      throw new SecretProviderError("Unable to unlock local vault.");
    }
  }

  async set(ref: string, value: string): Promise<void> {
    const vault = await this.readVault();
    vault.entries[ref] = encryptValue(value, deriveKey(this.password, vault.salt));
    await fs.mkdir(this.rootDir, { recursive: true });
    await fs.writeFile(this.vaultPath(), JSON.stringify(vault, null, 2), "utf8");
  }

  async has(ref: string): Promise<boolean> {
    const vault = await this.readVault();
    return ref in vault.entries;
  }

  private async readVault(): Promise<VaultDocument> {
    try {
      return JSON.parse(await fs.readFile(this.vaultPath(), "utf8")) as VaultDocument;
    } catch {
      return {
        version: 1,
        salt: randomBytes(16).toString("base64"),
        entries: {}
      };
    }
  }

  private vaultPath(): string {
    return path.join(this.rootDir, "local-vault.json");
  }
}

function deriveKey(password: string, saltBase64: string): Buffer {
  return scryptSync(password, Buffer.from(saltBase64, "base64"), 32);
}

function encryptValue(value: string, key: Buffer): VaultEntry {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);

  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

function decryptValue(entry: VaultEntry, key: Buffer): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(entry.iv, "base64"));
  decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(entry.ciphertext, "base64")),
    decipher.final()
  ]);
  return plaintext.toString("utf8");
}
