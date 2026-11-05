import { setupLinkForMember } from "@/lib/server/accounts";
import { appOrigin, handle, requireAdmin, requireStaff } from "@/lib/server/http";

// 施設の管理者向け: スタッフのパスワード設定用リンクを作る（メールが届かないとき用）
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/staff/[uid]/setup-link">) => {
  const staff = await requireStaff(req);
  requireAdmin(staff);
  const { uid } = await ctx.params;
  return Response.json(await setupLinkForMember(staff.facilityId, uid, appOrigin(req)));
});
