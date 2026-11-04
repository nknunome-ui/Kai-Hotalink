import { normalizeRole, updateStaff } from "@/lib/server/accounts";
import { handle, HttpError, readJson, requireAdmin, requireStaff } from "@/lib/server/http";

// スタッフの権限の変更・停止と再開（施設の管理者だけ）
export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/staff/[uid]">) => {
  const staff = await requireStaff(req);
  requireAdmin(staff);
  const { uid } = await ctx.params;
  const body = await readJson<{ role?: unknown; disabled?: unknown }>(req);
  const patch: { role?: "admin" | "staff"; disabled?: boolean } = {};
  if (body.role !== undefined) patch.role = normalizeRole(body.role);
  if (body.disabled !== undefined) {
    if (typeof body.disabled !== "boolean") throw new HttpError(400, "リクエストの形式が正しくありません");
    patch.disabled = body.disabled;
  }
  await updateStaff(staff.facilityId, staff.uid, uid, patch);
  return Response.json({ ok: true });
});
