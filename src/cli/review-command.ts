import { loadSkillPackageFromDir } from "../package/load-skill-package.ts";
import { buildReviewModel, type ReviewModel } from "../review/review-model.ts";

export async function reviewSkillCommand(skillDir: string): Promise<ReviewModel> {
  const skill = await loadSkillPackageFromDir(skillDir);
  return buildReviewModel(skill);
}
