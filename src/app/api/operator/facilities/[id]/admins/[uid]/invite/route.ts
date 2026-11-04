import { resendInvite } from "@/lib/server/accounts";
import { appOrigin, handle, requireOperator } from "@/lib/server/http";

// 運営者向け: 施設の管理者に招待メールを送り直す
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/operator/facilities/[id]/admins/[uid]/invite">) => {
  await requireOperator(req);
  const { id, uid } = await ctx.params;
  return Response.json(await resendInvite(id, uid, appOrigin(req)));
});
