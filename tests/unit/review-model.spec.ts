import { describe, expect, it } from "vitest";

import { buildReviewModel } from "../../src/review/review-model.js";
import type { SkillPackage } from "../../src/package/skill-package-schema.js";

function createReviewSkill(): SkillPackage {
  return {
    apiVersion: "skillforge.io/v1alpha1",
    kind: "SkillPackage",
    metadata: {
      name: "review-skill",
      version: "0.1.0"
    },
    inputs: {
      invoice_month: {
        type: "string",
        required: true
      },
      vendor_login: {
        type: "secret",
        required: true
      }
    },
    permissions: {
      shell: {
        allow: ["rm"]
      }
    },
    steps: [
      {
        id: "step-001",
        type: "browser.navigate"
      },
      {
        id: "step-002",
        type: "shell.exec",
        with: {
          command: "rm"
        }
      },
      {
        id: "step-003",
        type: "notify.send"
      }
    ]
  };
}

describe("review-model", () => {
  it("REV-001 review model contains all steps", () => {
    const skill = createReviewSkill();
    const model = buildReviewModel(skill);

    expect(model.steps.length).toBe(skill.steps.length);
  });

  it("REV-002 review model contains all parameter candidates", () => {
    const model = buildReviewModel(createReviewSkill());

    expect(model.parameters).toEqual([
      { name: "invoice_month", kind: "string" },
      { name: "vendor_login", kind: "secret" }
    ]);
  });

  it("REV-003 review model contains permissions", () => {
    const model = buildReviewModel(createReviewSkill());

    expect(model.permissions).toMatchObject({
      shell: {
        allow: ["rm"]
      }
    });
  });

  it("REV-004 high-risk steps appear in warnings", () => {
    const model = buildReviewModel(createReviewSkill());

    expect(model.warnings.some((warning) => warning.includes("high-risk"))).toBe(true);
  });

  it("REV-005 unsupported steps appear in warnings", () => {
    const model = buildReviewModel(createReviewSkill());

    expect(model.warnings.some((warning) => warning.includes("unsupported"))).toBe(true);
  });
});
