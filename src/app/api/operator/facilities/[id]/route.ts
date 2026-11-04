import { deleteFacility } from "@/lib/server/accounts";
import { handle, readJson, requireOperator } from "@/lib/server/http";

// 運営者向け: 施設を削除する（確認のため施設名の入力が必要）
export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/operator/facilities/[id]">) => {
  await requireOperator(req);
  const { id } = await ctx.params;
  const body = await readJson<{ confirmName?: unknown }>(req);
  return Response.json(await deleteFacility(id, String(body.confirmName ?? "")));
});
