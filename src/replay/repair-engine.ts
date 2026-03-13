import type { FileSystem } from "../drivers/file-system.ts";
import { classifyRisk } from "../security/risk-classifier.ts";

export interface RepairStep {
  id: string;
  type: string;
  action?: string;
  target: {
    locatorCandidates: string[];
  };
}

export interface DomCandidate {
  locator: string;
  similarity: number;
}

export interface RepairSuggestion {
  strategy: "savedLocator" | "domSimilarity";
  locator: string;
  similarity?: number;
}

export interface RepairRequest {
  errorType: string;
  mode?: "suggest" | "semi-auto" | "auto";
  step: RepairStep;
  domCandidates?: DomCandidate[];
}

export interface RepairEngineOptions {
  fileSystem: FileSystem;
  baseDir: string;
}

export class RepairEngine {
  private readonly fileSystem: FileSystem;
  private readonly baseDir: string;

  constructor(options: RepairEngineOptions) {
    this.fileSystem = options.fileSystem;
    this.baseDir = options.baseDir;
  }

  suggest(request: RepairRequest): RepairSuggestion[] {
    if (request.errorType !== "locator_not_found") {
      return [];
    }

    if (request.mode === "auto" && classifyRisk({ type: request.step.type, action: request.step.action }) === "high") {
      return [];
    }

    const suggestions: RepairSuggestion[] = request.step.target.locatorCandidates.map((locator) => ({
      strategy: "savedLocator",
      locator
    }));

    const domSuggestions = [...(request.domCandidates ?? [])]
      .sort((left, right) => right.similarity - left.similarity)
      .map((candidate) => ({
        strategy: "domSimilarity" as const,
        locator: candidate.locator,
        similarity: candidate.similarity
      }));

    return [...suggestions, ...domSuggestions];
  }

  async applyRepair(
    runId: string,
    step: RepairStep,
    suggestion: RepairSuggestion,
    approved: boolean
  ): Promise<{ applied: boolean; step: RepairStep }> {
    if (!approved) {
      return { applied: false, step };
    }

    const updatedStep: RepairStep = {
      ...step,
      target: {
        locatorCandidates: [
          suggestion.locator,
          ...step.target.locatorCandidates.filter((locator) => locator !== suggestion.locator)
        ]
      }
    };

    await this.fileSystem.writeFile(
      `${this.baseDir}/${runId}/${step.id}.json`,
      JSON.stringify(
        {
          before: step,
          after: updatedStep,
          suggestion
        },
        null,
        2
      )
    );

    return { applied: true, step: updatedStep };
  }
}
