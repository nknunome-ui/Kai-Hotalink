import { judge } from "@/lib/domain/judge";
import { summarizePastExperience } from "@/lib/server/claude";
import { handle, HttpError, requireStaff } from "@/lib/server/http";
import { getResident, getSettings, saveJudgment, setPastExperienceSummary } from "@/lib/server/repo";

export const maxDuration = 60;

// 判定はルール（lib/domain/judge.ts）で行う。AI は家族の自由記述の要約にだけ使う。
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/residents/[id]/judge">) => {
  const staff = await requireStaff(req);
  const { id } = await ctx.params;
  const resident = await getResident(staff.facilityId, id);
  if (!resident.profile) throw new HttpError(400, "先に入居者の状態を登録してください");
  if (!resident.profileConfirmed) {
    throw new HttpError(400, "AI が読み取った状態をスタッフが確認・保存してから判定してください");
  }

  const { settings, version } = await getSettings(staff.facilityId);
  const answers = resident.survey?.submittedAt ? resident.survey.answers : null;

  let pastSummary = resident.survey?.pastExperienceSummary ?? null;
  const pastText = typeof answers?.q8_pastExperience === "string" ? answers.q8_pastExperience : "";
  if (pastText.trim() && !pastSummary) {
    try {
      pastSummary = await summarizePastExperience(pastText);
      await setPastExperienceSummary(staff.facilityId, id, pastSummary);
    } catch (e) {
      console.error("past experience summary failed", e);
      pastSummary = null;
    }
  }

  const result = judge({ residentName: resident.name, profile: resident.profile, settings, answers });
  const record = await saveJudgment(staff, id, result, version, pastSummary);
  return Response.json({ judgment: record });
});
