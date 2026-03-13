import fs from "node:fs/promises";
import path from "node:path";

export interface ReleaseFeatureMatrix {
  formalPackageFormat: boolean;
  recorderProper: boolean;
  failureArtifacts: boolean;
  secureSecretProvider: boolean;
  mcpExport: boolean;
  reviewWorkflow: boolean;
  productionBrowserDriver: boolean;
}

export interface ReleaseStatus {
  tier: "alpha" | "beta" | "stable";
  readmeTier: "alpha" | "beta" | "stable";
  recommendedTier: "alpha" | "beta" | "stable";
  featureMatrix: ReleaseFeatureMatrix;
}

export async function loadReleaseStatus(repoRoot = process.cwd()): Promise<ReleaseStatus> {
  const docsStatus = await fs.readFile(path.join(repoRoot, "docs", "status.md"), "utf8");
  const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");
  const tier = parseTier(docsStatus);
  const readmeTier = parseTier(readme);
  const featureMatrix = await detectFeatureMatrix(repoRoot);

  return {
    tier,
    readmeTier,
    recommendedTier: featureMatrix.formalPackageFormat &&
      featureMatrix.recorderProper &&
      featureMatrix.failureArtifacts &&
      featureMatrix.secureSecretProvider &&
      featureMatrix.mcpExport &&
      featureMatrix.reviewWorkflow &&
      featureMatrix.productionBrowserDriver
      ? "beta"
      : "alpha",
    featureMatrix
  };
}

export function validateReleaseStatus(
  declaredTier: "alpha" | "beta" | "stable",
  featureMatrix: ReleaseFeatureMatrix
): {
  allowed: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  if ((declaredTier === "beta" || declaredTier === "stable") && !featureMatrix.productionBrowserDriver) {
    reasons.push("Production BrowserDriver missing.");
  }

  if (declaredTier === "stable") {
    if (!featureMatrix.mcpExport) {
      reasons.push("MCP export missing.");
    }
    if (!featureMatrix.recorderProper) {
      reasons.push("Recorder proper missing.");
    }
    if (!featureMatrix.failureArtifacts) {
      reasons.push("Failure artifacts missing.");
    }
    if (!featureMatrix.secureSecretProvider) {
      reasons.push("Secure secret provider missing.");
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons
  };
}

async function detectFeatureMatrix(repoRoot: string): Promise<ReleaseFeatureMatrix> {
  const checks = await Promise.all([
    fileExists(path.join(repoRoot, "src", "package", "load-skill-package.ts")),
    fileExists(path.join(repoRoot, "tests", "e2e", "record-to-replay.e2e.spec.ts")),
    fileExists(path.join(repoRoot, "src", "replay", "run-artifacts.ts")),
    fileExists(path.join(repoRoot, "src", "secrets", "providers", "local-vault-secret-provider.ts")),
    fileExists(path.join(repoRoot, "src", "exporters", "mcp.ts")),
    fileExists(path.join(repoRoot, "src", "review", "review-model.ts")),
    fileExists(path.join(repoRoot, "src", "drivers", "playwright-browser-driver.ts")),
    fileExists(path.join(repoRoot, "src", "replay", "create-runtime-deps.ts")),
    fileExists(path.join(repoRoot, "tests", "contract", "playwright-browser-driver.spec.ts")),
    fileExists(path.join(repoRoot, "tests", "integration", "replay-with-real-browser-driver.spec.ts")),
    fileExists(path.join(repoRoot, "tests", "e2e", "invoice-download-real-browser.e2e.spec.ts")),
    fileExists(path.join(repoRoot, "tests", "e2e", "record-to-replay-real-browser.e2e.spec.ts"))
  ]);

  return {
    formalPackageFormat: checks[0],
    recorderProper: checks[1],
    failureArtifacts: checks[2],
    secureSecretProvider: checks[3],
    mcpExport: checks[4],
    reviewWorkflow: checks[5],
    productionBrowserDriver: checks[6] && checks[7] && checks[8] && checks[9] && checks[10] && checks[11]
  };
}

function parseTier(contents: string): "alpha" | "beta" | "stable" {
  const match = contents.match(/tier:\s*(alpha|beta|stable)/u) ?? contents.match(/Tier:\s*(alpha|beta|stable)/u);
  if (!match) {
    throw new Error("Missing release tier.");
  }

  return match[1] as "alpha" | "beta" | "stable";
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}
