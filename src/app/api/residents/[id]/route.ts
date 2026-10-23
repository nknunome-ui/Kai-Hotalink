import { normalizeProfile } from "@/lib/domain/profile";
import { buildSurvey, surveyByIds } from "@/lib/domain/survey";
import { handle, HttpError, readJson, requireStaff } from "@/lib/server/http";
import { getResident, listJudgments, updateResident } from "@/lib/server/repo";

export const GET = handle(async (req: Request, ctx: RouteContext<"/api/residents/[id]">) => {
  const staff = await requireStaff(req);
  const { id } = await ctx.params;
  const resident = await getResident(staff.facilityId, id);
  const judgments = await listJudgments(staff.facilityId, id);
  // 発行済みならその時の設問、未発行なら今の状態で出る設問
  const ids = resident.survey?.questionIds;
  const questions = ids ? surveyByIds(ids) : buildSurvey(resident.profile);
  return Response.json({ resident, judgments, questions });
});

const TEXT_FIELDS = ["staffNotes", "interviewNotes", "priorFacilityNotes"] as const;

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/residents/[id]">) => {
  const staff = await requireStaff(req);
  const { id } = await ctx.params;
  const body = await readJson<Record<string, unknown>>(req);
  const patch: Parameters<typeof updateResident>[2] = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 50) throw new HttpError(400, "お名前を50文字以内で入力してください");
    patch.name = name;
  }
  for (const f of TEXT_FIELDS) {
    if (body[f] !== undefined) {
      const v = String(body[f]);
      if (v.length > 10000) throw new HttpError(400, "入力が長すぎます（1万文字まで）");
      patch[f] = v;
    }
  }
  if (body.profile !== undefined) {
    patch.profile = normalizeProfile(body.profile);
    patch.profileConfirmed = true;
  }
  return Response.json({ resident: await updateResident(staff.facilityId, id, patch) });
});
