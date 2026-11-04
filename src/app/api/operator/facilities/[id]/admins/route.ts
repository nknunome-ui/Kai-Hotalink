import { addFacilityAdmin, normalizeEmail } from "@/lib/server/accounts";
import { handle, readJson, requireOperator } from "@/lib/server/http";

// 運営者向け: 既存の施設に管理者を追加する（パスワード設定のメールは画面側で送る）
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/operator/facilities/[id]/admins">) => {
  await requireOperator(req);
  const { id } = await ctx.params;
  const body = await readJson<{ email?: unknown }>(req);
  const email = normalizeEmail(body.email);
  const result = await addFacilityAdmin(id, email);
  return Response.json({ ...result, email });
});
