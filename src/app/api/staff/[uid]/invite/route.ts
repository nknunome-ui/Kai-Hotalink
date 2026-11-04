import { resendInvite } from "@/lib/server/accounts";
import { appOrigin, handle, requireAdmin, requireStaff } from "@/lib/server/http";

// 施設の管理者向け: スタッフに招待メールを送り直す
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/staff/[uid]/invite">) => {
  const staff = await requireStaff(req);
  requireAdmin(staff);
  const { uid } = await ctx.params;
  return Response.json(await resendInvite(staff.facilityId, uid, appOrigin(req)));
});
