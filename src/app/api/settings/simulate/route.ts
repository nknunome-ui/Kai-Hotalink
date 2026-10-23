import { judge } from "@/lib/domain/judge";
import { sanitizeSettings, validateSettings } from "@/lib/domain/presets";
import type { FacilitySettings } from "@/lib/domain/types";
import { handle, HttpError, readJson, requireStaff } from "@/lib/server/http";
import { getSettings, residentsForSimulation } from "@/lib/server/repo";

// 設定を変える前に、最近の入居者の判定がどう変わるかを試算する（保存はしない）
export const POST = handle(async (req: Request) => {
  const staff = await requireStaff(req);
  const body = await readJson<{ settings: FacilitySettings }>(req);
  const next = sanitizeSettings(body.settings);
  if (!next) throw new HttpError(400, "設定が空です");
  const err = validateSettings(next);
  if (err) throw new HttpError(400, err);

  const { settings: current } = await getSettings(staff.facilityId);
  const people = await residentsForSimulation(staff.facilityId);
  const rows = people.map((r) => {
    const answers = r.survey?.answers ?? null;
    const before = judge({ residentName: r.name, profile: r.profile!, settings: current, answers });
    const after = judge({ residentName: r.name, profile: r.profile!, settings: next, answers });
    return {
      id: r.id,
      name: r.name,
      before: { grade: before.grade, riskScore: before.riskScore, gaps: before.gaps.length },
      after: { grade: after.grade, riskScore: after.riskScore, gaps: after.gaps.length },
    };
  });
  return Response.json({ rows });
});
