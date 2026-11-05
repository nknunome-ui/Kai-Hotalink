import { deliverInvite, inviteStaff, listStaff, normalizeEmail, normalizeRole } from "@/lib/server/accounts";
import { appOrigin, handle, readJson, requireAdmin, requireStaff } from "@/lib/server/http";

// 施設のスタッフの一覧と招待（施設の管理者だけ）
export const GET = handle(async (req: Request) => {
  const staff = await requireStaff(req);
  requireAdmin(staff);
  return Response.json({ staff: await listStaff(staff.facilityId) });
});

export const POST = handle(async (req: Request) => {
  const staff = await requireStaff(req);
  requireAdmin(staff);
  const body = await readJson<{ email?: unknown; role?: unknown }>(req);
  const email = normalizeEmail(body.email);
  const role = normalizeRole(body.role ?? "staff");
  const result = await inviteStaff(staff.facilityId, email, role);
  const mailed = await deliverInvite(staff.facilityId, email, role, appOrigin(req));
  return Response.json({ ...result, email, mailed });
});
