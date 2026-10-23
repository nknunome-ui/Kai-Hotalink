import { sanitizeSettings, validateSettings } from "@/lib/domain/presets";
import type { FacilitySettings } from "@/lib/domain/types";
import { handle, HttpError, readJson, requireAdmin, requireStaff } from "@/lib/server/http";
import { getSettings, saveSettings } from "@/lib/server/repo";

export const GET = handle(async (req: Request) => {
  const staff = await requireStaff(req);
  return Response.json(await getSettings(staff.facilityId));
});

export const PUT = handle(async (req: Request) => {
  const staff = await requireStaff(req);
  requireAdmin(staff);
  const body = await readJson<{ settings: FacilitySettings }>(req);
  const settings = sanitizeSettings(body.settings);
  if (!settings) throw new HttpError(400, "設定が空です");
  const err = validateSettings(settings);
  if (err) throw new HttpError(400, err);
  return Response.json(await saveSettings(staff, settings));
});
