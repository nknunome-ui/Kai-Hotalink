import { buildSurvey } from "@/lib/domain/survey";
import { handle, requireStaff } from "@/lib/server/http";
import { getResident, issueSurveyToken } from "@/lib/server/repo";

// 家族アンケートのURLを発行する（発行し直すと古いURLは使えなくなる）。
// 設問は今の入居者の状態から作る（医療的ケアがあれば急変時の設問を追加）。
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/residents/[id]/survey-link">) => {
  const staff = await requireStaff(req);
  const { id } = await ctx.params;
  const resident = await getResident(staff.facilityId, id);
  const questionIds = buildSurvey(resident.profile).map((q) => q.id);
  const token = await issueSurveyToken(staff.facilityId, id, questionIds);
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  return Response.json({
    url: `${origin}/survey/${token}`,
    resident: await getResident(staff.facilityId, id),
  });
});
