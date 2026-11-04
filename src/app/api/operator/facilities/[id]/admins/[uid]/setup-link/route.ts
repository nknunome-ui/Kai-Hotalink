import { setupLinkForMember } from "@/lib/server/accounts";
import { handle, requireOperator } from "@/lib/server/http";

// 運営者向け: 施設の管理者のパスワード設定用リンクを作る（メールが届かないとき用）
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/operator/facilities/[id]/admins/[uid]/setup-link">) => {
  await requireOperator(req);
  const { id, uid } = await ctx.params;
  return Response.json(await setupLinkForMember(id, uid, new URL(req.url).origin));
});
